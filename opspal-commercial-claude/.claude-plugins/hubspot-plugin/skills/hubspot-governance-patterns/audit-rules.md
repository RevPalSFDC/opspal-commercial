# Governance Audit Rules

## Automated Governance Checks

### Data Quality Rules

#### Required Field Validation
```javascript
const requiredFieldRules = [
  {
    object: 'contact',
    field: 'email',
    rule: 'not_empty',
    severity: 'error',
    message: 'Email is required for all contacts'
  },
  {
    object: 'contact',
    field: 'lifecyclestage',
    rule: 'not_empty',
    severity: 'warning',
    message: 'Lifecycle stage should be set'
  },
  {
    object: 'deal',
    field: 'closedate',
    rule: 'not_empty',
    severity: 'error',
    message: 'Close date required for all deals'
  },
  {
    object: 'deal',
    field: 'amount',
    rule: 'greater_than_zero',
    severity: 'warning',
    message: 'Deal amount should be set'
  },
  {
    object: 'company',
    field: 'name',
    rule: 'not_empty',
    severity: 'error',
    message: 'Company name is required'
  }
];
```

#### Format Validation
```javascript
const formatRules = [
  {
    field: 'email',
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: 'Invalid email format'
  },
  {
    field: 'phone',
    pattern: /^\+?[1-9]\d{1,14}$/,
    message: 'Phone should be E.164 format'
  },
  {
    field: 'website',
    pattern: /^https?:\/\//,
    message: 'Website must include protocol'
  },
  {
    field: 'linkedin_url',
    pattern: /linkedin\.com\/(in|company)\//,
    message: 'Invalid LinkedIn URL'
  }
];
```

### Workflow Governance Rules

#### Naming Compliance
```javascript
const workflowNamingRules = {
  patterns: [
    /^(WF|SEQ|AUTO)_[A-Z][a-z]+_[A-Za-z]+_v\d+$/
  ],
  required_prefixes: ['WF_', 'SEQ_', 'AUTO_'],
  forbidden_patterns: ['test', 'copy', 'untitled'],
  severity: 'warning'
};
```

#### Workflow Health Checks
```javascript
const workflowHealthChecks = [
  {
    check: 'has_description',
    rule: workflow => workflow.description?.length > 10,
    severity: 'warning',
    message: 'Workflow should have a description'
  },
  {
    check: 'not_stale',
    rule: workflow => {
      const lastRun = new Date(workflow.lastExecutionTime);
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      return lastRun > thirtyDaysAgo;
    },
    severity: 'info',
    message: 'Workflow has not run in 30+ days'
  },
  {
    check: 'has_goal',
    rule: workflow => workflow.goalCriteria?.length > 0,
    severity: 'info',
    message: 'Consider adding a goal to track effectiveness'
  },
  {
    check: 'reasonable_enrollment',
    rule: workflow => workflow.enrollmentCount < 100000,
    severity: 'warning',
    message: 'Large enrollment - review for performance'
  }
];
```

### User Access Audits

#### Privilege Escalation Detection
```javascript
const privilegeAuditRules = [
  {
    check: 'admin_count',
    rule: users => users.filter(u => u.role === 'admin').length < 5,
    severity: 'warning',
    message: 'Too many admin users'
  },
  {
    check: 'super_admin_count',
    rule: users => users.filter(u => u.role === 'super_admin').length < 3,
    severity: 'error',
    message: 'Super admin should be limited to 2-3 users'
  },
  {
    check: 'inactive_admins',
    rule: users => {
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      return !users.some(u =>
        u.role === 'admin' &&
        new Date(u.lastLogin) < thirtyDaysAgo
      );
    },
    severity: 'warning',
    message: 'Admin user inactive for 30+ days'
  }
];
```

### Integration Audits

#### API Key Hygiene
```javascript
const apiKeyAuditRules = [
  {
    check: 'key_age',
    rule: key => {
      const createdDate = new Date(key.createdAt);
      const sixMonthsAgo = Date.now() - (180 * 24 * 60 * 60 * 1000);
      return createdDate > sixMonthsAgo;
    },
    severity: 'warning',
    message: 'API key older than 6 months - consider rotation'
  },
  {
    check: 'unused_key',
    rule: key => {
      const lastUsed = new Date(key.lastUsedAt);
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      return lastUsed > thirtyDaysAgo;
    },
    severity: 'warning',
    message: 'API key not used in 30+ days'
  },
  {
    check: 'key_documentation',
    rule: key => key.name?.length > 5 && key.description?.length > 10,
    severity: 'info',
    message: 'API key should have descriptive name and documentation'
  }
];
```

## Scheduled Audit Jobs

### Daily Checks
```
- [ ] Data quality scan (sample 1000 records)
- [ ] Failed workflow executions
- [ ] Integration sync errors
- [ ] Bounce rate spikes
- [ ] Unusual login activity
```

### Weekly Checks
```
- [ ] Workflow performance review
- [ ] List growth analysis
- [ ] Property usage audit
- [ ] Team permission verification
- [ ] Report accuracy validation
```

### Monthly Checks
```
- [ ] Full user access audit
- [ ] API key rotation review
- [ ] Naming convention compliance
- [ ] Archive stale assets
- [ ] Integration health check
```

### Quarterly Checks
```
- [ ] Complete permission audit
- [ ] Data governance review
- [ ] Compliance verification (GDPR/CCPA)
- [ ] Workflow rationalization
- [ ] Storage optimization
```

## Audit Report Template

```markdown
# HubSpot Governance Audit Report
**Date**: [Date]
**Auditor**: [Name]
**Period**: [Start Date] - [End Date]

## Executive Summary
- Overall Compliance Score: [X/100]
- Critical Issues: [Count]
- Warnings: [Count]
- Recommendations: [Count]

## Data Quality
| Metric | Score | Trend |
|--------|-------|-------|
| Completeness | X% | ↑/↓ |
| Accuracy | X% | ↑/↓ |
| Consistency | X% | ↑/↓ |

## Access Control
- Total Users: [Count]
- Admin Users: [Count]
- Inactive Users: [Count]
- External Users: [Count]

## Workflow Health
- Active Workflows: [Count]
- Stale Workflows: [Count]
- Error Rate: [%]

## Recommendations
1. [Priority 1 recommendation]
2. [Priority 2 recommendation]
3. [Priority 3 recommendation]

## Action Items
- [ ] [Action 1] - Owner: [Name] - Due: [Date]
- [ ] [Action 2] - Owner: [Name] - Due: [Date]
```
