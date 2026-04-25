"""Patch Veritas api_models.py to add persistent rate-limit state.

Run on the Hetzner box where Veritas lives. Idempotent: noop if already applied.
"""
from pathlib import Path

p = Path('/home/dshon/veritas-service/src/veritas/api_models.py')
src = p.read_text()

if '_rate_load_state' in src:
    print('Already patched.')
    raise SystemExit(0)

# Insert persistence helpers right after the read-rate-limiter and before
# the validation enums section.
old_anchor = '''# ---------------------------------------------------------------------------
# Validation enums
# ---------------------------------------------------------------------------
'''

new_block = '''# ---------------------------------------------------------------------------
# Rate-limit state persistence
#
# In-memory dicts above used to reset on every restart, letting an attacker
# bypass per-IP limits by triggering a deploy or systemd restart (Apr 24
# audit V4). We snapshot the buckets to data/rate_limit_state.json on a
# 30-second timer and on shutdown, restore on startup, and drop entries
# older than our window so a long downtime cannot replay stale data.
# ---------------------------------------------------------------------------

import atexit
import json

_RATE_PERSIST_PATH = settings.data_dir / "rate_limit_state.json"
_RATE_PERSIST_INTERVAL = 30.0
_rate_last_persist: float = 0.0


def _rate_persist_now() -> None:
    """Best-effort snapshot of both buckets to disk."""
    global _rate_last_persist
    try:
        with _RATE_LIMIT_LOCK:
            payload = {
                "write": dict(_RATE_LIMIT_STORE),
                "read": dict(_READ_RATE_STORE),
                "snapshot_at": time.time(),
            }
        _RATE_PERSIST_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp = _RATE_PERSIST_PATH.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload))
        tmp.replace(_RATE_PERSIST_PATH)
        _rate_last_persist = time.time()
    except Exception:
        # Persistence is best-effort. Never let it break a request.
        pass


def _rate_load_state() -> None:
    """Restore on startup. Drop entries older than the longest window."""
    if not _RATE_PERSIST_PATH.exists():
        return
    try:
        data = json.loads(_RATE_PERSIST_PATH.read_text())
        max_window = max(_RATE_LIMIT_WINDOW, _READ_RATE_WINDOW)
        cutoff = time.time() - max_window
        with _RATE_LIMIT_LOCK:
            for ip, ts_list in (data.get("write") or {}).items():
                fresh = [float(t) for t in ts_list if float(t) > cutoff]
                if fresh:
                    _RATE_LIMIT_STORE[ip] = fresh
            for ip, ts_list in (data.get("read") or {}).items():
                fresh = [float(t) for t in ts_list if float(t) > cutoff]
                if fresh:
                    _READ_RATE_STORE[ip] = fresh
    except Exception:
        pass


def _rate_maybe_persist() -> None:
    """Hot-path hook. Only flushes when the interval has elapsed."""
    global _rate_last_persist
    now = time.time()
    if now - _rate_last_persist >= _RATE_PERSIST_INTERVAL:
        _rate_persist_now()


_rate_load_state()
atexit.register(_rate_persist_now)


# ---------------------------------------------------------------------------
# Validation enums
# ---------------------------------------------------------------------------
'''

if old_anchor not in src:
    raise SystemExit('ANCHOR NOT FOUND')
src = src.replace(old_anchor, new_block, 1)

# Wire up the maybe_persist hook at the end of both rate-limit functions.
old_write = '''        _RATE_LIMIT_STORE[client_ip].append(now)


# Read-endpoint rate limiter'''
new_write = '''        _RATE_LIMIT_STORE[client_ip].append(now)
    _rate_maybe_persist()


# Read-endpoint rate limiter'''
if old_write not in src:
    raise SystemExit('WRITE-LIMITER ANCHOR NOT FOUND')
src = src.replace(old_write, new_write, 1)

old_read = '''        _READ_RATE_STORE[client_ip].append(now)


# ---------------------------------------------------------------------------
# Rate-limit state persistence'''
new_read = '''        _READ_RATE_STORE[client_ip].append(now)
    _rate_maybe_persist()


# ---------------------------------------------------------------------------
# Rate-limit state persistence'''
if old_read not in src:
    raise SystemExit('READ-LIMITER ANCHOR NOT FOUND')
src = src.replace(old_read, new_read, 1)

p.write_text(src)
print('OK patched api_models.py')
