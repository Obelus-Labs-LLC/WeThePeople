"""
Claim evaluation engine.

The full evaluator is in the wtp-core private package.
"""

import logging

logger = logging.getLogger(__name__)

try:
    from wtp_core.claims.evaluate import evaluate_claim
except ImportError:
    logger.info("wtp-core not installed. Using stub evaluator.")

    def evaluate_claim(db, claim, action_matches, **kwargs):
        return {
            "tier": "unverified",
            "score": 0.0,
            "evidence": [],
            "summary": "Evaluation requires wtp-core package.",
        }
