---
name: gtm-annual-planning-framework
description: GTM annual planning orchestration methodology with 7-phase workflow and approval gates. Use when initiating annual planning cycles, coordinating planning workstreams, managing approval checkpoints, executing multi-agent planning workflows, or packaging final GTM deliverables.
allowed-tools: Read, Grep, Glob
---

# GTM Annual Planning Framework

## When to Use This Skill

- Initiating GTM annual planning cycles
- Coordinating multiple planning workstreams
- Managing approval checkpoints (DATA-001, ATTR-001, etc.)
- Executing multi-agent planning workflows
- Packaging final GTM plan deliverables

## Quick Reference

### 7-Phase Workflow

```
Phase 0: Initialize (Week 1)
    ↓
Phase 1: Data/Validate (Week 2-3) → DATA-001 Approval
    ↓
Phase 2: Attribution (Week 3) → ATTR-001 Approval
    ↓
Phase 3: Model Scenarios (Week 4-5) → SCEN-001 Approval
    ↓
Phase 4: Territories/ROE (Week 6-7) → TERR-001 Approval
    ↓
Phase 5: GTM/Comp (Week 8-9) → GTM-001 + COMP-001 Approvals
    ↓
Phase 6: KPI/Package (Week 10-11) → FINAL-001 Approval
    ↓
Phase 7: Implementation (Week 12+)
```

### Approval Checkpoints

| ID | Artifact | Approver | Criteria |
|----|----------|----------|----------|
| DATA-001 | Data validation | Data Steward | ≥95% completeness |
| ATTR-001 | Attribution policy | CMO/RevOps | ≤10% variance |
| SCEN-001 | Scenario models | CFO/CRO | P50 = targets |
| TERR-001 | Territory design | VP Sales | Gini ≤0.3 |
| GTM-001 | GTM playbook | CRO | Strategy aligned |
| COMP-001 | Comp plans | CFO | UAT <1% error |

### Sub-Agent Roster

| Agent | Purpose |
|-------|---------|
| gtm-data-insights | Historical data + quality |
| gtm-attribution-governance | Attribution models |
| gtm-quota-capacity | Scenario modeling |
| gtm-territory-designer | Territory carving |
| gtm-strategy-planner | GTM playbook |
| gtm-comp-planner | Compensation plans |

## Detailed Documentation

See supporting files:
- `7-phase-methodology.md` - Complete phase workflow
- `market-analysis.md` - Market assessment framework
- `territory-design.md` - Territory planning patterns
- `timeline-templates.md` - Planning calendar
