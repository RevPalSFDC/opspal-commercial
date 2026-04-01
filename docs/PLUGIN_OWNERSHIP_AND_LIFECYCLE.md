# Plugin Ownership and Lifecycle

> Auto-generated. Do not edit manually.
> Source of truth: runtime plugin manifests and lifecycle metadata under `plugins/opspal-*/.claude-plugin/`.

## Policy

- Required plugin lifecycle fields: `status`, `owner`, `stability`, `last_reviewed_at`.
- Deprecated plugins should define `replaced_by` and `deprecation_date`.
- Freshness SLA for `last_reviewed_at`: warning after 90 days, gate failure after 120 days.

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
| `opspal-ai-consult` | 1.4.13 | `active` | `revpal-ai` | `stable` | `2026-02-15` | _unset_ | _unset_ |
| `opspal-core` | 2.50.3 | `active` | `revpal-platform` | `stable` | `2026-02-15` | _unset_ | _unset_ |
| `opspal-data-hygiene` | 1.2.5 | `deprecated` | `revpal-platform` | `deprecated` | `2026-02-15` | `2026-02-15` | `opspal-core` |
| `opspal-gtm-planning` | 2.3.6 | `active` | `revpal-gtm` | `stable` | `2026-02-15` | _unset_ | _unset_ |
| `opspal-hubspot` | 3.9.21 | `active` | `revpal-hubspot` | `stable` | `2026-02-15` | _unset_ | _unset_ |
| `opspal-marketo` | 2.6.30 | `active` | `revpal-marketing-ops` | `stable` | `2026-02-15` | _unset_ | _unset_ |
| `opspal-monday` | 1.4.9 | `experimental` | `revpal-experimental` | `experimental` | `2026-02-15` | _unset_ | _unset_ |
| `opspal-okrs` | 3.0.10 | `active` | `revpal-strategy` | `experimental` | `2026-03-10` | _unset_ | _unset_ |
| `opspal-salesforce` | 3.86.22 | `active` | `revpal-salesforce` | `stable` | `2026-02-15` | _unset_ | _unset_ |

_End of auto-generated ownership and lifecycle report._
