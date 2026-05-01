"""
WeThePeople API — main application entry point.

All route logic lives in routers/. This file handles:
  - App creation & middleware (CORS, rate limiting, request tracing)
  - Router mounting
  - Startup events (structured logging, metrics)
"""

import os
import threading
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

load_dotenv()

# --- Structured Logging (must be first, before any logger usage) ---
from utils.logging import setup_logging, get_logger
setup_logging(level=os.getenv("WTP_LOG_LEVEL", "INFO"))
_logger = get_logger(__name__)

# --- Rate Limiter ---
# Default: 60 requests/minute per IP. Override with WTP_RATE_LIMIT env var.
# Uses get_client_ip (trusted-proxy aware) instead of slowapi's
# get_remote_address, which blindly trusts X-Forwarded-For. See
# services/auth.get_client_ip for the trust model.
from services.auth import get_client_ip as _trusted_get_client_ip
_rate_limit = os.getenv("WTP_RATE_LIMIT", "60/minute")
limiter = Limiter(key_func=_trusted_get_client_ip, default_limits=[_rate_limit])

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context: startup/shutdown logic.

    Federal Register backfill runs only on the worker that wins a tiny
    file-based lock. Without this, every uvicorn worker (`--workers N`)
    fired its own `fetch_presidential_documents(pages=3)` on cold start,
    hammering api.federalregister.gov in parallel and producing duplicate
    inserts that the connector then had to dedupe.
    """
    if os.getenv("DISABLE_STARTUP_FETCH") != "1":
        def _bg_fetch():
            from pathlib import Path
            lock_dir = Path(os.getenv("WTP_RUNTIME_DIR", ".")) / "data"
            lock_dir.mkdir(parents=True, exist_ok=True)
            lock_path = lock_dir / "fr_startup_fetch.lock"
            try:
                lock_fh = open(lock_path, "w")
                try:
                    import fcntl
                    try:
                        fcntl.flock(lock_fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    except OSError:
                        # Another worker holds the lock; back off.
                        lock_fh.close()
                        return
                except ImportError:
                    # Windows fallback: best-effort, no lock.
                    pass

                try:
                    from connectors.federal_register import fetch_presidential_documents
                    fetch_presidential_documents(pages=3)
                    _logger.info("Federal Register data loaded successfully")
                except Exception as e:
                    _logger.warning("Failed to load Federal Register data: %s", e)
                finally:
                    lock_fh.close()
            except Exception as e:
                _logger.warning("Startup fetch lock acquisition failed: %s", e)
        threading.Thread(target=_bg_fetch, daemon=True).start()
    yield


app = FastAPI(
    title="WeThePeople API",
    description="Civic transparency platform tracking corporate influence on Congress across 11 sectors",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)
app.state.limiter = limiter
# Gzip compression for any response >= 1024 bytes. Cuts /full
# payload (~100KB politician profiles, ~10KB story payloads) by
# ~70-80% on the wire. Phase 4-X. Must be added before CORS so
# the compressed body is what CORS-preflight responds about.
app.add_middleware(GZipMiddleware, minimum_size=1024)

app.add_middleware(SlowAPIMiddleware)
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# --- Request Tracing Middleware ---
from middleware.tracing import TracingMiddleware
app.add_middleware(TracingMiddleware)

# --- Security Headers ---
from middleware.security import SecurityHeadersMiddleware
app.add_middleware(SecurityHeadersMiddleware)

# --- Public-facing rate-limit headers ---
# Surfaces RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset on
# every JSON / CSV / XML response so API consumers can self-pace rather
# than discover the limit by getting blocked.
from middleware.rate_limit_headers import RateLimitHeadersMiddleware
app.add_middleware(RateLimitHeadersMiddleware)

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
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-WTP-API-KEY"],
    )




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
from routers.telecom import router as telecom_router
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
from routers.civic import router as civic_router
from routers.bulk import router as bulk_export_router, bulk_router
from routers.tips import router as tips_router
from routers.events import router as events_router

# --- Backward-compatible mounts (unprefixed, existing clients) ---
app.include_router(auth_router)
app.include_router(common_router)
# Claims router MUST come before politics_router: politics has a greedy
# /claims/{claim_id} path-param route that would swallow requests for
# /claims/verifications, /claims/dashboard/stats, etc.
app.include_router(claims_router, prefix="/claims", tags=["claims"])
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
app.include_router(telecom_router)
app.include_router(infrastructure_router)
app.include_router(state_router)
app.include_router(aggregate_router)
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
app.include_router(tips_router)
app.include_router(events_router)
app.include_router(civic_router)
app.include_router(bulk_export_router)  # /export/{table}.csv
app.include_router(bulk_router)         # /bulk/snapshot, /bulk/manifest

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
v1.include_router(telecom_router)
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
v1.include_router(metrics_router)
v1.include_router(ops_router)
v1.include_router(lookup_router)
v1.include_router(civic_router)
v1.include_router(bulk_export_router)
v1.include_router(bulk_router)

app.include_router(v1)
