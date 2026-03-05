# Trigger Management Runbook 5: Deployment and Monitoring

**Version**: 1.0.0
**Last Updated**: 2025-11-23
**Audience**: Salesforce Developers, Release Managers, DevOps Engineers
**Prerequisites**: Runbook 1-4 (Fundamentals, Handler Pattern, Bulkification, Testing)

---

## Table of Contents

1. [Introduction](#introduction)
2. [Deployment Strategies](#deployment-strategies)
3. [Pre-Deployment Validation](#pre-deployment-validation)
4. [Production Deployment Checklist](#production-deployment-checklist)
5. [Monitoring and Logging](#monitoring-and-logging)
6. [Performance Tracking](#performance-tracking)
7. [Rollback Procedures](#rollback-procedures)
8. [Post-Deployment Verification](#post-deployment-verification)
9. [Incident Response](#incident-response)
10. [Quick Reference](#quick-reference)

---

## Introduction

Deploying triggers to production requires careful planning and monitoring. A poorly deployed trigger can immediately impact users, cause data quality issues, or block critical business operations.

### Why Deployment Matters

**Impact of Bad Deployment**:
- Triggers fire on EVERY record operation
- Errors block user operations immediately
- Poor performance affects ALL users
- Governor limit violations cascade to related operations
- Data corruption can propagate quickly

**Example Failure Scenario**:
```
15:00 - Trigger deployed to production
15:01 - Users report "Unable to save opportunities"
15:02 - All opportunity updates blocked by trigger error
15:05 - Sales team unable to work (200 users blocked)
15:10 - Emergency rollback initiated
15:15 - Normal operations restored

Impact: 15 minutes downtime, 200 affected users, lost productivity
```

### Deployment Philosophy

1. **Validate Early**: Catch issues before production
2. **Deploy Incrementally**: Reduce blast radius
3. **Monitor Actively**: Detect issues immediately
4. **Rollback Quickly**: Minimize user impact
5. **Learn Continuously**: Improve process after each deployment

---

## Deployment Strategies

### Strategy 1: Direct Deployment (Medium Risk)

**When to Use**:
- New trigger (no existing logic)
- Sandbox environment
- Low-traffic object (< 1,000 DML/day)
- Non-critical business process

**Process**:
1. Test in sandbox
2. Deploy to production
3. Monitor for 24 hours

**Risk Level**: Medium
- ✅ Fast deployment
- ❌ Immediate full impact if issues occur

**Example**:
```bash
# Deploy trigger and handler
sf project deploy start --source-dir force-app/main/default/triggers/NewObjectTrigger.trigger
sf project deploy start --source-dir force-app/main/default/classes/NewObjectTriggerHandler.cls
```

### Strategy 2: Staged Deployment (Low Risk)

**When to Use**:
- Production environment
- Medium-traffic object (1,000-10,000 DML/day)
- Established business process
- Time to validate gradually

**Process**:
1. Deploy to sandbox → Test
2. Deploy to integration environment → Test
3. Deploy to staging → Test
4. Deploy to production during low-traffic period
5. Monitor for 48 hours

**Risk Level**: Low
- ✅ Multiple validation points
- ✅ Issues caught before production
- ❌ Slower deployment timeline

**Timeline Example**:
```
Day 1: Deploy to sandbox → Test
Day 2: Deploy to integration → Test
Day 3: Deploy to staging → Test
Day 4: Deploy to production (Saturday 2 AM) → Monitor
Day 5-6: Continue monitoring
```

### Strategy 3: Blue-Green Deployment (Very Low Risk)

**When to Use**:
- Critical business process
- High-traffic object (> 10,000 DML/day)
- Zero downtime requirement
- Complex trigger logic

**Process**:
1. Deploy new trigger (inactive)
2. Run parallel testing (old vs new logic)
3. Gradually route traffic to new trigger
4. Monitor both versions
5. Full cutover when confident
6. Keep old version for fast rollback

**Risk Level**: Very Low
- ✅ Zero downtime
- ✅ Easy rollback
- ✅ Parallel validation
- ❌ Most complex setup

**Implementation**:
```apex
// Custom setting controls which version to use
trigger OpportunityTrigger on Opportunity (before insert, before update, after insert, after update) {
    Trigger_Configuration__c config = Trigger_Configuration__c.getInstance();

    if (config.Use_New_Logic__c) {
        // New trigger logic
        OpportunityTriggerHandler_v2.handleTrigger();
    } else {
        // Old trigger logic (fallback)
        OpportunityTriggerHandler_v1.handleTrigger();
    }
}

// Gradual rollout via custom setting
// Week 1: 10% of users (set config for 10% of profiles)
// Week 2: 50% of users
// Week 3: 100% of users
```

### Strategy 4: Canary Deployment (Low Risk)

**When to Use**:
- Uncertain about impact
- Want progressive validation
- Can identify test users/profiles
- Complex business logic changes

**Process**:
1. Deploy to production (inactive)
2. Enable for 5% of users → Monitor
3. Enable for 25% of users → Monitor
4. Enable for 100% of users → Monitor
5. Each stage: 24-48 hours monitoring

**Risk Level**: Low
- ✅ Progressive validation
- ✅ Limited blast radius initially
- ✅ Real production data testing
- ❌ Requires user segmentation

**Implementation**:
```apex
trigger OpportunityTrigger on Opportunity (before insert) {
    // Check if trigger is enabled for this user
    if (TriggerController.isEnabledForUser(UserInfo.getUserId())) {
        OpportunityTriggerHandler.handleBeforeInsert(Trigger.new);
    }
}

public class TriggerController {
    public static Boolean isEnabledForUser(Id userId) {
        // Get user's profile
        User currentUser = [SELECT ProfileId FROM User WHERE Id = :userId];

        // Check custom setting for enabled profiles
        Trigger_Rollout__c rollout = Trigger_Rollout__c.getInstance();

        // Canary stage 1: Only enable for Test profile
        if (rollout.Stage__c == 'Canary_5_Percent') {
            return currentUser.ProfileId == rollout.Test_Profile_Id__c;
        }

        // Canary stage 2: Enable for additional profiles
        if (rollout.Stage__c == 'Canary_25_Percent') {
            Set<Id> enabledProfiles = new Set<Id>{
                rollout.Test_Profile_Id__c,
                rollout.Sales_Profile_Id__c
            };
            return enabledProfiles.contains(currentUser.ProfileId);
        }

        // Full rollout
        if (rollout.Stage__c == 'Full_Rollout') {
            return true;
        }

        return false;  // Default: disabled
    }
}
```

---

## Pre-Deployment Validation

### Validation Checklist

**Code Quality**:
- [ ] All tests passing (75%+ coverage)
- [ ] Bulk test with 200 records passes
- [ ] Governor limit test passes
- [ ] Code review completed
- [ ] No SOQL/DML in loops
- [ ] Recursion prevention implemented

**Business Logic**:
- [ ] Requirements documented
- [ ] Edge cases identified and tested
- [ ] Error messages are user-friendly
- [ ] Business stakeholders approved logic

**Integration**:
- [ ] Doesn't conflict with existing triggers
- [ ] Doesn't conflict with flows/process builder
- [ ] Order of execution considered
- [ ] External integrations tested

**Performance**:
- [ ] Complexity score < 70 (use trigger-complexity-calculator.js)
- [ ] Query efficiency validated
- [ ] No nested loops
- [ ] Map-based lookups used

**Documentation**:
- [ ] Handler pattern used
- [ ] Code commented
- [ ] Deployment notes prepared
- [ ] Rollback plan documented

### Pre-Deployment Testing Script

```bash
#!/bin/bash
# pre-deployment-validation.sh

echo "=== Trigger Pre-Deployment Validation ==="

# 1. Run all tests
echo "1. Running tests..."
sf apex run test --test-level RunLocalTests --result-format human

# 2. Check code coverage
echo "2. Checking code coverage..."
sf apex get test --test-run-id <test-run-id> --code-coverage

# 3. Validate trigger complexity
echo "3. Validating trigger complexity..."
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/trigger-complexity-calculator.js assess \
  --file force-app/main/default/classes/OpportunityTriggerHandler.cls

# 4. Detect anti-patterns
echo "4. Detecting anti-patterns..."
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/trigger-complexity-calculator.js detect-anti-patterns \
  --file force-app/main/default/classes/OpportunityTriggerHandler.cls

# 5. Validate deployment package
echo "5. Validating deployment package..."
sf project deploy validate --source-dir force-app

echo "=== Validation Complete ==="
```

---

## Production Deployment Checklist

### Before Deployment

**Timing**:
- [ ] Deploy during low-traffic period (nights/weekends)
- [ ] Avoid month-end/quarter-end
- [ ] Avoid known high-volume events
- [ ] Schedule deployment window (2-4 hours)

**Preparation**:
- [ ] Backup current trigger code
- [ ] Document current behavior
- [ ] Prepare rollback plan
- [ ] Notify stakeholders (deploy time, expected impact)
- [ ] Have team on standby for monitoring

**Environment**:
- [ ] Tested in full sandbox
- [ ] Tested in staging (if available)
- [ ] All dependent components deployed first
- [ ] Database cleaned (if needed)

### During Deployment

**Deployment Steps**:
1. **Deploy trigger (inactive)**:
   ```bash
   # Deploy with inactive flag
   sf project deploy start --source-dir force-app/main/default/triggers
   ```

2. **Verify deployment succeeded**:
   ```bash
   sf project deploy report --job-id <deploy-id>
   ```

3. **Run smoke tests**:
   ```apex
   // Create test record
   Opportunity opp = new Opportunity(
       Name = 'Deployment Test',
       StageName = 'Prospecting',
       CloseDate = Date.today()
   );
   insert opp;

   // Verify trigger executed correctly
   Opportunity inserted = [SELECT Probability FROM Opportunity WHERE Id = :opp.Id];
   System.assert(inserted.Probability == 10, 'Trigger should set probability');

   // Clean up
   delete opp;
   ```

4. **Activate trigger** (if using activation flag)

5. **Monitor initial transactions**:
   - Watch debug logs for first 10 minutes
   - Check for exceptions in System Overview
   - Verify expected behavior

### After Deployment

**Immediate (First Hour)**:
- [ ] Monitor error logs every 5 minutes
- [ ] Check System Overview for exceptions
- [ ] Verify governor limits not exceeded
- [ ] Test with real user scenario
- [ ] Check performance metrics

**Short-term (First 24 Hours)**:
- [ ] Monitor error rates hourly
- [ ] Check user feedback
- [ ] Verify data quality
- [ ] Review debug logs for warnings
- [ ] Track DML volumes

**Long-term (First Week)**:
- [ ] Monitor daily error rates
- [ ] Check performance trends
- [ ] Review governor limit usage
- [ ] Collect user feedback
- [ ] Document lessons learned

---

## Monitoring and Logging

### Real-Time Monitoring

#### 1. System Overview Dashboard

**Location**: Setup → System Overview

**Monitor**:
- Apex Exceptions: Should be 0 or very low
- Workflow Errors: Check for trigger-related failures
- API Usage: Ensure trigger isn't causing spikes

**Alert Thresholds**:
- Exceptions > 10/hour → Investigate immediately
- Exceptions > 100/day → Consider rollback

#### 2. Debug Logs

**Setup Debug Log for Monitoring**:
```
1. Setup → Debug Logs
2. Create log for automated monitoring user
3. Set Apex Code level to FINEST
4. Set retention to 24 hours
```

**Monitor Debug Logs**:
```
14:32:15.123 TRIGGER_BEGIN OpportunityTrigger on Opportunity trigger event BeforeInsert
14:32:15.145 USER_DEBUG [10]|DEBUG|Trigger.new size: 50
14:32:15.234 USER_DEBUG [25]|DEBUG|Queries used: 1/100
14:32:15.456 USER_DEBUG [30]|DEBUG|DML used: 0/150
14:32:15.567 TRIGGER_END OpportunityTrigger

Total execution time: 444ms  // ← Monitor for performance
```

#### 3. Email Alerts

**Setup Email Alert for Exceptions**:
```apex
public class TriggerMonitoring {
    public static void sendAlertOnException(String triggerName, Exception e) {
        Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
        email.setToAddresses(new String[]{'dev-alerts@company.com'});
        email.setSubject('ALERT: Trigger Exception - ' + triggerName);
        email.setPlainTextBody(
            'Exception in trigger: ' + triggerName + '\n' +
            'Message: ' + e.getMessage() + '\n' +
            'Stack trace: ' + e.getStackTraceString() + '\n' +
            'User: ' + UserInfo.getUserName() + '\n' +
            'Time: ' + System.now()
        );
        Messaging.sendEmail(new List<Messaging.SingleEmailMessage>{email});
    }
}

// Use in handler
public static void handleBeforeInsert(List<Opportunity> newOpps) {
    try {
        // Business logic...
    } catch (Exception e) {
        TriggerMonitoring.sendAlertOnException('OpportunityTrigger', e);
        throw e;  // Re-throw to prevent silent failures
    }
}
```

### Logging Best Practices

#### Log Levels

```apex
public static void handleBeforeInsert(List<Opportunity> newOpps) {
    System.debug(LoggingLevel.DEBUG, 'Trigger.new size: ' + newOpps.size());

    Integer queriesBefore = Limits.getQueries();

    // Business logic...

    Integer queriesUsed = Limits.getQueries() - queriesBefore;
    if (queriesUsed > 50) {
        System.debug(LoggingLevel.WARN, 'High query usage: ' + queriesUsed + '/100');
    }

    System.debug(LoggingLevel.DEBUG, 'Queries used: ' + queriesUsed);
    System.debug(LoggingLevel.DEBUG, 'DML used: ' + Limits.getDmlStatements());
}
```

#### Performance Logging

```apex
public class PerformanceLogger {
    private Long startTime;
    private String operationName;

    public PerformanceLogger(String operationName) {
        this.operationName = operationName;
        this.startTime = System.currentTimeMillis();
        System.debug(LoggingLevel.DEBUG, 'Started: ' + operationName);
    }

    public void logEnd() {
        Long endTime = System.currentTimeMillis();
        Long duration = endTime - startTime;

        if (duration > 1000) {  // > 1 second
            System.debug(LoggingLevel.WARN, operationName + ' took ' + duration + 'ms (SLOW)');
        } else {
            System.debug(LoggingLevel.DEBUG, operationName + ' took ' + duration + 'ms');
        }
    }
}

// Usage
public static void handleBeforeInsert(List<Opportunity> newOpps) {
    PerformanceLogger logger = new PerformanceLogger('handleBeforeInsert');

    // Business logic...

    logger.logEnd();
}
```

---

## Performance Tracking

### Key Performance Metrics

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| **Execution Time** | < 500ms | 500-2000ms | > 2000ms |
| **SOQL Queries** | < 10 | 10-50 | > 50 |
| **DML Statements** | < 5 | 5-20 | > 20 |
| **CPU Time** | < 2000ms | 2000-5000ms | > 5000ms |
| **Heap Size** | < 1MB | 1-3MB | > 3MB |
| **Error Rate** | 0% | < 1% | > 1% |

### Performance Dashboard Query

```sql
-- Query Apex execution logs
SELECT ApexClass.Name,
       COUNT(Id) AS ExecutionCount,
       AVG(DurationMilliseconds) AS AvgDuration,
       MAX(DurationMilliseconds) AS MaxDuration,
       SUM(NumberOfQueries) AS TotalQueries
FROM ApexLog
WHERE LogUser = 'Production User'
AND CreatedDate = LAST_N_DAYS:7
AND ApexClass.Name LIKE '%TriggerHandler%'
GROUP BY ApexClass.Name
ORDER BY AvgDuration DESC
```

### Performance Optimization Triggers

**Trigger 1: Slow Execution (> 2 seconds)**
```
Action: Investigate bottleneck
Common causes:
- Nested loops
- Large SOQL queries without LIMIT
- Complex calculations
- External callouts not using @future
```

**Trigger 2: High Query Count (> 50)**
```
Action: Check for queries in loops
Fix: Move queries outside loops, use Map for lookups
```

**Trigger 3: High CPU Usage (> 5 seconds)**
```
Action: Profile code execution
Common causes:
- Nested loops
- Large collections
- String concatenation in loops
- Complex regex operations
```

---

## Rollback Procedures

### Immediate Rollback (Emergency)

**When to Rollback**:
- Critical business process blocked
- High error rate (> 10% of transactions)
- Data corruption detected
- Governor limit exceptions widespread

**Rollback Steps**:

1. **Deactivate trigger immediately**:
   ```bash
   # Option 1: Delete trigger (fastest)
   sf project delete source --metadata Trigger:OpportunityTrigger

   # Option 2: Deploy previous version
   git checkout <previous-commit>
   sf project deploy start --source-dir force-app/main/default/triggers
   ```

2. **Verify rollback succeeded**:
   - Test creating/updating records
   - Check System Overview for exceptions
   - Verify error rate decreased

3. **Communicate**:
   - Notify stakeholders
   - Post status update
   - Document incident

4. **Post-mortem**:
   - Root cause analysis
   - Update validation checklist
   - Schedule fix and redeployment

### Gradual Rollback (Planned)

**When to Use**:
- Issues detected but not critical
- Want to validate gradual disablement
- Using blue-green or canary deployment

**Rollback Steps**:

1. **Reduce traffic to new trigger**:
   ```apex
   // Reduce from 100% to 50%
   Trigger_Rollout__c rollout = Trigger_Rollout__c.getInstance();
   rollout.Stage__c = 'Canary_50_Percent';
   update rollout;
   ```

2. **Monitor for 24 hours**

3. **Continue reducing** if issues persist:
   ```apex
   rollout.Stage__c = 'Canary_10_Percent';  // 10%
   rollout.Stage__c = 'Canary_0_Percent';   // 0% (fully disabled)
   ```

4. **Full rollback if needed**

---

## Post-Deployment Verification

### Verification Checklist

**Functional Verification**:
- [ ] Create record → Verify trigger executed
- [ ] Update record → Verify trigger executed
- [ ] Delete record → Verify trigger executed
- [ ] Bulk operation (10+ records) → Verify all processed

**Data Quality Verification**:
- [ ] Spot-check 10-20 recently created/updated records
- [ ] Verify calculated fields are correct
- [ ] Check related records updated correctly
- [ ] Validate no data corruption

**Performance Verification**:
- [ ] Check debug logs for execution time
- [ ] Verify SOQL/DML usage within limits
- [ ] Monitor System Overview for exceptions
- [ ] Check user-reported performance issues

**User Acceptance Verification**:
- [ ] Test with real user scenarios
- [ ] Verify error messages are user-friendly
- [ ] Check business process still works
- [ ] Collect user feedback

### Verification Script

```apex
// Run in Developer Console or Execute Anonymous

System.debug('=== Post-Deployment Verification ===');

// Test 1: Single record insert
Opportunity opp1 = new Opportunity(
    Name = 'Verification Test 1',
    StageName = 'Prospecting',
    CloseDate = Date.today()
);

Integer queriesBefore = Limits.getQueries();
Long timeBefore = System.currentTimeMillis();

insert opp1;

Integer queriesUsed = Limits.getQueries() - queriesBefore;
Long executionTime = System.currentTimeMillis() - timeBefore;

System.debug('Queries used: ' + queriesUsed);
System.debug('Execution time: ' + executionTime + 'ms');

// Verify trigger executed
Opportunity inserted = [SELECT Probability FROM Opportunity WHERE Id = :opp1.Id];
System.assert(inserted.Probability != null, 'Trigger should set probability');
System.debug('✅ Single insert test passed');

// Test 2: Bulk insert
List<Opportunity> opps = new List<Opportunity>();
for (Integer i = 0; i < 50; i++) {
    opps.add(new Opportunity(
        Name = 'Verification Test Bulk ' + i,
        StageName = 'Prospecting',
        CloseDate = Date.today()
    ));
}

queriesBefore = Limits.getQueries();
timeBefore = System.currentTimeMillis();

insert opps;

queriesUsed = Limits.getQueries() - queriesBefore;
executionTime = System.currentTimeMillis() - timeBefore;

System.debug('Bulk queries used: ' + queriesUsed);
System.debug('Bulk execution time: ' + executionTime + 'ms');
System.debug('✅ Bulk insert test passed');

// Test 3: Update
opp1.StageName = 'Qualification';
update opp1;
System.debug('✅ Update test passed');

// Clean up
delete new List<Opportunity>{opp1};
delete opps;
System.debug('✅ Delete test passed');

System.debug('=== All Verification Tests Passed ===');
```

---

## Incident Response

### Incident Severity Levels

| Level | Description | Response Time | Rollback Threshold |
|-------|-------------|---------------|-------------------|
| **P0 - Critical** | Business process completely blocked | Immediate (< 5 min) | Rollback immediately |
| **P1 - High** | Significant user impact, workaround available | < 30 min | Rollback if not resolved in 1 hour |
| **P2 - Medium** | Limited user impact, non-critical process | < 4 hours | Fix forward if possible |
| **P3 - Low** | Minor issue, cosmetic, or enhancement | < 24 hours | No rollback needed |

### Incident Response Workflow

**P0 Critical Incident**:
```
1. Detect (< 1 min)
   - Monitor alerts trigger
   - User reports flood in

2. Assess (< 2 min)
   - Check System Overview
   - Review debug logs
   - Determine impact

3. Rollback (< 5 min)
   - Execute emergency rollback
   - Verify rollback succeeded
   - Notify stakeholders

4. Communicate (< 10 min)
   - Status update: "Issue detected, rolling back"
   - Status update: "Rollback complete, investigating"

5. Root Cause Analysis (< 1 hour)
   - Review code changes
   - Identify root cause
   - Document findings

6. Fix and Redeploy (< 24 hours)
   - Fix issue
   - Test thoroughly
   - Deploy during off-hours
```

### Incident Communication Template

**Initial Alert**:
```
Subject: [P0] OpportunityTrigger Deployment Issue - Rolling Back

Impact: All opportunity updates blocked
Timeline: Detected at 15:05, rollback initiated at 15:07
Action: Rolling back to previous version
ETA: Normal operations by 15:15

Will provide update in 10 minutes.
```

**Resolution**:
```
Subject: [RESOLVED] OpportunityTrigger Issue

Impact: All opportunity updates blocked (10 minutes)
Resolution: Rollback completed at 15:15
Root Cause: Missing null check on Account relationship
Next Steps: Fix deployed Friday 2 AM with additional validation

Thank you for your patience.
```

---

## Quick Reference

### Deployment Strategy Decision Tree

```
Is this production?
├─ No (Sandbox) → Direct Deployment
└─ Yes → Is this high-traffic (>10K DML/day)?
   ├─ No → Staged Deployment
   └─ Yes → Is this critical business process?
      ├─ No → Canary Deployment
      └─ Yes → Blue-Green Deployment
```

### Performance Alert Thresholds

| Metric | Target | Warning | Critical | Action |
|--------|--------|---------|----------|--------|
| Execution Time | <500ms | 500-2000ms | >2000ms | Investigate bottleneck |
| SOQL Queries | <10 | 10-50 | >50 | Check for loops |
| Error Rate | 0% | <1% | >1% | Consider rollback |

### Emergency Rollback Command

```bash
# Fastest rollback (delete trigger)
sf project delete source --metadata Trigger:OpportunityTrigger

# Or deploy previous version
git checkout <previous-commit>
sf project deploy start --source-dir force-app/main/default/triggers
```

---

## Next Steps

After mastering deployment and monitoring, proceed to:

**Runbook 6: Troubleshooting and Optimization**
- Common trigger errors and fixes
- Debug log analysis techniques
- Performance optimization strategies
- Governor limit troubleshooting

**Key Takeaways from Runbook 5**:
1. Choose deployment strategy based on risk (direct, staged, blue-green, canary)
2. Always validate before production deployment
3. Deploy during low-traffic periods
4. Monitor actively for first 24-48 hours
5. Have rollback plan ready
6. Document incidents and learn from them
7. Performance targets: <500ms execution, <10 SOQL queries

---

**Version History**:
- 1.0.0 (2025-11-23): Initial release

**Related Documentation**:
- Runbook 4: Testing and Code Coverage
- Runbook 6: Troubleshooting and Optimization
- trigger-orchestrator agent documentation (deployment strategies)
