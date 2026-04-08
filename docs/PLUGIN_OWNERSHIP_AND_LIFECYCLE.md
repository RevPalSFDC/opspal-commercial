# Plugin Ownership and Lifecycle

> Auto-generated. Do not edit manually.
> Source of truth: runtime plugin manifests and lifecycle metadata under `plugins/opspal-*/.claude-plugin/`.

## Policy

- Required plugin lifecycle fields: `status`, `owner`, `stability`, `last_reviewed_at`.
- Deprecated plugins should define `replaced_by` and `deprecation_date`.
- Freshness SLA for `last_reviewed_at`: warning after 90 days, gate failure after 120 days (see `docs:verify-lifecycle-metadata`).
- Deprecation and sunset policy: `docs/PLUGIN_DEPRECATION_POLICY.md`.

## Coverage Summary

- Plugins scanned: 9
- Missing status: 0
- Missing owner: 0
- Missing stability: 0
- Missing last_reviewed_at: 0
- Deprecated plugins missing replacement: 0

## Ownership and Lifecycle Matrix

| Plugin | Version | Status | Owner | Stability | Last Reviewed | Deprecation Date | Replaced By |
|--------|---------|--------|-------|-----------|---------------|------------------|-------------|
| `opspal-ai-consult` | 1.4.14 | active | `revpal-ai` | `stable` | `2026-02-15` | _unset_ | _unset_ |
| `opspal-core` | 2.54.22 | active | `revpal-platform` | `stable` | `2026-02-15` | _unset_ | _unset_ |
| `opspal-data-hygiene` | 1.2.2 | deprecated | `revpal-platform` | `deprecated` | `2026-02-15` | `2026-02-15` | `opspal-core` |
| `opspal-gtm-planning` | 2.3.9 | active | `revpal-gtm` | `stable` | `2026-02-15` | _unset_ | _unset_ |
| `opspal-hubspot` | 3.9.27 | active | `revpal-hubspot` | `stable` | `2026-02-15` | _unset_ | _unset_ |
| `opspal-marketo` | 2.6.37 | active | `revpal-marketing-ops` | `stable` | `2026-02-15` | _unset_ | _unset_ |
| `opspal-monday` | 1.4.9 | experimental | `revpal-experimental` | `experimental` | `2026-02-15` | _unset_ | _unset_ |
| `opspal-okrs` | 3.0.12 | active | `revpal-strategy` | `experimental` | `2026-03-10` | _unset_ | _unset_ |
| `opspal-salesforce` | 3.87.8 | active | `revpal-salesforce` | `stable` | `2026-02-15` | _unset_ | _unset_ |

_End of auto-generated ownership and lifecycle report._
