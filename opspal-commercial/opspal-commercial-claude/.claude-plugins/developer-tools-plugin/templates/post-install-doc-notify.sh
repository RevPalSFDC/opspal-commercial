#!/bin/bash
# Post-install hook for plugin documentation notifications
# Notifies users when plugin documentation has been updated

set -e

PLUGIN_NAME="{PLUGIN_NAME}"
PLUGIN_VERSION="{PLUGIN_VERSION}"
DOC_VERSION_FILE="$HOME/.claude/plugins/$PLUGIN_NAME/doc-version"
USAGE_FILE=".claude-plugins/$PLUGIN_NAME/.claude-plugin/USAGE.md"
CHANGELOG_FILE=".claude-plugins/$PLUGIN_NAME/CHANGELOG.md"

# Create doc version directory if it doesn't exist
mkdir -p "$(dirname "$DOC_VERSION_FILE")"

# Check if this is a fresh install or an update
if [ ! -f "$DOC_VERSION_FILE" ]; then
  # Fresh install
  echo "✅ $PLUGIN_NAME v$PLUGIN_VERSION installed"
  echo ""
  echo "📚 Documentation available:"
  echo "   - Usage Guide: $USAGE_FILE"
  echo "   - Changelog: $CHANGELOG_FILE"
  echo ""
  echo "💡 Quick start:"
  echo "   /agents | grep {PLUGIN_PREFIX}  # View available agents"
  echo "   cat $USAGE_FILE  # Read usage guide"
  echo ""

  # Save version for future checks
  echo "$PLUGIN_VERSION" > "$DOC_VERSION_FILE"

else
  # Update - check if documentation changed
  LAST_DOC_VERSION=$(cat "$DOC_VERSION_FILE")

  if [ "$LAST_DOC_VERSION" != "$PLUGIN_VERSION" ]; then
    echo "🔄 $PLUGIN_NAME updated: v$LAST_DOC_VERSION → v$PLUGIN_VERSION"
    echo ""
    echo "📚 Documentation updated! Key changes:"
    echo ""

    # Extract "What's New" from CHANGELOG
    if [ -f "$CHANGELOG_FILE" ]; then
      # Show recent version entries (top 10 lines after first version header)
      awk "/## \[$PLUGIN_VERSION\]/,/## \[/" "$CHANGELOG_FILE" | head -15 | grep -v "^## \[" || echo "   See $CHANGELOG_FILE for details"
    else
      echo "   See $USAGE_FILE for updated documentation"
    fi

    echo ""
    echo "💡 Review full changelog:"
    echo "   cat $CHANGELOG_FILE"
    echo ""
    echo "💡 View usage guide:"
    echo "   cat $USAGE_FILE"
    echo ""

    # Save new version
    echo "$PLUGIN_VERSION" > "$DOC_VERSION_FILE"
  else
    # Reinstall of same version
    echo "✅ $PLUGIN_NAME v$PLUGIN_VERSION reinstalled"
  fi
fi

# Check for deprecated features (optional)
if [ -f "$CHANGELOG_FILE" ]; then
  DEPRECATED=$(grep -A 5 "^### Deprecated" "$CHANGELOG_FILE" | grep "^-" | head -3 || true)
  if [ -n "$DEPRECATED" ]; then
    echo ""
    echo "⚠️  Deprecation notices:"
    echo "$DEPRECATED"
    echo ""
    echo "See $CHANGELOG_FILE for migration timeline"
  fi
fi

# Check for breaking changes (optional)
if [ -f "$CHANGELOG_FILE" ]; then
  BREAKING=$(grep -i "breaking change" "$CHANGELOG_FILE" | head -3 || true)
  if [ -n "$BREAKING" ]; then
    echo ""
    echo "🚨 Breaking changes detected:"
    echo "$BREAKING"
    echo ""
    echo "Review $CHANGELOG_FILE for migration steps"
  fi
fi

echo ""
echo "✨ Ready to use! Run /agents to see available agents."

exit 0
