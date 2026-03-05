#!/bin/bash

#
# Post-Plugin-Update Hook
#
# Purpose: Automatically run plugin-doctor health check after plugin installations/updates
# Trigger: After /plugin install or /plugin update commands
# Location: .claude-plugins/opspal-core/hooks/post-plugin-update.sh
#
# Features:
# - Quick health check (< 2 seconds)
# - Auto-submits reflection if infrastructure issues found
# - Silent mode for non-critical issues
# - Can be disabled via environment variable
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="post-plugin-update"
    # Lenient mode - health checks should not block updates
    set_lenient_mode 2>/dev/null || true
fi

# Check if hook is enabled (default: enabled)
if [ "${ENABLE_POST_PLUGIN_CHECK}" = "0" ]; then
  exit 0
fi

# Get plugin name from environment or command arguments
PLUGIN_NAME="${PLUGIN_NAME:-$1}"

# Determine plugin directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_ROOT="$(cd "$PLUGIN_ROOT/.." && pwd)"

# Path to plugin-health-checker script
HEALTH_CHECKER="$PLUGIN_ROOT/opspal-core/scripts/lib/plugin-health-checker.js"

# Check if plugin-health-checker exists
if [ ! -f "$HEALTH_CHECKER" ]; then
  # Silent failure - plugin-doctor not installed yet
  exit 0
fi

# Determine which plugin was updated
if [ -n "$PLUGIN_NAME" ]; then
  # Specific plugin updated
  echo ""
  echo "🔍 Running post-install health check for $PLUGIN_NAME..."
  echo ""

  # Run quick health check for specific plugin
  if node "$HEALTH_CHECKER" --plugin "$PLUGIN_NAME" --json > "${TMPDIR:-/tmp}/plugin-health-check.json" 2>&1; then
    # Health check passed
    ISSUES=$(node -e "const data = require('${TMPDIR:-/tmp}/plugin-health-check.json'); console.log(data.summary.totalErrors + data.summary.totalWarnings);")

    if [ "$ISSUES" = "0" ]; then
      echo "✅ Plugin health check passed - no issues found"
    else
      echo "⚠️  Plugin health check found $ISSUES issue(s)"
      echo "   Run /plugindr for details"
    fi
  else
    # Health check failed or found critical issues
    echo "⚠️  Plugin health check detected issues"
    echo "   Run /plugindr for full diagnostic report"

    # If critical infrastructure issues, plugin-doctor will auto-submit reflection
    # We don't need to do anything here
  fi

  # Clean up temp file
  rm -f "${TMPDIR:-/tmp}/plugin-health-check.json"

else
  # No specific plugin - run full health check
  echo ""
  echo "🔍 Running post-update system health check..."
  echo ""

  # Run quick health check for all plugins
  if node "$HEALTH_CHECKER" --json > "${TMPDIR:-/tmp}/plugin-health-check.json" 2>&1; then
    # Parse results
    HEALTHY=$(node -e "const data = require('${TMPDIR:-/tmp}/plugin-health-check.json'); console.log(data.healthy.join(', '));")
    ERRORS=$(node -e "const data = require('${TMPDIR:-/tmp}/plugin-health-check.json'); console.log(data.summary.totalErrors);")
    WARNINGS=$(node -e "const data = require('${TMPDIR:-/tmp}/plugin-health-check.json'); console.log(data.summary.totalWarnings);")

    if [ "$ERRORS" = "0" ] && [ "$WARNINGS" = "0" ]; then
      echo "✅ All plugins healthy"
    elif [ "$ERRORS" = "0" ]; then
      echo "⚠️  Found $WARNINGS warning(s)"
      echo "   Run /plugindr for details"
    else
      echo "❌ Found $ERRORS error(s) and $WARNINGS warning(s)"
      echo "   Run /plugindr for full diagnostic report"
    fi
  else
    echo "⚠️  Health check detected issues"
    echo "   Run /plugindr for full diagnostic report"
  fi

  # Clean up
  rm -f "${TMPDIR:-/tmp}/plugin-health-check.json"
fi

echo ""

# Always exit successfully - we don't want to block plugin installation
exit 0
