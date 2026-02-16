"""Power Map (graph) generation.

The Power Map is a *derived* view: it must never invent facts.
It is built from canonical ledger layers, with Gold as the primary input.

Contract (returned dict):
{
  "person_id": str,
  "nodes": [ {"id": str, "type": str, "label": str, ...} ],
  "edges": [ {"source": str, "target": str, "type": str, ...} ],
  "stats": { ... }
}
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from models.database import Bill, Claim, GoldLedgerEntry


def _node_id(kind: str, value: Any) -> str:
    return f"{kind}:{value}"


def build_person_power_map(
    db: Session,
    person_id: str,
    limit: Optional[int] = None,
) -> Dict[str, Any]:
    """Build a Power Map graph for a person.

    Sources:
    - GoldLedgerEntry (canonical evaluation output per claim)
    - Claim (optional: for human-readable label)
    - Bill (optional: for bill title/policy)

    Notes:
    - Deterministic order: nodes/edges are emitted in stable sorted order.
    - No persistence: this is an in-memory graph builder.
    """

    q = db.query(GoldLedgerEntry).filter(GoldLedgerEntry.person_id == person_id)
    q = q.order_by(GoldLedgerEntry.claim_id.asc(), GoldLedgerEntry.id.asc())
    if limit:
        q = q.limit(limit)
    gold_rows: List[GoldLedgerEntry] = q.all()

    nodes_by_id: Dict[str, Dict[str, Any]] = {}
    edges: List[Dict[str, Any]] = []

    # Central person node
    nodes_by_id[_node_id("person", person_id)] = {
        "id": _node_id("person", person_id),
        "type": "person",
        "label": person_id,
    }

    # Aggregates for summary edges
    person_bill_agg: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"count": 0, "score_sum": 0.0})

    for g in gold_rows:
        claim_id = g.claim_id
        claim_node_id = _node_id("claim", claim_id)

        # Best-effort claim label
        claim_label = g.normalized_text[:60] + ("..." if len(g.normalized_text) > 60 else "")
        claim = db.query(Claim).filter(Claim.id == claim_id).first()
        if claim and claim.text:
            claim_label = claim.text[:60] + ("..." if len(claim.text) > 60 else "")

        nodes_by_id[claim_node_id] = {
            "id": claim_node_id,
            "type": "claim",
            "label": claim_label,
            "claim_id": claim_id,
            "evaluation_id": g.evaluation_id,
            "tier": g.tier,
            "score": g.score,
            "claim_date": g.claim_date.isoformat() if g.claim_date else None,
            "source_url": g.source_url,
            "intent_type": g.intent_type,
            "policy_area": g.policy_area,
        }

        edges.append(
            {
                "source": _node_id("person", person_id),
                "target": claim_node_id,
                "type": "made_claim",
            }
        )

        # Policy area node (from gold)
        if g.policy_area:
            policy_key = str(g.policy_area).lower().replace(" ", "_")
            policy_node_id = _node_id("policy", policy_key)
            nodes_by_id.setdefault(
                policy_node_id,
                {
                    "id": policy_node_id,
                    "type": "policy_area",
                    "label": str(g.policy_area),
                    "policy_area": str(g.policy_area),
                },
            )
            edges.append(
                {
                    "source": claim_node_id,
                    "target": policy_node_id,
                    "type": "policy_area",
                }
            )

        # Bill node/edges (from gold match)
        if g.matched_bill_id:
            bill_id = g.matched_bill_id
            bill_node_id = _node_id("bill", bill_id)

            bill_label = bill_id
            bill = db.query(Bill).filter(Bill.bill_id == bill_id).first()
            if bill and bill.title:
                bill_label = bill.title

            nodes_by_id.setdefault(
                bill_node_id,
                {
                    "id": bill_node_id,
                    "type": "bill",
                    "label": bill_label,
                    "bill_id": bill_id,
                    "policy_area": (bill.policy_area if bill else None),
                    "status_bucket": (bill.status_bucket if bill else None),
                },
            )

            edges.append(
                {
                    "source": claim_node_id,
                    "target": bill_node_id,
                    "type": "matched_bill",
                    "tier": g.tier,
                    "relevance": g.relevance,
                    "progress": g.progress,
                    "timing": g.timing,
                    "score": g.score,
                }
            )

            # Aggregate summary: person -> bill
            person_bill_agg[bill_id]["count"] += 1
            if g.score is not None:
                person_bill_agg[bill_id]["score_sum"] += float(g.score)

    # Add summary edges (stable order by bill_id)
    for bill_id in sorted(person_bill_agg.keys()):
        bill_node_id = _node_id("bill", bill_id)
        agg = person_bill_agg[bill_id]
        edges.append(
            {
                "source": _node_id("person", person_id),
                "target": bill_node_id,
                "type": "linked_to_bill",
                "count": int(agg["count"]),
                "score_sum": float(agg["score_sum"]),
            }
        )

    # Emit stable node list
    nodes = [nodes_by_id[k] for k in sorted(nodes_by_id.keys())]

    # Emit edges in stable order
    def _edge_sort_key(e: Dict[str, Any]) -> Tuple[str, str, str]:
        return (str(e.get("source")), str(e.get("target")), str(e.get("type")))

    edges_sorted = sorted(edges, key=_edge_sort_key)

    return {
        "person_id": person_id,
        "nodes": nodes,
        "edges": edges_sorted,
        "stats": {
            "gold_rows": len(gold_rows),
            "nodes": len(nodes),
            "edges": len(edges_sorted),
            "matched_bills": len(person_bill_agg),
        },
    }
