"""Smoke test for the global search endpoint."""


def test_search_returns_200(client):
    """Search with a query string should return 200."""
    r = client.get("/search", params={"q": "test"})
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, (dict, list))


def test_search_empty_query_rejected(client):
    """Search without a query should return 422 (validation error)."""
    r = client.get("/search")
    assert r.status_code == 422
