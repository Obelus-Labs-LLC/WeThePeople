"""
Chaos Engineering — Circuit Breaker Tests

Verifies that the circuit breaker:
  1. Opens after N consecutive failures
  2. Rejects calls while open (CircuitOpenError)
  3. Transitions to HALF_OPEN after recovery_timeout
  4. Closes again on a successful probe
  5. Reopens if the HALF_OPEN probe fails
  6. Is thread-safe under concurrent access
  7. Works correctly via the @with_circuit_breaker decorator
"""

import threading
import time
from unittest.mock import MagicMock

import pytest

from services.circuit_breaker import (
    CircuitBreaker,
    CircuitOpenError,
    CircuitState,
    get_breaker,
    get_all_breakers,
    reset_all,
)
from connectors._base import with_circuit_breaker


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class FlakyService:
    """Simulates an external service that fails on demand."""

    def __init__(self):
        self.call_count = 0
        self.should_fail = False
        self.fail_exception = ConnectionError

    def call(self, *args, **kwargs):
        self.call_count += 1
        if self.should_fail:
            raise self.fail_exception("Service unavailable")
        return {"status": "ok", "args": args, "kwargs": kwargs}


@pytest.fixture(autouse=True)
def _clean_registry():
    """Reset the global breaker registry between tests."""
    reset_all()
    yield
    reset_all()


# ---------------------------------------------------------------------------
# Test: Circuit opens after threshold failures
# ---------------------------------------------------------------------------

class TestCircuitOpensAfterFailures:

    def test_stays_closed_below_threshold(self):
        breaker = CircuitBreaker(
            name="test_below",
            failure_threshold=5,
            recovery_timeout=10.0,
        )
        svc = FlakyService()
        svc.should_fail = True

        # 4 failures — still CLOSED
        for _ in range(4):
            with pytest.raises(ConnectionError):
                breaker.call(svc.call)

        state = breaker.get_state()
        assert state.state == CircuitState.CLOSED
        assert state.failure_count == 4

    def test_opens_at_threshold(self):
        breaker = CircuitBreaker(
            name="test_at_threshold",
            failure_threshold=3,
            recovery_timeout=10.0,
        )
        svc = FlakyService()
        svc.should_fail = True

        # Trip the breaker with 3 failures
        for _ in range(3):
            with pytest.raises(ConnectionError):
                breaker.call(svc.call)

        state = breaker.get_state()
        assert state.state == CircuitState.OPEN
        assert state.failure_count == 3

    def test_rejects_calls_when_open(self):
        breaker = CircuitBreaker(
            name="test_rejects",
            failure_threshold=2,
            recovery_timeout=60.0,
        )
        svc = FlakyService()
        svc.should_fail = True

        # Open the circuit
        for _ in range(2):
            with pytest.raises(ConnectionError):
                breaker.call(svc.call)

        # Subsequent calls should be rejected without calling the service
        call_count_before = svc.call_count
        with pytest.raises(CircuitOpenError) as exc_info:
            breaker.call(svc.call)

        assert svc.call_count == call_count_before  # Service was NOT called
        assert exc_info.value.name == "test_rejects"
        assert exc_info.value.remaining_seconds > 0

    def test_success_resets_failure_count(self):
        breaker = CircuitBreaker(
            name="test_reset",
            failure_threshold=3,
            recovery_timeout=10.0,
        )
        svc = FlakyService()

        # 2 failures
        svc.should_fail = True
        for _ in range(2):
            with pytest.raises(ConnectionError):
                breaker.call(svc.call)

        # 1 success — should reset counter
        svc.should_fail = False
        result = breaker.call(svc.call)
        assert result["status"] == "ok"

        state = breaker.get_state()
        assert state.state == CircuitState.CLOSED
        assert state.failure_count == 0

        # 2 more failures — still below threshold
        svc.should_fail = True
        for _ in range(2):
            with pytest.raises(ConnectionError):
                breaker.call(svc.call)

        state = breaker.get_state()
        assert state.state == CircuitState.CLOSED


# ---------------------------------------------------------------------------
# Test: Recovery (HALF_OPEN) behavior
# ---------------------------------------------------------------------------

class TestHalfOpenRecovery:

    def test_transitions_to_half_open_after_timeout(self):
        breaker = CircuitBreaker(
            name="test_half_open",
            failure_threshold=2,
            recovery_timeout=0.1,  # 100ms for fast tests
        )
        svc = FlakyService()
        svc.should_fail = True

        # Open the circuit
        for _ in range(2):
            with pytest.raises(ConnectionError):
                breaker.call(svc.call)

        assert breaker.get_state().state == CircuitState.OPEN

        # Wait for recovery timeout
        time.sleep(0.15)

        # Next call should go through (HALF_OPEN probe)
        svc.should_fail = False
        result = breaker.call(svc.call)
        assert result["status"] == "ok"

        # Circuit should now be CLOSED
        assert breaker.get_state().state == CircuitState.CLOSED

    def test_half_open_probe_failure_reopens(self):
        breaker = CircuitBreaker(
            name="test_probe_fail",
            failure_threshold=2,
            recovery_timeout=0.1,
        )
        svc = FlakyService()
        svc.should_fail = True

        # Open the circuit
        for _ in range(2):
            with pytest.raises(ConnectionError):
                breaker.call(svc.call)

        assert breaker.get_state().state == CircuitState.OPEN

        # Wait for recovery timeout
        time.sleep(0.15)

        # Probe fails — circuit should reopen
        with pytest.raises(ConnectionError):
            breaker.call(svc.call)

        assert breaker.get_state().state == CircuitState.OPEN

    def test_multiple_recovery_cycles(self):
        breaker = CircuitBreaker(
            name="test_multi_cycle",
            failure_threshold=1,
            recovery_timeout=0.05,
        )
        svc = FlakyService()

        for cycle in range(3):
            # Trip the breaker
            svc.should_fail = True
            with pytest.raises(ConnectionError):
                breaker.call(svc.call)

            assert breaker.get_state().state == CircuitState.OPEN

            # Wait and recover
            time.sleep(0.08)
            svc.should_fail = False
            result = breaker.call(svc.call)
            assert result["status"] == "ok"
            assert breaker.get_state().state == CircuitState.CLOSED


# ---------------------------------------------------------------------------
# Test: Metrics tracking
# ---------------------------------------------------------------------------

class TestMetrics:

    def test_lifetime_counters(self):
        breaker = CircuitBreaker(
            name="test_metrics",
            failure_threshold=10,
            recovery_timeout=10.0,
        )
        svc = FlakyService()

        # 3 successes
        svc.should_fail = False
        for _ in range(3):
            breaker.call(svc.call)

        # 2 failures
        svc.should_fail = True
        for _ in range(2):
            with pytest.raises(ConnectionError):
                breaker.call(svc.call)

        state = breaker.get_state()
        assert state.total_calls == 5
        assert state.total_successes == 3
        assert state.total_failures == 2
        assert state.last_failure_time is not None
        assert state.last_success_time is not None

    def test_manual_reset(self):
        breaker = CircuitBreaker(
            name="test_manual_reset",
            failure_threshold=2,
            recovery_timeout=999.0,
        )
        svc = FlakyService()
        svc.should_fail = True

        # Open the circuit
        for _ in range(2):
            with pytest.raises(ConnectionError):
                breaker.call(svc.call)

        assert breaker.get_state().state == CircuitState.OPEN

        # Manual reset
        breaker.reset()
        assert breaker.get_state().state == CircuitState.CLOSED

        # Should accept calls again
        svc.should_fail = False
        result = breaker.call(svc.call)
        assert result["status"] == "ok"


# ---------------------------------------------------------------------------
# Test: Expected vs unexpected exceptions
# ---------------------------------------------------------------------------

class TestExceptionFiltering:

    def test_expected_exceptions_trip_breaker(self):
        breaker = CircuitBreaker(
            name="test_expected",
            failure_threshold=2,
            recovery_timeout=10.0,
            expected_exceptions=(ConnectionError, TimeoutError),
        )

        def fail_with_connection_error():
            raise ConnectionError("down")

        for _ in range(2):
            with pytest.raises(ConnectionError):
                breaker.call(fail_with_connection_error)

        assert breaker.get_state().state == CircuitState.OPEN

    def test_unexpected_exceptions_pass_through(self):
        breaker = CircuitBreaker(
            name="test_unexpected",
            failure_threshold=2,
            recovery_timeout=10.0,
            expected_exceptions=(ConnectionError,),
        )

        def fail_with_value_error():
            raise ValueError("bad input")

        # ValueError is not in expected_exceptions — should NOT trip the breaker
        for _ in range(5):
            with pytest.raises(ValueError):
                breaker.call(fail_with_value_error)

        state = breaker.get_state()
        assert state.state == CircuitState.CLOSED
        assert state.failure_count == 0


# ---------------------------------------------------------------------------
# Test: Thread safety
# ---------------------------------------------------------------------------

class TestThreadSafety:

    def test_concurrent_failures_open_circuit(self):
        breaker = CircuitBreaker(
            name="test_concurrent",
            failure_threshold=5,
            recovery_timeout=10.0,
        )
        errors = []
        barrier = threading.Barrier(10)

        def worker():
            barrier.wait()
            try:
                breaker.call(lambda: (_ for _ in ()).throw(ConnectionError("fail")))
            except (ConnectionError, CircuitOpenError):
                pass
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)

        assert not errors, f"Unexpected errors: {errors}"

        state = breaker.get_state()
        # Circuit should be open (10 failures > threshold of 5)
        assert state.state == CircuitState.OPEN
        assert state.total_failures >= 5


# ---------------------------------------------------------------------------
# Test: Module-level registry
# ---------------------------------------------------------------------------

class TestRegistry:

    def test_get_breaker_creates_once(self):
        b1 = get_breaker("registry_test", failure_threshold=3)
        b2 = get_breaker("registry_test", failure_threshold=99)
        assert b1 is b2
        assert b1.failure_threshold == 3  # First call's config wins

    def test_get_all_breakers(self):
        get_breaker("reg_a")
        get_breaker("reg_b")
        all_b = get_all_breakers()
        assert "reg_a" in all_b
        assert "reg_b" in all_b


# ---------------------------------------------------------------------------
# Test: @with_circuit_breaker decorator
# ---------------------------------------------------------------------------

class TestDecorator:

    def test_decorator_wraps_function(self):
        @with_circuit_breaker("decorator_test", failure_threshold=2, recovery_timeout=10.0)
        def my_connector(x, y=1):
            """Fetch data."""
            return x + y

        # Preserves name and docstring
        assert my_connector.__name__ == "my_connector"
        assert "Fetch data" in my_connector.__doc__

        # Works normally
        assert my_connector(3, y=4) == 7

    def test_decorator_trips_breaker(self):
        call_count = 0

        @with_circuit_breaker(
            "decorator_trip",
            failure_threshold=2,
            recovery_timeout=60.0,
        )
        def failing_connector():
            nonlocal call_count
            call_count += 1
            raise ConnectionError("down")

        # Trip the breaker
        for _ in range(2):
            with pytest.raises(ConnectionError):
                failing_connector()

        assert call_count == 2

        # Now the circuit is open — function should NOT be called
        with pytest.raises(CircuitOpenError):
            failing_connector()

        assert call_count == 2  # Still 2 — was not called
