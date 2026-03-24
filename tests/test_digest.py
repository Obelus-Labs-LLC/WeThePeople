"""Tests for /digest router endpoints."""


def test_digest_preview_200(client):
    """GET /digest/preview/{zip} returns preview data."""
    # 48201 is a Detroit, MI zip code
    r = client.get("/digest/preview/48201")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)
    assert "state" in data
    assert "zip_code" in data
    assert data["state"] == "MI"


def test_digest_preview_has_representative(client):
    """Preview for MI zip should find seeded test-senator."""
    r = client.get("/digest/preview/48201")
    data = r.json()
    assert "representatives" in data
    assert isinstance(data["representatives"], list)
    # Our seeded test-senator is in MI
    assert len(data["representatives"]) >= 1


def test_digest_preview_invalid_zip(client):
    """GET /digest/preview with too-short zip returns 400."""
    r = client.get("/digest/preview/000")
    assert r.status_code == 400


def test_digest_subscribe_422_missing_fields(client):
    """POST /digest/subscribe with missing fields returns 422."""
    r = client.post("/digest/subscribe", json={})
    assert r.status_code == 422


def test_digest_subscribe_success(client):
    """POST /digest/subscribe with valid data succeeds."""
    r = client.post("/digest/subscribe", json={
        "email": "digest-test@example.com",
        "zip_code": "48201",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "subscribed"
