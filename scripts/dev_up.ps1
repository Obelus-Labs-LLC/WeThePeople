<#
.SYNOPSIS
    dev_up.ps1 - One-command dev startup

.DESCRIPTION
    Kills rogue uvicorn processes, configures environment, 
    optionally rebuilds gold_ledger, and starts uvicorn.

.PARAMETER Port
    Port number for uvicorn (default: 8002)

.PARAMETER NoRebuildLedger
    Skip gold_ledger rebuild check

.EXAMPLE
    .\scripts\dev_up.ps1
    .\scripts\dev_up.ps1 -Port 8003 -NoRebuildLedger
#>

param(
    [int]$Port = 8002,
    [switch]$NoRebuildLedger
)

Write-Host "Starting WTP Backend Development Server" -ForegroundColor Cyan
Write-Host ""

# Step 1: Kill rogue uvicorn processes
Write-Host "1. Cleaning up rogue uvicorn processes..." -ForegroundColor Yellow
$uvicornProcs = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -like "*python*" -and $_.CommandLine -match "uvicorn"
}

if ($uvicornProcs) {
    foreach ($proc in $uvicornProcs) {
        Write-Host "   Killing process $($proc.ProcessId)" -ForegroundColor Gray
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
    Write-Host "   OK: Cleaned up $($uvicornProcs.Count) process(es)" -ForegroundColor Green
} else {
    Write-Host "   OK: No rogue processes found" -ForegroundColor Green
}


# Step 2: Set environment variables
Write-Host ""
Write-Host "2. Configuring environment..." -ForegroundColor Yellow
$env:DISABLE_STARTUP_FETCH = "1"
$env:CORS_ALLOW_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:3000,http://127.0.0.1:3000"
Write-Host "   OK: DISABLE_STARTUP_FETCH=1" -ForegroundColor Green
Write-Host "   OK: CORS configured for frontend (5173, 5174, 3000)" -ForegroundColor Green
Write-Host ""
Write-Host "   Frontend startup instructions:" -ForegroundColor Cyan
Write-Host "   If Vite uses 5173: open http://127.0.0.1:5173/" -ForegroundColor Yellow
Write-Host "   If Vite uses 5174: open http://127.0.0.1:5174/" -ForegroundColor Yellow
Write-Host "   (Vite will pick 5174 if 5173 is taken)" -ForegroundColor Gray

# Step 3: Check/rebuild gold ledger if needed
if (-not $NoRebuildLedger) {
    Write-Host ""
    Write-Host "3. Checking gold_ledger status..." -ForegroundColor Yellow
    
    $ledgerCount = 0
    try {
        $output = python check_all_dbs.py 2>$null
        if ($output -match "gold_ledger: (\d+) rows") {
            $ledgerCount = [int]$matches[1]
        }
    } catch {
        $ledgerCount = 0
    }
    
    if ($ledgerCount -lt 10) {
        Write-Host "   Gold ledger has only $ledgerCount entries. Rebuilding..." -ForegroundColor Gray
        python jobs/build_gold_ledger.py --limit 100 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   OK: Gold ledger rebuilt" -ForegroundColor Green
        } else {
            Write-Host "   WARNING: Gold ledger rebuild failed (non-fatal)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   OK: Gold ledger has $ledgerCount entries" -ForegroundColor Green
    }
} else {
    Write-Host ""
    Write-Host "3. Skipping gold_ledger rebuild (--no-rebuild-ledger)" -ForegroundColor Gray
}

# Step 4: Start uvicorn
Write-Host ""
Write-Host "4. Starting uvicorn on port $Port..." -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor DarkGray
Write-Host ""

# Start uvicorn in background
$job = Start-Job -ScriptBlock {
    param($port, $pwd)
    Set-Location $pwd
    uvicorn main:app --port $port --reload
} -ArgumentList $Port, $PWD

# Wait for server to be ready
Write-Host "Waiting for server to start..." -ForegroundColor Gray
Start-Sleep -Seconds 3

# Health checks
Write-Host ""
Write-Host "================================================================" -ForegroundColor DarkGray
Write-Host "DEV HEALTH CHECKS" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor DarkGray
Write-Host ""

try {
    # Check 1: /ops/runtime
    Write-Host "1. Checking /ops/runtime..." -ForegroundColor Yellow
    $runtime = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/ops/runtime" -Method Get -ErrorAction Stop
    
    if ($runtime.db_file -eq "wethepeople.db") {
        Write-Host "   OK: db_file = wethepeople.db" -ForegroundColor Green
    } else {
        Write-Host "   WARNING: db_file = $($runtime.db_file) (expected wethepeople.db)" -ForegroundColor Yellow
    }
    
    if ($runtime.disable_startup_fetch -eq $true) {
        Write-Host "   OK: disable_startup_fetch = true" -ForegroundColor Green
    } else {
        Write-Host "   WARNING: disable_startup_fetch = false" -ForegroundColor Yellow
    }
    
    $corsCount = $runtime.cors_origins.Count
    Write-Host "   OK: cors_origins configured ($corsCount origins)" -ForegroundColor Green
    
    # Check 2: /people?has_ledger=1
    Write-Host ""
    Write-Host "2. Checking /people?has_ledger=1..." -ForegroundColor Yellow
    $people = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/people?has_ledger=1&limit=1&offset=0" -Method Get -ErrorAction Stop
    
    if ($people.total -ge 1) {
        Write-Host "   OK: $($people.total) people with ledger entries" -ForegroundColor Green
    } else {
        Write-Host "   WARNING: 0 people with ledger entries (run jobs/build_gold_ledger.py)" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor DarkGray
    Write-Host "SERVER READY ON http://127.0.0.1:$Port" -ForegroundColor Green
    Write-Host "================================================================" -ForegroundColor DarkGray
    Write-Host ""

    # Print CORS_ALLOW_ORIGINS
    Write-Host "CORS_ALLOW_ORIGINS: $env:CORS_ALLOW_ORIGINS" -ForegroundColor Cyan
    # Check /ops/runtime cors_origins
    try {
        $runtimeCheck = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/ops/runtime" -Method Get -ErrorAction Stop
        $corsOrigins = $runtimeCheck.cors_origins
        Write-Host "cors_origins from /ops/runtime: $($corsOrigins -join ', ')" -ForegroundColor Cyan
        $has5174 = $corsOrigins | Where-Object { $_ -match "5174" }
        if (-not $has5174) {
            Write-Host "WARNING: cors_origins does NOT include 5174. Frontend on 5174 will fail CORS." -ForegroundColor Red
        }
    } catch {
        Write-Host "ERROR: Could not check /ops/runtime cors_origins" -ForegroundColor Red
    }
    
} catch {
    Write-Host "   ERROR: Health checks failed" -ForegroundColor Red
    Write-Host "   $_" -ForegroundColor Red
}

# Wait for job to complete (this blocks until Ctrl+C)
Write-Host "Press Ctrl+C to stop the server..." -ForegroundColor Gray
Write-Host ""
Wait-Job -Job $job | Out-Null

# Clean up
Remove-Job -Job $job -Force
Write-Host ""
Write-Host "Server stopped." -ForegroundColor Gray
