"""Tests for /transportation router endpoints."""


def test_transportation_dashboard_stats_200(client):
    """Dashboard stats returns 200 with expected keys."""
    r = client.get("/transportation/dashboard/stats")
    assert r.status_code == 200
    data = r.json()
    assert "total_companies" in data
    assert "total_contracts" in data
    assert "total_lobbying" in data
    assert "total_recalls" in data
    assert "total_complaints" in data
    assert "by_sector" in data


def test_transportation_dashboard_stats_counts_seeded(client):
    """Seeded transportation company appears in counts."""
    r = client.get("/transportation/dashboard/stats")
    data = r.json()
    assert data["total_companies"] >= 1


def test_transportation_companies_list(client):
    """Companies list returns paginated results."""
    r = client.get("/transportation/companies")
    assert r.status_code == 200
    data = r.json()
    assert "total" in data
    assert "companies" in data
    assert data["total"] >= 1
