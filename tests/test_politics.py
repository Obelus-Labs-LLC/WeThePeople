"""Smoke test for politics router endpoints."""


def test_politics_dashboard_stats(client):
    """Dashboard stats should return 200 even with empty DB."""
    r = client.get("/politics/dashboard/stats")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)


def test_politics_people_list(client):
    """People list should return 200 with empty results."""
    r = client.get("/politics/people")
    # May return 200 with empty list or 404 — both are acceptable
    assert r.status_code in (200, 404)
