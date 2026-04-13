---
name: hubspot-hook-shell-hardening
description: Apply consistent shell strictness and non-interactive safety defaults across HubSpot hooks.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hubspot-hook-shell-hardening

## When to Use This Skill

- Writing or reviewing a new HubSpot hook shell script that will run in CI, non-interactive terminals, or Git Bash on Windows
- Auditing existing hooks for missing `set -euo pipefail` or unquoted variable expansions
- Hardening a hook that calls external binaries (`jq`, `node`, `curl`) without verifying they exist
- Ensuring hook scripts degrade safely when run in a read-only or restricted filesystem environment
- Applying downgrade guidelines for hooks that must also run on macOS `zsh` or Alpine `sh`

**Not for**: Response envelope formatting (use `hubspot-hook-response-contracts`), input parsing standards (use `hubspot-hook-input-contracts`), or subprocess lifecycle (use `hubspot-hook-subprocess-and-tempfile-safety`).

## Shell Strictness Checklist

Every HubSpot hook shell script must open with:

```bash
#!/usr/bin/env bash
set -euo pipefail
```

- `set -e` — exit immediately on any command error
- `set -u` — treat unset variables as errors (prevents silent `$UNDEFINED` expansions)
- `set -o pipefail` — catch failures in piped commands (e.g., `jq ... | tee ...`)

## Safe vs Unsafe Command Patterns

| Pattern | Safe | Notes |
|---|---|---|
| `"$VARIABLE"` (quoted) | Yes | Always quote variable expansions |
| `$VARIABLE` (unquoted) | No | Word-splits on spaces, globbing risks |
| `command -v jq` before use | Yes | Preflight binary existence check |
| `$(jq ...)` without error check | No | Silent failure if jq not installed |
| `mktemp` for temp files | Yes | Guaranteed unique, respects `$TMPDIR` |
| `/tmp/hardcoded-name` | No | Race condition and permission issues |
| `node --no-warnings` | Yes | Suppresses deprecation noise in hooks |

## Workflow

1. **Add strict header** — ensure the script opens with `#!/usr/bin/env bash` and `set -euo pipefail`. Scripts using `sh` instead of `bash` must omit `-o pipefail` (POSIX sh doesn't support it) and use the downgrade pattern.
2. **Audit all variable expansions** — grep the script for unquoted `$VAR` patterns outside of arithmetic contexts. Quote all of them.
3. **Preflight external binaries** — before calling `jq`, `node`, `curl`, or `python3`, check with `command -v <bin> >/dev/null 2>&1 || { echo "Missing: <bin>" >&2; exit 0; }`. Exit 0 (not 1) so the hook degrades non-blockingly.
4. **Apply non-interactive defaults** — set `CI=true`, avoid any command that prompts for input (e.g., `read`, `vi`). Hook scripts must complete without TTY.
5. **Test downgrade path** — run the script under `sh -n` (syntax check) and in a minimal Alpine container to confirm POSIX compatibility if cross-platform support is required.
6. **Verify safe exit codes** — confirm the script exits 0 on all degraded/non-critical paths so it never blocks Claude Code unexpectedly.

## Routing Boundaries

Use this skill for shell-level strictness and binary safety only.
Defer to `hubspot-hook-subprocess-and-tempfile-safety` for subprocess lifecycle and tempfile cleanup patterns.

## References

- [Strict Mode Policy](./strict-mode-policy.md)
- [Safe Commands](./safe-commands.md)
- [Downgrade Guidelines](./downgrade-guidelines.md)
