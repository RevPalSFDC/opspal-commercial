# =============================================================================
# OpsPal Commercial Plugin Suite - Windows PowerShell Bootstrap
# =============================================================================
#
# Installs Git for Windows, Claude Code, Node.js, and jq natively on Windows,
# then delegates marketplace/plugin setup to the bash bootstrap script.
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

# Wrap in a function so 'return' stops execution without closing the
# PowerShell window (bare 'exit' inside irm|iex terminates the session).
function Invoke-OpsPalBootstrap {

$ErrorActionPreference = 'Stop'

$BOOTSTRAP_URL = 'https://opspal.gorevpal.com/bootstrap-opspal.sh'
$CLAUDE_INSTALL_URL = 'https://claude.ai/install.ps1'
$MIN_NODE_VERSION = 22

function Write-Step($msg) { Write-Host "`n--- $msg ---`n" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[ERROR] $msg" -ForegroundColor Red }
function Write-Info($msg)  { Write-Host "[INFO]  $msg" -ForegroundColor Blue }

# -- Banner ----------------------------------------------------------------

Write-Host ""
Write-Host "================================================================" -ForegroundColor White
Write-Host "  OpsPal Commercial Plugin Suite - Windows Bootstrap" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor White
Write-Host ""

# -- Step 1: Git for Windows -----------------------------------------------

Write-Step "Step 1: Checking for Git / Bash"

$bashPath = $null

# Check Git Bash locations FIRST -- WSL bash won't work because it can't see
# Windows-installed Node.js, Claude Code, or npm.
[string[]]$gitBashCandidates = @(
    "$env:ProgramFiles\Git\bin\bash.exe",
    "${env:ProgramFiles(x86)}\Git\bin\bash.exe",
    "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe",
    "$env:USERPROFILE\scoop\apps\git\current\bin\bash.exe"
) | Where-Object { $_ -and (Test-Path $_ -ErrorAction SilentlyContinue) }

if ($gitBashCandidates.Count -gt 0) {
    $bashPath = $gitBashCandidates[0]
    Write-Ok "Found Git Bash: $bashPath"
} else {
    # Fall back to PATH lookup, but warn if it looks like WSL
    $pathBash = Get-Command bash -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
    if ($pathBash -and (Test-Path $pathBash -ErrorAction SilentlyContinue)) {
        if ($pathBash -match 'System32|WindowsApps') {
            Write-Warn "Found bash at $pathBash -- this is likely WSL, not Git Bash."
            Write-Warn "WSL bash cannot access Windows Node.js or Claude Code."
            Write-Host "  OpsPal requires Git Bash (Git for Windows), not WSL." -ForegroundColor Yellow
        } else {
            $bashPath = $pathBash
            Write-Ok "Found bash: $bashPath"
        }
    }
}

if (-not $bashPath) {
    Write-Warn "Git for Windows (bash) not found."
    Write-Host ""
    Write-Host "  Git for Windows provides the bash shell required by OpsPal and Claude Code." -ForegroundColor Gray
    Write-Host "  Attempting to install via winget..." -ForegroundColor Gray
    Write-Host ""

    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Err "winget is not available on this system."
        Write-Host ""
        Write-Host "  Please install Git for Windows manually:" -ForegroundColor Yellow
        Write-Host "    https://git-scm.com/downloads/win" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  After installing, re-run this script." -ForegroundColor Yellow
        return
    }

    try {
        winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements --silent
        Write-Ok "Git for Windows installed."
    } catch {
        Write-Err "Failed to install Git for Windows: $_"
        Write-Host "  Please install manually: https://git-scm.com/downloads/win" -ForegroundColor Yellow
        return
    }

    # Refresh PATH from registry
    $machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath    = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path    = "$machinePath;$userPath"

    [string[]]$postCandidates = @(
        "$env:ProgramFiles\Git\bin\bash.exe",
        "${env:ProgramFiles(x86)}\Git\bin\bash.exe",
        "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe"
    ) | Where-Object { $_ -and (Test-Path $_ -ErrorAction SilentlyContinue) }

    if ($postCandidates.Count -gt 0) {
        $bashPath = $postCandidates[0]
        Write-Ok "Git Bash is now available: $bashPath"
    } else {
        Write-Err "bash still not found after installing Git for Windows."
        Write-Host "  You may need to close and reopen PowerShell, then re-run this script." -ForegroundColor Yellow
        return
    }
}

# -- Step 2: Claude Code ---------------------------------------------------

Write-Step "Step 2: Claude Code"

$claudePath = Get-Command claude -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
$claudeLocalBin = Join-Path $env:USERPROFILE ".local\bin"
$claudeClaudeBin = Join-Path $env:USERPROFILE ".claude\bin"

if (-not $claudePath) {
    # Check common install locations not yet in PATH
    $claudeExe = @(
        (Join-Path $claudeLocalBin "claude.exe"),
        (Join-Path $claudeClaudeBin "claude.exe")
    ) | Where-Object { Test-Path $_ -ErrorAction SilentlyContinue } | Select-Object -First 1

    if ($claudeExe) {
        $claudePath = $claudeExe
        Write-Ok "Found Claude Code (not in PATH): $claudePath"
    }
}

if ($claudePath) {
    try {
        $claudeVersion = & $claudePath --version 2>$null | Select-String -Pattern '\d+\.\d+\.\d+' | ForEach-Object { $_.Matches[0].Value }
        Write-Ok "Claude Code: v$claudeVersion"
    } catch {
        Write-Ok "Claude Code: found at $claudePath"
    }
} else {
    Write-Info "Claude Code not found -- installing..."
    Write-Host ""
    try {
        $installScript = Invoke-RestMethod -Uri $CLAUDE_INSTALL_URL
        Invoke-Expression $installScript
    } catch {
        Write-Err "Failed to install Claude Code: $_"
        Write-Host ""
        Write-Host "  Install manually:" -ForegroundColor Yellow
        Write-Host "    irm https://claude.ai/install.ps1 | iex" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  Then re-run this script." -ForegroundColor Yellow
        return
    }

    # Refresh PATH from registry (installer may have updated it)
    $machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath    = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path    = "$machinePath;$userPath"

    # Check if claude is now available
    $claudePath = Get-Command claude -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
    if (-not $claudePath) {
        # Check common locations
        $claudeExe = @(
            (Join-Path $claudeLocalBin "claude.exe"),
            (Join-Path $claudeClaudeBin "claude.exe")
        ) | Where-Object { Test-Path $_ -ErrorAction SilentlyContinue } | Select-Object -First 1

        if ($claudeExe) {
            $claudePath = $claudeExe
        }
    }

    if ($claudePath) {
        Write-Ok "Claude Code installed: $claudePath"
    } else {
        Write-Warn "Claude Code installed but not found in PATH."
        Write-Host ""
        Write-Host "  Add to PATH: System Properties > Environment Variables > User PATH > New:" -ForegroundColor Yellow
        Write-Host "    $claudeLocalBin" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  Then close and reopen PowerShell before continuing." -ForegroundColor Yellow
    }
}

# Ensure Claude Code directories are in current session PATH
foreach ($dir in @($claudeLocalBin, $claudeClaudeBin)) {
    if ((Test-Path $dir -ErrorAction SilentlyContinue) -and ($env:Path -notlike "*$dir*")) {
        $env:Path = "$dir;$env:Path"
    }
}

# -- Step 3: Node.js -------------------------------------------------------

Write-Step "Step 3: Node.js"

$nodePath = Get-Command node -ErrorAction SilentlyContinue
if ($nodePath) {
    $nodeVersion = (node -v 2>$null) -replace '^v',''
    $nodeMajor = [int]($nodeVersion -split '\.')[0]
    if ($nodeMajor -ge $MIN_NODE_VERSION) {
        Write-Ok "Node.js: v$nodeVersion"
    } else {
        Write-Warn "Node.js v$nodeVersion found, v$MIN_NODE_VERSION+ recommended"
        Write-Host "  Update: winget upgrade --id OpenJS.NodeJS.LTS" -ForegroundColor Yellow
    }
} else {
    Write-Warn "Node.js not found -- required for plugin scripts."
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Info "Installing Node.js LTS via winget..."
        try {
            winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements --silent
            Write-Ok "Node.js installed. You may need to restart PowerShell for it to be available."
            # Refresh PATH
            $machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
            $userPath    = [System.Environment]::GetEnvironmentVariable('Path', 'User')
            $env:Path    = "$machinePath;$userPath"
        } catch {
            Write-Warn "Could not install Node.js: $_"
            Write-Host "  Install manually: https://nodejs.org" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  Install: https://nodejs.org (LTS version recommended)" -ForegroundColor Yellow
    }
}

# -- Step 4: jq ------------------------------------------------------------

Write-Step "Step 4: jq (JSON processor)"

if (Get-Command jq -ErrorAction SilentlyContinue) {
    Write-Ok "jq: available"
} else {
    Write-Warn "jq not found -- required for hook system."
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Info "Installing jq via winget..."
        try {
            winget install --id jqlang.jq -e --source winget --accept-package-agreements --accept-source-agreements --silent
            Write-Ok "jq installed."
            $machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
            $userPath    = [System.Environment]::GetEnvironmentVariable('Path', 'User')
            $env:Path    = "$machinePath;$userPath"
        } catch {
            Write-Warn "Could not install jq: $_"
            Write-Host "  Install: winget install jqlang.jq" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  Install: winget install jqlang.jq (or choco install jq)" -ForegroundColor Yellow
    }
}

# -- Step 5: Run bash bootstrap for marketplace + plugins -------------------

Write-Step "Step 5: Installing OpsPal marketplace and plugins"

Write-Host "  Using: $bashPath" -ForegroundColor Gray
Write-Host "  Source: $BOOTSTRAP_URL" -ForegroundColor Gray
Write-Host ""

try {
    & $bashPath -c "curl -fsSL '$BOOTSTRAP_URL' | bash -s -- --skip-claude-install"
    $exitCode = $LASTEXITCODE
} catch {
    Write-Err "Bash bootstrap failed: $_"
    Write-Host ""
    Write-Host "  You can complete setup manually inside Claude Code:" -ForegroundColor Yellow
    Write-Host "    claude" -ForegroundColor Yellow
    Write-Host "    /opspalfirst" -ForegroundColor Yellow
    return
}

if ($exitCode -ne 0) {
    Write-Warn "Bootstrap exited with code $exitCode"
}

# -- Summary ----------------------------------------------------------------

Write-Host ""
Write-Host "================================================================" -ForegroundColor White
Write-Host "  Bootstrap complete." -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor White
Write-Host ""
Write-Host "  If any tools were just installed, close and reopen PowerShell" -ForegroundColor Yellow
Write-Host "  so PATH updates take effect, then:" -ForegroundColor Yellow
Write-Host ""
Write-Host "    1. Open Claude Code:    claude" -ForegroundColor Cyan
Write-Host "    2. Run first-time setup: /opspalfirst" -ForegroundColor Cyan
Write-Host "    3. Activate license:     /activate-license your@email.com KEY" -ForegroundColor Cyan
Write-Host ""

} # end Invoke-OpsPalBootstrap

Invoke-OpsPalBootstrap
