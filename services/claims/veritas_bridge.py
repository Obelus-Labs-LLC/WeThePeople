"""
Veritas Bridge - Connects WTP to the Veritas verification service via HTTP.

Veritas runs as a separate service on localhost:8007.
This bridge calls Veritas endpoints and enriches results with WTP database evidence.

Flow:
1. User submits text (no entity_id required)
2. Bridge calls Veritas /api/v1/claims/extract (zero LLM, rule-based)
3. For each claim, bridge searches WTP database for matching evidence
4. Bridge calls Veritas scoring on combined evidence
5. Results returned with 0-100 scores and SUPPORTED/PARTIAL/UNKNOWN status
"""

import ipaddress
import logging
import os
import re
import socket
import requests
from urllib.parse import urlparse
from typing import List, Dict, Any, Optional
from collections import defaultdict

from sqlalchemy.orm import Session
from sqlalchemy import text

logger = logging.getLogger(__name__)

VERITAS_URL = os.environ.get("VERITAS_URL", "http://localhost:8007")

_BLOCKED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


def _is_safe_url(url: str) -> Optional[str]:
    """Validate a user-supplied URL to prevent SSRF attacks.

    Returns the first safe resolved IP address, or None if URL is blocked.
    The caller must use the returned IP to avoid DNS rebinding attacks.
    """
    try:
        parsed = urlparse(url)
    except Exception:
        return None
    if parsed.scheme not in ("http", "https"):
        return None
    hostname = parsed.hostname
    if not hostname:
        return None
    if hostname in ("localhost", "metadata.google.internal"):
        return None
    try:
        resolved = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        for family, _, _, _, sockaddr in resolved:
            ip = ipaddress.ip_address(sockaddr[0])
            blocked = False
            for net in _BLOCKED_NETWORKS:
                if ip in net:
                    blocked = True
                    break
            if not blocked:
                return str(ip)
        return None  # All resolved IPs are blocked
    except (socket.gaierror, ValueError):
        return None


def _call_veritas(endpoint: str, method: str = "GET", json_body: dict = None, timeout: int = 60) -> Optional[dict]:
    """Call a Veritas API endpoint."""
    url = "%s%s" % (VERITAS_URL, endpoint)
    try:
        if method == "POST":
            resp = requests.post(url, json=json_body, timeout=timeout)
        else:
            resp = requests.get(url, timeout=timeout)
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.ConnectionError:
        logger.error("Veritas service not reachable at %s", VERITAS_URL)
        return None
    except requests.exceptions.Timeout:
        logger.error("Veritas request timed out: %s", endpoint)
        return None
    except Exception as e:
        logger.error("Veritas API error: %s", e)
        return None


def _extract_claims_veritas(input_text: str, title: str = "") -> List[Dict[str, Any]]:
    """Extract claims from text using Veritas service (zero LLM, deterministic)."""
    result = _call_veritas("/api/v1/claims/extract", method="POST", json_body={
        "text": input_text,
        "title": title or "WTP Verification",
    })
    if result:
        return result.get("claims", [])
    return []


def _search_wtp_evidence(db: Session, claim_text: str) -> List[Dict[str, Any]]:
    """Search the WTP database for evidence matching a claim."""
    evidence = []
    claim_lower = claim_text.lower()

    # Extract potential entity names from capitalized word sequences
    words = claim_text.split()
    potential_entities = []
    i = 0
    while i < len(words):
        w = words[i].strip(".,;:\"'()")
        if w and w[0].isupper() and len(w) > 2:
            parts = [w]
            j = i + 1
            while j < len(words):
                nw = words[j].strip(".,;:\"'()")
                if nw and nw[0].isupper():
                    parts.append(nw)
                    j += 1
                else:
                    break
            name = " ".join(parts)
            skip = {"the", "and", "for", "this", "that", "house", "senate",
                    "congress", "committee", "department", "united", "states",
                    "while", "between", "during", "after", "before"}
            if name.lower() not in skip:
                potential_entities.append(name)
            i = j
        else:
            i += 1

    # Search tracked entities
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

    matched = []
    for entity_name in potential_entities:
        for table, id_col, name_col, sector in entity_tables:
            try:
                rows = db.execute(text(
                    "SELECT %s, %s FROM %s WHERE LOWER(%s) LIKE :pat" % (id_col, name_col, table, name_col)
                ), {"pat": "%" + entity_name.lower() + "%"}).fetchall()
                for eid, ename in rows:
                    matched.append({"entity_id": eid, "entity_name": ename, "sector": sector, "id_col": id_col})
            except Exception:
                continue

    def _fmt(n):
        if n >= 1e9: return "$%.1fB" % (n / 1e9)
        if n >= 1e6: return "$%.1fM" % (n / 1e6)
        if n >= 1e3: return "$%.0fK" % (n / 1e3)
        return "$%s" % "{:,.0f}".format(n)

    def _url(sector, eid):
        base = "https://wethepeopleforus.com"
        if sector == "politician":
            return "%s/politics/people/%s" % (base, eid)
        route = {"tech": "technology"}.get(sector, sector)
        return "%s/%s/%s" % (base, route, eid)

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

    for entity in matched[:5]:
        eid = entity["entity_id"]
        ename = entity["entity_name"]
        sector = entity["sector"]
        url = _url(sector, eid)

        # Lobbying
        if any(w in claim_lower for w in ["lobby", "spend", "influence", "million", "billion"]):
            lt = lobbying_tables.get(sector)
            if lt:
                try:
                    r = db.execute(text(
                        "SELECT SUM(income), COUNT(*) FROM %s WHERE %s = :eid" % (lt[0], lt[1])
                    ), {"eid": eid}).fetchone()
                    if r and r[0]:
                        evidence.append({
                            "source": "WTP Senate LDA Database",
                            "source_url": url,
                            "title": "%s Lobbying Records" % ename,
                            "snippet": "%s filed %d lobbying disclosures totaling %s, per Senate LDA filings." % (
                                ename, int(r[1]), _fmt(float(r[0]))
                            ),
                            "evidence_type": "primary_source",
                        })
                except Exception:
                    pass

        # Contracts
        if any(w in claim_lower for w in ["contract", "receive", "award", "billion", "pentagon", "defense"]):
            ct = contract_tables.get(sector)
            if ct:
                try:
                    r = db.execute(text(
                        "SELECT SUM(award_amount), COUNT(*) FROM %s WHERE %s = :eid" % (ct[0], ct[1])
                    ), {"eid": eid}).fetchone()
                    if r and r[0]:
                        evidence.append({
                            "source": "WTP USASpending Database",
                            "source_url": url,
                            "title": "%s Government Contracts" % ename,
                            "snippet": "%s received %s across %d contracts, per USASpending.gov." % (
                                ename, _fmt(float(r[0])), int(r[1])
                            ),
                            "evidence_type": "primary_source",
                        })
                except Exception:
                    pass

        # Congressional trades
        if sector == "politician" and any(w in claim_lower for w in ["trad", "stock", "bought", "purchased", "sold"]):
            try:
                r = db.execute(text(
                    "SELECT COUNT(*), COUNT(DISTINCT ticker) FROM congressional_trades WHERE person_id = :eid"
                ), {"eid": eid}).fetchone()
                if r and r[0]:
                    evidence.append({
                        "source": "WTP Congressional Trades",
                        "source_url": url,
                        "title": "%s Stock Trades" % ename,
                        "snippet": "%s executed %d stock trades across %d tickers, per STOCK Act filings." % (
                            ename, int(r[0]), int(r[1])
                        ),
                        "evidence_type": "primary_source",
                    })
            except Exception:
                pass

        # Committees
        if any(w in claim_lower for w in ["committee", "serving", "oversight", "panel"]):
            try:
                rows = db.execute(text(
                    "SELECT c.name FROM committees c "
                    "JOIN committee_memberships cm ON cm.committee_thomas_id = c.thomas_id "
                    "WHERE cm.person_id = :eid"
                ), {"eid": eid}).fetchall()
                if rows:
                    evidence.append({
                        "source": "WTP Committee Database",
                        "source_url": url,
                        "title": "%s Committees" % ename,
                        "snippet": "%s serves on: %s. Source: congress-legislators (congress.gov)." % (
                            ename, ", ".join(r[0] for r in rows[:5])
                        ),
                        "evidence_type": "primary_source",
                    })
            except Exception:
                pass

        # PAC Donations
        if any(w in claim_lower for w in ["donat", "contribut", "pac", "campaign"]):
            try:
                r = db.execute(text(
                    "SELECT SUM(amount), COUNT(*) FROM company_donations WHERE entity_id = :eid OR person_id = :eid"
                ), {"eid": eid}).fetchone()
                if r and r[0]:
                    evidence.append({
                        "source": "WTP FEC Donations",
                        "source_url": url,
                        "title": "%s PAC Donations" % ename,
                        "snippet": "%s associated with %s across %d PAC donations, per FEC data." % (
                            ename, _fmt(float(r[0])), int(r[1])
                        ),
                        "evidence_type": "primary_source",
                    })
            except Exception:
                pass

    return evidence


def run_verification(db: Session, text_input: str, source_url: Optional[str] = None) -> Dict[str, Any]:
    """Run the full Veritas + WTP verification pipeline via HTTP."""

    # Step 1: Extract claims via Veritas service
    claims = _extract_claims_veritas(text_input)
    if not claims:
        # Check if Veritas is even reachable
        health = _call_veritas("/health", timeout=5)
        if not health:
            return {
                "claims_extracted": 0,
                "claims": [],
                "source_url": source_url,
                "engine": "veritas",
                "summary": "Verification service is currently unavailable. Please try again later.",
            }
        return {
            "claims_extracted": 0,
            "claims": [],
            "source_url": source_url,
            "engine": "veritas",
            "summary": "No verifiable claims detected in the submitted text.",
        }

    logger.info("Veritas extracted %d claims", len(claims))

    # Step 2: For each claim, search WTP database
    results = []
    for claim in claims:
        claim_text = claim.get("text", "")
        claim_category = claim.get("category", "general")

        wtp_evidence = _search_wtp_evidence(db, claim_text)

        # Simple scoring based on evidence found
        # (Veritas scoring via HTTP would require a separate endpoint)
        evidence_count = len(wtp_evidence)
        if evidence_count >= 3:
            score = 85
            status = "supported"
            confidence = 0.85
        elif evidence_count >= 2:
            score = 70
            status = "partial"
            confidence = 0.70
        elif evidence_count >= 1:
            score = 50
            status = "partial"
            confidence = 0.50
        else:
            score = 0
            status = "unknown"
            confidence = 0.0

        results.append({
            "claim_id": claim.get("id", ""),
            "claim_text": claim_text,
            "category": claim_category,
            "signals": claim.get("signals", ""),
            "claim_date": claim.get("claim_date", ""),
            "score": score,
            "status": status,
            "confidence": confidence,
            "evidence_count": evidence_count,
            "evidence": wtp_evidence,
        })

    return {
        "claims_extracted": len(results),
        "claims": results,
        "source_url": source_url,
        "engine": "veritas",
        "veritas_url": VERITAS_URL,
        "summary": "Verified %d claims against WeThePeople database (%d evidence records found)." % (
            len(results), sum(r["evidence_count"] for r in results)
        ),
    }


def run_verification_from_url(db: Session, url: str) -> Dict[str, Any]:
    """Run verification on content fetched from a URL."""
    safe_ip = _is_safe_url(url)
    if not safe_ip:
        return {
            "claims_extracted": 0,
            "claims": [],
            "source_url": url,
            "engine": "veritas",
            "summary": "URL not allowed: only public http/https URLs are accepted.",
        }
    # Use Veritas to ingest the URL
    result = _call_veritas("/api/v1/sources/ingest-url", method="POST", json_body={
        "url": url,
    }, timeout=30)

    if not result:
        # Fallback: fetch and extract text ourselves, using pinned IP to prevent DNS rebinding
        try:
            parsed = urlparse(url)
            port = parsed.port or (443 if parsed.scheme == "https" else 80)
            pinned_url = f"{parsed.scheme}://{safe_ip}:{port}{parsed.path}"
            if parsed.query:
                pinned_url += f"?{parsed.query}"
            resp = requests.get(pinned_url, headers={"Host": parsed.hostname}, timeout=30, verify=parsed.scheme == "https")
            resp.raise_for_status()
            try:
                from trafilatura import extract
                page_text = extract(resp.text) or resp.text[:10000]
            except ImportError:
                page_text = resp.text[:10000]
        except Exception as e:
            return {
                "claims_extracted": 0,
                "claims": [],
                "source_url": url,
                "engine": "veritas",
                "summary": "Failed to fetch URL: %s" % str(e)[:200],
            }
        return run_verification(db, page_text, source_url=url)

    # If Veritas ingested it, extract claims from the source
    source_id = result.get("id", result.get("source_id", ""))
    if source_id:
        # Fetch claims for this source
        claims_result = _call_veritas("/api/v1/claims/verified?source_id=%s" % source_id)
        if claims_result:
            # Run WTP evidence search for each
            return run_verification(db, result.get("full_text", ""), source_url=url)

    return run_verification(db, "", source_url=url)
