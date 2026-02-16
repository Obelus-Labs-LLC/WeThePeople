"""services.matching

This package is the single source of truth for claim matching.

It was converted from a single module (services/matching.py) into a package so we
can add submodules (e.g., fuzzy similarity helpers) without breaking imports.

Backwards compatibility:
	Existing imports like `from services.matching import compute_matches_for_claim`
	continue to work via re-exports from .core.
"""

from .core import *  # noqa: F401,F403

