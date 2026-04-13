---
name: hook-shell-safety-hardener
description: Harden shell-based hooks with strict mode, bounded external calls, and deterministic failure behavior.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:plugin-doctor
version: 1.0.0
---

# hook-shell-safety-hardener

## When to Use This Skill

- A hook script is missing `set -euo pipefail` and silently swallowing errors
- A hook makes an external network call (curl, node, sf CLI) without a timeout, risking indefinite hang
- `shellcheck` reports unquoted variable expansions, command injection risks, or unbound variable references in hook scripts
- A hook uses `rm -rf`, `git reset --hard`, or other destructive commands that could cause irreversible data loss
- A non-blocking hook (PostToolUse, Stop) is structured with `exit 1` that accidentally blocks execution

**Not for**: application-level Salesforce or HubSpot API hardening — use the platform-specific hook safety skills for those.

## Hardening Checklist

```bash
#!/usr/bin/env bash
set -euo pipefail          # 1. Strict mode: exit on error, unbound vars, pipe failures
IFS=$'\n\t'               # 2. Safe IFS to prevent word-splitting on spaces

PAYLOAD=$(cat)             # 3. Read stdin once; store in variable (not re-read)
TIMEOUT=10                 # 4. Define timeout for any external calls

# 5. Quote all variable expansions
# BAD:  jq .field $FILE
# GOOD: jq '.field' "$FILE"

# 6. Use timeout for network/CLI calls
result=$(timeout "$TIMEOUT" sf data query --query "..." 2>&1) || {
  echo '{"action":"degraded","reason":"sf CLI timed out"}' >&2
  exit 3
}

# 7. Avoid destructive commands entirely; if unavoidable, require dry-run flag
# NEVER: rm -rf "$DIR"
# SAFE:  echo "would remove $DIR" (log only; require explicit approval)

# 8. Emit structured exit on any failure
trap 'echo "{\"action\":\"degraded\",\"reason\":\"unexpected error at line $LINENO\"}" >&2' ERR
```

## Workflow

1. **Run shellcheck on all hook scripts**: `shellcheck hooks/*.sh` — treat SC2086 (unquoted vars) and SC2048 (array expansion) as blocking issues.
2. **Audit for missing strict mode**: grep for scripts lacking `set -euo pipefail` at line 1; add it to each.
3. **Identify unbounded external calls**: search for `curl`, `node`, `sf`, `gh` invocations without a preceding `timeout N`; add timeouts.
4. **Scan for destructive commands**: grep for `rm -rf`, `git reset`, `truncate`, `drop` — flag each one for removal or explicit dry-run gating.
5. **Verify non-blocking hooks exit cleanly**: for PostToolUse and Stop hooks, confirm no `exit 1` or `exit 2` that would block execution; these hooks must exit 0 on all paths.
6. **Add ERR trap**: insert the structured error trap so any uncaught failure emits a parseable JSON line to stderr before the script exits.
7. **Re-run shellcheck after patches**: confirm zero new warnings introduced; record the clean run in the script-by-script risk report.

## Safety Checks

- Preserve non-blocking hook semantics: PostToolUse and Stop hooks must exit 0 on all paths, even on internal errors
- Add `timeout` to every network or CLI call; default to 10 seconds
- Never introduce destructive commands (`rm -rf`, `git reset --hard`) in hook scripts
