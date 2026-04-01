"""
WeThePeople API — main application entry point.

All route logic lives in routers/. This file handles:
  - App creation & middleware (CORS, rate limiting, request tracing)
  - Router mounting
  - Startup events (structured logging, metrics)
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

# --- Structured Logging (must be first, before any logger usage) ---
from utils.logging import setup_logging, get_logger
setup_logging(level=os.getenv("WTP_LOG_LEVEL", "INFO"))
_logger = get_logger(__name__)

# --- Rate Limiter ---
# Default: 60 requests/minute per IP. Override with WTP_RATE_LIMIT env var.
_rate_limit = os.getenv("WTP_RATE_LIMIT", "60/minute")
limiter = Limiter(key_func=get_remote_address, default_limits=[_rate_limit])

app = FastAPI(
    title="WeThePeople API",
    description="Civic transparency platform tracking corporate influence on Congress across 8 sectors",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# --- Request Tracing Middleware ---
from middleware.tracing import TracingMiddleware
app.add_middleware(TracingMiddleware)

# --- Security Headers ---
from middleware.security import SecurityHeadersMiddleware
app.add_middleware(SecurityHeadersMiddleware)

# --- CORS ---
_cors_origins_raw = os.getenv(
    "CORS_ALLOW_ORIGINS",
    "https://wethepeopleforus.com,https://www.wethepeopleforus.com,http://localhost:5173,http://127.0.0.1:5173",
)
_cors_origins = [o.strip() for o in _cors_origins_raw.split(",") if o.strip()]
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-WTP-API-KEY"],
    )


# --- Startup ---
# TODO: migrate to lifespan context manager when upgrading FastAPI
@app.on_event("startup")
async def startup_event():
    """Fetch recent presidential documents on startup."""
    if os.getenv("DISABLE_STARTUP_FETCH") == "1":
        return
    try:
        from connectors.federal_register import fetch_presidential_documents
        fetch_presidential_documents(pages=3)
        _logger.info("Federal Register data loaded successfully")
    except Exception as e:
        _logger.warning("Failed to load Federal Register data: %s", e)


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
from routers.transportation import router as transportation_router
from routers.defense import router as defense_router
from routers.chemicals import router as chemicals_router
from routers.agriculture import router as agriculture_router
from routers.infrastructure import router as infrastructure_router
from routers.state import router as state_router
from routers.aggregate import router as aggregate_router
from routers.claims import router as claims_router
from routers.chat import router as chat_router
from routers.anomalies import router as anomalies_router
from routers.digest import router as digest_router
from routers.og import router as og_router
from routers.stories import router as stories_router
from routers.metrics import router as metrics_router
from routers.auth import router as auth_router
from routers.ops import router as ops_router
from routers.research_tools import router as research_tools_router
from routers.fara import router as fara_router
from routers.lookup import router as lookup_router

# --- Backward-compatible mounts (unprefixed, existing clients) ---
app.include_router(auth_router)
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
app.include_router(transportation_router)
app.include_router(defense_router)
app.include_router(chemicals_router)
app.include_router(agriculture_router)
app.include_router(infrastructure_router)
app.include_router(state_router)
app.include_router(aggregate_router)
app.include_router(claims_router, prefix="/claims", tags=["claims"])
app.include_router(chat_router, prefix="/chat", tags=["chat"])
app.include_router(anomalies_router)
app.include_router(digest_router)
app.include_router(og_router)
app.include_router(stories_router)
app.include_router(metrics_router)
app.include_router(ops_router)
app.include_router(research_tools_router)
app.include_router(fara_router)
app.include_router(lookup_router)

_logger.info("WeThePeople API started, env=%s", os.getenv("WTP_ENV", "production"))


# --- Versioned API (v1) — all the same routers under /v1/ prefix ---
from fastapi import APIRouter as _APIRouter

v1 = _APIRouter(prefix="/v1")
v1.include_router(auth_router)
v1.include_router(common_router)
v1.include_router(politics_router)
v1.include_router(finance_router)
v1.include_router(health_router)
v1.include_router(tech_router)
v1.include_router(influence_router)
v1.include_router(search_router)
v1.include_router(education_router)
v1.include_router(energy_router)
v1.include_router(transportation_router)
v1.include_router(defense_router)
v1.include_router(chemicals_router)
v1.include_router(agriculture_router)
v1.include_router(infrastructure_router)
v1.include_router(state_router)
v1.include_router(aggregate_router)
v1.include_router(claims_router, prefix="/claims", tags=["claims"])
v1.include_router(chat_router, prefix="/chat", tags=["chat"])
v1.include_router(anomalies_router)
v1.include_router(digest_router)
v1.include_router(og_router)
v1.include_router(stories_router)
v1.include_router(research_tools_router)
v1.include_router(fara_router)

app.include_router(v1)
