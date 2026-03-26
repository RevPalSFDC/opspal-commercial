# Automatic Routing Setup

This guide covers the current OpsPal routing path. The legacy prompt-router
hook has been removed. Routing is handled by `hooks/unified-router.sh`.

## What Changes at Runtime

- `UserPromptSubmit` remains guidance-oriented for normal routing flows.
- Execution-time specialist enforcement is driven by explicit routing-state fields:
  - `route_kind`
  - `guidance_action`
  - `required_agent`
  - `prompt_blocked`
  - `execution_block_until_cleared`
  - `clearance_status`
- Routing must not depend on legacy aliases such as `blocked`, `action`, or `recommended_agent`.

## Quick Start

1. Configure the hook in `.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": {
      "command": "bash .claude-plugins/opspal-core/hooks/unified-router.sh",
      "timeout": 10000,
      "description": "OpsPal unified routing hook"
    }
  }
}
```

2. Verify the hook exists and is executable:

```bash
test -x .claude-plugins/opspal-core/hooks/unified-router.sh
```

3. Run the routing health check:

```bash
.claude-plugins/opspal-core/scripts/routing-health-check.sh
```

## Environment Flags

```bash
export ENABLE_AUTO_ROUTING=1
export ROUTING_CONFIDENCE_THRESHOLD=0.7
export COMPLEXITY_THRESHOLD=0.7
export ROUTING_VERBOSE=1
```

## Validation

Run both validators after routing changes:

```bash
node plugins/opspal-core/scripts/lib/validate-routing-integrity.js
node plugins/opspal-core/scripts/lib/validate-routing-state-semantics.js
```

Strict CI validation is available here:

```bash
bash plugins/opspal-core/scripts/ci/validate-routing.sh --strict
```

## Troubleshooting

If routing looks stale or inconsistent:

```bash
tail -f ~/.claude/logs/routing-decisions.jsonl
tail -f ~/.claude/logs/routing.jsonl
```

If a route is execution-gated, inspect the explicit session state:

```bash
node plugins/opspal-core/scripts/lib/routing-state-manager.js check <session-key>
```

Expected state should use explicit semantics only. If you see legacy aliases in active files or tooling, migrate that consumer before removing any remaining historical log shims.
