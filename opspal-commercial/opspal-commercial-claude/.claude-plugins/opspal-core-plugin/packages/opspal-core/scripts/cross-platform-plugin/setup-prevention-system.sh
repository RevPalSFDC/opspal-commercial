#!/bin/bash
#
# Prevention System Setup Script
#
# Purpose: Register prevention system hooks in .claude/settings.json
#
# Usage: bash .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/setup-prevention-system.sh
#

set -euo pipefail

echo "════════════════════════════════════════════════════════════════"
echo "  Prevention System Setup"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Get project root (3 levels up from this script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SETTINGS_FILE="$PROJECT_ROOT/.claude/settings.json"

echo "📍 Project root: $PROJECT_ROOT"
echo ""

# Check if jq is installed
if ! command -v jq &> /dev/null; then
  echo "❌ ERROR: jq is not installed"
  echo ""
  echo "The prevention system requires jq for JSON processing."
  echo ""
  echo "Install jq:"
  echo "  • macOS:   brew install jq"
  echo "  • Linux:   sudo apt-get install jq"
  echo "  • Windows: choco install jq"
  echo ""
  echo "Or run: /checkdependencies --install"
  echo ""
  exit 1
fi

echo "✅ jq is installed ($(jq --version))"
echo ""

# Create .claude directory if it doesn't exist
if [ ! -d "$PROJECT_ROOT/.claude" ]; then
  echo "📁 Creating .claude directory..."
  mkdir -p "$PROJECT_ROOT/.claude"
fi

# Initialize settings.json if it doesn't exist
if [ ! -f "$SETTINGS_FILE" ]; then
  echo "📝 Creating .claude/settings.json..."
  cat > "$SETTINGS_FILE" << 'EOF'
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "description": "OpsPal Internal Plugins - Project-level settings with Prevention System",
  "hooks": {}
}
EOF
fi

# Check if hooks are already registered
EXISTING_HOOKS=$(jq -r '.hooks | keys | length' "$SETTINGS_FILE")

if [ "$EXISTING_HOOKS" -gt 0 ]; then
  echo "⚠️  Existing hooks found in settings.json"
  echo ""
  jq -r '.hooks | keys | .[]' "$SETTINGS_FILE" | while read -r hook; do
    echo "   • $hook"
  done
  echo ""
  read -p "❓ Overwrite existing hooks? [y/N] " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Setup cancelled"
    exit 0
  fi
fi

# Register hooks
echo "🔧 Registering Prevention System hooks..."

jq --arg root "\${CLAUDE_PLUGIN_ROOT}" '. + {
  "hooks": {
    "UserPromptSubmit": {
      "command": "bash \($root)/.claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/hooks/master-prompt-handler.sh",
      "timeout": 10000,
      "description": "Master prompt handler - chains Prevention System (Phases 1-3) with Sub-Agent Utilization Booster. Runs safety checks (routing clarity, env validation, idempotency, scope validation, error recovery) before enhancing delegation to specialized agents."
    },
    "SessionStart": {
      "command": "bash -c '"'"'SF_HOOK=\"\($root)/.claude-plugins/opspal-core-plugin/packages/domains/salesforce/hooks/session-start-agent-reminder.sh\"; if [ -f \"$SF_HOOK\" ]; then bash \"$SF_HOOK\"; else LEGACY_HOOK=\"\($root)/.claude-plugins/salesforce-plugin/hooks/session-start-agent-reminder.sh\"; [ -f \"$LEGACY_HOOK\" ] && bash \"$LEGACY_HOOK\"; fi; bash \($root)/.claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/hooks/session-context-loader.sh'"'"'",
      "timeout": 5000,
      "description": "Session initialization - creates temp directories, checks agent reminders, and loads cross-session context (Phase 3.3)"
    }
  }
}' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"

echo "✅ Hooks registered successfully"
echo ""

# Optionally create .env from template
if [ -f "$PROJECT_ROOT/.env.example" ] && [ ! -f "$PROJECT_ROOT/.env" ]; then
  read -p "❓ Create .env from .env.example? [Y/n] " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
    echo "✅ Created .env (all defaults enabled)"
    echo ""
  fi
else
  if [ -f "$PROJECT_ROOT/.env" ]; then
    echo "ℹ️  .env already exists (not overwritten)"
    echo ""
  fi
fi

# Verify setup
echo "🔍 Verifying setup..."
echo ""

# Check master-prompt-handler exists
if [ -f "$PROJECT_ROOT/.claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/hooks/master-prompt-handler.sh" ]; then
  echo "✅ master-prompt-handler.sh found"
else
  echo "❌ master-prompt-handler.sh NOT found"
fi

# Check prevention-system-orchestrator exists
if [ -f "$PROJECT_ROOT/.claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/hooks/prevention-system-orchestrator.sh" ]; then
  echo "✅ prevention-system-orchestrator.sh found"
else
  echo "❌ prevention-system-orchestrator.sh NOT found"
fi

# Check session-context-loader exists
if [ -f "$PROJECT_ROOT/.claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/hooks/session-context-loader.sh" ]; then
  echo "✅ session-context-loader.sh found"
else
  echo "❌ session-context-loader.sh NOT found"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  ✅ Prevention System Setup Complete"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📋 What's Active:"
echo "   • Master Prompt Handler (UserPromptSubmit hook)"
echo "   • Session Context Loader (SessionStart hook)"
echo "   • 8 Prevention Hooks (orchestrated by master handler)"
echo ""
echo "📚 Documentation:"
echo "   • PREVENTION_SYSTEM_GUIDE.md - Complete user guide"
echo "   • .env.example - Configuration options"
echo ""
echo "🔧 Configuration:"
echo "   • Edit .env to customize (optional - defaults work)"
echo "   • All prevention hooks enabled by default"
echo "   • Verbose mode disabled by default"
echo ""
echo "🚀 Next Steps:"
echo "   1. Start a new Claude Code session"
echo "   2. Prevention hooks run automatically"
echo "   3. Review PREVENTION_SYSTEM_GUIDE.md for details"
echo ""
echo "💡 To disable temporarily:"
echo "   export PREVENTION_SYSTEM_ENABLED=0"
echo ""
