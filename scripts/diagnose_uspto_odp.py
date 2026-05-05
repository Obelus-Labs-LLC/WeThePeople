#!/usr/bin/env python3
"""
Diagnose USPTO Open Data Portal (ODP) connectivity + key.

Verifies:
  1. USPTO_API_KEY is set
  2. The key authenticates against /api/v1/datasets/products/search
  3. The patent-grant datasets we care about (PVGPATDIS, PVANNUAL,
     PVGPATTXT, PTGRXML) are listed and have file URIs
  4. The most recent file's metadata (size, last-modified) looks
     fresh (< 6 months old for quarterly products, < 30 days for
     weekly products)

Run on any machine with the API key in env or .env. Read-only —
makes a few small HTTP calls, no downloads.

Usage
-----
    python scripts/diagnose_uspto_odp.py
    python scripts/diagnose_uspto_odp.py --product PVGPATDIS
"""

import argparse
import os
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from connectors.uspto_odp import (  # noqa: E402
    API_KEY,
    RELEVANT_PATENT_PRODUCTS,
    find_patent_grant_products,
    get_product_detail,
    list_files_for_product,
    list_products,
)

load_dotenv()


def _fmt_size(b: int) -> str:
    if not b:
        return "?"
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if b < 1024:
            return f"{b:.1f} {unit}"
        b /= 1024  # type: ignore
    return f"{b:.1f} PB"


def _staleness_days(last_modified: str | None) -> int | None:
    if not last_modified:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%S"):
        try:
            dt = datetime.strptime(last_modified, fmt).replace(tzinfo=timezone.utc)
            return (datetime.now(timezone.utc) - dt).days
        except ValueError:
            continue
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--product", default=None,
        help="Single product identifier to inspect (e.g. PVGPATDIS). "
             "Defaults to all relevant patent products.",
    )
    args = parser.parse_args()

    print("=== USPTO ODP diagnostic ===")
    print()

    # 1. Key check.
    if not API_KEY:
        print("FAIL — USPTO_API_KEY is not set.")
        print("Register at https://api.uspto.gov and set USPTO_API_KEY in .env.")
        return 1
    masked = API_KEY[:6] + "..." + API_KEY[-4:] if len(API_KEY) > 10 else "<short>"
    print(f"  USPTO_API_KEY:  {masked}  (length {len(API_KEY)})")

    # 2. Auth probe via products/search.
    print()
    print("=== /products/search authentication probe ===")
    products = list_products(query="Patent")
    if not products:
        print("FAIL — products/search returned 0 rows or HTTP error.")
        print("  Check the logs above for HTTP status; 401/403 indicates the key is invalid.")
        return 1
    print(f"  OK — auth works.  {len(products)} patent products visible.")

    # 3. Drill into the relevant patent-grant products.
    targets = [args.product] if args.product else list(RELEVANT_PATENT_PRODUCTS)
    print()
    print(f"=== Inspecting {len(targets)} patent-grant product(s) ===")
    any_stale = False
    for product_id in targets:
        print()
        print(f"--- {product_id} ---")
        detail = get_product_detail(product_id)
        if not detail:
            print(f"  FAIL — could not fetch product detail")
            continue
        print(f"  title:       {detail.get('productTitleText')}")
        print(f"  frequency:   {detail.get('productFrequencyText')}")
        print(f"  total size:  {_fmt_size(detail.get('productTotalFileSize') or 0)}")
        print(f"  files:       {detail.get('productFileTotalQuantity')}")
        print(f"  modified:    {detail.get('lastModifiedDateTime')}")
        stale = _staleness_days(detail.get("lastModifiedDateTime"))
        if stale is not None:
            cap = 35 if (detail.get("productFrequencyText") or "").upper() == "WEEKLY" else 200
            warn = "  STALE!" if stale > cap else ""
            print(f"  last update: {stale} days ago{warn}")
            if stale > cap:
                any_stale = True

        files = list_files_for_product(product_id)
        if files:
            print(f"  most recent file:")
            # USPTO returns files sorted alphabetically; sort by last modified to
            # find the freshest.
            sorted_files = sorted(
                files, key=lambda f: f.get("fileLastModifiedDateTime") or "", reverse=True,
            )
            top = sorted_files[0]
            print(f"    name:        {top.get('fileName')}")
            print(f"    size:        {_fmt_size(top.get('fileSize') or 0)}")
            print(f"    released:    {top.get('fileReleaseDate')}")
            print(f"    download:    {top.get('fileDownloadURI')}")

    print()
    if any_stale:
        print("Some products look stale.  Continue with caution; USPTO may have")
        print("paused updates, or the dataset frequency may have changed.")
        return 1
    print("All checks passed.  ODP integration is ready.")
    print()
    print("Next: implement the bulk-ingest job (download, parse, filter, DB).")
    print("See connectors/uspto_odp.py for the architecture.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
