"""
Data Retention Enforcement Job

Runs weekly via the scheduler to delete records past their retention window.
Wraps services/data_retention.py for subprocess execution.

Usage:
    python jobs/enforce_retention.py             # Enforce retention policies
    python jobs/enforce_retention.py --dry-run   # Show what would be deleted
    python jobs/enforce_retention.py --report    # Print retention status report
"""

import sys
from pathlib import Path

# Ensure project root is on sys.path for imports
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
load_dotenv(ROOT / ".env")

from services.data_retention import main

if __name__ == "__main__":
    raise SystemExit(main())
