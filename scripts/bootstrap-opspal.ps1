# =============================================================================
# OpsPal Commercial Plugin Suite - Windows PowerShell Bootstrap
# =============================================================================
#
# Ensures Git for Windows (bash) is available, then delegates to the main
# bash bootstrap script. Safe to re-run.
#
# Usage (PowerShell):
#   irm https://opspal.gorevpal.com/bootstrap-opspal.ps1 | iex
#
# Or save and run:
#   Invoke-WebRequest -Uri https://opspal.gorevpal.com/bootstrap-opspal.ps1 -OutFile bootstrap.ps1
#   .\bootstrap.ps1
#
# Copyright 2024-2026 RevPal Partners, LLC
# =============================================================================

$ErrorActionPreference = 'Stop'

$BOOTSTRAP_URL = 'https://opspal.gorevpal.com/bootstrap-opspal.sh'

function Write-Step($msg) { Write-Host "`n--- $msg ---`n" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[ERROR] $msg" -ForegroundColor Red }

# ── Banner ──────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "================================================================" -ForegroundColor White
Write-Host "  OpsPal Commercial Plugin Suite - Windows Bootstrap" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor White
Write-Host ""

# ── Step 1: Check / Install Git for Windows ─────────────────────────────────

Write-Step "Step 1: Checking for Git / Bash"

$bashPath = $null

# Check common locations
$candidates = @(
    (Get-Command bash -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
    "$env:ProgramFiles\Git\bin\bash.exe",
    "${env:ProgramFiles(x86)}\Git\bin\bash.exe",
    "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe"
) | Where-Object { $_ -and (Test-Path $_ -ErrorAction SilentlyContinue) }

if ($candidates.Count -gt 0) {
    $bashPath = $candidates[0]
    Write-Ok "Found bash: $bashPath"
}
else {
    Write-Warn "Git for Windows (bash) not found."
    Write-Host ""
    Write-Host "  Git for Windows provides the bash shell required by OpsPal and Claude Code." -ForegroundColor Gray
    Write-Host "  Attempting to install via winget..." -ForegroundColor Gray
    Write-Host ""

    # Check for winget
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Err "winget is not available on this system."
        Write-Host ""
        Write-Host "  Please install Git for Windows manually:" -ForegroundColor Yellow
        Write-Host "    https://git-scm.com/downloads/win" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  After installing, re-run this script." -ForegroundColor Yellow
        exit 1
    }

    # Install Git for Windows via winget
    try {
        winget install --id Git.Git -e --source winget `
            --accept-package-agreements --accept-source-agreements `
            --silent
        Write-Ok "Git for Windows installed."
    }
    catch {
        Write-Err "Failed to install Git for Windows: $_"
        Write-Host ""
        Write-Host "  Please install manually: https://git-scm.com/downloads/win" -ForegroundColor Yellow
        exit 1
    }

    # Refresh PATH from registry (pick up new Git install)
    $machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath    = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path    = "$machinePath;$userPath"

    # Re-check for bash
    $postCandidates = @(
        (Get-Command bash -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
        "$env:ProgramFiles\Git\bin\bash.exe",
        "${env:ProgramFiles(x86)}\Git\bin\bash.exe",
        "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe"
    ) | Where-Object { $_ -and (Test-Path $_ -ErrorAction SilentlyContinue) }

    if ($postCandidates.Count -gt 0) {
        $bashPath = $postCandidates[0]
        Write-Ok "bash is now available: $bashPath"
    }
    else {
        Write-Err "bash still not found after installing Git for Windows."
        Write-Host ""
        Write-Host "  You may need to close and reopen PowerShell, then re-run this script." -ForegroundColor Yellow
        Write-Host "  Or open Git Bash directly and run:" -ForegroundColor Yellow
        Write-Host "    curl -fsSL $BOOTSTRAP_URL | bash" -ForegroundColor Yellow
        exit 1
    }
}

# ── Step 2: Run the bash bootstrap ──────────────────────────────────────────

Write-Step "Step 2: Running OpsPal bash bootstrap"

Write-Host "  Using: $bashPath" -ForegroundColor Gray
Write-Host "  Source: $BOOTSTRAP_URL" -ForegroundColor Gray
Write-Host ""

try {
    & $bashPath -c "curl -fsSL '$BOOTSTRAP_URL' | bash"
    $exitCode = $LASTEXITCODE
}
catch {
    Write-Err "Bash bootstrap failed: $_"
    exit 1
}

if ($exitCode -ne 0) {
    Write-Warn "Bootstrap exited with code $exitCode"
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor White
Write-Host "  Bootstrap complete." -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor White
Write-Host ""
Write-Host "  Next: Exit Claude Code (/exit), restart it, then run /opspalfirst" -ForegroundColor Cyan
Write-Host ""

exit $exitCode
