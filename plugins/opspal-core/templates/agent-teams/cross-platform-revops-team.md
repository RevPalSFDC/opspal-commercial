# Team Template: Cross-Platform RevOps Assessment

> **BLOCKED: Requires Agent Teams GA**

## Team Purpose

Run Salesforce and HubSpot RevOps audits simultaneously, with a unified reporting agent combining findings in real-time. Agents share discoveries about data sync gaps, process misalignment, and cross-platform metrics discrepancies.

## Team Structure

```
Team Lead: cross-platform-revops-coordinator
├── Teammate 1: sfdc-revops-auditor (model: opus)
├── Teammate 2: hubspot-assessment-analyzer (model: sonnet)
└── Teammate 3: unified-reporting-aggregator (model: sonnet)
```

### Roles

| Agent | Role | Display Mode |
|-------|------|-------------|
| `cross-platform-revops-coordinator` | Orchestrates team, reconciles findings | `delegate` |
| `sfdc-revops-auditor` | Salesforce pipeline, forecast, process analysis | `full` |
| `hubspot-assessment-analyzer` | HubSpot workflow, lifecycle, attribution analysis | `full` |
| `unified-reporting-aggregator` | Combines metrics, identifies cross-platform gaps | `full` |

### Communication Pattern

```
sfdc-revops-auditor ──SendMessage──> hubspot-assessment-analyzer
  "SF shows 142 open opportunities - does HS deal count match?"

hubspot-assessment-analyzer ──SendMessage──> sfdc-revops-auditor
  "HS shows 138 deals - 4 records not syncing. Contact IDs: ..."

Both ──SendMessage──> unified-reporting-aggregator
  "Add sync gap to cross-platform findings section"
```

## Expected Benefits

- **Time**: ~50% reduction (parallel platform analysis)
- **Quality**: Real-time cross-platform reconciliation catches sync gaps
- **Cost**: ~3x token cost vs sequential

## Sequential Equivalent (Current)

```
1. Task(sfdc-revops-auditor, "Run RevOps audit for {org}")
2. Task(hubspot-assessment-analyzer, "Run HubSpot assessment for {org}")
3. Task(unified-reporting-aggregator, "Combine findings from both platforms")
```

## When to Use

- Dual-platform clients (SF + HubSpot)
- When cross-platform data consistency is a key concern
- Initial client onboarding assessments
