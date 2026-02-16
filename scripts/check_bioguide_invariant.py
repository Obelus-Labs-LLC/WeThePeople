"""
Gate Check: Bioguide ID Invariant

CRITICAL INVARIANT: All joins between claims/actions must use bioguide_id, not person_id.

person_id is a convenience handle/slug, but bioguide_id is the canonical immutable identity.

This prevents the "same problem again" class where we have to migrate person_id references
across multiple tables.

Usage:
    python scripts/check_bioguide_invariant.py
"""

import sys
import os
import re
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

# Files to check for person_id joins
CHECK_FILES = [
    "services/matching.py",
    "jobs/recompute_evaluations.py",
    "models/database.py",
]

# Patterns that indicate person_id joins (FORBIDDEN)
FORBIDDEN_PATTERNS = [
    # SQL-style joins
    r'\.person_id\s*==\s*\w+\.person_id',
    r'filter.*person_id.*==.*person_id',
    r'join.*person_id.*person_id',
    
    # ORM relationship joins on person_id
    r'ForeignKey.*person_id',
    r'relationship.*person_id',
]

# Allowed patterns (these are OK)
ALLOWED_PATTERNS = [
    # Simple filters on person_id (no join) - comparing to string variable
    r'filter.*\.person_id\s*==\s*["\']',
    r'filter.*\.person_id\s*==\s*claim\.person_id\s*\)',  # Same table, not a join
    r'filter.*\.person_id\s*==\s*person_id\s*\)',  # Variable assignment, not join
    
    # Column definitions
    r'Column.*person_id',
    r'person_id\s*=\s*Column',
]


def check_file_for_violations(filepath: str) -> list:
    """Check a file for person_id join violations"""
    violations = []
    
    if not os.path.exists(filepath):
        return violations
    
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    for line_num, line in enumerate(lines, 1):
        # Skip comments
        if line.strip().startswith('#'):
            continue
        
        # Check for forbidden patterns
        for pattern in FORBIDDEN_PATTERNS:
            if re.search(pattern, line, re.IGNORECASE):
                # Check if it's actually allowed
                is_allowed = False
                for allowed in ALLOWED_PATTERNS:
                    if re.search(allowed, line, re.IGNORECASE):
                        is_allowed = True
                        break
                
                if not is_allowed:
                    violations.append({
                        'file': filepath,
                        'line': line_num,
                        'text': line.strip(),
                        'pattern': pattern
                    })
    
    return violations


def main():
    print("=" * 80)
    print("BIOGUIDE ID INVARIANT CHECK")
    print("=" * 80)
    print()
    print("Checking for person_id joins (FORBIDDEN)...")
    print()
    
    all_violations = []
    
    for filepath in CHECK_FILES:
        violations = check_file_for_violations(filepath)
        if violations:
            all_violations.extend(violations)
    
    if all_violations:
        print(f"❌ FAILED: Found {len(all_violations)} person_id join violations")
        print()
        
        for v in all_violations:
            print(f"  {v['file']}:{v['line']}")
            print(f"    {v['text']}")
            print(f"    Pattern: {v['pattern']}")
            print()
        
        print("RULE: Never join on person_id. Use bioguide_id for all inter-table joins.")
        print()
        print("Allowed:")
        print("  - Filter by person_id within a single table")
        print("  - Column definitions")
        print()
        print("Forbidden:")
        print("  - JOIN ... ON person_id = person_id")
        print("  - ForeignKey to person_id")
        print("  - Relationship mappings on person_id")
        print()
        return 1
    else:
        print("✓ PASSED: No person_id join violations found")
        print()
        print("All inter-table joins correctly use bioguide_id or other canonical keys.")
        return 0


if __name__ == '__main__':
    sys.exit(main())
