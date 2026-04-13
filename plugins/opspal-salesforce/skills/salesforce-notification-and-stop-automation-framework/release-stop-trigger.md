# Release Stop Trigger

Primary source: `hooks/stop/release-coordination-trigger.json`.

## What This Trigger Detects

The release-coordination-trigger fires when the conversation shows signals that a production deployment or cross-platform release is imminent. It suggests invoking the `release-coordinator` agent to run a full release workflow.

## Trigger Conditions

| Condition | Signal Evidence |
|-----------|----------------|
| Git merge to main | `git merge`, `git push origin main`, merge commit |
| Production deployment intent | "deploy to production", "prod deployment", "release to prod" |
| Release tag creation | `git tag v*`, "create release", "tag this version" |
| Multi-platform changes | Modifications to both opspal-salesforce and opspal-hubspot |
| Breaking changes | "breaking change", "major version", "BREAKING:" in message |
| Post-merge checklist request | "what's next after merge", "release checklist" |

## Non-Trigger Conditions

Must NOT trigger for:
- Feature branch merges (not to main/master).
- Sandbox or scratch org deployments.
- Development/staging environments.
- Documentation-only changes.
- Work-in-progress commits.

## Hard Abort vs Graceful Halt

The release trigger is **suggestion-only** (`suggestOnlyDontBlock: true`). It does not block any tool call.

For a freeze window that requires hard abort (blocking deploys during a freeze), use a PreToolUse hook instead:

```bash
# hooks/pre-deploy-freeze-check.sh
FREEZE_FLAG="${HOME}/.claude/kill-switches/deploy-freeze.flag"

if [[ -f "$FREEZE_FLAG" ]]; then
  FREEZE_MESSAGE=$(cat "$FREEZE_FLAG" 2>/dev/null || echo "Deploy freeze active")
  echo "❌ DEPLOY BLOCKED: $FREEZE_MESSAGE"
  echo "   Remove ${FREEZE_FLAG} to resume deployments."
  exit 1
fi
```

Set the freeze:
```bash
echo "Freeze active until 2026-04-15T18:00:00Z — scheduled maintenance window" \
  > "${HOME}/.claude/kill-switches/deploy-freeze.flag"
```

Remove the freeze:
```bash
rm "${HOME}/.claude/kill-switches/deploy-freeze.flag"
```

## Kill Switch via Environment Variable (Immediate Toggle)

```bash
# Bypass all deployment hooks for emergency hotfix
export SKIP_DEPLOY_HOOKS=1

# Or bypass specifically the release coordinator trigger
export RELEASE_COORDINATOR_TRIGGER_ENABLED=false
```

## Kill Switch via Custom Metadata (Org-Level)

For team-wide freezes, store the kill switch in Salesforce Custom Metadata:

```bash
# Query the kill switch from the org
FREEZE_STATUS=$(sf data query \
  --query "SELECT Value__c FROM OpsPal_Config__mdt WHERE Key__c = 'DeployFreeze' LIMIT 1" \
  --target-org "$SF_TARGET_ORG" \
  --json 2>/dev/null | jq -r '.result.records[0].Value__c // "false"')

if [[ "$FREEZE_STATUS" == "true" ]]; then
  echo "❌ DEPLOY BLOCKED: DeployFreeze Custom Metadata is active"
  exit 1
fi
```

## Release Coordinator Invocation

When the trigger fires, it suggests:
```
The release-coordinator will:
- Validate release readiness (tests, linting, documentation)
- Execute release workflow (tagging, notifications, deployments)
- Coordinate cross-platform updates if needed
- Send Slack notifications to stakeholders
```

The `agentToInvoke: "release-coordinator"` field causes Claude Code to offer a one-click invocation.

## Slack Alert Integration

The `hooks/notification/` pattern can send a Slack webhook on release trigger detection:

```bash
# In a custom post-tool hook
send_slack_alert() {
  local webhook_url="${SLACK_DEPLOY_WEBHOOK:-}"
  local message="$1"
  if [[ -z "$webhook_url" ]]; then return; fi

  curl -s -X POST "$webhook_url" \
    -H 'Content-type: application/json' \
    --data "{\"text\": \"$message\"}" >/dev/null 2>&1 || true
}

send_slack_alert "Production deployment initiated by ${USER:-unknown} targeting ${SF_TARGET_ORG}"
```

Keep curl non-blocking: redirect output to `/dev/null` and use `|| true` to prevent hook failure on network error.
