"""
Claim extraction from text and URLs.

The full extractor is in the wtp-core private package.
"""

import logging

logger = logging.getLogger(__name__)

try:
    from wtp_core.claims.ingest import (
        extract_claims_from_text,
        extract_claims_from_url,
        persist_claims,
    )
except ImportError:
    logger.info("wtp-core not installed. Using stub claim extraction.")

    def extract_claims_from_text(text, person_name):
        return []

    def extract_claims_from_url(url, person_name):
        return []

    def persist_claims(db, raw_claims, entity_id, entity_type, source_url):
        return []
