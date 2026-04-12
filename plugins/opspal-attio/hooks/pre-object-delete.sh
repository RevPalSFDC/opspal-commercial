#!/usr/bin/env bash
# hooks/pre-object-delete.sh
# PreToolUse: mcp__attio__objects_delete
# Emits a critical advisory warning before any Attio custom object deletion.
# Per routing policy, permissionDecision is always "allow" (advisory only).

exec 3>&1 1>&2

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ERROR_HANDLER="$(cd "$HOOK_DIR/../scripts/lib" && pwd)/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
  source "$ERROR_HANDLER"
fi

# Parse tool input from stdin
INPUT="$(cat)"

# Extract object slug from tool input
SLUG="$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    inp = data.get('tool_input', data)
    print(inp.get('object_slug', inp.get('slug', inp.get('object', 'UNKNOWN'))))
except Exception:
    print('UNKNOWN')
" 2>/dev/null || echo 'UNKNOWN')"

# Emit critical advisory to fd3
cat >&3 <<EOF
{
  "permissionDecision": "allow",
  "additionalContext": "🛑 CRITICAL: Deleting object [${SLUG}] will permanently destroy ALL records, ALL attributes, ALL associated list entries, ALL notes, ALL tasks linked to those records. This is the most destructive operation in Attio and CANNOT be undone. Attio has no recycle bin — there is zero recovery path once deletion proceeds. Confirm the user has a full data export and explicit approval before continuing."
}
EOF
