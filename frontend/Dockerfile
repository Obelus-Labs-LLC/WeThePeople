# =============================================================================
# WeThePeople Frontend — Multi-stage Docker build
# =============================================================================
# Build:  docker build -t wethepeople-frontend ./frontend
# Run:    docker run -p 80:80 -e WTP_API_UPSTREAM=http://api:8006 wethepeople-frontend
#
# NOTE: Production frontend is deployed via Vercel auto-deploy on GitHub push.
# This Dockerfile is for self-hosted / containerized deployments.
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Build — install deps and compile
# ---------------------------------------------------------------------------
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: Serve — nginx with built assets
# ---------------------------------------------------------------------------
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our nginx config as a template (for envsubst)
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Copy built frontend assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Default API upstream (overridden via environment variable)
ENV WTP_API_UPSTREAM=http://api:8006

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -q --spider http://localhost/nginx-health || exit 1

# nginx:alpine image handles envsubst automatically via /docker-entrypoint.d/
CMD ["nginx", "-g", "daemon off;"]
