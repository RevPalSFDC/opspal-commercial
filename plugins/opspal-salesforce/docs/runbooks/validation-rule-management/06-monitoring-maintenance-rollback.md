# Runbook 6: Monitoring, Maintenance, and Governance

**Version**: 1.0.0
**Last Updated**: 2025-11-23
**Audience**: Salesforce Administrators, Developers

---

## Table of Contents

1. [Introduction](#introduction)
2. [Production Monitoring](#production-monitoring)
3. [Performance Monitoring](#performance-monitoring)
4. [Data Quality Metrics](#data-quality-metrics)
5. [Maintenance Schedule](#maintenance-schedule)
6. [Rule Lifecycle Management](#rule-lifecycle-management)
7. [Optimization Strategies](#optimization-strategies)
8. [Documentation Maintenance](#documentation-maintenance)
9. [Governance and Compliance](#governance-and-compliance)
10. [Long-Term Health Tracking](#long-term-health-tracking)
11. [Quick Reference](#quick-reference)

---

## Introduction

This runbook provides comprehensive guidance on monitoring validation rules in production, maintaining rule quality over time, and ensuring long-term governance and compliance.

### Why Monitoring Matters

**Real-World Scenario**:
```
Month 1: Deploy validation rule, working great
Month 6: Business process changes, rule becomes outdated
Month 12: Rule blocking legitimate business, users frustrated
Result: Emergency rule removal, lost data quality benefits
```

**Prevention Through Monitoring**:
- Detect issues early (before user frustration)
- Track data quality improvement
- Identify optimization opportunities
- Ensure rules remain aligned with business processes

---

## Production Monitoring

### Error Frequency Monitoring

#### Daily Monitoring (First 48 Hours After Deployment)

**Query Validation Error Count**:

```sql
-- Via Debug Logs (if enabled)
SELECT COUNT()
FROM ApexLog
WHERE Operation = 'validation_error'
  AND Request LIKE '%Require_Close_Date_When_Won%'
  AND CreatedDate = TODAY

-- Target: <10 errors/day
```

**Email Alerts** (if configured):

```
Setup → Process Automation → Workflow Rules → Create Alert

Criteria: Validation Rule Error Count > 20/day
Alert: Email to Salesforce Admin team
```

#### Weekly Monitoring (First Month)

**Track Error Trends**:

```sql
SELECT CALENDAR_WEEK(CreatedDate) Week,
       COUNT() ErrorCount
FROM ApexLog
WHERE Operation = 'validation_error'
  AND Request LIKE '%Require_Close_Date_When_Won%'
  AND CreatedDate = LAST_N_DAYS:30
GROUP BY CALENDAR_WEEK(CreatedDate)
ORDER BY Week

-- Expected trend: Declining over time as users adapt
```

**Analysis**:

| Week | Error Count | Trend | Status |
|------|-------------|-------|--------|
| Week 1 | 45 | N/A | ⚠️ High (expected) |
| Week 2 | 28 | ↓ -38% | ✅ Good (declining) |
| Week 3 | 18 | ↓ -36% | ✅ Good (declining) |
| Week 4 | 12 | ↓ -33% | ✅ Excellent (stabilizing) |

**Concerning Trends**:
- ❌ Error count INCREASING week-over-week
- ❌ Error count >50/day after Week 2
- ❌ No decline after 4 weeks

#### Monthly Monitoring (Ongoing)

**Quarterly Error Summary**:

```bash
# Generate monthly report
node scripts/lib/validation-rule-monitoring.js \
  --org production \
  --rule Require_Close_Date_When_Won \
  --period last_30_days

# Output:
# Rule: Require_Close_Date_When_Won
# Period: Nov 1 - Nov 30, 2025
# Total Errors: 124
# Avg Errors/Day: 4.1
# Peak Day: Nov 5 (18 errors)
# Trend: Stable
# Status: ✅ Healthy
```

---

### Help Desk Ticket Monitoring

#### Ticket Tracking

**Keywords to Monitor**:
- "Close Date required"
- "Cannot save Opportunity"
- "Validation error"
- Rule name: "Require_Close_Date_When_Won"

**Ticket Volume Targets**:

| Period | Target | Actual | Status |
|--------|--------|--------|--------|
| Week 1 | <20 | 15 | ✅ On target |
| Week 2 | <15 | 12 | ✅ On target |
| Week 3 | <10 | 8 | ✅ On target |
| Week 4+ | <5 | 3 | ✅ Excellent |

**Red Flags**:
- ❌ >30 tickets in first week (error message unclear)
- ❌ Tickets increasing week-over-week (underlying issue)
- ❌ Same user submitting multiple tickets (training needed)

#### Ticket Analysis

**Common Ticket Types**:

1. **"How do I fix this error?"**
   - Indicates: Error message not actionable
   - Action: Update error message with clearer instructions

2. **"Why is this required now?"**
   - Indicates: Communication gap
   - Action: Send clarification email with business justification

3. **"This is blocking my work"**
   - Indicates: Process misalignment
   - Action: Review business process, consider bypass for specific scenario

4. **"The rule is wrong"**
   - Indicates: Formula logic error
   - Action: Review formula, fix if needed

**Resolution Time Tracking**:

```
Target: 90% of tickets resolved within 24 hours

Actual:
- <1 hour: 25% (excellent)
- 1-4 hours: 35% (good)
- 4-24 hours: 30% (acceptable)
- >24 hours: 10% (needs improvement)
```

---

### User Feedback Collection

#### Surveys (First Month)

**Email Survey** (sent after 2 weeks):

```
Subject: Quick Feedback - New Close Date Validation

Hi [Sales Team],

We deployed a new validation rule 2 weeks ago that requires
Close Date when marking an Opportunity as Closed Won.

Quick survey (30 seconds):
1. Is the error message clear? (Yes/No/Somewhat)
2. Have you encountered any issues? (Describe)
3. Any suggestions for improvement?

Thanks!
Salesforce Admin Team
```

**Response Analysis**:

| Question | Yes | No | Somewhat | Action |
|----------|-----|----|----|--------|
| Error message clear? | 80% | 5% | 15% | Acceptable (>70% yes) |
| Encountered issues? | 10% | 90% | N/A | Good (<20% issues) |

#### Ongoing Feedback

**Quarterly Check-In**:

```
Subject: Validation Rule Health Check - Q4 2025

Team,

As part of our quarterly review, we're evaluating all validation
rules deployed this year.

For "Require Close Date When Closed Won":
- Is this rule still relevant? (Yes/No)
- Should we adjust the logic? (Describe)
- Should we remove the rule? (Why?)

Reply by [date]
```

---

## Performance Monitoring

### Save Time Monitoring

#### Baseline Measurement

**Before Validation Rule**:

```bash
# Average save time for Opportunity
node scripts/lib/performance-monitor.js \
  --object Opportunity \
  --operation save \
  --sample-size 1000

# Result: Avg save time = 850ms
```

**After Validation Rule**:

```bash
# Average save time with validation rule active
node scripts/lib/performance-monitor.js \
  --object Opportunity \
  --operation save \
  --sample-size 1000 \
  --include-validation-rules

# Result: Avg save time = 950ms (+12%)
```

**Performance Impact Analysis**:

| Metric | Before | After | Change | Status |
|--------|--------|-------|--------|--------|
| Avg Save Time | 850ms | 950ms | +100ms (+12%) | ✅ Acceptable (<20%) |
| P95 Save Time | 1,200ms | 1,400ms | +200ms (+17%) | ✅ Acceptable (<20%) |
| P99 Save Time | 1,800ms | 2,100ms | +300ms (+17%) | ✅ Acceptable (<20%) |

**Thresholds**:
- ✅ <20% increase: Acceptable
- ⚠️ 20-50% increase: Review formula complexity
- ❌ >50% increase: Immediate optimization needed

---

### CPU Time Monitoring

**Governor Limit Tracking**:

```sql
-- Query high CPU time transactions
SELECT Id, CreatedDate, DurationMilliseconds, CpuTime
FROM ApexLog
WHERE Operation = 'DML'
  AND CpuTime > 2000  -- High CPU usage
  AND Request LIKE '%Opportunity%'
  AND CreatedDate = LAST_N_DAYS:7
ORDER BY CpuTime DESC
LIMIT 100
```

**CPU Usage Breakdown**:

| Component | CPU Time (ms) | % of Total | Status |
|-----------|---------------|------------|--------|
| Triggers | 450ms | 30% | Normal |
| Validation Rules | 180ms | 12% | ✅ Acceptable (<15%) |
| Workflows | 320ms | 21% | Normal |
| Apex Classes | 550ms | 37% | Normal |
| **Total** | **1,500ms** | **100%** | ✅ Below limit (10,000ms) |

**Red Flags**:
- ❌ Validation rules consuming >20% of CPU time
- ❌ Single validation rule >500ms CPU time
- ❌ Total transaction approaching governor limit (10,000ms)

---

### Bulk Operation Performance

**Data Loader Performance**:

```bash
# Baseline (no validation rules)
Time to update 10,000 Opportunity records: 45 seconds

# With validation rules
Time to update 10,000 Opportunity records: 52 seconds (+16%)

# Analysis
Overhead: 7 seconds for 10,000 records = 0.7ms per record
Status: ✅ Acceptable (<1ms per record)
```

**Bulk API Monitoring**:

```bash
# Query bulk job performance
sf data query \
  --query "SELECT Id, State, NumberRecordsProcessed, TotalProcessingTime FROM AsyncApexJob WHERE JobType = 'BatchApexWorker' AND CreatedDate = LAST_N_DAYS:7" \
  --use-tooling-api

# Compare processing times before/after validation rules
```

---

## Data Quality Metrics

### Violation Rate Tracking

**Measure Data Quality Improvement**:

```sql
-- Initial state (before validation rule deployed)
SELECT COUNT()
FROM Opportunity
WHERE ISPICKVAL(StageName, 'Closed Won')
  AND ISNULL(CloseDate)

-- Result: 45 records (out of 10,000 = 0.45%)

-- 30 days after deployment
SELECT COUNT()
FROM Opportunity
WHERE ISPICKVAL(StageName, 'Closed Won')
  AND ISNULL(CloseDate)

-- Result: 2 records (out of 10,200 = 0.02%)

-- Improvement: 0.45% → 0.02% = 96% reduction in violations
```

**Data Quality Trend**:

| Period | Violation Count | Violation Rate | Trend | Status |
|--------|----------------|----------------|-------|--------|
| Pre-deployment | 45 | 0.45% | N/A | Baseline |
| Week 1 | 38 | 0.37% | ↓ -16% | ✅ Improving |
| Week 2 | 25 | 0.24% | ↓ -35% | ✅ Improving |
| Week 4 | 12 | 0.12% | ↓ -50% | ✅ Excellent |
| Month 3 | 2 | 0.02% | ↓ -83% | ✅ Target achieved |

**Target**: <0.1% violation rate within 3 months

---

### Cleanup Progress Tracking

**Track Data Cleanup Efforts**:

```bash
# Weekly cleanup report
node scripts/lib/validation-rule-cleanup-tracker.js \
  --org production \
  --rule Require_Close_Date_When_Won \
  --period weekly

# Output:
# Week 1: 45 → 38 records fixed (7 records, 16%)
# Week 2: 38 → 25 records fixed (13 records, 34%)
# Week 3: 25 → 18 records fixed (7 records, 28%)
# Week 4: 18 → 12 records fixed (6 records, 33%)
# Avg cleanup rate: 8 records/week
```

**Cleanup Velocity**:

```
If current rate continues:
- Records remaining: 12
- Avg cleanup rate: 8 records/week
- Estimated completion: 1.5 weeks
- Target date: Dec 10, 2025
```

---

## Maintenance Schedule

### Daily Maintenance (First Week Only)

**Tasks**:
- [ ] Check error frequency (target: <10/day)
- [ ] Review help desk tickets (target: <5/day)
- [ ] Monitor user feedback emails

**Time Required**: 15 minutes/day

---

### Weekly Maintenance (First Month)

**Tasks**:
- [ ] Generate error frequency report
- [ ] Analyze ticket trends
- [ ] Review data quality metrics
- [ ] Check performance impact
- [ ] Communicate updates to stakeholders

**Report Template**:

```markdown
# Validation Rule Weekly Report - Week 2

## Rule: Require_Close_Date_When_Won
## Period: Nov 8-14, 2025

### Metrics
- Error Frequency: 28 errors (↓38% from Week 1)
- Help Desk Tickets: 12 tickets (↓20% from Week 1)
- Data Quality: 0.24% violation rate (↓35% improvement)
- Performance: 950ms avg save time (+12% acceptable)

### Status: ✅ ON TRACK

### Actions This Week:
- None required

### Actions Next Week:
- Continue monitoring
- Send user feedback survey
```

**Time Required**: 30 minutes/week

---

### Monthly Maintenance (Ongoing)

**Tasks**:
- [ ] Comprehensive performance review
- [ ] Data quality trend analysis
- [ ] User feedback analysis
- [ ] Rule optimization check
- [ ] Documentation review
- [ ] Stakeholder report

**Monthly Report Template**:

```markdown
# Validation Rule Monthly Report - November 2025

## Rule: Require_Close_Date_When_Won

### Executive Summary
Validation rule performing well with declining error rates and
high data quality improvement. No concerns.

### Key Metrics
- Avg Error Frequency: 4.1/day (target: <10)
- Help Desk Tickets: 32 total (target: <50)
- Data Quality Improvement: 96% reduction in violations
- Performance Impact: +12% (acceptable)

### User Feedback
- 80% report error message is clear
- 10% encountered issues (all resolved)
- No requests for removal

### Recommendations
- Continue current monitoring
- No optimization needed
- Consider similar rules for other fields

### Status: ✅ HEALTHY
```

**Time Required**: 1 hour/month

---

### Quarterly Maintenance (Ongoing)

**Tasks**:
- [ ] Comprehensive rule audit
- [ ] Business process alignment check
- [ ] Consolidation opportunities
- [ ] Documentation update
- [ ] Security review
- [ ] Training needs assessment

**Quarterly Audit Checklist**:

```markdown
## Validation Rule Quarterly Audit - Q4 2025

### Business Alignment
- [ ] Rule still reflects current business process?
- [ ] Any business process changes require rule update?
- [ ] Rule ownership still clear?

### Technical Health
- [ ] Formula still correct?
- [ ] Error message still appropriate?
- [ ] Performance still acceptable?
- [ ] No anti-patterns introduced by org changes?

### User Experience
- [ ] Error frequency acceptable?
- [ ] Help desk ticket volume acceptable?
- [ ] User satisfaction acceptable?

### Documentation
- [ ] Rule description current?
- [ ] Runbook documentation current?
- [ ] KB articles current?

### Recommendations
- Update error message to include link to KB article
- Consider consolidating with related rule [Rule Name]
```

**Time Required**: 2 hours/quarter

---

### Annual Maintenance

**Tasks**:
- [ ] Complete validation rule inventory
- [ ] Identify inactive/unused rules
- [ ] Comprehensive consolidation review
- [ ] Security and compliance audit
- [ ] Training material refresh
- [ ] Multi-year trend analysis

**Annual Report Template**:

```markdown
# Validation Rules Annual Report - 2025

## Executive Summary
Deployed 15 new validation rules across 8 objects.
Data quality improved 40% org-wide.
Performance impact minimal (<5% average).

## By Object
- Opportunity: 8 rules (95% healthy)
- Account: 3 rules (100% healthy)
- Quote: 4 rules (75% healthy - 1 needs review)

## Data Quality Impact
- Opportunity completeness: 85% → 94%
- Account completeness: 78% → 89%
- Quote accuracy: 82% → 91%

## Consolidation Opportunities
- Opportunity: 8 rules → can consolidate to 5 rules (37% reduction)
- Account: 3 rules → optimal (no consolidation)

## Recommendations
- Consolidate Opportunity rules in Q1 2026
- Deploy 5 additional rules in Q1 2026
- Refresh training materials
```

**Time Required**: 4 hours/year

---

## Rule Lifecycle Management

### Rule States

```
1. ACTIVE (In Production, Enforcing)
   - Regular monitoring
   - Ongoing maintenance

2. INACTIVE (Deployed but Not Enforcing)
   - Temporary disable (troubleshooting)
   - Staged deployment (pre-activation)

3. DEPRECATED (Marked for Removal)
   - Business process changed
   - Replaced by better rule
   - Grace period before removal

4. ARCHIVED (Removed from Org)
   - Stored in Git
   - Documentation preserved
   - Can be restored if needed
```

### Deprecation Process

**When to Deprecate**:
- Business process changed (rule no longer relevant)
- Replaced by automation (Flow, Trigger)
- Consolidation (merged into another rule)
- Performance issues (cannot be optimized)

**Deprecation Steps**:

```bash
# Step 1: Mark as deprecated (Week 0)
Update rule description:
"[DEPRECATED 2025-11-23] This rule will be removed on 2025-12-23.
Reason: Replaced by Flow 'Validate_Opportunity_Closure'.
Questions: Contact jane.smith@company.com"

# Step 2: Notify users (Week 0)
Email Subject: "Validation Rule Deprecation Notice"
Body: "Rule will be removed in 30 days. No action required.
Functionality moved to automated flow."

# Step 3: Deactivate rule (Week 2)
# Test deactivation in sandbox first
<active>false</active>

# Step 4: Monitor (Week 2-4)
# Verify no user complaints
# Verify new automation working

# Step 5: Remove rule (Week 4)
sf project delete source \
  --metadata ValidationRule:Opportunity.Old_Rule \
  --target-org production

# Step 6: Archive metadata (Week 4)
# Store rule XML in Git under /archive
git add archive/validation-rules/Opportunity.Old_Rule.xml
git commit -m "Archive deprecated rule: Old_Rule"
```

---

### Archival Process

**Archive Structure**:

```
archive/
├── validation-rules/
│   ├── Opportunity/
│   │   ├── Old_Rule.xml
│   │   ├── Old_Rule_README.md
│   │   └── Old_Rule_metrics.json
│   └── Account/
├── metadata/
└── documentation/
```

**Archive Documentation**:

```markdown
# Archived Rule: Old_Rule

## Metadata
- Object: Opportunity
- Deployed: 2024-01-15
- Deprecated: 2025-11-23
- Removed: 2025-12-23

## Reason for Removal
Replaced by Flow 'Validate_Opportunity_Closure' which provides
more flexible validation logic and better user experience.

## Historical Metrics
- Total errors handled: 1,247
- Avg errors/day: 3.8
- Help desk tickets: 45
- Data quality improvement: 95%

## Formula (for reference)
AND(
  ISPICKVAL(StageName, "Closed Won"),
  ISNULL(CloseDate)
)

## Lessons Learned
- Error message was not actionable enough (improved in Flow)
- Should have included KB link in error message
- Performance impact was higher than expected (Flow is faster)
```

---

## Optimization Strategies

### Rule Consolidation

**When to Consolidate**:
- Multiple rules checking similar conditions
- Rules on same object with overlapping triggers
- Opportunity to reduce total rule count

**Example Consolidation**:

**Before** (3 separate rules):

```
Rule 1: Require Close Date when Closed Won
Formula: AND(ISPICKVAL(StageName, "Closed Won"), ISNULL(CloseDate))

Rule 2: Require Amount when Closed Won
Formula: AND(ISPICKVAL(StageName, "Closed Won"), ISNULL(Amount))

Rule 3: Require Decision Maker when Closed Won
Formula: AND(ISPICKVAL(StageName, "Closed Won"), ISBLANK(Decision_Maker__c))
```

**After** (1 consolidated rule):

```
Rule: Require_Fields_When_Closed_Won

Formula:
AND(
  ISPICKVAL(StageName, "Closed Won"),
  OR(
    ISNULL(CloseDate),
    ISNULL(Amount),
    ISBLANK(Decision_Maker__c)
  )
)

Error Message:
"When marking Opportunity as Closed Won, the following fields are required:
- Close Date
- Amount
- Decision Maker

Please complete all required fields before saving."
```

**Benefits**:
- ✅ 3 rules → 1 rule (67% reduction)
- ✅ Single error message (better UX)
- ✅ Easier maintenance
- ✅ Better performance (1 evaluation vs 3)

**Tradeoffs**:
- ❌ Less specific error message
- ❌ Harder to deactivate individual checks

---

### Performance Optimization

**Formula Optimization Techniques**:

**1. Short-Circuit Evaluation**

```
// ❌ SLOW: Complex check first
AND(
  Account.Annual_Revenue__c > 1000000,
  ISPICKVAL(Type, "Customer")
)

// ✅ FAST: Simple check first
AND(
  ISPICKVAL(Type, "Customer"),
  Account.Annual_Revenue__c > 1000000
)
```

**2. Reduce Cross-Object References**

```
// ❌ SLOW: 3-level relationship
Account.Parent.Parent.Industry = "Technology"

// ✅ FAST: Denormalized field
Account.Ultimate_Parent_Industry__c = "Technology"
```

**3. Minimize Formula Length**

```
// ❌ COMPLEX: 250 characters
AND(OR(ISPICKVAL(Type,"Customer"),ISPICKVAL(Type,"Partner")),OR(ISPICKVAL(Status,"Active"),ISPICKVAL(Status,"Pending")),NOT(ISBLANK(Contract_Date__c)),NOT(ISNULL(Amount)),Amount>10000)

// ✅ SIMPLE: Segment into 2 rules
Rule 1: Type/Status check (80 chars)
Rule 2: Contract/Amount check (70 chars)
```

---

## Documentation Maintenance

### Description Updates

**Quarterly Description Review**:

```markdown
## Current Description (Needs Update)
"Require Close Date when Closed Won"

## Updated Description (Comprehensive)
"Business Requirement: Close Date required for all Closed Won opportunities
per Sales Policy v2.3 (approved 2025-01-15).

Requested By: Jane Smith, VP Sales (Ticket #12345)
Date Created: 2025-11-01
Last Modified: 2025-11-23 - Updated error message to include KB link
Policy Reference: Sales Policy v2.3, Section 4.2
Threshold Values: N/A
Exceptions: None
Related Rules: Require_Amount_When_Closed_Won, Require_Decision_Maker_When_Closed_Won

Impact: 96% reduction in Close Date violations
Performance: +12% save time (acceptable)
Status: ✅ Active, Healthy"
```

### Error Message Maintenance

**Review Error Messages Annually**:

```
// ❌ OLD ERROR MESSAGE (Not Actionable)
"Close Date is required when Stage is Closed Won."

// ✅ UPDATED ERROR MESSAGE (Actionable + KB Link)
"Close Date is required when Stage is Closed Won.

To fix:
1. Enter the date the deal closed in the Close Date field
2. Save the record again

Need help? See KB Article: kb.company.com/close-date-validation
Questions? Contact Sales Operations"
```

---

## Governance and Compliance

### Change Tracking

**Audit Trail**:

```sql
-- Query validation rule changes
SELECT EntityDefinition.QualifiedApiName,
       ValidationName,
       CreatedBy.Name,
       CreatedDate,
       LastModifiedBy.Name,
       LastModifiedDate
FROM ValidationRule
WHERE EntityDefinition.QualifiedApiName = 'Opportunity'
ORDER BY LastModifiedDate DESC

-- Track who changed what when
```

**Change Log Template**:

```markdown
# Validation Rule Change Log

## 2025-11-23 - Error Message Update
- Changed By: John Smith
- Reason: Add KB article link for user self-service
- Approval: Jane Smith (VP Sales)
- Testing: Tested in sandbox (2025-11-22)
- Impact: None (error message only)

## 2025-10-15 - Formula Optimization
- Changed By: John Smith
- Reason: Reduce complexity score from 65 to 45
- Approval: Jane Smith (VP Sales)
- Testing: Full regression testing in sandbox
- Impact: 15% performance improvement

## 2025-11-01 - Initial Deployment
- Created By: John Smith
- Reason: Improve data quality per Sales Policy v2.3
- Approval: Jane Smith (VP Sales), CFO
- Testing: 4-week sandbox testing
- Impact: 96% reduction in Close Date violations
```

---

### Security Reviews

**Annual Security Audit**:

```markdown
## Validation Rule Security Review - 2025

### Rule: Require_Close_Date_When_Won

#### Profile Bypass Review
- ✅ System Administrator: Bypass configured (justified for bulk ops)
- ✅ Data Integration: Bypass configured (justified for ETL)
- ❌ Other profiles: No bypasses (correct)

#### Sensitive Data
- ✅ No sensitive data exposed in error message
- ✅ No PII/PHI in formula
- ✅ No credentials/secrets in description

#### Compliance
- ✅ Aligned with data retention policy
- ✅ Documented in compliance wiki
- ✅ Audit trail complete

#### Recommendations
- None

### Status: ✅ COMPLIANT
```

---

## Long-Term Health Tracking

### Health Score Calculation

**Rule Health Score (0-100)**:

```javascript
const healthScore = {
  errorFrequency: {
    score: errorRate < 10 ? 100 : errorRate < 20 ? 75 : 50,
    weight: 0.3
  },
  dataQuality: {
    score: violationRate < 0.1 ? 100 : violationRate < 1 ? 75 : 50,
    weight: 0.3
  },
  performance: {
    score: perfImpact < 20 ? 100 : perfImpact < 50 ? 75 : 50,
    weight: 0.2
  },
  userSatisfaction: {
    score: ticketRate < 5 ? 100 : ticketRate < 15 ? 75 : 50,
    weight: 0.2
  }
};

const totalScore =
  healthScore.errorFrequency.score * healthScore.errorFrequency.weight +
  healthScore.dataQuality.score * healthScore.dataQuality.weight +
  healthScore.performance.score * healthScore.performance.weight +
  healthScore.userSatisfaction.score * healthScore.userSatisfaction.weight;

// Example: 100*0.3 + 100*0.3 + 100*0.2 + 100*0.2 = 100 (Perfect)
```

**Health Score Categories**:

| Score | Category | Action |
|-------|----------|--------|
| 90-100 | ✅ Excellent | Continue monitoring |
| 75-89 | ✅ Good | Monitor closely |
| 60-74 | ⚠️ Fair | Review and optimize |
| 40-59 | ⚠️ Poor | Immediate attention needed |
| 0-39 | ❌ Critical | Consider removal or major rework |

---

### Multi-Year Trend Analysis

**Track Rule Performance Over Time**:

```bash
# Generate 2-year trend report
node scripts/lib/validation-rule-trend-analyzer.js \
  --org production \
  --rule Require_Close_Date_When_Won \
  --period 2023-2025

# Output:
# Year 1 (2024):
#   - Avg Error Rate: 12/day
#   - Data Quality: 0.45% → 0.05% (89% improvement)
#   - Health Score: 85
#
# Year 2 (2025):
#   - Avg Error Rate: 4/day (↓67%)
#   - Data Quality: 0.05% → 0.02% (60% improvement)
#   - Health Score: 95
#
# Trend: ✅ Improving (strong performance)
```

---

## Quick Reference

### Monitoring Checklist

**Daily (First Week)**:
- [ ] Error frequency <10/day
- [ ] Help desk tickets <5/day

**Weekly (First Month)**:
- [ ] Generate error report
- [ ] Analyze ticket trends
- [ ] Check data quality metrics

**Monthly (Ongoing)**:
- [ ] Comprehensive performance review
- [ ] User feedback analysis
- [ ] Stakeholder report

**Quarterly (Ongoing)**:
- [ ] Comprehensive rule audit
- [ ] Business alignment check
- [ ] Documentation update

**Annual**:
- [ ] Complete rule inventory
- [ ] Consolidation review
- [ ] Security audit

### Health Score Quick Reference

```
Error Frequency Targets:
✅ <10/day: Excellent
⚠️ 10-20/day: Acceptable
❌ >20/day: Needs attention

Data Quality Targets:
✅ <0.1% violations: Excellent
⚠️ 0.1-1% violations: Acceptable
❌ >1% violations: Needs cleanup

Performance Impact Targets:
✅ <20% increase: Acceptable
⚠️ 20-50% increase: Review
❌ >50% increase: Optimize

Help Desk Ticket Targets:
✅ <5/month: Excellent
⚠️ 5-15/month: Acceptable
❌ >15/month: Needs improvement
```

### Maintenance Commands

```bash
# Error frequency report
node scripts/lib/validation-rule-monitoring.js \
  --org production --rule [RuleName] --period last_30_days

# Data quality metrics
node scripts/lib/validation-rule-cleanup-tracker.js \
  --org production --rule [RuleName] --period weekly

# Performance analysis
node scripts/lib/performance-monitor.js \
  --object [Object] --operation save --sample-size 1000

# Health score calculation
node scripts/lib/validation-rule-health-scorer.js \
  --org production --rule [RuleName]

# Trend analysis
node scripts/lib/validation-rule-trend-analyzer.js \
  --org production --rule [RuleName] --period 2023-2025
```

---

## Next Steps

**Continue to Runbook 7**: [Troubleshooting](./07-troubleshooting.md)

Learn how to diagnose and fix common validation rule issues, handle edge cases, and resolve user-reported problems.

---

**Related Runbooks**:
- [Runbook 5: Testing and Deployment](./05-testing-and-deployment.md)
- [Runbook 8: Segmented Rule Building](./08-segmented-rule-building.md)

---

**Version History**:
- v1.0.0 (2025-11-23) - Initial release
