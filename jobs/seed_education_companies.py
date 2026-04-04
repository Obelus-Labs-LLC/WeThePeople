"""
Seed Education Companies

Populates tracked_education_companies with edtech, publishing, student lending,
for-profit colleges, testing, higher ed services, and K-12 services companies.

Does NOT duplicate existing entries (checks by company_id).
Prints summary of what was added vs skipped.

Usage:
    python jobs/seed_education_companies.py
    python jobs/seed_education_companies.py --dry-run
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from models.database import Base, engine, SessionLocal
from models.education_models import TrackedEducationCompany


EDUCATION_COMPANIES = [
    # ── EdTech ──
    {"company_id": "chegg", "display_name": "Chegg Inc.", "ticker": "CHGG", "sector_type": "edtech", "headquarters": "Santa Clara, CA"},
    {"company_id": "coursera", "display_name": "Coursera Inc.", "ticker": "COUR", "sector_type": "edtech", "headquarters": "Mountain View, CA"},
    {"company_id": "duolingo", "display_name": "Duolingo Inc.", "ticker": "DUOL", "sector_type": "edtech", "headquarters": "Pittsburgh, PA"},
    {"company_id": "instructure", "display_name": "Instructure Holdings", "ticker": "INST", "sector_type": "edtech", "headquarters": "Salt Lake City, UT"},
    {"company_id": "powerschool", "display_name": "PowerSchool Holdings", "ticker": "PWSC", "sector_type": "edtech", "headquarters": "Folsom, CA"},
    {"company_id": "2u-inc", "display_name": "2U Inc.", "ticker": "TWOU", "sector_type": "edtech", "headquarters": "Lanham, MD"},

    # ── Publishing ──
    {"company_id": "pearson", "display_name": "Pearson plc", "ticker": "PSO", "sector_type": "publishing", "headquarters": "London, UK"},
    {"company_id": "mcgraw-hill", "display_name": "McGraw Hill", "ticker": None, "sector_type": "publishing", "headquarters": "New York, NY"},
    {"company_id": "scholastic", "display_name": "Scholastic Corporation", "ticker": "SCHL", "sector_type": "publishing", "headquarters": "New York, NY"},
    {"company_id": "houghton-mifflin", "display_name": "Houghton Mifflin Harcourt", "ticker": None, "sector_type": "publishing", "headquarters": "Boston, MA"},
    {"company_id": "cengage", "display_name": "Cengage Group", "ticker": None, "sector_type": "publishing", "headquarters": "Boston, MA"},
    {"company_id": "wiley", "display_name": "John Wiley & Sons", "ticker": "WLY", "sector_type": "publishing", "headquarters": "Hoboken, NJ"},

    # ── Student Lending ──
    {"company_id": "navient", "display_name": "Navient Corporation", "ticker": "NAVI", "sector_type": "student_lending", "headquarters": "Wilmington, DE"},
    {"company_id": "nelnet", "display_name": "Nelnet Inc.", "ticker": "NNI", "sector_type": "student_lending", "headquarters": "Lincoln, NE"},
    {"company_id": "sallie-mae", "display_name": "SLM Corporation", "ticker": "SLM", "sector_type": "student_lending", "headquarters": "Newark, DE"},
    {"company_id": "sofi", "display_name": "SoFi Technologies", "ticker": "SOFI", "sector_type": "student_lending", "headquarters": "San Francisco, CA"},

    # ── For-Profit Colleges ──
    {"company_id": "grand-canyon", "display_name": "Grand Canyon Education", "ticker": "LOPE", "sector_type": "for_profit_college", "headquarters": "Phoenix, AZ"},
    {"company_id": "adtalem", "display_name": "Adtalem Global Education", "ticker": "ATGE", "sector_type": "for_profit_college", "headquarters": "Chicago, IL"},
    {"company_id": "stride", "display_name": "Stride Inc.", "ticker": "LRN", "sector_type": "for_profit_college", "headquarters": "Reston, VA"},
    {"company_id": "perdoceo", "display_name": "Perdoceo Education", "ticker": "PRDO", "sector_type": "for_profit_college", "headquarters": "Schaumburg, IL"},
    {"company_id": "universal-technical", "display_name": "Universal Technical Institute", "ticker": "UTI", "sector_type": "for_profit_college", "headquarters": "Phoenix, AZ"},

    # ── Testing ──
    {"company_id": "ets", "display_name": "Educational Testing Service", "ticker": None, "sector_type": "testing", "headquarters": "Princeton, NJ"},
    {"company_id": "college-board", "display_name": "College Board", "ticker": None, "sector_type": "testing", "headquarters": "New York, NY"},
    {"company_id": "act-inc", "display_name": "ACT Inc.", "ticker": None, "sector_type": "testing", "headquarters": "Iowa City, IA"},
    {"company_id": "prometric", "display_name": "Prometric", "ticker": None, "sector_type": "testing", "headquarters": "Baltimore, MD"},

    # ── Higher Ed Services ──
    {"company_id": "blackboard", "display_name": "Blackboard Inc.", "ticker": None, "sector_type": "higher_ed_services", "headquarters": "Reston, VA"},
    {"company_id": "ellucian", "display_name": "Ellucian", "ticker": None, "sector_type": "higher_ed_services", "headquarters": "Reston, VA"},

    # ── K-12 Services ──
    {"company_id": "amplify", "display_name": "Amplify Education", "ticker": None, "sector_type": "k12_services", "headquarters": "Brooklyn, NY"},
    {"company_id": "renaissance", "display_name": "Renaissance Learning", "ticker": None, "sector_type": "k12_services", "headquarters": "Bloomington, MN"},
    {"company_id": "curriculum-associates", "display_name": "Curriculum Associates", "ticker": None, "sector_type": "k12_services", "headquarters": "North Billerica, MA"},
]


def seed_education(db, dry_run=False):
    """Seed education tracked companies."""
    added, skipped = 0, 0
    for data in EDUCATION_COMPANIES:
        cid = data["company_id"]
        existing = db.query(TrackedEducationCompany).filter_by(company_id=cid).first()
        if existing:
            skipped += 1
            continue
        if not dry_run:
            db.add(TrackedEducationCompany(**data))
        added += 1
    if not dry_run:
        db.commit()
    print(f"  Education: {added} added, {skipped} already existed (total list: {len(EDUCATION_COMPANIES)})")
    return added


def main():
    parser = argparse.ArgumentParser(description="Seed tracked education companies")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be added without writing to DB")
    args = parser.parse_args()

    # Ensure tables exist
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        mode = "DRY RUN" if args.dry_run else "LIVE"
        print(f"\n{'='*60}")
        print(f"  Seed Education Companies ({mode})")
        print(f"{'='*60}\n")

        total_added = seed_education(db, args.dry_run)

        print(f"\n{'='*60}")
        print(f"  Total new entries: {total_added}")
        print(f"{'='*60}")

        if not args.dry_run:
            print(f"\nCurrent DB total:")
            print(f"  Education companies: {db.query(TrackedEducationCompany).count()}")
            print()

    finally:
        db.close()


if __name__ == "__main__":
    main()
