"""
Standard pagination constants for API endpoints.

Usage in routers:
    from utils.pagination import DEFAULT_LIMIT, MAX_LIMIT

    @router.get("/items")
    def list_items(limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT), ...):
"""

# Standard defaults — routers may still override per-endpoint where appropriate
DEFAULT_LIMIT = 50
DEFAULT_DETAIL_LIMIT = 25
MAX_LIMIT = 200
DEFAULT_OFFSET = 0
