---
name: joined-report-engineering-framework
description: Salesforce joined-report engineering framework for multi-block design, cross-block formulas, deployment validation, and performance troubleshooting. Use when building or stabilizing joined reports beyond basic report type selection.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Joined Report Engineering Framework

## When to Use This Skill

Use this skill when:
- Building a report that combines data from multiple report types (joined format)
- Implementing cross-block summary formulas
- Troubleshooting joined report performance or rendering issues
- Deploying joined reports via Metadata API

**Not for**: Report type discovery (use `report-type-reference`), standard report CRUD (use `report-api-development-framework`), or dashboard design (use `sfdc-dashboard-designer` agent).

## Joined Report Constraints

| Constraint | Limit |
|-----------|-------|
| Maximum blocks | 5 |
| Block groupings | Up to 2 row groupings per block |
| Cross-block formulas | Aggregate functions only (SUM, AVG, MIN, MAX) |
| Report types per block | Each block can use a different report type |
| Charting | Single chart across all blocks |
| Export | Cannot export to Excel from UI (use API) |
| Bucketing | Not supported in joined reports |
| Cross-filters | Not supported in joined reports |

## Block Architecture

```
Joined Report
├── Block 1: "New Business"     (Report Type: Opportunities)
│   ├── Filter: Type = 'New Customer'
│   └── Grouping: StageName
├── Block 2: "Renewals"         (Report Type: Opportunities)
│   ├── Filter: Type = 'Renewal'
│   └── Grouping: StageName
└── Block 3: "Activities"       (Report Type: Activities with Accounts)
    └── Grouping: ActivityType
```

Cross-block formula example: `Block1:SUM(Amount) + Block2:SUM(Amount)` for total pipeline.

## Workflow

1. Identify the data sources needed — each becomes a block
2. Choose report types that share a common dimension (usually Account or Opportunity)
3. Design block-specific filters and groupings (max 2 groupings per block)
4. Add cross-block summary formulas for combined metrics
5. Deploy via Metadata API and validate in target org

## Routing Boundaries

Use this skill for joined-report engineering.
Use `report-type-reference` for report-type discovery only.
Use `report-api-development-framework` for non-joined general report lifecycle tasks.

## References

- [joined basics](./joined-basics.md)
- [joined advanced](./joined-advanced.md)
- [validation deployment](./validation-deployment.md)
- [troubleshooting optimization](./troubleshooting-optimization.md)
