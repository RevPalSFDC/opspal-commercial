#!/usr/bin/env bash
#
# sync-desktop-mirror.sh - Sync opspal-commercial to the Desktop private mirror
#
# Pushes the current state of main (excluding .enc files) to
# RevPalSFDC/opspal-claude-desktop-int using an orphan commit.
# The repos have divergent histories so every sync is a force-push.
#
# Usage: bash scripts/sync-desktop-mirror.sh
#
# What gets excluded:
#   - *.enc files (proprietary encrypted assets — require license to decrypt)

set -euo pipefail

MIRROR_REMOTE="git@github.com:RevPalSFDC/opspal-claude-desktop-int.git"
BRANCH="main"
ORIGINAL_BRANCH="$(git branch --show-current)"
ORIGINAL_HEAD="$(git log "$BRANCH" -1 --format=%h 2>/dev/null || echo 'unknown')"

echo "Syncing to Desktop mirror: $MIRROR_REMOTE"
echo "  Source: opspal-commercial @ $ORIGINAL_HEAD"
echo "  Excluding: *.enc files"

# Create orphan branch with current state
git checkout --orphan _desktop-sync-tmp 2>/dev/null || {
  git branch -D _desktop-sync-tmp 2>/dev/null || true
  git checkout --orphan _desktop-sync-tmp
}

# Stage everything EXCEPT .enc files
git add -A

# Unstage .enc files
ENC_COUNT=$(git diff --cached --name-only | grep '\.enc$' | wc -l)
if [ "$ENC_COUNT" -gt 0 ]; then
  git diff --cached --name-only | grep '\.enc$' | xargs git reset HEAD -- 2>/dev/null || true
  echo "  Excluded $ENC_COUNT encrypted asset(s)"
fi

git commit -m "Mirror sync: $(date -u +%Y-%m-%dT%H:%M:%SZ) from opspal-commercial $ORIGINAL_HEAD (enc-stripped)" --no-verify --quiet

# Push to mirror (force since histories always diverge)
if git push "$MIRROR_REMOTE" "_desktop-sync-tmp:$BRANCH" --force --no-verify 2>&1; then
  echo "Desktop mirror synced successfully"
else
  echo "Warning: Desktop mirror sync failed (non-blocking)" >&2
fi

# Clean up — return to original branch
# --force is required because .enc files were unstaged on the orphan branch
# and would otherwise conflict with tracked .enc files on main
git checkout "$ORIGINAL_BRANCH" --force 2>/dev/null || git checkout "$BRANCH" --force
git branch -D _desktop-sync-tmp 2>/dev/null || true
