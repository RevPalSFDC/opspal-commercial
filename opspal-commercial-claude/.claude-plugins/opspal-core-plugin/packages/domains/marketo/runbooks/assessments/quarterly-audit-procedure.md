# Quarterly Audit Procedure

## Purpose

Standardized procedure for conducting quarterly Marketo instance audits.

## Schedule

| Quarter | Month | Audit Focus |
|---------|-------|-------------|
| Q1 | January | Full audit + annual cleanup |
| Q2 | April | Program performance + ROI |
| Q3 | July | Lead quality + data hygiene |
| Q4 | October | Deliverability + compliance |

## Audit Checklist

### Phase 1: Preparation (Day 1)

- [ ] Schedule audit window (2-4 hours uninterrupted)
- [ ] Notify stakeholders
- [ ] Review previous quarter's audit
- [ ] Note any known issues to investigate
- [ ] Gather access to all required tools

### Phase 2: Lead Quality Assessment (Day 1-2)

**Run Assessment**:
```
Task(subagent_type='marketo-lead-quality-assessor', prompt='
  Perform comprehensive lead quality assessment:
  - Analyze database completeness
  - Identify duplicates
  - Find stale leads
  - Validate scoring model
  - Generate quality report
')
```

**Key Metrics to Capture**:
| Metric | Target | This Quarter |
|--------|--------|--------------|
| Overall Quality Score | > 70 | _____ |
| Duplicate Rate | < 2% | _____ |
| Stale Lead Rate | < 20% | _____ |
| Completeness Score | > 75 | _____ |
| Invalid Email Rate | < 2% | _____ |

**Actions**:
- [ ] Document quality score
- [ ] List top 5 issues found
- [ ] Create remediation tasks
- [ ] Schedule cleanup operations

### Phase 3: Program Performance Review (Day 2)

**Run Assessment**:
```
Task(subagent_type='marketo-program-roi-assessor', prompt='
  Analyze program performance for the quarter:
  - Calculate ROI by program and channel
  - Identify top and bottom performers
  - Analyze attribution
  - Generate recommendations
')
```

**Key Metrics**:
| Metric | Target | This Quarter |
|--------|--------|--------------|
| Avg Program ROI | > 3x | _____ |
| MQL Conversion | > 20% | _____ |
| Cost per MQL | < $50 | _____ |
| Pipeline Generated | Goal | _____ |

**Actions**:
- [ ] Document ROI by channel
- [ ] Flag underperforming programs
- [ ] Identify optimization opportunities
- [ ] Update program templates

### Phase 4: Automation Health Check (Day 2-3)

**Run Assessment**:
```
Task(subagent_type='marketo-automation-auditor', prompt='
  Audit automation health:
  - Map campaign dependencies
  - Detect trigger conflicts
  - Analyze execution order
  - Identify optimization opportunities
')
```

**Key Metrics**:
| Metric | Target | This Quarter |
|--------|--------|--------------|
| Active Campaigns | Baseline | _____ |
| Circular Dependencies | 0 | _____ |
| Trigger Conflicts | < 5 | _____ |
| Avg Complexity Score | < 30 | _____ |

**Actions**:
- [ ] Resolve circular dependencies
- [ ] Address trigger conflicts
- [ ] Simplify complex campaigns
- [ ] Archive unused campaigns

### Phase 5: Email Deliverability Audit (Day 3)

**Run Assessment**:
```
Task(subagent_type='marketo-email-deliverability-auditor', prompt='
  Audit email deliverability:
  - Analyze bounce and spam rates
  - Check compliance elements
  - Review engagement trends
  - Identify at-risk emails
')
```

**Key Metrics**:
| Metric | Target | This Quarter |
|--------|--------|--------------|
| Delivered Rate | > 98% | _____ |
| Open Rate | > 20% | _____ |
| Click Rate | > 2% | _____ |
| Bounce Rate | < 2% | _____ |
| Spam Rate | < 0.1% | _____ |

**Actions**:
- [ ] Fix compliance issues
- [ ] Clean invalid emails
- [ ] Review underperforming templates
- [ ] Update sender reputation

### Phase 6: Sync Health Review (Day 3-4)

**Run Assessment**:
```
Task(subagent_type='marketo-sfdc-sync-specialist', prompt='
  Review Salesforce sync health:
  - Check connection status
  - Analyze error rates
  - Validate field mappings
  - Review sync rules
')
```

**Key Metrics**:
| Metric | Target | This Quarter |
|--------|--------|--------------|
| Sync Success Rate | > 98% | _____ |
| Error Rate | < 2% | _____ |
| Avg Sync Latency | < 5 min | _____ |
| Queue Depth | < 500 | _____ |

**Actions**:
- [ ] Resolve sync errors
- [ ] Update field mappings
- [ ] Optimize sync rules
- [ ] Document configuration

### Phase 7: API & Performance Review (Day 4)

**Run Assessment**:
```
Task(subagent_type='marketo-performance-optimizer', prompt='
  Analyze API and performance:
  - Review API usage patterns
  - Identify optimization opportunities
  - Check rate limit health
  - Generate recommendations
')
```

**Key Metrics**:
| Metric | Target | This Quarter |
|--------|--------|--------------|
| Avg Daily API Usage | < 70% | _____ |
| Batch Utilization | > 80% | _____ |
| Error Rate | < 2% | _____ |
| Avg Response Time | < 1s | _____ |

**Actions**:
- [ ] Implement caching
- [ ] Optimize batch operations
- [ ] Schedule heavy operations
- [ ] Update monitoring

### Phase 8: Governance Review (Day 4)

**Run Assessment**:
```
Task(subagent_type='marketo-governance-enforcer', prompt='
  Review governance compliance:
  - Audit approval workflows
  - Check compliance status
  - Review access controls
  - Generate audit trail
')
```

**Key Metrics**:
| Metric | Target | This Quarter |
|--------|--------|--------------|
| Compliance Score | 100% | _____ |
| Audit Trail Complete | 100% | _____ |
| Approval Compliance | 100% | _____ |
| Policy Violations | 0 | _____ |

**Actions**:
- [ ] Address compliance gaps
- [ ] Update policies
- [ ] Refresh training
- [ ] Archive audit logs

### Phase 9: Report Generation (Day 5)

**Generate Reports**:
1. Executive Summary
2. Detailed Findings
3. Remediation Plan
4. Quarter-over-Quarter Comparison
5. Recommendations

**Report Location**:
```
portals/{instance}/assessments/quarterly/
├── Q{N}-{Year}-executive-summary.md
├── Q{N}-{Year}-detailed-report.json
├── Q{N}-{Year}-remediation-plan.md
└── Q{N}-{Year}-comparison.md
```

### Phase 10: Stakeholder Review (Day 5)

- [ ] Schedule review meeting
- [ ] Present findings
- [ ] Prioritize remediation
- [ ] Assign action items
- [ ] Set next quarter goals

## Audit Report Template

```markdown
# Quarterly Marketo Audit Report

**Quarter**: Q{N} {Year}
**Audit Date**: {Date}
**Auditor**: {Name}

## Executive Summary

Overall Health Score: {Score}/100
Status: {Excellent/Good/Fair/Poor}

### Key Findings
1. {Finding 1}
2. {Finding 2}
3. {Finding 3}

### Critical Issues
1. {Issue 1} - Impact: {Description}

### Wins
1. {Win 1} - Impact: {Description}

## Metrics Summary

| Area | Score | Trend | Status |
|------|-------|-------|--------|
| Lead Quality | {N} | ↑/↓/→ | ✅/⚠️/❌ |
| Program ROI | {N} | ↑/↓/→ | ✅/⚠️/❌ |
| Automation | {N} | ↑/↓/→ | ✅/⚠️/❌ |
| Deliverability | {N} | ↑/↓/→ | ✅/⚠️/❌ |
| Sync Health | {N} | ↑/↓/→ | ✅/⚠️/❌ |
| Performance | {N} | ↑/↓/→ | ✅/⚠️/❌ |

## Remediation Plan

| Priority | Issue | Owner | Due Date |
|----------|-------|-------|----------|
| P1 | {Issue} | {Name} | {Date} |

## Next Quarter Goals
1. {Goal 1}
2. {Goal 2}
```

## Related Resources

- **Command**: `/marketo-audit --scope=full`
- **All assessor agents**
- **Assessment tracking**: `scripts/lib/assessment-history-tracker.js`
- **Instance context**: `scripts/lib/instance-context-manager.js`
