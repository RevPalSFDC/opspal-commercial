# {{PROJECT_NAME}}

**Project Type:** {{PROJECT_TYPE}}
**Generated:** {{GENERATED_DATE}}
**Status:** Draft - Pending Approval

---

## 1. Project Overview

### Project Owner
- **Name:** {{OWNER_NAME}}
- **Email:** {{OWNER_EMAIL}}
- **Phone:** {{OWNER_PHONE}}
- **Department:** {{OWNER_DEPARTMENT}}

### Description
{{PROJECT_DESCRIPTION}}

**Business Context:**
{{BUSINESS_OBJECTIVE}}

### Quick Facts
| Attribute | Value |
|-----------|-------|
| Project Type | {{PROJECT_TYPE}} |
| Priority | {{PRIORITY}} |
| Platform(s) | {{PLATFORMS}} |
| Complexity | {{COMPLEXITY}} |
| Budget Range | {{BUDGET_RANGE}} |

---

## 2. Business Objectives & Success Metrics

### Business Objective
{{BUSINESS_OBJECTIVE}}

### Success Metrics
1. **{{METRIC_1_NAME}}** (Target: {{METRIC_1_TARGET}})
   - Measurement: {{METRIC_1_MEASUREMENT}}
2. **{{METRIC_2_NAME}}** (Target: {{METRIC_2_TARGET}})
   - Measurement: {{METRIC_2_MEASUREMENT}}
3. **{{METRIC_3_NAME}}** (Target: {{METRIC_3_TARGET}})
   - Measurement: {{METRIC_3_MEASUREMENT}}

### Expected User Impact
{{USER_IMPACT}}

---

## 3. Project Scope

### In Scope
1. {{IN_SCOPE_1}}
2. {{IN_SCOPE_2}}
3. {{IN_SCOPE_3}}

### Out of Scope
1. {{OUT_SCOPE_1}}
2. {{OUT_SCOPE_2}}

### Assumptions
1. {{ASSUMPTION_1}} ✅ Validated
2. {{ASSUMPTION_2}} ⚠️ Unvalidated
3. {{ASSUMPTION_3}} ✅ Validated

### Constraints
1. [Technical] {{CONSTRAINT_1}}
2. [Resource] {{CONSTRAINT_2}}

---

## 4. Requirements

| ID | Requirement | Type | Priority | Dependencies |
|----|-------------|------|----------|--------------|
| REQ-001 | {{REQ_1_TITLE}} | {{REQ_1_TYPE}} | {{REQ_1_PRIORITY}} | None |
| REQ-002 | {{REQ_2_TITLE}} | {{REQ_2_TYPE}} | {{REQ_2_PRIORITY}} | REQ-001 |
| REQ-003 | {{REQ_3_TITLE}} | {{REQ_3_TYPE}} | {{REQ_3_PRIORITY}} | REQ-001, REQ-002 |

### Detailed Requirements

#### REQ-001: {{REQ_1_TITLE}}

**Type:** {{REQ_1_TYPE}}
**Priority:** {{REQ_1_PRIORITY}}
**Dependencies:** None

**Description:**
{{REQ_1_DESCRIPTION}}

**Acceptance Criteria:**
- [ ] {{REQ_1_AC_1}}
- [ ] {{REQ_1_AC_2}}
- [ ] {{REQ_1_AC_3}}

---

## 5. Technical Details

### Platforms
- {{PLATFORM_1}}
- {{PLATFORM_2}}

### Salesforce Configuration
| Setting | Value |
|---------|-------|
| Org Alias | {{SF_ORG_ALIAS}} |
| Org Type | {{SF_ORG_TYPE}} |
| Edition | {{SF_EDITION}} |
| CPQ Installed | {{HAS_CPQ}} |
| Experience Cloud | {{HAS_EXPERIENCE_CLOUD}} |

### HubSpot Configuration
| Setting | Value |
|---------|-------|
| Portal ID | {{HS_PORTAL_ID}} |
| Tier | {{HS_TIER}} |
| Active Hubs | {{HS_HUBS}} |

### Complexity Assessment
**Overall Complexity:** {{COMPLEXITY}}

**Contributing Factors:**
- {{COMPLEXITY_FACTOR_1}}
- {{COMPLEXITY_FACTOR_2}}

---

## 6. Data Sources & Integrations

### Primary Data Sources

| Source | Type | Direction | Records Est. |
|--------|------|-----------|--------------|
| {{SOURCE_1_NAME}} | {{SOURCE_1_TYPE}} | {{SOURCE_1_DIRECTION}} | {{SOURCE_1_RECORDS}} |
| {{SOURCE_2_NAME}} | {{SOURCE_2_TYPE}} | {{SOURCE_2_DIRECTION}} | {{SOURCE_2_RECORDS}} |

### Integrations
1. **{{INTEGRATION_1_NAME}}**
   - Type: {{INTEGRATION_1_TYPE}}
   - Endpoint: {{INTEGRATION_1_ENDPOINT}}
   - Auth: {{INTEGRATION_1_AUTH}}

### Existing Automations to Consider
1. {{AUTOMATION_1}}
   - Impact: {{AUTOMATION_1_IMPACT}}

---

## 7. Dependencies & Risks

### Dependencies

| Dependency | Type | Status | Blocks If Delayed |
|------------|------|--------|-------------------|
| {{DEP_1_NAME}} | {{DEP_1_TYPE}} | ✅ Confirmed | ⚠️ Yes |
| {{DEP_2_NAME}} | {{DEP_2_TYPE}} | ⏳ Pending | No |

**⚠️ Critical Dependencies (Blocking):**
- **{{DEP_1_NAME}}**: {{DEP_1_DESCRIPTION}}

### Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| {{RISK_1_NAME}} | 🔴 High | 🟡 Medium | {{RISK_1_MITIGATION}} |
| {{RISK_2_NAME}} | 🟡 Medium | 🟢 Low | {{RISK_2_MITIGATION}} |

**🔴 High-Priority Risks:**
- **{{RISK_1_NAME}}**
  - {{RISK_1_DESCRIPTION}}
  - Mitigation: {{RISK_1_MITIGATION}}

---

## 8. Timeline & Milestones

### Key Dates
| Milestone | Date | Status |
|-----------|------|--------|
| Project Start | {{START_DATE}} | ⏳ Planned |
| {{MILESTONE_1_NAME}} | {{MILESTONE_1_DATE}} | ⏳ Planned |
| {{MILESTONE_2_NAME}} | {{MILESTONE_2_DATE}} | ⏳ Planned |
| Project End | {{END_DATE}} | ⏳ Target |

### ⚠️ Hard Deadline
**Date:** {{END_DATE}}
**Reason:** {{DEADLINE_REASON}}

### Budget
**Range:** {{BUDGET_RANGE}}
**Flexibility:** {{BUDGET_FLEXIBILITY}}
**Notes:** {{BUDGET_NOTES}}

---

## 9. Stakeholders & Communication

### Key Stakeholders

| Name | Role | Email | Involvement |
|------|------|-------|-------------|
| {{OWNER_NAME}} | Project Owner | {{OWNER_EMAIL}} | Primary |
| {{STAKEHOLDER_1_NAME}} | {{STAKEHOLDER_1_ROLE}} | {{STAKEHOLDER_1_EMAIL}} | {{STAKEHOLDER_1_INVOLVEMENT}} |

### Approvers

| Name | Type | Status |
|------|------|--------|
| {{APPROVER_1_NAME}} | {{APPROVER_1_TYPE}} | ⏳ Pending |
| {{APPROVER_2_NAME}} | {{APPROVER_2_TYPE}} | ⏳ Pending |

### Communication Plan
**Primary Channel:** {{COMM_CHANNEL}}
**Update Frequency:** {{UPDATE_FREQUENCY}}
**Notification Level:** {{NOTIFICATION_LEVEL}}

---

## 10. Gathered Context

_The following context was automatically gathered from connected systems:_

### Salesforce Org Context

**Org Details:**
- Username: {{SF_USERNAME}}
- Instance: {{SF_INSTANCE}}
- Org ID: {{SF_ORG_ID}}

**Object Record Counts:**
- Account: {{ACCOUNT_COUNT}} records
- Contact: {{CONTACT_COUNT}} records
- Opportunity: {{OPP_COUNT}} records
- Lead: {{LEAD_COUNT}} records

**Validated Assumptions:**
- ✅ CPQ Installed: {{CPQ_VALIDATED}}
- ❌ Experience Cloud: {{EC_VALIDATED}}

### Asana Context

**Project Info:**
- Name: {{ASANA_PROJECT_NAME}}
- Workspace: {{ASANA_WORKSPACE}}

**Recent Tasks:**
- ✅ {{ASANA_TASK_1}}
- ⬜ {{ASANA_TASK_2}}

**Similar Past Projects:**
- {{SIMILAR_PROJECT_1}} ({{SIMILAR_PROJECT_1_MATCH}}% match)

### Related Runbooks

| Runbook | Match Score | Key Patterns |
|---------|-------------|--------------|
| {{RUNBOOK_1_NAME}} | {{RUNBOOK_1_SCORE}}% | {{RUNBOOK_1_PATTERNS}} |

---

## 11. Approval & Sign-off

### Sign-off Checklist

- [ ] Project scope reviewed and approved
- [ ] Requirements validated
- [ ] Timeline and milestones confirmed
- [ ] Budget approved
- [ ] Dependencies confirmed
- [ ] Risk mitigation plans accepted
- [ ] Communication plan established

### Approvals

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Project Owner | | | |
| Technical Lead | | | |
| Business Sponsor | | | |

### Additional Notes
{{ADDITIONAL_NOTES}}

---

## Generation Metadata

| Field | Value |
|-------|-------|
| Generated | {{GENERATED_TIMESTAMP}} |
| Generator | Intake Runbook Builder v1.0.0 |
| Completeness Score | {{COMPLETENESS_SCORE}}% |
| Validation Status | {{VALIDATION_STATUS}} |
| Validation Errors | {{ERROR_COUNT}} |
| Validation Warnings | {{WARNING_COUNT}} |
| Source File | {{SOURCE_FILE}} |

---

**Template Version:** 1.0.0
**Last Updated:** 2024-12-21
**Template Location:** templates/intake/intake-runbook.md

_Note: This template shows the structure of generated runbooks. Actual runbooks are generated programmatically by `intake-runbook-builder.js` with real data from the intake form._
