---
name: sop-health
description: Check SOP subsystem health — config validity, hook registration, Asana connectivity, recent execution stats
argument-hint: "[--verbose] [--json]"
visibility: user-invocable
tags:
  - sop
  - health
  - observability
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
---

# SOP Health — Operator Health Check

## Purpose

Run a comprehensive health check on the SOP subsystem. Verifies configuration, schema validity, hook registration, Asana connectivity, and recent execution statistics.

## Checks

Perform each check and report pass/warn/fail:

### 1. Config Valid
Check that `config/sop/sop-config.yaml` exists in the opspal-core plugin directory and parses as valid YAML.

### 2. Schema Valid
Load all policy files from `config/sop/` and validate against `schemas/sop-policy.schema.json`. Report count of valid vs invalid policies.

### 3. Mappings Valid
For each policy with a `mapping_ref`, verify the referenced mapping exists in `config/sop/mappings/`. Report unresolved references.

### 4. Hooks Registered
Check that each of these dispatcher scripts contains the expected SOP child hook `run_child_hook` line:
- `hooks/post-tool-use-agent-dispatcher.sh` — should contain `sop-lifecycle-dispatcher.sh`
- `hooks/user-prompt-dispatcher.sh` — should contain `sop-prompt-lifecycle-detector.sh`
- `hooks/subagent-stop-dispatcher.sh` — should contain `sop-subagent-completion.sh`
- `hooks/session-start-dispatcher.sh` — should contain `sop-session-init.sh`

### 5. Hooks Executable
Check that each SOP hook script exists and is executable (`-x` permission):
- `hooks/sop-lifecycle-dispatcher.sh`
- `hooks/sop-prompt-lifecycle-detector.sh`
- `hooks/sop-subagent-completion.sh`
- `hooks/sop-session-init.sh`

### 6. Audit Writable
Check that `~/.claude/logs/` directory exists and is writable. Try appending to `sop-audit.jsonl`.

### 7. Asana Preflight
Check `ASANA_ACCESS_TOKEN` is set. If set, optionally try `mcp__asana__asana_list_workspaces` to verify connectivity.

### 8. Conflicts
Check for conflicting enforce policies (same event + target + incompatible mutations). Report count.

### 9. Recent Executions
Read last 20 entries from `~/.claude/logs/sop-audit.jsonl`. Summarize: executed / skipped / errored counts.

### 10. Stale Policies
Check for policies with `schema_version` older than the current supported version.

## Output

Table format:

```
| Check              | Status | Details                          |
|--------------------|--------|----------------------------------|
| Config valid       | PASS   | sop-config.yaml loaded           |
| Schema valid       | PASS   | 5/5 policies valid               |
| Mappings valid     | WARN   | 1 unresolved mapping_ref         |
| Hooks registered   | PASS   | 4/4 dispatchers wired            |
| Hooks executable   | FAIL   | sop-session-init.sh not found    |
| Audit writable     | PASS   | ~/.claude/logs/ writable         |
| Asana preflight    | WARN   | ASANA_ACCESS_TOKEN not set       |
| Conflicts          | PASS   | 0 conflicts                      |
| Recent executions  | PASS   | 15 executed, 3 skipped, 0 error  |
| Stale policies     | PASS   | All at schema_version 1.0.0      |
```

`--json` outputs machine-readable JSON. `--verbose` includes file paths and detailed error messages.
