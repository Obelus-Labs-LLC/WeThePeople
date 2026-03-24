"""Tests for /tech router endpoints."""


def test_tech_dashboard_stats_200(client):
    """Dashboard stats returns 200 with expected structure."""
    r = client.get("/tech/dashboard/stats")
    assert r.status_code == 200
    data = r.json()
    assert "total_companies" in data
    assert "total_patents" in data
    assert "total_lobbying" in data
    assert "total_contracts" in data
    assert "by_sector" in data
    assert isinstance(data["by_sector"], dict)


def test_tech_dashboard_stats_counts_seeded(client):
    """Seeded tech company shows in counts."""
    r = client.get("/tech/dashboard/stats")
    data = r.json()
    assert data["total_companies"] >= 1


def test_tech_companies_list(client):
    """Companies list returns paginated results."""
    r = client.get("/tech/companies")
    assert r.status_code == 200
    data = r.json()
    assert "total" in data
    assert "companies" in data
    assert isinstance(data["companies"], list)
    assert data["total"] >= 1


def test_tech_companies_search(client):
    """Search filters companies by name."""
    r = client.get("/tech/companies", params={"q": "Test Tech"})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1


def test_tech_companies_search_no_match(client):
    """Non-matching search returns empty list."""
    r = client.get("/tech/companies", params={"q": "zzz-nonexistent"})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 0


def test_tech_recent_activity(client):
    """Recent activity returns 200 with items list."""
    r = client.get("/tech/dashboard/recent-activity")
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert isinstance(data["items"], list)
