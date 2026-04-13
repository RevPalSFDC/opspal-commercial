---
name: hook-path-boundary-enforcer
description: Detect and prevent cross-plugin hook path coupling and boundary violations in configs and scripts.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:plugin-doctor
version: 1.0.0
---

# hook-path-boundary-enforcer

## When to Use This Skill

- A hook script in `opspal-salesforce` sources or calls a script in `opspal-core/scripts/lib/` directly (cross-plugin coupling)
- A hook config registers a script path that lives outside the plugin's own directory tree
- You are adding a new shared utility and need to determine the correct canonical location
- The DevTools boundary policy (`config/boundary-policy.json`) flags a hook script as a protected-zone violation
- A hook references `.claude/scripts/lib/` paths, which are gitignored and cannot be relied upon in production

**Not for**: enforcing Salesforce field-level or object-level permissions — use the Salesforce permission skills for that.

## Boundary Rules Quick Reference

| Zone | Allowed Hook Paths | Blocked Hook Paths |
|------|-------------------|-------------------|
| Plugin-internal | `plugins/<name>/hooks/*.sh` | `plugins/<other>/hooks/*.sh` |
| Shared lib | `plugins/opspal-core/scripts/lib/*.js` | `.claude/scripts/lib/` (gitignored) |
| Config | `plugins/<name>/config/*.json` | `plugins/<other>/config/` |
| DevTools | `dev-tools/**` | `plugins/**` (protected zone) |

## Workflow

1. **Extract script references from hook configs**: run `grep -r '"script"' plugins/*/plugin.json` to list every script path registered in any hook.
2. **Normalize all paths to absolute**: resolve relative paths against the plugin root; flag any that escape the plugin directory with `../` traversal.
3. **Check for cross-plugin references**: identify any script path whose prefix does not match the registering plugin's own directory.
4. **Separate baseline debt from net-new**: if violations exist in the current main branch, log them as known debt; only escalate newly introduced violations as blocking.
5. **Consult `boundary-policy.json`**: load `config/boundary-policy.json` and verify each flagged path against `protectedZones` and `safeEditZones`.
6. **Propose refactor**: for each violation, recommend either (a) copying the shared script into the plugin's own `scripts/lib/`, or (b) promoting it to `opspal-core/scripts/lib/` as an official shared dependency.
7. **Require exception ownership**: any approved cross-plugin reference must include an owner comment in the hook config and a tracked exception in the boundary policy file.

## Safety Checks

- Block all net-new cross-plugin internal script references; legacy debt is tracked separately, not silently accepted
- Never reference `.claude/scripts/lib/` paths from shipped hook configs — they are gitignored and absent in customer installs
- Require explicit exception ownership with a named maintainer for every approved boundary exception
