# Planning Calendar Templates

## Standard 12-Week Timeline

```
Week 1  │ Phase 0: Initialize
        │ - Create workspace
        │ - Validate connectivity
        │ - Kick-off meeting
        ├─────────────────────────────────
Week 2  │ Phase 1: Data & Validate
        │ - Export historical data
        │ - Quality analysis
        ├─────────────────────────────────
Week 3  │ Phase 1 (cont) + Phase 2
        │ - Complete data validation
        │ - DATA-001 approval
        │ - Begin attribution analysis
        ├─────────────────────────────────
Week 4  │ Phase 2 + Phase 3 Start
        │ - ATTR-001 approval
        │ - Begin scenario modeling
        ├─────────────────────────────────
Week 5  │ Phase 3: Scenario Modeling
        │ - Monte Carlo simulations
        │ - Sensitivity analysis
        │ - Back-testing
        ├─────────────────────────────────
Week 6  │ Phase 3 (cont) + Phase 4 Start
        │ - SCEN-001 approval
        │ - Begin territory design
        ├─────────────────────────────────
Week 7  │ Phase 4: Territories & ROE
        │ - Territory carving
        │ - Fairness validation
        │ - ROE documentation
        ├─────────────────────────────────
Week 8  │ Phase 4 (cont) + Phase 5 Start
        │ - TERR-001 approval
        │ - Begin GTM motions
        │ - Begin comp planning
        ├─────────────────────────────────
Week 9  │ Phase 5: GTM & Comp
        │ - Complete playbook
        │ - UAT testing
        │ - GTM-001 approval
        ├─────────────────────────────────
Week 10 │ Phase 5 (cont) + Phase 6 Start
        │ - COMP-001 approval
        │ - Begin KPI catalog
        │ - Start packaging
        ├─────────────────────────────────
Week 11 │ Phase 6: KPI & Packaging
        │ - Complete deliverables
        │ - Generate quota letters
        │ - FINAL-001 approval
        ├─────────────────────────────────
Week 12+│ Phase 7: Implementation
        │ - Sandbox deployment
        │ - Production cutover
        │ - 72hr monitoring
```

## Compressed 8-Week Timeline

For urgent planning cycles:

```
Week 1-2 │ Phase 0 + Phase 1
         │ - Initialize + Data validation
         │ - DATA-001 approval (end of Week 2)
         ├─────────────────────────────────
Week 3   │ Phase 2 + Phase 3 (parallel)
         │ - Attribution + Scenarios start
         │ - ATTR-001 approval
         ├─────────────────────────────────
Week 4   │ Phase 3 + Phase 4 (parallel)
         │ - SCEN-001 approval
         │ - Territory design start
         ├─────────────────────────────────
Week 5   │ Phase 4 + Phase 5 (parallel)
         │ - TERR-001 approval
         │ - GTM + Comp start
         ├─────────────────────────────────
Week 6   │ Phase 5 (cont)
         │ - GTM-001 + COMP-001 approvals
         ├─────────────────────────────────
Week 7   │ Phase 6
         │ - Packaging + FINAL-001
         ├─────────────────────────────────
Week 8   │ Phase 7
         │ - Implementation + monitoring
```

## Key Milestones

### Pre-Planning (T-4 weeks)

| Task | Owner | Due |
|------|-------|-----|
| Board targets finalized | CFO | T-4 |
| Headcount plan approved | COO | T-3 |
| Planning team assembled | RevOps | T-2 |
| Templates prepared | RevOps | T-1 |
| Kick-off scheduled | CRO | T-0 |

### During Planning

| Milestone | Phase | Week | Approver |
|-----------|-------|------|----------|
| DATA-001 | 1 | 3 | Data Steward |
| ATTR-001 | 2 | 4 | CMO/RevOps |
| SCEN-001 | 3 | 6 | CFO/CRO |
| TERR-001 | 4 | 8 | VP Sales |
| GTM-001 | 5 | 9 | CRO |
| COMP-001 | 5 | 10 | CFO/Comp Cmte |
| FINAL-001 | 6 | 11 | Executive Team |

### Post-Planning (T+1 to T+4 weeks)

| Task | Owner | Due |
|------|-------|-----|
| Sandbox deployment | RevOps | T+1 |
| UAT completion | Sales Ops | T+2 |
| Production cutover | RevOps | T+3 |
| Rep enablement | Enablement | T+4 |
| Quota letters sent | CRO | T+4 |

## Meeting Cadence

### Weekly Status

```yaml
Weekly Planning Status:
  Frequency: Weekly
  Duration: 30 minutes
  Attendees:
    - Planning Lead
    - Data Team
    - RevOps
    - Sales Leadership (as needed)

  Agenda:
    1. Progress review (5 min)
    2. Blocker discussion (10 min)
    3. Next week priorities (10 min)
    4. Action items (5 min)
```

### Approval Meetings

```yaml
Approval Checkpoint Meeting:
  Frequency: Per checkpoint
  Duration: 60 minutes
  Attendees:
    - Approver(s)
    - Planning Lead
    - Subject matter experts

  Agenda:
    1. Summary presentation (15 min)
    2. Q&A (20 min)
    3. Discussion/concerns (15 min)
    4. Decision (10 min)

  Materials (24hr in advance):
    - 1-page summary
    - Supporting data
    - Risk assessment
    - Recommendation
```

### Executive Review

```yaml
Executive Planning Review:
  Frequency: Bi-weekly
  Duration: 60 minutes
  Attendees:
    - CEO/COO
    - CFO/CRO
    - Planning Lead

  Agenda:
    1. Overall status (10 min)
    2. Key decisions needed (20 min)
    3. Risk review (15 min)
    4. Resource needs (15 min)
```

## Risk Management

### Common Delays

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data quality issues | 1-2 weeks | Early validation |
| Approval delays | 1 week each | Pre-aligned stakeholders |
| Model iterations | 1-2 weeks | Clear acceptance criteria |
| Technical issues | 1 week | Sandbox testing |

### Escalation Path

```
Day 1-2: Working level resolution
Day 3-4: Manager escalation
Day 5+:  Executive escalation
```
