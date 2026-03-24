#!/usr/bin/env bash
#
# Post-Plugin-Update Customizations Hook
#
# Runs after plugin updates to execute pending customization migrations
# and ensure customer data integrity.
#
# Trigger: PostToolUse on plugin install/update events
# Behavior: Non-blocking — logs results, never fails the update
#
# Version: 1.0.0
# Date: 2026-03-23
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Plugin root detection
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
    PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
else
    PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

MIGRATION_SCRIPT="$PLUGIN_ROOT/scripts/lib/customization/migration-runner.js"

# Only run if the migration runner exists
if [ ! -f "$MIGRATION_SCRIPT" ]; then
    exit 0
fi

# Only run if node is available
if ! command -v node &>/dev/null; then
    echo "[customization-update] Warning: node not available, skipping migrations" >&2
    exit 0
fi

# Run migrations (non-blocking — catch errors)
if node -e "
const { MigrationRunner } = require('$MIGRATION_SCRIPT'.replace(/\.js$/, ''));
const { ResourceRegistry } = require('$PLUGIN_ROOT/scripts/lib/customization/resource-registry');
const { CustomResourceStore } = require('$PLUGIN_ROOT/scripts/lib/customization/custom-resource-store');
const { BackupRestore } = require('$PLUGIN_ROOT/scripts/lib/customization/backup-restore');
const { CustomizationAuditLog } = require('$PLUGIN_ROOT/scripts/lib/customization/customization-audit-log');

(async () => {
    const registry = new ResourceRegistry({ pluginRoot: '$PLUGIN_ROOT' });
    await registry.load();
    const store = new CustomResourceStore();
    const backup = new BackupRestore({ store });
    const auditLog = new CustomizationAuditLog();
    const runner = new MigrationRunner({ registry, store, backup, auditLog, pluginRoot: '$PLUGIN_ROOT' });
    const results = await runner.runAll();
    const completed = results.filter(r => r.status === 'completed');
    if (completed.length > 0) {
        console.error('[customization-update] Migrations completed: ' + completed.map(r => r.id).join(', '));
    }
})().catch(err => {
    console.error('[customization-update] Migration warning: ' + err.message);
});
" 2>&1; then
    :
else
    echo "[customization-update] Warning: migrations encountered an issue (non-blocking)" >&2
fi

exit 0
