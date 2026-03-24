"""Tests for /finance router endpoints."""


def test_finance_dashboard_stats_200(client):
    """Dashboard stats returns 200 with expected keys."""
    r = client.get("/finance/dashboard/stats")
    assert r.status_code == 200
    data = r.json()
    assert "total_institutions" in data
    assert "total_lobbying" in data
    assert "total_contracts" in data
    assert "by_sector" in data
    assert isinstance(data["total_institutions"], int)


def test_finance_dashboard_stats_has_seeded_institution(client):
    """Seeded institution should be counted in stats."""
    r = client.get("/finance/dashboard/stats")
    data = r.json()
    assert data["total_institutions"] >= 1


def test_finance_institutions_list(client):
    """Institution list returns paginated results."""
    r = client.get("/finance/institutions")
    assert r.status_code == 200
    data = r.json()
    assert "total" in data
    assert "institutions" in data
    assert isinstance(data["institutions"], list)
    assert data["total"] >= 1


def test_finance_institutions_search(client):
    """Search by name returns matching results."""
    r = client.get("/finance/institutions", params={"q": "Test Bank"})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1
    assert any("Test Bank" in i["display_name"] for i in data["institutions"])


def test_finance_institutions_search_no_match(client):
    """Search with non-existent name returns empty list."""
    r = client.get("/finance/institutions", params={"q": "zzz-nonexistent-xyz"})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 0
    assert data["institutions"] == []


def test_finance_institution_detail(client):
    """Detail endpoint returns data for seeded institution."""
    r = client.get("/finance/institutions/test-bank")
    assert r.status_code == 200
    data = r.json()
    assert data["institution_id"] == "test-bank"
    assert data["display_name"] == "Test Bank Corp"
    assert data["ticker"] == "TSTB"
    assert "filing_count" in data
    assert "sanctions_status" in data


def test_finance_institution_detail_404(client):
    """Non-existent institution returns 404."""
    r = client.get("/finance/institutions/nonexistent-bank-xyz")
    assert r.status_code == 404


def test_finance_institutions_pagination(client):
    """Pagination params are respected."""
    r = client.get("/finance/institutions", params={"limit": 1, "offset": 0})
    assert r.status_code == 200
    data = r.json()
    assert data["limit"] == 1
    assert data["offset"] == 0
    assert len(data["institutions"]) <= 1
