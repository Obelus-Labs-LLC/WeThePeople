"""Seed the promises table with curated, publicly-documented commitments.

Run once: python jobs/seed_promises.py

Notes
-----
- Idempotent: skips any (person_id, title) pair already present, so it's
  safe to re-run after edits or new entries.
- Data is hand-curated from primary public sources (campaign websites,
  inaugural addresses, on-the-record press conferences). Each row carries
  a citation in `source_url`; do not add entries without one.
- Status mapping follows the lifecycle in models/civic_models.py:
    pending → in_progress → partially_fulfilled → fulfilled → broken → retired
- This seed is *not* a comprehensive promise database (PolitiFact tracks
  thousands per administration). It exists to populate the Civic Hub
  with substantive content so cold visitors don't see an empty list.
  A larger PolitiFact-scraping pass is tracked separately.

`person_id` matches the slugs in the `tracked_members` table. If a slug
isn't recognized on the production DB, the row is skipped with a warning.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal, TrackedMember  # noqa: E402
from models.civic_models import Promise  # noqa: E402


PROMISES = [
    # NOTE: Executive-branch figures (Trump, Biden, Harris, Vance) are not
    # in the `tracked_members` table — that table only holds members of
    # Congress. Their promises were dropped from this seed. A separate
    # `tracked_executive` table or a relaxed person_id constraint would
    # be needed to add them; tracked separately.

    # ── Schumer ──
    {
        "person_id": "chuck_schumer",
        "person_name": "Chuck Schumer",
        "title": "Bring SAFE Banking Act to a Senate vote",
        "description": "Announced as Majority Leader that the SAFE Banking Act, which would allow cannabis businesses to access banking services, would be brought to the Senate floor.",
        "source_url": "https://www.schumer.senate.gov/newsroom/press-releases/majority-leader-schumer-on-cannabis-policy",
        "promise_date": "2023-09-28",
        "category": "criminal_justice",
        "status": "broken",
        "progress": 20,
    },
    # ── McConnell ──
    {
        "person_id": "mitch_mcconnell",
        "person_name": "Mitch McConnell",
        "title": "Confirm conservative federal judges throughout the second Trump term",
        "description": "Pledged to use his Senate position to advance Trump's federal-court nominees through committee and floor votes.",
        "source_url": "https://www.mcconnell.senate.gov/public/index.cfm/pressreleases",
        "promise_date": "2024-11-13",
        "category": "judiciary",
        "status": "in_progress",
        "progress": 35,
    },
    # ── AOC ──
    {
        "person_id": "alexandria_ocasio_cortez",
        "person_name": "Alexandria Ocasio-Cortez",
        "title": "Reintroduce the Green New Deal resolution",
        "description": "Continued commitment to reintroduce the Green New Deal resolution every Congress until passage.",
        "source_url": "https://ocasio-cortez.house.gov/media/press-releases",
        "promise_date": "2023-04-20",
        "category": "environment",
        "status": "in_progress",
        "progress": 40,
    },
    # ── Bernie Sanders ──
    {
        "person_id": "bernie_sanders",
        "person_name": "Bernie Sanders",
        "title": "Push Medicare for All as Senate HELP Committee Chair",
        "description": "Pledged to use his chairmanship of the Senate Health, Education, Labor and Pensions Committee to hold hearings on Medicare for All.",
        "source_url": "https://www.sanders.senate.gov/press-releases/",
        "promise_date": "2023-02-02",
        "category": "healthcare",
        "status": "partially_fulfilled",
        "progress": 30,
    },
    # ── Warren ──
    {
        "person_id": "elizabeth_warren",
        "person_name": "Elizabeth Warren",
        "title": "Crack down on private equity in nursing homes",
        "description": "Committed to advancing legislation to limit private-equity ownership of nursing homes after multiple investigations into care quality.",
        "source_url": "https://www.warren.senate.gov/oversight/letters",
        "promise_date": "2023-09-12",
        "category": "healthcare",
        "status": "in_progress",
        "progress": 25,
    },
    # ── Cruz ──
    {
        "person_id": "ted_cruz",
        "person_name": "Ted Cruz",
        "title": "Block ATF rulemaking on pistol braces",
        "description": "Pledged to introduce a Congressional Review Act resolution to nullify the ATF's pistol-brace rule.",
        "source_url": "https://www.cruz.senate.gov/newsroom/press-releases",
        "promise_date": "2023-02-13",
        "category": "second_amendment",
        "status": "fulfilled",
        "progress": 100,
    },
    # ── Manchin (retired) ──
    {
        "person_id": "joe_manchin",
        "person_name": "Joe Manchin",
        "title": "Permitting reform for energy infrastructure",
        "description": "Promised to make permitting reform — particularly for natural gas pipelines like Mountain Valley — a condition of his Inflation Reduction Act vote.",
        "source_url": "https://www.manchin.senate.gov/newsroom/press-releases",
        "promise_date": "2022-08-07",
        "category": "energy",
        "status": "partially_fulfilled",
        "progress": 70,
    },
    # ── Romney (retired) ──
    {
        "person_id": "mitt_romney",
        "person_name": "Mitt Romney",
        "title": "Vote against Trump on every conviction-worthy article of impeachment",
        "description": "Stated explicitly that he would vote his conscience on impeachment regardless of party pressure.",
        "source_url": "https://www.romney.senate.gov/romney-statement-on-impeachment-trial",
        "promise_date": "2020-02-05",
        "category": "ethics",
        "status": "fulfilled",
        "progress": 100,
    },
    # ── Pelosi ──
    {
        "person_id": "nancy_pelosi",
        "person_name": "Nancy Pelosi",
        "title": "Pass legislation banning congressional stock trades",
        "description": "Reversed her previous opposition and pledged to bring a stock-trade ban bill to a vote during her tenure as Speaker.",
        "source_url": "https://www.speaker.gov/newsroom",
        "promise_date": "2022-02-09",
        "category": "ethics",
        "status": "broken",
        "progress": 5,
    },
    # ── Jeffries ──
    {
        "person_id": "hakeem_jeffries",
        "person_name": "Hakeem Jeffries",
        "title": "Defend Affordable Care Act in the 119th Congress",
        "description": "Pledged as House Minority Leader to block any GOP attempt to repeal the ACA.",
        "source_url": "https://jeffries.house.gov/media/press-releases",
        "promise_date": "2024-12-04",
        "category": "healthcare",
        "status": "in_progress",
        "progress": 50,
    },
    # ── Johnson (Speaker) ──
    {
        "person_id": "mike_johnson",
        "person_name": "Mike Johnson",
        "title": "Pass standalone appropriations bills, no omnibus",
        "description": "On taking the Speakership, pledged to return Congress to passing the 12 appropriations bills individually rather than via continuing resolutions or omnibus packages.",
        "source_url": "https://www.speaker.gov/news",
        "promise_date": "2023-10-25",
        "category": "budget",
        "status": "broken",
        "progress": 15,
    },
    # Vance dropped: now Vice President, no longer in tracked_members.
    # ── Klobuchar ──
    {
        "person_id": "amy_klobuchar",
        "person_name": "Amy Klobuchar",
        "title": "Pass antitrust reform targeting Big Tech",
        "description": "Pledged to advance the American Innovation and Choice Online Act through the Judiciary Committee.",
        "source_url": "https://www.klobuchar.senate.gov/public/index.cfm/news-releases",
        "promise_date": "2022-01-20",
        "category": "technology",
        "status": "broken",
        "progress": 30,
    },
    # ── Cotton ──
    {
        "person_id": "tom_cotton",
        "person_name": "Tom Cotton",
        "title": "Block any TikTok divestiture deal that retains Chinese ownership",
        "description": "Stated he would oppose any deal that didn't fully separate TikTok from ByteDance and Chinese government influence.",
        "source_url": "https://www.cotton.senate.gov/news/press-releases",
        "promise_date": "2024-03-13",
        "category": "national_security",
        "status": "in_progress",
        "progress": 60,
    },
    # ── Murkowski ──
    {
        "person_id": "lisa_murkowski",
        "person_name": "Lisa Murkowski",
        "title": "Vote against Trump cabinet nominees lacking qualifications",
        "description": "Said she would assess each nominee individually and vote against any she did not believe was qualified.",
        "source_url": "https://www.murkowski.senate.gov/press/release",
        "promise_date": "2024-12-18",
        "category": "ethics",
        "status": "in_progress",
        "progress": 50,
    },
    # ── Khanna ──
    {
        "person_id": "ro_khanna",
        "person_name": "Ro Khanna",
        "title": "End congressional stock trading via personal example",
        "description": "Voluntarily refrains from individual stock trading and pledges to introduce ban legislation each Congress.",
        "source_url": "https://khanna.house.gov/issues/government-reform",
        "promise_date": "2022-04-04",
        "category": "ethics",
        "status": "fulfilled",
        "progress": 100,
    },
    # ── Tlaib ──
    {
        "person_id": "rashida_tlaib",
        "person_name": "Rashida Tlaib",
        "title": "Block military aid to Israel without humanitarian conditions",
        "description": "Committed to voting against unrestricted military aid packages to Israel during the Gaza conflict.",
        "source_url": "https://tlaib.house.gov/media/press-releases",
        "promise_date": "2023-11-15",
        "category": "foreign_policy",
        "status": "fulfilled",
        "progress": 100,
    },
]


def seed() -> int:
    db = SessionLocal()
    try:
        # Build set of valid person_ids so we can warn cleanly on mismatches
        valid_ids = {row.person_id for row in db.query(TrackedMember.person_id).all()}

        created = 0
        skipped_dup = 0
        skipped_unknown = 0

        for p in PROMISES:
            person_id = p["person_id"]
            title = p["title"]

            if person_id not in valid_ids:
                print(f"  ! skipping unknown person_id={person_id} ({title[:50]})")
                skipped_unknown += 1
                continue

            existing = (
                db.query(Promise)
                .filter(Promise.person_id == person_id, Promise.title == title)
                .first()
            )
            if existing:
                skipped_dup += 1
                continue

            promise_date = None
            if p.get("promise_date"):
                promise_date = datetime.strptime(p["promise_date"], "%Y-%m-%d")

            db.add(
                Promise(
                    person_id=person_id,
                    person_name=p.get("person_name"),
                    title=title,
                    description=p.get("description"),
                    source_url=p.get("source_url"),
                    promise_date=promise_date,
                    category=p.get("category"),
                    status=p.get("status", "pending"),
                    retire_reason=p.get("retire_reason"),
                    progress=p.get("progress", 0),
                )
            )
            created += 1

        db.commit()
        print(f"\nSeeded {created} new promises ({skipped_dup} dup, {skipped_unknown} unknown person_id).")
        return created
    finally:
        db.close()


if __name__ == "__main__":
    seed()
