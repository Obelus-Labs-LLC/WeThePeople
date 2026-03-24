"""Tests for /metrics endpoint (Prometheus format)."""


def test_metrics_returns_200(client):
    """GET /metrics returns 200 with text content."""
    r = client.get("/metrics")
    assert r.status_code == 200


def test_metrics_returns_prometheus_format(client):
    """GET /metrics response contains Prometheus-style metric lines."""
    r = client.get("/metrics")
    text = r.text
    assert "wtp_uptime_seconds" in text
    assert "wtp_db_query_total" in text


def test_metrics_content_type(client):
    """GET /metrics returns text/plain content type."""
    r = client.get("/metrics")
    assert "text/plain" in r.headers.get("content-type", "")
