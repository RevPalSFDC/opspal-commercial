# Metric Approval Workflow

## Scope

Applies to all additions or changes to `metric_registry.json` and any metric definitions used in report templates.

## Workflow Steps

1. **Proposal**
   - Submit metric definition and change request
   - Include numerator/denominator and field mapping

2. **Technical Review**
   - Validate object availability and field mappings
   - Run semantic diff against current metrics

3. **Business Review**
   - RevOps and finance (if revenue-related)
   - Confirm KPI meaning and decision alignment

4. **Governance Approval**
   - Required for Tier 2+ and Tier 3 metrics

5. **Implementation**
   - Update registry + templates
   - Add validation tests and run in sandbox

6. **Rollout**
   - Communicate changes
   - Monitor for semantic drift or trust erosion

## Approvers by Tier

| Tier | Approvers |
| --- | --- |
| Tier 0 | Team lead |
| Tier 1 | RevOps manager |
| Tier 2 | RevOps + Finance |
| Tier 3 | Governance council + exec sponsor |
