"""Tests for /energy router endpoints."""


def test_energy_dashboard_stats_200(client):
    """Dashboard stats returns 200 with expected keys."""
    r = client.get("/energy/dashboard/stats")
    assert r.status_code == 200
    data = r.json()
    assert "total_companies" in data
    assert "total_emissions_records" in data
    assert "total_lobbying" in data
    assert "total_contracts" in data
    assert "by_sector" in data


def test_energy_dashboard_stats_counts_seeded(client):
    """Seeded energy company appears in counts."""
    r = client.get("/energy/dashboard/stats")
    data = r.json()
    assert data["total_companies"] >= 1


def test_energy_companies_list(client):
    """Companies list returns paginated results."""
    r = client.get("/energy/companies")
    assert r.status_code == 200
    data = r.json()
    assert "total" in data
    assert "companies" in data
    assert data["total"] >= 1


def test_energy_companies_search_no_match(client):
    """Non-matching search returns empty."""
    r = client.get("/energy/companies", params={"q": "zzz-no-match"})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 0


def test_energy_recent_activity(client):
    """Recent activity endpoint returns 200."""
    r = client.get("/energy/dashboard/recent-activity")
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert isinstance(data["items"], list)
