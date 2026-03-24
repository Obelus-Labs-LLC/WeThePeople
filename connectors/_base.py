"""
Connector Base — Circuit Breaker Integration

Provides the @with_circuit_breaker decorator for wrapping external API
connector functions. When a connector's upstream service starts failing,
the circuit opens and fast-fails instead of blocking on timeouts.

Usage in any connector module:

    from connectors._base import with_circuit_breaker

    @with_circuit_breaker("senate_lda")
    def fetch_lobbying_filings(client_name, filing_year=None, limit=100):
        ...

The decorator is transparent: it preserves the function signature, docstring,
and return type. When the circuit is open, it raises CircuitOpenError.

Default breaker configs per connector are defined in BREAKER_CONFIGS below.
Override by passing kwargs to the decorator.
"""

from __future__ import annotations

import functools
import requests
from typing import Any, Callable, Dict, Optional, Tuple, Type

from services.circuit_breaker import (
    CircuitBreaker,
    CircuitOpenError,
    get_breaker,
)
from utils.logging import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Default configurations per connector
# ---------------------------------------------------------------------------
# Keys are the breaker names used in @with_circuit_breaker("name").
# Values are kwargs passed to get_breaker() on first use.
#
# expected_exceptions: which exception types trip the breaker.
#   - requests errors (timeouts, connection errors, HTTP 5xx)
#   - We exclude 4xx client errors (those are our fault, not the service's)

_NETWORK_EXCEPTIONS: Tuple[Type[BaseException], ...] = (
    requests.exceptions.ConnectionError,
    requests.exceptions.Timeout,
    requests.exceptions.HTTPError,
    ConnectionError,
    TimeoutError,
    OSError,
)

BREAKER_CONFIGS: Dict[str, Dict[str, Any]] = {
    # Politics / Congressional
    "senate_lda": {
        "failure_threshold": 5,
        "recovery_timeout": 120.0,   # LDA is slow to recover
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "congress_api": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "congress_votes": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "fec": {
        "failure_threshold": 5,
        "recovery_timeout": 90.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "google_civic": {
        "failure_threshold": 3,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "openstates": {
        "failure_threshold": 3,
        "recovery_timeout": 120.0,  # Rate-limited, give it time
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },

    # Finance
    "sec_edgar": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "fdic_bankfind": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "alpha_vantage": {
        "failure_threshold": 3,
        "recovery_timeout": 120.0,  # Strict rate limits
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "cfpb_complaints": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "fred": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "fed_press": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },

    # Health
    "openfda": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "clinicaltrials": {
        "failure_threshold": 5,
        "recovery_timeout": 90.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "cms_payments": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },

    # Tech
    "patentsview": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },

    # Contracts / Enforcement / Lobbying (cross-sector)
    "usaspending": {
        "failure_threshold": 5,
        "recovery_timeout": 90.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "federal_register": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "ftc_cases": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },

    # Transportation
    "nhtsa": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "fueleconomy": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },

    # Energy
    "epa_ghgrp": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },

    # Sanctions / Social / Other
    "opensanctions": {
        "failure_threshold": 3,
        "recovery_timeout": 180.0,  # Expensive API, be conservative
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "twitter": {
        "failure_threshold": 3,
        "recovery_timeout": 300.0,  # Twitter rate limits are strict
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "datagov": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "govinfo": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "samgov": {
        "failure_threshold": 5,
        "recovery_timeout": 90.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "regulationsgov": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "it_dashboard": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "gsa_site_scanning": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "wikipedia": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
    "internet_archive": {
        "failure_threshold": 5,
        "recovery_timeout": 60.0,
        "expected_exceptions": _NETWORK_EXCEPTIONS,
    },
}


# ---------------------------------------------------------------------------
# Decorator
# ---------------------------------------------------------------------------

def with_circuit_breaker(
    name: str,
    failure_threshold: Optional[int] = None,
    recovery_timeout: Optional[float] = None,
    expected_exceptions: Optional[Tuple[Type[BaseException], ...]] = None,
) -> Callable:
    """
    Decorator that wraps a connector function with a named circuit breaker.

    Args:
        name:                Breaker name (should match a key in BREAKER_CONFIGS).
        failure_threshold:   Override the default failure threshold.
        recovery_timeout:    Override the default recovery timeout.
        expected_exceptions: Override the expected exception types.

    Example::

        @with_circuit_breaker("senate_lda")
        def fetch_lobbying_filings(client_name, filing_year=None):
            ...
    """
    # Merge explicit overrides with config defaults
    config = BREAKER_CONFIGS.get(name, {})
    breaker_kwargs = {
        "failure_threshold": failure_threshold or config.get("failure_threshold", 5),
        "recovery_timeout": recovery_timeout or config.get("recovery_timeout", 60.0),
        "expected_exceptions": expected_exceptions or config.get(
            "expected_exceptions", _NETWORK_EXCEPTIONS
        ),
    }

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            breaker = get_breaker(name, **breaker_kwargs)
            return breaker.call(func, *args, **kwargs)

        # Attach breaker reference for introspection
        wrapper._circuit_breaker_name = name  # type: ignore[attr-defined]
        return wrapper

    return decorator
