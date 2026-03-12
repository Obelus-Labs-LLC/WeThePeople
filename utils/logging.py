"""
Canonical Logging Module

Single source of truth for audit-grade logging.
Uses Python stdlib logging with structured context fields.

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

import logging
import sys
import os
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


class StructuredFormatter(logging.Formatter):
    """Formatter that includes structured fields in output."""

    EXTRA_FIELDS = [
        'run_id', 'person_id', 'bioguide_id', 'source_url', 'step',
        'count', 'elapsed_ms', 'job', 'connector', 'institution_id',
        'company_id', 'bill_id', 'error_type',
    ]

    def format(self, record):
        base = super().format(record)

        extras = []
        for field in self.EXTRA_FIELDS:
            if hasattr(record, field):
                value = getattr(record, field)
                extras.append(f"{field}={value}")

        if extras:
            return f"{base} | {' '.join(extras)}"
        return base


def _make_formatter():
    return StructuredFormatter(
        fmt='%(asctime)s | %(levelname)-8s | %(name)s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
    )


def get_logger(name: str, level: Optional[str] = None) -> logging.Logger:
    """
    Get or create a logger with structured formatting.

    Outputs to both stdout and a rotating file (logs/wtp.log).
    File rotation: 10 MB max per file, 5 backups kept.

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
    Configure global logging level.
    """
    log_level = getattr(logging, level.upper(), logging.INFO)
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s | %(levelname)-8s | %(name)s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
    )
