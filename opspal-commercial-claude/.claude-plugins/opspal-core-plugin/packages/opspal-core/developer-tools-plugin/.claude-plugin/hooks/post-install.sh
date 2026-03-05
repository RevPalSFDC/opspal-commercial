#!/bin/bash
# Post-install hook for developer-tools-plugin

set -e

PLUGIN_NAME="developer-tools-plugin"
PLUGIN_VERSION="2.2.0"
DOC_VERSION_FILE="$HOME/.claude/plugins/$PLUGIN_NAME/doc-version"
USAGE_FILE=".claude-plugins/$PLUGIN_NAME/.claude-plugin/USAGE.md"
CHANGELOG_FILE=".claude-plugins/$PLUGIN_NAME/CHANGELOG.md"

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
  echo "   /agents | grep plugin  # View available agents"
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

# Use CLAUDE_PLUGIN_ROOT if available, otherwise try to detect plugin location
if [ -n "$CLAUDE_PLUGIN_ROOT" ]; then
  PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT"
else
  # Fallback: try to detect from script location
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

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

echo ""
echo "✨ Ready to use! Run /agents to see available agents."

exit 0
