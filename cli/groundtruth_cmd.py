"""
DEPRECATED: V1 ground truth sync from the Public Accountability Ledger era.
Production data is managed by jobs/sync_*.py and jobs/seed_tracked_companies.py.

Ground Truth Rail Commands

Sync member bill relationships from Congress.gov API.

Usage:
    python -m cli groundtruth sync --all-active
    python -m cli groundtruth sync --person-id alexandria_ocasio_cortez
    python -m cli groundtruth stats
"""

import sys
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils.config import config
from models.database import SessionLocal, TrackedMember, MemberBillGroundTruth, Claim

app = typer.Typer(help="Ground truth rail operations")
console = Console()


@app.command()
def sync(
    person_id: Optional[str] = typer.Option(None, "--person-id", help="Sync specific member by person_id"),
    bioguide: Optional[str] = typer.Option(None, "--bioguide", help="Sync specific member by bioguide_id"),
    all_active: bool = typer.Option(False, "--all-active", help="Sync all pilot members with claims"),
    congress: int = typer.Option(119, "--congress", help="Congress number"),
    role: str = typer.Option("both", "--role", help="sponsored|cosponsored|both"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Fetch but don't save"),
    force: bool = typer.Option(False, "--force", help="Allow syncing >10 members"),
):
    """
    Sync ground truth bill relationships for member(s).
    """
    print("WARNING: This command targets V1 claim tables. Use jobs/ scripts for production data.")
    # Import here to avoid circular imports
    from jobs.sync_member_groundtruth import sync_groundtruth
    
    if not any([person_id, bioguide, all_active]):
        console.print("[red]Error: Must specify --person-id, --bioguide, or --all-active[/red]")
        raise typer.Exit(1)
    
    # Determine members to sync
    members_to_sync = []
    db = SessionLocal()
    
    try:
        if bioguide:
            members_to_sync = [(bioguide, bioguide)]
        elif person_id:
            member = db.query(TrackedMember).filter(TrackedMember.person_id == person_id).first()
            if not member:
                console.print(f"[red]Unknown person_id: {person_id}[/red]")
                raise typer.Exit(1)
            if not member.bioguide_id:
                console.print(f"[red]Member {person_id} has no bioguide_id[/red]")
                raise typer.Exit(1)
            members_to_sync = [(member.bioguide_id, person_id)]
        elif all_active:
            # Get members with claims (pilot members only)
            person_ids_with_claims = db.query(Claim.person_id).distinct().all()
            person_ids_with_claims = [p[0] for p in person_ids_with_claims]
            
            members = db.query(TrackedMember).filter(
                TrackedMember.bioguide_id.isnot(None),
                TrackedMember.person_id.in_(person_ids_with_claims)
            ).all()
            members_to_sync = [(m.bioguide_id, m.person_id) for m in members]
            
            # SAFETY GATE: Prevent accidental mass sync
            if len(members_to_sync) > 10 and not force:
                console.print(f"[red]❌ Safety gate: Attempting to sync {len(members_to_sync)} members[/red]")
                console.print(f"[yellow]Pilot filter should limit to ≤10 members[/yellow]")
                console.print(f"[yellow]Use --force to override (not recommended)[/yellow]")
                raise typer.Exit(1)
            
            console.print(f"[cyan]Found {len(members_to_sync)} pilot members to sync[/cyan]\n")
    finally:
        db.close()
    
    # Sync each member
    for bioguide_id, pid in members_to_sync:
        if len(members_to_sync) > 1:
            console.print(f"\n[bold cyan]{'='*80}[/bold cyan]")
            console.print(f"[bold]Syncing: {pid} ({bioguide_id})[/bold]")
            console.print(f"[bold cyan]{'='*80}[/bold cyan]\n")
        
        try:
            sync_groundtruth(
                bioguide_id=bioguide_id,
                congress=congress,
                role=role,
                api_key=config.CONGRESS_API_KEY,
                rate_limit=config.RATE_LIMIT_DELAY,
                dry_run=dry_run
            )
        except Exception as e:
            console.print(f"[red]Error syncing {pid}: {e}[/red]")
            if not all_active:
                raise typer.Exit(1)


@app.command()
def stats():
    """Show ground truth statistics."""
    print("WARNING: This command targets V1 claim tables. Use jobs/ scripts for production data.")
    db = SessionLocal()
    
    try:
        # Get counts per member
        from sqlalchemy import func
        
        counts = db.query(
            TrackedMember.person_id,
            TrackedMember.bioguide_id,
            func.count(MemberBillGroundTruth.id).label("bill_count")
        ).outerjoin(
            MemberBillGroundTruth,
            TrackedMember.bioguide_id == MemberBillGroundTruth.bioguide_id
        ).filter(
            TrackedMember.person_id.in_(
                db.query(Claim.person_id).distinct()
            )
        ).group_by(
            TrackedMember.person_id,
            TrackedMember.bioguide_id
        ).all()
        
        console.print("\n[bold]Ground Truth Statistics[/bold]\n")
        
        from rich.table import Table
        table = Table(show_header=True)
        table.add_column("Member", style="cyan")
        table.add_column("Bioguide ID", style="yellow")
        table.add_column("Bills", justify="right", style="green")
        
        total_bills = 0
        for person_id, bioguide_id, bill_count in counts:
            table.add_row(person_id, bioguide_id or "N/A", str(bill_count))
            total_bills += bill_count
        
        console.print(table)
        console.print(f"\n[bold]Total:[/bold] {total_bills} bill relationships\n")
        
    finally:
        db.close()
