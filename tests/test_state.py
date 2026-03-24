"""Tests for /states router endpoints."""


def test_states_list_200(client):
    """GET /states returns list of states with data."""
    r = client.get("/states")
    assert r.status_code == 200
    data = r.json()
    assert "states" in data
    assert isinstance(data["states"], list)
    assert len(data["states"]) >= 1  # MI is seeded


def test_states_list_has_michigan(client):
    """Michigan appears in the states list from seeded data."""
    r = client.get("/states")
    data = r.json()
    mi_states = [s for s in data["states"] if s.get("code") == "MI"]
    assert len(mi_states) == 1
    mi = mi_states[0]
    assert mi["legislators"] >= 1


def test_state_detail_mi(client):
    """GET /states/MI returns Michigan detail."""
    r = client.get("/states/MI")
    assert r.status_code == 200
    data = r.json()
    assert data["code"] == "MI"
    assert "total_legislators" in data
    assert data["total_legislators"] >= 1


def test_state_detail_unknown(client):
    """GET /states/ZZ returns 404."""
    r = client.get("/states/ZZ")
    assert r.status_code == 404
