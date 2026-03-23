#!/usr/bin/env bash
# =============================================================================
# OpsPal Commercial Plugin Suite — Bootstrap Installer
# =============================================================================
#
# Checks for Claude Code, installs if missing, adds the OpsPal commercial
# marketplace, enables auto-update, and installs all plugins at project
# (collaborator) scope.
#
# Usage:
#   curl -fsSL https://opspal.gorevpal.com/bootstrap-opspal.sh | bash
#
#   # Or locally:
#   bash scripts/bootstrap-opspal.sh [--skip-claude-install] [--scope user]
#
# Options:
#   --skip-claude-install   Skip Claude Code installation check
#   --scope <scope>         Installation scope: project (default), user, local
#   --dry-run               Show what would be done without executing
#   --help                  Show this help
#
# Requirements:
#   - macOS, Linux, WSL, or Git Bash (Windows)
#   - curl or wget
#   - git
#   - Node.js 22+ (for plugin scripts)
#
# Windows users: Run from Git Bash, not PowerShell.
#   bash -c "$(curl -fsSL https://opspal.gorevpal.com/bootstrap-opspal.sh)"
#
# Copyright 2024-2026 RevPal Partners, LLC
# =============================================================================

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

MARKETPLACE_REPO="RevPalSFDC/opspal-commercial"
MARKETPLACE_NAME="opspal-commercial"
CLAUDE_INSTALL_URL="https://claude.ai/install.sh"
MIN_NODE_VERSION=22

# All active plugins in install order (opspal-core first — it's the foundation)
PLUGINS=(
  "opspal-core"
  "opspal-salesforce"
  "opspal-hubspot"
  "opspal-marketo"
  "opspal-gtm-planning"
  "opspal-okrs"
  "opspal-ai-consult"
  "opspal-mcp-client"
  "opspal-monday"
)

# Deprecated plugins — listed but not installed
DEPRECATED_PLUGINS=(
  "opspal-data-hygiene"
)

# ─── Defaults ────────────────────────────────────────────────────────────────

SCOPE="project"
SKIP_CLAUDE=false
DRY_RUN=false

# ─── Colors ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Helpers ─────────────────────────────────────────────────────────────────

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1" >&2; }
step()    { echo -e "\n${BOLD}━━━ $1 ━━━${NC}\n"; }

run() {
  if [ "$DRY_RUN" = true ]; then
    echo -e "  ${YELLOW}[DRY-RUN]${NC} $*"
  else
    "$@"
  fi
}

# ─── Argument Parsing ────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-claude-install) SKIP_CLAUDE=true; shift ;;
    --scope)
      SCOPE="$2"
      if [[ "$SCOPE" != "project" && "$SCOPE" != "user" && "$SCOPE" != "local" ]]; then
        error "Invalid scope: $SCOPE (must be project, user, or local)"
        exit 1
      fi
      shift 2
      ;;
    --scope=*) SCOPE="${1#*=}"; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --help|-h)
      head -28 "$0" | tail -25
      exit 0
      ;;
    *)
      error "Unknown option: $1"
      exit 1
      ;;
  esac
done

# ─── Banner ──────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║    OpsPal Commercial Plugin Suite — Bootstrap Installer   ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Marketplace:  ${BLUE}$MARKETPLACE_REPO${NC}"
echo -e "  Scope:        ${BLUE}$SCOPE${NC}"
echo -e "  Plugins:      ${BLUE}${#PLUGINS[@]}${NC} active (${#DEPRECATED_PLUGINS[@]} deprecated, skipped)"
if [ "$DRY_RUN" = true ]; then
  echo -e "  Mode:         ${YELLOW}DRY RUN${NC}"
fi
echo ""

# ═════════════════════════════════════════════════════════════════════════════
# Step 1: Check prerequisites
# ═════════════════════════════════════════════════════════════════════════════

step "Step 1: Checking prerequisites"

# Check OS
OS="$(uname -s)"
case "$OS" in
  Linux|Darwin) success "OS: $OS" ;;
  MINGW*|MSYS*|CYGWIN*)
    warn "Windows detected (Git Bash / MSYS2). This is supported."
    info "Tip: If you ran this from PowerShell and got an error, re-run from Git Bash instead."
    ;;
  *)
    error "Unsupported OS: $OS"
    exit 1
    ;;
esac

# Check git
if command -v git &>/dev/null; then
  success "git: $(git --version | head -1)"
else
  error "git is required but not installed"
  echo "  Install: https://git-scm.com/downloads"
  exit 1
fi

# Check curl or wget
if command -v curl &>/dev/null; then
  DOWNLOADER="curl"
  success "curl: available"
elif command -v wget &>/dev/null; then
  DOWNLOADER="wget"
  success "wget: available"
else
  error "curl or wget is required"
  exit 1
fi

# Check Node.js
if command -v node &>/dev/null; then
  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -ge "$MIN_NODE_VERSION" ]; then
    success "Node.js: v$(node -v | sed 's/v//')"
  else
    warn "Node.js v${NODE_VERSION} found, v${MIN_NODE_VERSION}+ recommended"
  fi
else
  warn "Node.js not found — plugin scripts may not work until installed"
  echo "  Install: https://nodejs.org or use nvm"
fi

# Check jq (required for hooks)
if command -v jq &>/dev/null; then
  success "jq: $(jq --version 2>/dev/null || echo 'available')"
else
  warn "jq not found — required for hook system"
  case "$OS" in
    Linux|Darwin)
      echo "  Install: sudo apt-get install jq (Linux) or brew install jq (macOS)"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      echo "  Install: winget install jqlang.jq  (or: choco install jq)"
      ;;
  esac
fi

# ═════════════════════════════════════════════════════════════════════════════
# Step 2: Check / Install Claude Code
# ═════════════════════════════════════════════════════════════════════════════

step "Step 2: Claude Code"

if [ "$SKIP_CLAUDE" = true ]; then
  info "Skipping Claude Code install check (--skip-claude-install)"
elif command -v claude &>/dev/null; then
  CLAUDE_VERSION=$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "unknown")
  success "Claude Code: v${CLAUDE_VERSION}"
else
  info "Claude Code not found — installing..."

  if [ "$DRY_RUN" = true ]; then
    echo -e "  ${YELLOW}[DRY-RUN]${NC} curl -fsSL $CLAUDE_INSTALL_URL | bash"
  else
    if [ "$DOWNLOADER" = "curl" ]; then
      curl -fsSL "$CLAUDE_INSTALL_URL" | bash
    else
      wget -qO- "$CLAUDE_INSTALL_URL" | bash
    fi

    # Refresh PATH in case the installer added to .bashrc/.zshrc
    export PATH="$HOME/.claude/bin:$HOME/.local/bin:$PATH"

    if command -v claude &>/dev/null; then
      success "Claude Code installed: v$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
    else
      error "Claude Code installation completed but 'claude' not found in PATH"
      echo "  Try: source ~/.bashrc (or ~/.zshrc) and re-run this script"
      exit 1
    fi
  fi
fi

# ═════════════════════════════════════════════════════════════════════════════
# Step 3: Add marketplace
# ═════════════════════════════════════════════════════════════════════════════

step "Step 3: OpsPal marketplace"

MARKETPLACE_DIR="$HOME/.claude/plugins/marketplaces/$MARKETPLACE_NAME"

if [ -d "$MARKETPLACE_DIR" ] && [ -f "$MARKETPLACE_DIR/.claude-plugin/marketplace.json" ]; then
  success "Marketplace already present: $MARKETPLACE_DIR"

  # Pull latest
  info "Updating marketplace to latest..."
  if [ "$DRY_RUN" = false ]; then
    (cd "$MARKETPLACE_DIR" && git pull --ff-only origin main 2>/dev/null) && \
      success "Marketplace updated" || \
      warn "Could not update marketplace (may need manual git pull)"
  else
    echo -e "  ${YELLOW}[DRY-RUN]${NC} cd $MARKETPLACE_DIR && git pull origin main"
  fi
else
  info "Adding marketplace: $MARKETPLACE_REPO"
  if [ "$DRY_RUN" = true ]; then
    echo -e "  ${YELLOW}[DRY-RUN]${NC} claude plugin marketplace add $MARKETPLACE_REPO"
    success "Marketplace would be added"
  else
    claude plugin marketplace add "$MARKETPLACE_REPO" 2>/dev/null || {
      # Fallback: manual clone if CLI command not available
      info "Falling back to manual clone..."
      mkdir -p "$HOME/.claude/plugins/marketplaces"
      git clone "https://github.com/${MARKETPLACE_REPO}.git" "$MARKETPLACE_DIR"
    }

    if [ -d "$MARKETPLACE_DIR" ]; then
      success "Marketplace added: $MARKETPLACE_DIR"
    else
      error "Failed to add marketplace"
      exit 1
    fi
  fi
fi

# ═════════════════════════════════════════════════════════════════════════════
# Step 4: Enable auto-update
# ═════════════════════════════════════════════════════════════════════════════

step "Step 4: Auto-update configuration"

SETTINGS_FILE="$HOME/.claude/settings.json"

# Helper: update settings JSON using Node.js (fallback when jq unavailable)
update_settings_node() {
  local file="$1"
  local key="$2"
  node -e "
    const fs = require('fs');
    const file = process.argv[1];
    const key = process.argv[2];
    let data = {};
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
    if (!data.marketplaceAutoUpdate) data.marketplaceAutoUpdate = {};
    data.marketplaceAutoUpdate[key] = true;
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  " "$file" "$key"
}

if [ -f "$SETTINGS_FILE" ]; then
  # Check if auto-update is already configured for this marketplace
  if command -v jq &>/dev/null && jq -e ".marketplaceAutoUpdate.\"$MARKETPLACE_NAME\"" "$SETTINGS_FILE" &>/dev/null 2>&1; then
    success "Auto-update already configured for $MARKETPLACE_NAME"
  else
    info "Enabling auto-update for $MARKETPLACE_NAME..."
    if [ "$DRY_RUN" = false ]; then
      if command -v jq &>/dev/null; then
        TMP_SETTINGS="${SETTINGS_FILE}.tmp.$$"
        jq --arg mp "$MARKETPLACE_NAME" '.marketplaceAutoUpdate[$mp] = true' "$SETTINGS_FILE" > "$TMP_SETTINGS" && \
          mv -f "$TMP_SETTINGS" "$SETTINGS_FILE" && \
          success "Auto-update enabled" || {
            rm -f "$TMP_SETTINGS"
            warn "jq failed — falling back to Node.js"
            update_settings_node "$SETTINGS_FILE" "$MARKETPLACE_NAME" && \
              success "Auto-update enabled (via Node.js)" || \
              warn "Could not enable auto-update — configure manually via /plugin"
          }
      elif command -v node &>/dev/null; then
        update_settings_node "$SETTINGS_FILE" "$MARKETPLACE_NAME" && \
          success "Auto-update enabled (via Node.js)" || \
          warn "Could not enable auto-update — configure manually via /plugin"
      else
        warn "Neither jq nor node available — skipping auto-update config"
      fi
    else
      echo -e "  ${YELLOW}[DRY-RUN]${NC} Enable auto-update for $MARKETPLACE_NAME in $SETTINGS_FILE"
    fi
  fi
else
  info "Creating settings.json with auto-update enabled..."
  if [ "$DRY_RUN" = false ]; then
    mkdir -p "$(dirname "$SETTINGS_FILE")"
    if command -v jq &>/dev/null; then
      echo "{\"marketplaceAutoUpdate\":{\"$MARKETPLACE_NAME\":true}}" | jq . > "$SETTINGS_FILE"
    elif command -v node &>/dev/null; then
      update_settings_node "$SETTINGS_FILE" "$MARKETPLACE_NAME"
    else
      echo "{\"marketplaceAutoUpdate\":{\"$MARKETPLACE_NAME\":true}}" > "$SETTINGS_FILE"
    fi
    success "Settings created with auto-update enabled"
  fi
fi

# Also set FORCE_AUTOUPDATE_PLUGINS for environments that disable the main updater
info "Plugin auto-update will be active. To force in locked environments:"
echo "  export FORCE_AUTOUPDATE_PLUGINS=true"

# ═════════════════════════════════════════════════════════════════════════════
# Step 5: Install plugins
# ═════════════════════════════════════════════════════════════════════════════

step "Step 5: Installing plugins (scope: $SCOPE)"

INSTALLED=0
FAILED=0
SKIPPED=0

for plugin in "${PLUGINS[@]}"; do
  PLUGIN_QUALIFIED="${plugin}@${MARKETPLACE_NAME}"

  info "Installing ${PLUGIN_QUALIFIED}..."
  if [ "$DRY_RUN" = true ]; then
    echo -e "  ${YELLOW}[DRY-RUN]${NC} claude plugin install $PLUGIN_QUALIFIED --scope $SCOPE"
    INSTALLED=$((INSTALLED + 1))
  else
    if claude plugin install "$PLUGIN_QUALIFIED" --scope "$SCOPE" 2>/dev/null; then
      success "Installed: $PLUGIN_QUALIFIED"
      INSTALLED=$((INSTALLED + 1))
    else
      warn "Failed to install $PLUGIN_QUALIFIED — will retry after other plugins"
      FAILED=$((FAILED + 1))
    fi
  fi
done

# Retry failures once (dependency order may matter)
if [ "$FAILED" -gt 0 ] && [ "$DRY_RUN" = false ]; then
  info "Retrying $FAILED failed plugin(s)..."
  for plugin in "${PLUGINS[@]}"; do
    PLUGIN_QUALIFIED="${plugin}@${MARKETPLACE_NAME}"
    # Check if already installed
    if claude plugin list 2>/dev/null | grep -q "$plugin"; then
      continue
    fi
    if claude plugin install "$PLUGIN_QUALIFIED" --scope "$SCOPE" 2>/dev/null; then
      success "Retry succeeded: $PLUGIN_QUALIFIED"
      INSTALLED=$((INSTALLED + 1))
      FAILED=$((FAILED - 1))
    else
      error "Failed to install: $PLUGIN_QUALIFIED"
    fi
  done
fi

for plugin in "${DEPRECATED_PLUGINS[@]}"; do
  info "Skipping deprecated: $plugin"
  SKIPPED=$((SKIPPED + 1))
done

# ═════════════════════════════════════════════════════════════════════════════
# Step 6: Verify installation
# ═════════════════════════════════════════════════════════════════════════════

step "Step 6: Verification"

if [ "$DRY_RUN" = false ] && command -v claude &>/dev/null; then
  info "Installed plugins:"
  claude plugin list 2>/dev/null | head -20 || warn "Could not list plugins"
fi

# ═════════════════════════════════════════════════════════════════════════════
# Summary
# ═════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║    Installation Complete                                   ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Installed:    ${GREEN}$INSTALLED${NC} plugin(s)"
echo -e "  Failed:       ${RED}$FAILED${NC}"
echo -e "  Skipped:      ${YELLOW}$SKIPPED${NC} (deprecated)"
echo -e "  Scope:        ${BLUE}$SCOPE${NC}"
echo -e "  Auto-update:  ${GREEN}enabled${NC}"
echo ""

if [ "$FAILED" -eq 0 ]; then
  echo -e "${BOLD}${GREEN}What to do next:${NC}"
  echo ""
  echo -e "  ${YELLOW}⚠  You must restart Claude Code to load the new plugins.${NC}"
  echo ""
  echo "  1. Exit Claude Code (type /exit or close the terminal)"
  echo ""
  echo "  2. Reopen Claude Code in your project directory:"
  echo "     cd /path/to/your/project"
  echo "     claude"
  echo ""
  echo "  3. Run first-time setup (inside Claude Code):"
  echo "     /opspalfirst"
  echo ""
  echo "  4. Activate your license:"
  echo "     /activate-license your@email.com YOUR-LICENSE-KEY"
  echo ""
  echo "  5. Connect your platforms:"
  echo "     Tell Claude: \"connect to salesforce\" or \"connect to hubspot\""
  echo ""
  echo -e "  ${BLUE}Have your license key ready for step 4.${NC}"
  echo ""
else
  echo -e "${YELLOW}Some plugins failed to install. Try:${NC}"
  echo "  1. Exit and restart Claude Code"
  echo "  2. Add marketplace:   /plugin marketplace add $MARKETPLACE_REPO"
  echo "  3. Install manually:  /plugin install <plugin-name>@$MARKETPLACE_NAME"
  echo ""
fi

exit $FAILED
