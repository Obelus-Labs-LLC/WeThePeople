"""
Canonical Logging Module

Single source of truth for audit-grade logging.
Uses Python stdlib logging with structured context fields.

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
from typing import Optional


# Singleton logger registry
_loggers = {}


class StructuredFormatter(logging.Formatter):
    """Formatter that includes structured fields in output."""
    
    def format(self, record):
        # Build base message
        base = super().format(record)
        
        # Add structured fields if present
        extras = []
        for field in ['run_id', 'person_id', 'bioguide_id', 'source_url', 'step', 'count', 'elapsed_ms']:
            if hasattr(record, field):
                value = getattr(record, field)
                extras.append(f"{field}={value}")
        
        if extras:
            return f"{base} | {' '.join(extras)}"
        return base


def get_logger(name: str, level: Optional[str] = None) -> logging.Logger:
    """
    Get or create a logger with structured formatting.
    
    Args:
        name: Logger name (typically __name__)
        level: Optional logging level (DEBUG, INFO, WARNING, ERROR)
               Defaults to INFO
    
    Returns:
        Configured logger instance
    """
    if name in _loggers:
        return _loggers[name]
    
    logger = logging.getLogger(name)
    
    # Set level
    log_level = level or logging.INFO
    if isinstance(log_level, str):
        log_level = getattr(logging, log_level.upper(), logging.INFO)
    logger.setLevel(log_level)
    
    # Add handler if not already present
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(log_level)
        
        # Use structured formatter
        formatter = StructuredFormatter(
            fmt='%(asctime)s | %(levelname)-8s | %(name)s | %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    
    # Prevent propagation to avoid duplicate logs
    logger.propagate = False
    
    _loggers[name] = logger
    return logger


# Convenience function for quick logging setup
def setup_logging(level: str = "INFO"):
    """
    Configure global logging level.
    
    Args:
        level: Logging level (DEBUG, INFO, WARNING, ERROR)
    """
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format='%(asctime)s | %(levelname)-8s | %(name)s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
