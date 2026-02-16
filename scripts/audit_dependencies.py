"""
Dependency Audit Script

Verifies installed packages and scans the repository for actual usage.

Usage:
    python scripts/audit_dependencies.py
    python -m cli health deps
"""

import sys
import importlib
import re
from pathlib import Path
from typing import Dict, List, Tuple, Optional

from rich.console import Console
from rich.table import Table

console = Console()

# Key packages to audit (based on requirements.txt)
KEY_PACKAGES = [
    "rich",
    "typer",
    "dotenv",  # python-dotenv imports as 'dotenv'
    "tenacity",
    "diskcache",
    "pydantic",
]

# Optional packages (nice to have but not required)
OPTIONAL_PACKAGES = [
    "loguru",
    "httpx",
]

# Additional standard packages for context
CONTEXT_PACKAGES = [
    "sqlalchemy",
    "requests",
    "alembic",
    "beautifulsoup4",
]


def get_installed_version(package_name: str) -> Optional[str]:
    """
    Check if a package is installed and return its version.
    
    Args:
        package_name: Name of the package to check (import name, not PyPI name)
        
    Returns:
        Version string if installed, None otherwise
    """
    try:
        if package_name == "dotenv":
            import dotenv
            return getattr(dotenv, "__version__", "unknown")
        elif package_name == "beautifulsoup4":
            import bs4
            return getattr(bs4, "__version__", "unknown")
        else:
            module = importlib.import_module(package_name)
            return getattr(module, "__version__", "unknown")
    except ImportError:
        return None
    except Exception as e:
        return f"error: {e}"


def scan_usage(package_name: str, repo_root: Path) -> Tuple[int, List[str]]:
    """
    Scan repository for import statements of a given package.
    
    Args:
        package_name: Name of the package to scan for
        repo_root: Root directory of the repository
        
    Returns:
        Tuple of (count of files using package, list of example file paths)
    """
    # Build regex patterns
    patterns = [
        rf"^import {package_name}\b",
        rf"^from {package_name}[\s.]",
    ]
    
    # Handle special cases
    if package_name == "dotenv":
        patterns.extend([
            r"^from dotenv import",
            r"^import dotenv",
        ])
    elif package_name == "beautifulsoup4":
        patterns = [
            r"^import bs4\b",
            r"^from bs4[\s.]",
            r"^from bs4 import",
        ]
    
    compiled_patterns = [re.compile(p, re.MULTILINE) for p in patterns]
    
    matching_files = []
    
    # Scan Python files
    for py_file in repo_root.rglob("*.py"):
        # Skip virtual environments and __pycache__
        if any(part.startswith(".") or part in ["venv", "__pycache__", "node_modules"] 
               for part in py_file.parts):
            continue
            
        try:
            content = py_file.read_text(encoding="utf-8")
            
            # Check if any pattern matches
            if any(pattern.search(content) for pattern in compiled_patterns):
                # Store relative path
                try:
                    rel_path = py_file.relative_to(repo_root)
                    matching_files.append(str(rel_path))
                except ValueError:
                    matching_files.append(str(py_file))
        except Exception:
            # Skip files we can't read
            continue
    
    return len(matching_files), matching_files[:5]  # Return count and up to 5 examples


def audit_dependencies(verbose: bool = False) -> Dict:
    """
    Run full dependency audit.
    
    Args:
        verbose: If True, include more detailed output
        
    Returns:
        Dictionary with audit results
    """
    repo_root = Path(__file__).parent.parent
    results = {}
    
    console.print("\n[bold]📦 Dependency Audit[/bold]\n")
    console.print(f"Scanning repository: {repo_root}\n")
    
    # Check all packages
    for package in KEY_PACKAGES + OPTIONAL_PACKAGES + CONTEXT_PACKAGES:
        version = get_installed_version(package)
        count, examples = scan_usage(package, repo_root)
        
        results[package] = {
            "installed": version is not None,
            "version": version,
            "used_in_files": count,
            "example_files": examples,
            "optional": package in OPTIONAL_PACKAGES,
        }
    
    return results


def print_audit_table(results: Dict, show_all: bool = False):
    """
    Print audit results as a formatted table.
    
    Args:
        results: Dictionary of audit results from audit_dependencies()
        show_all: If True, show all packages; otherwise only show key packages
    """
    table = Table(show_header=True, header_style="bold cyan")
    table.add_column("Package", width=16)
    table.add_column("Installed", width=10)
    table.add_column("Version", width=12)
    table.add_column("Used In", width=8, justify="right")
    table.add_column("Example Files", width=50)
    
    # Separate packages by type
    packages_to_show = KEY_PACKAGES + OPTIONAL_PACKAGES
    if show_all:
        packages_to_show += CONTEXT_PACKAGES
    
    for package in packages_to_show:
        if package not in results:
            continue
            
        data = results[package]
        is_optional = data.get("optional", False)
        
        # Status indicator
        if not data["installed"]:
            if is_optional:
                status = "ℹ️  No"
                version = "—"
                style = "dim"
            else:
                status = "❌ No"
                version = "—"
                style = "red"
        elif data["used_in_files"] == 0:
            status = "⚠️  Yes"
            version = data["version"]
            style = "yellow"
        else:
            status = "✅ Yes"
            version = data["version"]
            style = "green"
        
        # Format example files
        if data["example_files"]:
            examples = ", ".join(data["example_files"][:2])
            if len(data["example_files"]) > 2:
                examples += f" +{len(data['example_files']) - 2} more"
        else:
            examples = "—"
        
        # Add marker for optional packages
        package_display = f"{package}*" if is_optional else package
        
        table.add_row(
            package_display,
            status,
            version,
            str(data["used_in_files"]),
            examples,
            style=style if data["used_in_files"] > 0 or not is_optional else "dim"
        )
    
    console.print(table)
    console.print("[dim]* = optional package[/dim]\n")
    
    # Summary statistics
    key_results = {k: v for k, v in results.items() if k in KEY_PACKAGES}
    installed_count = sum(1 for v in key_results.values() if v["installed"])
    used_count = sum(1 for v in key_results.values() if v["used_in_files"] > 0)
    
    console.print(f"[bold]Summary (Required Packages):[/bold]")
    console.print(f"  Installed: {installed_count}/{len(KEY_PACKAGES)}")
    console.print(f"  Actually Used: {used_count}/{len(KEY_PACKAGES)}")
    
    # Warnings (only for required packages)
    missing = [k for k, v in key_results.items() if not v["installed"]]
    unused = [k for k, v in key_results.items() if v["installed"] and v["used_in_files"] == 0]
    
    if missing:
        console.print(f"\n[red]❌ Missing required packages:[/red] {', '.join(missing)}")
    
    if unused:
        console.print(f"\n[yellow]⚠️  Installed but unused:[/yellow] {', '.join(unused)}")
    
    # Optional package info
    optional_results = {k: v for k, v in results.items() if k in OPTIONAL_PACKAGES}
    optional_missing = [k for k, v in optional_results.items() if not v["installed"]]
    if optional_missing:
        console.print(f"\n[dim]ℹ️  Optional packages not installed:[/dim] {', '.join(optional_missing)}")
    
    if not missing and not unused:
        console.print(f"\n[green]✅ All required packages installed and in use[/green]")
    
    return len(missing) == 0  # Return True if no missing REQUIRED packages


def main():
    """Main entry point for script execution."""
    results = audit_dependencies()
    all_good = print_audit_table(results, show_all=True)
    
    if not all_good:
        console.print("\n[red]Audit failed: missing required packages[/red]")
        sys.exit(1)
    else:
        console.print("\n[green]Audit passed[/green]\n")
        sys.exit(0)


if __name__ == "__main__":
    main()
