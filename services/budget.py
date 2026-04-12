"""
Shared Claude API budget tracking for WeThePeople.

All files that make Anthropic API calls should use this module to:
1. Check remaining balance before calling
2. Record spend after calling

The budget ledger at ~/.claude_api_budget.json is shared across
WeThePeople, HedgeBrain, Guardian, HB_Futures, and CrusadeCommand.
"""

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

# Cross-platform file locking
try:
    import fcntl
    def _lock_file(f):
        fcntl.flock(f, fcntl.LOCK_EX)
    def _unlock_file(f):
        fcntl.flock(f, fcntl.LOCK_UN)
except ImportError:
    try:
        import msvcrt
        def _lock_file(f):
            lock_size = max(os.fstat(f.fileno()).st_size, 1)
            msvcrt.locking(f.fileno(), msvcrt.LK_LOCK, lock_size)
        def _unlock_file(f):
            try:
                lock_size = max(os.fstat(f.fileno()).st_size, 1)
                msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, lock_size)
            except OSError:
                pass
    except ImportError:
        def _lock_file(f):
            pass
        def _unlock_file(f):
            pass

logger = logging.getLogger(__name__)

BUDGET_FILE = Path(os.path.expanduser("~/.claude_api_budget.json"))
PROJECT_KEY = "wethepeople"

# Pricing per 1M tokens
PRICING = {
    "claude-sonnet-4-20250514": {"input": 3.0, "output": 15.0},
    "claude-haiku-4-5-20251001": {"input": 1.0, "output": 5.0},
    "claude-opus-4-6": {"input": 15.0, "output": 75.0},
    "claude-opus-4-20250514": {"input": 15.0, "output": 75.0},
}


def log_token_usage(feature: str, model: str, input_tokens: int, output_tokens: int,
                    cost: float = 0.0, detail: str = "") -> None:
    """Log a single API call to the token_usage_log table.

    Call this after every Anthropic API call. The feature parameter
    identifies what triggered the call.

    Features: 'chat_agent', 'story_opus', 'ai_summarize',
    'claims_pipeline', 'twitter_bot', 'enrichment', 'test'
    """
    db = None
    try:
        from models.database import SessionLocal
        from models.token_usage import TokenUsageLog
        db = SessionLocal()
        if cost <= 0:
            cost = compute_cost(model, input_tokens, output_tokens)
        db.add(TokenUsageLog(
            feature=feature,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
            cost_usd=round(cost, 6),
            detail=(detail or "")[:500],
        ))
        db.commit()
    except Exception as e:
        logger.warning("Failed to log token usage for feature=%s model=%s: %s", feature, model, e)
        if db:
            db.rollback()
    finally:
        if db:
            db.close()


def load_ledger() -> Dict[str, Any]:
    """Load the shared budget ledger with file locking."""
    if BUDGET_FILE.exists():
        try:
            with open(BUDGET_FILE, "r") as f:
                _lock_file(f)
                try:
                    return json.loads(f.read())
                finally:
                    _unlock_file(f)
        except (json.JSONDecodeError, Exception) as e:
            logger.warning("Budget ledger corrupted or unreadable, using defaults: %s", e)
    return {
        "month": datetime.now(timezone.utc).strftime("%Y-%m"),
        "remaining_balance": 10.38,
    }


def save_ledger(ledger: Dict[str, Any]) -> None:
    """Save budget ledger atomically with file locking."""
    BUDGET_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(BUDGET_FILE, "w") as f:
        _lock_file(f)
        try:
            f.write(json.dumps(ledger, indent=2, default=str))
        finally:
            _unlock_file(f)


def check_budget(estimated_cost: float = 0.01) -> Tuple[bool, float]:
    """
    Check if we have enough budget remaining.

    Returns:
        (allowed, remaining_balance)
    """
    ledger = load_ledger()
    remaining = ledger.get("remaining_balance", 0)
    if remaining < estimated_cost:
        logger.warning(
            "Budget check failed: $%.4f remaining, need $%.4f",
            remaining, estimated_cost
        )
        return False, remaining
    return True, remaining


def reserve_and_spend(estimated_cost: float, cost: float, model: str = "",
                      input_tokens: int = 0, output_tokens: int = 0) -> Tuple[bool, float]:
    """
    Atomically check budget and record spend under a single file lock.

    Prevents concurrent callers from overdrawing by combining check + spend
    into one locked operation.

    Returns:
        (allowed, remaining_balance_after)
    """
    if cost <= 0:
        return True, load_ledger().get("remaining_balance", 0)

    BUDGET_FILE.parent.mkdir(parents=True, exist_ok=True)
    # Open for read+write to hold lock across check and write
    try:
        with open(BUDGET_FILE, "r+") as f:
            _lock_file(f)
            try:
                ledger = json.loads(f.read())
            except (json.JSONDecodeError, ValueError):
                ledger = {"month": datetime.now(timezone.utc).strftime("%Y-%m"), "remaining_balance": 10.38}

            remaining = ledger.get("remaining_balance", 0)
            if remaining < estimated_cost:
                _unlock_file(f)
                logger.warning("Budget reserve failed: $%.4f remaining, need $%.4f", remaining, estimated_cost)
                return False, remaining

            # Ensure WTP entry exists
            if PROJECT_KEY not in ledger:
                ledger[PROJECT_KEY] = {"total_cost": 0.0, "call_count": 0, "last_call": None}
            wtp = ledger[PROJECT_KEY]
            wtp["total_cost"] = round(wtp.get("total_cost", 0.0) + cost, 6)
            wtp["call_count"] = wtp.get("call_count", 0) + 1
            wtp["last_call"] = datetime.now(timezone.utc).isoformat()
            ledger["remaining_balance"] = round(remaining - cost, 6)

            f.seek(0)
            f.truncate()
            f.write(json.dumps(ledger, indent=2, default=str))
            _unlock_file(f)

        logger.info(
            "Budget: WTP spent $%.4f (%s, %d in/%d out), total $%.4f, $%.2f remaining",
            cost, model or "unknown", input_tokens, output_tokens,
            wtp["total_cost"], ledger["remaining_balance"]
        )
        return True, ledger["remaining_balance"]
    except FileNotFoundError:
        # File doesn't exist yet — fall back to record_spend
        record_spend(cost, model, input_tokens, output_tokens)
        return True, load_ledger().get("remaining_balance", 0)


def record_spend(cost: float, model: str = "", input_tokens: int = 0, output_tokens: int = 0) -> None:
    """
    Record API spend for WeThePeople and decrement remaining_balance.

    Args:
        cost: Dollar amount spent
        model: Model used (for logging)
        input_tokens: Input token count (for logging)
        output_tokens: Output token count (for logging)
    """
    if cost <= 0:
        return

    ledger = load_ledger()

    # Ensure WTP entry exists
    if PROJECT_KEY not in ledger:
        ledger[PROJECT_KEY] = {
            "total_cost": 0.0,
            "call_count": 0,
            "last_call": None,
        }

    wtp = ledger[PROJECT_KEY]
    wtp["total_cost"] = round(wtp.get("total_cost", 0.0) + cost, 6)
    wtp["call_count"] = wtp.get("call_count", 0) + 1
    wtp["last_call"] = datetime.now(timezone.utc).isoformat()

    # Decrement remaining_balance
    ledger["remaining_balance"] = round(
        ledger.get("remaining_balance", 0) - cost, 6
    )

    save_ledger(ledger)

    logger.info(
        "Budget: WTP spent $%.4f (%s, %d in/%d out), total $%.4f, $%.2f remaining",
        cost, model or "unknown", input_tokens, output_tokens,
        wtp["total_cost"], ledger["remaining_balance"]
    )


def compute_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Compute dollar cost from token counts and model."""
    pricing = PRICING.get(model, {"input": 3.0, "output": 15.0})
    return (input_tokens * pricing["input"] / 1_000_000) + (output_tokens * pricing["output"] / 1_000_000)
