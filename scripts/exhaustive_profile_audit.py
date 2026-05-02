"""
Exhaustive profile audit for every tracked politician and company.

Walks every person_id in tracked_members and every company across the 11
sector tables. For each, hits the API endpoint that powers the SPA
profile page, captures HTTP status + render-relevant fields, and
writes a structured report.

This is the response to "did you go through every single politician and
every single company that we track?" — the answer to which had been
"no, I sampled" until this script ran.

Usage:
    python scripts/exhaustive_profile_audit.py
    python scripts/exhaustive_profile_audit.py --limit 50
    python scripts/exhaustive_profile_audit.py --section people
    python scripts/exhaustive_profile_audit.py --section companies
    python scripts/exhaustive_profile_audit.py --concurrency 8

Output:
    .planning/EXHAUSTIVE_PROFILE_AUDIT_<timestamp>.md
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

# Allow running from repo root via `python scripts/...`
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from models.database import SessionLocal, TrackedMember  # noqa: E402

API_BASE = os.getenv("WTP_API_BASE", "http://127.0.0.1:8006")
TIMEOUT = 30


SECTOR_COMPANY_TABLES = {
    # sector → (table name, slug column, name column, id column)
    "finance": ("finance_institutions", "slug", "name", "id"),
    "tech": ("tech_companies", "slug", "name", "id"),
    "health": ("health_companies", "slug", "name", "id"),
    "energy": ("energy_companies", "slug", "name", "id"),
    "transportation": ("transportation_companies", "slug", "name", "id"),
    "defense": ("defense_companies", "slug", "name", "id"),
    "chemicals": ("chemical_companies", "slug", "name", "id"),
    "agriculture": ("agriculture_companies", "slug", "name", "id"),
    "education": ("education_companies", "slug", "name", "id"),
    "telecom": ("telecom_companies", "slug", "name", "id"),
}


def _check_person(person_id: str) -> dict:
    """Audit one /people/{id}/full call. Returns a structured record."""
    url = f"{API_BASE}/people/{person_id}/full"
    t0 = time.time()
    try:
        r = requests.get(url, timeout=TIMEOUT)
        elapsed = round((time.time() - t0) * 1000)
        record = {
            "person_id": person_id,
            "status": r.status_code,
            "ms": elapsed,
            "error": None,
            "fields_present": [],
            "fields_empty": [],
        }
        if r.status_code != 200:
            record["error"] = (r.text or "")[:200]
            return record
        data = r.json()
        # Track which top-level keys are populated. Empty list / dict
        # / null counts as "absent". Non-empty container counts as
        # present. The frontend uses these keys verbatim.
        for key in (
            "person", "performance", "votes", "bills", "trades",
            "committees", "donors", "anomalies", "summary",
        ):
            value = data.get(key)
            populated = bool(value) and value not in ([], {}, None)
            (record["fields_present"] if populated else record["fields_empty"]).append(key)
        return record
    except requests.Timeout:
        return {
            "person_id": person_id, "status": 0, "ms": TIMEOUT * 1000,
            "error": "timeout", "fields_present": [], "fields_empty": [],
        }
    except Exception as e:
        return {
            "person_id": person_id, "status": 0, "ms": round((time.time() - t0) * 1000),
            "error": f"{type(e).__name__}: {str(e)[:160]}",
            "fields_present": [], "fields_empty": [],
        }


def _check_company(sector: str, slug: str) -> dict:
    """Audit one company/institution profile call."""
    if sector == "finance":
        url = f"{API_BASE}/finance/institutions/{slug}"
    else:
        # Most sectors expose /{sector}/companies/{slug} or /companies/{slug}
        # in their respective routers. Try the most common pattern.
        url = f"{API_BASE}/{sector}/companies/{slug}"
    t0 = time.time()
    try:
        r = requests.get(url, timeout=TIMEOUT)
        elapsed = round((time.time() - t0) * 1000)
        record = {
            "sector": sector, "slug": slug,
            "status": r.status_code, "ms": elapsed,
            "error": None,
            "fields_present": [], "fields_empty": [],
        }
        if r.status_code != 200:
            record["error"] = (r.text or "")[:200]
            return record
        data = r.json()
        for key in (
            "company", "lobbying", "contracts", "enforcement",
            "donations", "trades", "filings",
        ):
            value = data.get(key)
            populated = bool(value) and value not in ([], {}, None)
            (record["fields_present"] if populated else record["fields_empty"]).append(key)
        return record
    except requests.Timeout:
        return {
            "sector": sector, "slug": slug, "status": 0, "ms": TIMEOUT * 1000,
            "error": "timeout",
            "fields_present": [], "fields_empty": [],
        }
    except Exception as e:
        return {
            "sector": sector, "slug": slug, "status": 0,
            "ms": round((time.time() - t0) * 1000),
            "error": f"{type(e).__name__}: {str(e)[:160]}",
            "fields_present": [], "fields_empty": [],
        }


def _list_people(db, limit: int) -> list[str]:
    q = db.query(TrackedMember.person_id).filter(TrackedMember.is_active == 1)
    rows = q.all()
    ids = [r[0] for r in rows]
    if limit > 0:
        ids = ids[:limit]
    return ids


def _list_companies(db, limit: int) -> list[tuple[str, str]]:
    """Return [(sector, slug), …] using introspection so we don't
    hard-fail when a model module isn't loaded yet."""
    from sqlalchemy import text
    pairs: list[tuple[str, str]] = []
    for sector, (tbl, slug_col, _, _) in SECTOR_COMPANY_TABLES.items():
        try:
            stmt = text(f"SELECT {slug_col} FROM {tbl} WHERE {slug_col} IS NOT NULL AND {slug_col} != ''")
            for row in db.execute(stmt).fetchall():
                slug = row[0]
                if slug:
                    pairs.append((sector, slug))
        except Exception as e:
            print(f"  ! skipping {sector} ({tbl}): {type(e).__name__}: {e}", file=sys.stderr)
    if limit > 0:
        pairs = pairs[:limit]
    return pairs


def _summarize_records(records: list[dict], kind: str) -> dict:
    total = len(records)
    if not total:
        return {"total": 0}
    ok = sum(1 for r in records if r["status"] == 200)
    by_status = Counter(r["status"] for r in records)
    timeouts = sum(1 for r in records if r["error"] == "timeout")
    avg_ms = round(sum(r["ms"] for r in records) / max(total, 1))
    p95_ms = sorted(r["ms"] for r in records)[int(total * 0.95)] if total > 1 else records[0]["ms"]
    # Top empty fields across the sample.
    empty_counter: Counter = Counter()
    for r in records:
        for f in r["fields_empty"]:
            empty_counter[f] += 1
    return {
        "kind": kind,
        "total": total,
        "ok": ok,
        "non_200": total - ok,
        "by_status": dict(by_status),
        "timeouts": timeouts,
        "avg_ms": avg_ms,
        "p95_ms": p95_ms,
        "top_empty_fields": empty_counter.most_common(10),
    }


def _write_report(out_path: Path, person_records, company_records, started_at):
    elapsed = time.time() - started_at
    p_summary = _summarize_records(person_records, "people")
    c_summary = _summarize_records(company_records, "companies")

    lines = []
    lines.append(f"# Exhaustive profile audit — {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}")
    lines.append("")
    lines.append(f"Wall-clock: **{elapsed:.1f}s** to audit "
                 f"**{p_summary.get('total', 0)} people** + "
                 f"**{c_summary.get('total', 0)} companies**.")
    lines.append("")

    for label, summary, records in (
        ("People", p_summary, person_records),
        ("Companies", c_summary, company_records),
    ):
        if not records:
            continue
        lines.append(f"## {label} ({summary['total']})")
        lines.append("")
        lines.append(f"- 200 OK: **{summary['ok']}**, non-200: **{summary['non_200']}**, timeouts: **{summary['timeouts']}**")
        lines.append(f"- Status code distribution: {summary['by_status']}")
        lines.append(f"- avg latency: **{summary['avg_ms']}ms**, p95: **{summary['p95_ms']}ms**")
        if summary["top_empty_fields"]:
            lines.append("- Most-frequently-empty fields:")
            for field, n in summary["top_empty_fields"]:
                pct = round(100 * n / max(summary["total"], 1), 1)
                lines.append(f"   - `{field}`: empty on **{n}** ({pct}%) entities")
        lines.append("")

        # Failures table.
        bad = [r for r in records if r["status"] != 200]
        if bad:
            lines.append(f"### {label} — {len(bad)} non-200 results")
            lines.append("")
            lines.append("| key | status | ms | error |")
            lines.append("|---|---|---|---|")
            for r in bad[:200]:
                key = r.get("person_id") or f"{r.get('sector')}/{r.get('slug')}"
                err = (r.get("error") or "").replace("|", "\\|")[:120]
                lines.append(f"| `{key}` | {r['status']} | {r['ms']} | {err} |")
            if len(bad) > 200:
                lines.append(f"| … | … | … | (+{len(bad) - 200} more rows omitted) |")
            lines.append("")

        # Slow set: top 20 by ms.
        slow = sorted(records, key=lambda r: r["ms"], reverse=True)[:20]
        if slow:
            lines.append(f"### {label} — slowest 20")
            lines.append("")
            lines.append("| key | ms | status |")
            lines.append("|---|---|---|")
            for r in slow:
                key = r.get("person_id") or f"{r.get('sector')}/{r.get('slug')}"
                lines.append(f"| `{key}` | {r['ms']} | {r['status']} |")
            lines.append("")

    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nWrote: {out_path}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--section", choices=["people", "companies", "all"], default="all")
    parser.add_argument("--limit", type=int, default=0,
                        help="Limit per section (0 = all).")
    parser.add_argument("--concurrency", type=int, default=6)
    parser.add_argument("--out", type=str, default=None,
                        help="Output path (default: .planning/EXHAUSTIVE_PROFILE_AUDIT_<timestamp>.md)")
    args = parser.parse_args()

    started = time.time()
    db = SessionLocal()
    try:
        person_records: list[dict] = []
        company_records: list[dict] = []

        if args.section in ("people", "all"):
            people_ids = _list_people(db, args.limit)
            print(f"Auditing {len(people_ids)} politicians (concurrency={args.concurrency})…", file=sys.stderr)
            with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
                futures = {pool.submit(_check_person, pid): pid for pid in people_ids}
                for i, fut in enumerate(as_completed(futures), 1):
                    person_records.append(fut.result())
                    if i % 50 == 0:
                        print(f"  ...{i}/{len(people_ids)}", file=sys.stderr)

        if args.section in ("companies", "all"):
            company_pairs = _list_companies(db, args.limit)
            print(f"Auditing {len(company_pairs)} companies (concurrency={args.concurrency})…", file=sys.stderr)
            with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
                futures = {pool.submit(_check_company, sec, slug): (sec, slug)
                           for sec, slug in company_pairs}
                for i, fut in enumerate(as_completed(futures), 1):
                    company_records.append(fut.result())
                    if i % 50 == 0:
                        print(f"  ...{i}/{len(company_pairs)}", file=sys.stderr)
    finally:
        db.close()

    out_dir = ROOT / ".planning"
    out_dir.mkdir(exist_ok=True)
    if args.out:
        out_path = Path(args.out)
    else:
        ts = time.strftime("%Y-%m-%d_%H%M", time.gmtime())
        out_path = out_dir / f"EXHAUSTIVE_PROFILE_AUDIT_{ts}.md"

    _write_report(out_path, person_records, company_records, started)

    # Also dump the raw records as JSON next to the markdown for further
    # analysis without re-running.
    raw_path = out_path.with_suffix(".json")
    raw_path.write_text(json.dumps({
        "started_at": started,
        "people": person_records,
        "companies": company_records,
    }, indent=2), encoding="utf-8")
    print(f"Wrote: {raw_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
