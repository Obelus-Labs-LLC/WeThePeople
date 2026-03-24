#!/bin/bash
# =============================================================================
# WeThePeople — Backend Deployment Script
# =============================================================================
# Deploys the backend API to the GCP VM via git pull + systemd restart.
#
# Usage:
#   bash deploy/deploy-backend.sh              # Deploy latest main
#   bash deploy/deploy-backend.sh v3.0         # Deploy a specific tag
#
# Prerequisites:
#   - gcloud CLI authenticated with project access
#   - SSH access to the VM configured
# =============================================================================

set -euo pipefail

# Configuration
VM_NAME="wethepeople"
VM_ZONE="us-east1-b"
REMOTE_DIR="~/wethepeople-backend"
BRANCH="main"
TAG="${1:-}"

echo "=== WeThePeople Backend Deploy ==="
echo "  VM:     $VM_NAME ($VM_ZONE)"
echo "  Target: ${TAG:-latest $BRANCH}"
echo ""

# Build the remote command
if [ -n "$TAG" ]; then
    REMOTE_CMD="cd $REMOTE_DIR && git fetch --tags && git checkout $TAG"
else
    REMOTE_CMD="cd $REMOTE_DIR && git pull origin $BRANCH"
fi

# Add dependency update + service restart
REMOTE_CMD="$REMOTE_CMD && .venv/bin/pip install -q -r requirements.txt && sudo systemctl restart wethepeople && sudo systemctl restart wethepeople-scheduler"

echo ">>> Deploying..."
gcloud compute ssh "$VM_NAME" --zone "$VM_ZONE" --command "$REMOTE_CMD"

echo ""
echo ">>> Verifying health..."
sleep 3
gcloud compute ssh "$VM_NAME" --zone "$VM_ZONE" --command "curl -sf http://localhost:8006/health && echo ' OK' || echo ' FAILED'"

echo ""
echo "=== Deploy complete ==="
echo "  API: http://api.wethepeopleforus.com:8006"
echo "  Logs: gcloud compute ssh $VM_NAME --zone $VM_ZONE --command 'journalctl -u wethepeople -f'"
