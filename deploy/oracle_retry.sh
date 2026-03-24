#!/bin/bash
# Oracle ARM VM retry script — keeps trying until instances land.
# Usage: nohup bash deploy/oracle_retry.sh >> ~/logs/oracle_retry.log 2>&1 &
#
# Free tier A1.Flex: 4 OCPUs + 24GB RAM total across all instances.
# Plan: wtp-prod (1 OCPU/6GB), hedgebrain-prod (2 OCPU/12GB), guardian-prod (1 OCPU/6GB)

COMPARTMENT="${OCI_COMPARTMENT_ID:?Set OCI_COMPARTMENT_ID in .env}"
IMAGE="${OCI_IMAGE_ID:?Set OCI_IMAGE_ID in .env}"
SUBNET="${OCI_SUBNET_ID:?Set OCI_SUBNET_ID in .env}"
SSH_KEY="$HOME/.ssh/id_ed25519.pub"
ADS=("ShPR:US-CHICAGO-1-AD-1" "ShPR:US-CHICAGO-1-AD-2" "ShPR:US-CHICAGO-1-AD-3")
RETRY_INTERVAL=120  # seconds between attempts

# Track which instances we've successfully launched
WTP_LANDED=false
HB_LANDED=false
GUARD_LANDED=false

MARKER_DIR="$HOME/.oracle_retry"
mkdir -p "$MARKER_DIR"

# Check if already landed (from a previous run)
[ -f "$MARKER_DIR/wtp-prod" ] && WTP_LANDED=true
[ -f "$MARKER_DIR/hedgebrain-prod" ] && HB_LANDED=true
[ -f "$MARKER_DIR/guardian-prod" ] && GUARD_LANDED=true

launch_instance() {
    local name=$1
    local ocpus=$2
    local mem=$3
    local ad=$4

    echo "$(date): Trying $name ($ocpus OCPU, ${mem}GB) in $ad..."

    result=$(oci compute instance launch \
        --compartment-id "$COMPARTMENT" \
        --availability-domain "$ad" \
        --shape VM.Standard.A1.Flex \
        --shape-config "{\"ocpus\": $ocpus, \"memoryInGBs\": $mem}" \
        --display-name "$name" \
        --image-id "$IMAGE" \
        --subnet-id "$SUBNET" \
        --assign-public-ip true \
        --ssh-authorized-keys-file "$SSH_KEY" \
        --output json 2>&1)

    if echo "$result" | grep -q '"lifecycle-state"'; then
        echo "$(date): SUCCESS — $name launched!"
        echo "$result" | python3 -c "
import json, sys
d = json.load(sys.stdin)['data']
print(f'  ID:    {d[\"id\"]}')
print(f'  State: {d[\"lifecycle-state\"]}')
print(f'  AD:    {d[\"availability-domain\"]}')
" 2>/dev/null
        touch "$MARKER_DIR/$name"
        return 0
    else
        echo "$(date): $name failed — $(echo "$result" | grep -o '"message": "[^"]*"' | head -1)"
        return 1
    fi
}

echo "$(date): Starting Oracle ARM retry loop..."
echo "  wtp-prod:       $([ "$WTP_LANDED" = true ] && echo 'ALREADY LANDED' || echo 'pending')"
echo "  hedgebrain-prod: $([ "$HB_LANDED" = true ] && echo 'ALREADY LANDED' || echo 'pending')"
echo "  guardian-prod:   $([ "$GUARD_LANDED" = true ] && echo 'ALREADY LANDED' || echo 'pending')"

attempt=0
while true; do
    # Check if all 3 are done
    if [ "$WTP_LANDED" = true ] && [ "$HB_LANDED" = true ] && [ "$GUARD_LANDED" = true ]; then
        echo "$(date): All 3 instances landed! Exiting retry loop."
        exit 0
    fi

    attempt=$((attempt + 1))
    ad="${ADS[$((attempt % 3))]}"
    echo ""
    echo "$(date): === Attempt $attempt (AD: $ad) ==="

    # Try each unlanded instance
    if [ "$WTP_LANDED" = false ]; then
        launch_instance "wtp-prod" 1 6 "$ad" && WTP_LANDED=true
    fi

    if [ "$HB_LANDED" = false ]; then
        launch_instance "hedgebrain-prod" 2 12 "$ad" && HB_LANDED=true
    fi

    if [ "$GUARD_LANDED" = false ]; then
        launch_instance "guardian-prod" 1 6 "$ad" && GUARD_LANDED=true
    fi

    # Don't retry if all landed this round
    if [ "$WTP_LANDED" = true ] && [ "$HB_LANDED" = true ] && [ "$GUARD_LANDED" = true ]; then
        echo "$(date): All 3 instances landed! Exiting retry loop."
        exit 0
    fi

    echo "$(date): Sleeping ${RETRY_INTERVAL}s before next attempt..."
    sleep $RETRY_INTERVAL
done
