---
name: hubspot-hook-input-contracts
description: Standardize HubSpot hook input parsing across stdin event JSON and argv fallback modes.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hubspot-hook-input-contracts

## When to Use This Skill

- Writing a new HubSpot hook script that must parse the Claude Code hook event payload from stdin
- Debugging a hook that behaves differently under the CLI vs Desktop client (argv fallback mode)
- Reviewing a hook PR for correct required-field validation and safe fallback behavior
- Adding argv-mode compatibility to an existing stdin-only hook
- Establishing the canonical input schema for a new hook family (e.g., all `PreToolUse` hooks for HubSpot CRM tools)

**Not for**: Hook response formatting (use `hubspot-hook-response-contracts`), shell safety patterns (use `hubspot-hook-shell-hardening`), or subprocess lifecycle (use `hubspot-hook-subprocess-and-tempfile-safety`).

## Input Parsing Priority

| Priority | Source | When Active | Parse Method |
|---|---|---|---|
| 1 | stdin JSON | CLI and Desktop (standard) | `jq -r '.'` or `JSON.parse(fs.readFileSync('/dev/stdin'))` |
| 2 | `$1` argv JSON string | Desktop Git Bash fallback | `JSON.parse(process.argv[2])` |
| 3 | Environment variables | Legacy compatibility mode | `process.env.CLAUDE_TOOL_INPUT` |

## Required Fields (HubSpot Hook Events)

All HubSpot PreToolUse/PostToolUse hooks must validate these fields before acting:

- `tool_name` — the MCP tool or slash command being intercepted
- `tool_input` — the raw parameters object passed to the tool
- `agent_type` — the invoking agent identity (used for routing governance)
- `session_id` — used for audit log correlation

## Workflow

1. **Open the input stream** — attempt to read from stdin with a 500ms timeout. If stdin is empty or unavailable, fall back to `process.argv[2]`.
2. **Parse JSON defensively** — wrap parse in try/catch; on failure emit a structured warn to stderr and exit 0 (non-blocking degraded mode) unless the hook is designated critical.
3. **Validate required fields** — check each required field using the list above. Missing `tool_name` or `tool_input` is always a hard error; missing `agent_type` triggers a governance warning.
4. **Apply compatibility mode** — if `HUBSPOT_HOOK_COMPAT=1` is set, accept partial payloads and fill defaults (`agent_type: "unknown"`, `session_id: crypto.randomUUID()`).
5. **Pass parsed object downstream** — export as a structured constant for the hook's decision logic. Never re-parse stdin later in the script.
6. **Verify with explicit test cases** — run the hook with a full payload, a missing-field payload, an empty stdin, and an argv-mode payload to confirm all paths behave correctly.

## Routing Boundaries

Use this skill for input parsing and contract validation only.
Defer to `hubspot-hook-response-contracts` for output formatting and to `hubspot-hook-shell-hardening` for shell-level safety.

## References

- [Input Priority](./input-priority.md)
- [Required Fields](./required-fields.md)
- [Compatibility Mode](./compatibility-mode.md)
