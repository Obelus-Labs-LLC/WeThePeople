"""Seed StoryAction rows for every published story.

Phase 2 ships an Action Panel at the bottom of every story: 1-3 concrete,
time-bounded next steps the reader can take in under a minute. Until this
script runs, the panel renders empty because no `story_actions` rows exist.

The seeder picks action templates from a recipe table keyed by
(category, sector). Each story gets 2-3 actions: a mix of passive
("switch_provider", "check_redress", "verify_data") and active
("call_rep", "register_to_vote", "attend_hearing"). The frontend
StoryActionPanel groups by `is_passive` so the disengaged-audience
reader can pick a low-commitment action without doing politics.

Usage:
    python scripts/seed_story_actions.py --dry-run
    python scripts/seed_story_actions.py
    python scripts/seed_story_actions.py --slug some-story-slug   # one story
    python scripts/seed_story_actions.py --replace                # wipe + reseed

The seeder is idempotent in default mode: it skips any story that
already has at least one StoryAction row. Pass --replace to wipe and
reseed every targeted story (use this after editing the recipes).
"""

import argparse
import logging
import os
import sys
from typing import List, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal
from models.stories_models import Story, StoryAction

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Action recipes
# ---------------------------------------------------------------------------
#
# Each recipe is a dict matching the StoryAction column shape:
#
#   action_type   — one of StoryAction.VALID_TYPES
#   title         — primary CTA (under 60 chars renders best)
#   description   — 1-2 sentence description
#   is_passive    — 1 = passive (switch banks, check redress);
#                   0 = active (call rep, attend hearing)
#   geographic_filter — None (universal) or a state filter (rare)
#   script_template — optional; required for call_rep
#   external_url  — destination
#   display_order — lower = higher up
#
# Verification is layered:
#   1. (category, sector) lookup — most specific
#   2. (category, "*")    lookup — category-only fallback
#   3. SECTOR_DEFAULTS[sector] — always-on sector actions
#   4. UNIVERSAL_DEFAULTS — last-resort (verify_data + register_to_vote)
#
# The seeder de-duplicates by (action_type, external_url) so layering
# can't produce two of the same row.

UNIVERSAL_DEFAULTS = [
    {
        "action_type": "verify_data",
        "title": "Read the underlying data",
        "description": (
            "Every claim in this story comes from public records. Browse "
            "the matching dataset on WeThePeople and check the figures "
            "yourself."
        ),
        "is_passive": 1,
        "external_url": "https://wethepeopleforus.com/",
        "display_order": 90,
    },
    {
        "action_type": "register_to_vote",
        "title": "Make sure you're registered to vote",
        "description": (
            "Stories like this only matter at the ballot box. Vote.gov "
            "checks your registration in any state in under a minute."
        ),
        "is_passive": 0,
        "external_url": "https://vote.gov/",
        "display_order": 95,
    },
]

# Always-on per sector. These add the "switch your provider" /
# "check your refund" type passive actions when the story is in a
# given sector — the disengaged-audience pivot.
SECTOR_DEFAULTS = {
    "finance": [
        {
            "action_type": "switch_provider",
            "title": "Find a local credit union",
            "description": (
                "Credit unions are member-owned and tend to charge less "
                "than the big banks. NCUA's locator finds federally "
                "insured credit unions you can join."
            ),
            "is_passive": 1,
            "external_url": "https://mapping.ncua.gov/",
            "display_order": 30,
        },
        {
            "action_type": "check_redress",
            "title": "Check the CFPB refund portal",
            "description": (
                "The Consumer Financial Protection Bureau collects "
                "settlement money on behalf of customers wronged by "
                "banks. Quick lookup tells you if you're owed a refund."
            ),
            "is_passive": 1,
            "external_url": "https://www.consumerfinance.gov/about-us/payments-harmed-consumers/",
            "display_order": 40,
        },
    ],
    "health": [
        {
            "action_type": "check_redress",
            "title": "Check Medicare overcharge refunds",
            "description": (
                "CMS sometimes refunds Medicare premiums when carriers "
                "are caught overcharging. The Medicare beneficiary "
                "rights page walks you through claiming what you're owed."
            ),
            "is_passive": 1,
            "external_url": "https://www.medicare.gov/claims-appeals",
            "display_order": 30,
        },
    ],
    "housing": [
        {
            "action_type": "check_redress",
            "title": "Check HUD complaint and refund tools",
            "description": (
                "HUD has a complaint line and a list of active "
                "settlements paying tenants and homebuyers. Worth a "
                "two-minute lookup if you've rented or bought recently."
            ),
            "is_passive": 1,
            "external_url": "https://www.hud.gov/program_offices/fair_housing_equal_opp/online-complaint",
            "display_order": 30,
        },
    ],
    "energy": [
        {
            "action_type": "check_redress",
            "title": "Find your state utility commission",
            "description": (
                "Your state utility commission handles refunds and "
                "complaints when energy companies overcharge. NARUC's "
                "directory lists all 50 in one place."
            ),
            "is_passive": 1,
            "external_url": "https://www.naruc.org/about-naruc/regulatory-commissions/",
            "display_order": 30,
        },
    ],
    "transportation": [
        {
            "action_type": "check_redress",
            "title": "Check DOT airline refund and complaint portal",
            "description": (
                "DOT publishes carrier-by-carrier complaint data and "
                "files refund actions. Two-minute lookup if you've "
                "flown recently."
            ),
            "is_passive": 1,
            "external_url": "https://www.transportation.gov/airconsumer",
            "display_order": 30,
        },
    ],
    "tech": [
        {
            "action_type": "check_redress",
            "title": "Check FTC tech-company refunds",
            "description": (
                "The FTC publishes a list of active settlements paying "
                "consumers harmed by tech-company practices. Look up "
                "your name; you may be owed a refund."
            ),
            "is_passive": 1,
            "external_url": "https://www.ftc.gov/enforcement/refunds",
            "display_order": 30,
        },
    ],
    "technology": [
        {
            "action_type": "check_redress",
            "title": "Check FTC tech-company refunds",
            "description": (
                "The FTC publishes a list of active settlements paying "
                "consumers harmed by tech-company practices. Look up "
                "your name; you may be owed a refund."
            ),
            "is_passive": 1,
            "external_url": "https://www.ftc.gov/enforcement/refunds",
            "display_order": 30,
        },
    ],
    "telecom": [
        {
            "action_type": "switch_provider",
            "title": "Find broadband providers in your ZIP",
            "description": (
                "FCC's National Broadband Map lists every internet "
                "provider that serves your address, with speeds and "
                "price tiers."
            ),
            "is_passive": 1,
            "external_url": "https://broadbandmap.fcc.gov/",
            "display_order": 30,
        },
    ],
    "education": [
        {
            "action_type": "check_redress",
            "title": "Check student-loan forgiveness portal",
            "description": (
                "The Department of Education's StudentAid.gov page "
                "tracks active loan-forgiveness programs and how to "
                "apply. Two-minute lookup if you have student loans."
            ),
            "is_passive": 1,
            "external_url": "https://studentaid.gov/manage-loans/forgiveness-cancellation",
            "display_order": 30,
        },
    ],
    "agriculture": [
        {
            "action_type": "verify_data",
            "title": "Browse USDA food-policy filings",
            "description": (
                "USDA's food-policy hub has the underlying records on "
                "subsidies, safety violations, and pricing rules that "
                "affect grocery costs."
            ),
            "is_passive": 1,
            "external_url": "https://www.usda.gov/topics/food-and-nutrition",
            "display_order": 30,
        },
    ],
    "chemicals": [
        {
            "action_type": "check_redress",
            "title": "Check EPA enforcement and contamination map",
            "description": (
                "EPA's ECHO database shows enforcement actions and "
                "permitted releases by facility. Search by ZIP to see "
                "what's near you."
            ),
            "is_passive": 1,
            "external_url": "https://echo.epa.gov/",
            "display_order": 30,
        },
    ],
    "defense": [
        {
            "action_type": "verify_data",
            "title": "Browse DoD contract data",
            "description": (
                "Every defense contract over $7.5M is posted publicly. "
                "USAspending lets you filter by contractor, agency, "
                "and time period."
            ),
            "is_passive": 1,
            "external_url": "https://www.usaspending.gov/",
            "display_order": 30,
        },
    ],
    "politics": [],  # politics-sector stories rely on category recipes
}


# Per-category recipes. (category, sector) is checked first; falls back
# to (category, "*") if no sector-specific recipe exists.
CATEGORY_RECIPES = {
    # --- Stock-trading / congressional-trade categories ---
    ("stock_act_violation", "*"): [
        {
            "action_type": "call_rep",
            "title": "Tell your rep: enforce the STOCK Act",
            "description": (
                "Most STOCK Act violations carry a $200 fine. Call "
                "your rep and ask them to back the ETHICS Act, which "
                "would ban Congressional stock trading entirely."
            ),
            "is_passive": 0,
            "script_template": (
                "Hi, I'm a constituent in {state}. I'm calling because I "
                "saw a STOCK Act violation reported in The Influence "
                "Journal. The current $200 fine is a joke. Will the "
                "Representative co-sponsor the ETHICS Act to ban "
                "Congressional stock trading?"
            ),
            "external_url": "https://www.house.gov/representatives/find-your-representative",
            "display_order": 10,
        },
        {
            "action_type": "verify_data",
            "title": "Look up the trade on Capitol Trades",
            "description": (
                "Capitol Trades aggregates every disclosed Congressional "
                "stock trade. Filter by the member named in this story "
                "to see the full pattern."
            ),
            "is_passive": 1,
            "external_url": "https://www.capitoltrades.com/",
            "display_order": 20,
        },
    ],
    ("committee_stock_trade", "*"): [
        {
            "action_type": "call_rep",
            "title": "Tell your rep: ban committee-related trades",
            "description": (
                "Members trading in stocks the committees they sit on "
                "regulate is the textbook conflict of interest. Ask "
                "your rep to support the ETHICS Act."
            ),
            "is_passive": 0,
            "script_template": (
                "Hi, I'm a constituent in {state}. I'm calling about "
                "Congressional stock trading by committee members "
                "regulating the same companies. Will the Representative "
                "back the ETHICS Act to end this?"
            ),
            "external_url": "https://www.house.gov/representatives/find-your-representative",
            "display_order": 10,
        },
        {
            "action_type": "verify_data",
            "title": "See all trades by this committee",
            "description": (
                "Capitol Trades lets you filter by committee. See "
                "every trade members made on companies they oversee."
            ),
            "is_passive": 1,
            "external_url": "https://www.capitoltrades.com/",
            "display_order": 20,
        },
    ],
    ("trade_cluster", "*"): [
        {
            "action_type": "verify_data",
            "title": "Browse the full trade cluster on Capitol Trades",
            "description": (
                "Capitol Trades aggregates filings across multiple "
                "members. The full cluster sometimes shows tighter "
                "timing than any single trade reveals."
            ),
            "is_passive": 1,
            "external_url": "https://www.capitoltrades.com/",
            "display_order": 20,
        },
    ],
    ("trade_timing", "*"): [
        {
            "action_type": "verify_data",
            "title": "Cross-check the trade against bill action dates",
            "description": (
                "Congress.gov publishes every committee markup and "
                "floor vote. Compare against the trade date to see "
                "what the member knew when."
            ),
            "is_passive": 1,
            "external_url": "https://www.congress.gov/",
            "display_order": 20,
        },
    ],
    ("bipartisan_buying", "*"): [
        {
            "action_type": "call_rep",
            "title": "Push your rep on Congressional trading bans",
            "description": (
                "When members from both parties trade the same stock "
                "on the same news, the rules don't work. Ask your rep "
                "to back the ETHICS Act."
            ),
            "is_passive": 0,
            "script_template": (
                "Hi, I'm a constituent in {state}. I just read about "
                "members of both parties trading the same stocks on "
                "the same news. Will the Representative back the "
                "ETHICS Act to ban Congressional stock trading?"
            ),
            "external_url": "https://www.house.gov/representatives/find-your-representative",
            "display_order": 10,
        },
    ],
    ("prolific_trader", "*"): [
        {
            "action_type": "verify_data",
            "title": "See the member's full trading history",
            "description": (
                "Capitol Trades aggregates every disclosed trade by "
                "the member. Worth a look — patterns reveal what no "
                "single filing can."
            ),
            "is_passive": 1,
            "external_url": "https://www.capitoltrades.com/",
            "display_order": 20,
        },
    ],

    # --- Lobbying ---
    ("lobbying_spike", "*"): [
        {
            "action_type": "verify_data",
            "title": "Browse the underlying LDA filings",
            "description": (
                "The Senate's Lobbying Disclosure database has every "
                "filing this story is built on. Search by company "
                "to see all their bills, agencies, and spending."
            ),
            "is_passive": 1,
            "external_url": "https://lda.senate.gov/system/public/",
            "display_order": 20,
        },
    ],
    ("lobbying_breakdown", "*"): [
        {
            "action_type": "verify_data",
            "title": "Browse the underlying LDA filings",
            "description": (
                "The Senate's Lobbying Disclosure database has every "
                "filing this story is built on."
            ),
            "is_passive": 1,
            "external_url": "https://lda.senate.gov/system/public/",
            "display_order": 20,
        },
    ],
    ("foreign_lobbying", "*"): [
        {
            "action_type": "verify_data",
            "title": "Read the FARA registration",
            "description": (
                "DOJ's FARA database lists every foreign agent "
                "registration. Search by firm name to see who they "
                "represent and what they're paid."
            ),
            "is_passive": 1,
            "external_url": "https://efile.fara.gov/",
            "display_order": 20,
        },
    ],
    ("revolving_door", "*"): [
        {
            "action_type": "verify_data",
            "title": "Look up the firm on Senate LDA",
            "description": (
                "The Senate Lobbying Disclosure database lets you "
                "verify which agencies the firm now lobbies and "
                "compare against where its staff used to work."
            ),
            "is_passive": 1,
            "external_url": "https://lda.senate.gov/system/public/",
            "display_order": 20,
        },
    ],

    # --- Contracts ---
    ("contract_windfall", "*"): [
        {
            "action_type": "verify_data",
            "title": "See the contracts on USAspending",
            "description": (
                "Every federal contract over $25K is posted publicly. "
                "USAspending lets you filter by recipient and time "
                "window to verify the figures in this story."
            ),
            "is_passive": 1,
            "external_url": "https://www.usaspending.gov/",
            "display_order": 20,
        },
    ],
    ("lobby_contract_loop", "*"): [
        {
            "action_type": "verify_data",
            "title": "Trace the lobby-then-contract loop yourself",
            "description": (
                "USAspending and the Senate LDA database together let "
                "you trace any lobby-spend / contract-win chain. "
                "Cross-reference by entity name."
            ),
            "is_passive": 1,
            "external_url": "https://www.usaspending.gov/",
            "display_order": 20,
        },
    ],
    ("lobby_then_win", "*"): [
        {
            "action_type": "verify_data",
            "title": "Trace lobby spend vs contract awards",
            "description": (
                "USAspending and Senate LDA together show the "
                "before-and-after: which agencies were lobbied, "
                "which contracts followed."
            ),
            "is_passive": 1,
            "external_url": "https://www.usaspending.gov/",
            "display_order": 20,
        },
    ],
    ("contract_timing", "*"): [
        {
            "action_type": "verify_data",
            "title": "Verify the timing on USAspending",
            "description": (
                "USAspending publishes contract obligation dates. "
                "Compare against PAC-donation dates from FEC to "
                "double-check the timing yourself."
            ),
            "is_passive": 1,
            "external_url": "https://www.usaspending.gov/",
            "display_order": 20,
        },
    ],

    # --- Enforcement ---
    ("penalty_contract_ratio", "*"): [
        {
            "action_type": "verify_data",
            "title": "See the penalty record on the agency portal",
            "description": (
                "Every federal enforcement action is searchable: "
                "OSHA, EPA, SEC, and CFPB all publish penalty data. "
                "Find the records on the agency that wrote the fines."
            ),
            "is_passive": 1,
            "external_url": "https://www.osha.gov/enforcement",
            "display_order": 20,
        },
    ],
    ("enforcement_immunity", "*"): [
        {
            "action_type": "verify_data",
            "title": "Compare lobbying spend vs enforcement record",
            "description": (
                "Senate LDA filings show lobbying spend; agency "
                "enforcement portals show penalty trends. The "
                "before-and-after tells you the story."
            ),
            "is_passive": 1,
            "external_url": "https://lda.senate.gov/system/public/",
            "display_order": 20,
        },
    ],
    ("enforcement_gap", "*"): [
        {
            "action_type": "verify_data",
            "title": "Browse agency enforcement records",
            "description": (
                "Most federal regulators publish their enforcement "
                "data. EPA's ECHO and OSHA's enforcement page are "
                "the easiest places to start."
            ),
            "is_passive": 1,
            "external_url": "https://echo.epa.gov/",
            "display_order": 20,
        },
    ],

    # --- Tax/budget influence ---
    ("tax_lobbying", "*"): [
        {
            "action_type": "call_rep",
            "title": "Tell your rep how you feel about tax-policy lobbying",
            "description": (
                "Tax-policy lobbying is dominated by corporate "
                "interests. Your rep is on the receiving end — make "
                "sure your voice is too."
            ),
            "is_passive": 0,
            "script_template": (
                "Hi, I'm a constituent in {state}. I'm calling about "
                "the corporate tax-policy lobbying covered in The "
                "Influence Journal. I want the Representative to "
                "support transparency in tax policy and reject "
                "carve-outs that favor large corporations over working "
                "families."
            ),
            "external_url": "https://www.house.gov/representatives/find-your-representative",
            "display_order": 10,
        },
        {
            "action_type": "verify_data",
            "title": "Browse the tax-related LDA filings",
            "description": (
                "Senate LDA's filing search lets you filter by "
                "lobbying issue. Pick 'TAX' to see every tax-policy "
                "filing on record."
            ),
            "is_passive": 1,
            "external_url": "https://lda.senate.gov/system/public/",
            "display_order": 20,
        },
    ],
    ("budget_lobbying", "*"): [
        {
            "action_type": "call_rep",
            "title": "Tell your rep what you want in the budget",
            "description": (
                "Budget lobbying is where most influence happens "
                "out of the headlines. Your rep votes on the bill "
                "either way; tell them what matters to you."
            ),
            "is_passive": 0,
            "script_template": (
                "Hi, I'm a constituent in {state}. I read about "
                "corporate budget lobbying in The Influence Journal. "
                "I want the Representative to push for a budget "
                "process that prioritizes working families over "
                "corporate carve-outs."
            ),
            "external_url": "https://www.house.gov/representatives/find-your-representative",
            "display_order": 10,
        },
    ],
    ("budget_influence", "*"): [
        {
            "action_type": "verify_data",
            "title": "See the budget-related LDA filings",
            "description": (
                "Senate LDA filings filter by issue. Pick 'BUD' to "
                "see every budget-related filing in this story's "
                "data window."
            ),
            "is_passive": 1,
            "external_url": "https://lda.senate.gov/system/public/",
            "display_order": 20,
        },
    ],

    # --- Cross-cutting ---
    ("cross_sector", "*"): [
        {
            "action_type": "verify_data",
            "title": "Cross-check the entity across sectors",
            "description": (
                "Search the entity by name on USAspending and the "
                "Senate LDA to see every sector it touches at the "
                "federal level."
            ),
            "is_passive": 1,
            "external_url": "https://www.usaspending.gov/",
            "display_order": 20,
        },
    ],
    ("full_influence_loop", "*"): [
        {
            "action_type": "verify_data",
            "title": "Walk the loop on the underlying datasets",
            "description": (
                "Senate LDA, FEC PAC data, and USAspending together "
                "let you verify each step: lobby spend → PAC donation "
                "→ committee vote → contract win."
            ),
            "is_passive": 1,
            "external_url": "https://www.usaspending.gov/",
            "display_order": 20,
        },
    ],
    ("regulatory_loop", "*"): [
        {
            "action_type": "verify_data",
            "title": "Look up the rulemaking on Regulations.gov",
            "description": (
                "Regulations.gov publishes the public comment record "
                "for every major federal rule. See who weighed in "
                "and what they wanted."
            ),
            "is_passive": 1,
            "external_url": "https://www.regulations.gov/",
            "display_order": 20,
        },
    ],
    ("regulatory_capture", "*"): [
        {
            "action_type": "verify_data",
            "title": "Look up the agency on Regulations.gov",
            "description": (
                "Public comment records on Regulations.gov show "
                "which industry groups dominated each rulemaking — "
                "the strongest evidence of capture."
            ),
            "is_passive": 1,
            "external_url": "https://www.regulations.gov/",
            "display_order": 20,
        },
    ],
    ("regulatory_arbitrage", "*"): [
        {
            "action_type": "verify_data",
            "title": "Compare the agencies on Regulations.gov",
            "description": (
                "Regulatory arbitrage shows up in the public comment "
                "record. Compare the same company's filings across "
                "different agencies."
            ),
            "is_passive": 1,
            "external_url": "https://www.regulations.gov/",
            "display_order": 20,
        },
    ],
    ("education_pipeline", "*"): [
        {
            "action_type": "verify_data",
            "title": "Browse the education-related LDA filings",
            "description": (
                "Senate LDA filters by lobbying issue. Pick 'EDU' to "
                "see every education-related filing on record."
            ),
            "is_passive": 1,
            "external_url": "https://lda.senate.gov/system/public/",
            "display_order": 20,
        },
    ],
}


# ---------------------------------------------------------------------------
# Seeder
# ---------------------------------------------------------------------------

def _recipes_for_story(story: Story) -> List[dict]:
    """Pick the action recipes for a story.

    Layered: category-specific first, then sector defaults, then the
    universal fallback. De-duped by (action_type, external_url) so the
    layers can overlap without producing duplicates. Capped at 5.
    """
    cat = (story.category or "").lower()
    sec = (story.sector or "").lower()

    recipes: List[dict] = []
    seen: set = set()

    def push(r: dict) -> None:
        key = (r.get("action_type"), r.get("external_url"))
        if key in seen:
            return
        seen.add(key)
        recipes.append(r)

    # 1. Category-specific (sector first, then any)
    for r in CATEGORY_RECIPES.get((cat, sec), []):
        push(r)
    for r in CATEGORY_RECIPES.get((cat, "*"), []):
        push(r)

    # 2. Sector defaults
    for r in SECTOR_DEFAULTS.get(sec, []):
        push(r)

    # 3. Universal fallback
    for r in UNIVERSAL_DEFAULTS:
        push(r)

    return recipes[:5]


def seed_one(db, story: Story, replace: bool = False, dry_run: bool = False) -> int:
    """Seed actions for a single story. Returns the number of rows
    inserted (0 if skipped)."""
    existing = (
        db.query(StoryAction).filter(StoryAction.story_id == story.id).count()
    )
    if existing and not replace:
        log.info("skip %s — already has %d actions", story.slug, existing)
        return 0
    if existing and replace and not dry_run:
        log.info("wiping %d existing actions for %s", existing, story.slug)
        db.query(StoryAction).filter(StoryAction.story_id == story.id).delete()
        db.flush()

    recipes = _recipes_for_story(story)
    if not recipes:
        log.info("no recipes match %s (cat=%s sec=%s)", story.slug, story.category, story.sector)
        return 0

    inserted = 0
    for r in recipes:
        try:
            atype = StoryAction.validate_action_type(r["action_type"])
        except ValueError as e:
            log.warning("recipe rejected for %s: %s", story.slug, e)
            continue
        row = StoryAction(
            story_id=story.id,
            action_type=atype,
            title=r["title"],
            description=r.get("description"),
            is_passive=int(r.get("is_passive", 0)),
            geographic_filter=r.get("geographic_filter"),
            script_template=r.get("script_template"),
            external_url=r.get("external_url"),
            display_order=int(r.get("display_order", 50)),
        )
        if not dry_run:
            db.add(row)
        inserted += 1

    log.info(
        "%s %s [cat=%s sec=%s] +%d actions",
        "DRY-RUN" if dry_run else "OK",
        story.slug,
        story.category,
        story.sector,
        inserted,
    )
    return inserted


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed StoryAction rows")
    parser.add_argument("--dry-run", action="store_true", help="Don't write")
    parser.add_argument("--replace", action="store_true", help="Wipe existing actions before reseeding")
    parser.add_argument("--slug", default=None, help="Limit to one story slug")
    parser.add_argument(
        "--include-archived", action="store_true",
        help="Also seed archived/retracted stories (default: only published)",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        q = db.query(Story)
        if args.slug:
            q = q.filter(Story.slug == args.slug)
        elif not args.include_archived:
            q = q.filter(Story.status == "published")
        stories: List[Story] = q.order_by(Story.id.asc()).all()
        log.info("targeting %d stories", len(stories))

        total = 0
        for s in stories:
            total += seed_one(db, s, replace=args.replace, dry_run=args.dry_run)

        if args.dry_run:
            log.info("dry-run: would have inserted %d StoryAction rows", total)
            db.rollback()
        else:
            db.commit()
            log.info("committed %d StoryAction rows", total)
        return 0
    except Exception:
        db.rollback()
        log.exception("seed failed")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
