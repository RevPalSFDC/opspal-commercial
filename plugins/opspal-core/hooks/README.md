# OpsPal Core Hooks

This directory contains hooks for the OpsPal Core plugin that enhance Claude Code functionality.

## Active Hooks (Registered in settings.json)

### Master Orchestrators

| Hook | Purpose | Registered In | Status |
|------|---------|--------------|---------|
| `master-prompt-handler.sh` | Main UserPromptSubmit orchestrator - delegates to prevention system and sub-agent booster | settings.json | ✅ ACTIVE |
| `session-context-loader.sh` | SessionStart hook - loads recent session context | settings.json (chained) | ✅ ACTIVE |

### Called by Master Orchestrator

| Hook | Purpose | Called By | Status |
|------|---------|-----------|---------|
| `prevention-system-orchestrator.sh` | Routes to appropriate prevention hooks based on request type | master-prompt-handler.sh | ✅ ACTIVE |
| `subagent-utilization-booster.sh` | Enhances prompts with agent utilization guidance | master-prompt-handler.sh | ✅ ACTIVE |

### Prevention Hooks (Called by Orchestrator)

| Hook | Purpose | Exit Codes | Status |
|------|---------|------------|---------|
| `pre-task-routing-clarity.sh` | Ensures clear task routing | 0 (continue), 1 (block), 2 (warn) | ✅ ACTIVE |
| `pre-task-agent-recommendation.sh` | Suggests appropriate agents | 0 or 2 | ✅ ACTIVE |
| `pre-plan-scope-validation.sh` | Validates plan scope | 0 or 2 | ✅ ACTIVE |
| `pre-operation-env-validator.sh` | Validates environment before operations | 0, 1, or 2 | ✅ ACTIVE |
| `pre-operation-idempotency-check.sh` | Checks if operations are idempotent | 0 or 2 | ✅ ACTIVE |
| `pre-operation-snapshot.sh` | Creates snapshots before risky operations | 0 or 2 | ✅ ACTIVE |
| `pre-agent-task-decomposition.sh` | Decomposes complex tasks | 0 or 2 | ✅ ACTIVE |
| `pre-agent-performance-monitor.sh` | Monitors agent performance | 0 or 2 | ✅ ACTIVE |

### Utility Hooks

| Hook | Purpose | Status |
|------|---------|--------|
| `post-edit-verification.sh` | Verifies file edits | ✅ ACTIVE (optional) |
| `post-task-verification.sh` | Verifies task completion | ✅ ACTIVE (optional) |
| `post-tool-use.sh` | Post-tool-use verification | ✅ ACTIVE (optional) |

## Disabled Hooks (Not Used)

| Hook | Status | Reason |
|------|--------|---------|
| `user-prompt-submit.sh.disabled` | ⚠️ DISABLED | Superseded by master-prompt-handler.sh |
| `user-prompt-router.sh` | ⚠️ NOT REGISTERED | Superseded by master-prompt-handler.sh |

## Hook Architecture

```
UserPromptSubmit Flow:
master-prompt-handler.sh
├── prevention-system-orchestrator.sh
│   └── 8 prevention hooks (pre-task-*, pre-operation-*, pre-agent-*)
└── subagent-utilization-booster.sh

SessionStart Flow:
session-context-loader.sh
└── Loads recent context for working directory
```

## Configuration

Hooks are registered in `.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": {
      "command": "bash ${CLAUDE_PLUGIN_ROOT}/.claude-plugins/opspal-core/hooks/master-prompt-handler.sh"
    },
    "SessionStart": {
      "command": "bash -c '... && ${CLAUDE_PLUGIN_ROOT}/.claude-plugins/opspal-core/hooks/session-context-loader.sh'"
    }
  }
}
```

### Unified Router Adaptive Continue Mode

`unified-router.sh` now supports an adaptive fallback path for transcript-contaminated
or continuation-style prompts that can otherwise trigger false-positive complexity blocks.

- `ROUTING_ADAPTIVE_CONTINUE=0` (default): Preserve strict behavior.
- `ROUTING_ADAPTIVE_CONTINUE=1`: Soften non-mandatory high-complexity blocks for
  continuation/noisy prompts.
- `ROUTING_CONTINUE_LOW_SIGNAL_THRESHOLD=0.65`: Confidence threshold for low-signal adaptive routing.
- `ROUTING_TRANSCRIPT_NOISE_THRESHOLD=0.35`: Transcript-noise threshold used by adaptive routing.
- `USER_PROMPT_MANDATORY_HARD_BLOCKING=0` (default): Mandatory/destructive routes are
  recommendation-only at `UserPromptSubmit`.
- `USER_PROMPT_MANDATORY_HARD_BLOCKING=1`: Re-enable legacy mandatory hard-blocking at
  `UserPromptSubmit` (still requires `ENABLE_HARD_BLOCKING=1`).

### Routing Execution Gate

OpsPal now enforces specialist routing with a two-step model:

- `UserPromptSubmit` writes session-scoped routing state for blocking, mandatory, and medium-complexity recommended specialist routes, but does not block prompt submission by default.
- `PreToolUse` denies operational execution until the correct `Task(subagent_type='plugin:agent', ...)` specialist clears that session state.
- Read-only tools stay allowed while a route is pending.
- Mutating MCP tools are classified via `config/mcp-tool-policies.json`.
- Unknown MCP tools default to deny while a pending route is active and are logged for follow-up classification.
- `[ROUTING_OVERRIDE]` marks the route as bypassed for that request and is logged as an audited exception.

## Dependencies

Required for full functionality:
- `jq` - JSON processing (for sub-agent boosting)
- `node` - JavaScript execution (for session context)
- `bash` 4.0+ - Shell scripting

Optional but recommended:
- `CLAUDE_PLUGIN_ROOT` environment variable (hooks have fallback)

## Troubleshooting

**Hook not executing?**
```bash
# Test manually
echo '{"message":"test"}' | bash master-prompt-handler.sh
```

**Check dependencies**
```bash
/hooks-health
```

**Disable temporarily**
```bash
MASTER_HOOK_ENABLED=false claude code
```

## Documentation

- **Full Hook Architecture**: `docs/HOOK_ARCHITECTURE.md`
- **Main Project Guide**: `CLAUDE.md`
- **Troubleshooting**: Run `/hooks-health` command

---

**Last Updated**: 2025-11-20
**Maintained By**: RevPal Engineering
