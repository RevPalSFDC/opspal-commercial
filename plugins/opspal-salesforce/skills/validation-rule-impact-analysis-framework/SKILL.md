---
name: validation-rule-impact-analysis-framework
description: Salesforce validation-rule impact analysis framework for pre-deploy blast-radius estimation, phased rollout planning, production monitoring, and risk-based rollback decisions.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Validation Rule Impact Analysis Framework

Use this skill when rule changes can disrupt active business processes.

## Workflow

1. Estimate violation impact before deployment.
2. Choose phased rollout strategy.
3. Monitor production adoption/error patterns.
4. Trigger rollback or remediation based on risk thresholds.

## Routing Boundaries

Use this skill for impact/risk analysis and rollout governance.
Use `validation-rule-lifecycle-framework` for full lifecycle execution.
Use `validation-rule-patterns` for formula authoring templates.

## References

- [pre-deploy impact analysis](./predeploy-impact-analysis.md)
- [rollout strategy model](./rollout-strategy-model.md)
- [production monitoring model](./production-monitoring-model.md)
- [rollback decision framework](./rollback-decision-framework.md)
