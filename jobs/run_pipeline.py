"""Cron entry for the research-pipeline orchestrator.

Replaces the daily detect_stories.main() invocation. Runs the
orchestrator state machine:

    black_swan / rotating selector -> dedup -> orphan_check ->
    Veritas pre-write -> research_agent (or detector fallback) ->
    Veritas post-write (with revision loop) -> persist draft ->
    vault flywheel.

Cadence: WTP_STORY_CADENCE_DAYS (default 3). The cron itself runs
daily; this script self-throttles by checking how recent the most-
recent draft+published story is. If the cadence window hasn't
elapsed, it logs and exits cleanly.

Invocation:
    python jobs/run_pipeline.py
    python jobs/run_pipeline.py --force         # ignore cadence
    python jobs/run_pipeline.py --dry-run       # selection only

The --force flag exists for ops + the bring-up window: when we
want a story TODAY rather than waiting for the cadence.

Environment (set in /etc/wtp.env on Hetzner):

    WTP_RESEARCH_AGENT_ENABLED=1     # flip to 1 once the agent is installed
    WTP_VERITAS_ENABLED=1
    WTP_VERITAS_STRICT=1             # set 0 only during initial bring-up
    WTP_AGENT_BUDGET_USD=7.0
    WTP_STORY_CADENCE_DAYS=3
    VERITAS_BASE_URL=http://127.0.0.1:8007
    VERITAS_API_KEY=<from veritas .env>
    WTP_DB_PATH=/opt/wtp/wethepeople.db
        # Required by the research-agent's SQLite MCP server. The
        # agent's extractor stage queries WTP rows via the MCP
        # server and emits internal://wtp-db/{table}/{row_id}
        # claim URIs that Veritas auto-promotes to HIGH confidence.

Install (Hetzner):

    pip install \\
      'research-agent @ git+ssh://git@github.com/Rocketshon/research-agent.git@wtp-integration'
    alembic upgrade head
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timedelta, timezone

# Make repo root importable when invoked as `python jobs/run_pipeline.py`.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from sqlalchemy import text

from models.database import SessionLocal, Base, engine
from services.research_pipeline.orchestrator import OrchestratorConfig, run_daily

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("run_pipeline")


def _hours_since_last_story(db) -> float | None:
    """Return hours since the most recent draft+published story, or
    None if the stories table is empty / unreadable."""
    try:
        row = db.execute(
            text(
                "SELECT COALESCE(published_at, created_at) AS ts "
                "FROM stories "
                "WHERE status IN ('draft', 'published') "
                "ORDER BY ts DESC "
                "LIMIT 1"
            )
        ).fetchone()
    except Exception as e:
        log.warning("could not read stories table: %s", e)
        return None
    if not row or row.ts is None:
        return None
    ts = row.ts
    if isinstance(ts, str):
        try:
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - ts).total_seconds() / 3600.0


def main() -> int:
    parser = argparse.ArgumentParser(description="WTP research-pipeline cron entry")
    parser.add_argument("--force", action="store_true",
                        help="ignore cadence window and run unconditionally")
    parser.add_argument("--dry-run", action="store_true",
                        help="run gates but skip persistence")
    args = parser.parse_args()

    Base.metadata.create_all(engine)
    cfg = OrchestratorConfig()
    db = SessionLocal()

    try:
        if not args.force:
            hrs = _hours_since_last_story(db)
            min_hrs = cfg.cadence_days * 24 - 6  # 6h slack so a daily cron actually fires
            if hrs is not None and hrs < min_hrs:
                log.info(
                    "cadence: only %.1fh since last story (need %.1fh); skipping. "
                    "Use --force to override.",
                    hrs, min_hrs,
                )
                return 0

        log.info(
            "starting orchestrator (veritas=%s strict=%s agent=%s budget=$%.2f cadence=%dd)",
            cfg.veritas_enabled, cfg.veritas_strict,
            cfg.research_agent_enabled, cfg.research_agent_budget_usd, cfg.cadence_days,
        )
        if cfg.research_agent_enabled and not os.getenv("WTP_DB_PATH"):
            log.warning(
                "WTP_RESEARCH_AGENT_ENABLED=1 but WTP_DB_PATH is not set. "
                "The agent's SQLite MCP server will not have a path to the WTP database, "
                "so its extractor cannot emit internal://wtp-db/ claim URIs. "
                "Internal-DB claims will be re-classified as external_web and lose their "
                "automatic HIGH confidence weighting. Set WTP_DB_PATH=/path/to/wethepeople.db."
            )
        if args.dry_run:
            os.environ["WTP_DRY_RUN"] = "1"

        result = run_daily(db, config=cfg)
    finally:
        db.close()

    print(json.dumps(result.to_dict(), indent=2, default=str))

    if result.story_id and result.story_id > 0:
        log.info("persisted draft story #%d", result.story_id)
        return 0
    if result.rejected_at:
        log.warning("rejected at gate=%s", result.rejected_at)
        return 1
    log.info("no story this cycle (no eligible candidate)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
