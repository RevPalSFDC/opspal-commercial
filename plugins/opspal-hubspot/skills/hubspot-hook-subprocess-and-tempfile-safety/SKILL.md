---
name: hubspot-hook-subprocess-and-tempfile-safety
description: Enforce subprocess dependency checks and tempfile lifecycle safety in HubSpot hook scripts.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hubspot-hook-subprocess-and-tempfile-safety

## When to Use This Skill

- Writing a HubSpot hook that spawns a `node` subprocess to run a validation script (e.g., `node scripts/validate-workflow.js`)
- Ensuring tempfiles created during hook execution are cleaned up even when the script exits unexpectedly
- Reviewing a hook that calls external processes (`curl`, `python3`, `hs`) for correct dependency preflight
- Debugging a hook that leaves stale `.tmp` files in `/tmp` or the plugin `cache/` directory after a crash
- Applying subprocess timeout guards to prevent a slow HubSpot API call from blocking Claude Code indefinitely

**Not for**: Shell strictness (`set -euo pipefail`) — use `hubspot-hook-shell-hardening`. Response formatting — use `hubspot-hook-response-contracts`.

## Dependency Preflight Pattern

Before invoking any external binary in a hook script:

```bash
for bin in node jq curl; do
  command -v "$bin" >/dev/null 2>&1 || {
    echo "{\"decision\":\"allow\",\"reason\":\"Dependency $bin not found — hook skipped\",\"severity\":\"low\"}" >&1
    exit 0
  }
done
```

Exit 0 (non-blocking) when a non-critical dependency is absent. Only exit 1 when the dependency is required for a safety gate.

## Tempfile Lifecycle Rules

| Rule | Implementation |
|---|---|
| Always use `mktemp` | `TMPFILE=$(mktemp /tmp/hs-hook-XXXXXX.json)` |
| Register cleanup trap immediately | `trap 'rm -f "$TMPFILE"' EXIT INT TERM` |
| Never use predictable names | Avoid `/tmp/hubspot-output.json` — race condition risk |
| Scope to `/tmp` or `$TMPDIR` | Never write tempfiles to the plugin `scripts/` or `hooks/` dirs |
| Confirm cleanup on abort | Test with `kill -INT` mid-execution to verify trap fires |

## Workflow

1. **Enumerate all subprocess calls** — list every external binary and Node script invoked. Identify which are critical (gate-blocking) vs optional (telemetry).
2. **Run dependency preflight** — apply the pattern above for all binaries. Emit a non-blocking allow with a diagnostic reason if optional dependencies are missing.
3. **Create tempfiles with mktemp + trap** — immediately after `mktemp`, register the `EXIT` trap. Never defer this.
4. **Apply subprocess timeout** — wrap long-running subprocesses: `timeout 10s node scripts/validate.js "$TMPFILE" || { echo "Validation timed out" >&2; exit 0; }`.
5. **Capture and check exit codes** — use `set -e` (from shell hardening) and explicit `|| true` only when a non-zero exit is expected and handled.
6. **Verify cleanup** — after test runs, confirm no stale tempfiles remain with `ls /tmp/hs-hook-*` or `find "$TMPDIR" -name 'hs-hook-*' -mmin +5`.

## Routing Boundaries

Use this skill for subprocess invocation and tempfile lifecycle only.
Defer to `hubspot-hook-shell-hardening` for `set -euo pipefail` and variable quoting standards.

## References

- [Dependency Preflight](./dependency-preflight.md)
- [Tempfile Lifecycle](./tempfile-lifecycle.md)
- [Subprocess Failure Modes](./subprocess-failure-modes.md)
