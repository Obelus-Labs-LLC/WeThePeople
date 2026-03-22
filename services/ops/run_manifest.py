from __future__ import annotations

import json
import subprocess
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from models.database import PipelineRun


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def get_git_sha(repo_root: Optional[Path] = None) -> str:
    root = repo_root or Path.cwd()
    try:
        p = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=2,
        )
        if p.returncode == 0:
            sha = (p.stdout or "").strip()
            return sha or "unknown"
    except Exception:
        pass
    return "unknown"


def start_pipeline_run(
    db: Session,
    *,
    args: Dict[str, Any],
    git_sha: Optional[str] = None,
    run_id: Optional[str] = None,
) -> PipelineRun:
    rid = run_id or f"{_utc_now().strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"

    row = PipelineRun(
        run_id=rid,
        started_at=_utc_now(),
        finished_at=None,
        git_sha=git_sha,
        args_json=json.dumps(args, sort_keys=True),
        counts_json=None,
        status="running",
        error=None,
    )
    db.add(row)
    # NOTE: Commits transaction internally.
    db.commit()
    return row


def finish_pipeline_run(
    db: Session,
    *,
    run_id: str,
    status: str,
    counts: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None,
) -> None:
    row = db.query(PipelineRun).filter(PipelineRun.run_id == run_id).one_or_none()
    if row is None:
        raise RuntimeError(f"pipeline_runs missing run_id={run_id}")

    row.finished_at = _utc_now()
    row.status = status
    row.error = error
    row.counts_json = json.dumps(counts or {}, sort_keys=True)
    # NOTE: Commits transaction internally.
    db.commit()
