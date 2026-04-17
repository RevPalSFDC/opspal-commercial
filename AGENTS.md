# AGENTS.md - OpsPal Maintainer + Developer Guide

> Authoritative maintainer and developer guide for the runtime OpsPal plugin suite.
> Generated sections are explicitly marked. Regenerate with `npm run docs:generate`.

## Purpose

This guide defines maintainer workflows, architecture invariants, and validation gates for the runtime OpsPal plugin suite.

## Scope

- Runtime plugin inventory in this file is sourced from tracked `opspal-*` plugins under `plugins/`.
- Local-only maintainer tooling lives in the sibling workspace at `../dev-tools/developer-tools-plugin` and is documented in `docs/DEVELOPER_TOOLS_GUIDE.md`.
- `CLAUDE.md` is the runtime behavior/routing guide. `AGENTS.md` is the maintainer + developer reference.

## Maintainer Workflow

1. Update plugin manifests, agents, commands, skills, hooks, or scripts.
2. Regenerate suite docs: `npm run docs:generate`.
3. Run validation gates: `npm run docs:ci`.
4. Commit regenerated docs with source changes.

## Architecture Invariants (Mechanically Enforced)

- Route targets in `CLAUDE.md` must map to existing runtime agents.
- Legacy plugin alias route targets (for example `*-plugin:*`) are disallowed.
- Agents with `MUST BE USED` descriptions must be explicitly routed in `CLAUDE.md` Mandatory Routing section.
- Hook commands cannot reference cross-plugin paths via `${CLAUDE_PLUGIN_ROOT}/../...`.
- Runtime assets under `assets/`, `templates/`, and `examples/` must remain referenced or be intentionally baselined.
- New risky shell patterns are blocked by baseline-guarded shell safety checks.
- Plugin changes must ship with a manifest version increment.
- Plugin lifecycle metadata and architecture boundary violations are tracked by baseline-guarded gates.

## Release Notes + Slack Alerts

- Every push to `main` triggers `.github/workflows/main-push-release-notes.yml`.
- Canonical notifier script: `scripts/lib/send-main-push-release-notification.js`.
- Required repository secret: `SLACK_WEBHOOK_URL` (workflow fails if missing).
- Local fallback hook: `.claude/hooks/post-git-push-slack-notifier.sh`.
- To avoid duplicate notifications from local Claude pushes, set `SKIP_LOCAL_PUSH_SLACK_NOTIFIER=true` in local `.env`.

## Validation Gates

| Gate | Command | Fails On |
|------|---------|----------|
| Docs drift | `npm run docs:check` | Generated files differ from source |
| Metadata lint | `npm run docs:lint` | Missing/invalid canonical metadata or warning-baseline regression |
| Hook path isolation | `npm run docs:verify-hook-path-isolation` | Cross-plugin hook paths (for example `${CLAUDE_PLUGIN_ROOT}/../...`) are declared in plugin hooks |
| Routing integrity | `npm run docs:verify-routing` | Route target agent missing or legacy plugin alias used |
| Route coverage | `npm run docs:verify-route-coverage` | Net-new mandatory agents (`MUST BE USED`) missing explicit routing coverage |
| Command integrity | `npm run docs:verify-commands` | Ambiguous duplicate command ownership |
| Unused assets | `npm run docs:verify-unused-assets` | Net-new orphaned assets in runtime plugin `assets/`, `templates/`, or `examples/` paths |
| Marketplace catalog | `npm run docs:verify-marketplace-catalog` | Runtime plugin missing from `.claude-plugin/marketplace.json`, stale plugin version/source, or stale aggregate stats |
| Version bump integrity | `npm run docs:verify-version-bumps` | Plugin files changed without a manifest version increment |
| Lifecycle metadata | `npm run docs:verify-lifecycle-metadata` | Net-new missing lifecycle metadata (`status`, `owner`, `stability`, `last_reviewed_at`) or stale review breaches |
| Architecture boundaries | `npm run docs:verify-architecture-boundaries` | Net-new cross-plugin internal path coupling in runtime plugin files |
| Shell safety | `npm run docs:verify-shell-safety` | Net-new risky shell patterns in checked scripts/hooks |

## Canonical Artifacts

- Full runtime registry: `docs/PLUGIN_SUITE_CATALOG.md`
- Machine-readable runtime registry: `docs/PLUGIN_SUITE_CATALOG.json`
- Ownership and lifecycle registry: `docs/PLUGIN_OWNERSHIP_AND_LIFECYCLE.md`
- Deprecation policy: `docs/PLUGIN_DEPRECATION_POLICY.md`

## Maintainer Devtools (Local Only)

The local maintainer plugin is optional and not part of the runtime plugin suite.

- Plugin not detected at `../dev-tools/developer-tools-plugin`.
- Reference: `docs/DEVELOPER_TOOLS_GUIDE.md`.

## Runtime Plugin Matrix

<!-- AUTO_GENERATED_START:plugin-matrix -->
| Plugin | Version | Status | Agents | Mandatory Agents | Commands | Skills | Hooks | Scripts |
|--------|---------|--------|--------|------------------|----------|--------|-------|---------|
| `opspal-ai-consult` | 1.4.15 | active | 2 | 0 | 3 | 1 | 1 | 6 |
| `opspal-attio` | 2.0.2 | active | 0 | 0 | 28 | 0 | 21 | 0 |
| `opspal-core` | 2.55.29 | active | 80 | 11 | 126 | 49 | 107 | 594 |
| `opspal-gtm-planning` | 2.3.12 | active | 13 | 1 | 16 | 7 | 4 | 2 |
| `opspal-hubspot` | 3.9.35 | active | 59 | 6 | 33 | 23 | 15 | 109 |
| `opspal-marketo` | 2.6.43 | active | 30 | 24 | 30 | 17 | 25 | 33 |
| `opspal-monday` | 1.4.11 | experimental | 6 | 0 | 1 | 3 | 2 | 3 |
| `opspal-okrs` | 3.0.13 | active | 14 | 1 | 14 | 9 | 4 | 4 |
| `opspal-salesforce` | 3.87.23 | active | 94 | 21 | 59 | 55 | 47 | 1093 |
<!-- AUTO_GENERATED_END:plugin-matrix -->

## Runtime Registry

The complete runtime registry has moved to `docs/PLUGIN_SUITE_CATALOG.md`.
Use `docs/PLUGIN_SUITE_CATALOG.json` for machine-readable inventory data.

## Regeneration

- Generate all docs: `npm run docs:generate`
- Check for drift only: `npm run docs:check`
- Run full docs CI checks locally: `npm run docs:ci`
