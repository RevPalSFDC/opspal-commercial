# Sandbox Validation Plan - Assignment Rules Integration

**Org**: epsilon-corp2021-revpal (beta-corp RevPal Sandbox)
**Date**: 2025-12-15
**Phase**: Phase 7, Task 2 - Sandbox Validation with Real Org
**Status**: 🔄 **IN PROGRESS**

---

## Validation Objectives

1. ✅ Verify all 7 core scripts work with real Salesforce API
2. ✅ Test Assignment Rule creation and deployment end-to-end
3. ✅ Validate conflict detection with real org data
4. ✅ Test pre-deployment validation with real metadata
5. ✅ Verify backup and restore operations with real file system
6. ✅ Test API headers (Sforce-Auto-Assign) trigger rules correctly
7. ✅ Document any org-specific issues or limitations

---

## Test Environment

- **Org Alias**: epsilon-corp2021-revpal
- **Instance URL**: https://epsilon-corp2021--revpal.sandbox.my.salesforce.com
- **API Version**: v65.0
- **Org Type**: Sandbox
- **Username**: cacevedo@beta-corp.com.revpal
- **Connection Status**: Connected ✅

---

## Validation Tests

### Test 1: Org Discovery - Query Existing Assignment Rules

**Objective**: Verify we can query existing Assignment Rules in the org

**Commands**:
```bash
# Query Lead Assignment Rules
sf data query --query "SELECT Id, Name, Active, SobjectType FROM AssignmentRule WHERE SobjectType = 'Lead'" --use-tooling-api --target-org epsilon-corp2021-revpal

# Query Case Assignment Rules
sf data query --query "SELECT Id, Name, Active, SobjectType FROM AssignmentRule WHERE SobjectType = 'Case'" --use-tooling-api --target-org epsilon-corp2021-revpal
```

**Expected Result**: List of existing Assignment Rules (may be empty)
**Status**: ⏳ Pending

---

### Test 2: Script Validation - assignment-rule-parser.js

**Objective**: Verify XML parsing works with real Salesforce metadata

**Commands**:
```bash
# Retrieve existing Lead assignment rules (if any)
sf project retrieve start --metadata AssignmentRules:Lead --target-org epsilon-corp2021-revpal

# Parse the retrieved XML
node scripts/lib/assignment-rule-parser.js <path-to-xml>
```

**Expected Result**: Successfully parse XML and extract entries, criteria, assignees
**Status**: ⏳ Pending

---

### Test 3: Assignee Validation - assignee-validator.js

**Objective**: Verify User/Queue/Role validation with real org data

**Commands**:
```bash
# Query real Users
sf data query --query "SELECT Id, Name, IsActive FROM User WHERE IsActive = true LIMIT 5" --target-org epsilon-corp2021-revpal

# Query real Queues
sf data query --query "SELECT Id, DeveloperName, Type FROM Group WHERE Type = 'Queue' LIMIT 5" --target-org epsilon-corp2021-revpal

# Validate a real User ID
node scripts/lib/assignee-validator.js validateUser <user-id> epsilon-corp2021-revpal

# Validate a real Queue ID
node scripts/lib/assignee-validator.js validateQueue <queue-id> epsilon-corp2021-revpal
```

**Expected Result**: Successful validation of real assignees
**Status**: ⏳ Pending

---

### Test 4: Conflict Detection - assignment-rule-overlap-detector.js

**Objective**: Test conflict detection with real org rules

**Prerequisites**: Create 2 test rules with overlapping criteria

**Commands**:
```bash
# Detect overlapping rules
node scripts/lib/assignment-rule-overlap-detector.js detectOverlap <rule1> <rule2>

# Calculate risk score
node scripts/lib/assignment-rule-overlap-detector.js riskScore <conflicts>
```

**Expected Result**: Detect overlaps, calculate risk score, suggest reordering
**Status**: ⏳ Pending

---

### Test 5: Criteria Evaluation - criteria-evaluator.js

**Objective**: Simulate rule matching with real Lead/Case data

**Commands**:
```bash
# Query sample Leads
sf data query --query "SELECT Industry, State FROM Lead LIMIT 10" --target-org epsilon-corp2021-revpal

# Simulate assignment with sample data
node scripts/lib/criteria-evaluator.js simulate <rule> <sample-leads.json>
```

**Expected Result**: Correctly match Leads to rules based on criteria
**Status**: ⏳ Pending

---

### Test 6: Pre-Deployment Validation - validators/assignment-rule-validator.js

**Objective**: Run 20-point validation with real org metadata

**Commands**:
```bash
# Validate rule structure
node scripts/lib/validators/assignment-rule-validator.js validateStructure <test-rule.xml>

# Pre-deployment validation
node scripts/lib/validators/assignment-rule-validator.js preDeployment <test-rule.xml> epsilon-corp2021-revpal

# Generate validation report
node scripts/lib/validators/assignment-rule-validator.js report <validation-results>
```

**Expected Result**: All 20 checks pass, generate detailed report
**Status**: ⏳ Pending

---

### Test 7: Assignee Access Validation - validators/assignee-access-validator.js

**Objective**: Verify assignees have proper object access

**Commands**:
```bash
# Check User object access
node scripts/lib/validators/assignee-access-validator.js checkUserAccess <user-id> Lead epsilon-corp2021-revpal

# Check Queue object access
node scripts/lib/validators/assignee-access-validator.js checkQueueAccess <queue-id> Lead epsilon-corp2021-revpal

# Audit all assignees
node scripts/lib/validators/assignee-access-validator.js auditAccess <rule> epsilon-corp2021-revpal
```

**Expected Result**: Verify access levels (None, Read, Edit, All)
**Status**: ⏳ Pending

---

### Test 8: End-to-End Deployment - assignment-rule-deployer.js

**Objective**: Create, validate, deploy, and activate a test Assignment Rule

**Test Rule**: Healthcare_CA_Test
- **Object**: Lead
- **Criteria**: Industry = Healthcare AND State = CA
- **Assignee**: Test Queue (to be created)

**Commands**:
```bash
# Step 1: Create test Queue
sf data create record --sobject Group --values "Name='Test Assignment Queue' Type='Queue'" --target-org epsilon-corp2021-revpal

# Step 2: Build rule XML
node scripts/lib/assignment-rule-deployer.js buildXML <rule-definition>

# Step 3: Pre-deployment validation
node scripts/lib/validators/assignment-rule-validator.js preDeployment <test-rule.xml> epsilon-corp2021-revpal

# Step 4: Deploy rule (INACTIVE first)
node scripts/lib/assignment-rule-deployer.js deploy <test-rule.xml> Lead epsilon-corp2021-revpal

# Step 5: Verify deployment
sf data query --query "SELECT Id, Name, Active FROM AssignmentRule WHERE SobjectType = 'Lead' AND Name = 'Healthcare_CA_Test'" --use-tooling-api --target-org epsilon-corp2021-revpal

# Step 6: Test with sample Lead (DO NOT ACTIVATE RULE)
sf data create record --sobject Lead --values "FirstName='Test' LastName='User' Company='TestCo' Industry='Healthcare' State='CA'" --target-org epsilon-corp2021-revpal

# Step 7: Clean up - Delete test rule
sf data delete record --sobject AssignmentRule --record-id <rule-id> --use-tooling-api --target-org epsilon-corp2021-revpal
```

**Expected Result**:
- Rule deploys successfully
- Validation passes all 20 checks
- Rule appears in org
- No deployment errors

**Status**: ⏳ Pending

---

### Test 9: Backup and Restore Operations

**Objective**: Verify backup and restore work with real file system

**Commands**:
```bash
# Retrieve existing rules (if any)
sf project retrieve start --metadata AssignmentRules:Lead --target-org epsilon-corp2021-revpal

# Backup existing rules
node scripts/lib/assignment-rule-deployer.js backup Lead epsilon-corp2021-revpal ./backups

# Verify backup file created
ls -la ./backups/

# Test restore (dry-run)
node scripts/lib/assignment-rule-deployer.js restore ./backups/Lead_<timestamp>.xml epsilon-corp2021-revpal --dry-run
```

**Expected Result**: Backup created, restore works
**Status**: ⏳ Pending

---

### Test 10: API Header Testing (Sforce-Auto-Assign)

**Objective**: Verify API header triggers Assignment Rules

**NOTE**: This requires an ACTIVE Assignment Rule. For safety, we'll test with documentation and confirm the header is properly set in requests, but NOT activate the rule in the sandbox.

**Commands**:
```bash
# Verify header is included in REST API calls
curl -X POST "https://epsilon-corp2021--revpal.sandbox.my.salesforce.com/services/data/v65.0/sobjects/Lead/" \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -H "Sforce-Auto-Assign: TRUE" \
  -d '{"FirstName": "Test", "LastName": "User", "Company": "TestCo", "Industry": "Healthcare", "State": "CA"}'
```

**Expected Result**: Header properly formatted, ready for use when rule is active
**Status**: ⏳ Pending

---

## Test Data Required

### Sample Leads for Testing
```json
[
  {"FirstName": "John", "LastName": "Doe", "Company": "Healthcare Inc", "Industry": "Healthcare", "State": "CA"},
  {"FirstName": "Jane", "LastName": "Smith", "Company": "Tech Corp", "Industry": "Technology", "State": "NY"},
  {"FirstName": "Bob", "LastName": "Johnson", "Company": "MedTech", "Industry": "Healthcare", "State": "TX"}
]
```

### Test Assignment Rule
```xml
<?xml version="1.0" encoding="UTF-8"?>
<AssignmentRules xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Lead</fullName>
    <assignmentRule>
        <active>false</active>
        <name>Healthcare_CA_Test</name>
        <ruleEntry>
            <order>1</order>
            <criteriaItems>
                <field>Industry</field>
                <operation>equals</operation>
                <value>Healthcare</value>
            </criteriaItems>
            <criteriaItems>
                <field>State</field>
                <operation>equals</operation>
                <value>CA</value>
            </criteriaItems>
            <assignedTo>00G...</assignedTo>
            <assignedToType>Queue</assignedToType>
        </ruleEntry>
    </assignmentRule>
</AssignmentRules>
```

---

## Success Criteria

### Must Pass (Blocking Issues)
- [ ] All 7 core scripts execute without errors
- [ ] Can query existing Assignment Rules
- [ ] Can parse real Salesforce metadata
- [ ] Can validate real User/Queue IDs
- [ ] Pre-deployment validation works with real org
- [ ] Can deploy test rule to sandbox
- [ ] Backup and restore operations work

### Should Pass (Non-Blocking)
- [ ] Conflict detection works with real rules
- [ ] Criteria simulation accurate with real data
- [ ] Access validation detects permission issues
- [ ] API header properly formatted

### Nice to Have
- [ ] Performance acceptable (<5s per operation)
- [ ] Error messages clear and actionable
- [ ] All edge cases handled gracefully

---

## Risk Assessment

### Low Risk (Safe to Test)
- ✅ Querying existing data
- ✅ Parsing metadata
- ✅ Validating assignees
- ✅ Pre-deployment validation
- ✅ Creating inactive rules

### Medium Risk (Requires Caution)
- ⚠️ Deploying rules (even inactive)
- ⚠️ Creating test Queues
- ⚠️ Backup/restore operations

### High Risk (DO NOT TEST)
- ❌ Activating Assignment Rules (could affect org behavior)
- ❌ Modifying existing rules
- ❌ Testing with production data
- ❌ Bulk operations without review

---

## Rollback Plan

### If Deployment Fails
1. Run: `node scripts/lib/assignment-rule-deployer.js restore <backup-path> epsilon-corp2021-revpal`
2. Verify restoration: Query AssignmentRule object
3. Document error for investigation

### If Org Breaks
1. Do NOT activate any test rules
2. Delete test rules immediately: `sf data delete record --sobject AssignmentRule --record-id <id> --use-tooling-api`
3. Contact beta-corp admin if needed

### Emergency Contacts
- **beta-corp Admin**: cacevedo@beta-corp.com
- **Sandbox Owner**: RevPal Team

---

## Execution Schedule

1. ⏳ **Discovery Phase** (15 min)
   - Test 1: Query existing rules
   - Verify org access and metadata availability

2. ⏳ **Script Validation Phase** (30 min)
   - Tests 2-7: Execute all script functions
   - Verify each script works with real org data

3. ⏳ **End-to-End Testing** (45 min)
   - Test 8: Full deployment workflow
   - Test 9: Backup and restore
   - Test 10: API header verification

4. ⏳ **Documentation** (30 min)
   - Document all test results
   - Note any issues or limitations
   - Generate validation report

**Total Time**: ~2 hours

---

## Next Steps After Validation

### If All Tests Pass ✅
1. Mark Phase 7, Task 2 as complete
2. Proceed to Phase 7, Task 3: Production rollout planning
3. Fix unit test failures (26 tests) before production
4. Schedule production deployment

### If Tests Fail ❌
1. Document all failures
2. Investigate root causes
3. Fix bugs in scripts
4. Re-run sandbox validation
5. Do NOT proceed to production

---

**Test Performed By**: Claude Code
**Org Environment**: beta-corp RevPal Sandbox (epsilon-corp2021-revpal)
**Start Time**: 2025-12-15T[time]
**Status**: 🔄 Ready to Execute
