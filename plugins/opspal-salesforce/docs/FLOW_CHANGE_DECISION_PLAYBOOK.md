# Flow Change Decision Playbook

## Purpose

Define a deterministic governance process for deciding whether a Salesforce Flow change should:
- update an existing Flow version
- create a net-new Flow
- refactor with subflow extraction

Primary engine: `scripts/lib/flow-change-strategy-engine.js`  
Primary entrypoint: `scripts/lib/flow-preflight-checker.js`

## Inputs Required

Minimum:
- `flowApiName`
- `object`
- `triggerType`

Recommended for high-confidence decisions:
- `proposedAction` (`update`, `new`, `auto`)
- `capabilityDomain`
- `entryCriteria`
- `requiresAsyncOrdering`
- `expandsPrivilegedScope`
- `hasGuardConditions`

## Weighted Criteria

Scores are 1-5 per option (`update` and `new`), then normalized to weighted totals.

| Criterion | Weight |
|---|---:|
| Functional overlap and cohesion | 20 |
| Regression and blast radius risk | 20 |
| Complexity impact | 15 |
| Performance and limits risk | 15 |
| Testing feasibility | 15 |
| Rollback simplicity | 10 |
| Governance maintainability | 5 |

Tie policy:
- If weighted totals are within threshold (`<= 5` by default), apply safety tie-break using blast-radius and rollback simplicity.

## Enforcement Modes

- `risk-based` (default): block only critical issues
- `strict`: block on any warning or critical issue
- `advisory`: never block; convert blocking issues to advisories

## Severity Model

Critical (`blockingIssues`):
- async ordering dependency requires strict sequencing
- net-new Flow in existing trigger context without explicit entry criteria
- trigger ordering ambiguity with proven same-order race
- entry criteria contradictions
- privileged scope expansion without guard conditions

Warning (`warnings`):
- missing capability domain
- missing entry criteria metadata
- high automation density
- non-blocking diagnostics or best-effort analysis gaps

## Rollback Expectations

- `update_existing`: reactivate prior known-good version
- `create_new`: deactivate new Flow, restore previous trigger ordering
- `refactor_with_subflow`: keep parent rollback point + subflow activation plan

## JSON Decision Contract

```json
{
  "decision": {
    "recommendedStrategy": "create_new",
    "weightedScores": {
      "update": 66.0,
      "new": 71.0
    },
    "blockingIssues": [],
    "warnings": [
      "Entry criteria not provided; overlap risk cannot be fully evaluated."
    ],
    "requiredActions": [
      "Document explicit entry criteria to reduce overlap risk."
    ],
    "rationale": [
      "Weighted totals: update=66, new=71 (delta=5)."
    ],
    "confidence": 0.74
  }
}
```

## Operational Workflow

1. Run `flow-preflight-checker` with strategy inputs.
2. Review `decision.recommendedStrategy`.
3. Resolve `blockingIssues` according to enforcement mode.
4. Execute change path (`update`, `new`, or `refactor`).
5. Re-run preflight and diagnostic tests before deployment.
