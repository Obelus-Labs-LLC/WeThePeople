"""Tests for /claims router endpoints."""


def test_claims_verify_422_empty_body(client):
    """POST /claims/verify with empty body returns 422."""
    r = client.post("/claims/verify", json={})
    assert r.status_code == 422


def test_claims_verify_422_missing_entity(client):
    """POST /claims/verify with missing entity_id returns 422."""
    r = client.post("/claims/verify", json={"text": "Some claim text that is long enough to pass validation"})
    assert r.status_code == 422


def test_claims_verify_422_text_too_short(client):
    """POST /claims/verify with text too short returns 422."""
    r = client.post("/claims/verify", json={
        "text": "short",
        "entity_id": "test-senator",
        "entity_type": "politician",
    })
    assert r.status_code == 422


def test_claims_verifications_list(client):
    """GET /claims/verifications returns paginated list."""
    r = client.get("/claims/verifications")
    assert r.status_code == 200
    data = r.json()
    assert "total" in data
    assert "items" in data
    assert isinstance(data["items"], list)
    assert data["total"] >= 1  # seeded claim exists


def test_claims_verifications_has_seeded_claim(client):
    """Seeded claim appears in verifications list."""
    r = client.get("/claims/verifications")
    data = r.json()
    items = data["items"]
    assert len(items) >= 1
    claim = items[0]
    assert "id" in claim
    assert "text" in claim
    assert "person_id" in claim
    assert claim["person_id"] == "test-senator"


def test_claims_verifications_filter_by_entity(client):
    """Filter verifications by entity_id."""
    r = client.get("/claims/verifications", params={"entity_id": "test-senator"})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1
    for item in data["items"]:
        assert item["person_id"] == "test-senator"


def test_claims_verifications_filter_no_match(client):
    """Filter with unknown entity returns empty."""
    r = client.get("/claims/verifications", params={"entity_id": "nonexistent-person"})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 0


def test_claims_dashboard_stats(client):
    """GET /claims/dashboard/stats returns aggregate stats."""
    r = client.get("/claims/dashboard/stats")
    assert r.status_code == 200
    data = r.json()
    assert "total_claims" in data
    assert "total_evaluated" in data
    assert "tier_distribution" in data
    assert "category_distribution" in data
    assert "unique_entities" in data
    assert data["total_claims"] >= 1
    assert data["total_evaluated"] >= 1


def test_claims_verification_detail(client):
    """GET /claims/verifications/{id} returns detail for seeded claim."""
    # First get the list to find the ID
    r = client.get("/claims/verifications")
    data = r.json()
    claim_id = data["items"][0]["id"]

    r2 = client.get(f"/claims/verifications/{claim_id}")
    assert r2.status_code == 200
    detail = r2.json()
    assert detail["id"] == claim_id
    assert detail["evaluation"] is not None
    assert detail["evaluation"]["tier"] == "moderate"


def test_claims_verification_detail_404(client):
    """GET /claims/verifications/{id} returns 404 for non-existent ID."""
    r = client.get("/claims/verifications/999999")
    assert r.status_code == 404


def test_claims_entity_verifications(client):
    """GET /claims/entity/{type}/{id} returns entity-specific verifications."""
    r = client.get("/claims/entity/politician/test-senator")
    assert r.status_code == 200
    data = r.json()
    assert data["entity_id"] == "test-senator"
    assert data["entity_type"] == "politician"
    assert "total" in data
    assert "items" in data
    assert "tier_summary" in data
