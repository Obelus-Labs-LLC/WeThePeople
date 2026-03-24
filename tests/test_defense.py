"""Tests for /defense router endpoints."""


def test_defense_dashboard_stats_200(client):
    """Dashboard stats returns 200 with expected keys."""
    r = client.get("/defense/dashboard/stats")
    assert r.status_code == 200
    data = r.json()
    assert "total_companies" in data
    assert "total_contracts" in data
    assert "total_lobbying" in data
    assert "total_enforcement" in data
    assert "by_sector" in data


def test_defense_dashboard_stats_counts_seeded(client):
    """Seeded defense company appears in counts."""
    r = client.get("/defense/dashboard/stats")
    data = r.json()
    assert data["total_companies"] >= 1


def test_defense_companies_list(client):
    """Companies list returns paginated results."""
    r = client.get("/defense/companies")
    assert r.status_code == 200
    data = r.json()
    assert "total" in data
    assert "companies" in data
    assert data["total"] >= 1


def test_defense_companies_search_no_match(client):
    """Non-matching search returns empty."""
    r = client.get("/defense/companies", params={"q": "zzz-nonexistent"})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 0
