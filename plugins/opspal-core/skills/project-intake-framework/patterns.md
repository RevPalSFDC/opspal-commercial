# Project Intake Patterns

Common patterns, templates, and best practices for project intake.

## Project Type Patterns

### Salesforce Implementation
```json
{
  "projectType": "salesforce",
  "technicalRequirements": {
    "platforms": ["salesforce"],
    "salesforceOrg": {
      "orgAlias": "production",
      "orgType": "production",
      "edition": "Enterprise",
      "hasCPQ": true,
      "hasExperienceCloud": false
    },
    "complexityAssessment": "high"
  }
}
```

**Typical Sections Focus:**
- Technical Requirements: Detailed org configuration
- Dependencies: Integration points, existing automations
- Data Sources: Migration sources, API connections

### HubSpot Portal Setup
```json
{
  "projectType": "hubspot",
  "technicalRequirements": {
    "platforms": ["hubspot"],
    "hubspotPortal": {
      "portalId": "12345678",
      "tier": "enterprise",
      "activeHubs": ["marketing", "sales", "service"]
    }
  }
}
```

**Typical Sections Focus:**
- Data Sources: CRM sync, marketing automation
- Goals & Objectives: Marketing metrics, lead gen targets
- Scope: Hub-specific features

### Multi-Platform Integration
```json
{
  "projectType": "integration",
  "technicalRequirements": {
    "platforms": ["salesforce", "hubspot"],
    "salesforceOrg": { /* ... */ },
    "hubspotPortal": { /* ... */ },
    "complexityAssessment": "very-high"
  }
}
```

**Typical Sections Focus:**
- Dependencies: Bi-directional sync requirements
- Data Sources: Both platforms as source/target
- Risks: Data consistency, sync conflicts

---

## Success Metric Templates

### Revenue Operations
| Metric | Target | Baseline |
|--------|--------|----------|
| Quote generation time | < 5 minutes | 45 minutes |
| Quote accuracy rate | > 99% | 85% |
| Pipeline visibility | Real-time | 48hr lag |
| Deal cycle time | -20% | Current baseline |

### Marketing Automation
| Metric | Target | Baseline |
|--------|--------|----------|
| Lead response time | < 5 minutes | 4 hours |
| MQL volume | +30% | Current baseline |
| Email deliverability | > 95% | Current rate |
| Campaign ROI tracking | 100% attribution | 0% attribution |

### Customer Success
| Metric | Target | Baseline |
|--------|--------|----------|
| Health score coverage | 100% accounts | 0% |
| Churn prediction accuracy | > 80% | None |
| QBR automation | Automated generation | Manual |

---

## Scope Definition Patterns

### Good In-Scope Items
```json
{
  "inScope": [
    {
      "id": "REQ-001",
      "title": "Custom Quote Object Configuration",
      "category": "Data",
      "description": "Configure SBQQ__Quote__c with 15 custom fields for pricing tiers",
      "priority": "high",
      "estimatedEffort": "2 days"
    },
    {
      "id": "REQ-002",
      "title": "Price Rule Automation",
      "category": "Automation",
      "description": "Create 5 price rules for volume discounting: 10%, 15%, 20%, 25%, 30%",
      "priority": "high",
      "estimatedEffort": "3 days"
    }
  ]
}
```

**Characteristics of Good Scope Items:**
- Specific and measurable
- Include quantity where applicable
- Have clear completion criteria
- Estimate effort range

### Good Out-of-Scope Items
```json
{
  "outOfScope": [
    {
      "item": "Legacy quote migration",
      "reason": "Historical data will remain in legacy system for reference",
      "future": true
    },
    {
      "item": "Mobile app customization",
      "reason": "Standard Salesforce mobile will be used initially",
      "future": true
    }
  ]
}
```

**Why Document Out-of-Scope:**
- Prevents scope creep
- Sets stakeholder expectations
- Creates future backlog

---

## Dependency Patterns

### Internal Dependency
```json
{
  "dependencies": [
    {
      "id": "DEP-001",
      "type": "internal",
      "name": "Product catalog migration",
      "description": "Products must be in Salesforce before price rules",
      "blocking": true,
      "owner": "Data Team",
      "expectedResolution": "2026-02-15"
    }
  ]
}
```

### External Dependency
```json
{
  "dependencies": [
    {
      "id": "DEP-002",
      "type": "external",
      "name": "ERP API availability",
      "description": "Finance team must provide API access for order sync",
      "blocking": true,
      "owner": "Finance IT",
      "expectedResolution": "2026-02-20"
    }
  ]
}
```

### Technical Dependency
```json
{
  "dependencies": [
    {
      "id": "DEP-003",
      "type": "technical",
      "name": "Sandbox refresh",
      "description": "Full sandbox refresh needed before UAT",
      "blocking": false,
      "owner": "SF Admin",
      "expectedResolution": "2026-03-01"
    }
  ]
}
```

---

## Risk Assessment Patterns

### High Impact/High Probability
```json
{
  "risks": [
    {
      "id": "RISK-001",
      "title": "Data quality issues",
      "description": "Legacy pricing data may have inconsistencies",
      "impact": "high",
      "probability": "high",
      "mitigation": "Conduct data audit in week 1, establish cleanup rules",
      "owner": "Data Lead",
      "contingency": "Manual cleanup sprint if automated rules insufficient"
    }
  ]
}
```

### Timeline Risk
```json
{
  "risks": [
    {
      "id": "RISK-002",
      "title": "Hard deadline dependency",
      "description": "Q2 pricing changes require go-live by March 31",
      "impact": "critical",
      "probability": "medium",
      "mitigation": "Weekly milestone reviews, escalation path defined",
      "owner": "Project Manager",
      "contingency": "Phased rollout with critical features first"
    }
  ]
}
```

---

## Asana Task Templates

### Requirement Task
```markdown
**[REQ-001]** {Title}

**Category:** {Data|Automation|Integration|UI|Report}
**Priority:** {Critical|High|Medium|Low}
**Estimated Effort:** {X days}
**Dependencies:** {None|DEP-XXX}

**Description:**
{Detailed description of the requirement}

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

**Technical Notes:**
{Any technical considerations}
```

### Milestone Task
```markdown
**[MILESTONE]** {Phase Name} Complete

**Target Date:** {YYYY-MM-DD}
**Prerequisites:** {REQ-001, REQ-002, REQ-003}

**Completion Criteria:**
- [ ] All prerequisite tasks completed
- [ ] Stakeholder review conducted
- [ ] Sign-off obtained

**Stakeholders:**
- {Name 1} - {Role}
- {Name 2} - {Role}
```

---

## Completeness Improvement Patterns

### Minimum Viable Intake (Score ~60%)
- Project Identity: Name, owner, type
- Goals: Basic objective statement
- Scope: In-scope items only
- Timeline: Start and end dates

### Standard Intake (Score ~80%)
- All minimum viable items PLUS:
- Success metrics with targets
- Out-of-scope items documented
- Dependencies identified
- At least 2 risks documented
- Technical requirements filled

### Comprehensive Intake (Score ~95%)
- All standard items PLUS:
- Assumptions with validation status
- All risks have mitigations
- Communication plan complete
- All approvers identified
- Budget documented
