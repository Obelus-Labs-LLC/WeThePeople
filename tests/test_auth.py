"""Tests for /auth router endpoints."""


def test_auth_register_success(client):
    """POST /auth/register creates a new user and returns 201."""
    r = client.post("/auth/register", json={
        "email": "testuser@example.com",
        "password": "securepassword123",
        "display_name": "Test User",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["email"] == "testuser@example.com"
    assert data["role"] == "free"
    assert "id" in data
    assert "created_at" in data


def test_auth_register_duplicate_email(client):
    """POST /auth/register with existing email returns 409."""
    r = client.post("/auth/register", json={
        "email": "testuser@example.com",
        "password": "anotherpassword123",
    })
    assert r.status_code == 409


def test_auth_register_422_short_password(client):
    """POST /auth/register with too-short password returns 422."""
    r = client.post("/auth/register", json={
        "email": "short-pw@example.com",
        "password": "short",
    })
    assert r.status_code == 422


def test_auth_register_422_missing_email(client):
    """POST /auth/register with missing email returns 422."""
    r = client.post("/auth/register", json={
        "password": "securepassword123",
    })
    assert r.status_code == 422


def test_auth_login_success(client):
    """POST /auth/login with valid credentials returns tokens."""
    r = client.post("/auth/login", json={
        "email": "testuser@example.com",
        "password": "securepassword123",
    })
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    assert data["role"] == "free"
    assert "expires_in" in data
    assert data["expires_in"] > 0


def test_auth_login_wrong_password(client):
    """POST /auth/login with wrong password returns 401."""
    r = client.post("/auth/login", json={
        "email": "testuser@example.com",
        "password": "wrongpassword",
    })
    assert r.status_code == 401


def test_auth_login_nonexistent_user(client):
    """POST /auth/login with unknown email returns 401."""
    r = client.post("/auth/login", json={
        "email": "nobody@example.com",
        "password": "anything",
    })
    assert r.status_code == 401


def test_auth_me_with_valid_token(client):
    """GET /auth/me with valid token returns user info."""
    # First login to get a token
    login_r = client.post("/auth/login", json={
        "email": "testuser@example.com",
        "password": "securepassword123",
    })
    token = login_r.json()["access_token"]

    r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == "testuser@example.com"
    assert data["role"] == "free"
    assert "is_active" in data
    assert data["is_active"] is True


def test_auth_me_without_token(client):
    """GET /auth/me without token returns 401."""
    r = client.get("/auth/me")
    assert r.status_code == 401


def test_auth_me_with_invalid_token(client):
    """GET /auth/me with invalid token returns 401."""
    r = client.get("/auth/me", headers={"Authorization": "Bearer invalid-garbage-token"})
    assert r.status_code == 401


def test_auth_refresh_token(client):
    """POST /auth/refresh with valid refresh token returns new tokens."""
    login_r = client.post("/auth/login", json={
        "email": "testuser@example.com",
        "password": "securepassword123",
    })
    refresh_token = login_r.json()["refresh_token"]

    r = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert "refresh_token" in data


def test_auth_api_key_create(client):
    """POST /auth/api-keys creates a new API key."""
    login_r = client.post("/auth/login", json={
        "email": "testuser@example.com",
        "password": "securepassword123",
    })
    token = login_r.json()["access_token"]

    r = client.post("/auth/api-keys", json={
        "name": "test-key",
        "scopes": ["read"],
    }, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    data = r.json()
    assert "raw_key" in data
    assert data["name"] == "test-key"
    assert "id" in data


def test_auth_api_key_list(client):
    """GET /auth/api-keys returns the user's keys."""
    login_r = client.post("/auth/login", json={
        "email": "testuser@example.com",
        "password": "securepassword123",
    })
    token = login_r.json()["access_token"]

    r = client.get("/auth/api-keys", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["name"] == "test-key"
