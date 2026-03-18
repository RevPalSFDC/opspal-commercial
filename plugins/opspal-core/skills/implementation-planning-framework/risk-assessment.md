# Risk Assessment

## Risk Categories

### Technical Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Integration failure | Medium | High | POC first, fallback plan |
| Data quality issues | High | Medium | Data audit, cleansing phase |
| Performance problems | Low | High | Load testing, optimization |
| API limitations | Medium | Medium | Early API testing, workarounds |
| Security vulnerabilities | Low | High | Security review, pen testing |

### Project Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Scope creep | High | High | Change control process |
| Resource unavailability | Medium | Medium | Backup resources identified |
| Timeline slippage | Medium | Medium | Buffer time, critical path |
| Budget overrun | Medium | High | Regular tracking, contingency |
| Stakeholder misalignment | Medium | High | Regular check-ins, demos |

### Organizational Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Change resistance | High | Medium | Change management plan |
| Training gaps | Medium | Medium | Comprehensive training |
| Process disruption | Medium | High | Phased rollout |
| Key person dependency | Medium | High | Knowledge sharing |

## Risk Scoring Matrix

```
Impact:
  Critical (5): Business operations significantly impacted
  High (4): Major functionality affected
  Medium (3): Moderate impact, workarounds exist
  Low (2): Minor inconvenience
  Minimal (1): Negligible impact

Likelihood:
  Almost Certain (5): >90% probability
  Likely (4): 60-90% probability
  Possible (3): 30-60% probability
  Unlikely (2): 10-30% probability
  Rare (1): <10% probability

Risk Score = Impact × Likelihood
  Critical: 20-25 (immediate action required)
  High: 12-19 (mitigation plan required)
  Medium: 6-11 (monitor and review)
  Low: 1-5 (accept or document)
```

## Risk Assessment Template

```javascript
const riskAssessment = {
  project: 'Project Name',
  assessmentDate: '2024-01-15',
  assessor: 'Name',

  risks: [
    {
      id: 'R001',
      category: 'technical',
      description: 'Integration with legacy system may fail',
      likelihood: 3,
      impact: 4,
      score: 12,
      status: 'open',
      mitigation: [
        'Conduct POC in week 1',
        'Document fallback approach',
        'Identify alternative integration method'
      ],
      owner: 'Tech Lead',
      dueDate: '2024-01-22'
    }
  ],

  summary: {
    total: 8,
    critical: 0,
    high: 2,
    medium: 4,
    low: 2
  }
};
```

## Risk Triggers by Project Type

### CRM Implementation
```
High Risk Indicators:
- Data quality score < 70%
- More than 3 integrations
- Custom development > 30% of scope
- Timeline < 3 months for full implementation
- No executive sponsor

Medium Risk Indicators:
- First CRM for organization
- Multiple user groups with different needs
- Complex approval processes
- Significant process change required
```

### Integration Project
```
High Risk Indicators:
- Undocumented API
- Real-time sync requirements
- High data volume (>100K records/day)
- Multiple systems involved
- No sandbox for testing

Medium Risk Indicators:
- Different data models
- Time zone/locale differences
- Rate limiting concerns
- Historical data migration
```

### Data Migration
```
High Risk Indicators:
- Poor source data quality
- Complex transformation rules
- No rollback capability
- Business-critical data
- Large volume (>1M records)

Medium Risk Indicators:
- Multiple source systems
- Custom object relationships
- Duplicate data present
- Inconsistent formats
```

## Risk Response Strategies

### Avoid
```
Definition: Eliminate the risk entirely
When to use: High impact, avoidable risks
Example: Skip problematic feature, use proven technology
```

### Transfer
```
Definition: Shift risk to third party
When to use: Specialized risks, insurance available
Example: Use managed service, get vendor SLA
```

### Mitigate
```
Definition: Reduce likelihood or impact
When to use: Most common strategy
Example: Add testing phase, implement backup plan
```

### Accept
```
Definition: Acknowledge and monitor
When to use: Low impact risks, cost of mitigation > benefit
Example: Document known limitations, communicate to users
```

## Risk Monitoring

### Weekly Risk Review Checklist
```
[ ] Review all open risks
[ ] Update risk scores based on new information
[ ] Check mitigation progress
[ ] Identify new risks
[ ] Escalate critical risks
[ ] Update stakeholders
```

### Risk Dashboard KPIs
| Metric | Target | Alert |
|--------|--------|-------|
| Open critical risks | 0 | >0 |
| Open high risks | <3 | >5 |
| Average days to mitigate | <14 | >21 |
| Risks without owner | 0 | >0 |
| Overdue mitigations | 0 | >2 |
