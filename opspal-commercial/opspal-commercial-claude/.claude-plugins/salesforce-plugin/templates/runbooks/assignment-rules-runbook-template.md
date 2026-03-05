# Assignment Rules Runbook: {Org Name}

**Org Alias**: `{org-alias}`
**Environment**: {Sandbox | Production}
**Last Updated**: {YYYY-MM-DD}
**Maintained By**: {Team/Person}

---

## Table of Contents

1. [Active Rules Summary](#1-active-rules-summary)
2. [Lead Assignment Rules](#2-lead-assignment-rules)
3. [Case Assignment Rules](#3-case-assignment-rules)
4. [Known Issues & Exceptions](#4-known-issues--exceptions)
5. [Monitoring & Alerts](#5-monitoring--alerts)
6. [Rollback Procedures](#6-rollback-procedures)
7. [Change History](#7-change-history)
8. [Contacts & Escalation](#8-contacts--escalation)

---

## 1. Active Rules Summary

### Lead Assignment Rules

| Rule Name | Active | Entries | Last Modified | Last Audit | Notes |
|-----------|--------|---------|---------------|------------|-------|
| {Rule Name} | {Yes/No} | {Count} | {YYYY-MM-DD} | {YYYY-MM-DD} | {Brief notes} |

**Example**:
```
| Healthcare_Routing_2025 | Yes | 5 | 2025-01-15 | 2025-01-15 | Routes healthcare leads by state |
| Legacy_Default | No | 10 | 2024-06-01 | 2025-01-15 | Deprecated, kept for rollback |
```

### Case Assignment Rules

| Rule Name | Active | Entries | Last Modified | Last Audit | Notes |
|-----------|--------|---------|---------------|------------|-------|
| {Rule Name} | {Yes/No} | {Count} | {YYYY-MM-DD} | {YYYY-MM-DD} | {Brief notes} |

**Example**:
```
| Priority_Based_Routing | Yes | 4 | 2025-01-10 | 2025-01-10 | Priority-based case routing |
```

### Quick Stats

- **Total Assignment Rules**: {Count}
- **Active Rules**: {Count}
- **Total Entries**: {Count}
- **Average Entries per Rule**: {Count}
- **Last Comprehensive Audit**: {YYYY-MM-DD}

---

## 2. Lead Assignment Rules

### Rule: {Rule Name}

**Status**: {Active | Inactive}
**Object**: Lead
**Last Modified**: {YYYY-MM-DD}
**Business Owner**: {Name/Team}

#### Business Purpose

{1-2 paragraph description of the business logic and why this rule exists}

**Example**:
```
This rule routes all healthcare industry leads to specialized healthcare sales teams based on geographic location. Leads from California and New York are assigned to dedicated regional teams, while leads from other states are assigned to the general healthcare team. This routing ensures leads are handled by reps with knowledge of local healthcare regulations and customer bases.
```

#### Rule Entries

##### Entry 1 (Order: {N})
**Criteria**:
- {Field} {Operator} {Value}
- {Field} {Operator} {Value}

**Assignee**: {User/Queue Name} (`{Id}`)
**Assignee Type**: {User | Queue | Role}
**Email Notification**: {Yes/No} - Template: {Template Name} (`{Template Id}`)

**Example**:
```
##### Entry 1 (Order: 1)
**Criteria**:
- Industry equals Healthcare
- State equals CA

**Assignee**: Healthcare CA Team Queue (`00G1234567890ABC`)
**Assignee Type**: Queue
**Email Notification**: Yes - Template: Lead_Assignment_Healthcare (`00X1111111111AAA`)
```

##### Entry 2 (Order: {N})
{Repeat structure for each entry}

#### Assignee Validation

| Assignee | Type | ID | Active | Access Level | Members (if Queue) | Last Verified |
|----------|------|----|----|--------------|-------------------|---------------|
| {Name} | {User/Queue} | {Id} | {Yes/No} | {None/Read/Edit/All} | {Count or N/A} | {YYYY-MM-DD} |

**Example**:
```
| Healthcare CA Team Queue | Queue | 00G1234567890ABC | Yes | Edit | 5 | 2025-01-15 |
| Healthcare NY Team Queue | Queue | 00G2234567890DEF | Yes | Edit | 3 | 2025-01-15 |
| Healthcare General Queue | Queue | 00G3234567890GHI | Yes | Edit | 10 | 2025-01-15 |
```

**Queue Member Details** (if applicable):

**Healthcare CA Team Queue** (`00G1234567890ABC`):
- User 1: John Doe (`0051111111111AAA`) - Active, Edit access ✓
- User 2: Jane Smith (`0051111111111BBB`) - Active, Edit access ✓
- User 3: Bob Johnson (`0051111111111CCC`) - Active, Edit access ✓
- User 4: Alice Brown (`0051111111111DDD`) - Active, Edit access ✓
- User 5: Charlie Green (`0051111111111EEE`) - Active, Edit access ✓

#### Conflicts & Dependencies

**Conflicts Detected**: {None | See Below}

{If conflicts exist, list them with severity and resolution status}

**Example**:
```
**Conflicts Detected**: 1 Warning

| Type | Severity | Description | Status | Resolution |
|------|----------|-------------|--------|------------|
| Pattern 10 | Warning | Flow "Lead_Enrichment_Flow" also updates Lead owner | Active | Documented, Flow runs first, then Assignment Rule overrides |
```

**Dependencies**:
- {Automation Type}: {Name} - {Relationship}

**Example**:
```
**Dependencies**:
- Flow: Lead_Data_Enrichment_Flow - Runs before assignment, enriches Industry field
- Validation Rule: Lead_Required_Fields - Must pass before assignment
```

#### Testing Results

**Last Tested**: {YYYY-MM-DD}
**Test Method**: {API Call | Apex Execution | Manual}
**Test Results**: {Passed | Failed | Partial}

**Test Cases**:

| Test # | Criteria | Expected Assignee | Actual Assignee | Result | Notes |
|--------|----------|-------------------|-----------------|--------|-------|
| 1 | Industry=Healthcare, State=CA | Healthcare CA Queue | Healthcare CA Queue | ✓ Pass | |
| 2 | Industry=Healthcare, State=NY | Healthcare NY Queue | Healthcare NY Queue | ✓ Pass | |
| 3 | Industry=Healthcare, State=TX | Healthcare General Queue | Healthcare General Queue | ✓ Pass | |

**API Test Command**:
```bash
curl -X POST "https://{instance}.salesforce.com/services/data/v62.0/sobjects/Lead/" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -H "Sforce-Auto-Assign: TRUE" \
  -d '{"FirstName": "Test", "LastName": "User", "Company": "TestCo", "Industry": "Healthcare", "State": "CA"}'
```

**Apex Test Code**:
```apex
Database.DMLOptions dmlOpts = new Database.DMLOptions();
dmlOpts.assignmentRuleHeader.useDefaultRule = true;
Lead testLead = new Lead(
    FirstName='Test',
    LastName='User',
    Company='TestCo',
    Industry='Healthcare',
    State='CA'
);
testLead.setOptions(dmlOpts);
insert testLead;

Lead result = [SELECT OwnerId, Owner.Name FROM Lead WHERE Id = :testLead.Id];
System.assertEquals('Healthcare CA Team Queue', result.Owner.Name);
```

#### Performance Metrics

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Average Evaluation Time | {N}ms | <100ms | {✓ Good / ⚠ Warning / ✗ Critical} |
| Entries Evaluated (avg) | {N} | <50 | {✓ Good / ⚠ Warning / ✗ Critical} |
| Unassigned Records (last 30 days) | {N} | <10 | {✓ Good / ⚠ Warning / ✗ Critical} |
| Error Rate (last 30 days) | {N}% | <1% | {✓ Good / ⚠ Warning / ✗ Critical} |

**Example**:
```
| Average Evaluation Time | 45ms | <100ms | ✓ Good |
| Entries Evaluated (avg) | 5 | <50 | ✓ Good |
| Unassigned Records (last 30 days) | 2 | <10 | ✓ Good |
| Error Rate (last 30 days) | 0.1% | <1% | ✓ Good |
```

#### XML Reference

**File Location**: `force-app/main/default/assignmentRules/Lead.assignmentRules-meta.xml`

**Backup Location**: `backup/assignment-rules/Lead_{Rule Name}_{YYYY-MM-DD}.xml`

**Last Backup**: {YYYY-MM-DD}

---

## 3. Case Assignment Rules

{Repeat structure from Section 2 for Case rules}

### Rule: {Rule Name}

**Status**: {Active | Inactive}
**Object**: Case
**Last Modified**: {YYYY-MM-DD}
**Business Owner**: {Name/Team}

{Follow same structure as Lead Assignment Rules section}

---

## 4. Known Issues & Exceptions

### Current Issues

| Issue # | Severity | Description | Workaround | Status | Target Resolution |
|---------|----------|-------------|------------|--------|-------------------|
| {N} | {Critical/High/Medium/Low} | {Description} | {Workaround or N/A} | {Open/In Progress/Resolved} | {YYYY-MM-DD or N/A} |

**Example**:
```
| 1 | Low | Leads from Puerto Rico not routing correctly | Manually assign to NY team | Open | 2025-02-01 |
| 2 | Medium | Queue "Healthcare CA" occasionally has no active members | Monitor daily, reassign if needed | In Progress | 2025-01-20 |
```

### Documented Exceptions

| Exception # | Type | Description | Reason | Approved By | Approval Date |
|-------------|------|-------------|--------|-------------|---------------|
| {N} | {Business Rule/Technical/Process} | {Description} | {Justification} | {Name} | {YYYY-MM-DD} |

**Example**:
```
| 1 | Business Rule | VIP leads from executive referrals bypass standard routing | Business requirement - VIP handling | Jane Doe (VP Sales) | 2024-12-01 |
| 2 | Technical | Assignment rule doesn't check Lead Rating due to data quality issues | Lead Rating field is not consistently populated | John Smith (RevOps) | 2025-01-05 |
```

### Historical Issues (Resolved)

| Issue # | Description | Resolved Date | Resolution |
|---------|-------------|---------------|------------|
| {N} | {Description} | {YYYY-MM-DD} | {How resolved} |

**Example**:
```
| 1 | Healthcare CA queue had inactive user | 2025-01-10 | Removed inactive user from queue |
| 2 | Assignment rule conflicted with Flow | 2024-12-15 | Disabled Flow owner assignment logic |
```

---

## 5. Monitoring & Alerts

### Daily Monitoring

**Owner**: {Team/Person}
**Frequency**: Daily at {Time}
**Method**: {Report/Dashboard/Query}

**Checks**:
1. ✓ Check for unassigned records (OwnerId = default user)
2. ✓ Verify queue members are active
3. ✓ Check for assignment errors in debug logs
4. ✓ Monitor assignment distribution balance

**Query for Unassigned Leads**:
```sql
SELECT Id, Name, Industry, State, CreatedDate
FROM Lead
WHERE OwnerId = '{default-user-id}'
  AND CreatedDate = TODAY
ORDER BY CreatedDate DESC
```

**Query for Assignment Distribution**:
```sql
SELECT Owner.Name, COUNT(Id) Total
FROM Lead
WHERE CreatedDate = THIS_WEEK
GROUP BY Owner.Name
ORDER BY COUNT(Id) DESC
```

### Weekly Monitoring

**Owner**: {Team/Person}
**Frequency**: Weekly on {Day}
**Method**: {Report/Dashboard}

**Checks**:
1. ✓ Review assignment distribution across queues
2. ✓ Check for queue member workload balance
3. ✓ Review performance metrics (evaluation time, error rate)
4. ✓ Audit queue membership changes

**Dashboard**: `{Dashboard Name}` (`{Dashboard Id}`)
**Report**: `{Report Name}` (`{Report Id}`)

### Monthly Monitoring

**Owner**: {Team/Person}
**Frequency**: Monthly on {Date}
**Method**: {Comprehensive Audit}

**Checks**:
1. ✓ Review business logic alignment with current needs
2. ✓ Audit rule performance and optimization opportunities
3. ✓ Check for conflicting automation (Flows, Triggers)
4. ✓ Verify assignee access permissions
5. ✓ Update documentation with any changes

### Alert Conditions

| Condition | Threshold | Action | Notification |
|-----------|-----------|--------|--------------|
| Unassigned records | >10 per day | Investigate and manually assign | Email to {team@example.com} |
| Queue with no members | Any | Add members or reassign records | Slack alert to #{channel} |
| Assignment error rate | >1% | Review debug logs, fix criteria | Email to {admin@example.com} |
| Queue imbalance | >2x difference | Rebalance workload or adjust rules | Report to {manager} |

**Example**:
```
| Unassigned records | >10 per day | Investigate and manually assign | Email to sales-ops@company.com |
| Queue with no members | Any | Add members or reassign records | Slack alert to #sales-ops-alerts |
| Assignment error rate | >1% | Review debug logs, fix criteria | Email to sfdc-admin@company.com |
| Queue imbalance | >2x difference | Rebalance workload or adjust rules | Report to Sales Manager |
```

---

## 6. Rollback Procedures

### Emergency Rollback

**When to Use**: Assignment rule is causing critical issues (wrong assignments, errors, production down)

**Steps**:
1. **Identify Issue** - Confirm Assignment Rule is the root cause
2. **Locate Backup** - Find previous working rule version
   ```bash
   ls -lah backup/assignment-rules/Lead_*
   ```
3. **Deactivate Current Rule** - Via UI or API
   ```bash
   # Query rule ID
   sf data query --query "SELECT Id FROM AssignmentRule WHERE SobjectType = 'Lead' AND Active = true" --use-tooling-api --target-org {org}

   # Note: Deactivation requires manual UI action or Metadata API deployment
   ```
4. **Deploy Backup** - Deploy previous version
   ```bash
   cp backup/assignment-rules/Lead_{Previous Version}.xml force-app/main/default/assignmentRules/Lead.assignmentRules-meta.xml
   sf project deploy start --metadata-dir force-app/main/default/assignmentRules --target-org {org}
   ```
5. **Activate Backup Rule** - Via UI (Setup → Assignment Rules → Activate)
6. **Test** - Verify rollback resolved issue
7. **Monitor** - Check for unassigned records, errors
8. **Document** - Update this runbook with incident details

**Rollback Time**: ~10-15 minutes
**Requires**: Salesforce Admin access, backup file, validation testing

### Backup Locations

| Version | Date | File Path | Notes |
|---------|------|-----------|-------|
| Current | {YYYY-MM-DD} | `force-app/main/default/assignmentRules/Lead.assignmentRules-meta.xml` | Active rule |
| v{N} | {YYYY-MM-DD} | `backup/assignment-rules/Lead_{Rule Name}_{YYYY-MM-DD}.xml` | {Notes} |
| v{N-1} | {YYYY-MM-DD} | `backup/assignment-rules/Lead_{Rule Name}_{YYYY-MM-DD}.xml` | {Notes} |

**Example**:
```
| Current | 2025-01-15 | `force-app/main/default/assignmentRules/Lead.assignmentRules-meta.xml` | Active rule |
| v2.0 | 2025-01-15 | `backup/assignment-rules/Lead_Healthcare_Routing_2025_2025-01-15.xml` | Current version |
| v1.0 | 2024-12-01 | `backup/assignment-rules/Lead_Healthcare_Routing_2024_2024-12-01.xml` | Previous version (known good) |
```

### Rollback Testing

**Pre-Rollback Testing** (if time allows):
1. Deploy backup to sandbox
2. Test with sample records
3. Verify routing behavior
4. Check for conflicts
5. Deploy to production if tests pass

**Post-Rollback Verification**:
```sql
-- Check recent assignments after rollback
SELECT Id, Name, OwnerId, Owner.Name, CreatedDate
FROM Lead
WHERE CreatedDate > {rollback-timestamp}
ORDER BY CreatedDate DESC
LIMIT 50
```

---

## 7. Change History

### Recent Changes

| Date | Change Type | Description | Author | Approval | Ticket/Issue |
|------|-------------|-------------|--------|----------|--------------|
| {YYYY-MM-DD} | {New/Modified/Deactivated} | {Description} | {Name} | {Approver} | {Ticket #} |

**Example**:
```
| 2025-01-15 | New | Created Healthcare_Routing_2025 rule with 5 entries | John Doe | Jane Smith | SFDC-1234 |
| 2025-01-10 | Modified | Updated entry 2 criteria to include State=NY | John Doe | Jane Smith | SFDC-1200 |
| 2024-12-15 | Deactivated | Deactivated Legacy_Default rule | John Doe | Jane Smith | SFDC-1150 |
```

### Change Detail: {YYYY-MM-DD}

**Type**: {New | Modified | Deactivated}
**Rule**: {Rule Name}
**Author**: {Name}
**Approver**: {Name}
**Ticket**: {Ticket #}

**Summary**: {1-2 sentence summary of change}

**Business Justification**: {Why was this change needed?}

**Technical Details**:
- **Before**: {Previous state or N/A}
- **After**: {New state}
- **Impact**: {What changed in behavior}

**Testing Performed**:
- ✓ {Test 1}
- ✓ {Test 2}
- ✓ {Test 3}

**Deployment Date**: {YYYY-MM-DD HH:MM}
**Deployment Method**: {Metadata API | UI}
**Deployment Result**: {Success | Failed | Partial}

**Post-Deployment Verification**:
- ✓ {Check 1}
- ✓ {Check 2}
- ✓ {Check 3}

**Example**:
```
### Change Detail: 2025-01-15

**Type**: New
**Rule**: Healthcare_Routing_2025
**Author**: John Doe
**Approver**: Jane Smith (VP Sales)
**Ticket**: SFDC-1234

**Summary**: Created new Lead assignment rule to route healthcare leads by geography to specialized regional teams.

**Business Justification**: Healthcare sales team reorganized into regional teams (CA, NY, General) to better serve local markets and comply with state-specific regulations.

**Technical Details**:
- **Before**: All healthcare leads assigned to single "Healthcare Sales" queue
- **After**: Healthcare leads routed to regional teams based on State field:
  - CA → Healthcare CA Team Queue
  - NY → Healthcare NY Team Queue
  - Other → Healthcare General Queue
- **Impact**: Improved lead response time by 30% through localized routing

**Testing Performed**:
- ✓ Sandbox testing with 50 sample leads (all routed correctly)
- ✓ API header testing confirmed rule triggers via API
- ✓ Queue member access validated (all have Edit permission)

**Deployment Date**: 2025-01-15 14:30 PST
**Deployment Method**: Metadata API via CLI
**Deployment Result**: Success

**Post-Deployment Verification**:
- ✓ Rule appears in SOQL query as active
- ✓ Test lead routed to correct queue
- ✓ No unassigned records in past 24 hours
- ✓ No errors in debug logs
```

### Audit Trail

**Comprehensive Audits**:

| Audit Date | Auditor | Findings | Action Items | Status |
|------------|---------|----------|--------------|--------|
| {YYYY-MM-DD} | {Name} | {Summary} | {Actions} | {Complete/In Progress} |

**Example**:
```
| 2025-01-15 | John Doe | All assignment rules validated, no conflicts | None | Complete |
| 2024-10-01 | Jane Smith | Found overlap in entry 2 and 3 | Reordered entries | Complete |
```

---

## 8. Contacts & Escalation

### Primary Contacts

| Role | Name | Email | Slack | Phone | Availability |
|------|------|-------|-------|-------|--------------|
| **Assignment Rule Owner** | {Name} | {email} | @{handle} | {phone} | {hours} |
| **Backup Owner** | {Name} | {email} | @{handle} | {phone} | {hours} |
| **Salesforce Admin** | {Name} | {email} | @{handle} | {phone} | {hours} |
| **Business Sponsor** | {Name} | {email} | @{handle} | {phone} | {hours} |

**Example**:
```
| **Assignment Rule Owner** | John Doe | john.doe@company.com | @johndoe | 555-0100 | M-F 9am-5pm PST |
| **Backup Owner** | Jane Smith | jane.smith@company.com | @janesmith | 555-0101 | M-F 9am-5pm PST |
| **Salesforce Admin** | Bob Johnson | bob.johnson@company.com | @bobjohnson | 555-0102 | 24/7 on-call |
| **Business Sponsor** | Alice Brown (VP Sales) | alice.brown@company.com | @alicebrown | 555-0103 | M-F 8am-6pm PST |
```

### Escalation Path

**Level 1** (0-15 minutes):
- Contact: {Assignment Rule Owner}
- For: Standard issues, questions, monitoring alerts

**Level 2** (15-60 minutes):
- Contact: {Backup Owner} or {Salesforce Admin}
- For: Assignment rule not firing, high error rate, critical business impact

**Level 3** (1-4 hours):
- Contact: {Business Sponsor}
- For: Widespread outage, production down, emergency rollback required

**Emergency Contact** (24/7):
- Contact: {On-Call Admin}
- Phone: {phone}
- Email: {email}
- For: Production-critical issues after hours

### Support Channels

- **Email**: {support-email}
- **Slack**: #{channel-name}
- **Jira**: {project-key}
- **Salesforce Cases**: Create case with Priority = High

---

## Maintenance Schedule

### Daily
- Check for unassigned records
- Verify queue members active
- Monitor error logs

### Weekly
- Review assignment distribution
- Check workload balance
- Audit queue membership

### Monthly
- Comprehensive rule audit
- Business logic review
- Performance optimization check
- Documentation updates

### Quarterly
- Full automation conflict audit
- Access permission review
- Business requirements validation
- Efficiency analysis

### Annually
- Complete runbook review
- Rule consolidation opportunities
- Technology upgrade assessment
- Training refresh for team

---

## Appendix

### Useful Queries

**Query Assignment Rules**:
```sql
SELECT Id, Name, Active, SobjectType
FROM AssignmentRule
WHERE SobjectType IN ('Lead', 'Case')
```

**Query Queue Members**:
```sql
SELECT Group.Name, User.Name, User.IsActive
FROM GroupMember
WHERE GroupId IN (
    SELECT assignedTo FROM /* assignment rule entries */
)
```

**Query Recent Assignments**:
```sql
SELECT Id, Name, OwnerId, Owner.Name, Industry, State, CreatedDate
FROM Lead
WHERE CreatedDate = TODAY
ORDER BY CreatedDate DESC
```

### Reference Documentation

- **User Guide**: `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/docs/ASSIGNMENT_RULES_GUIDE.md`
- **Skill Reference**: `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/skills/assignment-rules-framework/SKILL.md`
- **CLI Commands**: `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/skills/assignment-rules-framework/cli-command-reference.md`
- **Conflict Detection**: `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/skills/assignment-rules-framework/conflict-detection-rules.md`

### Automation Commands

**Run Pre-Deployment Validation**:
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validators/assignment-rule-validator.js {org-alias} {rule-xml}
```

**Detect Overlapping Rules**:
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/assignment-rule-overlap-detector.js {org-alias} {rule-xml}
```

**Validate Assignee Access**:
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validators/assignee-access-validator.js {org-alias} {rule-xml}
```

**Comprehensive Audit**:
```
Run comprehensive automation audit including Assignment Rules for org {org-alias}
```

---

**Document Version**: 1.0
**Template Version**: 1.0.0
**Last Updated**: {YYYY-MM-DD}
**Next Review Date**: {YYYY-MM-DD}
**Status**: {Draft | Active | Archived}
