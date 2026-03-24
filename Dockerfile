# =============================================================================
# WeThePeople Backend — Multi-stage Docker build
# =============================================================================
# Build:  docker build -t wethepeople-api .
# Run:    docker run -p 8006:8006 --env-file .env -v ./data:/app/data wethepeople-api
#
# NOTE: This Dockerfile is primarily for documentation and future containerized
# deployment. Current production runs on bare-metal systemd (see deploy/*.service).
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Builder — install Python dependencies
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS builder

WORKDIR /build

# System deps for C extensions (cairosvg needs cairo, lxml needs libxml2)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libcairo2-dev \
    libxml2-dev \
    libxslt1-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ---------------------------------------------------------------------------
# Stage 2: Runtime — slim image with only what we need
# ---------------------------------------------------------------------------
FROM python:3.11-slim

# Runtime libs (no compilers)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libxml2 \
    libxslt1.1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

WORKDIR /app

# Copy application code
COPY main.py .
COPY routers/ routers/
COPY models/ models/
COPY connectors/ connectors/
COPY services/ services/
COPY jobs/ jobs/
COPY utils/ utils/
COPY alembic/ alembic/
COPY alembic.ini .

# Environment
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    WTP_ENV=production

# Data directory for SQLite DB (mount as volume)
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 8006

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8006/health || exit 1

# Default: run the API server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8006", "--workers", "2"]
