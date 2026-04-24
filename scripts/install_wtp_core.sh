#!/usr/bin/env bash
# Idempotent installer for the proprietary wtp-core package.
#
# wtp-core lives in a private GitHub repo (Obelus-Labs-LLC/wtp-core). We
# deliberately don't pull it via SSH deploy key — keeping a long-lived
# GitHub credential on the prod box widens the blast radius if Hetzner
# is ever compromised. Instead we transport the source via scp/tar and
# install locally from it.
#
# Expected layout on Hetzner (already present as of 2026-04-24):
#   /home/dshon/wtp-core/
#     ├── pyproject.toml
#     └── wtp_core/
#         ├── __init__.py
#         ├── claims/
#         ├── detection/     # detect_stories.py intentionally removed;
#         │                  # main-repo jobs/detect_stories.py is newer.
#         └── influence/
#
# To refresh wtp-core (when a new version lands on GitHub):
#   1. Locally: gh repo clone Obelus-Labs-LLC/wtp-core /tmp/wtp-core
#   2. Delete /tmp/wtp-core/wtp_core/detection/detect_stories.py
#   3. tar czf /tmp/wtp-core.tar.gz -C /tmp/wtp-core wtp_core pyproject.toml README.md
#   4. scp /tmp/wtp-core.tar.gz root@138.199.214.174:/tmp/
#   5. ssh root@138.199.214.174 "tar -xzf /tmp/wtp-core.tar.gz -C /home/dshon/wtp-core"
#   6. ssh root@138.199.214.174 "bash /home/dshon/wethepeople-backend/scripts/install_wtp_core.sh"

set -euo pipefail

VENV="/home/dshon/wethepeople-backend/.venv"
SRC="/home/dshon/wtp-core"

if [[ ! -d "$VENV" ]]; then
    echo "venv missing at $VENV" >&2
    exit 1
fi
if [[ ! -f "$SRC/pyproject.toml" ]]; then
    echo "wtp-core source missing at $SRC (expected pyproject.toml)" >&2
    exit 1
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"
pip install --upgrade "$SRC"

# Verify the import surfaces we actually use at runtime. Some wtp-core
# modules reference the main-app `models` package, so we cd into the
# backend dir first — that's the PYTHONPATH the real jobs use.
cd /home/dshon/wethepeople-backend
python - <<'PY'
import wtp_core  # noqa: F401
import wtp_core.detection.detect_anomalies  # noqa: F401
import wtp_core.claims.match  # noqa: F401
import wtp_core.influence.network  # noqa: F401
print("wtp-core imports OK:", wtp_core.__version__)
PY

echo "Restart the API to pick up the new code:"
echo "  systemctl restart wethepeople.service"
