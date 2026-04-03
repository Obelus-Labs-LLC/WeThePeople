"""
Claims verification pipeline.

The full pipeline is available in the wtp-core private package.
This stub provides basic functionality for open-source users.
"""

import logging

logger = logging.getLogger(__name__)

try:
    from wtp_core.claims.pipeline import (
        run_verification,
        run_verification_from_url,
    )
except ImportError:
    logger.info("wtp-core not installed. Using stub verification pipeline.")

    def run_verification(db, text, entity_id, entity_type, source_url=None):
        return {
            "entity_id": entity_id,
            "entity_type": entity_type,
            "source_url": source_url,
            "claims_extracted": 0,
            "verifications": [],
            "summary": "Verification pipeline requires wtp-core package.",
        }

    def run_verification_from_url(db, url, entity_id, entity_type):
        return run_verification(db, "", entity_id, entity_type, source_url=url)
