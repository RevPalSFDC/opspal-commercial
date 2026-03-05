# Automation and Performance Guardrails

## Purpose

Prevent trigger overload, maintain healthy campaign queues, and enforce automation governance for Marketo smart campaigns.

## Trigger vs Batch Decision Matrix

Use triggers only for time-sensitive actions. Move everything else to batch.

| Criteria | Trigger | Batch |
|----------|---------|-------|
| Needs action within minutes | Yes | No |
| High daily volume | Avoid | Prefer |
| External system expects real-time | Yes | No |
| Recalculation or scoring | Avoid | Prefer |
| Data cleanup | No | Yes |

## Guardrail Patterns

### 1. Volume Safeguards for Trigger Campaigns

**Use when**: A trigger can fire on high-volume changes (imports, field updates, form fills).

**Implementation**:
- Add narrow constraints on triggers (specific field and new value)
- Add restrictive filters before heavy flow steps
- Use a buffer pattern: trigger -> add to list or set flag -> batch processes list

**Validation**:
- Run test with 100-500 records in sandbox
- Verify campaign results do not spike in a single minute

### 2. Qualification Rule Standards

**Default rules**:
- One-time actions: "Each person can run through once"
- Recurring actions: "Once every X days"
- Avoid "Every time" unless explicitly approved

**Audit**:
- Review all active triggers quarterly
- Log exceptions with owners

### 3. Trigger Consolidation

**Problem**: Multiple campaigns using the same trigger.

**Remedy**:
- Consolidate into one campaign with choice steps
- Use branching logic to reduce trigger count

### 4. Campaign Queue Protection

**Operational Checks**:
- Admin > Campaign Queue
- Investigate backlog warnings or long wait times

**Responses**:
- Pause the offending campaign
- Break large batches into smaller lists
- Reschedule heavy batches to off-peak

### 5. Communication Limits and Operational Emails

**Rules**:
- Do not mark emails as operational unless truly required
- Use communication limits as a safety net
- If skips are high, reduce overlapping campaigns or re-segment

### 6. Token and Snippet Governance

**Risk**: Logic sprawl and stale content.

**Controls**:
- Keep a single source of truth for global tokens
- Review tokens quarterly
- Use snippets for legal and footer content

## Performance Checklist

### Trigger Campaigns
- [ ] Trigger constraints are specific
- [ ] Qualification rule is set correctly
- [ ] No circular dependencies
- [ ] Choice steps handle null or missing values

### Batch Campaigns
- [ ] Scheduled off-peak for large audiences
- [ ] Filters are efficient and minimal
- [ ] Uses "Was not sent" or flag to avoid repeats

### Flow Steps
- [ ] Critical steps appear early in flow
- [ ] Wait steps are justified
- [ ] External calls have fallback paths

## Metrics to Track

| Metric | Target | Evidence Source |
|--------|--------|------------------|
| Active trigger campaigns | Baseline | Campaign Inspector |
| Campaign backlog | None persistent | Campaign Queue |
| Avg batch duration | Baseline | Campaign Results |
| Trigger execution spikes | None | Campaign Results |
| API usage | < 80% daily | Admin > Web Services |

## Manual Validation Steps

1. Review top 20 active triggers for constraints and qualification rules.
2. Check campaign queue during peak hours.
3. Identify campaigns with unusually high daily runs.
4. Document remediation actions in governance evidence.

## Operationalization

Use hybrid governance audit mode to capture trigger counts and naming compliance:

```
/marketo-governance-audit [instance] --mode=hybrid
```

## Related Runbooks

- `../campaign-operations/trigger-campaign-best-practices.md`
- `../performance/api-optimization-guide.md`
- `../assessments/quarterly-audit-procedure.md`
- `../campaign-diagnostics/README.md`
