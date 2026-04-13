---
name: runbook-linkage-linter
description: Validate runbook-to-agent-to-skill linkage integrity and detect stale references before release or docs CI.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:solution-runbook-generator
version: 1.0.0
---

# runbook-linkage-linter

## When to Use This Skill

- A runbook references an agent (`opspal-salesforce:sfdc-revops-auditor`) that was renamed or deleted
- A skill's `SKILL.md` references supporting `.md` files that no longer exist on disk
- The marketplace catalog (`docs/plugin-catalog.md`) lists runbooks or skills that are absent from `plugin.json`
- Before a docs CI run (`npm run docs:ci`) to pre-emptively catch stale references and avoid CI failures
- A plugin version bump moved or renamed skill directories and runbook cross-references need updating

**Not for**: validating the content or completeness of runbook documentation — this skill checks structural linkage only (file existence, agent names, skill IDs).

## Linkage Types Checked

| Linkage Type | Source | Target | Check Method |
|-------------|--------|--------|-------------|
| Runbook → Agent | `runbook.md` agent field | `agents/<name>.md` | File exists in plugin `agents/` |
| Runbook → Skill | `runbook.md` skill field | `skills/<name>/SKILL.md` | Directory + SKILL.md exists |
| Skill → Supporting docs | `SKILL.md` `[link](./file.md)` | `skills/<name>/file.md` | File exists on disk |
| Catalog → Plugin | `plugin-catalog.md` entry | `plugin.json` name field | Name matches exactly |
| `plugin.json` → Script | `hooks[].script` | `hooks/<name>.sh` | File exists and is executable |

## Workflow

1. **Scope the lint run**: determine whether to check a single plugin or all plugins; default to all plugins for pre-release runs.
2. **Extract all declared linkages**: parse `plugin.json` for agent, skill, hook, and command declarations; parse all `SKILL.md` files for markdown link targets; parse the catalog for plugin references.
3. **Resolve each linkage to a file path**: map declared names to expected filesystem paths using the plugin's directory structure.
4. **Check file existence for each target**: use `Glob` or `Read` to confirm each target exists; flag any that are missing as broken links.
5. **Classify broken links by severity**: missing agent or hook script is critical (blocks runtime); missing skill supporting doc is medium; catalog drift is low.
6. **Produce the broken-link report**: list each broken link with source file, declared target, expected path, and severity classification.
7. **Suggest remediations**: for each broken link, propose either (a) create the missing file, (b) update the reference to the correct target, or (c) remove the stale declaration — require human confirmation before any deletion.

## Safety Checks

- Fail closed on unresolved critical references: a missing hook script or agent file must block the lint run with a non-zero exit
- Do not auto-mutate any references — output proposed changes as a diff for human review
- Require explicit confirmation before suggesting deletion of any declared reference
