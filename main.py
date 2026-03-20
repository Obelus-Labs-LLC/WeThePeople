"""
WeThePeople API — main application entry point.

All route logic lives in routers/. This file handles:
  - App creation & middleware (CORS, rate limiting)
  - Router mounting
  - Startup events
"""

import os
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

load_dotenv()

# --- Rate Limiter ---
# Default: 60 requests/minute per IP. Override with WTP_RATE_LIMIT env var.
_rate_limit = os.getenv("WTP_RATE_LIMIT", "60/minute")
limiter = Limiter(key_func=get_remote_address, default_limits=[_rate_limit])

app = FastAPI(
    title="WeThePeople API",
    description="Government accountability platform — Politics, Finance, Health, Technology",
    version="1.0.0",
)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# --- CORS ---
_cors_origins_raw = os.getenv(
    "CORS_ALLOW_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
_cors_origins = [o.strip() for o in _cors_origins_raw.split(",") if o.strip()]
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
    )


# --- Startup ---
@app.on_event("startup")
async def startup_event():
    """Fetch recent presidential documents on startup."""
    if os.getenv("DISABLE_STARTUP_FETCH") == "1":
        return
    try:
        from connectors.federal_register import fetch_presidential_documents
        fetch_presidential_documents(pages=3)
        print("[OK] Federal Register data loaded successfully")
    except Exception as e:
        print(f"[WARN] Failed to load Federal Register data: {e}")


# --- Mount Routers ---
from routers.common import router as common_router
from routers.politics import router as politics_router
from routers.finance import router as finance_router
from routers.health import router as health_router
from routers.tech import router as tech_router
from routers.influence import router as influence_router
from routers.search import router as search_router

# Future sectors (scaffolded)
from routers.education import router as education_router
from routers.energy import router as energy_router
from routers.defense import router as defense_router
from routers.infrastructure import router as infrastructure_router
from routers.state import router as state_router
from routers.aggregate import router as aggregate_router

app.include_router(common_router)
app.include_router(politics_router)
app.include_router(finance_router)
app.include_router(health_router)
app.include_router(tech_router)
app.include_router(influence_router)
app.include_router(search_router)

# Future sectors — placeholder routes
app.include_router(education_router)
app.include_router(energy_router)
app.include_router(defense_router)
app.include_router(infrastructure_router)
app.include_router(state_router)
app.include_router(aggregate_router)
