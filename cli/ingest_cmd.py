"""
DEPRECATED: V1 ground truth sync from the Public Accountability Ledger era.
Production data is managed by jobs/sync_*.py and jobs/seed_tracked_companies.py.

Ingest CLI Commands

Commands for managing data ingestion and Bronze layer.

Usage:
    python -m cli ingest status
    python -m cli ingest status --person-id alexandria_ocasio_cortez
"""

import sys
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.database import SessionLocal, BronzeDocument, Claim, TrackedMember
from sqlalchemy import func

console = Console()

# Create subcommand app
app = typer.Typer(help="Data ingestion commands")


@app.command(name="status")
def ingest_status(
    person_id: Optional[str] = typer.Option(None, "--person-id", help="Filter by person_id"),
    verbose: bool = typer.Option(False, "--verbose", help="Show detailed output")
):
    """
    Show Bronze layer ingestion status.
    
    Displays:
    - Total Bronze documents
    - Documents per member
    - Latest fetch times
    - Storage statistics
    """
    print("WARNING: This command targets V1 claim tables. Use jobs/ scripts for production data.")
    console.print("\n[bold]📥 Ingestion Status - Bronze Layer[/bold]\n")

    db = SessionLocal()
    
    try:
        # Overall stats
        total_bronze = db.query(BronzeDocument).count()
        total_claims = db.query(Claim).count()
        
        console.print(f"[cyan]Total Bronze Documents:[/cyan] {total_bronze}")
        console.print(f"[cyan]Total Claims Extracted:[/cyan] {total_claims}")
        console.print()
        
        # Per-member breakdown
        if person_id:
            # Single member
            members = db.query(TrackedMember).filter(
                TrackedMember.person_id == person_id
            ).all()
        else:
            # All members with Bronze data
            members = db.query(TrackedMember).all()
        
        if not members:
            console.print(f"[yellow]No members found{' with person_id: ' + person_id if person_id else ''}[/yellow]")
            return
        
        # Build stats table
        table = Table(show_header=True, header_style="bold magenta")
        table.add_column("Person ID", width=25)
        table.add_column("Name", width=25)
        table.add_column("Bronze Docs", justify="right", width=12)
        table.add_column("Claims", justify="right", width=8)
        table.add_column("Latest Fetch", width=20)
        
        for member in members:
            bronze_count = db.query(BronzeDocument).filter(
                BronzeDocument.person_id == member.person_id
            ).count()
            
            claim_count = db.query(Claim).filter(
                Claim.person_id == member.person_id
            ).count()
            
            latest_fetch = db.query(func.max(BronzeDocument.fetched_at)).filter(
                BronzeDocument.person_id == member.person_id
            ).scalar()
            
            latest_str = latest_fetch.strftime("%Y-%m-%d %H:%M") if latest_fetch else "—"
            
            # Only show members with Bronze data (unless filtering by person_id)
            if bronze_count > 0 or person_id:
                table.add_row(
                    member.person_id,
                    member.name or "—",
                    str(bronze_count),
                    str(claim_count),
                    latest_str
                )
        
        console.print(table)
        
        # Summary panel
        if total_bronze > 0:
            avg_claims_per_doc = total_claims / total_bronze if total_bronze > 0 else 0
            
            summary_text = (
                f"[green]Bronze Layer Active[/green]\n\n"
                f"Documents: {total_bronze}\n"
                f"Claims Extracted: {total_claims}\n"
                f"Avg Claims/Document: {avg_claims_per_doc:.1f}"
            )
            
            console.print()
            console.print(Panel.fit(
                summary_text,
                title="Summary",
                border_style="green"
            ))
        else:
            console.print()
            console.print(Panel.fit(
                "[yellow]No Bronze documents yet[/yellow]\n\n"
                "Run: python jobs/ingest_claims.py --person-id <id>",
                title="Tip",
                border_style="yellow"
            ))
        
    finally:
        db.close()
    
    console.print()


if __name__ == "__main__":
    app()
