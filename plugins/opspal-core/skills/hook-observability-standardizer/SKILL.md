---
name: hook-observability-standardizer
description: Standardize hook logging, telemetry fields, and health checks across plugin ecosystems.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:plugin-doctor
version: 1.0.0
---

# hook-observability-standardizer

## When to Use This Skill

- Hook failures are reported inconsistently — some plugins log JSON, others plain text, some nothing
- A hook health check (`/hooks-health`) cannot parse hook output because log format varies by plugin
- You are instrumenting a new hook and need to conform to the platform log schema
- Correlation IDs are missing from hook logs, making it impossible to trace a session's hook chain
- Hook retention or rotation policies are undefined and logs are growing unbounded

**Not for**: application-level logging outside hooks, or audit logging for Salesforce/HubSpot API calls (use platform-specific observability skills for those).

## Standard Hook Log Schema

```json
{
  "ts": "2026-04-12T14:23:00Z",
  "hook": "pre-bash-guard",
  "plugin": "opspal-core",
  "event": "PreToolUse",
  "tool": "Bash",
  "correlation_id": "sess_abc123",
  "action": "allow | warn | block",
  "duration_ms": 42,
  "tags": ["policy:boundary", "severity:low"],
  "message": "human-readable summary (no PII)"
}
```

## Workflow

1. **Inventory existing hook log output**: grep hook scripts for `echo`, `logger`, and `jq` output calls; capture representative log lines from each plugin.
2. **Identify schema gaps**: compare each hook's output against the standard schema above — flag missing fields (`correlation_id`, `duration_ms`, `action`).
3. **Add correlation ID threading**: source `env-normalize.sh` at hook top to inherit `CLAUDE_SESSION_ID`; assign it to `correlation_id` in every log line.
4. **Wrap hook logic in a timing block**: capture `START_MS=$(date +%s%3N)` before the hook body and compute `duration_ms` in the final log emit.
5. **Sanitize sensitive fields**: strip API keys, tokens, and PII from log payloads before writing; use `jq 'del(.tool_input.code)` or field-specific redaction.
6. **Define retention policy**: confirm log file path (default `~/.claude/logs/hooks.jsonl`), max size (default 50 MB), and rotation (daily or size-based with `logrotate`).
7. **Validate with hooks-health**: run `/hooks-health` after instrumentation and confirm all hooks appear in the health report with parseable output.

## Safety Checks

- Never log raw `tool_input` content — redact or omit it entirely
- Require `correlation_id` on every emitted log line
- Define and document retention and rotation controls before enabling verbose logging
