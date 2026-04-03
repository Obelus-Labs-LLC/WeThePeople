"""
Claim matching engine.

The full matching engine with 9 matchers is available in the wtp-core private package.
This stub provides basic exports for open-source users.
"""

import logging

logger = logging.getLogger(__name__)

try:
    from wtp_core.claims.match import (
        compute_matches_for_claim,
        match_against_votes,
        match_against_trades,
        match_against_lobbying,
        match_against_contracts,
        match_against_enforcement,
        match_against_donations,
        match_against_committee_positions,
        match_against_sec_filings,
        detect_intent,
        score_action_against_claim,
        classify_progress,
        classify_timing,
        classify_relevance,
        resolve_evidence_tier,
        auto_classify_claim,
        get_profile,
        contains_gate_signal,
        contains_claim_signal,
        STOPWORDS_BASE,
        CATEGORY_PROFILES,
    )
except ImportError:
    logger.info("wtp-core not installed. Using stub matchers.")

    def compute_matches_for_claim(claim, db, limit=10):
        return {}

    def match_against_votes(text, entity_id, db, limit=10):
        return []

    def match_against_trades(text, entity_id, db, limit=10):
        return []

    def match_against_lobbying(text, entity_id, entity_type, db, limit=10):
        return []

    def match_against_contracts(text, entity_id, entity_type, db, limit=10):
        return []

    def match_against_enforcement(text, entity_id, entity_type, db, limit=10):
        return []

    def match_against_donations(text, entity_id, db, limit=10):
        return []

    def match_against_committee_positions(text, entity_id, db, limit=10):
        return []

    def match_against_sec_filings(text, entity_id, entity_type, db, limit=10):
        return []

    def detect_intent(text):
        return "unknown"

    def score_action_against_claim(claim, action, db=None):
        return 0.0

    def classify_progress(action):
        return "unknown"

    def classify_timing(claim, action):
        return "unknown"

    def classify_relevance(score):
        return "none"

    def resolve_evidence_tier(score):
        return "unverified"

    def auto_classify_claim(text):
        return "general"

    CATEGORY_PROFILES = {}
    STOPWORDS_BASE = set()

    def get_profile(category):
        return {}

    def contains_gate_signal(text):
        return False

    def contains_claim_signal(text):
        return False
