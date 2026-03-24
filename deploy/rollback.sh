#!/bin/bash
# =============================================================================
# WeThePeople — Rollback Script
# =============================================================================
# Rolls back the backend to a previous git tag or commit.
#
# Usage:
#   bash deploy/rollback.sh                    # List available tags
#   bash deploy/rollback.sh v2.0               # Rollback to tag v2.0
#   bash deploy/rollback.sh abc1234            # Rollback to specific commit
#
# This script:
#   1. Checks out the specified version on the VM
#   2. Reinstalls dependencies (in case requirements changed)
#   3. Restarts the API and scheduler services
#   4. Verifies the health check passes
#
# NOTE: Frontend rollbacks are handled in Vercel's dashboard
# (Deployments -> select previous deploy -> Promote to Production)
# =============================================================================

set -euo pipefail

# Configuration
VM_NAME="wethepeople"
VM_ZONE="us-east1-b"
REMOTE_DIR="~/wethepeople-backend"
TARGET="${1:-}"

echo "=== WeThePeople Rollback ==="
echo ""

# If no target specified, show available tags
if [ -z "$TARGET" ]; then
    echo "Available tags on the VM:"
    echo "---"
    gcloud compute ssh "$VM_NAME" --zone "$VM_ZONE" --command \
        "cd $REMOTE_DIR && git tag -l --sort=-version:refname | head -10"
    echo "---"
    echo ""
    echo "Recent commits:"
    echo "---"
    gcloud compute ssh "$VM_NAME" --zone "$VM_ZONE" --command \
        "cd $REMOTE_DIR && git log --oneline -10"
    echo "---"
    echo ""
    echo "Usage: bash deploy/rollback.sh <tag-or-commit>"
    exit 0
fi

echo "  Target: $TARGET"
echo ""

# Confirm
read -p "Roll back to '$TARGET'? This will restart the API. [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 1
fi

# Record current state for potential re-rollback
echo ">>> Saving current state..."
CURRENT=$(gcloud compute ssh "$VM_NAME" --zone "$VM_ZONE" --command \
    "cd $REMOTE_DIR && git rev-parse --short HEAD" 2>/dev/null)
echo "  Current commit: $CURRENT"

# Perform rollback
echo ">>> Checking out $TARGET..."
gcloud compute ssh "$VM_NAME" --zone "$VM_ZONE" --command \
    "cd $REMOTE_DIR && git fetch --tags && git checkout $TARGET"

echo ">>> Updating dependencies..."
gcloud compute ssh "$VM_NAME" --zone "$VM_ZONE" --command \
    "cd $REMOTE_DIR && .venv/bin/pip install -q -r requirements.txt"

echo ">>> Restarting services..."
gcloud compute ssh "$VM_NAME" --zone "$VM_ZONE" --command \
    "sudo systemctl restart wethepeople && sudo systemctl restart wethepeople-scheduler"

echo ">>> Verifying health..."
sleep 3
HEALTH=$(gcloud compute ssh "$VM_NAME" --zone "$VM_ZONE" --command \
    "curl -sf http://localhost:8006/health" 2>/dev/null)

if [ -n "$HEALTH" ]; then
    echo "  Health check: PASSED"
else
    echo "  Health check: FAILED"
    echo ""
    echo "  To see logs: gcloud compute ssh $VM_NAME --zone $VM_ZONE --command 'journalctl -u wethepeople -n 50'"
    echo "  To undo:     bash deploy/rollback.sh $CURRENT"
    exit 1
fi

echo ""
echo "=== Rollback complete ==="
echo "  Rolled back to: $TARGET"
echo "  Previous state:  $CURRENT (use this to undo)"
echo "  API: http://api.wethepeopleforus.com:8006"
