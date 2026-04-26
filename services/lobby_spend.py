"""
LDA lobbying-spend aggregation, applied correctly.

Background — why this module exists
-----------------------------------
Senate LDA filings come in two LD-2 forms that BOTH appear in our
``*_lobbying_records`` tables:

    1. *Outside-firm* filings:  the lobbying firm reports `income` (fees
       it received from a client). The client is named via `client_name`.
       `expenses` is 0/NULL on these rows.

    2. *In-house* filings:  the company itself registers and reports
       `expenses` — its TOTAL lobbying outlay for the period, INCLUDING
       fees paid to any outside firms it hired. `income` is 0/NULL.

Earlier code summed them together via ``COALESCE(income,0)+COALESCE(expenses,0)``.
That double-counts every dollar a company paid to an outside firm: the
firm reports it as `income`, AND the company already counted it in
`expenses`. For Qualcomm 2022 the bug produced $17.14M — but OpenSecrets,
the Senate Office of Public Records, and CRS all report ~$9.3M for the
same year, which is the in-house `expenses` figure alone.

Convention applied
------------------
For a given (company, year), if any in-house filings exist we use
``SUM(expenses)`` for that year; otherwise we fall back to
``SUM(income)``. Across multiple years we sum the per-year totals.

This matches the OpenSecrets "Annual Lobbying" methodology and avoids
the double-count without losing data when only outside-firm filings
exist for a given period.

Public API
----------
- ``lobby_spend_sql(table)``                — returns the SQL ``SELECT``
  expression for total spend by company across all years.
- ``lobby_spend_for_company_year(db, ...)`` — convenience scalar.
- ``compute_lobby_spend(db, ...)``          — Python helper for the
  same calculation, useful inside aggregation pipelines that don't
  want to hand-write SQL.
"""

from __future__ import annotations

from typing import Iterable, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session


def lobby_spend_sql(table: str, id_col: str = "company_id") -> str:
    """Return a SQL fragment computing per-(company, year) lobby spend
    using the prefer-expenses convention, summed across years.

    Used by callers that want a single scalar for a single entity:

        sql = f'''
            SELECT COALESCE(SUM(yearly_spend), 0)
            FROM (
                {lobby_spend_sql("tech_lobbying_records")}
            )
            WHERE {id_col} = :eid
        '''

    Returns a parenthesisable SELECT that yields columns
    ``({id_col}, filing_year, yearly_spend)``.
    """
    # Use a CASE on whether any expenses>0 row exists for that
    # (entity, year). When an in-house filing reports `expenses`, that
    # already includes fees to outside firms, so taking SUM(expenses)
    # is the canonical total. Only when there is no in-house filing do
    # we fall back to SUM(income) so we don't lose entities that only
    # have outside-firm filings on record.
    return (
        f"SELECT {id_col}, filing_year, "
        f"CASE WHEN SUM(COALESCE(expenses, 0)) > 0 "
        f"THEN SUM(COALESCE(expenses, 0)) "
        f"ELSE SUM(COALESCE(income, 0)) END AS yearly_spend "
        f"FROM {table} "
        f"GROUP BY {id_col}, filing_year"
    )


def lobby_spend_total_sql(table: str, id_col: str = "company_id") -> str:
    """Single-scalar SQL: pass an ``:eid`` parameter, get total spend.

    Example::

        db.execute(
            text(lobby_spend_total_sql("tech_lobbying_records")),
            {"eid": company_id},
        ).scalar()
    """
    return (
        f"SELECT COALESCE(SUM(yearly_spend), 0) "
        f"FROM ({lobby_spend_sql(table, id_col)}) yearly "
        f"WHERE {id_col} = :eid"
    )


def lobby_spend_total_for_year_sql(table: str, id_col: str = "company_id") -> str:
    """Single-scalar SQL parameterised by ``:eid`` and ``:year``."""
    return (
        f"SELECT CASE WHEN SUM(COALESCE(expenses, 0)) > 0 "
        f"THEN SUM(COALESCE(expenses, 0)) "
        f"ELSE SUM(COALESCE(income, 0)) END "
        f"FROM {table} "
        f"WHERE {id_col} = :eid AND filing_year = :year"
    )


def compute_lobby_spend(
    db: Session,
    table: str,
    entity_id: str,
    *,
    id_col: str = "company_id",
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
) -> float:
    """Python convenience wrapper — returns the total lobby spend for
    a single entity, optionally bounded by year range, using the
    prefer-expenses convention.
    """
    where = [f"{id_col} = :eid"]
    params: dict = {"eid": entity_id}
    if year_from is not None:
        where.append("filing_year >= :year_from")
        params["year_from"] = year_from
    if year_to is not None:
        where.append("filing_year <= :year_to")
        params["year_to"] = year_to
    where_sql = " AND ".join(where)
    sql = (
        f"SELECT COALESCE(SUM(yearly_spend), 0) "
        f"FROM ("
        f"  SELECT filing_year, "
        f"  CASE WHEN SUM(COALESCE(expenses, 0)) > 0 "
        f"  THEN SUM(COALESCE(expenses, 0)) "
        f"  ELSE SUM(COALESCE(income, 0)) END AS yearly_spend "
        f"  FROM {table} "
        f"  WHERE {where_sql} "
        f"  GROUP BY filing_year"
        f") yearly"
    )
    val = db.execute(text(sql), params).scalar()
    return float(val or 0)


def compute_lobby_spend_aggregate_sector(
    db: Session,
    table: str,
    *,
    id_col: str = "company_id",
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    where_extra: Optional[str] = None,
    extra_params: Optional[dict] = None,
) -> float:
    """Sum lobby spend across every company in the sector (table-wide).

    Uses the same prefer-expenses convention but groups by both
    ``id_col`` and ``filing_year`` so each (entity, year) pair gets the
    right number before being summed.
    """
    where = ["1=1"]
    params: dict = dict(extra_params or {})
    if year_from is not None:
        where.append("filing_year >= :year_from")
        params["year_from"] = year_from
    if year_to is not None:
        where.append("filing_year <= :year_to")
        params["year_to"] = year_to
    if where_extra:
        where.append(where_extra)
    where_sql = " AND ".join(where)
    sql = (
        f"SELECT COALESCE(SUM(yearly_spend), 0) "
        f"FROM ("
        f"  SELECT {id_col}, filing_year, "
        f"  CASE WHEN SUM(COALESCE(expenses, 0)) > 0 "
        f"  THEN SUM(COALESCE(expenses, 0)) "
        f"  ELSE SUM(COALESCE(income, 0)) END AS yearly_spend "
        f"  FROM {table} "
        f"  WHERE {where_sql} "
        f"  GROUP BY {id_col}, filing_year"
        f") yearly"
    )
    val = db.execute(text(sql), params).scalar()
    return float(val or 0)


def python_filing_amount(
    income: Optional[float], expenses: Optional[float]
) -> float:
    """Per-row dollar value for a single LDA filing.

    - In-house filing (expenses > 0): use expenses.
    - Outside-firm filing (income > 0): use income.
    - Both populated (data anomaly): prefer expenses, since that's the
      total-of-record per LDA convention.
    """
    e = float(expenses or 0)
    i = float(income or 0)
    if e > 0:
        return e
    return i


def python_aggregate_filings(rows: Iterable) -> float:
    """Aggregate a Python iterable of filing-like rows by the
    prefer-expenses-per-year convention.

    Each row must expose ``income``, ``expenses``, and ``filing_year``.
    """
    by_year: dict = {}
    for r in rows:
        year = getattr(r, "filing_year", None)
        if year is None:
            continue
        bucket = by_year.setdefault(year, {"in_house": 0.0, "outside": 0.0})
        e = float(getattr(r, "expenses", 0) or 0)
        i = float(getattr(r, "income", 0) or 0)
        if e > 0:
            bucket["in_house"] += e
        elif i > 0:
            bucket["outside"] += i
    total = 0.0
    for bucket in by_year.values():
        # If any in-house filings landed for this year, the in-house total
        # is canonical — outside-firm income would double-count.
        total += bucket["in_house"] if bucket["in_house"] > 0 else bucket["outside"]
    return total
