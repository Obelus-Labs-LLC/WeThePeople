import json
import os
import tempfile
from pathlib import Path

from jobs.daily_run import DailyRunConfig, run_daily_pipeline


def test_daily_run_dry_run_writes_manifest() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        os.environ["DAILY_RUN_MANIFEST_DIR"] = tmp

        manifest = run_daily_pipeline(
            DailyRunConfig(
                since_days=7,
                limit_pages=1,
                congress=119,
                dry_run=True,
            )
        )

        assert manifest.get("status") == "success"
        assert manifest.get("started_at")
        assert manifest.get("finished_at")

        steps = manifest.get("steps")
        assert isinstance(steps, list)
        assert len(steps) == 5
        assert all(s.get("status") == "skipped" for s in steps)

        # Verify we actually wrote a manifest file.
        manifest_dir = Path(tmp)
        paths = list(manifest_dir.glob("daily_run_*.json"))
        assert len(paths) == 1

        loaded = json.loads(paths[0].read_text(encoding="utf-8"))
        assert loaded.get("run_id") == manifest.get("run_id")
        assert loaded.get("status") == "success"


def main() -> None:
    test_daily_run_dry_run_writes_manifest()
    print("PASS: test_daily_run_orchestrator passed")


if __name__ == "__main__":
    main()
