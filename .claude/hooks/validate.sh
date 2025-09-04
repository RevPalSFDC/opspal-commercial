#!/usr/bin/env bash
set -euo pipefail

# Function to output JSON error messages
err() { 
  jq -n --arg m "$1" '{"continue":false,"stopReason":$m}' 
  exit 1
}

# Function to output JSON warning messages (non-blocking)
warn() {
  echo "⚠️  $1" >&2
}

# Check if we're in the right directory
if [[ ! -f "CLAUDE.md" ]]; then
  err "Not in project root. Expected to find CLAUDE.md. Run from /home/chris/Desktop/RevPal/Agents"
fi

# Ensure critical agents exist
REQUIRED_AGENTS=(
  ".claude/agents/release-coordinator.md"
  ".claude/agents/claudesfdc.md" 
  ".claude/agents/claudehubspot.md"
  ".claude/agents/principal-engineer.md"
)

for agent in "${REQUIRED_AGENTS[@]}"; do
  if [[ ! -f "$agent" ]]; then
    warn "Missing agent: $agent. Run /bootstrap to create it."
  fi
done

# Ensure MCP config present
if [[ ! -f ".mcp.json" ]]; then
  warn "Missing .mcp.json. Run /bootstrap to add MCP servers."
fi

# Ensure ripgrep available
if ! command -v rg >/dev/null 2>&1; then
  err "ripgrep not found. Install it (brew install ripgrep or apt-get install ripgrep), then set USE_BUILTIN_RIPGREP=0."
fi

# Check for Slack webhook (warning only)
: "${SLACK_WEBHOOK_URL:=}"
if [[ -z "$SLACK_WEBHOOK_URL" ]]; then
  # Check .env file as fallback
  if [[ -f ".env" ]]; then
    source .env 2>/dev/null || true
  fi
  
  if [[ -z "${SLACK_WEBHOOK_URL:-}" ]]; then
    warn "SLACK_WEBHOOK_URL not set. Slack notifications will be disabled."
    warn "To enable: export SLACK_WEBHOOK_URL='your-webhook-url' or add to .env"
  fi
fi

# Check for required npm packages
if [[ -f "package.json" ]]; then
  if ! npm ls --depth=0 2>/dev/null | grep -q "dotenv"; then
    warn "dotenv package not installed. Some features may not work."
  fi
fi

# Verify git repository
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  err "Not a git repository. Initialize with: git init"
fi

# Check for uncommitted critical files
CRITICAL_FILES=(
  "CLAUDE.md"
  ".mcp.json"
  ".claude/settings.json"
)

for file in "${CRITICAL_FILES[@]}"; do
  if [[ -f "$file" ]] && ! git ls-files --error-unmatch "$file" >/dev/null 2>&1; then
    warn "$file is not tracked in git. Consider adding it: git add $file"
  fi
done

# Create logs directory if missing
mkdir -p .claude/logs

# All validations passed
jq -n '{continue:true, message:"✅ Project validation successful"}'