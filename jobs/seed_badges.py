"""
Seed the badges table with default badge definitions.

Run once: python jobs/seed_badges.py
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal
from models.civic_models import Badge

BADGES = [
    # Engagement
    {"slug": "first_vote", "name": "First Vote", "description": "Cast your first vote on a promise or proposal", "icon": "vote", "category": "engagement", "threshold": 1, "level": 1},
    {"slug": "voter_10", "name": "Active Voter", "description": "Cast 10 votes on civic content", "icon": "check-check", "category": "engagement", "threshold": 10, "level": 2},
    {"slug": "voter_100", "name": "Civic Champion", "description": "Cast 100 votes on civic content", "icon": "trophy", "category": "engagement", "threshold": 100, "level": 3},

    # Research
    {"slug": "promise_tracker", "name": "Promise Tracker", "description": "Submit your first accountability promise", "icon": "target", "category": "research", "threshold": 1, "level": 1},
    {"slug": "bill_reader", "name": "Bill Reader", "description": "Annotate your first bill section", "icon": "book-open", "category": "research", "threshold": 1, "level": 1},
    {"slug": "annotator_10", "name": "Legislative Analyst", "description": "Annotate 10 bill sections", "icon": "file-text", "category": "research", "threshold": 10, "level": 2},

    # Community
    {"slug": "first_proposal", "name": "Citizen Voice", "description": "Submit your first policy proposal", "icon": "megaphone", "category": "community", "threshold": 1, "level": 1},
    {"slug": "proposer_10", "name": "Policy Advocate", "description": "Submit 10 policy proposals", "icon": "scroll", "category": "community", "threshold": 10, "level": 2},

    # Verification
    {"slug": "verified_citizen", "name": "Verified Citizen", "description": "Verify your residence to unlock district-specific features", "icon": "shield-check", "category": "verification", "threshold": 1, "level": 1},
]


def seed():
    db = SessionLocal()
    try:
        created = 0
        for b in BADGES:
            existing = db.query(Badge).filter(Badge.slug == b["slug"]).first()
            if existing:
                continue
            db.add(Badge(**b))
            created += 1
        db.commit()
        print(f"Seeded {created} badges ({len(BADGES) - created} already existed)")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
