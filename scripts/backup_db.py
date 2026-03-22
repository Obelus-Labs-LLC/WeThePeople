#!/usr/bin/env python3
"""
Database Backup with Integrity Check

Creates timestamped copies of the SQLite database with:
  - PRAGMA integrity_check
  - Row count sanity checks (alerts if counts drop)
  - Automatic rotation (keeps last N backups)
  - JSON health report

Usage:
    python scripts/backup_db.py                     # Default: backup wethepeople.db, keep 7 days
    python scripts/backup_db.py --keep 14           # Keep 14 backups
    python scripts/backup_db.py --db /path/to.db    # Custom DB path

Cron example (every 6 hours):
    0 */6 * * * cd /home/user/wethepeople-backend && .venv/bin/python scripts/backup_db.py >> logs/backup.log 2>&1
"""

import argparse
import json
import os
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

# Add project root to path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

BACKUP_DIR = ROOT / "backups"
HEALTH_FILE = BACKUP_DIR / "backup_health.json"

# Minimum expected row counts — alert if below these
MIN_COUNTS = {
    "tracked_members": 530,
    "member_bills_groundtruth": 1_000,
    "bills": 35_000,
}


def run_backup(db_path: str, keep: int = 7):
    db_path = Path(db_path)
    if not db_path.exists():
        print(f"[ERROR] Database not found: {db_path}")
        return False

    BACKUP_DIR.mkdir(exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"wtp_backup_{timestamp}.db"
    backup_path = BACKUP_DIR / backup_name

    # 1. Copy database
    print(f"[BACKUP] Copying {db_path} -> {backup_path}")
    shutil.copy2(str(db_path), str(backup_path))
    size_mb = backup_path.stat().st_size / (1024 * 1024)
    print(f"[BACKUP] Copy complete: {size_mb:.1f} MB")

    # 2. Integrity check
    print("[CHECK] Running PRAGMA integrity_check...")
    conn = sqlite3.connect(str(backup_path))
    try:
        result = conn.execute("PRAGMA integrity_check").fetchone()
        integrity_ok = result[0] == "ok"
        if integrity_ok:
            print("[CHECK] Integrity: OK")
        else:
            print(f"[ERROR] Integrity check FAILED: {result[0]}")
    except Exception as e:
        integrity_ok = False
        print(f"[ERROR] Integrity check exception: {e}")

    # 3. Row count sanity checks
    count_alerts = []
    counts = {}
    for table, min_count in MIN_COUNTS.items():
        try:
            row = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()
            count = row[0]
            counts[table] = count
            if count < min_count:
                alert = f"{table}: {count} rows (expected >= {min_count})"
                count_alerts.append(alert)
                print(f"[ALERT] {alert}")
            else:
                print(f"[CHECK] {table}: {count:,} rows (OK)")
        except Exception as e:
            counts[table] = -1
            count_alerts.append(f"{table}: query failed ({e})")
            print(f"[ERROR] {table}: {e}")

    conn.close()

    # 4. Rotate old backups
    existing = sorted(BACKUP_DIR.glob("wtp_backup_*.db"), key=lambda p: p.name)
    if len(existing) > keep:
        to_remove = existing[:len(existing) - keep]
        for old in to_remove:
            old.unlink()
            print(f"[ROTATE] Removed old backup: {old.name}")
    print(f"[ROTATE] Keeping {min(len(existing), keep)} backups")

    # 5. Write health report
    health = {
        "last_backup": timestamp,
        "backup_file": backup_name,
        "size_mb": round(size_mb, 1),
        "integrity_ok": integrity_ok,
        "counts": counts,
        "alerts": count_alerts,
        "backups_kept": min(len(existing), keep),
    }
    HEALTH_FILE.write_text(json.dumps(health, indent=2))
    print(f"[HEALTH] Report written to {HEALTH_FILE}")

    success = integrity_ok and len(count_alerts) == 0
    status = "SUCCESS" if success else "WARNINGS"
    print(f"\n[{status}] Backup complete: {backup_name}")
    return success


def main():
    parser = argparse.ArgumentParser(description="Backup WeThePeople database")
    parser.add_argument("--db", default=str(ROOT / "wethepeople.db"), help="Path to database")
    parser.add_argument("--keep", type=int, default=7, help="Number of backups to retain")
    args = parser.parse_args()

    success = run_backup(args.db, keep=args.keep)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
