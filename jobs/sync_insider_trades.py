"""
SEC Form 4 insider-trading sync.

Replaces the prior one-shot ingest that was hard-capped at 40 trades per
institution (see finance_audit_2026_04_17.md Bug #4). Pulls every Form 4 the
SEC has on file for each institution's CIK, parses the XML to extract non-
derivative and derivative transactions, and writes them to sec_insider_trades
with no pagination cap.

EDGAR rate limit: 10 req/sec. We throttle at ~6 req/sec.

Usage:
    python jobs/sync_insider_trades.py                          # all institutions with a CIK
    python jobs/sync_insider_trades.py --institution goldman-sachs
    python jobs/sync_insider_trades.py --limit 5                # first 5 institutions
    python jobs/sync_insider_trades.py --since 2023-01-01       # skip older Form 4s
"""

import argparse
import hashlib
import logging
import os
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, date
from typing import Optional, Dict, Any, List

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from models.database import SessionLocal
from models.finance_models import TrackedInstitution, SECInsiderTrade

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

UA = {"User-Agent": "WeThePeople/1.0 (contact@wethepeopleforus.com)"}
SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik10}.json"
ARCHIVES_URL = "https://www.sec.gov/Archives/edgar/data/{cik_int}/{accession_nodash}"
POLITE_DELAY = 0.17  # ~6 req/sec


def _pad(cik: str) -> str:
    return str(cik).strip().lstrip("0").zfill(10)


def _md5(*parts: Any) -> str:
    return hashlib.md5("|".join(str(p) for p in parts).encode()).hexdigest()


def _parse_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return datetime.strptime(str(s)[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def _safe_float(s) -> Optional[float]:
    if s is None or s == "":
        return None
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def fetch_submissions(cik: str) -> Optional[Dict[str, Any]]:
    url = SUBMISSIONS_URL.format(cik10=_pad(cik))
    try:
        time.sleep(POLITE_DELAY)
        r = requests.get(url, headers=UA, timeout=30)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        log.warning("  submissions fetch failed for CIK %s: %s", cik, e)
        return None


def fetch_older_submissions_pages(subs: Dict[str, Any]) -> List[Dict[str, Any]]:
    """EDGAR splits filings >1000 into extra JSON files listed under
    submissions['filings']['files']. Fetch each and return concatenated
    dicts mimicking the 'recent' structure."""
    extras: List[Dict[str, Any]] = []
    files = subs.get("filings", {}).get("files", []) or []
    for f in files:
        name = f.get("name")
        if not name:
            continue
        try:
            time.sleep(POLITE_DELAY)
            r = requests.get(f"https://data.sec.gov/submissions/{name}", headers=UA, timeout=30)
            r.raise_for_status()
            extras.append(r.json())
        except Exception as e:
            log.warning("    older-page fetch failed (%s): %s", name, e)
    return extras


def iter_form4_accessions(subs: Dict[str, Any]):
    """Yield (accession_number, filing_date, primary_doc) tuples for every
    Form 4 / Form 4/A filed by this CIK, across the 'recent' set plus any
    paginated older files."""
    def _emit(recent):
        accs = recent.get("accessionNumber", []) or []
        forms = recent.get("form", []) or []
        dates = recent.get("filingDate", []) or []
        prim = recent.get("primaryDocument", []) or []
        for i, form in enumerate(forms):
            if form not in ("4", "4/A"):
                continue
            yield (
                accs[i] if i < len(accs) else "",
                dates[i] if i < len(dates) else "",
                prim[i] if i < len(prim) else "",
            )

    recent = subs.get("filings", {}).get("recent", {}) or {}
    yield from _emit(recent)
    for extra in fetch_older_submissions_pages(subs):
        yield from _emit(extra)


def fetch_form4_xml(cik_int: int, accession: str) -> Optional[str]:
    """Form 4 primary XML document. We locate it from the filing index."""
    acc_nodash = accession.replace("-", "")
    # The index lists all documents; Form 4 XML is usually the only .xml.
    index_url = ARCHIVES_URL.format(cik_int=cik_int, accession_nodash=acc_nodash) + "/"
    try:
        time.sleep(POLITE_DELAY)
        r = requests.get(index_url + "index.json", headers=UA, timeout=30)
        r.raise_for_status()
        items = r.json().get("directory", {}).get("item", []) or []
    except Exception as e:
        log.debug("    index fetch failed %s: %s", accession, e)
        return None

    xml_name = None
    for item in items:
        name = item.get("name", "")
        if name.endswith(".xml") and not name.endswith("primary_doc.xml") is None:
            pass
        if name.endswith(".xml"):
            xml_name = name
            break
    # Prefer 'primary_doc.xml' if present
    for item in items:
        if item.get("name") == "primary_doc.xml":
            xml_name = "primary_doc.xml"
            break
    if not xml_name:
        return None

    try:
        time.sleep(POLITE_DELAY)
        r = requests.get(index_url + xml_name, headers=UA, timeout=30)
        r.raise_for_status()
        return r.text
    except Exception as e:
        log.debug("    xml fetch failed %s/%s: %s", accession, xml_name, e)
        return None


def _text(el, path: str) -> Optional[str]:
    node = el.find(path)
    if node is None:
        return None
    return (node.text or "").strip() or None


def parse_form4(xml_str: str) -> List[Dict[str, Any]]:
    """Extract transactions from a Form 4 XML. Returns a list of dicts with
    keys: filer_name, filer_title, transaction_date, transaction_type,
    shares, price_per_share, total_value."""
    try:
        root = ET.fromstring(xml_str)
    except ET.ParseError:
        return []

    # Reporting owner
    filer_name = _text(root, "reportingOwner/reportingOwnerId/rptOwnerName") or ""
    rel = root.find("reportingOwner/reportingOwnerRelationship")
    filer_title = None
    if rel is not None:
        officer_title = _text(rel, "officerTitle")
        is_director = _text(rel, "isDirector")
        is_officer = _text(rel, "isOfficer")
        is_ten_percent = _text(rel, "isTenPercentOwner")
        parts = []
        if officer_title:
            parts.append(officer_title)
        elif is_officer == "1":
            parts.append("Officer")
        if is_director == "1":
            parts.append("Director")
        if is_ten_percent == "1":
            parts.append("10% Owner")
        filer_title = ", ".join(parts) or None

    results: List[Dict[str, Any]] = []

    # Non-derivative transactions
    for tx in root.findall("nonDerivativeTable/nonDerivativeTransaction"):
        tdate = _parse_date(_text(tx, "transactionDate/value"))
        if not tdate:
            continue
        tcode = _text(tx, "transactionCoding/transactionCode")
        shares = _safe_float(_text(tx, "transactionAmounts/transactionShares/value"))
        price = _safe_float(_text(tx, "transactionAmounts/transactionPricePerShare/value"))
        total = (shares or 0) * (price or 0) if (shares and price) else None
        results.append({
            "filer_name": filer_name,
            "filer_title": filer_title,
            "transaction_date": tdate,
            "transaction_type": tcode,
            "shares": shares,
            "price_per_share": price,
            "total_value": total,
        })

    # Derivative transactions — options, restricted stock, etc.
    for tx in root.findall("derivativeTable/derivativeTransaction"):
        tdate = _parse_date(_text(tx, "transactionDate/value"))
        if not tdate:
            continue
        tcode = _text(tx, "transactionCoding/transactionCode")
        shares = _safe_float(_text(tx, "transactionAmounts/transactionShares/value"))
        price = _safe_float(_text(tx, "transactionAmounts/transactionPricePerShare/value"))
        total = (shares or 0) * (price or 0) if (shares and price) else None
        results.append({
            "filer_name": filer_name,
            "filer_title": filer_title,
            "transaction_date": tdate,
            "transaction_type": (tcode + " (deriv)") if tcode else "deriv",
            "shares": shares,
            "price_per_share": price,
            "total_value": total,
        })

    return results


def sync_institution(db, inst: TrackedInstitution, since: Optional[date]) -> int:
    if not inst.sec_cik:
        log.info("  [%s] no CIK, skipping", inst.institution_id)
        return 0
    cik = inst.sec_cik.strip().lstrip("0")
    if not cik:
        return 0

    subs = fetch_submissions(cik)
    if not subs:
        return 0

    inserted = 0
    seen = 0
    for accession, fdate_str, primary_doc in iter_form4_accessions(subs):
        fdate = _parse_date(fdate_str)
        if since and fdate and fdate < since:
            continue
        seen += 1
        xml_str = fetch_form4_xml(int(cik), accession)
        if not xml_str:
            continue
        txs = parse_form4(xml_str)
        for idx, t in enumerate(txs):
            dhash = _md5(
                inst.institution_id,
                accession,
                idx,  # per-transaction index — guarantees intra-filing uniqueness
                t["filer_name"],
                t["transaction_date"],
                t["transaction_type"],
                t["shares"],
                t["price_per_share"],
            )
            # dedup: do a per-row check rather than rely on UNIQUE, since we
            # may have existing rows from prior runs.
            exists = db.execute(
                text("SELECT 1 FROM sec_insider_trades WHERE dedupe_hash=:h"),
                {"h": dhash},
            ).first()
            if exists:
                continue
            acc_nodash = accession.replace("-", "")
            db.add(SECInsiderTrade(
                institution_id=inst.institution_id,
                filer_name=t["filer_name"] or "UNKNOWN",
                filer_title=t["filer_title"],
                transaction_date=t["transaction_date"],
                transaction_type=t["transaction_type"],
                shares=t["shares"],
                price_per_share=t["price_per_share"],
                total_value=t["total_value"],
                accession_number=accession,
                filing_url=f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc_nodash}/",
                dedupe_hash=dhash,
            ))
            inserted += 1
        # Commit per filing to keep the transaction small.
        try:
            db.commit()
        except Exception as e:
            log.warning("    commit failed on %s: %s — rolling back", accession, e)
            db.rollback()
    db.commit()
    log.info("  [%s] form4_filings_scanned=%d inserted=%d", inst.institution_id, seen, inserted)
    return inserted


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--institution", help="single institution_id")
    ap.add_argument("--limit", type=int, default=0, help="limit number of institutions (0 = all)")
    ap.add_argument("--since", help="skip Form 4s older than YYYY-MM-DD", default=None)
    args = ap.parse_args()

    since = _parse_date(args.since) if args.since else None

    db = SessionLocal()
    try:
        q = db.query(TrackedInstitution).filter(
            TrackedInstitution.is_active == True,
            TrackedInstitution.sec_cik.isnot(None),
            TrackedInstitution.sec_cik != "",
        )
        if args.institution:
            q = q.filter(TrackedInstitution.institution_id == args.institution)
        elif args.limit:
            q = q.limit(args.limit)

        insts = q.all()
        log.info("Syncing Form 4 insider trades for %d institutions", len(insts))
        total = 0
        for inst in insts:
            log.info("== %s (CIK %s)", inst.institution_id, inst.sec_cik)
            try:
                total += sync_institution(db, inst, since)
            except Exception as e:
                log.exception("  ERROR on %s: %s", inst.institution_id, e)
                db.rollback()
        log.info("Done. Total inserted: %d", total)
    finally:
        db.close()


if __name__ == "__main__":
    main()
