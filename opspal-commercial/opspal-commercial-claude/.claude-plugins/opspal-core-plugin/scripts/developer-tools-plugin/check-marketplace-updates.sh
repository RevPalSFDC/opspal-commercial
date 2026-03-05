#!/bin/bash
# SessionStart Hook: Check for OpsPal Plugin Marketplace Updates
# Fast, non-blocking update check that notifies users of available plugin updates

set -e

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
MARKETPLACE_ROOT="$(cd "$PLUGIN_ROOT/../.." && pwd)"
CATALOG_FILE="$MARKETPLACE_ROOT/.claude-plugin/marketplace.json"
GITHUB_REPO="RevPalSFDC/opspal-plugin-internal-marketplace"
CACHE_FILE="/tmp/opspal-marketplace-update-check-$(id -u).cache"
CACHE_TTL=3600  # 1 hour cache

# Exit silently if not in a git repository
if ! git -C "$MARKETPLACE_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    exit 0
fi

# Check cache to avoid frequent GitHub API calls
if [ -f "$CACHE_FILE" ]; then
    CACHE_AGE=$(($(date +%s) - $(stat -c %Y "$CACHE_FILE" 2>/dev/null || echo 0)))
    if [ "$CACHE_AGE" -lt "$CACHE_TTL" ]; then
        # Cache is fresh, exit silently
        exit 0
    fi
fi

# Fetch latest from remote quietly (don't merge)
git -C "$MARKETPLACE_ROOT" fetch origin --quiet 2>/dev/null || {
    # Network error or not authenticated - exit silently
    exit 0
}

# Check if marketplace catalog has updates
LOCAL_CATALOG_HASH=$(git -C "$MARKETPLACE_ROOT" rev-parse HEAD:.claude-plugin/marketplace.json 2>/dev/null || echo "none")
REMOTE_CATALOG_HASH=$(git -C "$MARKETPLACE_ROOT" rev-parse origin/main:.claude-plugin/marketplace.json 2>/dev/null || echo "none")

if [ "$LOCAL_CATALOG_HASH" = "$REMOTE_CATALOG_HASH" ]; then
    # No updates, update cache and exit silently
    touch "$CACHE_FILE"
    exit 0
fi

# Updates available - parse marketplace.json to find which plugins
UPDATES_AVAILABLE=""
PLUGIN_COUNT=0

# Read marketplace.json and compare versions
if [ -f "$CATALOG_FILE" ] && command -v jq >/dev/null 2>&1; then
    # Get list of plugins from marketplace.json
    PLUGINS=$(jq -r '.plugins[]? | @json' "$CATALOG_FILE" 2>/dev/null || echo "")

    if [ -n "$PLUGINS" ]; then
        while IFS= read -r plugin_json; do
            PLUGIN_NAME=$(echo "$plugin_json" | jq -r '.name')
            LOCAL_VERSION=$(echo "$plugin_json" | jq -r '.version')
            PLUGIN_DIR="$MARKETPLACE_ROOT/.claude-plugins/$PLUGIN_NAME"

            # Check if plugin is installed
            if [ -d "$PLUGIN_DIR" ]; then
                # Get remote version by fetching plugin.json from origin/main
                REMOTE_VERSION=$(git -C "$MARKETPLACE_ROOT" show "origin/main:.claude-plugins/$PLUGIN_NAME/.claude-plugin/plugin.json" 2>/dev/null | jq -r '.version' 2>/dev/null || echo "$LOCAL_VERSION")

                if [ "$LOCAL_VERSION" != "$REMOTE_VERSION" ] && [ -n "$REMOTE_VERSION" ]; then
                    UPDATES_AVAILABLE="$UPDATES_AVAILABLE  • $PLUGIN_NAME: v$LOCAL_VERSION → v$REMOTE_VERSION\n"
                    PLUGIN_COUNT=$((PLUGIN_COUNT + 1))
                fi
            fi
        done <<< "$PLUGINS"
    fi
fi

# If updates available, display notification
if [ $PLUGIN_COUNT -gt 0 ]; then
    echo ""
    echo "⚠️  Plugin updates available:"
    echo -e "$UPDATES_AVAILABLE"
    echo "Run: cd $MARKETPLACE_ROOT && git pull origin main"
    echo ""

    # Show recent changes if git log is available
    RECENT_CHANGES=$(git -C "$MARKETPLACE_ROOT" log HEAD..origin/main --oneline --no-decorate 2>/dev/null | head -5)
    if [ -n "$RECENT_CHANGES" ]; then
        echo "Recent changes:"
        echo "$RECENT_CHANGES"
        echo ""
    fi

    # Don't cache when updates are available (check again next session)
    rm -f "$CACHE_FILE" 2>/dev/null
else
    # No plugin updates, update cache
    touch "$CACHE_FILE"
fi

exit 0
