# Quality Gate - Phase C Verification
# Runs all critical validation steps to ensure repository health
# Usage: .\scripts\run_gate.ps1

$ErrorActionPreference = "Stop"
$FailedTests = @()

# Load repo .env into the PowerShell environment for deterministic gate configuration.
# Does not override already-set environment variables.
$EnvFile = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")) ".env"
if (Test-Path $EnvFile) {
    try {
        foreach ($RawLine in Get-Content $EnvFile) {
            $Line = ($RawLine -as [string]).Trim()
            if (-not $Line) { continue }
            if ($Line.StartsWith("#")) { continue }
            if (-not $Line.Contains("=")) { continue }

            $Parts = $Line.Split("=", 2)
            $Key = $Parts[0].Trim()
            $Val = $Parts[1].Trim()
            if (-not $Key) { continue }

            # Remove surrounding quotes if present
            if (($Val.StartsWith('"') -and $Val.EndsWith('"')) -or ($Val.StartsWith("'") -and $Val.EndsWith("'"))) {
                if ($Val.Length -ge 2) {
                    $Val = $Val.Substring(1, $Val.Length - 2)
                }
            }

            if (-not (Test-Path "Env:$Key")) {
                Set-Item -Path "Env:$Key" -Value $Val
            }
        }
    } catch {
        # Non-fatal: gate can still run with explicit env vars.
    }
}

# Force UTF-8 for Python subprocesses during this gate run.
# Additive to ASCII-safe prints; avoids cp1252 UnicodeEncodeError flakiness.
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "QUALITY GATE - PHASE C VERIFICATION" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

# Diagnostic (non-failing): confirm Python encodings for this session.
Write-Host "[ENC] Python encoding diagnostic (non-failing)" -ForegroundColor Yellow
try {
    python -c "import sys,locale; print('PYTHONUTF8=' + str(sys.flags.utf8_mode)); print('stdout=' + str(getattr(sys.stdout,'encoding',None))); print('stderr=' + str(getattr(sys.stderr,'encoding',None))); print('preferred=' + str(locale.getpreferredencoding(False))); print('default=' + str(sys.getdefaultencoding()))"
    Write-Host "INFO: python encoding diagnostic completed" -ForegroundColor Green
} catch {
    Write-Host "WARN: python encoding diagnostic failed (continuing)" -ForegroundColor Yellow
}
Write-Host ""

# Test 0: Dependency Audit
Write-Host "[0/31] Running dependency audit..." -ForegroundColor Yellow
try {
    python -m cli health deps
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "dependency_audit"
        Write-Host "FAILED: dependency_audit" -ForegroundColor Red
    } else {
        Write-Host "PASSED: dependency_audit" -ForegroundColor Green
    }
} catch {
    $FailedTests += "dependency_audit (exception)"
    Write-Host "FAILED: dependency_audit (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 1: Person ID Integrity Check
Write-Host "[1/31] Running person_id integrity check..." -ForegroundColor Yellow
try {
    python scripts\check_person_id_integrity.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "check_person_id_integrity.py"
        Write-Host "FAILED: check_person_id_integrity.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: check_person_id_integrity.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "check_person_id_integrity.py (exception)"
    Write-Host "FAILED: check_person_id_integrity.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 2: URL Matching Regression Tests
Write-Host "[2/31] Running URL matching regression tests..." -ForegroundColor Yellow
try {
    python test_url_matching.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "test_url_matching.py"
        Write-Host "FAILED: test_url_matching.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: test_url_matching.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "test_url_matching.py (exception)"
    Write-Host "FAILED: test_url_matching.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 3: Claim Verification
Write-Host "[3/31] Running claim verification..." -ForegroundColor Yellow
try {
    python scripts\verify_claims.py --all
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "verify_claims.py"
        Write-Host "FAILED: verify_claims.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: verify_claims.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "verify_claims.py (exception)"
    Write-Host "FAILED: verify_claims.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 4: Evaluation Recomputation
Write-Host "[4/31] Running evaluation recomputation..." -ForegroundColor Yellow
try {
    python jobs\recompute_evaluations.py --limit 200
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "recompute_evaluations.py"
        Write-Host "FAILED: recompute_evaluations.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: recompute_evaluations.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "recompute_evaluations.py (exception)"
    Write-Host "FAILED: recompute_evaluations.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 5: Pilot Baseline
Write-Host "[5/31] Running pilot baseline..." -ForegroundColor Yellow
try {
    python scripts\pilot_baseline.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "pilot_baseline.py"
        Write-Host "FAILED: pilot_baseline.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: pilot_baseline.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "pilot_baseline.py (exception)"
    Write-Host "FAILED: pilot_baseline.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 6: Bioguide ID Invariant
Write-Host "[6/31] Running bioguide ID invariant check..." -ForegroundColor Yellow
try {
    python scripts\check_bioguide_invariant.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "check_bioguide_invariant.py"
        Write-Host "FAILED: check_bioguide_invariant.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: check_bioguide_invariant.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "check_bioguide_invariant.py (exception)"
    Write-Host "FAILED: check_bioguide_invariant.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 7: Bronze Layer
Write-Host "[7/31] Running Bronze layer test..." -ForegroundColor Yellow
try {
    python test_bronze_layer.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "test_bronze_layer.py"
        Write-Host "FAILED: test_bronze_layer.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: test_bronze_layer.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "test_bronze_layer.py (exception)"
    Write-Host "FAILED: test_bronze_layer.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 8: Evidence Schema Validation
Write-Host "[8/31] Running evidence validation tests..." -ForegroundColor Yellow
try {
    python test_evidence_validation.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "test_evidence_validation.py"
        Write-Host "FAILED: test_evidence_validation.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: test_evidence_validation.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "test_evidence_validation.py (exception)"
    Write-Host "FAILED: test_evidence_validation.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 9: Fuzzy Matching (Gated)
Write-Host "[9/31] Running fuzzy matching tests..." -ForegroundColor Yellow
try {
    python test_fuzzy_matching.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "test_fuzzy_matching.py"
        Write-Host "FAILED: test_fuzzy_matching.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: test_fuzzy_matching.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "test_fuzzy_matching.py (exception)"
    Write-Host "FAILED: test_fuzzy_matching.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 10: Canonical Imports / Duplication Invariants
Write-Host "[10/31] Running canonical invariants check..." -ForegroundColor Yellow
try {
    python scripts\check_canonical_imports.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "check_canonical_imports.py"
        Write-Host "FAILED: check_canonical_imports.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: check_canonical_imports.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "check_canonical_imports.py (exception)"
    Write-Host "FAILED: check_canonical_imports.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 11: SilverClaim Dedupe
Write-Host "[11/31] Running SilverClaim dedupe test..." -ForegroundColor Yellow
try {
    python test_silver_claims_dedupe.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "test_silver_claims_dedupe.py"
        Write-Host "FAILED: test_silver_claims_dedupe.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: test_silver_claims_dedupe.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "test_silver_claims_dedupe.py (exception)"
    Write-Host "FAILED: test_silver_claims_dedupe.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 12: SilverAction Timeline Integrity
Write-Host "[12/31] Running SilverAction timeline integrity test..." -ForegroundColor Yellow

# Test 13: Bill Timeline Invariants (L1)
Write-Host "[13/31] Running bill timeline enrichment invariants test..." -ForegroundColor Yellow
try {
    python test_enrichment_bill_timeline_invariants.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "test_enrichment_bill_timeline_invariants.py"
        Write-Host "FAILED: test_enrichment_bill_timeline_invariants.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: test_enrichment_bill_timeline_invariants.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "test_enrichment_bill_timeline_invariants.py (exception)"
    Write-Host "FAILED: test_enrichment_bill_timeline_invariants.py (exception)" -ForegroundColor Red
}
Write-Host ""
try {
    python test_silver_action_timeline_integrity.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "test_silver_action_timeline_integrity.py"
        Write-Host "FAILED: test_silver_action_timeline_integrity.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: test_silver_action_timeline_integrity.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "test_silver_action_timeline_integrity.py (exception)"
    Write-Host "FAILED: test_silver_action_timeline_integrity.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 13: Silver Layer Invariants
Write-Host "[14/31] Running Silver invariants check..." -ForegroundColor Yellow
try {
    python scripts\check_silver_invariants.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "check_silver_invariants.py"
        Write-Host "FAILED: check_silver_invariants.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: check_silver_invariants.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "check_silver_invariants.py (exception)"
    Write-Host "FAILED: check_silver_invariants.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 14: Gold Ledger Build
Write-Host "[15/31] Running Gold ledger build test..." -ForegroundColor Yellow
try {
    python test_gold_ledger_build.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "test_gold_ledger_build.py"
        Write-Host "FAILED: test_gold_ledger_build.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: test_gold_ledger_build.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "test_gold_ledger_build.py (exception)"
    Write-Host "FAILED: test_gold_ledger_build.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 15: Gold Layer Invariants
Write-Host "[16/31] Running Gold invariants check..." -ForegroundColor Yellow
try {
    python scripts\check_gold_invariants.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "check_gold_invariants.py"
        Write-Host "FAILED: check_gold_invariants.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: check_gold_invariants.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "check_gold_invariants.py (exception)"
    Write-Host "FAILED: check_gold_invariants.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 16: Power Map Contract
Write-Host "[17/31] Running Power Map contract test..." -ForegroundColor Yellow
try {
    python test_power_map_contract.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "test_power_map_contract.py"
        Write-Host "FAILED: test_power_map_contract.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: test_power_map_contract.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "test_power_map_contract.py (exception)"
    Write-Host "FAILED: test_power_map_contract.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 17: Power Map Invariants
Write-Host "[18/31] Running Power Map invariants check..." -ForegroundColor Yellow
try {
    python scripts\check_power_map_invariants.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "check_power_map_invariants.py"
        Write-Host "FAILED: check_power_map_invariants.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: check_power_map_invariants.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "check_power_map_invariants.py (exception)"
    Write-Host "FAILED: check_power_map_invariants.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 18: Gold Ledger API Contract
Write-Host "[19/31] Running Gold ledger API contract test..." -ForegroundColor Yellow
try {
    python test_api_gold_ledger_contract.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "test_api_gold_ledger_contract.py"
        Write-Host "FAILED: test_api_gold_ledger_contract.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: test_api_gold_ledger_contract.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "test_api_gold_ledger_contract.py (exception)"
    Write-Host "FAILED: test_api_gold_ledger_contract.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 18b: People API Contract (temp DB, no network)
Write-Host "[20/31] Running People API contract test (temp DB, no network)..." -ForegroundColor Yellow
try {
    python test_api_people_contract.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "test_api_people_contract.py"
        Write-Host "FAILED: test_api_people_contract.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: test_api_people_contract.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "test_api_people_contract.py (exception)"
    Write-Host "FAILED: test_api_people_contract.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 18c: Ledger Claim API Contract (temp DB, no network)
Write-Host "[21/31] Running ledger claim API contract test (temp DB, no network)..." -ForegroundColor Yellow
try {
    python test_api_ledger_claim_contract.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "test_api_ledger_claim_contract.py"
        Write-Host "FAILED: test_api_ledger_claim_contract.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: test_api_ledger_claim_contract.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "test_api_ledger_claim_contract.py (exception)"
    Write-Host "FAILED: test_api_ledger_claim_contract.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 18d: Ledger Person Fields Contract (temp DB, no network)
Write-Host "[22/31] Running ledger person fields contract test (temp DB, no network)..." -ForegroundColor Yellow
try {
    python test_api_ledger_person_fields_contract.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "test_api_ledger_person_fields_contract.py"
        Write-Host "FAILED: test_api_ledger_person_fields_contract.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: test_api_ledger_person_fields_contract.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "test_api_ledger_person_fields_contract.py (exception)"
    Write-Host "FAILED: test_api_ledger_person_fields_contract.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 18e: Bill API Contract (temp DB, no network)
Write-Host "[22a/31] Running bill API contract test (temp DB, no network)..." -ForegroundColor Yellow
try {
    python test_api_bill_contract.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "test_api_bill_contract.py"
        Write-Host "FAILED: test_api_bill_contract.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: test_api_bill_contract.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "test_api_bill_contract.py (exception)"
    Write-Host "FAILED: test_api_bill_contract.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 18f: Bill Timeline API Contract (temp DB, no network)
Write-Host "[22b/31] Running bill timeline API contract test (temp DB, no network)..." -ForegroundColor Yellow
try {
    python test_api_bill_timeline_contract.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "test_api_bill_timeline_contract.py"
        Write-Host "FAILED: test_api_bill_timeline_contract.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: test_api_bill_timeline_contract.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "test_api_bill_timeline_contract.py (exception)"
    Write-Host "FAILED: test_api_bill_timeline_contract.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 19: Daily Orchestrator (Dry-Run)
Write-Host "[23/31] Running daily orchestrator dry-run test..." -ForegroundColor Yellow
try {
    python test_daily_run_orchestrator.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "test_daily_run_orchestrator.py"
        Write-Host "FAILED: test_daily_run_orchestrator.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: test_daily_run_orchestrator.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "test_daily_run_orchestrator.py (exception)"
    Write-Host "FAILED: test_daily_run_orchestrator.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 20: Ops Coverage API Contract
Write-Host "[24/31] Running ops coverage API contract test..." -ForegroundColor Yellow
try {
    python test_api_coverage_contract.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "test_api_coverage_contract.py"
        Write-Host "FAILED: test_api_coverage_contract.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: test_api_coverage_contract.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "test_api_coverage_contract.py (exception)"
    Write-Host "FAILED: test_api_coverage_contract.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 21b: Ops Coverage API Pilot-Only Contract
Write-Host "[25/31] Running ops coverage API pilot-only contract test..." -ForegroundColor Yellow
try {
    python test_api_coverage_pilot_only_contract.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "test_api_coverage_pilot_only_contract.py"
        Write-Host "FAILED: test_api_coverage_pilot_only_contract.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: test_api_coverage_pilot_only_contract.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "test_api_coverage_pilot_only_contract.py (exception)"
    Write-Host "FAILED: test_api_coverage_pilot_only_contract.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 21c: Pilot Coverage Threshold Checker (Contract)
Write-Host "[26/31] Running pilot coverage threshold checker contract test..." -ForegroundColor Yellow
try {
    python test_check_pilot_coverage_threshold.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "test_check_pilot_coverage_threshold.py"
        Write-Host "FAILED: test_check_pilot_coverage_threshold.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: test_check_pilot_coverage_threshold.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "test_check_pilot_coverage_threshold.py (exception)"
    Write-Host "FAILED: test_check_pilot_coverage_threshold.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 21: Run Daily Contract (Dry-Run, No-Network)
Write-Host "[27/31] Running run_daily (dry-run) contract test..." -ForegroundColor Yellow
try {
    python test_run_daily_contract.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "test_run_daily_contract.py"
        Write-Host "FAILED: test_run_daily_contract.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: test_run_daily_contract.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "test_run_daily_contract.py (exception)"
    Write-Host "FAILED: test_run_daily_contract.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 22: Run Daily Local-Mode (Warn-Only)
Write-Host "[28a/31] WARN-ONLY: run_daily local-mode pipeline test (temp DB, no network)" -ForegroundColor Yellow
try {
    python test_run_daily_local_mode.py
    Write-Host "WARN-ONLY: test_run_daily_local_mode.py completed" -ForegroundColor Green
} catch {
    Write-Host "WARN-ONLY: test_run_daily_local_mode.py failed (continuing)" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "[28b/31] Running run_daily idempotency smoke test (temp DB, no network)..." -ForegroundColor Yellow
try {
    python test_run_daily_idempotency.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "test_run_daily_idempotency.py"
        Write-Host "FAILED: test_run_daily_idempotency.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: test_run_daily_idempotency.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "test_run_daily_idempotency.py (exception)"
    Write-Host "FAILED: test_run_daily_idempotency.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 23: Coverage Report (Warn-Only)
Write-Host "[29/31] Coverage report (warn-only): lowest coverage members" -ForegroundColor Yellow
try {
    python scripts\coverage_report.py --worst 10
    Write-Host "WARN-ONLY: coverage report completed" -ForegroundColor Green
} catch {
    Write-Host "WARN-ONLY: coverage report failed (continuing)" -ForegroundColor Yellow
}
Write-Host ""

# Test 24: Pilot Coverage Threshold (HARD FAIL)
Write-Host "[30/31] Running pilot coverage threshold check (pilot-only)..." -ForegroundColor Yellow
try {
    python scripts\check_pilot_coverage_threshold.py --threshold 0.75
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "check_pilot_coverage_threshold.py"
        Write-Host "FAILED: check_pilot_coverage_threshold.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: check_pilot_coverage_threshold.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "check_pilot_coverage_threshold.py (exception)"
    Write-Host "FAILED: check_pilot_coverage_threshold.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Test 25: Auth Gating Contract (temp DB, no network)
Write-Host "[31/31] Running auth gating contract test (temp DB, no network)..." -ForegroundColor Yellow
try {
    python test_api_auth_gating.py
    if ($LASTEXITCODE -ne 0) {
        $FailedTests += "test_api_auth_gating.py"
        Write-Host "FAILED: test_api_auth_gating.py" -ForegroundColor Red
    } else {
        Write-Host "PASSED: test_api_auth_gating.py" -ForegroundColor Green
    }
} catch {
    $FailedTests += "test_api_auth_gating.py (exception)"
    Write-Host "FAILED: test_api_auth_gating.py (exception)" -ForegroundColor Red
}
Write-Host ""

# Summary
Write-Host "======================================================================" -ForegroundColor Cyan
if ($FailedTests.Count -eq 0) {
    Write-Host "QUALITY GATE: PASSED" -ForegroundColor Green
    Write-Host "All verification tests completed successfully." -ForegroundColor Green
    exit 0
} else {
    Write-Host "QUALITY GATE: FAILED" -ForegroundColor Red
    Write-Host "Failed tests:" -ForegroundColor Red
    foreach ($test in $FailedTests) {
        Write-Host "  - $test" -ForegroundColor Red
    }
    exit 1
}
