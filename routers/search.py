"""
Global search endpoint — searches across politicians, companies (all sectors).
"""

import logging
import re as _re

from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_, text as _sa_text

logger = logging.getLogger(__name__)

from models.database import get_db, TrackedMember
from models.finance_models import TrackedInstitution
from models.health_models import TrackedCompany
from models.tech_models import TrackedTechCompany
from models.energy_models import TrackedEnergyCompany
from models.transportation_models import TrackedTransportationCompany
from models.defense_models import TrackedDefenseCompany
from models.chemicals_models import TrackedChemicalCompany
from models.agriculture_models import TrackedAgricultureCompany
from models.education_models import TrackedEducationCompany
from models.telecom_models import TrackedTelecomCompany
from models.response_schemas import SearchResponse
from utils.sanitize import escape_like

import threading
import time as _time

router = APIRouter(prefix="/search", tags=["search"])

# Global search runs 23 ILIKE queries (politicians + 11 sector tables × 2
# columns). Cache by query for 60 seconds to absorb autocomplete spam and
# repeat-search noise.
_search_cache: dict = {}
_search_lock = threading.Lock()
_SEARCH_TTL = 60  # seconds

# Map FTS5 entity rows back to the SQLAlchemy tracked-* model + ID column
# used by the legacy /search shape. Order matters only because we want to
# pick the same sector identifier as the legacy code path. Sector names
# match the values written by jobs/rebuild_search_index.py.
_COMPANY_MODEL_BY_SECTOR = {
    "finance": (TrackedInstitution, "institution_id"),
    "health": (TrackedCompany, "company_id"),
    "tech": (TrackedTechCompany, "company_id"),
    # Frontend route map keys "tech" as "technology"; keep the FE-facing
    # sector token the legacy code returned.
    "technology": (TrackedTechCompany, "company_id"),
    "energy": (TrackedEnergyCompany, "company_id"),
    "transportation": (TrackedTransportationCompany, "company_id"),
    "defense": (TrackedDefenseCompany, "company_id"),
    "chemicals": (TrackedChemicalCompany, "company_id"),
    "agriculture": (TrackedAgricultureCompany, "company_id"),
    "telecom": (TrackedTelecomCompany, "company_id"),
    "education": (TrackedEducationCompany, "company_id"),
}


def _build_fts_match(q: str) -> str | None:
    """Convert a user query to an FTS5 MATCH expression with prefix
    suffixes on every token. Strips FTS metacharacters so user input
    can't break the MATCH parser. Returns None if the query has no
    usable tokens (e.g. all special chars)."""
    cleaned = _re.sub(r"[^a-zA-Z0-9\s]", " ", q).strip()
    tokens = [t for t in cleaned.split() if len(t) >= 2]
    if not tokens:
        return None
    return " ".join(t + "*" for t in tokens)


def _try_fts_search(db: Session, q: str) -> dict | None:
    """Fast-path FTS5 lookup. Returns the full /search response shape on
    success, None when the FTS index is missing / errored (caller falls
    through to the legacy ILIKE path)."""
    match_expr = _build_fts_match(q)
    if match_expr is None:
        return None
    try:
        # Over-fetch then filter so we still have headroom after the
        # politician + company split; the legacy endpoint returns at
        # most 5 of each.
        rows = db.execute(
            _sa_text(
                "SELECT entity_type, entity_id, sector, rank "
                "FROM entity_search "
                "WHERE entity_search MATCH :q AND entity_type IN ('politician','company') "
                "ORDER BY rank LIMIT 50"
            ),
            {"q": match_expr},
        ).fetchall()
    except Exception as exc:
        # FTS table missing (fresh deploy before rebuild_search_index ran)
        # or invalid MATCH expression — fall back to the slow path.
        logger.debug("FTS5 fast-path unavailable: %s", exc)
        return None

    politician_ids: list[str] = []
    company_rows: list[tuple[str, str]] = []  # (entity_id, sector)
    for r in rows:
        et = r[0]
        eid = r[1]
        sector = (r[2] or "").lower()
        if et == "politician":
            if len(politician_ids) < 5:
                politician_ids.append(eid)
        elif et == "company":
            if len(company_rows) < 5 * len(_COMPANY_MODEL_BY_SECTOR):
                company_rows.append((eid, sector))

    politicians: list[dict] = []
    if politician_ids:
        members = (
            db.query(TrackedMember)
            .filter(TrackedMember.person_id.in_(politician_ids))
            .all()
        )
        # Preserve the FTS rank ordering rather than DB key order.
        order = {pid: i for i, pid in enumerate(politician_ids)}
        members.sort(key=lambda m: order.get(m.person_id, 1_000_000))
        for m in members:
            politicians.append({
                "person_id": m.person_id,
                "name": m.display_name,
                "state": m.state,
                "party": m.party,
                "chamber": m.chamber,
                "photo_url": m.photo_url,
            })

    companies: list[dict] = []
    if company_rows:
        # Bucket by sector so we can issue one query per tracked-* table
        # instead of N+1 lookups.
        by_sector: dict[str, list[str]] = {}
        for eid, sector in company_rows:
            by_sector.setdefault(sector, []).append(eid)

        # Preserve overall rank ordering across sectors.
        rank_order = {(eid, sector): i for i, (eid, sector) in enumerate(company_rows)}
        unsorted: list[tuple[int, dict]] = []

        for sector, eids in by_sector.items():
            mapping = _COMPANY_MODEL_BY_SECTOR.get(sector)
            if mapping is None:
                continue
            model, id_col_name = mapping
            id_col = getattr(model, id_col_name)
            rows_for_sector = (
                db.query(model).filter(id_col.in_(eids)).all()
            )
            for co in rows_for_sector:
                eid_val = getattr(co, id_col_name)
                rank = rank_order.get((eid_val, sector), 1_000_000)
                # Normalize sector token for the FE route map (the FE
                # uses "tech" → /technology). Pass the FTS-row sector
                # through unchanged; the FE has both keys mapped.
                unsorted.append((rank, {
                    "entity_id": eid_val,
                    "name": co.display_name,
                    "ticker": getattr(co, "ticker", None),
                    "sector": sector,
                }))
            if len(unsorted) >= 10:
                # Stop early — politicians + 5 companies is the legacy cap.
                pass
        unsorted.sort(key=lambda x: x[0])
        companies = [item for _, item in unsorted[:5]]

    # Sanitize query in response to prevent XSS if rendered as HTML.
    import html as _html
    return {
        "politicians": politicians,
        "companies": companies,
        "query": _html.escape(q),
    }


@router.get("", response_model=SearchResponse)
def global_search(
    q: str = Query(
        ...,
        # 2-char minimum: "%a%" against 23 unindexed tables effectively
        # returns most rows of the largest sector and was a trivial DoS
        # vector. 2 chars cuts the candidate set dramatically while still
        # supporting state-code and short-name searches.
        min_length=2,
        max_length=200,
    ),
    db: Session = Depends(get_db),
):
    """Search across politicians and companies in all sectors. Cached 60s.

    Fast path: query the `entity_search` FTS5 virtual table populated
    hourly by jobs/rebuild_search_index.py, then enrich the matched IDs
    by hydrating the corresponding tracked-* rows. FTS5 gives us prefix
    matching ("mcco*" finds "McConnell") and ranks by relevance, both of
    which the legacy ILIKE substring scan can't do.

    Slow path: 11 sector tables ILIKE'd one column at a time. Used as a
    fallback when the FTS index is unavailable (fresh deploy before the
    rebuild_search_index hourly job runs) or when the fast query
    returns zero rows (so a niche substring match the FTS index missed
    still surfaces something for the user).
    """
    logger.info("Global search: q=%r", q)
    cache_key = q.strip().lower()
    now = _time.time()
    with _search_lock:
        cached = _search_cache.get(cache_key)
        if cached and (now - cached["ts"]) < _SEARCH_TTL:
            return cached["data"]

    # ── Fast path: FTS5 lookup on the entity_search index. ──
    fast_response = _try_fts_search(db, q)
    if fast_response is not None and (fast_response["politicians"] or fast_response["companies"]):
        with _search_lock:
            _search_cache[cache_key] = {"ts": _time.time(), "data": fast_response}
        return fast_response

    # ── Slow path: legacy ILIKE scan across every sector table. ──
    # Escape LIKE wildcards so user input like '%' or '_' doesn't match everything
    pattern = f"%{escape_like(q)}%"

    # Politicians — TrackedMember
    politicians_raw = (
        db.query(TrackedMember)
        .filter(
            or_(
                TrackedMember.display_name.ilike(pattern, escape="\\"),
                TrackedMember.state.ilike(pattern, escape="\\"),
                TrackedMember.bioguide_id.ilike(pattern, escape="\\"),
                TrackedMember.person_id.ilike(pattern, escape="\\"),
            )
        )
        .limit(5)
        .all()
    )
    politicians = [
        {
            "person_id": m.person_id,
            "name": m.display_name,
            "state": m.state,
            "party": m.party,
            "chamber": m.chamber,
            "photo_url": m.photo_url,
        }
        for m in politicians_raw
    ]

    # Companies — merge all four sectors
    companies = []

    # Finance
    for inst in (
        db.query(TrackedInstitution)
        .filter(or_(TrackedInstitution.display_name.ilike(pattern, escape="\\"), TrackedInstitution.ticker.ilike(pattern, escape="\\")))
        .limit(5)
        .all()
    ):
        companies.append({
            "entity_id": inst.institution_id,
            "name": inst.display_name,
            "ticker": inst.ticker,
            "sector": "finance",
        })

    # Health
    for co in (
        db.query(TrackedCompany)
        .filter(or_(TrackedCompany.display_name.ilike(pattern, escape="\\"), TrackedCompany.ticker.ilike(pattern, escape="\\")))
        .limit(5)
        .all()
    ):
        companies.append({
            "entity_id": co.company_id,
            "name": co.display_name,
            "ticker": co.ticker,
            "sector": "health",
        })

    # Tech
    for co in (
        db.query(TrackedTechCompany)
        .filter(or_(TrackedTechCompany.display_name.ilike(pattern, escape="\\"), TrackedTechCompany.ticker.ilike(pattern, escape="\\")))
        .limit(5)
        .all()
    ):
        companies.append({
            "entity_id": co.company_id,
            "name": co.display_name,
            "ticker": co.ticker,
            "sector": "tech",
        })

    # Energy
    for co in (
        db.query(TrackedEnergyCompany)
        .filter(or_(TrackedEnergyCompany.display_name.ilike(pattern, escape="\\"), TrackedEnergyCompany.ticker.ilike(pattern, escape="\\")))
        .limit(5)
        .all()
    ):
        companies.append({
            "entity_id": co.company_id,
            "name": co.display_name,
            "ticker": co.ticker,
            "sector": "energy",
        })

    # Transportation
    for co in (
        db.query(TrackedTransportationCompany)
        .filter(or_(TrackedTransportationCompany.display_name.ilike(pattern, escape="\\"), TrackedTransportationCompany.ticker.ilike(pattern, escape="\\")))
        .limit(5)
        .all()
    ):
        companies.append({
            "entity_id": co.company_id,
            "name": co.display_name,
            "ticker": co.ticker,
            "sector": "transportation",
        })

    # Defense
    for co in (
        db.query(TrackedDefenseCompany)
        .filter(or_(TrackedDefenseCompany.display_name.ilike(pattern, escape="\\"), TrackedDefenseCompany.ticker.ilike(pattern, escape="\\")))
        .limit(5)
        .all()
    ):
        companies.append({
            "entity_id": co.company_id,
            "name": co.display_name,
            "ticker": co.ticker,
            "sector": "defense",
        })

    # Chemicals
    for co in (
        db.query(TrackedChemicalCompany)
        .filter(or_(TrackedChemicalCompany.display_name.ilike(pattern, escape="\\"), TrackedChemicalCompany.ticker.ilike(pattern, escape="\\")))
        .limit(5)
        .all()
    ):
        companies.append({
            "entity_id": co.company_id,
            "name": co.display_name,
            "ticker": co.ticker,
            "sector": "chemicals",
        })

    # Agriculture
    for co in (
        db.query(TrackedAgricultureCompany)
        .filter(or_(TrackedAgricultureCompany.display_name.ilike(pattern, escape="\\"), TrackedAgricultureCompany.ticker.ilike(pattern, escape="\\")))
        .limit(5)
        .all()
    ):
        companies.append({
            "entity_id": co.company_id,
            "name": co.display_name,
            "ticker": co.ticker,
            "sector": "agriculture",
        })

    # Education
    for co in (
        db.query(TrackedEducationCompany)
        .filter(or_(TrackedEducationCompany.display_name.ilike(pattern, escape="\\"), TrackedEducationCompany.ticker.ilike(pattern, escape="\\")))
        .limit(5)
        .all()
    ):
        companies.append({
            "entity_id": co.company_id,
            "name": co.display_name,
            "ticker": co.ticker,
            "sector": "education",
        })

    # Telecom
    for co in (
        db.query(TrackedTelecomCompany)
        .filter(or_(TrackedTelecomCompany.display_name.ilike(pattern, escape="\\"), TrackedTelecomCompany.ticker.ilike(pattern, escape="\\")))
        .limit(5)
        .all()
    ):
        companies.append({
            "entity_id": co.company_id,
            "name": co.display_name,
            "ticker": co.ticker,
            "sector": "telecom",
        })

    # Sanitize query in response to prevent XSS if rendered as HTML
    import html as _html
    safe_q = _html.escape(q)

    response = {
        "politicians": politicians,
        "companies": companies,
        "query": safe_q,
    }
    with _search_lock:
        _search_cache[cache_key] = {"ts": _time.time(), "data": response}
    return response


# ── Fast FTS5 cross-entity search ────────────────────────────────────

@router.get("/fast")
def fast_search(
    q: str = Query(..., min_length=2, max_length=200),
    types: str = Query(
        "politician,company,bill,story,state_legislator",
        description="Comma-separated entity_type filter",
    ),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Single-query cross-entity search backed by SQLite FTS5.

    Replaces the 11-table ILIKE scan with a MATCH against the
    `entity_search` virtual table populated hourly by
    jobs/rebuild_search_index.py. Typical response time: <50ms
    cold, <5ms warm, vs the legacy global search at ~1-3 seconds.

    Query syntax: FTS5 `MATCH` is more powerful than ILIKE; we
    sanitize the user input by stripping anything that isn't an
    alphanumeric or whitespace, then add a `*` suffix on each
    token so prefix matches work ("mcco" → "mcco*" matches
    "mcconnell"). The user types natural words; the endpoint
    handles the rest.
    """
    from sqlalchemy import text
    import re as _re
    import html as _html

    # Sanitize: drop FTS metacharacters (- + " * : etc.) so user
    # input can't break the MATCH expression. Then split on
    # whitespace and add `*` for prefix matching.
    cleaned = _re.sub(r"[^a-zA-Z0-9\s]", " ", q).strip()
    tokens = [t for t in cleaned.split() if len(t) >= 2]
    if not tokens:
        return {"query": _html.escape(q), "results": []}
    match_expr = " ".join(t + "*" for t in tokens)

    type_set = {
        s.strip().lower() for s in types.split(",") if s.strip()
    } or {"politician", "company", "bill", "story", "state_legislator"}

    # FTS5 returns a synthetic `rank` column when ORDER BY rank is
    # used. Lower rank = better match.
    try:
        rows = db.execute(
            text(
                "SELECT entity_type, entity_id, title, body, sector, url, rank "
                "FROM entity_search WHERE entity_search MATCH :q "
                "ORDER BY rank LIMIT :limit"
            ),
            {"q": match_expr, "limit": limit * 4},  # over-fetch then filter
        ).fetchall()
    except Exception as exc:
        # FTS table may not exist yet (migration not applied) —
        # gracefully degrade to an empty result so the UI doesn't
        # explode while the index is being set up.
        return {
            "query": _html.escape(q),
            "results": [],
            "warning": f"search index unavailable: {exc.__class__.__name__}",
        }

    out = []
    for r in rows:
        if r[0] not in type_set:
            continue
        out.append({
            "entity_type": r[0],
            "entity_id": r[1],
            "title": r[2],
            "snippet": (r[3] or "")[:160],
            "sector": r[4],
            "url": r[5],
        })
        if len(out) >= limit:
            break

    return {"query": _html.escape(q), "results": out}
