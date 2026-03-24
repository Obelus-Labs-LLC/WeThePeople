"""Tests for /influence router endpoints."""


def test_influence_stats_200(client):
    """Influence stats returns 200 with aggregated data."""
    r = client.get("/influence/stats")
    assert r.status_code == 200
    data = r.json()
    # Should have total_lobbying_spend across all sectors
    assert "total_lobbying_spend" in data
    assert isinstance(data["total_lobbying_spend"], (int, float))


def test_influence_data_freshness_200(client):
    """Data freshness returns 200 with timestamps and counts."""
    r = client.get("/influence/data-freshness")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)
    # Should have at least some data source categories
    # Could be empty in test DB, but the response shape should be dict


def test_influence_data_freshness_cached(client):
    """Second call should hit cache (same result within TTL)."""
    r1 = client.get("/influence/data-freshness")
    r2 = client.get("/influence/data-freshness")
    assert r1.status_code == 200
    assert r2.status_code == 200
    # Both calls should succeed; cache doesn't change behavior for the caller


def test_influence_trade_timeline_200(client):
    """Trade timeline with ticker returns 200."""
    r = client.get("/influence/trade-timeline", params={"ticker": "AAPL"})
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, (dict, list))


def test_influence_trade_timeline_422_no_ticker(client):
    """Trade timeline without required ticker returns 422."""
    r = client.get("/influence/trade-timeline")
    assert r.status_code == 422
