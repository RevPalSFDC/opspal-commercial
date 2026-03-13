#!/bin/bash
# Post-install hook for opspal-core

# Don't exit on error - allow script to complete even if some commands fail
# set -e

PLUGIN_NAME="opspal-core"
PLUGIN_VERSION="1.8.0"
DOC_VERSION_FILE="$HOME/.claude/plugins/$PLUGIN_NAME/doc-version"

# Use CLAUDE_PLUGIN_ROOT if available, otherwise try to detect plugin location
if [ -n "$CLAUDE_PLUGIN_ROOT" ]; then
  PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT"
else
  # Fallback: try to detect from script location
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

USAGE_FILE="$PLUGIN_ROOT/.claude-plugin/USAGE.md"
CHANGELOG_FILE="$PLUGIN_ROOT/CHANGELOG.md"
PROJECT_ROOT="$(cd "$PLUGIN_ROOT/../.." && pwd)"
HOOK_RECONCILER="$PLUGIN_ROOT/scripts/lib/reconcile-hook-registration.js"

# Create doc version directory
mkdir -p "$(dirname "$DOC_VERSION_FILE")"

if [ ! -f "$DOC_VERSION_FILE" ]; then
  # Fresh install
  echo "✅ $PLUGIN_NAME v$PLUGIN_VERSION installed"
  echo ""
  echo "📚 Documentation available:"
  echo "   - Usage Guide: $USAGE_FILE"
  echo "   - Changelog: $CHANGELOG_FILE"
  echo ""
  echo "💡 Quick start:"
  echo "   /agents | grep cross  # View available agents"
  echo ""
  echo "$PLUGIN_VERSION" > "$DOC_VERSION_FILE"
else
  # Update
  LAST_DOC_VERSION=$(cat "$DOC_VERSION_FILE")
  
  if [ "$LAST_DOC_VERSION" != "$PLUGIN_VERSION" ]; then
    echo "🔄 $PLUGIN_NAME updated: v$LAST_DOC_VERSION → v$PLUGIN_VERSION"
    echo ""
    echo "📚 Documentation updated! See $CHANGELOG_FILE for changes"
    echo ""
    echo "$PLUGIN_VERSION" > "$DOC_VERSION_FILE"
  else
    echo "✅ $PLUGIN_NAME v$PLUGIN_VERSION reinstalled"
  fi
fi

# ============================================================================
# Set Executable Permissions on Plugin Hooks
# ============================================================================
echo "Setting executable permissions on plugin hooks..."

HOOKS_FIXED=0
for hook in "$PLUGIN_ROOT/hooks"/*.sh; do
    if [ -f "$hook" ]; then
        if [ ! -x "$hook" ]; then
            chmod +x "$hook"
            HOOKS_FIXED=$((HOOKS_FIXED + 1))
            echo "  ✓ Made executable: $(basename "$hook")"
        fi
    fi
done

if [ $HOOKS_FIXED -eq 0 ]; then
    echo "  ✓ All hooks already executable"
else
    echo "  ✓ Fixed permissions on $HOOKS_FIXED hook(s)"
fi

if [ -f "$HOOK_RECONCILER" ] && command -v node >/dev/null 2>&1; then
    echo ""
    echo "Reconciling active Claude hook registration..."
    if node "$HOOK_RECONCILER" --project-root "$PROJECT_ROOT" --core-plugin-root "$PLUGIN_ROOT" >/dev/null 2>&1; then
        echo "  ✓ Routing gate registration reconciled"
    else
        echo "  ⚠ Failed to reconcile active hook registration"
        echo "    Run: node \"$HOOK_RECONCILER\" --project-root \"$PROJECT_ROOT\" --core-plugin-root \"$PLUGIN_ROOT\""
    fi
fi

echo ""
echo "✨ Ready to use! Run /agents to see available agents."

exit 0
