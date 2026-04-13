---
name: hubspot-hook-skill-sync-governance
description: Keep HubSpot skill references synchronized with actual hook file names and trigger surfaces.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hubspot-hook-skill-sync-governance

## When to Use This Skill

- Verifying that all hook file names referenced in `plugin.json` match actual files on disk under `hooks/`
- Detecting drift after a hook script is renamed, moved, or deleted without updating the manifest
- Auditing skill YAML frontmatter references to ensure `allowed-tools` and `agent` fields point to live entities
- Running the sync governance check as part of the `npm run docs:ci` validation gate before a release
- Writing the update protocol for a new hook family (create hook file → update `plugin.json` → update referencing skill → verify sync)

**Not for**: Hook script logic, input/output contracts, or shell hardening. Use the respective skill for those concerns.

## Drift Detection Quick Reference

| Artifact | Reference Location | Drift Indicator |
|---|---|---|
| Hook shell script | `hooks/<name>.sh` | Referenced in `plugin.json` but missing on disk |
| `plugin.json` hook entry | `hooks[].script` | File exists but no matching manifest entry |
| Skill `allowed-tools` | SKILL.md frontmatter | Tool name removed from plugin but still listed |
| Skill `agent` field | SKILL.md frontmatter | Agent `.md` file deleted or renamed |
| Hook matcher regex | `plugin.json` `matches` field | Pattern no longer matches any active tool name |

## Workflow

1. **Enumerate declared hooks** — parse `plugin.json` `hooks[]` array and extract all `script` paths. Build a declared-hooks set.
2. **Enumerate disk hooks** — glob `hooks/**/*.sh` and `hooks/**/*.js`. Build a disk-hooks set.
3. **Compute the diff** — declared-not-on-disk = missing scripts (broken references); disk-not-declared = orphaned scripts (dead code).
4. **Audit skill frontmatter** — for each SKILL.md in `skills/`, validate that `agent` values exist in `agents/` and `allowed-tools` entries are still registered in the plugin manifest.
5. **Apply update protocol** — for any drift found: update `plugin.json` first, then update SKILL.md frontmatter, then rename/create the hook file. Always update in that order to keep the manifest as the source of truth.
6. **Re-run validation gate** — execute `npm run docs:ci` from `opspal-commercial/` to confirm zero drift before committing.

## Routing Boundaries

Use this skill for manifest-to-disk sync auditing only.
Defer to `hubspot-hook-input-contracts` for hook script internals and to `plugin-dev:hook-development` for building new hooks from scratch.

## References

- [Reference Audit](./reference-audit.md)
- [Drift Detection](./drift-detection.md)
- [Update Protocol](./update-protocol.md)
