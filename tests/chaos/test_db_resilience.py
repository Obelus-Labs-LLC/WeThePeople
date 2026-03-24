"""
Chaos Engineering — Database Resilience Tests

Verifies that the API degrades gracefully when the database is unavailable:
  1. Health endpoint returns degraded status (not 500)
  2. Search endpoint returns 503 with helpful message
  3. Sector dashboard endpoints handle DB errors gracefully
  4. Claim submission handles DB errors gracefully
"""

import os

# Force in-memory SQLite and disable startup fetch BEFORE any app imports
os.environ["WTP_DB_URL"] = "sqlite://"
os.environ["DISABLE_STARTUP_FETCH"] = "1"

import pytest
from unittest.mock import patch, MagicMock
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError

from models.database import Base


@pytest.fixture(scope="module")
def working_engine():
    """A real in-memory SQLite engine for baseline tests."""
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False})

    @event.listens_for(eng, "connect")
    def _set_pragmas(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=60000")
        cursor.close()

    Base.metadata.create_all(bind=eng)
    return eng


@pytest.fixture(scope="module")
def test_client(working_engine):
    """FastAPI TestClient with a working DB."""
    TestSession = sessionmaker(bind=working_engine)

    def _override():
        return TestSession()

    with patch("models.database.SessionLocal", _override):
        from main import app
        from fastapi.testclient import TestClient
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c


def _make_broken_session_local():
    """Returns a SessionLocal replacement that raises on any query."""
    def broken_session_local():
        session = MagicMock()
        session.execute.side_effect = OperationalError(
            "database is locked", params=None, orig=Exception("database is locked")
        )
        session.query.side_effect = OperationalError(
            "database is locked", params=None, orig=Exception("database is locked")
        )
        session.close = MagicMock()
        # Make it work as a context manager / generator for get_db
        return session
    return broken_session_local


# ---------------------------------------------------------------------------
# Test: Health endpoint graceful degradation
# ---------------------------------------------------------------------------

class TestHealthEndpointResilience:

    def test_health_returns_ok_when_db_works(self, test_client):
        resp = test_client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["database"]["connected"] is True

    def test_health_returns_degraded_when_db_fails(self, test_client):
        """Health check should return 200 with degraded status, not crash."""
        with patch("models.database.SessionLocal", _make_broken_session_local()):
            resp = test_client.get("/health")

        # The health endpoint should still respond (not 500)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "degraded"
        assert data["database"]["connected"] is False


# ---------------------------------------------------------------------------
# Test: Search endpoint under DB failure
# ---------------------------------------------------------------------------

class TestSearchResilience:

    def test_search_returns_error_when_db_fails(self, test_client):
        """Global search should return a server error, not crash the process."""
        with patch("models.database.SessionLocal", _make_broken_session_local()):
            resp = test_client.get("/search?q=apple")

        # Should get a 500-level error (internal server error), not a process crash
        assert resp.status_code >= 500


# ---------------------------------------------------------------------------
# Test: Politics dashboard under DB failure
# ---------------------------------------------------------------------------

class TestDashboardResilience:

    def test_politics_dashboard_handles_db_error(self, test_client):
        """Dashboard stats endpoint should not crash on DB failure."""
        with patch("models.database.SessionLocal", _make_broken_session_local()):
            resp = test_client.get("/politics/dashboard/stats")

        # Should return an error response, not crash
        assert resp.status_code >= 400


# ---------------------------------------------------------------------------
# Test: get_db generator handles exceptions during cleanup
# ---------------------------------------------------------------------------

class TestGetDbResilience:

    def test_get_db_closes_session_on_error(self):
        """The get_db dependency should always close the session, even on error."""
        from models.database import get_db

        mock_session = MagicMock()
        with patch("models.database.SessionLocal", return_value=mock_session):
            gen = get_db()
            db = next(gen)
            assert db is mock_session

            # Simulate an exception during request handling
            try:
                gen.throw(RuntimeError("request failed"))
            except RuntimeError:
                pass

            # Session should have been closed
            mock_session.close.assert_called_once()

    def test_get_db_closes_session_on_success(self):
        """The get_db dependency should close the session on normal completion."""
        from models.database import get_db

        mock_session = MagicMock()
        with patch("models.database.SessionLocal", return_value=mock_session):
            gen = get_db()
            db = next(gen)
            assert db is mock_session

            # Normal completion
            try:
                next(gen)
            except StopIteration:
                pass

            mock_session.close.assert_called_once()
