# Unused Feature Deep Dive: Item 2

This deep dive evaluates Item 2 candidates from the unused-feature audit and classifies whether they should be removed or activated.

## Keep and Activate

### `plugins/opspal-core/scripts/lib/enrichment/base-enricher.js`

- Status: Keep.
- Evidence: Imported by the enrichment pipeline and concrete enrichers (`search-enricher`, `website-enricher`) and covered by unit tests.
- Recommendation: Keep as core abstraction; do not deprecate.

### `plugins/opspal-core/scripts/lib/task-graph/index.js`

- Status: Keep.
- Evidence: Referenced by task-graph hooks, command docs, orchestration scripts, and routing metadata.
- Recommendation: Keep as strategic orchestration primitive; continue investment.

### `plugins/opspal-core/scripts/test-supabase-connection.js`

- Status: Keep.
- Evidence: Used by setup/run scripts and onboarding docs for reflection pipeline validation.
- Recommendation: Keep as operational diagnostics utility.

## Candidate for Limited-Scope Retention

### `plugins/opspal-salesforce/scripts/cli/flow-list.sh`

- Status: Keep with reduced priority.
- Evidence: Lightweight operational CLI utility; low cross-reference footprint but still useful for direct admin workflows.
- Recommendation: Keep but move under explicit “utility/ops” catalog grouping and add a command wrapper if adoption is desired.

### `plugins/opspal-core/scripts/test-slides-populate-only.js`

- Status: Keep only if Google Slides workflow remains active.
- Evidence: Script exists as standalone test utility with minimal integrations.
- Recommendation: Keep behind “diagnostic/manual test” classification; remove only if Slides pipeline is formally sunset.

## Final Decision for Item 2

- Do not remove Item 2 assets at this time.
- Convert low-adoption assets into explicit utility/diagnostic tier instead of deleting.
- Re-evaluate after usage telemetry is available for 2 release cycles.
