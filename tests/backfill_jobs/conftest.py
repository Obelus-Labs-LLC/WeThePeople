"""Lightweight conftest for the smoke tests.

We can't reuse the project-level conftest at tests/conftest.py because
that file constructs a SQLAlchemy engine with kwargs that aren't valid
for the in-memory sqlite test DB ('max_overflow' isn't a SingletonThreadPool
param). Until that's fixed at the root we sidestep with our own
sys.path setup so `import jobs.backfill_*` works.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
