"""
Circuit Breaker Pattern Implementation

Protects external API calls from cascading failures. When a connector
starts failing, the circuit opens and fast-fails subsequent requests
instead of waiting for timeouts.

States:
  CLOSED   — Normal operation. Failures are counted.
  OPEN     — Too many failures. All calls rejected with CircuitOpenError.
  HALF_OPEN — After recovery_timeout, one probe request is allowed through.
              Success → CLOSED. Failure → OPEN again.

Usage:
    breaker = get_breaker("senate_lda")
    result = breaker.call(fetch_lobbying_filings, "APPLE INC", filing_year=2024)

Or via decorator (see connectors/_base.py):
    @with_circuit_breaker("senate_lda")
    def fetch_lobbying_filings(...): ...
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, Optional, Tuple, Type

from utils.logging import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# States & Exceptions
# ---------------------------------------------------------------------------

class CircuitState(str, Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class CircuitOpenError(Exception):
    """Raised when the circuit is open and rejecting calls."""

    def __init__(self, name: str, remaining_seconds: float):
        self.name = name
        self.remaining_seconds = remaining_seconds
        super().__init__(
            f"Circuit '{name}' is OPEN. "
            f"Retry in {remaining_seconds:.1f}s."
        )


# ---------------------------------------------------------------------------
# Metrics snapshot
# ---------------------------------------------------------------------------

@dataclass
class CircuitMetrics:
    state: CircuitState
    failure_count: int
    success_count: int
    total_calls: int
    total_failures: int
    total_successes: int
    last_failure_time: Optional[float]
    last_success_time: Optional[float]
    opened_at: Optional[float]
    half_open_at: Optional[float]


# ---------------------------------------------------------------------------
# Circuit Breaker
# ---------------------------------------------------------------------------

class CircuitBreaker:
    """
    Thread-safe circuit breaker for external service calls.

    Args:
        name:                Logical name (e.g. 'senate_lda', 'usaspending').
        failure_threshold:   Consecutive failures before opening the circuit.
        recovery_timeout:    Seconds to wait in OPEN before trying HALF_OPEN.
        expected_exceptions: Tuple of exception types that count as failures.
                             Other exceptions propagate without tripping the breaker.
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 60.0,
        expected_exceptions: Tuple[Type[BaseException], ...] = (Exception,),
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exceptions = expected_exceptions

        self._lock = threading.Lock()
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0

        # Lifetime counters
        self._total_calls = 0
        self._total_failures = 0
        self._total_successes = 0

        # Timestamps
        self._last_failure_time: Optional[float] = None
        self._last_success_time: Optional[float] = None
        self._opened_at: Optional[float] = None
        self._half_open_at: Optional[float] = None

    # -- Public API ----------------------------------------------------------

    def call(self, func: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        """
        Execute *func* through the circuit breaker.

        Raises CircuitOpenError when the circuit is OPEN and the recovery
        timeout has not elapsed.
        """
        with self._lock:
            self._total_calls += 1
            state = self._current_state_unlocked()

            if state == CircuitState.OPEN:
                remaining = self._seconds_until_recovery()
                raise CircuitOpenError(self.name, remaining)

            # CLOSED or HALF_OPEN — let the call through

        # Execute outside the lock so we don't block other threads
        try:
            result = func(*args, **kwargs)
        except BaseException as exc:
            if isinstance(exc, self.expected_exceptions):
                self._record_failure()
                raise
            # Unexpected exception type — propagate without tripping breaker
            raise
        else:
            self._record_success()
            return result

    def get_state(self) -> CircuitMetrics:
        """Return a snapshot of the breaker's current state and metrics."""
        with self._lock:
            return CircuitMetrics(
                state=self._current_state_unlocked(),
                failure_count=self._failure_count,
                success_count=self._success_count,
                total_calls=self._total_calls,
                total_failures=self._total_failures,
                total_successes=self._total_successes,
                last_failure_time=self._last_failure_time,
                last_success_time=self._last_success_time,
                opened_at=self._opened_at,
                half_open_at=self._half_open_at,
            )

    def reset(self) -> None:
        """Manually reset the breaker to CLOSED."""
        with self._lock:
            self._transition_to_closed()
            logger.info("Circuit '%s' manually reset to CLOSED", self.name)

    # -- Internal state management -------------------------------------------

    def _current_state_unlocked(self) -> CircuitState:
        """
        Evaluate the real state (caller must hold self._lock).

        If the breaker is OPEN and the recovery timeout has elapsed,
        transition to HALF_OPEN automatically.
        """
        if self._state == CircuitState.OPEN:
            if self._seconds_until_recovery() <= 0:
                self._state = CircuitState.HALF_OPEN
                self._half_open_at = time.monotonic()
                logger.info(
                    "Circuit '%s' → HALF_OPEN (probing)",
                    self.name,
                )
        return self._state

    def _seconds_until_recovery(self) -> float:
        """Seconds remaining before the OPEN circuit can try HALF_OPEN."""
        if self._opened_at is None:
            return 0.0
        elapsed = time.monotonic() - self._opened_at
        return max(0.0, self.recovery_timeout - elapsed)

    def _record_failure(self) -> None:
        with self._lock:
            self._failure_count += 1
            self._total_failures += 1
            self._last_failure_time = time.monotonic()

            if self._state == CircuitState.HALF_OPEN:
                # Probe failed — reopen
                self._transition_to_open()
                logger.warning(
                    "Circuit '%s' HALF_OPEN probe failed → OPEN",
                    self.name,
                )
            elif (
                self._state == CircuitState.CLOSED
                and self._failure_count >= self.failure_threshold
            ):
                self._transition_to_open()
                logger.warning(
                    "Circuit '%s' hit %d failures → OPEN (recovery in %ds)",
                    self.name,
                    self._failure_count,
                    self.recovery_timeout,
                )

    def _record_success(self) -> None:
        with self._lock:
            self._success_count += 1
            self._total_successes += 1
            self._last_success_time = time.monotonic()

            if self._state == CircuitState.HALF_OPEN:
                # Probe succeeded — close the circuit
                self._transition_to_closed()
                logger.info(
                    "Circuit '%s' HALF_OPEN probe succeeded → CLOSED",
                    self.name,
                )
            elif self._state == CircuitState.CLOSED:
                # Reset consecutive failure counter on success
                self._failure_count = 0

    def _transition_to_open(self) -> None:
        """Caller must hold self._lock."""
        self._state = CircuitState.OPEN
        self._opened_at = time.monotonic()
        self._half_open_at = None

    def _transition_to_closed(self) -> None:
        """Caller must hold self._lock."""
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._opened_at = None
        self._half_open_at = None


# ---------------------------------------------------------------------------
# Module-level registry
# ---------------------------------------------------------------------------

_registry: Dict[str, CircuitBreaker] = {}
_registry_lock = threading.Lock()


def get_breaker(
    name: str,
    failure_threshold: int = 5,
    recovery_timeout: float = 60.0,
    expected_exceptions: Tuple[Type[BaseException], ...] = (Exception,),
) -> CircuitBreaker:
    """
    Return the named breaker, creating it on first access.

    Subsequent calls with the same *name* return the existing breaker
    (constructor args are ignored after creation).
    """
    with _registry_lock:
        if name not in _registry:
            _registry[name] = CircuitBreaker(
                name=name,
                failure_threshold=failure_threshold,
                recovery_timeout=recovery_timeout,
                expected_exceptions=expected_exceptions,
            )
            logger.debug("Registered circuit breaker '%s'", name)
        return _registry[name]


def get_all_breakers() -> Dict[str, CircuitBreaker]:
    """Return a snapshot of all registered breakers."""
    with _registry_lock:
        return dict(_registry)


def reset_all() -> None:
    """Reset every registered breaker to CLOSED. Useful in tests."""
    with _registry_lock:
        for breaker in _registry.values():
            breaker.reset()
