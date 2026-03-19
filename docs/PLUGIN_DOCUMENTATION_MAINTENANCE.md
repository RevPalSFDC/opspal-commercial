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

Commercial hardening commands:

- `npm run docs:generate`
- `npm run docs:ci`
- `npm run verify:version-bumps -- --base <base-ref> --head HEAD`
- `npm run verify:repo-boundaries`
- `npm run smoke:marketplace`
- `npm run ci:hardening`

`verify:version-bumps` is diff-aware and should be run with an explicit base ref locally when validating a branch.
Any tracked change under `plugins/<plugin>/` must ship with a higher `.claude-plugin/plugin.json` version for that plugin.

## Local Workflow

1. Make plugin metadata/content changes.
2. Regenerate docs: `npm run docs:generate`.
3. Validate docs and integrity: `npm run docs:ci`.
4. Validate repo boundaries: `npm run verify:repo-boundaries`.
5. Run smoke validation: `npm run smoke:marketplace`.
6. Validate plugin version bumps against your base branch: `npm run verify:version-bumps -- --base origin/main --head HEAD`.
7. Commit source + regenerated docs together.

## Git Hook Guardrail

Optional local enforcement:

- `git config core.hooksPath .githooks`
- `.githooks/pre-push` runs `npm run docs:ci`, the plugin version bump gate, and the commercial repo-boundary gate against the refs being pushed

## CI Enforcement

GitHub workflow `.github/workflows/plugin-validation.yml` runs:

- manifest structure validation for every commercial plugin
- `npm run docs:ci`
- `npm run smoke:marketplace`

GitHub workflow `.github/workflows/plugin-version-enforcement.yml` runs:

- the diff-aware plugin version bump gate
- the commercial repo-boundary gate

GitHub workflow `.github/workflows/workflow-integrity.yml` lints workflow definitions.

GitHub workflow `.github/workflows/release-readiness.yml` validates manifest/tag readiness.

Branch protection must require these checks on `main`:

- `Validate Suite Catalog Artifacts`
- `Smoke Test Commercial Marketplace`
- `Enforce Plugin Version Bumps`
- `Validate Commercial Repo Boundaries`
- `Lint Workflow Definitions`
- `Validate Release Configuration`

If CI fails:

1. Run `npm run docs:generate`
2. Run `npm run docs:ci`
3. Run `npm run verify:repo-boundaries`
4. Run `npm run smoke:marketplace`
5. If plugin content changed, run `npm run verify:version-bumps -- --base origin/main --head HEAD`
6. Commit regenerated outputs and the required plugin version bump
7. Re-run checks

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
3. `npm run smoke:marketplace`
4. Confirm every changed plugin has a higher `.claude-plugin/plugin.json` version than the base branch
5. Confirm `docs/PLUGIN_SUITE_CATALOG.md` includes new/renamed components
6. Confirm `docs/PLUGIN_OWNERSHIP_AND_LIFECYCLE.md` reflects expected ownership/lifecycle metadata coverage
