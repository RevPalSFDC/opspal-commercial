# Plugin Documentation Maintenance

This document defines how repository-level plugin documentation is generated, validated, and kept current.

## Canonical Artifacts

The following files are generated from plugin source and should not be edited manually:

- `AGENTS.md`
- `docs/PLUGIN_SUITE_CATALOG.md`
- `docs/PLUGIN_SUITE_CATALOG.json`
- `docs/PLUGIN_OWNERSHIP_AND_LIFECYCLE.md`
- Stats sections in `README.md`
- Stats table in `CLAUDE.md`

## Canonical Generator

Use the root generator only:

- `scripts/generate-plugin-suite-docs.js`
- `npm run docs:generate`

The root generator is the source of truth for CI and release gating.

## Source of Truth

Generated docs are built from tracked runtime plugins under `plugins/opspal-*`.

Sources:

- `plugins/*/.claude-plugin/plugin.json`
- `plugins/*/agents/**/*.md` (excluding `agents/**/shared/**`)
- `plugins/*/commands/**/*.md`
- `plugins/*/skills/**/SKILL.md` plus top-level `skills/*.md` skill entries
- `plugins/*/hooks/**/*.sh`
- `plugins/*/scripts/**`

Counting semantics:

- Agent totals represent executable agent specs (shared reference guides are excluded).
- Command totals represent documented slash-command definitions (recursive under `commands/`).
- Skill totals represent canonical skill entry files, not internal reference docs.

## Validation Gates

Run all docs gates locally before commit:

```bash
npm run docs:ci
```

Equivalent individual gates:

- `npm run docs:check`
- `npm run docs:lint`
- `npm run docs:lint:baseline` (refresh warning baseline intentionally)
- `npm run docs:verify-routing`
- `npm run docs:verify-commands`
- `npm run docs:verify-version-bumps`
- `npm run docs:verify-hook-path-isolation`
- `npm run docs:verify-lifecycle-metadata`
- `npm run docs:verify-lifecycle-metadata:baseline` (refresh lifecycle baseline intentionally)
- `npm run docs:verify-architecture-boundaries`
- `npm run docs:verify-architecture-boundaries:baseline` (refresh boundary baseline intentionally)
- `npm run docs:verify-shell-safety`
- `npm run docs:verify-shell-safety:baseline` (refresh shell-safety baseline intentionally)

`docs:lint` enforces a non-regression warning baseline from `docs/docs-lint-baseline.json`.
If warning debt is intentionally reduced or reclassified, regenerate the baseline with `npm run docs:lint:baseline` and commit the baseline file in the same change.

`docs:verify-lifecycle-metadata` and `docs:verify-architecture-boundaries` are also baseline-guarded.
These gates fail on net-new violations while allowing existing legacy debt to be paid down incrementally.

## Local Workflow

1. Make plugin metadata/content changes.
2. Regenerate docs: `npm run docs:generate`.
3. Validate docs and integrity: `npm run docs:ci`.
4. Commit source + regenerated docs together.

## Git Hook Guardrail

Optional local enforcement:

- `git config core.hooksPath .githooks`
- `.githooks/pre-commit` runs `npm run docs:ci`

## CI Enforcement

GitHub workflow `documentation-drift-check.yml` runs docs validation gates on plugin/doc generator changes.

GitHub workflow `docs-gardening.yml` runs a weekly scheduled maintenance pass:

- Regenerates docs
- Runs `npm run docs:ci`
- Opens/updates a GitHub issue if drift or gate failures are detected

If CI fails:

1. Run `npm run docs:generate`
2. Run `npm run docs:ci`
3. Commit regenerated outputs
4. Re-run checks

## Main Push Release Notes

Release-note Slack notifications are enforced for every `main` push via:

- Workflow: `.github/workflows/main-push-release-notes.yml`
- Script: `scripts/lib/send-main-push-release-notification.js`

Required secret:

- `SLACK_WEBHOOK_URL` (repository or organization secret)

Local `git push` notifications from Claude hooks remain available as a fallback.
To avoid duplicate Slack messages when CI notifications are active, set:

- `SKIP_LOCAL_PUSH_SLACK_NOTIFIER=true` in local `.env`

## Release Checklist

Before release or tag:

1. `npm run docs:generate`
2. `npm run docs:ci`
3. Confirm `AGENTS.md` runtime matrix reflects expected plugin state
4. Confirm `docs/PLUGIN_SUITE_CATALOG.md` includes new/renamed components
5. Confirm `docs/PLUGIN_OWNERSHIP_AND_LIFECYCLE.md` reflects expected ownership/lifecycle metadata coverage
