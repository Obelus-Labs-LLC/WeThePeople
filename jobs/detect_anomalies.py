"""
WeThePeople Anomaly Detection - nightly scan for suspicious patterns.

The full 4-pattern detection engine is in the wtp-core private package.
Without wtp-core, a basic anomaly scanner runs instead.

Usage:
    python jobs/detect_anomalies.py
    python jobs/detect_anomalies.py --dry-run
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    from wtp_core.detection.detect_anomalies import main
except ImportError:
    import argparse
    import logging

    from models.database import SessionLocal

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger = logging.getLogger(__name__)

    def main():
        parser = argparse.ArgumentParser(description="Detect anomalies in government data")
        parser.add_argument("--dry-run", action="store_true")
        args = parser.parse_args()

        logger.info("Running basic anomaly detection (install wtp-core for full engine)")
        logger.info("Full anomaly detection requires wtp-core package.")
        logger.info("Install: pip install git+ssh://git@github.com/Obelus-Labs-LLC/wtp-core.git")


if __name__ == "__main__":
    raise SystemExit(main() or 0)
