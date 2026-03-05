#!/bin/bash
# SessionStart Hook: Check for Salesforce Plugin Updates
# Detects updates for the salesforce-plugin specifically from the marketplace repository

set -e

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PLUGIN_NAME="salesforce-plugin"
MARKETPLACE_ROOT="$(cd "$PLUGIN_ROOT/.." && pwd)"
CACHE_FILE="/tmp/opspal-$PLUGIN_NAME-update-check-$(id -u).cache"
CACHE_TTL=3600  # 1 hour cache

# Exit silently if not in a git repository
if ! git -C "$MARKETPLACE_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    exit 0
fi

# Check cache to avoid frequent checks
if [ -f "$CACHE_FILE" ]; then
    CACHE_AGE=$(($(date +%s) - $(stat -c %Y "$CACHE_FILE" 2>/dev/null || echo 0)))
    if [ "$CACHE_AGE" -lt "$CACHE_TTL" ]; then
        # Cache is fresh, exit silently
        exit 0
    fi
fi

# Fetch latest from remote quietly
git -C "$MARKETPLACE_ROOT" fetch origin --quiet 2>/dev/null || {
    # Network error - exit silently
    exit 0
}

# Get current and remote versions
LOCAL_VERSION=""
REMOTE_VERSION=""

if [ -f "$PLUGIN_ROOT/.claude-plugin/plugin.json" ] && command -v jq >/dev/null 2>&1; then
    LOCAL_VERSION=$(jq -r '.version' "$PLUGIN_ROOT/.claude-plugin/plugin.json" 2>/dev/null || echo "")
    REMOTE_VERSION=$(git -C "$MARKETPLACE_ROOT" show "origin/main:.claude-plugins/$PLUGIN_NAME/.claude-plugin/plugin.json" 2>/dev/null | jq -r '.version' 2>/dev/null || echo "")
fi

# Compare versions
if [ -z "$LOCAL_VERSION" ] || [ -z "$REMOTE_VERSION" ] || [ "$LOCAL_VERSION" = "$REMOTE_VERSION" ]; then
    # No updates or unable to determine, update cache and exit silently
    touch "$CACHE_FILE"
    exit 0
fi

# Updates available - show notification
echo ""
echo "⚠️  Salesforce Plugin update available: v$LOCAL_VERSION → v$REMOTE_VERSION"
echo ""

# Show recent changes from git log
RECENT_CHANGES=$(git -C "$MARKETPLACE_ROOT" log HEAD..origin/main --oneline --no-decorate --grep="salesforce" 2>/dev/null | head -5)
if [ -z "$RECENT_CHANGES" ]; then
    # Fallback to all recent changes if no salesforce-specific commits
    RECENT_CHANGES=$(git -C "$MARKETPLACE_ROOT" log HEAD..origin/main --oneline --no-decorate -- ".claude-plugins/$PLUGIN_NAME/*" 2>/dev/null | head -5)
fi

if [ -n "$RECENT_CHANGES" ]; then
    echo "Recent changes:"
    echo "$RECENT_CHANGES"
    echo ""
fi

echo "To update: cd $MARKETPLACE_ROOT && git pull origin main"
echo ""

# Don't cache when updates are available
rm -f "$CACHE_FILE" 2>/dev/null

exit 0
