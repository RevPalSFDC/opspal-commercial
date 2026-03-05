# Runbook 5: Testing and Deployment

**Version**: 1.0.0
**Last Updated**: 2025-11-23
**Audience**: Salesforce Administrators, Developers

---

## Table of Contents

1. [Introduction](#introduction)
2. [Testing Lifecycle Overview](#testing-lifecycle-overview)
3. [Unit Testing Validation Rules](#unit-testing-validation-rules)
4. [Integration Testing](#integration-testing)
5. [Bulk Testing](#bulk-testing)
6. [Impact Analysis](#impact-analysis)
7. [Deployment Strategies](#deployment-strategies)
8. [Pre-Deployment Checklist](#pre-deployment-checklist)
9. [Deployment Execution](#deployment-execution)
10. [Post-Deployment Verification](#post-deployment-verification)
11. [Rollback Procedures](#rollback-procedures)
12. [Quick Reference](#quick-reference)

---

## Introduction

This runbook provides comprehensive guidance on testing validation rules and deploying them safely to production. Proper testing prevents user disruption and ensures validation rules work as intended.

### Why Testing Matters

**Real-World Impact**:
```
Scenario: Deploy validation rule to production without testing
Result: 1,000 existing records violate rule
Impact: Users cannot update ANY records until issue fixed
Cost: 4 hours downtime + emergency fix + user frustration
```

**Prevention Through Testing**:
- Catch logic errors before production
- Identify impacted records
- Plan data cleanup before activation
- Ensure smooth deployment

---

## Testing Lifecycle Overview

### Testing Phases

```
1. UNIT TESTING (Sandbox)
   - Test formula logic with sample records
   - Verify error message displays correctly
   - Test positive/negative cases
   Duration: 15-30 minutes per rule

2. INTEGRATION TESTING (Sandbox)
   - Test with other validation rules
   - Test with automation (workflows, flows, triggers)
   - Test with different profiles/record types
   Duration: 30-60 minutes per rule

3. BULK TESTING (Sandbox)
   - Test with bulk operations (Data Loader, API)
   - Test with high record volumes
   - Test performance impact
   Duration: 1-2 hours per rule

4. IMPACT ANALYSIS (Production - Read Only)
   - Test formula against existing production data
   - Identify records that violate rule
   - Calculate violation rate
   Duration: 15-30 minutes per rule

5. DEPLOYMENT (Production)
   - Deploy using chosen strategy
   - Monitor for issues
   - Activate rule if deployed inactive
   Duration: 30-60 minutes per rule

6. POST-DEPLOYMENT (Production)
   - Verify rule triggers as expected
   - Monitor error frequency
   - Collect user feedback
   Duration: 48 hours monitoring
```

### Testing Environment Requirements

**Sandbox Requirements**:
- ✅ Full or Partial Copy sandbox (preferred)
- ✅ Recent production data (within 30 days)
- ✅ Representative user profiles
- ✅ Active automation (workflows, flows, triggers)
- ❌ Developer sandbox (insufficient for testing)

**Why Full/Partial Copy**:
- Contains realistic data volumes
- Includes custom settings/metadata
- Has org-wide defaults and sharing rules
- Represents production behavior accurately

---

## Unit Testing Validation Rules

### Test Case Design

**For Each Validation Rule, Create Test Cases**:

| Test Case Type | Purpose | Example |
|----------------|---------|---------|
| **Positive (Should Pass)** | Verify valid data is accepted | Amount=150000, Stage=Closed Won, CloseDate=Today |
| **Negative (Should Fail)** | Verify invalid data is rejected | Amount=150000, Stage=Closed Won, CloseDate=NULL |
| **Edge Case** | Test boundary conditions | Amount=100000 (exact threshold), CloseDate=Today |
| **Null/Blank** | Test with missing data | Amount=NULL, Stage=NULL, CloseDate=NULL |
| **Record Type** | Test with different record types | RecordType=Enterprise vs SMB |
| **Profile** | Test with different profiles | Admin (bypass) vs Sales User |

### Example Test Plan

**Rule**: Require Close Date when Closed Won

**Formula**:
```
AND(
  ISPICKVAL(StageName, "Closed Won"),
  ISNULL(CloseDate)
)
```

**Test Cases**:

```javascript
// Test Case 1: Should FAIL (trigger validation)
{
  StageName: "Closed Won",
  CloseDate: null
}
Expected: Validation error displayed

// Test Case 2: Should PASS (no error)
{
  StageName: "Closed Won",
  CloseDate: "2025-11-23"
}
Expected: Record saves successfully

// Test Case 3: Should PASS (stage not Closed Won)
{
  StageName: "Prospecting",
  CloseDate: null
}
Expected: Record saves successfully

// Test Case 4: Should PASS (Close Date populated)
{
  StageName: "Closed Won",
  CloseDate: "2025-11-23"
}
Expected: Record saves successfully

// Test Case 5: Edge Case (Stage changes TO Closed Won)
Initial: { StageName: "Negotiation", CloseDate: null }
Update:  { StageName: "Closed Won", CloseDate: null }
Expected: Validation error displayed

// Test Case 6: Profile Bypass (Admin)
User: System Administrator
{
  StageName: "Closed Won",
  CloseDate: null
}
Expected: Record saves (if profile bypass configured)
```

### Testing Process

**Step-by-Step**:

1. **Create Test Records in Sandbox**

```bash
# Via Data Loader or API
# Create 5-10 test opportunities with various states
```

2. **Deploy Validation Rule (Inactive)**

```bash
sf project deploy start \
  --metadata ValidationRule:Opportunity.Require_Close_Date_When_Won \
  --target-org mySandbox
```

3. **Activate Rule**

```bash
# Via Salesforce UI
Setup → Object Manager → Opportunity → Validation Rules → Activate
```

4. **Execute Test Cases**

```bash
# Manually via UI:
1. Edit test record with invalid data (should fail)
2. Edit test record with valid data (should pass)
3. Repeat for all test cases

# Via Apex (automated):
Test.startTest();
try {
  Opportunity opp = [SELECT Id FROM Opportunity WHERE Name = 'Test 1'];
  opp.StageName = 'Closed Won';
  opp.CloseDate = null;
  update opp;
  System.assert(false, 'Expected validation error');
} catch (DmlException e) {
  System.assert(e.getMessage().contains('Close Date is required'));
}
Test.stopTest();
```

5. **Document Results**

```markdown
| Test Case | Expected | Actual | Pass/Fail |
|-----------|----------|--------|-----------|
| TC1: Closed Won + No Date | Error | Error displayed | PASS |
| TC2: Closed Won + Date | Save | Saved | PASS |
| TC3: Prospecting + No Date | Save | Saved | PASS |
```

---

## Integration Testing

### Testing with Other Rules

**Scenario**: Multiple validation rules on same object

```
Rule 1: Require Close Date when Closed Won
Rule 2: Require Amount > $10,000 when Closed Won
Rule 3: Require Decision Maker when Closed Won
```

**Test Cases**:

```javascript
// Test Case 1: Trigger ALL rules
{
  StageName: "Closed Won",
  CloseDate: null,       // Violates Rule 1
  Amount: 5000,          // Violates Rule 2
  Decision_Maker__c: ""  // Violates Rule 3
}
Expected: User sees error from Rule 1 (first rule evaluated)
Note: Salesforce stops at first validation error

// Test Case 2: Trigger rule cascade
1. Fix Close Date → Save (triggers Rule 2)
2. Fix Amount → Save (triggers Rule 3)
3. Fix Decision Maker → Save (success)

// Test Case 3: Fix all at once
{
  StageName: "Closed Won",
  CloseDate: "2025-11-23",
  Amount: 150000,
  Decision_Maker__c: "John Smith"
}
Expected: Record saves successfully
```

### Testing with Automation

**Workflow Rules**:

```
Scenario: Validation rule + Workflow that updates same field

Validation Rule: Amount must be > $10,000 when Stage = Closed Won
Workflow: When Stage = Closed Won, update Close Date = TODAY()

Test: Change Stage to Closed Won with Amount = $5,000
Risk: Workflow triggers after validation → close date set → but record invalid
Resolution: Validation rule should check BEFORE workflow execution
```

**Testing Steps**:

1. Create Opportunity: Amount = $5,000, Stage = Prospecting
2. Update Stage to "Closed Won"
3. Expected: Validation error BEFORE workflow executes
4. Verify: Close Date NOT set (workflow didn't run)

**Process Builder / Flows**:

```
Scenario: Validation rule + Flow that creates child records

Validation Rule: Opportunity Amount required
Flow: When Opportunity created, create Quote

Test: Create Opportunity without Amount
Expected: Validation error BEFORE flow executes
Verify: No Quote record created
```

**Apex Triggers**:

```
Scenario: Validation rule + Trigger that modifies record

Validation Rule: Discount cannot exceed 15%
Trigger: Auto-calculate Discount_Amount__c based on Discount_Percent__c

Test: Set Discount_Percent__c = 20%
Expected: Validation error
Verify: Discount_Amount__c NOT calculated
```

### Testing with Profiles/Permissions

**Test Matrix**:

| Profile | FLS (Edit) | Expected Behavior |
|---------|------------|-------------------|
| System Admin | ✅ Edit | Bypasses validation (if configured) |
| Sales User | ✅ Edit | Validation enforced |
| Sales Manager | ✅ Edit | Validation enforced |
| Read-Only User | ❌ Read Only | Cannot edit (validation irrelevant) |

**Test Cases**:

```javascript
// Test Case 1: Admin bypass
User: System Administrator
{
  StageName: "Closed Won",
  CloseDate: null
}
Expected: Saves if bypass configured, error if not

// Test Case 2: Sales User enforcement
User: Sales User
{
  StageName: "Closed Won",
  CloseDate: null
}
Expected: Validation error

// Test Case 3: Field-level security (no edit access)
User: Sales User (no edit access to Close Date)
Validation Rule: Require Close Date when Closed Won
Expected: User cannot edit Close Date field (FLS blocks before validation)
```

---

## Bulk Testing

### Why Bulk Testing Matters

**Bulk operations behave differently**:
- Validation rules applied to EVERY record
- One invalid record = entire batch fails
- Performance impact at scale
- Governor limits can be hit

### Bulk Testing Tools

**Data Loader**:
```
1. Export 500-1,000 test records
2. Modify CSV to violate validation rule
3. Attempt bulk update via Data Loader
4. Verify: All records fail if ANY violate rule
```

**Apex Data Loader**:
```apex
List<Opportunity> opps = [SELECT Id, StageName FROM Opportunity LIMIT 1000];
for (Opportunity opp : opps) {
  opp.StageName = 'Closed Won';
  opp.CloseDate = null; // Violate rule
}
try {
  update opps;
  System.assert(false, 'Expected DmlException');
} catch (DmlException e) {
  System.debug('Caught expected error: ' + e.getMessage());
  System.assertEquals(1000, e.getNumDml()); // All 1000 failed
}
```

**Bulk API**:
```bash
# Via Salesforce CLI
sf data bulk upsert \
  --sobject Opportunity \
  --csv-file test_opportunities.csv \
  --external-id-column Id \
  --target-org mySandbox
```

### Performance Testing

**Measure Impact**:

```
1. Baseline (no validation rule):
   - Bulk update 1,000 records
   - Duration: 5 seconds
   - CPU time: 1,200ms

2. With validation rule (simple):
   - Bulk update 1,000 records
   - Duration: 6 seconds
   - CPU time: 1,500ms
   - Impact: +20% duration, +25% CPU

3. With validation rule (complex):
   - Bulk update 1,000 records
   - Duration: 10 seconds
   - CPU time: 3,000ms
   - Impact: +100% duration, +150% CPU

Threshold: <50% performance degradation acceptable
```

**Governor Limit Testing**:

```apex
// Test high-volume scenario
Test.startTest();
List<Opportunity> opps = new List<Opportunity>();
for (Integer i = 0; i < 200; i++) {
  opps.add(new Opportunity(
    Name = 'Test ' + i,
    StageName = 'Closed Won',
    CloseDate = Date.today(),
    Amount = 100000
  ));
}
insert opps; // Test with validation rule active
Test.stopTest();

// Verify no governor limit errors
System.assertEquals(200, [SELECT COUNT() FROM Opportunity WHERE Name LIKE 'Test%']);
```

---

## Impact Analysis

### Purpose

**Before deploying to production**, test the validation rule formula against existing production data to:
1. Identify how many records violate the rule
2. Calculate violation rate
3. Plan data cleanup if needed
4. Decide deployment strategy

### Running Impact Analysis

**Method 1: SOQL Count Query**

```sql
-- Test formula in WHERE clause (read-only, no changes)
SELECT COUNT()
FROM Opportunity
WHERE ISPICKVAL(StageName, 'Closed Won')
  AND ISNULL(CloseDate)

-- Result: 45 records (out of 10,000 total = 0.45%)
```

**Method 2: Detailed Record List**

```sql
SELECT Id, Name, StageName, CloseDate, Amount, Owner.Name
FROM Opportunity
WHERE ISPICKVAL(StageName, 'Closed Won')
  AND ISNULL(CloseDate)
ORDER BY Amount DESC

-- Export to CSV for review
```

**Method 3: Automated Impact Analyzer**

```bash
node scripts/lib/validation-rule-impact-analyzer.js \
  --org production \
  --object Opportunity \
  --formula "AND(ISPICKVAL(StageName, 'Closed Won'), ISNULL(CloseDate))"

# Output:
# Total Records: 10,000
# Violating Records: 45
# Violation Rate: 0.45%
# Risk Level: LOW
# Recommendation: Safe to deploy active
```

### Interpreting Results

**Violation Rate Thresholds**:

| Violation Rate | Risk Level | Recommended Action |
|----------------|------------|-------------------|
| **0%** | None | Deploy active immediately |
| **0.01% - 1%** | Low | Deploy active, notify users of small cleanup |
| **1% - 5%** | Medium | Deploy inactive, provide 1-week grace period, then activate |
| **5% - 10%** | High | Deploy inactive, mandate data cleanup, verify cleanup, then activate |
| **>10%** | Very High | Do NOT deploy until data cleaned, then rerun analysis |

**Example Decision Tree**:

```
Violation Rate: 0.45% (45 records out of 10,000)

Decision: SAFE TO DEPLOY ACTIVE
Reasoning:
- Low violation rate (<1%)
- 45 records manageable for users to fix
- Business benefit outweighs minor user friction

Communication Plan:
- Email sales team: "45 Closed Won opportunities missing Close Date"
- Attach list of affected records
- Deadline: Fix within 48 hours
- After 48 hours: Users prompted to fix on next save
```

---

## Deployment Strategies

### Strategy 1: Direct Activation

**When to Use**:
- Violation rate: 0% - 1%
- Low-traffic object (< 100 saves/day)
- Non-critical validation (e.g., data quality improvement)

**Process**:

```bash
# Step 1: Deploy active rule
sf project deploy start \
  --metadata ValidationRule:Opportunity.Require_Close_Date_When_Won \
  --target-org production

# Step 2: Verify deployment
sf project deploy report --job-id 0Af...

# Step 3: Test with sample record
# Edit one test record to trigger validation
```

**Pros**:
- ✅ Simplest approach
- ✅ No downtime
- ✅ Immediate enforcement

**Cons**:
- ❌ Cannot rollback easily (requires redeployment)
- ❌ Users immediately affected
- ❌ No grace period for data cleanup

---

### Strategy 2: Staged Activation

**When to Use**:
- Violation rate: 1% - 5%
- Medium-traffic object (100-1000 saves/day)
- Moderate-impact validation (requires user adjustment)

**Process**:

```bash
# Stage 1: Deploy INACTIVE (Day 1)
sf project deploy start \
  --metadata ValidationRule:Opportunity.Require_Close_Date_When_Won \
  --target-org production

# Note: Set Active=false in XML before deploying

# Stage 2: Notify users (Day 1-7)
# - Email: "New validation rule coming next week"
# - Provide list of affected records
# - Instructions to fix

# Stage 3: Activate rule (Day 7)
# Via Salesforce UI:
# Setup → Object Manager → Opportunity → Validation Rules → Activate

# Stage 4: Monitor (Day 7-9)
# - Check error frequency
# - Review help desk tickets
# - Adjust error message if needed
```

**Pros**:
- ✅ Grace period for users
- ✅ Gradual enforcement
- ✅ Lower user friction

**Cons**:
- ❌ Requires manual activation step
- ❌ Longer deployment timeline
- ❌ Users may forget during grace period

---

### Strategy 3: Profile-Filtered Rollout

**When to Use**:
- Violation rate: 5% - 10%
- High-traffic object (> 1000 saves/day)
- High-impact validation (affects many users)

**Process**:

```bash
# Step 1: Deploy with profile bypass for all non-pilot users
Formula:
AND(
  $Profile.Name != "System Administrator",
  $Profile.Name != "Sales Pilot User",  // Pilot group
  ISPICKVAL(StageName, "Closed Won"),
  ISNULL(CloseDate)
)

# Step 2: Pilot with Sales Pilot User profile (Week 1)
# - 5-10 pilot users
# - Monitor closely
# - Adjust formula/error message based on feedback

# Step 3: Expand to all Sales Users (Week 2)
Update formula:
AND(
  $Profile.Name != "System Administrator",
  $Profile.Name != "Support Team",      // Exclude support
  ISPICKVAL(StageName, "Closed Won"),
  ISNULL(CloseDate)
)

# Step 4: Enable for all profiles (Week 3)
Remove profile bypasses
```

**Pros**:
- ✅ Controlled rollout
- ✅ Early feedback from pilot
- ✅ Can adjust before full deployment

**Cons**:
- ❌ Complex formula management
- ❌ Profile-dependent (must maintain list)
- ❌ Longer deployment timeline

---

### Strategy 4: Record Type-Filtered Rollout

**When to Use**:
- Multiple record types with different business processes
- Violation rate varies by record type
- Need phased rollout by business unit

**Process**:

```bash
# Step 1: Deploy for Enterprise record type only (Week 1)
Formula:
AND(
  RecordType.DeveloperName = "Enterprise",
  ISPICKVAL(StageName, "Closed Won"),
  ISNULL(CloseDate)
)

# Step 2: Expand to SMB record type (Week 2)
Formula:
AND(
  OR(
    RecordType.DeveloperName = "Enterprise",
    RecordType.DeveloperName = "SMB"
  ),
  ISPICKVAL(StageName, "Closed Won"),
  ISNULL(CloseDate)
)

# Step 3: Enable for all record types (Week 3)
Formula:
AND(
  ISPICKVAL(StageName, "Closed Won"),
  ISNULL(CloseDate)
)
```

**Pros**:
- ✅ Aligns with business processes
- ✅ Record type-specific rollout
- ✅ Can adjust per business unit

**Cons**:
- ❌ Requires multiple redeployments
- ❌ Complex tracking
- ❌ Longest deployment timeline

---

## Pre-Deployment Checklist

### Technical Validation

- [ ] **Formula syntax valid** (no errors in formula builder)
- [ ] **All fields exist** in target object
- [ ] **Picklist fields use TEXT()** (not ISBLANK/ISNULL)
- [ ] **Parent relationships null-checked** (NOT(ISBLANK(Parent.Id)))
- [ ] **Complexity score <60** (use complexity calculator)
- [ ] **Error message <255 characters** and user-friendly
- [ ] **Impact analysis complete** (violation rate known)
- [ ] **Tested in sandbox** (all test cases passed)
- [ ] **Bulk tested** (1,000+ records)
- [ ] **Integration tested** (with other rules/automation)

### Business Validation

- [ ] **Business requirement documented** (in rule description)
- [ ] **Stakeholder approval** (email/ticket reference)
- [ ] **User communication plan** (if violation rate >1%)
- [ ] **Deployment strategy selected** (direct, staged, filtered)
- [ ] **Rollback plan documented** (in case of issues)
- [ ] **Monitoring plan** (error frequency, help desk tickets)

### Compliance & Documentation

- [ ] **Naming convention followed** (`Verb_Subject_Condition`)
- [ ] **Description complete** (business requirement, date, owner)
- [ ] **Change management ticket** (if required)
- [ ] **Backup of existing rules** (export before deployment)
- [ ] **Git commit** (if using version control)
- [ ] **Documentation updated** (wiki, runbook, KB articles)

---

## Deployment Execution

### Step-by-Step Deployment

#### Option 1: Salesforce UI

```
1. Navigate to Setup → Object Manager → [Object] → Validation Rules
2. Click "New" (or edit existing rule)
3. Enter Rule Name, Description, Formula, Error Message
4. Check "Active" (or leave unchecked for staged deployment)
5. Click "Save"
6. Test with sample record
```

#### Option 2: Salesforce CLI (Recommended)

```bash
# Step 1: Prepare metadata
# File: force-app/main/default/objects/Opportunity/validationRules/Require_Close_Date_When_Won.validationRule-meta.xml

<?xml version="1.0" encoding="UTF-8"?>
<ValidationRule xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Require_Close_Date_When_Won</fullName>
    <active>true</active>
    <description>Require Close Date when Opportunity is marked as Closed Won per Sales Policy v2.3</description>
    <errorConditionFormula>AND(
  ISPICKVAL(StageName, &quot;Closed Won&quot;),
  ISNULL(CloseDate)
)</errorConditionFormula>
    <errorMessage>Close Date is required when Stage is Closed Won. Please enter the date the deal closed.</errorMessage>
</ValidationRule>

# Step 2: Validate deployment package
sf project deploy validate \
  --metadata ValidationRule:Opportunity.Require_Close_Date_When_Won \
  --target-org production

# Step 3: Deploy (if validation passed)
sf project deploy start \
  --metadata ValidationRule:Opportunity.Require_Close_Date_When_Won \
  --target-org production

# Step 4: Monitor deployment
sf project deploy report --job-id 0Af...

# Step 5: Verify deployment
sf data query \
  --query "SELECT ValidationName, Active FROM ValidationRule WHERE ValidationName = 'Require_Close_Date_When_Won' AND EntityDefinition.QualifiedApiName = 'Opportunity'" \
  --use-tooling-api \
  --target-org production
```

#### Option 3: Change Sets

```
1. In sandbox: Setup → Deployment Settings → Outbound Change Sets
2. Create new change set
3. Add validation rule component
4. Upload to production
5. In production: Setup → Deployment Settings → Inbound Change Sets
6. Validate change set
7. Deploy change set
```

#### Option 4: Metadata API / Packages

```bash
# Create package.xml
cat > package.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>Opportunity.Require_Close_Date_When_Won</members>
        <name>ValidationRule</name>
    </types>
    <version>62.0</version>
</Package>
EOF

# Deploy package
sf project deploy start \
  --manifest package.xml \
  --target-org production
```

---

## Post-Deployment Verification

### Immediate Verification (First 30 Minutes)

**Step 1: Confirm Rule is Active**

```bash
sf data query \
  --query "SELECT ValidationName, Active, Description FROM ValidationRule WHERE ValidationName = 'Require_Close_Date_When_Won' AND EntityDefinition.QualifiedApiName = 'Opportunity'" \
  --use-tooling-api \
  --target-org production
```

**Expected Result**: `Active = true`

**Step 2: Test with Sample Record**

```
1. Edit a test Opportunity record
2. Set Stage = "Closed Won"
3. Remove Close Date
4. Attempt to save
5. Expected: Validation error displays
6. Verify: Error message matches expected text
```

**Step 3: Test Positive Case**

```
1. Set Stage = "Closed Won"
2. Enter Close Date = Today
3. Attempt to save
4. Expected: Record saves successfully
```

### Short-Term Monitoring (First 48 Hours)

**Error Frequency Monitoring**:

```sql
-- Query debug logs for validation errors (if logging enabled)
SELECT COUNT()
FROM ApexLog
WHERE Operation = 'validation_error'
  AND Request LIKE '%Require_Close_Date_When_Won%'
  AND CreatedDate = LAST_N_DAYS:2
```

**Help Desk Ticket Monitoring**:

```
Track tickets with keywords:
- "Close Date required"
- "Cannot save Opportunity"
- "Validation error"

Target: <5 tickets in first 48 hours
```

**User Feedback**:

```
Email sales team after 24 hours:
"How is the new Close Date validation working?
- Any issues?
- Error message clear?
- Any unexpected behavior?"
```

### Long-Term Monitoring (First 30 Days)

**Monthly Metrics**:

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Error frequency | <10/day | 8/day | ✅ On target |
| Help desk tickets | <15/month | 12/month | ✅ On target |
| Data quality improvement | +20% | +25% | ✅ Exceeding |
| User complaints | <3/month | 2/month | ✅ On target |

**Review Triggers**:

- ❌ Error frequency >20/day → Review formula, error message
- ❌ Help desk tickets >30/month → Create KB article, improve communication
- ❌ User complaints >10/month → Consider adjusting rule or adding bypass

---

## Rollback Procedures

### When to Rollback

**Rollback if**:
- Validation rule has incorrect logic (false positives)
- Error frequency >100/day (excessive user friction)
- Critical business process blocked
- User complaints exceed acceptable threshold

### Rollback Methods

#### Method 1: Deactivate Rule (Fastest)

```bash
# Via Salesforce UI (30 seconds)
Setup → Object Manager → [Object] → Validation Rules → Edit Rule → Uncheck "Active" → Save

# Via CLI (2 minutes)
# 1. Update XML: <active>false</active>
# 2. Deploy
sf project deploy start \
  --metadata ValidationRule:Opportunity.Require_Close_Date_When_Won \
  --target-org production
```

**Pros**:
- ✅ Fastest (30 seconds via UI)
- ✅ Rule remains in org for future fix

**Cons**:
- ❌ Rule still visible in setup
- ❌ May cause confusion

#### Method 2: Delete Rule (Permanent)

```bash
# Via CLI
sf project delete source \
  --metadata ValidationRule:Opportunity.Require_Close_Date_When_Won \
  --target-org production

# Via UI
Setup → Object Manager → [Object] → Validation Rules → Delete
```

**Pros**:
- ✅ Complete removal
- ✅ No confusion

**Cons**:
- ❌ Must redeploy if need to reactivate
- ❌ Loses rule history

#### Method 3: Add Temporary Bypass (Quick Fix)

```bash
# Update formula to bypass for all users temporarily
Old Formula:
AND(
  ISPICKVAL(StageName, "Closed Won"),
  ISNULL(CloseDate)
)

New Formula:
AND(
  $Profile.Name = "TEMPORARY_BYPASS_WILL_NEVER_MATCH",
  ISPICKVAL(StageName, "Closed Won"),
  ISNULL(CloseDate)
)

# Effect: Rule active but never triggers (all profiles bypass)
# Can fix formula without deactivating rule
```

**Pros**:
- ✅ Rule remains active
- ✅ Easy to undo

**Cons**:
- ❌ Hacky solution
- ❌ May confuse future maintainers

### Rollback Decision Tree

```
Is the issue with rule logic?
├─ YES → Can you fix within 1 hour?
│  ├─ YES → Fix formula, redeploy
│  └─ NO → Deactivate rule, fix offline, redeploy
└─ NO → Is user friction excessive (>100 errors/day)?
   ├─ YES → Deactivate rule, improve communication, reactivate
   └─ NO → Keep active, monitor, adjust if needed
```

### Post-Rollback Actions

1. **Root Cause Analysis**
   - Why did the rule fail?
   - What was missed in testing?
   - How can we prevent similar issues?

2. **Fix and Retest**
   - Update formula
   - Retest in sandbox (all test cases)
   - Rerun impact analysis

3. **Redeploy**
   - Use staged activation (if previously used direct)
   - Monitor closely
   - Communicate to users

4. **Document Lessons Learned**
   - Update testing checklist
   - Add to runbook examples
   - Share with team

---

## Quick Reference

### Deployment Strategy Selector

| Violation Rate | Risk Level | Strategy | Timeline |
|----------------|------------|----------|----------|
| 0% | None | Direct Activation | 1 day |
| 0.01% - 1% | Low | Direct Activation | 1 day |
| 1% - 5% | Medium | Staged Activation | 1 week |
| 5% - 10% | High | Profile/Record Type Filtered | 2-3 weeks |
| >10% | Very High | Do NOT deploy until data cleaned | N/A |

### Testing Checklist Quick View

```
Unit Testing:
✓ Positive cases (should pass)
✓ Negative cases (should fail)
✓ Edge cases
✓ Null/blank values

Integration Testing:
✓ Other validation rules
✓ Workflows/Flows/Triggers
✓ Profile/Record Type scenarios

Bulk Testing:
✓ 1,000+ records via Data Loader
✓ Performance impact <50%
✓ No governor limit errors

Impact Analysis:
✓ SOQL query against production
✓ Violation rate calculated
✓ Decision documented
```

### Deployment Commands Quick Reference

```bash
# Validate deployment
sf project deploy validate --metadata ValidationRule:[Object].[RuleName]

# Deploy
sf project deploy start --metadata ValidationRule:[Object].[RuleName]

# Verify
sf data query --query "SELECT ValidationName, Active FROM ValidationRule WHERE ValidationName = '[RuleName]'" --use-tooling-api

# Rollback (deactivate)
# Update XML: <active>false</active>
sf project deploy start --metadata ValidationRule:[Object].[RuleName]
```

### Error Frequency Targets

| Frequency | Status | Action |
|-----------|--------|--------|
| 0-10/day | ✅ Excellent | Monitor |
| 10-20/day | ⚠️ Acceptable | Monitor closely |
| 20-50/day | ⚠️ Concerning | Review error message, create KB article |
| 50-100/day | ❌ High | Consider adjustments |
| >100/day | ❌ Critical | Immediate review, consider rollback |

---

## Next Steps

**Continue to Runbook 6**: [Monitoring and Maintenance](./06-monitoring-and-maintenance.md)

Learn how to monitor validation rule performance, maintain rule quality, and handle long-term governance.

---

**Related Runbooks**:
- [Runbook 4: Validation and Best Practices](./04-validation-and-best-practices.md)
- [Runbook 7: Troubleshooting](./07-troubleshooting.md)

---

**Version History**:
- v1.0.0 (2025-11-23) - Initial release
