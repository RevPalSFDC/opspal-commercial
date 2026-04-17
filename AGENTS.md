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

- Plugin: `developer-tools-plugin`
- Version: `2.5.0`
- Path: `../dev-tools/developer-tools-plugin`
- Manifest: `../dev-tools/developer-tools-plugin/.claude-plugin/plugin.json`
- Commands: 41
- Skills: 9

### Maintainer Commands

| Command | Args | Description | File |
|---------|------|-------------|------|
| `/agent-dev` | `[create|enhance] [agent-name] [--domain <domain>]` | Create or enhance sub-agents with proper structure and capabilities | `agent-dev.md` |
| `/agent-quality` | `<agent-name|--all> [--plugin <name>] [--format json|markdown]` | Analyze agent quality with scoring across prompt engineering, tools, and docs | `agent-quality.md` |
| `/agent-test` | `<agent-name> [--level functional|integration|performance]` | Comprehensive agent testing with validation, error analysis, and performance metrics | `agent-test.md` |
| `/agents` |  | List available specialist agents, optionally filtered by keyword | `agents.md` |
| `/audit-workflow` | `<task-description> [--parallel] [--audit]` | Orchestrate complex multi-agent workflows with task decomposition and compliance auditing | `audit-workflow.md` |
| `/autofix` | `[--max-fixes N] [--dry-run] [--skip-merge] [--resume] [--verbose]` | Autonomous reflection-to-fix loop -- analyzes open reflections, implements fixes, tests, and merges automatically | `autofix.md` |
| `/bugfix` | `<bug description> [--test-cmd <cmd>] [--files <file1,file2>] [--dry-run] [--r...` | Parallel hypothesis bug fix pipeline -- generates 3 hypotheses, tests each on its own branch, presents results | `bugfix.md` |
| `/bump-version` |  | Bump plugin version with automatic changelog generation | `bump-version.md` |
| `/check-routing` | `[--resolve] [--plugin <name>]` | Detect and resolve routing conflicts between agents | `check-routing.md` |
| `/complexity` |  | Assess task complexity and determine if a specialist agent is needed | `complexity.md` |
| `/dev-report` | `<report-type> [--audience exec|pm|engineering|gtm]` | Generate executive-level development reports and summaries for various audiences | `dev-report.md` |
| `/devreflect` |  | Analyze plugin development session for errors, feedback, and generate improvement playbook | `devreflect.md` |
| `/generate-manifests` | `[--target agents|readme|claude|suite] [--dry-run] [--check]` | Auto-generate AGENTS.md, plugin suite catalog, and stats in README/CLAUDE.md | `generate-manifests.md` |
| `/generate-readme` |  | Auto-generate plugin README from metadata, agents, scripts, and commands | `generate-readme.md` |
| `/hook-scaffold` | `<event-type> [--type command|prompt] [--matcher <pattern>] [--plugin <name>]` | Create a Claude Code hook for any of the 7 event types with proper structure | `hook-scaffold.md` |
| `/hooks-health` |  | Run a comprehensive health check of the Claude Code hook system. | `hooks-health.md` |
| `/migrate-schema` |  | Execute Supabase schema migrations with automated DDL execution | `migrate-schema.md` |
| `/otel-analyze` |  | Analyze OpenTelemetry metrics and generate insights | `otel-analyze.md` |
| `/otel-grafana` |  | Set up and manage Grafana dashboard for Claude Code metrics | `otel-grafana.md` |
| `/plugin-catalog` | `[--all] [--json] [--markdown] [--stats]` | Generate comprehensive marketplace catalog with plugin and agent directories | `plugin-catalog.md` |
| `/plugin-deps` |  | Analyze plugin dependencies, detect conflicts, check version compatibility, and generate dependency graphs | `plugin-deps.md` |
| `/plugin-dev/execute-component` | `[task-name] [--fresh] [--skip-verify]` | Execute the next planned task or a specific component from the development plan | `plugin-dev/execute-component.md` |
| `/plugin-dev/milestone` | `[version] [--patch|--minor|--major] [--no-tag]` | Complete a development milestone with version bump, changelog, and optional release | `plugin-dev/milestone.md` |
| `/plugin-dev/new-plugin` | `<plugin-name> [--level 0-3] [--skip-research]` | Start new plugin development with discovery research and phase planning | `plugin-dev/new-plugin.md` |
| `/plugin-dev/pause` | `[reason]` | Pause plugin development with full state capture for later resumption | `plugin-dev/pause.md` |
| `/plugin-dev/plan-component` | `<component-type> <component-name> [--context-check]` | Plan a specific plugin component (agent, command, hook, script) with XML task format | `plugin-dev/plan-component.md` |
| `/plugin-dev/progress` | `[plugin-path] [--verbose]` | Show current plugin development progress including phases, tasks, context, and quality metrics | `plugin-dev/progress.md` |
| `/plugin-dev/resume` | `[plugin-path]` | Resume plugin development from saved state after pause or context compaction | `plugin-dev/resume.md` |
| `/plugin-dev/verify-component` | `[component-path] [--all] [--strict] [--remediate]` | Verify plugin components against quality gates and generate remediation plans | `plugin-dev/verify-component.md` |
| `/plugin-generate-tests` |  | Generate comprehensive test suites for plugins with auto-detection of testable functions and Jest scaffolding | `plugin-generate-tests.md` |
| `/plugin-publish` | `<plugin-name> --bump <patch|minor|major> [--tag] [--push]` | Manage plugin versioning, git tagging, and marketplace publishing | `plugin-publish.md` |
| `/plugin-release` |  | Release Plugin Version with Slack Notification | `plugin-release.md` |
| `/plugin-scaffold` | `[--interactive] [--name <name>] [--domain <domain>]` | Create a new plugin with proper structure, manifests, and boilerplate code | `plugin-scaffold.md` |
| `/plugin-test` | `<plugin-name> [--level all|1|2|3|4|5]` | Run comprehensive integration tests for plugin installation and functionality | `plugin-test.md` |
| `/plugin-validate` | `<plugin-directory> [--strict] [--fix]` | Validate plugin structure, naming, manifests, and quality standards | `plugin-validate.md` |
| `/processreflections` |  | Process open reflections into an implementation-ready improvement plan, then optionally create downstream execution t... | `processreflections.md` |
| `/project-health` | `[--check|--update|--optimize]` | Monitor and maintain project health, configuration, and documentation | `project-health.md` |
| `/promote-skills` |  | Analyze, deduplicate, enrich, and promote skill scaffolds from skills-staging/ to active skills/ | `promote-skills.md` |
| `/quality-dashboard` | `[--plugin <name>] [--threshold <n>] [--trend]` | Generate quality dashboard with agent scores and trends | `quality-dashboard.md` |
| `/skill-scaffold` | `<skill-name> [--type reference|pattern|checklist|workflow] [--plugin <name>]` | Create a new Claude Code skill with proper SKILL.md structure and progressive disclosure | `skill-scaffold.md` |
| `/validate` | `[message] [--skip-notebook] [--skip-guide] [--dry-run]` | Validate build, update development guide, sync to NotebookLM, and push to git | `validate.md` |

### Maintainer Skills

| Skill | Description | File |
|-------|-------------|------|
| `adaptive-routing-feedback-ops` | Use hook feedback loops to update adaptive routing weights and improve agent assignment quality. | `adaptive-routing-feedback-ops/SKILL.md` |
| `context-engineering-patterns` | Context quality management patterns from GSD framework. Use when managing context during long plugin development sess... | `context-engineering-patterns.md` |
| `dev-mode-session-governance-framework` | Control local development-mode session hooks, timeout governance, and component test-first enforcement. | `dev-mode-session-governance-framework/SKILL.md` |
| `devreflect-improvement-pipeline-framework` | Operate the devreflect post-hook pipeline from reflection submission to prevention generation and adaptive updates. | `devreflect-improvement-pipeline-framework/SKILL.md` |
| `goal-backward-plugin-design` | Goal-backward methodology for plugin design. Use when designing plugins by working backward from success criteria. | `goal-backward-plugin-design.md` |
| `plugin-development-quality-gates-framework` | Enforce local maintainer quality gates for plugin components via pre-commit, pre-push, and pre-component hooks. | `plugin-development-quality-gates-framework/SKILL.md` |
| `plugin-discovery-protocol` | Research depth protocol for plugin development. Use when determining how much research is needed before building. | `plugin-discovery-protocol.md` |
| `plugin-task-format` | XML task format specification for plugin development. Use when creating or parsing task specifications. | `plugin-task-format.md` |
| `subagent-output-validation-framework` | Validate subagent outputs and enforce trust/completion quality checks in maintainer workflows. | `subagent-output-validation-framework/SKILL.md` |

Reference guide: `docs/DEVELOPER_TOOLS_GUIDE.md`.

## Runtime Plugin Matrix

<!-- AUTO_GENERATED_START:plugin-matrix -->
| Plugin | Version | Status | Agents | Mandatory Agents | Commands | Skills | Hooks | Scripts |
|--------|---------|--------|--------|------------------|----------|--------|-------|---------|
| `opspal-ai-consult` | 1.4.15 | active | 2 | 0 | 3 | 1 | 1 | 6 |
| `opspal-attio` | 2.0.1 | active | 0 | 0 | 28 | 0 | 21 | 0 |
| `opspal-core` | 2.55.26 | active | 80 | 11 | 126 | 49 | 107 | 605 |
| `opspal-gtm-planning` | 2.3.12 | active | 13 | 1 | 16 | 7 | 4 | 2 |
| `opspal-hubspot` | 3.9.35 | active | 59 | 6 | 33 | 23 | 15 | 109 |
| `opspal-marketo` | 2.6.43 | active | 30 | 24 | 30 | 17 | 25 | 33 |
| `opspal-monday` | 1.4.11 | experimental | 6 | 0 | 1 | 3 | 2 | 3 |
| `opspal-okrs` | 3.0.13 | active | 14 | 1 | 14 | 9 | 4 | 4 |
| `opspal-salesforce` | 3.87.22 | active | 94 | 21 | 59 | 55 | 47 | 1094 |
<!-- AUTO_GENERATED_END:plugin-matrix -->

## Runtime Registry

The complete runtime registry has moved to `docs/PLUGIN_SUITE_CATALOG.md`.
Use `docs/PLUGIN_SUITE_CATALOG.json` for machine-readable inventory data.

## Regeneration

- Generate all docs: `npm run docs:generate`
- Check for drift only: `npm run docs:check`
- Run full docs CI checks locally: `npm run docs:ci`
