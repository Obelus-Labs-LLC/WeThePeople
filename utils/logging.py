"""
Canonical Logging Module

Single source of truth for audit-grade logging.
Uses Python stdlib logging with structured context fields.

Environment modes:
  - WTP_ENV=development  -> human-readable pipe-delimited format
  - WTP_ENV=production   -> JSON lines for log aggregation (default)

Logs to:
  - stdout (always)
  - Rotating file: logs/wtp.log (10 MB max, 5 backups = 60 MB ceiling)

Usage:
    from utils.logging import get_logger

    logger = get_logger(__name__)
    logger.info("Processing article", extra={
        "run_id": run_id,
        "person_id": person_id,
        "source_url": url,
        "step": "extraction",
        "count": 5,
        "elapsed_ms": 150
    })
"""

import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from typing import Optional
from pathlib import Path


# Singleton logger registry
_loggers = {}

# Log directory (relative to project root)
_LOG_DIR = Path(__file__).parent.parent / "logs"
_LOG_FILE = _LOG_DIR / "wtp.log"

# Ensure log directory exists
_LOG_DIR.mkdir(exist_ok=True)

# Environment detection
_WTP_ENV = os.getenv("WTP_ENV", "production").lower()
_IS_PRODUCTION = _WTP_ENV != "development"


def _get_trace_id():
    """Get the current request trace_id from context, if available."""
    try:
        from middleware.tracing import get_trace_id
        return get_trace_id()
    except (ImportError, LookupError):
        return None


# --- Known extra fields (superset for both formatters) ---
EXTRA_FIELDS = [
    'run_id', 'person_id', 'bioguide_id', 'source_url', 'step',
    'count', 'elapsed_ms', 'job', 'connector', 'institution_id',
    'company_id', 'bill_id', 'error_type', 'trace_id',
    'duration_ms', 'method', 'path', 'status_code', 'client_ip',
    'query_count', 'sql',
]


class JSONFormatter(logging.Formatter):
    """Outputs one JSON object per log line for production log aggregation.

    Fields: timestamp, level, logger_name, message, trace_id, duration_ms,
    plus any extra fields passed via the `extra` kwarg.
    """

    def format(self, record):
        log_entry = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger_name": record.name,
            "message": record.getMessage(),
        }

        # Inject trace_id from context var if not explicitly provided
        trace_id = getattr(record, 'trace_id', None) or _get_trace_id()
        if trace_id:
            log_entry["trace_id"] = trace_id

        # Collect all known extra fields
        for field in EXTRA_FIELDS:
            if field == 'trace_id':
                continue  # already handled
            value = getattr(record, field, None)
            if value is not None:
                log_entry[field] = value

        # Include exception info if present
        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry, default=str)


class StructuredFormatter(logging.Formatter):
    """Human-readable formatter for development. Includes structured fields."""

    def format(self, record):
        base = super().format(record)

        extras = []
        trace_id = getattr(record, 'trace_id', None) or _get_trace_id()
        if trace_id:
            extras.append(f"trace_id={trace_id}")

        for field in EXTRA_FIELDS:
            if field == 'trace_id':
                continue
            if hasattr(record, field):
                value = getattr(record, field)
                if value is not None:
                    extras.append(f"{field}={value}")

        if extras:
            return f"{base} | {' '.join(extras)}"
        return base


def _make_formatter():
    """Return the appropriate formatter based on WTP_ENV."""
    if _IS_PRODUCTION:
        return JSONFormatter()
    return StructuredFormatter(
        fmt='%(asctime)s | %(levelname)-8s | %(name)s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
    )


def get_logger(name: str, level: Optional[str] = None) -> logging.Logger:
    """
    Get or create a logger with structured formatting.

    Outputs to both stdout and a rotating file (logs/wtp.log).
    File rotation: 10 MB max per file, 5 backups kept.

    In production (default), outputs JSON lines.
    In development (WTP_ENV=development), outputs human-readable format.

    Args:
        name: Logger name (typically __name__)
        level: Optional logging level (DEBUG, INFO, WARNING, ERROR)

    Returns:
        Configured logger instance
    """
    if name in _loggers:
        return _loggers[name]

    logger = logging.getLogger(name)

    log_level = level or logging.INFO
    if isinstance(log_level, str):
        log_level = getattr(logging, log_level.upper(), logging.INFO)
    logger.setLevel(log_level)

    if not logger.handlers:
        formatter = _make_formatter()

        # Console handler (stdout)
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(log_level)
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

        # Rotating file handler
        try:
            file_handler = RotatingFileHandler(
                _LOG_FILE,
                maxBytes=10 * 1024 * 1024,  # 10 MB
                backupCount=5,
                encoding="utf-8",
            )
            file_handler.setLevel(log_level)
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
        except (OSError, PermissionError):
            # If we can't write to log file (e.g. read-only FS), just use console
            pass

    logger.propagate = False
    _loggers[name] = logger
    return logger


def setup_logging(level: str = "INFO"):
    """
    Configure global logging level and root logger format.
    Call once at application startup (main.py).
    """
    log_level = getattr(logging, level.upper(), logging.INFO)
    root = logging.getLogger()
    root.setLevel(log_level)

    # Remove existing handlers to avoid duplicates on re-init
    for h in root.handlers[:]:
        root.removeHandler(h)

    formatter = _make_formatter()
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)
    handler.setFormatter(formatter)
    root.addHandler(handler)
