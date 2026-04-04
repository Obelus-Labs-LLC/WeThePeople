"""
Seed Tracked Telecom Companies

Populates the tracked_telecom_companies table with major US telecom companies
across wireless, broadband, cable, satellite, fiber, VoIP, and infrastructure.

Does NOT duplicate existing entries (checks by company_id).
Prints summary of what was added vs skipped.

Usage:
    python jobs/seed_telecom_companies.py
    python jobs/seed_telecom_companies.py --dry-run
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from models.database import Base, engine, SessionLocal
from models.telecom_models import TrackedTelecomCompany


# ============================================================================
# TELECOM — 24 companies
# ============================================================================

TELECOM_COMPANIES = [
    # ── Wireless ──
    {"company_id": "at-t", "display_name": "AT&T Inc.", "ticker": "T", "sector_type": "wireless", "headquarters": "Dallas, TX"},
    {"company_id": "verizon", "display_name": "Verizon Communications Inc.", "ticker": "VZ", "sector_type": "wireless", "headquarters": "New York, NY"},
    {"company_id": "t-mobile", "display_name": "T-Mobile US Inc.", "ticker": "TMUS", "sector_type": "wireless", "headquarters": "Bellevue, WA"},
    {"company_id": "us-cellular", "display_name": "United States Cellular Corp.", "ticker": "USM", "sector_type": "wireless", "headquarters": "Chicago, IL"},

    # ── Broadband ──
    {"company_id": "comcast", "display_name": "Comcast Corporation", "ticker": "CMCSA", "sector_type": "broadband", "headquarters": "Philadelphia, PA"},
    {"company_id": "charter", "display_name": "Charter Communications Inc.", "ticker": "CHTR", "sector_type": "broadband", "headquarters": "Stamford, CT"},
    {"company_id": "cox", "display_name": "Cox Communications", "ticker": None, "sector_type": "broadband", "headquarters": "Atlanta, GA"},

    # ── Cable ──
    {"company_id": "altice-usa", "display_name": "Altice USA Inc.", "ticker": "ATUS", "sector_type": "cable", "headquarters": "Long Island City, NY"},
    {"company_id": "cable-one", "display_name": "Cable One Inc.", "ticker": "CABO", "sector_type": "cable", "headquarters": "Phoenix, AZ"},
    {"company_id": "mediacom", "display_name": "Mediacom Communications", "ticker": None, "sector_type": "cable", "headquarters": "Blooming Grove, NY"},

    # ── Satellite ──
    {"company_id": "dish-network", "display_name": "DISH Network Corporation", "ticker": "DISH", "sector_type": "satellite", "headquarters": "Englewood, CO"},
    {"company_id": "echostar", "display_name": "EchoStar Corporation", "ticker": "SATS", "sector_type": "satellite", "headquarters": "Englewood, CO"},
    {"company_id": "viasat", "display_name": "Viasat Inc.", "ticker": "VSAT", "sector_type": "satellite", "headquarters": "Carlsbad, CA"},
    {"company_id": "ses", "display_name": "SES S.A.", "ticker": None, "sector_type": "satellite", "headquarters": "Betzdorf, Luxembourg"},

    # ── Fiber ──
    {"company_id": "lumen", "display_name": "Lumen Technologies Inc.", "ticker": "LUMN", "sector_type": "fiber", "headquarters": "Monroe, LA"},
    {"company_id": "frontier", "display_name": "Frontier Communications", "ticker": "FYBR", "sector_type": "fiber", "headquarters": "Dallas, TX"},
    {"company_id": "consolidated-comms", "display_name": "Consolidated Communications", "ticker": "CNSL", "sector_type": "fiber", "headquarters": "Mattoon, IL"},
    {"company_id": "windstream", "display_name": "Windstream Holdings", "ticker": "WIN", "sector_type": "fiber", "headquarters": "Little Rock, AR"},

    # ── VoIP ──
    {"company_id": "vonage", "display_name": "Vonage Holdings", "ticker": None, "sector_type": "voip", "headquarters": "Holmdel, NJ"},
    {"company_id": "ringcentral", "display_name": "RingCentral Inc.", "ticker": "RNG", "sector_type": "voip", "headquarters": "Belmont, CA"},
    {"company_id": "zoom-video", "display_name": "Zoom Video Communications", "ticker": "ZM", "sector_type": "voip", "headquarters": "San Jose, CA"},
    {"company_id": "twilio", "display_name": "Twilio Inc.", "ticker": "TWLO", "sector_type": "voip", "headquarters": "San Francisco, CA"},

    # ── Infrastructure ──
    {"company_id": "crown-castle", "display_name": "Crown Castle Inc.", "ticker": "CCI", "sector_type": "infrastructure", "headquarters": "Houston, TX"},
    {"company_id": "american-tower", "display_name": "American Tower Corp.", "ticker": "AMT", "sector_type": "infrastructure", "headquarters": "Boston, MA"},
    {"company_id": "sba-communications", "display_name": "SBA Communications Corp.", "ticker": "SBAC", "sector_type": "infrastructure", "headquarters": "Boca Raton, FL"},
    {"company_id": "corning", "display_name": "Corning Incorporated", "ticker": "GLW", "sector_type": "infrastructure", "headquarters": "Corning, NY"},
]


def seed_telecom(db, dry_run=False):
    """Seed telecom tracked companies."""
    added, skipped = 0, 0
    for data in TELECOM_COMPANIES:
        cid = data["company_id"]
        existing = db.query(TrackedTelecomCompany).filter_by(company_id=cid).first()
        if existing:
            skipped += 1
            continue
        if not dry_run:
            db.add(TrackedTelecomCompany(**data))
        added += 1
    if not dry_run:
        db.commit()
    print(f"  Telecom: {added} added, {skipped} already existed (total list: {len(TELECOM_COMPANIES)})")
    return added


def main():
    parser = argparse.ArgumentParser(description="Seed tracked telecom companies")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be added without writing to DB")
    args = parser.parse_args()

    # Ensure tables exist
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        mode = "DRY RUN" if args.dry_run else "LIVE"
        print(f"\n{'='*60}")
        print(f"  Seed Tracked Telecom Companies ({mode})")
        print(f"{'='*60}\n")

        total_added = seed_telecom(db, args.dry_run)

        print(f"\n{'='*60}")
        print(f"  Total new entries: {total_added}")
        print(f"{'='*60}")

        if not args.dry_run:
            count = db.query(TrackedTelecomCompany).count()
            print(f"\n  DB total: {count} telecom companies")
    finally:
        db.close()


if __name__ == "__main__":
    main()
