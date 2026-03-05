#!/bin/bash
# Validate all plugin manifests in the marketplace
# Usage: ./scripts/validate-all-plugins.sh [--fix]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

echo "🔍 Validating All Plugin Manifests"
echo "Repository: $REPO_ROOT"
echo ""

# Find all plugin.json files
PLUGIN_MANIFESTS=$(find "$REPO_ROOT/.claude-plugins" -name "plugin.json" -path "*/.claude-plugin/plugin.json" 2>/dev/null)

if [ -z "$PLUGIN_MANIFESTS" ]; then
  echo "⚠️  No plugin manifests found"
  exit 1
fi

# Count plugins
PLUGIN_COUNT=$(echo "$PLUGIN_MANIFESTS" | wc -l | tr -d ' ')
echo "Found $PLUGIN_COUNT plugins to validate"
echo ""

# Track validation status
VALIDATION_FAILED=0
PASSED_PLUGINS=()
FAILED_PLUGINS=()

# Validate each plugin
while IFS= read -r manifest; do
  PLUGIN_NAME=$(basename "$(dirname "$(dirname "$manifest")")")

  echo "=== $PLUGIN_NAME ==="

  # Extract basic info
  VERSION=$(jq -r '.version' "$manifest" 2>/dev/null || echo "unknown")
  DESCRIPTION=$(jq -r '.description' "$manifest" 2>/dev/null || echo "N/A")

  echo "  Version: $VERSION"
  echo "  Path: $manifest"

  # Run validation
  VALIDATION_OUTPUT=$(claude plugin validate "$manifest" 2>&1)

  if echo "$VALIDATION_OUTPUT" | grep -q "✔ Validation passed"; then
    echo "  ✓ Passed"
    PASSED_PLUGINS+=("$PLUGIN_NAME")
  else
    echo "  ✗ FAILED"
    echo "$VALIDATION_OUTPUT" | sed 's/^/    /'
    VALIDATION_FAILED=1
    FAILED_PLUGINS+=("$PLUGIN_NAME")
  fi

  echo ""
done <<< "$PLUGIN_MANIFESTS"

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "VALIDATION SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Total plugins: $PLUGIN_COUNT"
echo "Passed: ${#PASSED_PLUGINS[@]}"
echo "Failed: ${#FAILED_PLUGINS[@]}"
echo ""

if [ $VALIDATION_FAILED -eq 1 ]; then
  echo "❌ VALIDATION FAILED"
  echo ""
  echo "Failed plugins:"
  for plugin in "${FAILED_PLUGINS[@]}"; do
    echo "  - $plugin"
  done
  echo ""
  echo "Run 'claude plugin validate <path>' on each failed plugin to see detailed errors."
  exit 1
fi

echo "✅ ALL PLUGINS VALIDATED SUCCESSFULLY"
exit 0
