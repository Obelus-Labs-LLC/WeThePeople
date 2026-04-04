"""Data anomaly scanner - finds empty companies, missing votes, disconnected politicians."""
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
db_path = ROOT / "wethepeople.db"
if not db_path.exists():
    db_path = Path("/home/dshon/wethepeople-backend/wethepeople.db")

conn = sqlite3.connect(str(db_path))

print("=== DATA ANOMALY SCAN ===\n")

sectors = [
    ("finance", "tracked_institutions", "institution_id", "finance_lobbying_records", "finance_government_contracts", "finance_enforcement_actions"),
    ("health", "tracked_companies", "company_id", "health_lobbying_records", "health_government_contracts", "health_enforcement_actions"),
    ("tech", "tracked_tech_companies", "company_id", "lobbying_records", "government_contracts", "ftc_enforcement_actions"),
    ("energy", "tracked_energy_companies", "company_id", "energy_lobbying_records", "energy_government_contracts", "energy_enforcement_actions"),
    ("transport", "tracked_transportation_companies", "company_id", "transportation_lobbying_records", "transportation_government_contracts", "transportation_enforcement_actions"),
    ("defense", "tracked_defense_companies", "company_id", "defense_lobbying_records", "defense_government_contracts", "defense_enforcement_actions"),
    ("chemicals", "tracked_chemical_companies", "company_id", "chemical_lobbying_records", "chemical_government_contracts", "chemical_enforcement_actions"),
    ("agriculture", "tracked_agriculture_companies", "company_id", "agriculture_lobbying_records", "agriculture_government_contracts", "agriculture_enforcement_actions"),
]

print("--- EMPTY COMPANIES (zero lobbying + contracts + enforcement) ---")
total_empty = 0
for name, et, idc, lt, ct, enf in sectors:
    empty = conn.execute(
        f"SELECT e.{idc}, e.display_name FROM {et} e "
        f"WHERE NOT EXISTS (SELECT 1 FROM {lt} l WHERE l.{idc} = e.{idc}) "
        f"AND NOT EXISTS (SELECT 1 FROM {ct} c WHERE c.{idc} = e.{idc}) "
        f"AND NOT EXISTS (SELECT 1 FROM {enf} en WHERE en.{idc} = e.{idc})"
    ).fetchall()
    total_empty += len(empty)
    if empty:
        names = [e[0] for e in empty[:5]]
        more = f" +{len(empty)-5} more" if len(empty) > 5 else ""
        print(f"  {name}: {len(empty)} empty - {', '.join(names)}{more}")

print(f"  TOTAL EMPTY: {total_empty}")

print("\n--- POLITICIANS WITH 0 VOTES ---")
no_votes = conn.execute(
    "SELECT tm.person_id, tm.display_name, tm.chamber "
    "FROM tracked_members tm "
    "WHERE tm.is_active = 1 "
    "AND NOT EXISTS (SELECT 1 FROM member_votes mv WHERE mv.person_id = tm.person_id) "
    "ORDER BY tm.chamber, tm.display_name"
).fetchall()
active_total = conn.execute("SELECT COUNT(*) FROM tracked_members WHERE is_active=1").fetchone()[0]
print(f"  {len(no_votes)} of {active_total} active members have 0 votes")
for p in no_votes[:8]:
    print(f"    {p[0]} ({p[2]})")
if len(no_votes) > 8:
    print(f"    ... +{len(no_votes)-8} more")

print("\n--- POLITICIANS WITH NO TRADES AND NO DONATIONS ---")
disconnected = conn.execute(
    "SELECT tm.person_id, tm.display_name, tm.chamber "
    "FROM tracked_members tm "
    "WHERE tm.is_active = 1 "
    "AND NOT EXISTS (SELECT 1 FROM congressional_trades ct WHERE ct.person_id = tm.person_id) "
    "AND NOT EXISTS (SELECT 1 FROM company_donations cd WHERE cd.person_id = tm.person_id) "
    "ORDER BY tm.display_name"
).fetchall()
print(f"  {len(disconnected)} of {active_total} have no trades AND no donations")

print("\n--- STORIES ---")
total_stories = conn.execute("SELECT COUNT(*) FROM stories").fetchone()[0]
published = conn.execute("SELECT COUNT(*) FROM stories WHERE status='published'").fetchone()[0]
empty_body = conn.execute("SELECT COUNT(*) FROM stories WHERE body IS NULL OR body = ''").fetchone()[0]
print(f"  Total: {total_stories}, Published: {published}, Empty body: {empty_body}")

print("\n--- ANOMALIES ---")
anomalies = conn.execute("SELECT COUNT(*) FROM anomalies").fetchone()[0]
print(f"  Total: {anomalies}")

print("\n--- FARA ---")
reg = conn.execute("SELECT COUNT(*) FROM fara_registrants").fetchone()[0]
fp = conn.execute("SELECT COUNT(*) FROM fara_foreign_principals").fetchone()[0]
sf = conn.execute("SELECT COUNT(*) FROM fara_short_forms").fetchone()[0]
print(f"  Registrants: {reg}, Foreign Principals: {fp}, Short Forms: {sf}")

conn.close()
