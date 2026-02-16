"""
Ground Truth Sync - Modern Version

Uses new HTTP client with retries, caching, and Pydantic models.
"""

import sys
import time
from pathlib import Path
from typing import List, Tuple
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent))

from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TimeElapsedColumn

from utils.config import config
from utils.http_client import http_client, AuthError, RateLimitError
from utils.models import SponsoredLegislationResponse, CongressBillItem
from models.database import SessionLocal, MemberBillGroundTruth, Bill

console = Console()


def fetch_member_bills_v2(
    bioguide_id: str,
    congress: int,
    role: str = "both",
    use_cache: bool = True,
    rate_limit: float = None
) -> List[Tuple[str, str]]:
    """
    Fetch bills for a member using new HTTP client.
    
    Args:
        bioguide_id: Member bioguide ID
        congress: Congress number
        role: "sponsored", "cosponsored", or "both"
        use_cache: Use cached responses (default True)
        rate_limit: Delay between requests
    
    Returns:
        List of (bill_id, role) tuples
    """
    delay = rate_limit or config.RATE_LIMIT_DELAY
    bills = []
    
    roles_to_fetch = []
    if role in ["sponsored", "both"]:
        roles_to_fetch.append("sponsored")
    if role in ["cosponsored", "both"]:
        roles_to_fetch.append("cosponsored")
    
    for fetch_role in roles_to_fetch:
        console.print(f"\n[cyan]Fetching {fetch_role} bills for {bioguide_id} in Congress {congress}...[/cyan]")
        
        offset = 0
        limit = 250
        total_fetched = 0
        total_filtered = 0
        amendments_skipped = 0
        
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
            TimeElapsedColumn(),
            console=console
        ) as progress:
            task = progress.add_task(f"Fetching {fetch_role}...", total=None)
            
            while True:
                endpoint = f"member/{bioguide_id}/{fetch_role}-legislation"
                params = {
                    "congress": congress,
                    "limit": limit,
                    "offset": offset
                }
                
                try:
                    data = http_client.get_congress_api(endpoint, params=params, use_cache=use_cache)
                    
                    # Parse response with Pydantic
                    response = SponsoredLegislationResponse(**data)
                    
                    # Get legislation list
                    legislation = (
                        response.sponsoredLegislation if fetch_role == "sponsored"
                        else response.cosponsoredLegislation
                    )
                    
                    if not legislation:
                        break
                    
                    # Extract bills
                    for item in legislation:
                        total_fetched += 1
                        
                        # Skip amendments (only want bills)
                        if not item.type or not item.number:
                            amendments_skipped += 1
                            continue
                        
                        bill_id = item.to_bill_id()
                        bills.append((bill_id, fetch_role))
                        total_filtered += 1
                    
                    progress.update(task, description=f"Fetched {total_fetched} items ({total_filtered} bills, {amendments_skipped} amendments)")
                    
                    if len(legislation) < limit:
                        break
                    
                    offset += limit
                    
                    # Rate limit
                    if delay > 0:
                        time.sleep(delay)
                
                except AuthError as e:
                    console.print(f"\n[red]❌ Authentication error: {e}[/red]")
                    console.print("[yellow]Get API key at: https://api.congress.gov/sign-up/[/yellow]")
                    raise
                except RateLimitError:
                    console.print(f"\n[yellow]⚠️ Rate limited, waiting 60s...[/yellow]")
                    time.sleep(60)
                    continue
                except Exception as e:
                    console.print(f"\n[red]Error: {e}[/red]")
                    raise
        
        console.print(f"[green]✓ Fetched {total_fetched} {fetch_role} items[/green]")
        console.print(f"  Bills: {total_filtered}")
        console.print(f"  Amendments skipped: {amendments_skipped}")
    
    return bills


def sync_groundtruth_v2(
    bioguide_id: str,
    congress: int,
    role: str = "both",
    use_cache: bool = True,
    rate_limit: float = None,
    dry_run: bool = False
):
    """
    Sync ground truth using modern stack.
    """
    console.print("\n[bold]=" * 80)
    console.print(f"[bold cyan]SYNC MEMBER BILL GROUND TRUTH (v2)[/bold cyan]")
    console.print("[bold]=" * 80)
    console.print(f"Bioguide ID: {bioguide_id}")
    console.print(f"Congress: {congress}")
    console.print(f"Role: {role}")
    console.print(f"Cache: {'Enabled' if use_cache else 'Disabled'}")
    console.print(f"Dry run: {dry_run}")
    
    # Fetch bills
    bills = fetch_member_bills_v2(bioguide_id, congress, role, use_cache, rate_limit)
    
    # Count by role
    sponsored_count = len([b for b in bills if b[1] == "sponsored"])
    cosponsored_count = len([b for b in bills if b[1] == "cosponsored"])
    
    console.print(f"\n[green]✓ Fetched {len(bills)} bill relationships[/green]")
    console.print(f"  Sponsored: {sponsored_count} bills")
    console.print(f"  Cosponsored: {cosponsored_count} bills")
    
    if dry_run:
        console.print("\n[yellow]Dry run - not inserting into database[/yellow]")
        return
    
    # Insert into database
    console.print("\n[cyan]Inserting into member_bills_groundtruth...[/cyan]")
    
    db = SessionLocal()
    try:
        inserted = 0
        duplicates = 0
        bills_created = 0
        bills_skipped = 0
        
        # Track unique bill_ids for Bill upsert
        unique_bill_ids = {}
        for bill_id, bill_role in bills:
            if bill_id not in unique_bill_ids:
                unique_bill_ids[bill_id] = bill_role
        
        console.print(f"[cyan]Upserting stub Bill rows for {len(unique_bill_ids)} unique bills...[/cyan]")
        
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console
        ) as progress:
            # Upsert stub Bill rows first
            task_bills = progress.add_task("Creating Bill stubs...", total=len(unique_bill_ids))
            
            for bill_id in unique_bill_ids.keys():
                # Parse bill_id: "hr1234-119" -> type=hr, number=1234, congress=119
                try:
                    parts = bill_id.rsplit('-', 1)
                    if len(parts) != 2:
                        bills_skipped += 1
                        progress.update(task_bills, advance=1)
                        continue
                    
                    bill_prefix = parts[0]
                    bill_congress = int(parts[1])
                    
                    # Extract type and number (handle both "hr1234" and "h1234" formats)
                    import re
                    match = re.match(r'([a-z]+)(\d+)', bill_prefix)
                    if not match:
                        bills_skipped += 1
                        progress.update(task_bills, advance=1)
                        continue
                    
                    bill_type = match.group(1)
                    bill_number = int(match.group(2))
                    
                    # Check if Bill already exists
                    existing_bill = db.query(Bill).filter(Bill.bill_id == bill_id).first()
                    
                    if not existing_bill:
                        # Create stub Bill row
                        bill = Bill(
                            bill_id=bill_id,
                            congress=bill_congress,
                            bill_type=bill_type,
                            bill_number=bill_number,
                            title=None,  # Will be enriched later
                            needs_enrichment=1
                        )
                        db.add(bill)
                        bills_created += 1
                    else:
                        bills_skipped += 1
                    
                except (ValueError, AttributeError) as e:
                    console.print(f"[yellow]⚠️ Could not parse bill_id: {bill_id} - {e}[/yellow]")
                    bills_skipped += 1
                
                progress.update(task_bills, advance=1)
            
            # Commit Bill stubs
            db.commit()
            console.print(f"[green]✓ Created {bills_created} new Bill stubs, skipped {bills_skipped} existing[/green]")
            
            # Now insert ground truth relationships
            task_gt = progress.add_task("Inserting ground truth...", total=len(bills))
            
            for bill_id, bill_role in bills:
                existing = db.query(MemberBillGroundTruth).filter(
                    MemberBillGroundTruth.bioguide_id == bioguide_id,
                    MemberBillGroundTruth.bill_id == bill_id,
                    MemberBillGroundTruth.role == bill_role
                ).first()
                
                if existing:
                    existing.fetched_at = datetime.now()
                    duplicates += 1
                else:
                    record = MemberBillGroundTruth(
                        bioguide_id=bioguide_id,
                        bill_id=bill_id,
                        role=bill_role,
                        source="congress.gov.api.v3"
                    )
                    db.add(record)
                    inserted += 1
                
                progress.update(task_gt, advance=1)
        
        db.commit()
        
        console.print(f"\n[green]✓ Ground Truth Inserted: {inserted}[/green]")
        console.print(f"  Updated: {duplicates}")
        console.print(f"  Total relationships: {inserted + duplicates}")
        console.print(f"\n[green]✓ Bill Stubs Created: {bills_created}[/green]")
        console.print(f"  Already existed: {bills_skipped}")
    
    finally:
        db.close()
