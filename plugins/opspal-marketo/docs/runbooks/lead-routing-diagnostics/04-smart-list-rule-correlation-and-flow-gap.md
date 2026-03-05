# 04 - Smart List Rule Correlation and Flow Gap

## Goal

Map observed lead events/state to Smart Campaign Smart List rules and clearly document the REST flow-step visibility gap.

## APIs

- `mcp__marketo__campaign_get`
- `mcp__marketo__campaign_get_smart_list({ includeRules: true })`
- `mcp__marketo__lead_smart_campaign_membership`

## Procedure

1. Enumerate candidate campaigns from membership and incident context.
2. Retrieve campaign metadata:
   - active status
   - triggerable/requestable flags
   - qualification mode
3. Retrieve Smart List rules with `includeRules=true`.
4. Correlate trigger/filter requirements against activity and lead-state evidence.

## Flow Visibility Constraint

Marketo Flow steps are not documented as REST-readable. Treat flow diagnostics as:
- template-governed behavior
- inferred from downstream activities and lead changes
- UI verification only when required

## Evidence to Persist

- campaign metadata + smart list rule JSON
- qualification and requestability interpretation
- explicit note when flow-step details require UI
