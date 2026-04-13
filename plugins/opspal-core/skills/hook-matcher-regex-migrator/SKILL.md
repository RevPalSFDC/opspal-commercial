---
name: hook-matcher-regex-migrator
description: Validate and migrate fragile hook matcher patterns to robust regex forms with compatibility notes.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:plugin-doctor
version: 1.0.0
---

# hook-matcher-regex-migrator

## When to Use This Skill

- A hook matcher uses bare wildcards (`*`, `mcp__*`) that match more tools than intended
- A hook is not firing because a tool name changed and the old literal matcher no longer matches
- Legacy glob-style matchers need migration to Claude Code's supported regex format
- You need to tighten an overly broad matcher that is causing hooks to run on unrelated tools
- A new tool naming convention (`mcp__plugin_name__tool`) requires existing matchers to be updated in bulk

**Not for**: creating net-new hook matchers from scratch — use `hook-event-coverage-auditor` to identify gaps first.

## Matcher Pattern Reference

| Legacy Pattern | Risk | Recommended Replacement |
|----------------|------|-------------------------|
| `*` | Matches every tool; catastrophic over-triggering | `.*` with event scoped to specific types |
| `mcp__sfdc__*` | Glob syntax not supported in all runtimes | `^mcp__sfdc__` |
| `Bash` | Literal match only; misses `bash` lowercase | `^[Bb]ash$` |
| `mcp__plugin_*_tool` | Glob mid-string — unsupported | `^mcp__plugin_[^_]+_tool$` |

## Workflow

1. **Extract all matchers**: run `jq '.hooks[].matcher' plugin.json` across all target configs to build a complete matcher inventory.
2. **Classify each matcher**: label as literal, glob, or regex; flag globs as migration candidates.
3. **Identify silent-failure matchers**: test each matcher against a representative tool name set using `echo "tool_name" | grep -P "^matcher$"`; any that return no match despite expected coverage are broken.
4. **Draft replacement regex**: apply the pattern reference table above; prefer anchored patterns (`^...$`) over unanchored to prevent partial matches.
5. **Compile-test all proposed replacements**: use `grep -P` or a Node.js `new RegExp(pattern).test(toolName)` one-liner to verify each replacement matches its intended tool names.
6. **Assess blast radius of broad patterns**: for any `.*` or prefix-only pattern, enumerate all tools it would match and confirm intent with the hook owner.
7. **Propose changes with rollback note**: output a diff of the config changes and document the previous matcher in a comment for rollback reference.

## Safety Checks

- Compile-test every proposed matcher before including it in the report — never propose untested regex
- Do not auto-apply broad patterns (`.*`) without explicit owner confirmation
- Keep a fallback matcher list: if a replacement breaks unexpectedly, document the prior literal as the safe revert
