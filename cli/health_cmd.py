"""
Health Check Command

Verifies system configuration and dependencies.

Usage:
    python -m cli health
    python -m cli health deps
"""

import sys
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from utils.config import config
from utils.http_client import http_client, AuthError
from models.database import SessionLocal

console = Console()

# Create subcommand app
app = typer.Typer(help="Health check commands")


@app.command(name="check")
def health():
    """
    Run health checks on system configuration.
    
    Checks:
    - Environment variables loaded
    - Database connectivity
    - Congress.gov API key validity
    - Cache status
    """
    console.print("\n[bold]🏥 System Health Check[/bold]\n")
    
    checks = []
    all_passed = True
    
    # 1. Configuration
    try:
        cfg_summary = config.summary()
        cfg_errors = config.validate()
        
        if cfg_errors:
            checks.append(("❌", "Configuration", f"Missing: {', '.join(cfg_errors)}"))
            all_passed = False
        else:
            checks.append(("✅", "Configuration", "All required vars present"))
    except Exception as e:
        checks.append(("❌", "Configuration", f"Error: {e}"))
        all_passed = False
    
    # 2. Database connectivity
    try:
        from sqlalchemy import text
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        checks.append(("✅", "Database", f"Connected to {config.DATABASE_URL}"))
    except Exception as e:
        checks.append(("❌", "Database", f"Connection failed: {e}"))
        all_passed = False
    
    # 3. Congress.gov API key
    try:
        if not config.CONGRESS_API_KEY:
            checks.append(("⚠️", "Congress API", "No API key configured"))
            all_passed = False
        else:
            # Test API call
            data = http_client.get_congress_api(
                "member/O000172/sponsored-legislation",
                params={"congress": 119, "limit": 1},
                use_cache=False
            )
            checks.append(("✅", "Congress API", "Key valid, API responding"))
    except AuthError:
        checks.append(("❌", "Congress API", "Authentication failed (invalid key)"))
        all_passed = False
    except Exception as e:
        checks.append(("❌", "Congress API", f"Error: {e}"))
        all_passed = False
    
    # 4. Cache status
    try:
        stats = http_client.cache_stats()
        cache_status = f"{stats['size']} items, {stats['volume'] // 1024}KB"
        checks.append(("ℹ️", "Cache", cache_status if config.CACHE_ENABLED else "Disabled"))
    except Exception as e:
        checks.append(("⚠️", "Cache", f"Error: {e}"))
    
    # Display results
    table = Table(show_header=True, header_style="bold magenta")
    table.add_column("Status", width=6)
    table.add_column("Component", width=20)
    table.add_column("Details", width=50)
    
    for status, component, details in checks:
        table.add_row(status, component, details)
    
    console.print(table)
    
    # Summary
    if all_passed:
        console.print("\n[bold green]✅ All critical checks passed[/bold green]\n")
        console.print(Panel.fit(
            f"[green]System ready for operation[/green]\n\n"
            f"Database: {config.DATABASE_URL}\n"
            f"Congress API: {'✓ Configured' if config.CONGRESS_API_KEY else '✗ Missing'}\n"
            f"Cache: {'Enabled' if config.CACHE_ENABLED else 'Disabled'}",
            title="Summary",
            border_style="green"
        ))
    else:
        console.print("\n[bold red]❌ Some checks failed[/bold red]\n")
        console.print(Panel.fit(
            "[red]System not ready[/red]\n\n"
            "Fix configuration errors before proceeding.",
            title="Summary",
            border_style="red"
        ))
        raise typer.Exit(1)


@app.command(name="deps")
def health_deps(
    show_all: bool = typer.Option(False, "--all", help="Show all packages including context packages"),
    verbose: bool = typer.Option(False, "--verbose", help="Show detailed output")
):
    """
    Audit installed dependencies and verify usage in codebase.
    
    Checks that required packages are installed and scans for actual import statements.
    """
    # Import here to avoid circular dependency issues
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from scripts.audit_dependencies import audit_dependencies, print_audit_table
    
    results = audit_dependencies(verbose=verbose)
    all_good = print_audit_table(results, show_all=show_all)
    
    if not all_good:
        console.print("\n[red]❌ Dependency audit failed: missing required packages[/red]")
        console.print("[yellow]Run: pip install -r requirements.txt[/yellow]\n")
        raise typer.Exit(1)
    else:
        console.print("\n[green]✅ Dependency audit passed[/green]\n")
