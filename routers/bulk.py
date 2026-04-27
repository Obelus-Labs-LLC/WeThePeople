"""Bulk-data and CSV-export endpoints.

Two responsibilities:

  1. /export/{table}.csv — stream a single table as CSV, optionally
     filtered (sector, year, etc.). Designed for researchers, journalists,
     and academics who want a single dataset without writing SQL.

  2. /bulk/snapshot — point to the latest nightly compressed SQLite dump
     produced by `jobs/dump_public_snapshot.py`. We don't serve the
     multi-GB blob through FastAPI; the snapshot lives at a static path
     served by nginx (or the same uvicorn) directly so the API process
     isn't tied up streaming gigabytes per request.

Auth model:
  - CSV exports are public, rate-limited at the global slowapi level
    (60/min). Per-table caps below prevent runaway 1M-row downloads
    inside a single request.
  - The snapshot redirect endpoint is also public (the file itself is a
    redistribution of public-domain government data under AGPL).
"""

from __future__ import annotations

import csv
import io
import os
from typing import Iterator, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse, StreamingResponse
from sqlalchemy import text

from models.database import SessionLocal


router = APIRouter(prefix="/export", tags=["bulk"])


# Per-table whitelist. Keys map a stable URL slug to the underlying
# SQLite table and the columns we want to expose. We deliberately don't
# echo `SELECT *` because internal columns (raw API blobs, ingestion
# debug fields) leak shape we'd rather not commit to as a public contract.
_EXPORT_TABLES = {
    "stories": {
        "table": "stories",
        "columns": [
            "id", "slug", "title", "summary", "category", "sector",
            "status", "published_at", "updated_at", "verification_tier",
            "verification_score",
        ],
        "where": "status = 'published'",
        "order_by": "published_at DESC",
        "max_rows": 5000,
    },
    "lobbying": {
        # Union of all sector lobbying tables. Built lazily below since
        # SQLite doesn't union views with different column orderings.
        "tables_union": [
            "lobbying_records", "health_lobbying_records",
            "energy_lobbying_records", "transportation_lobbying_records",
            "defense_lobbying_records", "chemical_lobbying_records",
            "agriculture_lobbying_records", "telecom_lobbying_records",
            "education_lobbying_records",
        ],
        "columns": [
            "company_id", "client_name", "registrant_name",
            "filing_year", "filing_period", "income", "expenses",
            "filing_uuid",
        ],
        "max_rows": 50000,
    },
    "congressional_trades": {
        "table": "congressional_trades",
        "columns": [
            "id", "person_id", "transaction_date", "ticker", "asset_description",
            "transaction_type", "amount_min", "amount_max",
        ],
        "order_by": "transaction_date DESC",
        "max_rows": 25000,
    },
    "company_donations": {
        "table": "company_donations",
        "columns": [
            "id", "company_id", "recipient_name", "recipient_party",
            "amount", "election_year", "transaction_date",
        ],
        "order_by": "transaction_date DESC",
        "max_rows": 50000,
    },
    "tracked_members": {
        "table": "tracked_members",
        "columns": [
            "person_id", "full_name", "party", "state", "chamber",
            "bioguide_id", "term_start", "term_end",
        ],
        "max_rows": 1000,
    },
}


def _build_query(spec: dict, sector: Optional[str], year: Optional[int]) -> tuple[str, dict]:
    """Compose the SELECT for a given export spec, applying filters.

    Returns (sql_string, params_dict). The caller is responsible for
    streaming the result; we don't materialise the row set.
    """
    cols = ", ".join(spec["columns"])
    where_parts: list[str] = []
    params: dict = {}

    if "where" in spec:
        where_parts.append(spec["where"])
    if sector:
        where_parts.append("sector = :sector")
        params["sector"] = sector
    if year is not None:
        # Different tables call the year column different things; we
        # only filter when the column is in the export's column list.
        if "filing_year" in spec["columns"]:
            where_parts.append("filing_year = :year")
            params["year"] = year
        elif "election_year" in spec["columns"]:
            where_parts.append("election_year = :year")
            params["year"] = year

    where_sql = (" WHERE " + " AND ".join(where_parts)) if where_parts else ""

    if "tables_union" in spec:
        # UNION ALL across sector tables, with the same projection.
        sub = " UNION ALL ".join(
            f"SELECT {cols} FROM {t}{where_sql}" for t in spec["tables_union"]
        )
        sql = f"SELECT * FROM ({sub}) LIMIT :__limit"
    else:
        order = f" ORDER BY {spec['order_by']}" if spec.get("order_by") else ""
        sql = f"SELECT {cols} FROM {spec['table']}{where_sql}{order} LIMIT :__limit"

    params["__limit"] = spec["max_rows"]
    return sql, params


def _stream_csv(sql: str, params: dict, columns: list[str]) -> Iterator[bytes]:
    """Yield CSV rows as bytes. Each row is one network write; the row
    encoder is reused so we don't allocate a new StringIO per row."""
    db = SessionLocal()
    try:
        # Header first.
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(columns)
        yield buf.getvalue().encode("utf-8")
        buf.seek(0)
        buf.truncate(0)

        # Rows. Use server-side iteration so a 50K-row dump doesn't
        # bloom in memory before the client gets the first byte.
        result = db.execute(text(sql), params)
        for row in result:
            writer.writerow(row)
            yield buf.getvalue().encode("utf-8")
            buf.seek(0)
            buf.truncate(0)
    finally:
        db.close()


@router.get("/{table}.csv")
def export_csv(
    table: str,
    sector: Optional[str] = Query(None, description="Filter by sector (where applicable)"),
    year: Optional[int] = Query(None, ge=1990, le=2100, description="Filter by year"),
):
    """Stream a single table as CSV. Hard row cap per table to keep
    response time bounded — researchers wanting the full corpus should
    use the bulk SQLite snapshot instead."""
    spec = _EXPORT_TABLES.get(table)
    if spec is None:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown export table '{table}'. Available: {sorted(_EXPORT_TABLES)}",
        )
    sql, params = _build_query(spec, sector=sector, year=year)
    headers = {
        "Content-Disposition": f'attachment; filename="wtp-{table}.csv"',
        "X-WTP-Row-Cap": str(spec["max_rows"]),
        # HTTP headers must be latin-1 — keep this ASCII-only.
        "X-WTP-Source": "https://wethepeopleforus.com - AGPL-3.0; data is public-domain US government records",
    }
    return StreamingResponse(
        _stream_csv(sql, params, spec["columns"]),
        media_type="text/csv; charset=utf-8",
        headers=headers,
    )


@router.get("/_index")
def export_index():
    """Machine-readable list of every export available, with row caps
    and supported filters. Pair with /docs for human use."""
    out = []
    for slug, spec in _EXPORT_TABLES.items():
        out.append({
            "table": slug,
            "url": f"/export/{slug}.csv",
            "columns": spec["columns"],
            "max_rows": spec["max_rows"],
            "supports_sector_filter": "sector" in spec.get("columns", []),
            "supports_year_filter": (
                "filing_year" in spec.get("columns", [])
                or "election_year" in spec.get("columns", [])
            ),
        })
    return {"exports": out}


# ---------------------------------------------------------------------------
# Bulk SQLite snapshot pointer
# ---------------------------------------------------------------------------

bulk_router = APIRouter(prefix="/bulk", tags=["bulk"])


@bulk_router.get("/snapshot")
def bulk_snapshot():
    """Redirect to the most-recent nightly SQLite snapshot.

    The actual file lives at a static URL served outside FastAPI (nginx
    on the API host, or an object-storage bucket). The env var
    ``WTP_BULK_SNAPSHOT_URL`` points to it. Manifest is fetched from
    ``WTP_BULK_MANIFEST_URL`` and exposes the latest filename + size +
    sha256 so consumers can verify and cache.
    """
    snapshot_url = os.getenv("WTP_BULK_SNAPSHOT_URL", "")
    if not snapshot_url:
        raise HTTPException(
            status_code=503,
            detail=(
                "Bulk snapshot not yet configured on this deployment. "
                "Per-table CSV exports remain available at /export/{table}.csv."
            ),
        )
    return RedirectResponse(url=snapshot_url, status_code=302)


@bulk_router.get("/manifest")
def bulk_manifest():
    """Return the nightly snapshot manifest (size, checksum, generated_at).

    Lives separate from the redirect so consumers can poll cheaply
    without triggering a multi-GB transfer.
    """
    manifest_url = os.getenv("WTP_BULK_MANIFEST_URL", "")
    if manifest_url:
        return RedirectResponse(url=manifest_url, status_code=302)
    # Local fallback: read the manifest file the cron writes.
    manifest_path = os.getenv(
        "WTP_BULK_MANIFEST_PATH",
        "/var/www/wtp-bulk/manifest.json",
    )
    if not os.path.exists(manifest_path):
        raise HTTPException(
            status_code=503,
            detail="Bulk manifest not yet generated. Run jobs/dump_public_snapshot.py first.",
        )
    import json
    with open(manifest_path, "r", encoding="utf-8") as f:
        return json.load(f)
