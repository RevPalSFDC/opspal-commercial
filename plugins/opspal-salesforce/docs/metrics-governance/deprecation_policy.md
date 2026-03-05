# Metric Deprecation Policy

## Purpose

Ensure deprecated metrics are phased out safely while preserving comparability and auditability.

## Deprecation Stages

1. **Announce**
   - Mark metric as deprecated in `metric_registry.json`
   - Notify stakeholders and document replacement metricId

2. **Parallel Run (Optional)**
   - Maintain old + new metrics in parallel for a defined window
   - Collect semantic diff evidence and reconcile deltas

3. **Sunset**
   - Remove metric from new templates
   - Update dashboards to reference replacement
   - Archive references in migration logs

## Backward Compatibility

- Keep old metric IDs active but flagged as deprecated.
- Provide explicit mapping: `old_metric_id -> new_metric_id`.
- Flag comparisons as unsafe when MAJOR semantic changes occur.

## Required Documentation

- Deprecation rationale
- Replacement metricId
- Transition window
- Validation evidence (pre/post deltas)
