"""
CLI Entry Point

Main CLI application using Typer.

Usage:
    python -m cli health check
    python -m cli health deps
    python -m cli groundtruth sync --all-active
    python -m cli groundtruth sync --person-id alexandria_ocasio_cortez
"""

import typer
from rich.console import Console

app = typer.Typer(
    name="wethepeople",
    help="We The People - Public Accountability Ledger CLI",
    add_completion=False
)

console = Console()

# Import subcommands
from cli import health_cmd, groundtruth_cmd, ingest_cmd

# Register commands
app.add_typer(health_cmd.app, name="health")
app.add_typer(groundtruth_cmd.app, name="groundtruth")
app.add_typer(ingest_cmd.app, name="ingest")


if __name__ == "__main__":
    app()
