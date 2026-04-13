---
name: validation-rule-impact-analysis-framework
description: Salesforce validation-rule impact analysis framework for pre-deploy blast-radius estimation, phased rollout planning, production monitoring, and risk-based rollback decisions.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Validation Rule Impact Analysis

## When to Use This Skill

Use this skill when:
- Deploying a new validation rule that may block existing user workflows
- Estimating how many records would violate a proposed rule formula
- Planning a phased rollout strategy for high-impact rules
- Deciding whether to deactivate a rule during bulk data loads
- Monitoring production error rates after rule activation

**Not for**: Full rule lifecycle (use `validation-rule-lifecycle-framework`), formula authoring (use `validation-rule-patterns`), or deployment execution (use `deployment-state-management-framework`).

## Pre-Deploy Impact Estimation

Before activating a new validation rule, estimate the blast radius:

```bash
# Count records that would VIOLATE the proposed rule
# Example: "CloseDate required when Stage = Closed Won"
sf data query --query "SELECT COUNT(Id) FROM Opportunity WHERE StageName = 'Closed Won' AND CloseDate = null" --target-org <org>
```

| Violation Rate | Risk Level | Rollout Strategy |
|----------------|-----------|-----------------|
| 0% | Low | Deploy directly to production |
| <1% | Low | Deploy with monitoring |
| 1-5% | Medium | Data remediation first, then deploy |
| 5-20% | High | Phased rollout with bypass for backfill |
| >20% | Critical | Remediate data before activation |

## Phased Rollout Options

1. **Sandbox validation only** - Deploy active in sandbox, run bulk test, review violations
2. **Production inactive** - Deploy as inactive, enable manually after data cleanup
3. **Profile-scoped** - Add `$Profile.Name != 'Data Migration'` to exempt bulk loaders
4. **Time-gated** - Add `CreatedDate >= TODAY` to exempt historical records

## Post-Activation Monitoring

```bash
# Check for validation rule errors in recent logs
sf data query --query "SELECT Id, ValidationName, Active FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = '<Object>' AND Active = true" --target-org <org> --use-tooling-api
```

## Rollback Decision

| Signal | Threshold | Action |
|--------|-----------|--------|
| User complaints | >5 in first hour | Investigate, consider deactivation |
| Error rate | >10% of save operations | Deactivate, remediate, re-enable |
| Integration failures | Any sync failures | Deactivate immediately, check field mappings |
| Executive escalation | Any | Deactivate first, investigate second |

## Routing Boundaries

Use this skill for impact/risk analysis and rollout governance.
Use `validation-rule-lifecycle-framework` for full lifecycle execution.
Use `validation-rule-patterns` for formula authoring templates.

## References

- [pre-deploy impact analysis](./predeploy-impact-analysis.md)
- [rollout strategy model](./rollout-strategy-model.md)
- [production monitoring model](./production-monitoring-model.md)
- [rollback decision framework](./rollback-decision-framework.md)
