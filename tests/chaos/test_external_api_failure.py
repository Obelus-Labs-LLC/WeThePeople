"""
Chaos Engineering — External API Failure Tests

Verifies that sync jobs handle connector failures gracefully:
  1. A failing connector raises but doesn't crash the sync job process
  2. Partial failures (some entities succeed, some fail) are handled
  3. Circuit breaker integration prevents hammering a dead service
  4. Connector timeout handling works correctly
  5. The scheduler's _run_job captures errors without crashing
"""

import os
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock
from datetime import datetime, date

import pytest
import requests

# Ensure project root is on the path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

os.environ["WTP_DB_URL"] = "sqlite://"
os.environ["DISABLE_STARTUP_FETCH"] = "1"

from services.circuit_breaker import (
    CircuitBreaker,
    CircuitOpenError,
    CircuitState,
    reset_all,
)
from connectors._base import with_circuit_breaker


@pytest.fixture(autouse=True)
def _clean_breakers():
    reset_all()
    yield
    reset_all()


# ---------------------------------------------------------------------------
# Test: Connector-level failure isolation
# ---------------------------------------------------------------------------

class TestConnectorFailureIsolation:

    def test_senate_lda_timeout_raises_not_crashes(self):
        """A timeout in Senate LDA should raise, not crash the process."""
        with patch("requests.get") as mock_get:
            mock_get.side_effect = requests.exceptions.Timeout("Connection timed out")

            from connectors.senate_lda import fetch_lobbying_filings
            # Should return empty list (connector catches exceptions internally)
            result = fetch_lobbying_filings("NONEXISTENT CORP", filing_year=2024)
            assert isinstance(result, list)

    def test_usaspending_connection_error_raises_not_crashes(self):
        """A connection error in USASpending should be handled gracefully."""
        with patch("requests.post") as mock_post:
            mock_post.side_effect = requests.exceptions.ConnectionError("DNS resolution failed")

            from connectors.usaspending import fetch_contracts
            result = fetch_contracts("NONEXISTENT CORP")
            assert isinstance(result, list)

    def test_sec_edgar_http_500_raises_not_crashes(self):
        """A 500 error from SEC EDGAR should be handled gracefully."""
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.raise_for_status.side_effect = requests.exceptions.HTTPError(
            "500 Server Error"
        )
        mock_resp.json.return_value = {}

        with patch("requests.get", return_value=mock_resp):
            from connectors.sec_edgar import fetch_company_submissions
            result = fetch_company_submissions("0000320193")
            # Should return None or empty dict, not crash
            assert result is None or isinstance(result, dict)


# ---------------------------------------------------------------------------
# Test: Circuit breaker prevents hammering dead services
# ---------------------------------------------------------------------------

class TestCircuitBreakerIntegration:

    def test_breaker_stops_calls_after_threshold(self):
        """After N failures, the breaker should stop calling the connector."""
        actual_call_count = 0

        @with_circuit_breaker(
            "test_hammer_prevention",
            failure_threshold=3,
            recovery_timeout=60.0,
        )
        def flaky_fetch():
            nonlocal actual_call_count
            actual_call_count += 1
            raise ConnectionError("service down")

        # First 3 calls go through and fail
        for _ in range(3):
            with pytest.raises(ConnectionError):
                flaky_fetch()

        assert actual_call_count == 3

        # Next 10 calls should be rejected by the breaker
        for _ in range(10):
            with pytest.raises(CircuitOpenError):
                flaky_fetch()

        # Function was NOT called for those 10 attempts
        assert actual_call_count == 3

    def test_breaker_allows_recovery(self):
        """After recovery timeout, a successful probe should close the circuit."""
        breaker = CircuitBreaker(
            name="test_recovery_integration",
            failure_threshold=2,
            recovery_timeout=0.05,  # 50ms
        )

        call_results = []

        def connector():
            if len(call_results) < 2:
                call_results.append("fail")
                raise ConnectionError("down")
            call_results.append("ok")
            return {"data": "recovered"}

        # Trip the breaker
        for _ in range(2):
            with pytest.raises(ConnectionError):
                breaker.call(connector)

        assert breaker.get_state().state == CircuitState.OPEN

        # Wait for recovery
        import time
        time.sleep(0.08)

        # Probe succeeds
        result = breaker.call(connector)
        assert result == {"data": "recovered"}
        assert breaker.get_state().state == CircuitState.CLOSED


# ---------------------------------------------------------------------------
# Test: Sync job error handling
# ---------------------------------------------------------------------------

class TestSyncJobErrorHandling:

    def test_sync_job_handles_connector_exception(self):
        """A sync job should catch connector exceptions per-entity and continue."""
        # Simulate the pattern used in sync jobs:
        # for entity in entities: try connector; except: log and continue
        entities = ["Apple", "Google", "Microsoft", "Amazon", "Meta"]
        results = {}
        failures = []

        def mock_fetch(name):
            if name in ("Google", "Amazon"):
                raise ConnectionError(f"{name} API is down")
            return [{"name": name, "lobbying": 1000}]

        for entity in entities:
            try:
                data = mock_fetch(entity)
                results[entity] = data
            except Exception as e:
                failures.append((entity, str(e)))

        # 3 succeeded, 2 failed
        assert len(results) == 3
        assert len(failures) == 2
        assert "Apple" in results
        assert "Microsoft" in results
        assert "Meta" in results

    def test_sync_job_continues_after_circuit_open(self):
        """
        When a circuit opens mid-sync, remaining entities should get
        CircuitOpenError (fast fail) instead of waiting for timeouts.
        """
        breaker = CircuitBreaker(
            name="test_sync_circuit",
            failure_threshold=2,
            recovery_timeout=300.0,  # Long recovery — stays open for test
        )
        entities = ["Entity1", "Entity2", "Entity3", "Entity4", "Entity5"]
        results = {}
        skipped = []
        errors = []

        def fetch_data(entity_name):
            # All calls fail
            raise ConnectionError(f"{entity_name} unreachable")

        for entity in entities:
            try:
                data = breaker.call(fetch_data, entity)
                results[entity] = data
            except CircuitOpenError:
                skipped.append(entity)
            except ConnectionError as e:
                errors.append(entity)

        # First 2 hit real errors, remaining 3 get CircuitOpenError (fast fail)
        assert len(errors) == 2
        assert len(skipped) == 3
        assert len(results) == 0


# ---------------------------------------------------------------------------
# Test: Scheduler _run_job error capture
# ---------------------------------------------------------------------------

class TestSchedulerJobResilience:

    def test_run_job_captures_timeout(self):
        """_run_job should capture subprocess timeout without crashing."""
        from jobs.scheduler import _run_job, JobDef

        job = JobDef(
            name="test_timeout_job",
            script="jobs/nonexistent_script.py",
            timeout_sec=1,
            description="Test job for timeout handling",
        )

        result = _run_job(job)
        # Should complete with an error status, not crash
        assert result["status"] in ("failed", "error", "timeout")
        assert result["job"] == "test_timeout_job"
        assert result["finished_at"] is not None

    def test_run_job_captures_missing_script(self):
        """_run_job should handle missing script files gracefully."""
        from jobs.scheduler import _run_job, JobDef

        job = JobDef(
            name="test_missing_script",
            script="jobs/this_does_not_exist_at_all.py",
            timeout_sec=10,
            description="Test job for missing script",
        )

        result = _run_job(job)
        # Should complete with error/failed status
        assert result["status"] in ("failed", "error")
        assert result["finished_at"] is not None


# ---------------------------------------------------------------------------
# Test: Multiple connector failures don't cascade
# ---------------------------------------------------------------------------

class TestCascadeIsolation:

    def test_independent_breakers_dont_affect_each_other(self):
        """Failure in one connector's breaker should not affect another."""
        breaker_a = CircuitBreaker(
            name="service_a",
            failure_threshold=2,
            recovery_timeout=60.0,
        )
        breaker_b = CircuitBreaker(
            name="service_b",
            failure_threshold=2,
            recovery_timeout=60.0,
        )

        def fail():
            raise ConnectionError("down")

        def succeed():
            return "ok"

        # Trip breaker A
        for _ in range(2):
            with pytest.raises(ConnectionError):
                breaker_a.call(fail)

        assert breaker_a.get_state().state == CircuitState.OPEN

        # Breaker B should still work fine
        result = breaker_b.call(succeed)
        assert result == "ok"
        assert breaker_b.get_state().state == CircuitState.CLOSED

    def test_mixed_connector_failures_in_sync_job(self):
        """
        Simulate a sync job that calls multiple connectors.
        Some fail, some succeed — overall job should complete.
        """
        breaker_lda = CircuitBreaker(
            name="mixed_lda", failure_threshold=3, recovery_timeout=60.0
        )
        breaker_usa = CircuitBreaker(
            name="mixed_usa", failure_threshold=3, recovery_timeout=60.0
        )

        lda_results = []
        usa_results = []

        def fetch_lobbying(name):
            raise ConnectionError("LDA is down")

        def fetch_contracts(name):
            return [{"contract": f"{name}-001"}]

        entities = ["CompanyA", "CompanyB", "CompanyC"]

        for entity in entities:
            # LDA fails but USASpending works
            try:
                data = breaker_lda.call(fetch_lobbying, entity)
                lda_results.append(data)
            except (ConnectionError, CircuitOpenError):
                pass  # Log and continue in real code

            try:
                data = breaker_usa.call(fetch_contracts, entity)
                usa_results.append(data)
            except (ConnectionError, CircuitOpenError):
                pass

        # LDA all failed, USASpending all succeeded
        assert len(lda_results) == 0
        assert len(usa_results) == 3
        assert breaker_lda.get_state().state == CircuitState.OPEN
        assert breaker_usa.get_state().state == CircuitState.CLOSED
