# Tier Restriction Enforcement

Primary source: `hooks/pre-tool-use.sh`.

## Agent Tier Model

Tiers are defined in `config/agent-permission-matrix.json`. Each agent has an integer tier that controls which tools it may use and which operations require escalation.

| Tier | Label | Allowed Operations | Examples |
|------|-------|--------------------|----------|
| 1 | Read-only | SELECT, DESCRIBE, LIST | `sfdc-state-discovery`, `sfdc-query-specialist` |
| 2 | Standard | + INSERT, UPDATE, metadata reads | `sfdc-metadata-manager`, `sfdc-automation-builder` |
| 3 | Elevated | + DEPLOY, permission changes | `sfdc-deployment-manager`, `sfdc-permission-orchestrator` |
| 4 | Privileged | + DELETE, schema changes | `sfdc-data-operations` (destructive mode) |
| 5 | Administrative | All operations | `sfdc-orchestrator` with governance |

## Per-Agent Disallowed Tool List

```json
{
  "agents": {
    "sfdc-query-specialist": {
      "tier": 1,
      "disallowedTools": ["Write", "Edit"],
      "disallowedCommands": ["sf data delete", "sf data update", "sf project deploy"]
    },
    "sfdc-deployment-manager": {
      "tier": 3,
      "disallowedTools": [],
      "disallowedCommands": ["sf data delete", "sf data update --sobject Account --where \"Id != null\""]
    }
  }
}
```

## Enforcement Pattern in `pre-tool-use.sh`

```bash
AGENT_TIER=$(jq -r ".agents[\"$AGENT_NAME\"].tier // 0" "$PERMISSION_MATRIX")
DISALLOWED=$(jq -r ".agents[\"$AGENT_NAME\"].disallowedCommands[]?" "$PERMISSION_MATRIX")

for pattern in $DISALLOWED; do
  if echo "$COMMAND" | grep -qF "$pattern"; then
    echo "❌ Agent $AGENT_NAME (Tier $AGENT_TIER) is not permitted to run: $pattern"
    echo "   Use a higher-tier agent or escalate through sfdc-orchestrator."
    exit 1
  fi
done
```

## Actionable Alternatives on Block

When blocking a tool call, always surface what the user should do instead:

```bash
if [[ "$BLOCKED" == "true" ]]; then
  cat <<EOF
❌ TOOL RESTRICTION: $AGENT_NAME cannot run this operation.

  Command blocked: $COMMAND
  Agent tier: $AGENT_TIER (requires tier 4+)

  To proceed:
  1. Use sfdc-data-operations (Tier 4) for this operation.
  2. Or escalate through sfdc-orchestrator which will coordinate governance.
  3. Emergency override: export AGENT_GOVERNANCE_OVERRIDE=true (requires OVERRIDE_REASON)
EOF
  exit 1
fi
```

## Consistent Violation Message Format

Violation messages must include: agent name, tier, blocked command, and recommended alternative. This ensures the audit log is actionable.

```jsonl
{"ts":"2026-04-12T14:30:00Z","event":"tier_violation","agent":"sfdc-query-specialist","tier":1,"blocked_command":"sf data delete","recommended":"sfdc-data-operations","org":"acme-prod"}
```

## Environment-Specific Restrictions

Tiers may be further restricted per environment. A Tier 3 agent allowed to deploy to sandbox may be blocked from deploying to production:

```bash
if [[ "$ENVIRONMENT" == "production" ]] && [[ "$AGENT_TIER" -lt 4 ]]; then
  echo "⚠️  Production deployments require Tier 4+ agent. Current: $AGENT_NAME (Tier $AGENT_TIER)"
  exit 1
fi
```
