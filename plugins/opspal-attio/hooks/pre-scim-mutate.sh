#!/usr/bin/env bash
# hooks/pre-scim-mutate.sh
# PreToolUse: mcp__attio__scim_users_delete
# Warns before enterprise SCIM user deprovisioning.
# Attio suspends members — never deletes them — so the risk is suspension, not data loss.
# Per routing policy, permissionDecision is always "allow" (advisory only).

exec 3>&1 1>&2

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ERROR_HANDLER="$(cd "$HOOK_DIR/../scripts/lib" && pwd)/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
  source "$ERROR_HANDLER"
fi

# Parse tool input from stdin
INPUT="$(cat)"

# Extract user ID from tool input
USER_ID="$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    inp = data.get('tool_input', data)
    print(inp.get('user_id', inp.get('id', inp.get('userId', 'UNKNOWN'))))
except Exception:
    print('UNKNOWN')
" 2>/dev/null || echo 'UNKNOWN')"

# Emit advisory warning to fd3
cat >&3 <<EOF
{
  "permissionDecision": "allow",
  "additionalContext": "⚠️ SCIM DEPROVISIONING: Removing user [${USER_ID}] via SCIM. The user will be suspended in the workspace (not deleted — members are never deleted in Attio). Their records, notes, and tasks remain intact and are reassignable. Verify this is intentional and that the IdP deprovisioning event is expected before proceeding."
}
EOF
