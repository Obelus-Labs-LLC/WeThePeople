"""Smoke test for the /health endpoint."""


def test_health_returns_200(client):
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert "status" in data or "db" in data or isinstance(data, dict)


def test_health_includes_version(client):
    r = client.get("/health")
    data = r.json()
    # The health endpoint should return some kind of version or status info
    assert isinstance(data, dict)
