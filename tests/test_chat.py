"""Tests for /chat router endpoints."""


def test_chat_ask_422_empty_body(client):
    """POST /chat/ask with empty body returns 422."""
    r = client.post("/chat/ask", json={})
    assert r.status_code == 422


def test_chat_ask_422_empty_question(client):
    """POST /chat/ask with empty question string returns 422."""
    r = client.post("/chat/ask", json={"question": ""})
    assert r.status_code == 422


def test_chat_ask_faq_response(client):
    """POST /chat/ask with a known FAQ-like question returns a response."""
    r = client.post("/chat/ask", json={"question": "What is WeThePeople?"})
    # May return 200 (FAQ hit or Haiku call) or 500 (no API key)
    # Either way, should not be 422
    assert r.status_code in (200, 429, 500)
    if r.status_code == 200:
        data = r.json()
        assert "answer" in data
        assert isinstance(data["answer"], str)
        assert len(data["answer"]) > 0


def test_chat_ask_with_context(client):
    """POST /chat/ask with page context is accepted."""
    r = client.post("/chat/ask", json={
        "question": "What data do you have?",
        "context": {"page": "/finance", "entity_id": "test-bank"},
    })
    # Should not fail validation
    assert r.status_code in (200, 429, 500)


def test_chat_ask_question_too_long(client):
    """POST /chat/ask with question exceeding max length returns 422."""
    r = client.post("/chat/ask", json={"question": "x" * 2001})
    assert r.status_code == 422
