"""
Gate Invariants: Prevent Code Duplication and Regression

Enforces the following rules:
1. CANONICAL EXTRACTOR: Only ONE extract_main_text() definition exists
   - Must be in services/extraction/extract_main_text.py
   - No duplicate implementations in jobs/, scripts/, check_* files
   
2. CANONICAL LOGGING: Only ONE logging configuration system
   - Must be in utils/logging.py
   - All modules must import from utils.logging, not configure their own loggers
   
3. EVIDENCE VALIDATION: Evidence write point uses validation
   - jobs/recompute_evaluations.py must import validate_evidence
   - Write choke point must validate before database write

4. IMPORT WIRING: Critical imports are correctly wired
   - jobs/ingest_claims.py imports from services.extraction.extract_main_text
   - check_all_schumer_articles.py imports from services.extraction.extract_main_text
   - check_wyden_articles.py imports from services.extraction.extract_main_text
   - scripts/source_probe.py imports from services.extraction.extract_main_text

Exit Code:
    0: All invariants hold
    1: One or more invariants violated
"""

import sys
from pathlib import Path
import re


# Base directory
BASE_DIR = Path(__file__).parent.parent


def check_extractor_uniqueness():
    """Ensure only ONE extract_main_text() definition exists"""
    print("[CHECK 1] Canonical extractor uniqueness...")
    
    # Find all Python files
    python_files = list(BASE_DIR.rglob("*.py"))
    
    # Find all extract_main_text definitions
    definitions = []
    for file_path in python_files:
        # Skip __pycache__ and virtual envs
        if "__pycache__" in str(file_path) or "venv" in str(file_path):
            continue
        
        try:
            content = file_path.read_text(encoding='utf-8')
            if re.search(r'^def extract_main_text\(', content, re.MULTILINE):
                definitions.append(file_path.relative_to(BASE_DIR))
        except:
            # Skip files we can't read
            pass
    
    # Should be exactly ONE definition
    canonical_path = Path("services/extraction/extract_main_text.py")
    
    if len(definitions) == 0:
        print("  ❌ FAIL: No extract_main_text() definition found")
        return False
    
    if len(definitions) > 1:
        print(f"  ❌ FAIL: Found {len(definitions)} definitions (expected 1):")
        for defn in definitions:
            print(f"    - {defn}")
        return False
    
    if definitions[0] != canonical_path:
        print(f"  ❌ FAIL: Definition in wrong location: {definitions[0]}")
        print(f"    Expected: {canonical_path}")
        return False
    
    print(f"  ✓ PASS: Exactly one definition in {canonical_path}")
    return True


def check_extractor_imports():
    """Ensure critical files import from canonical extractor"""
    print("[CHECK 2] Canonical extractor imports...")
    
    files_to_check = [
        "jobs/ingest_claims.py",
        "check_all_schumer_articles.py",
        "check_wyden_articles.py",
        "scripts/source_probe.py",
    ]
    
    all_good = True
    for file_rel in files_to_check:
        file_path = BASE_DIR / file_rel
        if not file_path.exists():
            print(f"  ⚠️  SKIP: {file_rel} not found")
            continue
        
        content = file_path.read_text(encoding='utf-8')
        
        # Check for canonical import
        if "from services.extraction.extract_main_text import extract_main_text" in content:
            print(f"  ✓ PASS: {file_rel} imports canonical extractor")
        else:
            print(f"  ❌ FAIL: {file_rel} does not import canonical extractor")
            all_good = False
    
    return all_good


def check_logging_uniqueness():
    """Ensure only ONE logging configuration system"""
    print("[CHECK 3] Canonical logging configuration...")
    
    # Find all Python files
    python_files = list(BASE_DIR.rglob("*.py"))
    
    # Find files configuring their own loggers (anti-pattern)
    violators = []
    for file_path in python_files:
        # Skip __pycache__, venv, utils/logging.py, and this script itself
        if "__pycache__" in str(file_path) or "venv" in str(file_path):
            continue
        if file_path.relative_to(BASE_DIR) == Path("utils/logging.py"):
            continue
        if file_path.relative_to(BASE_DIR) == Path("scripts/check_canonical_imports.py"):
            continue
        
        try:
            content = file_path.read_text(encoding='utf-8')
            
            # Check for manual logger configuration (anti-pattern)
            if re.search(r'logging\.basicConfig\(', content):
                violators.append((file_path.relative_to(BASE_DIR), "logging.basicConfig()"))
            elif re.search(r'logger\.addHandler\(', content):
                violators.append((file_path.relative_to(BASE_DIR), "logger.addHandler()"))
        except:
            pass
    
    if violators:
        print(f"  ❌ FAIL: Found {len(violators)} files configuring their own loggers:")
        for file_path, pattern in violators:
            print(f"    - {file_path}: {pattern}")
        return False
    
    # Check that utils/logging.py exists
    logging_module = BASE_DIR / "utils/logging.py"
    if not logging_module.exists():
        print("  ❌ FAIL: utils/logging.py not found")
        return False
    
    print("  ✓ PASS: Only utils/logging.py configures logging")
    return True


def check_evidence_validation():
    """Ensure evidence validation is used at write choke point"""
    print("[CHECK 4] Evidence validation at write point...")
    
    recompute_file = BASE_DIR / "jobs/recompute_evaluations.py"
    if not recompute_file.exists():
        print("  ⚠️  SKIP: jobs/recompute_evaluations.py not found")
        return True
    
    content = recompute_file.read_text(encoding='utf-8')
    
    # Check for validation import
    if "from services.evidence.validate import" not in content:
        print("  ❌ FAIL: Does not import evidence validation")
        return False
    
    # Check for validate_evidence call
    if "validate_evidence(" not in content:
        print("  ❌ FAIL: Does not call validate_evidence()")
        return False
    
    print("  ✓ PASS: Evidence validation integrated at write point")
    return True


def check_critical_modules_exist():
    """Ensure all canonical modules exist"""
    print("[CHECK 5] Critical canonical modules exist...")
    
    required_modules = [
        "services/extraction/extract_main_text.py",
        "utils/logging.py",
        "services/evidence/schema.json",
        "services/evidence/validate.py",
        "services/matching/similarity.py",
    ]
    
    all_good = True
    for module_rel in required_modules:
        module_path = BASE_DIR / module_rel
        if module_path.exists():
            print(f"  ✓ PASS: {module_rel} exists")
        else:
            print(f"  ❌ FAIL: {module_rel} missing")
            all_good = False
    
    return all_good


def main():
    print("=" * 70)
    print("GATE INVARIANTS: Canonical Code Duplication Check")
    print("=" * 70)
    print()
    
    checks = [
        check_extractor_uniqueness(),
        check_extractor_imports(),
        check_logging_uniqueness(),
        check_evidence_validation(),
        check_critical_modules_exist(),
    ]
    
    print()
    print("=" * 70)
    
    if all(checks):
        print("✓ ALL INVARIANTS HOLD")
        print("=" * 70)
        sys.exit(0)
    else:
        print("❌ INVARIANT VIOLATIONS DETECTED")
        print("=" * 70)
        sys.exit(1)


if __name__ == "__main__":
    main()
