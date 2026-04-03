"""
Influence network graph builder.

The full network builder is available in the wtp-core private package.
This stub provides basic functionality for open-source users.
"""

import logging

logger = logging.getLogger(__name__)

try:
    from wtp_core.influence.network import build_influence_network
except ImportError:
    logger.info("wtp-core not installed. Using stub influence network.")

    def build_influence_network(db, entity_type, entity_id, depth=1, limit=50):
        return {"nodes": [], "edges": [], "message": "Influence network requires wtp-core package."}
