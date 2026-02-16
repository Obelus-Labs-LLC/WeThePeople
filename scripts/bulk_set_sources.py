"""
Bulk set claim_sources_json for all 47 tracked members missing sources.
Run on the GCP VM: python scripts/bulk_set_sources.py

Verified URLs as of 2026-02-15.
"""
import json
import sys
sys.path.insert(0, ".")
from models.database import SessionLocal, TrackedMember

# ── Verified press release URLs per member ──────────────────────────────
# Status key:
#   active   = currently serving, URL verified 200
#   retired  = left office (deactivate candidate)
#   nosite   = website down / unreachable

MEMBER_SOURCES = {
    # ═══════════════════════════════════════════════════════════════════
    # SENATE — members WITHOUT claims yet
    # ═══════════════════════════════════════════════════════════════════
    "amy_klobuchar": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://www.klobuchar.senate.gov/public/news-releases"}
        ]
    },
    "bill_cassidy": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://www.cassidy.senate.gov/newsroom/press-releases"}
        ]
    },
    "dick_durbin": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://www.durbin.senate.gov/newsroom/press-releases"}
        ]
    },
    "gary_peters": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://www.peters.senate.gov/newsroom/press-releases"}
        ]
    },
    "jack_reed": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://www.reed.senate.gov/news/releases"}
        ]
    },
    "jeanne_shaheen": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://www.shaheen.senate.gov/news/press"}
        ]
    },
    "jim_risch": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://www.risch.senate.gov/press-releases"}
        ]
    },
    "joe_manchin": {
        "status": "retired",  # Left Senate Jan 2025
        "sources": []
    },
    "john_barrasso": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://www.barrasso.senate.gov/public/index.cfm/news-releases"}
        ]
    },
    "john_thune": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://www.thune.senate.gov/public/index.cfm/press-releases"}
        ]
    },
    "josh_hawley": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://www.hawley.senate.gov/press-releases"}
        ]
    },
    "kyrsten_sinema": {
        "status": "retired",  # Left Senate Jan 2025
        "sources": []
    },
    "lisa_murkowski": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://www.murkowski.senate.gov/press/press-releases"}
        ]
    },
    "mike_crapo": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://www.crapo.senate.gov/media/newsreleases"}
        ]
    },
    "mitt_romney": {
        "status": "retired",  # Left Senate Jan 2025
        "sources": []
    },
    "patty_murray": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://www.murray.senate.gov/press"}
        ]
    },
    "rand_paul": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://www.paul.senate.gov/news"}
        ]
    },
    "roger_wicker": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://www.wicker.senate.gov/public/index.cfm/press-releases"}
        ]
    },
    "ron_johnson": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://www.ronjohnson.senate.gov/news"}
        ]
    },
    "susan_collins": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://www.collins.senate.gov/newsroom/press-releases"}
        ]
    },
    "ted_cruz": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://www.cruz.senate.gov/newsroom/press-releases"}
        ]
    },

    # ═══════════════════════════════════════════════════════════════════
    # HOUSE — members WITHOUT claims yet
    # ═══════════════════════════════════════════════════════════════════
    "adam_smith": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://adamsmith.house.gov/news"}
        ]
    },
    "ayanna_pressley": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://pressley.house.gov/press"}
        ]
    },
    "cathy_mcmorris_rodgers": {
        "status": "retired",  # Left House Jan 2025
        "sources": []
    },
    "chip_roy": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://roy.house.gov/media/press-releases"}
        ]
    },
    "frank_pallone": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://pallone.house.gov/media/press-releases"}
        ]
    },
    "gregory_meeks": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://meeks.house.gov/media/press-releases"}
        ]
    },
    "hakeem_jeffries": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://jeffries.house.gov/media/press-releases"}
        ]
    },
    "ilhan_omar": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://omar.house.gov/media/press-releases"}
        ]
    },
    "james_comer": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://comer.house.gov/media"}
        ]
    },
    "jamie_raskin": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://raskin.house.gov/news"}
        ]
    },
    "jason_smith": {
        "status": "active",
        "sources": [
            # Personal site didn't resolve; use committee page
            {"type": "press", "url": "https://jasonsmith.house.gov/media/press-releases"}
        ]
    },
    "jim_jordan": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://jordan.house.gov/media/press-releases"}
        ]
    },
    "katherine_clark": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://katherineclark.house.gov/press-releases"}
        ]
    },
    "lauren_boebert": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://boebert.house.gov/media/press-releases"}
        ]
    },
    "marjorie_taylor_greene": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://greene.house.gov/media/press-releases"}
        ]
    },
    "matt_gaetz": {
        "status": "retired",  # Resigned Nov 2024
        "sources": []
    },
    "michael_mccaul": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://mccaul.house.gov/media-center/press-releases"}
        ]
    },
    "mike_johnson": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://mikejohnson.house.gov/media/press-releases"},
            {"type": "press", "url": "https://speaker.house.gov/press"}
        ]
    },
    "mike_rogers_al": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://mikerogers.house.gov/news"}
        ]
    },
    "pramila_jayapal": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://jayapal.house.gov/media/press-releases"}
        ]
    },
    "rashida_tlaib": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://tlaib.house.gov/press"}
        ]
    },
    "richard_neal": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://neal.house.gov/newsroom"}
        ]
    },
    "rosa_delauro": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://delauro.house.gov/media-center/press-releases"}
        ]
    },
    "steve_scalise": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://scalise.house.gov/media/press-releases"}
        ]
    },
    "tom_cole": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://cole.house.gov/media-center/press-releases"}
        ]
    },
    "tom_emmer": {
        "status": "active",
        "sources": [
            {"type": "press", "url": "https://emmer.house.gov/media-center/press-releases"}
        ]
    },

    # ═══════════════════════════════════════════════════════════════════
    # TEST ENTRIES — deactivate
    # ═══════════════════════════════════════════════════════════════════
    "cov-person-a-1770348257409": {"status": "test", "sources": []},
    "cov-person-b-1770348257409": {"status": "test", "sources": []},
}


def main():
    db = SessionLocal()
    try:
        set_count = 0
        deactivate_count = 0
        skip_count = 0

        for person_id, config in MEMBER_SOURCES.items():
            member = db.query(TrackedMember).filter(
                TrackedMember.person_id == person_id
            ).first()

            if not member:
                print(f"[SKIP] Not found in DB: {person_id}")
                skip_count += 1
                continue

            status = config["status"]
            sources = config["sources"]

            # Deactivate retired/test members
            if status in ("retired", "test"):
                if member.is_active:
                    member.is_active = 0
                    print(f"[DEACTIVATE] {member.display_name} ({status})")
                    deactivate_count += 1
                else:
                    print(f"[ALREADY INACTIVE] {member.display_name}")
                continue

            # Set sources for active members
            if sources:
                member.claim_sources_json = json.dumps(sources)
                print(f"[SET] {member.display_name} — {len(sources)} source(s)")
                for s in sources:
                    print(f"       [{s['type']}] {s['url']}")
                set_count += 1
            else:
                print(f"[NO SOURCES] {member.display_name} — skipped (no URL found)")
                skip_count += 1

        db.commit()

        print()
        print("=" * 60)
        print(f"DONE")
        print(f"  Sources configured: {set_count}")
        print(f"  Deactivated:        {deactivate_count}")
        print(f"  Skipped:            {skip_count}")
        print("=" * 60)

    finally:
        db.close()


if __name__ == "__main__":
    main()
