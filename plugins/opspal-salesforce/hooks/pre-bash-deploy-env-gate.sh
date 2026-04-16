#!/usr/bin/env bash
#
# PreToolUse guardrail that blocks cross-environment Salesforce deploys that
# were not explicitly authorized for production by the user in this turn.
#
# Triggers when a Bash command contains `sf project deploy start|validate` AND
# specifies `--target-org <alias>` whose name matches a production pattern,
# while the session's org-context (cwd or env) points at a sandbox.
#
# This is a defense-in-depth complement to the `pre-task-agent-validator` and
# the handoff classifier — both of which already catch some of this — because
# those fire on agent boundaries, not on the actual Bash command.
#
# Escape hatch: `SKIP_CROSS_ENV_GATE=1 sf project deploy start …` (or export in
# the session). Use when the user has explicitly authorized a cross-env promo.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"

if ! command -v jq &>/dev/null; then
  printf '{}\n'
  exit 0
fi

HOOK_INPUT="$(cat 2>/dev/null || true)"
COMMAND="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")"

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Fast-exit when not a deploy scope command.
if ! printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])((sf|sfdx)[[:space:]]+project[[:space:]]+deploy[[:space:]]+(start|validate|preview)|sfdx[[:space:]]+force:source:deploy)([[:space:]]|$)'; then
  exit 0
fi

# Fast-exit when user bypassed in-command or via env.
if [ "${SKIP_CROSS_ENV_GATE:-0}" = "1" ]; then
  exit 0
fi
if printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])SKIP_CROSS_ENV_GATE=1[[:space:]]'; then
  exit 0
fi

emit_deny() {
  local reason="$1"
  jq -nc \
    --arg reason "$reason" \
    '{
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: $reason
      }
    }'
}

# Extract --target-org alias from the command. Accept `--target-org x`,
# `--target-org=x`, and short `-o x`.
TARGET_ALIAS=""
if printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])--target-org([[:space:]=]+)[^[:space:]]+'; then
  TARGET_ALIAS="$(printf '%s' "$COMMAND" | sed -nE 's/.*--target-org[[:space:]=]+([^[:space:]]+).*/\1/p' | head -1)"
elif printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])-o[[:space:]]+[^[:space:]]+'; then
  TARGET_ALIAS="$(printf '%s' "$COMMAND" | sed -nE 's/.*-o[[:space:]]+([^[:space:]]+).*/\1/p' | head -1)"
fi

# No alias resolved — let the deploy proceed; other hooks will catch missing target.
if [ -z "$TARGET_ALIAS" ]; then
  exit 0
fi

# Production-alias patterns. Case-insensitive.
is_production_alias() {
  local alias_lc
  alias_lc="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$alias_lc" in
    *-prod|*-production|*_prod|*_production|prod|production)
      return 0
      ;;
    prod-*|production-*)
      return 0
      ;;
  esac
  return 1
}

is_sandbox_alias() {
  local alias_lc
  alias_lc="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$alias_lc" in
    *-sandbox|*-staging|*-stg|*-dev|*-qa|*-uat|*-test|*_sandbox|*_staging|*_stg|*_dev|*_qa|*_uat|*_test)
      return 0
      ;;
    sandbox|staging|dev|qa|uat|test)
      return 0
      ;;
  esac
  return 1
}

if ! is_production_alias "$TARGET_ALIAS"; then
  # Target isn't production-patterned — not this hook's concern.
  exit 0
fi

# Target IS production-patterned. Determine whether the session looks like it
# came from a sandbox. We consider three signals:
#   (a) cwd contains a sandbox-patterned segment (e.g. /orgs/foo-sandbox/)
#   (b) $SF_TARGET_ORG is set and is sandbox-patterned
#   (c) previously authorized production env flag is set for this turn
#
# If any sandbox signal is present AND no explicit production-intent flag is
# present, deny.

SANDBOX_SIGNAL=""

if printf '%s' "$PWD" | grep -qE '/[^/]*-(sandbox|staging|stg|dev|qa|uat|test)(/|$)'; then
  SANDBOX_SIGNAL="cwd"
elif [ -n "${SF_TARGET_ORG:-}" ] && is_sandbox_alias "$SF_TARGET_ORG"; then
  SANDBOX_SIGNAL="SF_TARGET_ORG=$SF_TARGET_ORG"
elif [ -n "${ORG_SLUG:-}" ] && is_sandbox_alias "$ORG_SLUG"; then
  SANDBOX_SIGNAL="ORG_SLUG=$ORG_SLUG"
fi

if [ -z "$SANDBOX_SIGNAL" ]; then
  # No sandbox context detected — user likely started in production-context,
  # which is a legitimate (though still risky) mode. Allow.
  exit 0
fi

# Explicit production-intent flag set this turn. Allow.
if [ "${ALLOW_CROSS_ENV_DEPLOY:-0}" = "1" ]; then
  exit 0
fi

REASON=$(cat <<EOF
CROSS_ENV_DEPLOY_BLOCKED: The command targets the production-patterned org '${TARGET_ALIAS}' but the session context is sandbox (${SANDBOX_SIGNAL}).

Cross-environment deploys must be explicitly authorized by the user in the current turn — an agent should not infer production intent from a staging success.

To proceed:
  (1) Ask the user to confirm the production target, THEN
  (2) Set ALLOW_CROSS_ENV_DEPLOY=1 on this specific invocation, OR
  (3) Prefix the command with SKIP_CROSS_ENV_GATE=1 to bypass entirely (not recommended).

Example of authorized invocation:
  ALLOW_CROSS_ENV_DEPLOY=1 sf project deploy start --target-org ${TARGET_ALIAS} --source-dir …
EOF
)

emit_deny "$REASON"
exit 0
