# ADR-NNNN: [Short Title of Decision]

**Status**: [Proposed | Accepted | Deprecated | Superseded by ADR-XXXX]
**Date**: YYYY-MM-DD
**Deciders**: [List people involved in decision]
**Technical Story**: [Ticket/issue URL or reference]

---

## Context and Problem Statement

[Describe the architectural issue or decision that needs to be made. Provide background on why this decision is necessary. What forces are at play? What are the business drivers?]

**Business Context**:
- [Key business requirement or constraint]
- [Relevant timeline or deadline]
- [Stakeholder concerns or priorities]

**Technical Context**:
- [Current system state]
- [Pain points or limitations]
- [Integration requirements]

---

## Decision Drivers

List the factors influencing this decision:

- [Driver 1: e.g., "Must support 10,000+ concurrent users"]
- [Driver 2: e.g., "Regulatory compliance requirement (GDPR)"]
- [Driver 3: e.g., "Budget constraint: $50k max"]
- [Driver 4: e.g., "Timeline: Must deploy within 3 months"]
- [Driver 5: e.g., "Team skill set: Strong in declarative, limited Apex experience"]

---

## Considered Options

### Option 1: [Option Name]

**Description**: [What is this option?]

**Pros**:
- [Positive aspect 1]
- [Positive aspect 2]
- [Positive aspect 3]

**Cons**:
- [Negative aspect 1]
- [Negative aspect 2]
- [Negative aspect 3]

**Estimated Effort**: [Hours/days/weeks]
**Estimated Cost**: [Dollar amount if applicable]

---

### Option 2: [Option Name]

**Description**: [What is this option?]

**Pros**:
- [Positive aspect 1]
- [Positive aspect 2]

**Cons**:
- [Negative aspect 1]
- [Negative aspect 2]

**Estimated Effort**: [Hours/days/weeks]
**Estimated Cost**: [Dollar amount if applicable]

---

### Option 3: [Option Name]

**Description**: [What is this option?]

**Pros**:
- [Positive aspect 1]

**Cons**:
- [Negative aspect 1]

**Estimated Effort**: [Hours/days/weeks]
**Estimated Cost**: [Dollar amount if applicable]

---

## Decision Outcome

**Chosen Option**: [Option X]

**Rationale**: [Explain why this option was chosen over the others. What decision drivers were most important? How does this option best satisfy the requirements?]

### Positive Consequences

- [Benefit 1: Specific advantage of this decision]
- [Benefit 2: How this helps the business or users]
- [Benefit 3: Technical improvements enabled]

### Negative Consequences

- [Trade-off 1: What we're giving up or accepting]
- [Trade-off 2: Technical debt introduced]
- [Trade-off 3: Maintenance burden or limitations]

### Risks and Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| [Risk description] | [Low/Med/High] | [Low/Med/High] | [How we'll address it] |

---

## Implementation

### Components Created/Modified

- **Custom Object**: `CustomObject__c` ([path to metadata](../../force-app/main/default/objects/CustomObject__c))
- **Apex Classes**: `CustomObjectHandler.cls` ([path](../../force-app/main/default/classes/CustomObjectHandler.cls:1))
- **Flows**: `CustomObject_AfterSave` ([path](../../force-app/main/default/flows/))
- **Permission Sets**: `CustomObject_Access` ([path](../../force-app/main/default/permissionsets/))

### Dependencies

**External Dependencies**:
- [Managed package or external system]
- [Third-party API or service]

**Internal Dependencies**:
- [Other Salesforce objects or components]
- [Existing automation or processes]

### Configuration Required

```yaml
# Example configuration
CustomObject__c:
  OWD: Private
  Sharing Rules: Territory-based sharing
  Field-Level Security: Restricted to Sales and Support profiles
  Record Types: Standard, Premium
```

### Migration Plan

**For existing environments**:
1. [Step 1: e.g., "Create custom object in dev sandbox"]
2. [Step 2: e.g., "Migrate test data"]
3. [Step 3: e.g., "Deploy to UAT for validation"]
4. [Step 4: e.g., "Production deployment during maintenance window"]

### Rollback Plan

**If this decision needs to be reversed**:
1. [Step 1: How to disable or remove]
2. [Step 2: Data migration if needed]
3. [Step 3: Restore previous state]

**Rollback Risk**: [Low/Medium/High]
**Rollback Effort**: [Hours/days]

---

## Validation

### Success Criteria

How will we know this decision was successful?

- [ ] [Criterion 1: e.g., "Page load time <2 seconds"]
- [ ] [Criterion 2: e.g., "User adoption >80% within 3 months"]
- [ ] [Criterion 3: e.g., "Zero data integrity issues"]
- [ ] [Criterion 4: e.g., "Meets compliance requirements"]

### Monitoring and Metrics

**Metrics to Track**:
- [Metric 1: e.g., "API usage for custom object"]
- [Metric 2: e.g., "Query performance on lookups"]
- [Metric 3: e.g., "Storage consumed"]

**Monitoring Approach**:
- [How metrics will be collected]
- [Dashboard or report to review]
- [Alert thresholds]

**Review Schedule**: [e.g., "Monthly for 3 months, then quarterly"]

---

## Compliance and Security

### Data Classification

**Fields by Classification Level**:
- PUBLIC: [List field names]
- INTERNAL: [List field names]
- CONFIDENTIAL: [List field names]
- RESTRICTED: [List field names - PII/PHI]

### Security Controls

- **Field-Level Security**: [Which profiles/permission sets have access]
- **Sharing Rules**: [How record access is controlled]
- **Encryption**: [Which fields are encrypted, if applicable]
- **Audit Trail**: [Field history tracking enabled? Event Monitoring?]

### Regulatory Compliance

- **GDPR**: [Applicable? Data retention policy? Deletion process?]
- **HIPAA**: [Applicable? PHI handling procedures?]
- **SOX**: [Applicable? Change control procedures?]
- **Other**: [Industry-specific regulations]

---

## Links and References

### Related ADRs

- [ADR-XXXX](./ADR-XXXX-related-decision.md) - Related decision
- [ADR-YYYY](./ADR-YYYY-dependent-decision.md) - Dependent decision

### Salesforce Documentation

- [Salesforce feature documentation URL]
- [Trailhead module URL]
- [Release notes URL]

### External References

- [Blog post or article that influenced decision]
- [Industry best practice reference]
- [Academic paper or research]

### Jira/Project Management

- [PROJ-123: Original feature request]
- [PROJ-456: Technical spike or investigation]

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| YYYY-MM-DD | Created | [Your name] |
| YYYY-MM-DD | Accepted | [Approver name] |
| YYYY-MM-DD | [Update description] | [Author] |

---

## Review and Approval

**Architecture Review**:
- [x] Reviewed by: [Architect name], [Date]
- [x] Approved by: [Engineering Lead], [Date]

**Security Review** (if applicable):
- [ ] Reviewed by: [Security team member], [Date]
- [ ] Approved by: [Security Lead], [Date]

**Compliance Review** (if applicable):
- [ ] Reviewed by: [Compliance officer], [Date]
- [ ] Approved by: [Legal/Compliance Lead], [Date]

---

**ADR Number**: NNNN
**Last Updated**: YYYY-MM-DD
**Next Review**: YYYY-MM-DD (6 months from acceptance)
**Status**: [Current status]
