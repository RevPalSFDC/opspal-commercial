#!/usr/bin/env bash
# hooks/post-migration-checkpoint.sh
# PostToolUse: mcp__attio__records_upsert
# Tracks migration loop progress when an active migration is in progress.
# Reads /tmp/attio-active-migration.json and emits progress context.

exec 3>&1 1>&2

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ERROR_HANDLER="$(cd "$HOOK_DIR/../scripts/lib" && pwd)/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
  source "$ERROR_HANDLER"
fi

MIGRATION_FILE="/tmp/attio-active-migration.json"

# If no active migration, emit empty context and exit
if [[ ! -f "$MIGRATION_FILE" ]]; then
  echo '{}' >&3
  exit 0
fi

# Increment completed count and compute percentage
UPDATED="$(python3 -c "
import json, sys

try:
    with open('$MIGRATION_FILE', 'r') as f:
        state = json.load(f)

    completed = state.get('completed', 0) + 1
    total = state.get('total', 0)
    migration_id = state.get('migration_id', 'unknown')
    object_slug = state.get('object_slug', 'records')

    state['completed'] = completed

    with open('$MIGRATION_FILE', 'w') as f:
        json.dump(state, f)

    if total > 0:
        pct = round((completed / total) * 100, 1)
    else:
        pct = 0.0

    print(json.dumps({
        'completed': completed,
        'total': total,
        'pct': pct,
        'migration_id': migration_id,
        'object_slug': object_slug
    }))
except Exception as e:
    print(json.dumps({'error': str(e)}))
" 2>/dev/null)"

ERROR="$(echo "$UPDATED" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',''))" 2>/dev/null)"

if [[ -n "$ERROR" ]]; then
  echo '{}' >&3
  exit 0
fi

COMPLETED="$(echo "$UPDATED" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('completed',0))" 2>/dev/null)"
TOTAL="$(echo "$UPDATED" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total',0))" 2>/dev/null)"
PCT="$(echo "$UPDATED" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('pct',0))" 2>/dev/null)"

cat >&3 <<EOF
{
  "additionalContext": "Migration progress: ${COMPLETED}/${TOTAL} records processed (${PCT}%)"
}
EOF
