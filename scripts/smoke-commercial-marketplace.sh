#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/opspal-commercial-smoke.XXXXXX")"
HOME_DIR="$TMP_ROOT/home"
MARKETPLACE_ROOT="$HOME_DIR/.claude/plugins/marketplaces/opspal-commercial"

cleanup() {
  rm -rf "$TMP_ROOT"
}

trap cleanup EXIT

mkdir -p "$MARKETPLACE_ROOT"

if command -v rsync >/dev/null 2>&1; then
  rsync -a --exclude='.git' --exclude='node_modules' "$REPO_ROOT"/ "$MARKETPLACE_ROOT"/
else
  cp -R "$REPO_ROOT"/. "$MARKETPLACE_ROOT"/
  rm -rf "$MARKETPLACE_ROOT/.git" "$MARKETPLACE_ROOT/node_modules"
fi

export HOME="$HOME_DIR"

echo "Verifying generated commercial catalog artifacts..."
node "$MARKETPLACE_ROOT/scripts/generate-plugin-suite-docs.js" --check

echo "Verifying marketplace manifest shape..."
node -e "const fs=require('fs'); const manifest=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if (manifest.name !== 'opspal-commercial') throw new Error('Unexpected marketplace name'); if (!Array.isArray(manifest.plugins) || manifest.plugins.length === 0) throw new Error('Marketplace manifest must contain plugins');" \
  "$MARKETPLACE_ROOT/.claude-plugin/marketplace.json"

echo "Running CLAUDE sync dry-run from clean commercial marketplace path..."
node "$MARKETPLACE_ROOT/plugins/opspal-core/scripts/lib/sync-claudemd.js" \
  --project-dir="$MARKETPLACE_ROOT" \
  --dry-run >/dev/null

echo "Running updater dry-run from clean commercial marketplace path..."
(cd "$MARKETPLACE_ROOT" && bash plugins/opspal-core/scripts/opspal-update-manager.sh --dry-run --only opspal-core --skip-confirm >/dev/null)

echo "Commercial marketplace smoke checks passed."
