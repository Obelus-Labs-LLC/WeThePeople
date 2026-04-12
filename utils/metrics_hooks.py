"""
Metrics callback hooks — allows the model layer to record metrics
without importing from the router layer (which would be an inverted dependency).

Usage (in routers/metrics.py at import time):
    from utils.metrics_hooks import set_db_query_hook
    set_db_query_hook(record_db_query)

Usage (in models/database.py):
    from utils.metrics_hooks import notify_db_query
    notify_db_query(slow=True)
"""

import threading
from typing import Callable, Optional

_lock = threading.Lock()
_db_query_hook: Optional[Callable[..., None]] = None


def set_db_query_hook(fn: Callable[..., None]) -> None:
    global _db_query_hook
    with _lock:
        _db_query_hook = fn


def notify_db_query(slow: bool = False) -> None:
    with _lock:
        hook = _db_query_hook
    if hook is not None:
        try:
            hook(slow=slow)
        except Exception:
            pass
