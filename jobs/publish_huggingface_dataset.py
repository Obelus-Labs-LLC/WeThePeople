"""Publish the nightly snapshot to HuggingFace Datasets.

Reads the latest snapshot from the bulk dump directory, splits the
relevant tables into Parquet shards (HF's preferred format), and pushes
them to ``huggingface.co/datasets/<HF_NAMESPACE>/wethepeople``.

Run manually for now (set ``HF_TOKEN`` first), then move to a weekly
cron once the dataset card is final and you've reviewed the first push.

Idempotent: HF Datasets dedupes commits, so re-running on the same
snapshot is a no-op.

Setup
-----
    pip install huggingface_hub pandas pyarrow

    export HF_TOKEN=hf_xxx              # from huggingface.co/settings/tokens
    export HF_NAMESPACE=obelus-labs     # or your personal handle
    export WTP_BULK_DIR=/var/www/wtp-bulk  # where dump_public_snapshot.py writes

Run
---
    python jobs/publish_huggingface_dataset.py --dry-run
    python jobs/publish_huggingface_dataset.py
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
import tempfile
from pathlib import Path

DEFAULT_BULK_DIR = "/var/www/wtp-bulk"
DEFAULT_DATASET_NAME = "wethepeople"

# Tables we publish as separate Parquet files. Selecting a curated set
# keeps the dataset readable on HF (the UI shows table previews better
# when each split is one logical entity, not 70 internal tables).
PUBLISHED_TABLES = [
    "stories",
    "tracked_members",
    "tracked_tech_companies",
    "tracked_companies",            # health
    "tracked_energy_companies",
    "tracked_defense_companies",
    "tracked_transportation_companies",
    "tracked_chemical_companies",
    "tracked_agriculture_companies",
    "tracked_telecom_companies",
    "tracked_education_companies",
    "lobbying_records",             # tech
    "health_lobbying_records",
    "energy_lobbying_records",
    "transportation_lobbying_records",
    "defense_lobbying_records",
    "chemical_lobbying_records",
    "agriculture_lobbying_records",
    "telecom_lobbying_records",
    "education_lobbying_records",
    "congressional_trades",
    "company_donations",
    "bills",
    "bill_actions",
    "votes",
    "member_votes",
]


def write_dataset_card(out_dir: Path, snapshot_filename: str, generated_at: str) -> None:
    """Generate README.md (HuggingFace dataset card) for the upload."""
    card = f"""---
license: agpl-3.0
language:
  - en
size_categories:
  - 100K<n<1M
tags:
  - civic-tech
  - government-transparency
  - lobbying
  - congress
  - public-records
  - politics
  - open-data
pretty_name: WeThePeople — US Civic Influence Dataset
---

# WeThePeople — US Civic Influence Dataset

Nightly mirror of the [WeThePeople](https://wethepeopleforus.com) civic-transparency
platform. Tracks how corporate money moves through US federal politics:
lobbying disclosures, congressional stock trades, government contracts,
enforcement actions, PAC donations, and the 537 sitting members of
Congress they connect to.

Generated from the production SQLite database. Sensitive tables (users,
API keys, audit logs, watchlists) are stripped; story drafts and
retractions are filtered out. Everything else is included verbatim.

## Source snapshot

- **Filename:** `{snapshot_filename}`
- **Generated:** {generated_at}
- **Bulk SQLite:** [https://api.wethepeopleforus.com/bulk/snapshot](https://api.wethepeopleforus.com/bulk/snapshot)
- **Manifest:** [https://api.wethepeopleforus.com/bulk/manifest](https://api.wethepeopleforus.com/bulk/manifest)
- **CSV exports:** [https://api.wethepeopleforus.com/export/_index](https://api.wethepeopleforus.com/export/_index)

## What's in here

Each table is published as a separate Parquet file. The most-asked-for
slices:

| File | Rows | Description |
|---|---|---|
| `stories.parquet` | ~50 | Published Influence Journal investigations |
| `tracked_members.parquet` | ~537 | All sitting members of Congress |
| `lobbying_records.parquet` | 100K+ | Senate LDA lobbying filings (tech sector) |
| `*_lobbying_records.parquet` | 100K+ each | Lobbying filings by sector (health, energy, defense, etc.) |
| `congressional_trades.parquet` | 25K+ | Stock trades disclosed under the STOCK Act |
| `company_donations.parquet` | 50K+ | FEC PAC and corporate donations |
| `bills.parquet` / `bill_actions.parquet` | 30K+ / 200K+ | Congressional legislation and timelines |
| `votes.parquet` / `member_votes.parquet` | 5K+ / 1M+ | Roll-call votes and member positions |

Row counts approximate; check the live `/bulk/manifest` for exact sizes.

## Usage

```python
from datasets import load_dataset

ds = load_dataset("obelus-labs/wethepeople", "lobbying_records", split="train")
print(ds[0])
# {{
#   'company_id': 'qualcomm',
#   'client_name': 'QUALCOMM Incorporated',
#   'registrant_name': 'AKIN GUMP STRAUSS HAUER & FELD LLP',
#   'filing_year': 2024,
#   'income': 480000.0,
#   'expenses': 0,
#   ...
# }}
```

For full SQL access, use the SQLite snapshot directly — same schema,
same data:

```bash
curl -L https://api.wethepeopleforus.com/bulk/snapshot -o wtp.db.gz
gunzip wtp.db.gz
sqlite3 wtp.db "SELECT * FROM stories LIMIT 5;"
```

## Methodology & caveats

- **Lobbying spend aggregation:** When summing across LDA filings, prefer
  the `expenses` column on in-house filings; fall back to `income` only
  when no in-house filing exists for a given (company, year). This is
  the OpenSecrets / Senate Office of Public Records convention.
  Naively summing `income + expenses` double-counts every dollar
  companies pay to outside firms. See the
  [services/lobby_spend.py](https://github.com/Obelus-Labs-LLC/WeThePeople/blob/main/services/lobby_spend.py)
  module for the canonical SQL.

- **Identity matching:** Companies are matched by best-effort
  normalisation (stripped corporate suffixes, common aliases). Some
  parent / subsidiary relationships may be split across multiple
  `company_id` rows.

- **Story drafts excluded:** Only `status='published'` stories are
  shipped. Drafts and retracted stories are not included.

## License & attribution

- **Schema and platform code:** AGPL-3.0
- **Underlying data:** Public-domain US government records (Senate LDA,
  FEC, USAspending.gov, congressional disclosures, FDA, etc.)
  redistributed under the originating agency's terms.

Attribution appreciated:

> Data: WeThePeople (wethepeopleforus.com), aggregated from public US government records.

## Citation

```bibtex
@dataset{{wethepeople2026,
  title  = {{WeThePeople: US Civic Influence Dataset}},
  author = {{WeThePeople / Obelus Labs LLC}},
  year   = {{2026}},
  url    = {{https://huggingface.co/datasets/obelus-labs/wethepeople}}
}}
```

## Updates & corrections

The dataset is regenerated nightly. Corrections, errata, and
methodology questions: wethepeopleforus@gmail.com.

Source code: [github.com/Obelus-Labs-LLC/WeThePeople](https://github.com/Obelus-Labs-LLC/WeThePeople)
"""
    (out_dir / "README.md").write_text(card, encoding="utf-8")


def export_table_to_parquet(conn: sqlite3.Connection, table: str, out_path: Path) -> int:
    """Read a table into pandas, write Parquet. Returns row count."""
    import pandas as pd  # noqa: imported here so the dataset card can be
                         # generated even when pyarrow isn't installed
    try:
        df = pd.read_sql(f"SELECT * FROM {table}", conn)
    except Exception as e:
        print(f"  skip {table}: {e}", file=sys.stderr)
        return 0
    if df.empty:
        return 0
    df.to_parquet(out_path, compression="zstd", index=False)
    return len(df)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bulk-dir", default=os.getenv("WTP_BULK_DIR", DEFAULT_BULK_DIR))
    ap.add_argument("--namespace", default=os.getenv("HF_NAMESPACE", "obelus-labs"))
    ap.add_argument("--dataset", default=DEFAULT_DATASET_NAME)
    ap.add_argument("--dry-run", action="store_true",
                    help="Build the Parquet files locally but don't push to HF.")
    args = ap.parse_args()

    bulk_dir = Path(args.bulk_dir)
    snapshot = bulk_dir / "wtp-snapshot-latest.db.gz"
    if not snapshot.exists():
        print(f"ERROR: latest snapshot not found at {snapshot}", file=sys.stderr)
        print("Run jobs/dump_public_snapshot.py first.", file=sys.stderr)
        sys.exit(2)

    import gzip
    import json
    import shutil

    manifest_path = bulk_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

    with tempfile.TemporaryDirectory() as tmpd:
        work = Path(tmpd)
        out = work / "dataset"
        out.mkdir()

        # Decompress snapshot.
        db_path = work / "wtp.db"
        with gzip.open(snapshot, "rb") as f_in, open(db_path, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out, length=1 << 20)

        conn = sqlite3.connect(str(db_path))
        try:
            print("Exporting tables to Parquet...")
            for t in PUBLISHED_TABLES:
                target = out / f"{t}.parquet"
                rows = export_table_to_parquet(conn, t, target)
                print(f"  {t:42s}  rows={rows}")
        finally:
            conn.close()

        write_dataset_card(
            out,
            snapshot_filename=manifest.get("filename", snapshot.name),
            generated_at=manifest.get("generated_at", "unknown"),
        )

        if args.dry_run:
            print(f"\n[dry-run] Built {len(list(out.iterdir()))} files in {out}")
            print("Inspect, then re-run without --dry-run to push to HuggingFace.")
            return

        # Push to HuggingFace.
        try:
            from huggingface_hub import HfApi, login
        except ImportError:
            print("ERROR: huggingface_hub not installed.", file=sys.stderr)
            print("Install with: pip install huggingface_hub pandas pyarrow", file=sys.stderr)
            sys.exit(2)

        token = os.getenv("HF_TOKEN")
        if not token:
            print("ERROR: HF_TOKEN env var not set.", file=sys.stderr)
            sys.exit(2)

        login(token=token, add_to_git_credential=False)
        api = HfApi()
        repo_id = f"{args.namespace}/{args.dataset}"

        # Create the repo if it doesn't exist (idempotent).
        api.create_repo(repo_id, repo_type="dataset", exist_ok=True, private=False)

        api.upload_folder(
            folder_path=str(out),
            repo_id=repo_id,
            repo_type="dataset",
            commit_message=(
                f"Snapshot {manifest.get('filename', snapshot.name)} "
                f"({manifest.get('generated_at', 'unknown')})"
            ),
        )
        print(f"Pushed to https://huggingface.co/datasets/{repo_id}")


if __name__ == "__main__":
    main()
