---
name: validation-rule-lifecycle-framework
description: End-to-end Salesforce validation rule lifecycle for design, testing, deployment, monitoring, rollback, and segmented rule evolution. Use when implementing or operating validation rules beyond formula authoring.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Validation Rule Lifecycle Framework

## When to Use This Skill

Use this skill when:
- Creating a validation rule from design through production deployment
- Managing the full lifecycle: design, test, deploy, monitor, maintain
- Decommissioning or replacing outdated validation rules
- Auditing existing rules for conflicts, redundancy, or performance

**Not for**: Formula authoring templates (use `validation-rule-patterns`), impact/rollout analysis only (use `validation-rule-impact-analysis-framework`), or general deployment (use `deployment-state-management-framework`).

## Lifecycle Stages

| Stage | Activities | Gate Criteria |
|-------|-----------|---------------|
| **Design** | Define intent, choose object, write formula | Formula compiles, covers intended scenario |
| **Test** | Sandbox testing, bulk data validation | No false positives on 1,000+ record sample |
| **Deploy** | Impact analysis, sandbox → production | Violation rate <5%, rollback plan documented |
| **Monitor** | Track error rates, user feedback | Error rate stable after 48 hours |
| **Maintain** | Update formula, deactivate obsolete rules | Documented reason for each change |

## Key Commands

```bash
# List active validation rules on an object
sf data query --query "SELECT Id, ValidationName, Active, Description, ErrorMessage FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = 'Opportunity' AND Active = true" --target-org <org> --use-tooling-api

# Deploy a validation rule
sf project deploy start --metadata "ValidationRule:Opportunity.My_Rule" --target-org <org>

# Deactivate by retrieving, setting Active=false, redeploying
```

## Rule Naming Convention

`{Object}_{Purpose}_{Scope}` — e.g., `Opp_Require_CloseDate_On_Won`

## Workflow

1. Define rule intent: what data condition should be prevented
2. Write formula using `validation-rule-patterns` for common templates
3. Test in sandbox with bulk data (200+ records) and edge cases
4. Run impact analysis (use `validation-rule-impact-analysis-framework`)
5. Deploy with monitoring plan and documented rollback procedure

## Routing Boundaries

Use this skill for lifecycle operations and governance.
Use `validation-rule-patterns` for formula snippets and template lookup only.

## References

- [design and segmentation](./design-segmentation.md)
- [testing deployment](./testing-deployment.md)
- [monitoring maintenance](./monitoring-maintenance.md)
- [troubleshooting rollback](./troubleshooting-rollback.md)
