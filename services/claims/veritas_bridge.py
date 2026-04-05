"""
Veritas Bridge - Connects the Veritas deterministic claim verification engine
to the WeThePeople database as an evidence source.

Flow:
1. User submits text (no entity_id required)
2. Veritas extracts claims (zero LLM, rule-based)
3. For each claim, we search the WTP database for matching evidence
4. Evidence gets scored by Veritas's scoring system
5. Results returned with 0-100 scores and SUPPORTED/PARTIAL/UNKNOWN status

This replaces the old Claude-based extraction + simple tier system.
"""

import logging
import re
from typing import List, Dict, Any, Optional
from collections import defaultdict

from sqlalchemy.orm import Session
from sqlalchemy import text

logger = logging.getLogger(__name__)


def _extract_claims_veritas(input_text: str, title: str = "") -> List[Dict[str, Any]]:
    """Extract claims from text using Veritas (zero LLM, deterministic)."""
    try:
        from veritas.routes.claims import extract_claims_endpoint, TextInput
        text_input = TextInput(text=input_text, title=title or "WTP Verification")
        result = extract_claims_endpoint(text_input)
        return result.get("claims", [])
    except Exception as e:
        logger.error("Veritas claim extraction failed: %s", e)
        return []


def _extract_claims_from_url(url: str) -> List[Dict[str, Any]]:
    """Fetch URL content and extract claims using Veritas."""
    try:
        from veritas.ingest_text import ingest_url
        source = ingest_url(url)
        from veritas.claim_extract import extract_claims
        claims = extract_claims(source.id)
        return [
            {
                "id": c.id,
                "text": c.text,
                "category": c.category,
                "claim_date": c.claim_date,
                "confidence_language": c.confidence_language,
                "signals": c.signals,
                "status": c.status,
                "status_auto": c.status_auto,
                "auto_confidence": c.auto_confidence,
            }
            for c in claims
        ]
    except Exception as e:
        logger.error("Veritas URL extraction failed: %s", e)
        return []


def _search_wtp_evidence(db: Session, claim_text: str, claim_category: str) -> List[Dict[str, Any]]:
    """Search the WTP database for evidence matching a claim.

    Searches across all sector tables: lobbying, contracts, enforcement,
    congressional trades, donations, committees, bills, votes.
    """
    evidence = []
    claim_lower = claim_text.lower()

    # Extract entity names and numbers from claim text
    # Simple extraction: words that start with uppercase, dollar amounts, percentages
    words = claim_text.split()
    potential_entities = []
    i = 0
    while i < len(words):
        if words[i][0:1].isupper() and len(words[i]) > 2:
            # Collect consecutive capitalized words as entity name
            entity_parts = [words[i].strip(".,;:\"'()")]
            j = i + 1
            while j < len(words) and words[j][0:1].isupper():
                entity_parts.append(words[j].strip(".,;:\"'()"))
                j += 1
            entity_name = " ".join(entity_parts)
            if len(entity_name) > 3 and entity_name.lower() not in {
                "the", "and", "for", "but", "not", "this", "that", "with",
                "from", "while", "their", "these", "those", "which", "where",
                "when", "what", "than", "then", "into", "also", "between",
                "over", "under", "after", "before", "during", "since",
                "house", "senate", "congress", "committee", "department",
            }:
                potential_entities.append(entity_name)
            i = j
        else:
            i += 1

    dollar_amounts = re.findall(r'\$[\d,.]+\s*(?:million|billion|thousand|[MBKmb])?', claim_text)
    numbers = re.findall(r'\b\d[\d,.]+\b', claim_text)

    logger.info("Claim entities: %s, amounts: %s", potential_entities[:5], dollar_amounts[:3])

    # Search tracked entities across all tables
    entity_tables = [
        ("tracked_members", "person_id", "display_name", "politician"),
        ("tracked_tech_companies", "company_id", "display_name", "tech"),
        ("tracked_institutions", "institution_id", "display_name", "finance"),
        ("tracked_companies", "company_id", "display_name", "health"),
        ("tracked_energy_companies", "company_id", "display_name", "energy"),
        ("tracked_transportation_companies", "company_id", "display_name", "transportation"),
        ("tracked_defense_companies", "company_id", "display_name", "defense"),
        ("tracked_chemical_companies", "company_id", "display_name", "chemicals"),
        ("tracked_agriculture_companies", "company_id", "display_name", "agriculture"),
        ("tracked_telecom_companies", "company_id", "display_name", "telecom"),
        ("tracked_education_companies", "company_id", "display_name", "education"),
    ]

    matched_entities = []
    for entity_name in potential_entities:
        for table, id_col, name_col, sector in entity_tables:
            try:
                rows = db.execute(text(
                    "SELECT %s, %s FROM %s WHERE LOWER(%s) LIKE :pattern" % (id_col, name_col, table, name_col)
                ), {"pattern": "%" + entity_name.lower() + "%"}).fetchall()
                for eid, ename in rows:
                    matched_entities.append({
                        "entity_id": eid, "entity_name": ename,
                        "sector": sector, "table": table, "id_col": id_col,
                    })
            except Exception:
                continue

    logger.info("Matched %d WTP entities for claim", len(matched_entities))

    # For each matched entity, search relevant data tables
    lobbying_tables = {
        "tech": ("lobbying_records", "company_id"),
        "finance": ("finance_lobbying_records", "institution_id"),
        "health": ("health_lobbying_records", "company_id"),
        "energy": ("energy_lobbying_records", "company_id"),
        "transportation": ("transportation_lobbying_records", "company_id"),
        "defense": ("defense_lobbying_records", "company_id"),
        "chemicals": ("chemical_lobbying_records", "company_id"),
        "agriculture": ("agriculture_lobbying_records", "company_id"),
        "telecom": ("telecom_lobbying_records", "company_id"),
        "education": ("education_lobbying_records", "company_id"),
    }

    contract_tables = {
        "tech": ("government_contracts", "company_id"),
        "finance": ("finance_government_contracts", "institution_id"),
        "health": ("health_government_contracts", "company_id"),
        "energy": ("energy_government_contracts", "company_id"),
        "transportation": ("transportation_government_contracts", "company_id"),
        "defense": ("defense_government_contracts", "company_id"),
        "chemicals": ("chemical_government_contracts", "company_id"),
        "agriculture": ("agriculture_government_contracts", "company_id"),
        "telecom": ("telecom_government_contracts", "company_id"),
        "education": ("education_government_contracts", "company_id"),
    }

    for entity in matched_entities[:5]:  # Limit to 5 entities per claim
        eid = entity["entity_id"]
        sector = entity["sector"]

        # Search lobbying
        if "lobby" in claim_lower or "spend" in claim_lower or "influence" in claim_lower:
            lt = lobbying_tables.get(sector)
            if lt:
                try:
                    lr = db.execute(text(
                        "SELECT SUM(income), COUNT(*) FROM %s WHERE %s = :eid" % (lt[0], lt[1])
                    ), {"eid": eid}).fetchone()
                    if lr and lr[0]:
                        evidence.append({
                            "source": "WTP Senate LDA Database",
                            "source_url": "https://wethepeopleforus.com/%s/%s" % (
                                "politics/people" if sector == "politician" else sector, eid
                            ),
                            "title": "%s lobbying records" % entity["entity_name"],
                            "snippet": "%s filed %d lobbying disclosures totaling $%s" % (
                                entity["entity_name"], int(lr[1]),
                                "{:,.0f}".format(float(lr[0]))
                            ),
                            "evidence_type": "primary_source",
                            "data_type": "lobbying",
                            "amount": float(lr[0]),
                            "count": int(lr[1]),
                        })
                except Exception as e:
                    logger.debug("Lobbying search failed for %s: %s", eid, e)

        # Search contracts
        if "contract" in claim_lower or "receive" in claim_lower or "award" in claim_lower or "billion" in claim_lower:
            ct = contract_tables.get(sector)
            if ct:
                try:
                    cr = db.execute(text(
                        "SELECT SUM(award_amount), COUNT(*) FROM %s WHERE %s = :eid" % (ct[0], ct[1])
                    ), {"eid": eid}).fetchone()
                    if cr and cr[0]:
                        evidence.append({
                            "source": "WTP USASpending Database",
                            "source_url": "https://wethepeopleforus.com/%s/%s" % (sector, eid),
                            "title": "%s government contracts" % entity["entity_name"],
                            "snippet": "%s received $%s across %d government contracts" % (
                                entity["entity_name"],
                                "{:,.0f}".format(float(cr[0])),
                                int(cr[1])
                            ),
                            "evidence_type": "primary_source",
                            "data_type": "contracts",
                            "amount": float(cr[0]),
                            "count": int(cr[1]),
                        })
                except Exception as e:
                    logger.debug("Contract search failed for %s: %s", eid, e)

        # Search congressional trades (for politicians)
        if sector == "politician" and ("trad" in claim_lower or "stock" in claim_lower or "bought" in claim_lower or "purchased" in claim_lower):
            try:
                tr = db.execute(text(
                    "SELECT COUNT(*), COUNT(DISTINCT ticker) FROM congressional_trades WHERE person_id = :eid"
                ), {"eid": eid}).fetchone()
                if tr and tr[0]:
                    evidence.append({
                        "source": "WTP Congressional Trades Database",
                        "source_url": "https://wethepeopleforus.com/politics/people/%s" % eid,
                        "title": "%s stock trades" % entity["entity_name"],
                        "snippet": "%s made %d stock trades across %d tickers per STOCK Act disclosures" % (
                            entity["entity_name"], int(tr[0]), int(tr[1])
                        ),
                        "evidence_type": "primary_source",
                        "data_type": "trades",
                        "count": int(tr[0]),
                    })
            except Exception as e:
                logger.debug("Trade search failed for %s: %s", eid, e)

        # Search committee memberships
        if "committee" in claim_lower or "oversight" in claim_lower or "serving on" in claim_lower:
            try:
                comms = db.execute(text(
                    "SELECT c.name FROM committees c "
                    "JOIN committee_memberships cm ON cm.committee_thomas_id = c.thomas_id "
                    "WHERE cm.person_id = :eid"
                ), {"eid": eid}).fetchall()
                if comms:
                    evidence.append({
                        "source": "WTP Committee Database",
                        "source_url": "https://wethepeopleforus.com/politics/people/%s" % eid,
                        "title": "%s committee assignments" % entity["entity_name"],
                        "snippet": "%s serves on: %s" % (
                            entity["entity_name"],
                            ", ".join(c[0] for c in comms[:5])
                        ),
                        "evidence_type": "primary_source",
                        "data_type": "committees",
                        "count": len(comms),
                    })
            except Exception as e:
                logger.debug("Committee search failed for %s: %s", eid, e)

        # Search PAC donations
        if "donat" in claim_lower or "contribut" in claim_lower or "pac" in claim_lower:
            try:
                dr = db.execute(text(
                    "SELECT SUM(amount), COUNT(*) FROM company_donations WHERE entity_id = :eid OR person_id = :eid"
                ), {"eid": eid}).fetchone()
                if dr and dr[0]:
                    evidence.append({
                        "source": "WTP FEC Donations Database",
                        "source_url": "https://wethepeopleforus.com/%s/%s" % (sector, eid),
                        "title": "%s PAC donations" % entity["entity_name"],
                        "snippet": "%s involved in $%s across %d PAC donations" % (
                            entity["entity_name"],
                            "{:,.0f}".format(float(dr[0])),
                            int(dr[1])
                        ),
                        "evidence_type": "primary_source",
                        "data_type": "donations",
                        "amount": float(dr[0]),
                        "count": int(dr[1]),
                    })
            except Exception as e:
                logger.debug("Donation search failed for %s: %s", eid, e)

    return evidence


def _score_wtp_evidence(claim_text: str, claim_category: str, evidence_list: List[Dict]) -> Dict[str, Any]:
    """Score evidence using Veritas's scoring system."""
    try:
        from veritas.scoring import score_evidence, compute_auto_status, preparse_claim
    except ImportError:
        logger.warning("Veritas scoring not available, using basic scoring")
        # Fallback: simple scoring based on evidence count
        if len(evidence_list) >= 3:
            return {"score": 85, "status": "supported", "confidence": 0.85}
        elif len(evidence_list) >= 1:
            return {"score": 70, "status": "partial", "confidence": 0.7}
        else:
            return {"score": 0, "status": "unknown", "confidence": 0.0}

    parsed = preparse_claim(claim_text, claim_category)
    best_score = 0
    best_type = "other"
    best_signals = ""
    scored_evidence = []

    for ev in evidence_list:
        score, signals = score_evidence(
            claim_text=claim_text,
            claim_category=claim_category,
            evidence_title=ev.get("title", ""),
            evidence_snippet=ev.get("snippet", ""),
            evidence_type=ev.get("evidence_type", "other"),
            source_name=ev.get("source", "WTP Database"),
            claim_parsed=parsed,
        )
        scored_evidence.append({**ev, "score": score, "signals": signals})
        if score > best_score:
            best_score = score
            best_type = ev.get("evidence_type", "other")
            best_signals = signals

    status, confidence = compute_auto_status(
        best_score=best_score,
        best_evidence_type=best_type,
        best_signals=best_signals,
        claim_confidence="unknown",
    )

    return {
        "score": best_score,
        "status": status,
        "confidence": confidence,
        "evidence": scored_evidence,
    }


def run_verification(db: Session, text: str, source_url: Optional[str] = None) -> Dict[str, Any]:
    """Run the full Veritas + WTP verification pipeline.

    No entity_id required. Veritas extracts claims deterministically,
    WTP database provides evidence, Veritas scores it.
    """
    # Step 1: Extract claims (zero LLM)
    claims = _extract_claims_veritas(text)
    if not claims:
        return {
            "claims_extracted": 0,
            "claims": [],
            "source_url": source_url,
            "engine": "veritas",
            "summary": "No verifiable claims detected in the submitted text.",
        }

    logger.info("Veritas extracted %d claims", len(claims))

    # Step 2: For each claim, search WTP database for evidence
    results = []
    for claim in claims:
        claim_text = claim.get("text", "")
        claim_category = claim.get("category", "general")

        # Search WTP database
        wtp_evidence = _search_wtp_evidence(db, claim_text, claim_category)

        # Also run Veritas external sources if available
        external_evidence = []
        try:
            from veritas.evidence_sources.base import build_search_query
            try:
                query = build_search_query(claim_text)
            except Exception:
                query = " ".join(claim_text.split()[:10])
            # Run a subset of Veritas sources for speed
            from veritas.evidence_sources import (
                congress, fec, usaspending, wikipedia_source
            )
            source_fns = [
                ("congress", congress, "search_congress"),
                ("fec", fec, "search_fec"),
                ("usaspending", usaspending, "search_usaspending"),
                ("wikipedia", wikipedia_source, "search_wikipedia"),
            ]
            for src_name, src_mod, fn_name in source_fns:
                try:
                    search_fn = getattr(src_mod, fn_name, None)
                    if search_fn:
                        ext_results = search_fn(query)
                        for r in (ext_results or [])[:3]:
                            external_evidence.append({
                                "source": "Veritas/%s" % src_name,
                                "source_url": r.get("url", ""),
                                "title": r.get("title", "")[:200],
                                "snippet": r.get("snippet", r.get("description", ""))[:300],
                                "evidence_type": "primary_source",
                                "data_type": src_name,
                            })
                except Exception as e:
                    logger.debug("Veritas source %s failed: %s", src_name, e)
        except ImportError:
            pass

        all_evidence = wtp_evidence + external_evidence

        # Step 3: Score all evidence
        scoring = _score_wtp_evidence(claim_text, claim_category, all_evidence)

        results.append({
            "claim_id": claim.get("id", ""),
            "claim_text": claim_text,
            "category": claim_category,
            "signals": claim.get("signals", ""),
            "claim_date": claim.get("claim_date", ""),
            "score": scoring["score"],
            "status": scoring["status"],
            "confidence": scoring["confidence"],
            "evidence_count": len(all_evidence),
            "wtp_evidence_count": len(wtp_evidence),
            "external_evidence_count": len(external_evidence),
            "evidence": scoring.get("evidence", all_evidence),
        })

    return {
        "claims_extracted": len(results),
        "claims": results,
        "source_url": source_url,
        "engine": "veritas",
        "summary": "Verified %d claims against %d evidence sources (WTP database + external APIs)." % (
            len(results),
            sum(r["evidence_count"] for r in results),
        ),
    }


def run_verification_from_url(db: Session, url: str) -> Dict[str, Any]:
    """Run verification on content fetched from a URL."""
    try:
        import requests
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        # Extract main text from HTML
        try:
            from trafilatura import extract
            text = extract(resp.text) or resp.text[:10000]
        except ImportError:
            text = resp.text[:10000]
    except Exception as e:
        return {
            "claims_extracted": 0,
            "claims": [],
            "source_url": url,
            "engine": "veritas",
            "summary": "Failed to fetch URL: %s" % str(e)[:200],
        }

    return run_verification(db, text, source_url=url)
