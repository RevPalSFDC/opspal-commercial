# OpsPal Command Telemetry Adoption Pack

Source Fingerprint: `305808dbe315d5f1`

## Objective
Operationalize the command telemetry contract across a high-volume pilot command set and track adoption progress.

## Telemetry Contract Fields
- `timestamp`
- `command`
- `agent`
- `outcome`
- `time_saved_estimate_minutes`
- `human_override`
- `rework_required`
- `risk_class`
- `source_plugin`

## Pilot Instrumentation Markers
- `telemetry-contract`: `opspal-command-telemetry-v1`
- `telemetry-enabled`: `true`, `1`, `yes`, `on`

## Pilot Scope Plugins

| Plugin | Owner | Commands |
|---|---|---:|
| `opspal-core` | `revpal-platform` | 90 |
| `opspal-salesforce` | `revpal-salesforce` | 60 |
| `opspal-hubspot` | `revpal-hubspot` | 34 |
| `opspal-marketo` | `revpal-marketing-ops` | 30 |
| `opspal-gtm-planning` | `revpal-gtm` | 15 |

## Pilot Command Samples

| Plugin | Command | Telemetry Status | Source Path |
|---|---|---|---|
| `opspal-core` | `account-expansion` | `instrumented` | `plugins/opspal-core/commands/account-expansion.md` |
| `opspal-core` | `ace-maintenance` | `instrumented` | `plugins/opspal-core/commands/ace-maintenance.md` |
| `opspal-core` | `asana-checkpoint` | `instrumented` | `plugins/opspal-core/commands/asana-checkpoint.md` |
| `opspal-salesforce` | `activate-flows` | `instrumented` | `plugins/opspal-salesforce/commands/activate-flows.md` |
| `opspal-salesforce` | `analyze-decay-risk` | `instrumented` | `plugins/opspal-salesforce/commands/analyze-decay-risk.md` |
| `opspal-salesforce` | `analyze-layout` | `instrumented` | `plugins/opspal-salesforce/commands/analyze-layout.md` |
| `opspal-hubspot` | `ai-search-optimize` | `instrumented` | `plugins/opspal-hubspot/commands/ai-search-optimize.md` |
| `opspal-hubspot` | `analyze-competitor` | `instrumented` | `plugins/opspal-hubspot/commands/analyze-competitor.md` |
| `opspal-hubspot` | `checkdependencies` | `instrumented` | `plugins/opspal-hubspot/commands/checkdependencies.md` |
| `opspal-marketo` | `activity-report` | `instrumented` | `plugins/opspal-marketo/commands/activity-report.md` |
| `opspal-marketo` | `analyze-performance` | `instrumented` | `plugins/opspal-marketo/commands/analyze-performance.md` |
| `opspal-marketo` | `api-usage` | `instrumented` | `plugins/opspal-marketo/commands/api-usage.md` |
| `opspal-gtm-planning` | `forecast` | `instrumented` | `plugins/opspal-gtm-planning/commands/forecast.md` |
| `opspal-gtm-planning` | `gtm-arr-waterfall` | `instrumented` | `plugins/opspal-gtm-planning/commands/gtm-arr-waterfall.md` |
| `opspal-gtm-planning` | `gtm-comp` | `instrumented` | `plugins/opspal-gtm-planning/commands/gtm-comp.md` |

## Adoption Baseline
- Pilot commands total: 15
- Telemetry enabled commands: 15
- Current adoption ratio: 1
- Target adoption ratio: 0.8

## Control-Plane Command Adoption Baseline

| Command | Telemetry Status | Source Plugin | Source Path |
|---|---|---|---|
| `copilot:approval` | `instrumented` | `opspal-core` | `scripts/copilot-approval-queue.js` |
| `next-actions:generate` | `instrumented` | `opspal-core` | `scripts/generate-next-best-actions.js` |
| `next-actions:promote` | `instrumented` | `opspal-core` | `scripts/promote-approved-actions.js` |
| `exec:generate` | `instrumented` | `opspal-core` | `scripts/generate-exec-gap-analysis.js` |
| `exec:validate` | `instrumented` | `opspal-core` | `scripts/validate-exec-gap-analysis.js` |

- Control-plane commands total: 5
- Telemetry enabled commands: 5
- Current adoption ratio: 1
- Target adoption ratio: 1

## Rollout Phases

| Phase | Scope | Target Ratio |
|---|---|---:|
| `phase_1` | Top-volume pilot commands | 0.4 |
| `phase_2` | All pilot commands | 0.8 |
| `phase_3` | Suite-wide command coverage | 0.9 |
