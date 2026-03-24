"""Tests for /stories router endpoints."""


def test_stories_list_200(client):
    """GET /stories/ returns published stories."""
    r = client.get("/stories/")
    assert r.status_code == 200
    data = r.json()
    assert "total" in data
    assert "stories" in data
    assert isinstance(data["stories"], list)
    assert data["total"] >= 1


def test_stories_list_has_seeded_story(client):
    """Seeded story appears in results."""
    r = client.get("/stories/")
    data = r.json()
    stories = data["stories"]
    assert any(s["slug"] == "test-lobbying-surge" for s in stories)
    story = next(s for s in stories if s["slug"] == "test-lobbying-surge")
    assert story["title"] == "Test Story: Lobbying Surge"
    assert story["category"] == "lobbying_spike"


def test_stories_filter_by_sector(client):
    """Filter stories by sector."""
    r = client.get("/stories/", params={"sector": "finance"})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1


def test_stories_filter_no_match(client):
    """Filter by non-existent sector returns empty."""
    r = client.get("/stories/", params={"sector": "nonexistent"})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 0


def test_stories_filter_draft_status(client):
    """Filter by draft status (no seeded drafts)."""
    r = client.get("/stories/", params={"status": "draft"})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 0


def test_stories_pagination(client):
    """Pagination params are respected."""
    r = client.get("/stories/", params={"limit": 1, "offset": 0})
    assert r.status_code == 200
    data = r.json()
    assert len(data["stories"]) <= 1
