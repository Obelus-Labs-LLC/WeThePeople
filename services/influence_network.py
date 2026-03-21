"""Influence Network Graph builder.

Builds a force-directed graph of relationships between politicians,
companies, bills, and lobbying issues.  The graph is driven by:

  - CompanyDonation   (company → politician)
  - CongressionalTrade (politician → ticker/company)
  - MemberBillGroundTruth (politician → bill)
  - LobbyingRecord / sector variants (company → lobbying issue)
  - GovernmentContract / sector variants (company → contract)

Returns:
{
  "nodes": [ { id, type, label, ... } ],
  "edges": [ { source, target, type, ... } ],
  "stats": { nodes, edges, ... }
}
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List, Optional, Set

from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from models.database import (
    CompanyDonation, CongressionalTrade, TrackedMember,
    MemberBillGroundTruth, Bill,
)
from models.finance_models import (
    TrackedInstitution, FinanceLobbyingRecord, FinanceGovernmentContract,
)
from models.health_models import (
    TrackedCompany, HealthLobbyingRecord, HealthGovernmentContract,
)
from models.tech_models import (
    TrackedTechCompany, LobbyingRecord, GovernmentContract,
)
from models.energy_models import (
    TrackedEnergyCompany, EnergyLobbyingRecord, EnergyGovernmentContract,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _node_id(kind: str, value: Any) -> str:
    return f"{kind}:{value}"


def _amount_range_to_float(amount_range: Optional[str]) -> float:
    """Convert a STOCK Act amount range like '$1,001 - $15,000' to a midpoint float."""
    if not amount_range:
        return 0.0
    try:
        cleaned = amount_range.replace("$", "").replace(",", "")
        parts = cleaned.split("-")
        if len(parts) == 2:
            lo, hi = float(parts[0].strip()), float(parts[1].strip())
            return (lo + hi) / 2
        return float(parts[0].strip())
    except (ValueError, IndexError):
        return 0.0


# Mapping from entity_type in CompanyDonation / general usage to sector label
_SECTOR_MAP = {
    "finance": "finance",
    "health": "health",
    "tech": "tech",
    "energy": "energy",
}


def _resolve_company_label(db: Session, entity_type: str, entity_id: str) -> Optional[str]:
    """Look up display_name for a company across sector tables."""
    if entity_type == "finance":
        inst = db.query(TrackedInstitution.display_name).filter(
            TrackedInstitution.institution_id == entity_id
        ).first()
        return inst[0] if inst else None
    elif entity_type == "health":
        comp = db.query(TrackedCompany.display_name).filter(
            TrackedCompany.company_id == entity_id
        ).first()
        return comp[0] if comp else None
    elif entity_type == "tech":
        comp = db.query(TrackedTechCompany.display_name).filter(
            TrackedTechCompany.company_id == entity_id
        ).first()
        return comp[0] if comp else None
    elif entity_type == "energy":
        comp = db.query(TrackedEnergyCompany.display_name).filter(
            TrackedEnergyCompany.company_id == entity_id
        ).first()
        return comp[0] if comp else None
    return None


def _resolve_company_ticker(db: Session, entity_type: str, entity_id: str) -> Optional[str]:
    """Look up ticker for a company across sector tables."""
    if entity_type == "finance":
        row = db.query(TrackedInstitution.ticker).filter(
            TrackedInstitution.institution_id == entity_id
        ).first()
    elif entity_type == "health":
        row = db.query(TrackedCompany.ticker).filter(
            TrackedCompany.company_id == entity_id
        ).first()
    elif entity_type == "tech":
        row = db.query(TrackedTechCompany.ticker).filter(
            TrackedTechCompany.company_id == entity_id
        ).first()
    elif entity_type == "energy":
        row = db.query(TrackedEnergyCompany.ticker).filter(
            TrackedEnergyCompany.company_id == entity_id
        ).first()
    else:
        return None
    return row[0] if row else None


# ---------------------------------------------------------------------------
# Person-centred graph expansion
# ---------------------------------------------------------------------------

def _expand_person(
    db: Session,
    person_id: str,
    nodes: Dict[str, Dict[str, Any]],
    edges: List[Dict[str, Any]],
    visited_persons: Set[str],
    limit_per_type: int = 15,
):
    """Expand a person node: donations received, trades made, bills sponsored."""
    if person_id in visited_persons:
        return
    visited_persons.add(person_id)

    person_nid = _node_id("person", person_id)

    # Ensure person node exists
    if person_nid not in nodes:
        member = db.query(TrackedMember).filter(TrackedMember.person_id == person_id).first()
        nodes[person_nid] = {
            "id": person_nid,
            "type": "person",
            "label": member.display_name if member else person_id,
            "party": member.party if member else None,
            "photo_url": member.photo_url if member else None,
            "state": member.state if member else None,
            "chamber": member.chamber if member else None,
            "person_id": person_id,
        }

    # --- Donations received ---
    donations = (
        db.query(
            CompanyDonation.entity_type,
            CompanyDonation.entity_id,
            func.sum(CompanyDonation.amount).label("total"),
            func.max(CompanyDonation.cycle).label("latest_cycle"),
            func.group_concat(CompanyDonation.cycle.distinct()).label("all_cycles"),
        )
        .filter(CompanyDonation.person_id == person_id)
        .group_by(CompanyDonation.entity_type, CompanyDonation.entity_id)
        .order_by(desc("total"))
        .limit(limit_per_type)
        .all()
    )
    for entity_type, entity_id, total, cycle, all_cycles in donations:
        comp_nid = _node_id("company", f"{entity_type}:{entity_id}")
        if comp_nid not in nodes:
            label = _resolve_company_label(db, entity_type, entity_id) or entity_id
            ticker = _resolve_company_ticker(db, entity_type, entity_id)
            nodes[comp_nid] = {
                "id": comp_nid,
                "type": "company",
                "label": label,
                "sector": _SECTOR_MAP.get(entity_type, entity_type),
                "ticker": ticker,
                "entity_type": entity_type,
                "entity_id": entity_id,
            }
        # Parse year from cycle (e.g. "2024")
        try:
            year = int(cycle) if cycle else None
        except (ValueError, TypeError):
            year = None
        # Parse all years from cycles
        years = sorted(set(
            int(c) for c in (all_cycles or "").split(",")
            if c.strip().isdigit()
        ))
        edge_dict: Dict[str, Any] = {
            "source": comp_nid,
            "target": person_nid,
            "type": "donation",
            "amount": float(total or 0),
            "cycle": cycle,
        }
        if year is not None:
            edge_dict["year"] = year
        if years:
            edge_dict["years"] = years
        edges.append(edge_dict)

    # --- Congressional trades ---
    trades = (
        db.query(CongressionalTrade)
        .filter(CongressionalTrade.person_id == person_id)
        .order_by(CongressionalTrade.disclosure_date.desc())
        .limit(limit_per_type)
        .all()
    )
    # Group trades by ticker for cleaner graph
    ticker_agg: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"count": 0, "buys": 0, "sells": 0, "amount_sum": 0.0, "years": set()})
    for t in trades:
        ticker = t.ticker or "UNKNOWN"
        agg = ticker_agg[ticker]
        agg["count"] += 1
        agg["amount_sum"] += _amount_range_to_float(t.amount_range)
        if t.disclosure_date:
            try:
                agg["years"].add(t.disclosure_date.year)
            except AttributeError:
                pass
        if t.transaction_type and "purchase" in t.transaction_type.lower():
            agg["buys"] += 1
        elif t.transaction_type and "sale" in t.transaction_type.lower():
            agg["sells"] += 1

    for ticker, agg in ticker_agg.items():
        ticker_nid = _node_id("ticker", ticker)
        if ticker_nid not in nodes:
            nodes[ticker_nid] = {
                "id": ticker_nid,
                "type": "ticker",
                "label": ticker,
                "ticker": ticker,
            }
        tx_type = "purchase" if agg["buys"] >= agg["sells"] else "sale"
        trade_years = sorted(agg["years"])
        edge_dict = {
            "source": person_nid,
            "target": ticker_nid,
            "type": "trade",
            "amount": agg["amount_sum"],
            "transaction_type": tx_type,
            "count": agg["count"],
        }
        if trade_years:
            edge_dict["year"] = trade_years[-1]  # most recent
            edge_dict["years"] = trade_years
        edges.append(edge_dict)

    # --- Bills sponsored / cosponsored ---
    member = db.query(TrackedMember).filter(TrackedMember.person_id == person_id).first()
    if member and member.bioguide_id:
        bill_links = (
            db.query(MemberBillGroundTruth)
            .filter(MemberBillGroundTruth.bioguide_id == member.bioguide_id)
            .limit(limit_per_type)
            .all()
        )
        for bl in bill_links:
            bill_nid = _node_id("bill", bl.bill_id)
            bill = db.query(Bill).filter(Bill.bill_id == bl.bill_id).first()
            if bill_nid not in nodes:
                bill_title = bill.title if bill else bl.bill_id
                nodes[bill_nid] = {
                    "id": bill_nid,
                    "type": "bill",
                    "label": (bill_title[:60] + "...") if bill_title and len(bill_title) > 60 else (bill_title or bl.bill_id),
                    "bill_id": bl.bill_id,
                    "status": bill.status_bucket if bill else None,
                    "policy_area": bill.policy_area if bill else None,
                }
            edge_dict = {
                "source": person_nid,
                "target": bill_nid,
                "type": "legislation",
                "role": bl.role,
            }
            # Extract year from bill introduced_date
            bill_year = None
            if bill and bill.introduced_date:
                try:
                    bill_year = bill.introduced_date.year
                except AttributeError:
                    pass
            if bill_year is not None:
                edge_dict["year"] = bill_year
                edge_dict["years"] = [bill_year]
            edges.append(edge_dict)


# ---------------------------------------------------------------------------
# Company-centred graph expansion
# ---------------------------------------------------------------------------

def _expand_company(
    db: Session,
    entity_type: str,
    entity_id: str,
    nodes: Dict[str, Dict[str, Any]],
    edges: List[Dict[str, Any]],
    visited_companies: Set[str],
    limit_per_type: int = 15,
):
    """Expand a company node: donations made, lobbying, contracts."""
    comp_key = f"{entity_type}:{entity_id}"
    if comp_key in visited_companies:
        return
    visited_companies.add(comp_key)

    comp_nid = _node_id("company", comp_key)

    # Ensure company node exists
    if comp_nid not in nodes:
        label = _resolve_company_label(db, entity_type, entity_id) or entity_id
        ticker = _resolve_company_ticker(db, entity_type, entity_id)
        nodes[comp_nid] = {
            "id": comp_nid,
            "type": "company",
            "label": label,
            "sector": _SECTOR_MAP.get(entity_type, entity_type),
            "ticker": ticker,
            "entity_type": entity_type,
            "entity_id": entity_id,
        }

    # --- Donations made to politicians ---
    donations = (
        db.query(
            CompanyDonation.person_id,
            func.sum(CompanyDonation.amount).label("total"),
            func.max(CompanyDonation.cycle).label("latest_cycle"),
            func.group_concat(CompanyDonation.cycle.distinct()).label("all_cycles"),
        )
        .filter(
            CompanyDonation.entity_type == entity_type,
            CompanyDonation.entity_id == entity_id,
            CompanyDonation.person_id.isnot(None),
        )
        .group_by(CompanyDonation.person_id)
        .order_by(desc("total"))
        .limit(limit_per_type)
        .all()
    )
    for pid, total, cycle, all_cycles in donations:
        person_nid = _node_id("person", pid)
        if person_nid not in nodes:
            member = db.query(TrackedMember).filter(TrackedMember.person_id == pid).first()
            nodes[person_nid] = {
                "id": person_nid,
                "type": "person",
                "label": member.display_name if member else pid,
                "party": member.party if member else None,
                "photo_url": member.photo_url if member else None,
                "state": member.state if member else None,
                "chamber": member.chamber if member else None,
                "person_id": pid,
            }
        # Parse year from cycle
        try:
            year = int(cycle) if cycle else None
        except (ValueError, TypeError):
            year = None
        years = sorted(set(
            int(c) for c in (all_cycles or "").split(",")
            if c.strip().isdigit()
        ))
        edge_dict: Dict[str, Any] = {
            "source": comp_nid,
            "target": person_nid,
            "type": "donation",
            "amount": float(total or 0),
            "cycle": cycle,
        }
        if year is not None:
            edge_dict["year"] = year
        if years:
            edge_dict["years"] = years
        edges.append(edge_dict)

    # --- Lobbying issues ---
    lobbying_rows: List[Any] = []
    if entity_type == "finance":
        lobbying_rows = (
            db.query(
                FinanceLobbyingRecord.lobbying_issues,
                func.sum(FinanceLobbyingRecord.income),
                func.max(FinanceLobbyingRecord.filing_year),
                func.group_concat(FinanceLobbyingRecord.filing_year.distinct()),
            )
            .filter(FinanceLobbyingRecord.institution_id == entity_id)
            .group_by(FinanceLobbyingRecord.lobbying_issues)
            .order_by(desc(func.sum(FinanceLobbyingRecord.income)))
            .limit(limit_per_type)
            .all()
        )
    elif entity_type == "health":
        lobbying_rows = (
            db.query(
                HealthLobbyingRecord.lobbying_issues,
                func.sum(HealthLobbyingRecord.income),
                func.max(HealthLobbyingRecord.filing_year),
                func.group_concat(HealthLobbyingRecord.filing_year.distinct()),
            )
            .filter(HealthLobbyingRecord.company_id == entity_id)
            .group_by(HealthLobbyingRecord.lobbying_issues)
            .order_by(desc(func.sum(HealthLobbyingRecord.income)))
            .limit(limit_per_type)
            .all()
        )
    elif entity_type == "tech":
        lobbying_rows = (
            db.query(
                LobbyingRecord.lobbying_issues,
                func.sum(LobbyingRecord.income),
                func.max(LobbyingRecord.filing_year),
                func.group_concat(LobbyingRecord.filing_year.distinct()),
            )
            .filter(LobbyingRecord.company_id == entity_id)
            .group_by(LobbyingRecord.lobbying_issues)
            .order_by(desc(func.sum(LobbyingRecord.income)))
            .limit(limit_per_type)
            .all()
        )
    elif entity_type == "energy":
        lobbying_rows = (
            db.query(
                EnergyLobbyingRecord.lobbying_issues,
                func.sum(EnergyLobbyingRecord.income),
                func.max(EnergyLobbyingRecord.filing_year),
                func.group_concat(EnergyLobbyingRecord.filing_year.distinct()),
            )
            .filter(EnergyLobbyingRecord.company_id == entity_id)
            .group_by(EnergyLobbyingRecord.lobbying_issues)
            .order_by(desc(func.sum(EnergyLobbyingRecord.income)))
            .limit(limit_per_type)
            .all()
        )

    for issues_str, total_income, max_filing_year, all_filing_years in lobbying_rows:
        if not issues_str:
            continue
        # Issues are comma-separated; use first issue for label
        issue_label = issues_str.strip()[:80]
        issue_key = issue_label.lower().replace(" ", "_").replace(",", "")[:60]
        issue_nid = _node_id("lobbying_issue", issue_key)
        if issue_nid not in nodes:
            nodes[issue_nid] = {
                "id": issue_nid,
                "type": "lobbying_issue",
                "label": issue_label,
            }
        edge_dict = {
            "source": comp_nid,
            "target": issue_nid,
            "type": "lobbying",
            "amount": float(total_income or 0),
        }
        if max_filing_year is not None:
            try:
                edge_dict["year"] = int(max_filing_year)
            except (ValueError, TypeError):
                pass
        if all_filing_years:
            years = sorted(set(
                int(y) for y in str(all_filing_years).split(",")
                if y.strip().isdigit()
            ))
            if years:
                edge_dict["years"] = years
        edges.append(edge_dict)

    # --- Government contracts ---
    contract_rows: List[Any] = []
    if entity_type == "finance":
        contract_rows = (
            db.query(
                FinanceGovernmentContract.awarding_agency,
                func.sum(FinanceGovernmentContract.award_amount),
                func.count(FinanceGovernmentContract.id),
                func.max(FinanceGovernmentContract.start_date),
                func.group_concat(func.strftime("%Y", FinanceGovernmentContract.start_date).distinct()),
            )
            .filter(FinanceGovernmentContract.institution_id == entity_id)
            .group_by(FinanceGovernmentContract.awarding_agency)
            .order_by(desc(func.sum(FinanceGovernmentContract.award_amount)))
            .limit(8)
            .all()
        )
    elif entity_type == "health":
        contract_rows = (
            db.query(
                HealthGovernmentContract.awarding_agency,
                func.sum(HealthGovernmentContract.award_amount),
                func.count(HealthGovernmentContract.id),
                func.max(HealthGovernmentContract.start_date),
                func.group_concat(func.strftime("%Y", HealthGovernmentContract.start_date).distinct()),
            )
            .filter(HealthGovernmentContract.company_id == entity_id)
            .group_by(HealthGovernmentContract.awarding_agency)
            .order_by(desc(func.sum(HealthGovernmentContract.award_amount)))
            .limit(8)
            .all()
        )
    elif entity_type == "tech":
        contract_rows = (
            db.query(
                GovernmentContract.awarding_agency,
                func.sum(GovernmentContract.award_amount),
                func.count(GovernmentContract.id),
                func.max(GovernmentContract.start_date),
                func.group_concat(func.strftime("%Y", GovernmentContract.start_date).distinct()),
            )
            .filter(GovernmentContract.company_id == entity_id)
            .group_by(GovernmentContract.awarding_agency)
            .order_by(desc(func.sum(GovernmentContract.award_amount)))
            .limit(8)
            .all()
        )
    elif entity_type == "energy":
        contract_rows = (
            db.query(
                EnergyGovernmentContract.awarding_agency,
                func.sum(EnergyGovernmentContract.award_amount),
                func.count(EnergyGovernmentContract.id),
                func.max(EnergyGovernmentContract.start_date),
                func.group_concat(func.strftime("%Y", EnergyGovernmentContract.start_date).distinct()),
            )
            .filter(EnergyGovernmentContract.company_id == entity_id)
            .group_by(EnergyGovernmentContract.awarding_agency)
            .order_by(desc(func.sum(EnergyGovernmentContract.award_amount)))
            .limit(8)
            .all()
        )

    for agency_name, total_award, count, max_start_date, all_start_years in contract_rows:
        if not agency_name:
            continue
        agency_key = agency_name.lower().replace(" ", "_")[:60]
        agency_nid = _node_id("agency", agency_key)
        if agency_nid not in nodes:
            nodes[agency_nid] = {
                "id": agency_nid,
                "type": "agency",
                "label": agency_name,
            }
        edge_dict = {
            "source": agency_nid,
            "target": comp_nid,
            "type": "contract",
            "amount": float(total_award or 0),
            "count": count,
        }
        # Extract year from most recent start_date
        if max_start_date is not None:
            try:
                edge_dict["year"] = max_start_date.year
            except AttributeError:
                # start_date might be a string
                try:
                    edge_dict["year"] = int(str(max_start_date)[:4])
                except (ValueError, TypeError):
                    pass
        if all_start_years:
            years = sorted(set(
                int(y) for y in str(all_start_years).split(",")
                if y.strip().isdigit()
            ))
            if years:
                edge_dict["years"] = years
        edges.append(edge_dict)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def build_influence_network(
    db: Session,
    entity_type: str,
    entity_id: str,
    depth: int = 1,
    limit: int = 50,
) -> Dict[str, Any]:
    """Build an influence network graph centred on an entity.

    Parameters
    ----------
    entity_type : str
        "person", "finance", "health", "tech", or "energy"
    entity_id : str
        The entity's ID (person_id or company_id / institution_id)
    depth : int
        1 = direct connections only, 2 = connections of connections
    limit : int
        Maximum total nodes in the graph
    """
    nodes: Dict[str, Dict[str, Any]] = {}
    edges: List[Dict[str, Any]] = []
    visited_persons: Set[str] = set()
    visited_companies: Set[str] = set()

    limit_per_type = min(15, limit // 3) or 10

    # --- Depth 1: expand the centre entity ---
    if entity_type == "person":
        _expand_person(db, entity_id, nodes, edges, visited_persons, limit_per_type)
    else:
        # entity_type is a sector name (finance/health/tech/energy)
        _expand_company(db, entity_type, entity_id, nodes, edges, visited_companies, limit_per_type)

    # --- Depth 2: expand discovered neighbours ---
    if depth >= 2:
        # Collect neighbours to expand (skip centre)
        neighbour_persons = [
            n["person_id"] for n in nodes.values()
            if n["type"] == "person" and n.get("person_id") not in visited_persons
        ]
        neighbour_companies = [
            (n["entity_type"], n["entity_id"]) for n in nodes.values()
            if n["type"] == "company"
            and f'{n.get("entity_type")}:{n.get("entity_id")}' not in visited_companies
        ]

        # Expand top-10 neighbours (by edge amount)
        edge_amounts: Dict[str, float] = defaultdict(float)
        for e in edges:
            edge_amounts[e["source"]] += abs(e.get("amount", 0))
            edge_amounts[e["target"]] += abs(e.get("amount", 0))

        neighbour_persons.sort(
            key=lambda pid: edge_amounts.get(_node_id("person", pid), 0),
            reverse=True,
        )
        neighbour_companies.sort(
            key=lambda pair: edge_amounts.get(_node_id("company", f"{pair[0]}:{pair[1]}"), 0),
            reverse=True,
        )

        depth2_limit = max(5, limit_per_type // 2)
        for pid in neighbour_persons[:10]:
            if len(nodes) >= limit:
                break
            _expand_person(db, pid, nodes, edges, visited_persons, depth2_limit)

        for et, eid in neighbour_companies[:10]:
            if len(nodes) >= limit:
                break
            _expand_company(db, et, eid, nodes, edges, visited_companies, depth2_limit)

    # --- Cap total nodes ---
    if len(nodes) > limit:
        # Keep centre + highest-connected nodes
        # Count edges per node
        edge_count: Dict[str, int] = defaultdict(int)
        for e in edges:
            edge_count[e["source"]] += 1
            edge_count[e["target"]] += 1

        centre_nid = (
            _node_id("person", entity_id)
            if entity_type == "person"
            else _node_id("company", f"{entity_type}:{entity_id}")
        )
        sorted_nids = sorted(
            nodes.keys(),
            key=lambda nid: (nid == centre_nid, edge_count.get(nid, 0)),
            reverse=True,
        )
        keep = set(sorted_nids[:limit])
        nodes = {k: v for k, v in nodes.items() if k in keep}
        edges = [e for e in edges if e["source"] in keep and e["target"] in keep]

    # --- Stable output ---
    nodes_list = sorted(nodes.values(), key=lambda n: n["id"])
    edges_sorted = sorted(edges, key=lambda e: (e["source"], e["target"], e["type"]))

    # Deduplicate edges (same source+target+type)
    seen_edges: Set[str] = set()
    unique_edges: List[Dict[str, Any]] = []
    for e in edges_sorted:
        key = f'{e["source"]}|{e["target"]}|{e["type"]}'
        if key not in seen_edges:
            seen_edges.add(key)
            unique_edges.append(e)

    return {
        "nodes": nodes_list,
        "edges": unique_edges,
        "stats": {
            "total_nodes": len(nodes_list),
            "total_edges": len(unique_edges),
            "persons": sum(1 for n in nodes_list if n["type"] == "person"),
            "companies": sum(1 for n in nodes_list if n["type"] == "company"),
            "bills": sum(1 for n in nodes_list if n["type"] == "bill"),
            "tickers": sum(1 for n in nodes_list if n["type"] == "ticker"),
            "lobbying_issues": sum(1 for n in nodes_list if n["type"] == "lobbying_issue"),
        },
    }
