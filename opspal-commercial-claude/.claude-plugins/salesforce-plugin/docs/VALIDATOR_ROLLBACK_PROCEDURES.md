# Validator Rollback Procedures

**Version**: 1.0.0
**Last Updated**: 2025-11-13
**Purpose**: Emergency rollback procedures for production validator issues

## Overview

This document provides step-by-step rollback procedures for the Phase 1 Pre-Deployment Validation System. Use these procedures when validators exhibit critical bugs, high false positive rates, or performance issues.

## Severity Levels

### Severity 1: Critical Bug (Immediate Action Required)

**Indicators**:
- Validator crashes or hangs
- Incorrect validations causing deployment failures
- Data corruption or loss
- Security vulnerabilities exposed

**Response Time**: Immediate (within 15 minutes)

### Severity 2: High False Positive Rate (>10%)

**Indicators**:
- Valid operations blocked incorrectly
- User complaints about incorrect errors
- Bypass rate >50% (users disabling validation)

**Response Time**: Within 4 hours

### Severity 3: Performance Issues (>5 seconds)

**Indicators**:
- Validation taking >5 seconds
- Deployment delays reported by users
- Resource exhaustion (CPU, memory)

**Response Time**: Within 1 week

---

## Quick Rollback Commands

### Disable Single Validator

```bash
# Set environment variable to disable specific validator
export VALIDATOR_TELEMETRY_ENABLED=0  # Disables telemetry logging
export ERROR_PREVENTION_ENABLED=false # Disables error prevention hooks

# Or disable per-validator (add to .env)
METADATA_DEPENDENCY_VALIDATOR_ENABLED=false
FLOW_XML_VALIDATOR_ENABLED=false
CSV_PARSER_VALIDATOR_ENABLED=false
AUTOMATION_FEASIBILITY_VALIDATOR_ENABLED=false
```

### Disable All Validators

```bash
# Add to .bashrc or .zshrc
export VALIDATOR_TELEMETRY_ENABLED=0
export ERROR_PREVENTION_ENABLED=false

# Reload shell
source ~/.bashrc  # or source ~/.zshrc
```

### Emergency Hook Bypass

```bash
# Rename hook to disable temporarily
cd .claude-plugins/opspal-core-plugin/packages/domains/salesforce/hooks
mv pre-sf-command-validation.sh pre-sf-command-validation.sh.disabled

# To re-enable
mv pre-sf-command-validation.sh.disabled pre-sf-command-validation.sh
```

---

## Rollback Procedures by Validator

### 1. Metadata Dependency Analyzer

**Location**: `scripts/lib/metadata-dependency-analyzer.js`

#### Severity 1: Critical Bug

**Symptoms**:
- Crashes when analyzing dependencies
- Incorrectly reports dependencies that don't exist
- Allows deletions that should be blocked

**Rollback Steps**:

1. **Disable validator immediately**:
```bash
export METADATA_DEPENDENCY_VALIDATOR_ENABLED=false
```

2. **Notify all users** (Slack notification):
```bash
curl -X POST "$SLACK_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "🚨 ALERT: Metadata Dependency Analyzer disabled due to critical bug. Use manual dependency checks before field deletions. Estimated fix time: 24 hours."
  }'
```

3. **Provide manual workaround**:
```bash
# Manual dependency check before field deletion
sf data query --query "SELECT Id, EntityDefinition.QualifiedApiName, QualifiedApiName
  FROM FieldDefinition
  WHERE EntityDefinition.QualifiedApiName = 'Account'
  AND QualifiedApiName = 'Field_To_Delete__c'" --use-tooling-api

# Check validation rules referencing field
sf data query --query "SELECT ValidationName, EntityDefinition.QualifiedApiName
  FROM ValidationRule
  WHERE ValidationFormula LIKE '%Field_To_Delete__c%'" --use-tooling-api

# Check flows referencing field
sf data query --query "SELECT DeveloperName, ProcessType
  FROM FlowVersionView
  WHERE Status = 'Active'
  AND FlowDefinitionViewId IN (
    SELECT FlowDefinitionViewId FROM FlowVersionView
    WHERE FullName LIKE '%Field_To_Delete__c%'
  )" --use-tooling-api
```

4. **Investigate and fix** (developer action):
- Collect error logs from users
- Reproduce issue in sandbox
- Apply fix and test thoroughly
- Deploy fix and re-enable validator

5. **Re-enable with monitoring**:
```bash
export METADATA_DEPENDENCY_VALIDATOR_ENABLED=true
export VALIDATOR_TELEMETRY_ENABLED=1

# Monitor closely for 48 hours
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/analyze-validator-telemetry.js metadata-dependency-analyzer --since $(date -d '48 hours ago' +%Y-%m-%d)
```

#### Severity 2: High False Positives

**Symptoms**:
- Reports dependencies that don't actually exist
- Users bypassing validator frequently

**Rollback Steps**:

1. **Add bypass mechanism** (don't disable completely):
```bash
# Add to scripts/lib/metadata-dependency-analyzer.js
const BYPASS_FALSE_POSITIVE_CHECKS = process.env.BYPASS_FALSE_POSITIVE_CHECKS === 'true';

if (BYPASS_FALSE_POSITIVE_CHECKS) {
  console.log('⚠️  False positive bypass enabled - review dependencies manually');
  return { dependencies: [], warnings: ['Manual review required'] };
}
```

2. **Document bypass process**:
```markdown
## Temporary Bypass for False Positives

If you believe the dependency check is incorrect:

1. Export bypass flag: `export BYPASS_FALSE_POSITIVE_CHECKS=true`
2. Run operation normally
3. Submit feedback: `node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/submit-validator-feedback.js metadata-dependency-analyzer`
4. Select "False Positive" and provide details
```

3. **Adjust thresholds**:
```javascript
// Lower sensitivity to reduce false positives
const DEPENDENCY_THRESHOLD = 0.7; // Was 0.5 (lower = fewer false positives)
```

4. **Monitor impact**:
```bash
# Check if false positive rate decreased
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/analyze-validator-telemetry.js metadata-dependency-analyzer
# Target: <5% false positive rate
```

---

### 2. Flow XML Validator

**Location**: `scripts/lib/flow-xml-validator.js`

#### Severity 1: Critical Bug

**Symptoms**:
- Blocks valid Flows
- Suggests incorrect auto-fixes
- Corrupts Flow XML

**Rollback Steps**:

1. **Disable validator**:
```bash
export FLOW_XML_VALIDATOR_ENABLED=false
```

2. **Notify users**:
```bash
curl -X POST "$SLACK_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "🚨 ALERT: Flow XML Validator disabled. Use Salesforce UI validation before deploying Flows. Fix ETA: 24 hours."
  }'
```

3. **Manual validation workaround**:
```bash
# Use Salesforce CLI built-in validation
sf project deploy validate --source-dir force-app --test-level NoTestRun

# Or deploy without activation for manual testing
sf project deploy start --source-dir force-app
```

4. **Preserve auto-fix history**:
```bash
# Don't delete auto-fix logs - needed for debugging
ls -la logs/auto-fixes/
# Keep for root cause analysis
```

#### Severity 3: Performance Issues

**Symptoms**:
- Validation taking >5 seconds
- Deployment delays

**Rollback Steps**:

1. **Add timeout** (don't disable):
```javascript
// In flow-xml-validator.js
const VALIDATION_TIMEOUT = 5000; // 5 seconds max

const validation = await Promise.race([
  this.validate(flowXml),
  new Promise((_, reject) => setTimeout(() => reject(new Error('Validation timeout')), VALIDATION_TIMEOUT))
]);
```

2. **Reduce validation scope**:
```javascript
// Disable expensive checks temporarily
const SKIP_BEST_PRACTICE_CHECKS = process.env.SKIP_BEST_PRACTICE_CHECKS === 'true';

if (!SKIP_BEST_PRACTICE_CHECKS) {
  // Run best practice validation
}
```

3. **Add caching**:
```javascript
const validationCache = new Map();

if (validationCache.has(flowXmlHash)) {
  return validationCache.get(flowXmlHash);
}
```

---

### 3. CSV Parser Safe

**Location**: `scripts/lib/csv-parser-safe.js`

#### Severity 1: Critical Bug

**Symptoms**:
- Data corruption during parsing
- Incorrect line ending fixes
- Character encoding issues

**Rollback Steps**:

1. **Disable parser**:
```bash
export CSV_PARSER_VALIDATOR_ENABLED=false
```

2. **Provide safe alternative**:
```bash
# Use standard csv-parse library instead
npm install csv-parse

# Manual CSV parsing
const { parse } = require('csv-parse/sync');
const records = parse(csvData, { columns: true });
```

3. **Preserve malformed CSV samples**:
```bash
# Copy problematic CSVs for debugging
mkdir -p logs/csv-issues/$(date +%Y-%m-%d)
cp path/to/problematic.csv logs/csv-issues/$(date +%Y-%m-%d)/
```

#### Severity 2: False Positives

**Symptoms**:
- Valid CSVs flagged as invalid
- Unnecessary BOM removal

**Rollback Steps**:

1. **Add lenient mode**:
```javascript
const LENIENT_MODE = process.env.CSV_LENIENT_MODE === 'true';

if (LENIENT_MODE) {
  // Skip strict format checks
  return { valid: true, warnings: ['Lenient mode - review manually'] };
}
```

2. **Document workaround**:
```bash
# For CSVs incorrectly flagged as invalid
export CSV_LENIENT_MODE=true
sf data import bulk --file data.csv --sobject Account
```

---

### 4. Automation Feasibility Analyzer

**Location**: `scripts/lib/automation-feasibility-analyzer.js`

#### Severity 1: Critical Bug

**Symptoms**:
- Incorrect feasibility scores
- Missing automation types
- Wrong effort estimates

**Rollback Steps**:

1. **Disable analyzer**:
```bash
export AUTOMATION_FEASIBILITY_VALIDATOR_ENABLED=false
```

2. **Manual feasibility template**:
```markdown
## Manual Feasibility Assessment

**Request**: [Description]

**Automation Components**:
- [ ] Flow (Record-Triggered, Screen, Scheduled, Autolaunched)
- [ ] Apex (Trigger, Class, Batch, Scheduled)
- [ ] Process Builder
- [ ] Workflow Rule
- [ ] Validation Rule
- [ ] Formula Field

**Feasibility Score** (manual assessment):
- FULLY_AUTOMATED (≥71%): All components can be built via API
- HYBRID (31-70%): Mix of automated and manual configuration
- MOSTLY_MANUAL (≤30%): Requires significant manual setup

**Estimated Effort**:
- Automated: ___ hours
- Manual: ___ hours
- Total: ___ hours
```

#### Severity 2: Inaccurate Estimates

**Symptoms**:
- Effort estimates 50%+ off actual time
- User complaints about misleading scores

**Rollback Steps**:

1. **Add disclaimer**:
```javascript
console.log('⚠️  NOTICE: Effort estimates are preliminary. Actual time may vary ±50%. Use as rough guidance only.');
```

2. **Adjust complexity multipliers**:
```javascript
// If estimates too low, increase multipliers
if (complexityFactor >= 15) baseEffort = 100; // Was 70
else if (complexityFactor >= 10) baseEffort = 60; // Was 40
else if (complexityFactor >= 5) baseEffort = 15; // Was 10
```

3. **Collect calibration data**:
```bash
# After 30 days, analyze actual vs estimated
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/analyze-validator-telemetry.js automation-feasibility-analyzer
# Compare estimated effort vs actual implementation time
```

---

## Post-Rollback Procedures

### 1. Incident Documentation

**Template**: `logs/incidents/INCIDENT_[DATE]_[VALIDATOR].md`

```markdown
# Validator Incident Report

**Date**: 2025-11-13
**Validator**: metadata-dependency-analyzer
**Severity**: 1 (Critical)

## Incident Summary
[Description of what went wrong]

## Impact
- Users affected: 15
- Operations blocked: 8 field deletions
- Duration: 4 hours
- Estimated cost: $2,400 (16 hours × $150/hr)

## Root Cause
[Technical explanation of bug]

## Rollback Actions Taken
1. Disabled validator at 10:30 AM
2. Notified users via Slack at 10:35 AM
3. Provided manual workaround at 10:45 AM
4. Fixed bug by 2:00 PM
5. Re-enabled with monitoring at 2:30 PM

## Prevention Measures
- Add regression test for this scenario
- Increase test coverage from 100% to 110% (edge cases)
- Add sanity check before deployment

## Lessons Learned
[What we learned and how to prevent recurrence]
```

### 2. User Communication

**During Incident**:
```bash
# Initial alert (within 15 minutes)
curl -X POST "$SLACK_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "🚨 ALERT: [Validator] experiencing issues. Disabled temporarily. Manual workaround: [instructions]. ETA for fix: [time]."
  }'

# Status update (every hour)
curl -X POST "$SLACK_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "⏱️  UPDATE: [Validator] fix in progress. Current status: [details]. Revised ETA: [time]."
  }'

# Resolution notification
curl -X POST "$SLACK_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "✅ RESOLVED: [Validator] re-enabled. Issue fixed. Monitoring for 48 hours. Thank you for your patience."
  }'
```

### 3. Root Cause Analysis

**5 Whys Method**:

```
Problem: Metadata Dependency Analyzer blocked valid field deletion

Why 1: Validator reported dependencies that didn't exist
  → Why 2: Validation rule query included inactive rules
    → Why 3: Status filter was missing from query
      → Why 4: Test data only had active rules
        → Why 5: Test coverage didn't include inactive rules

Root Cause: Insufficient test coverage for edge cases
Prevention: Add tests for inactive validation rules
```

### 4. Regression Testing

**After Fix**:

```bash
# Run full test suite
npm test

# Run validator-specific tests
node test/metadata-dependency-analyzer.test.js

# Run integration tests with real org data
node test/integration/validator-integration.test.js

# Performance regression test
node test/performance/validator-performance.test.js
```

### 5. Monitoring Period

**48-Hour Close Monitoring**:

```bash
# Check telemetry every 4 hours
while true; do
  node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/analyze-validator-telemetry.js [validator-name] --since $(date -d '4 hours ago' +%Y-%m-%d)
  sleep 14400  # 4 hours
done

# Alert on anomalies
if [ $FALSE_POSITIVE_RATE -gt 5 ]; then
  echo "⚠️  False positive rate elevated: ${FALSE_POSITIVE_RATE}%"
fi
```

---

## Rollback Decision Tree

```
Validator Issue Detected
├─ Critical Bug (Severity 1)?
│  ├─ YES → Disable immediately + Notify users + Provide workaround
│  └─ NO → Continue
├─ High False Positives (Severity 2)?
│  ├─ YES → Add bypass mechanism + Adjust thresholds + Monitor
│  └─ NO → Continue
└─ Performance Issue (Severity 3)?
   ├─ YES → Add timeout + Reduce scope + Add caching
   └─ NO → Monitor and document
```

---

## Emergency Contacts

**On-Call Rotation**:
- Primary: RevPal Engineering Lead
- Secondary: Salesforce Plugin Maintainer
- Escalation: RevPal CTO

**Communication Channels**:
- Slack: #validator-alerts (automated)
- Email: engineering@revpal.io (manual escalation)
- Pagerduty: Severity 1 incidents only

---

## Appendix: Validator Health Checks

### Pre-Deployment Health Check

```bash
#!/bin/bash
# Run before enabling validators in new environment

# Check 1: All dependencies installed
npm list

# Check 2: Environment variables set
echo "Checking environment..."
[ -z "$VALIDATOR_TELEMETRY_ENABLED" ] && echo "⚠️  VALIDATOR_TELEMETRY_ENABLED not set"

# Check 3: Test suite passes
npm test

# Check 4: Telemetry logging works
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validator-telemetry.js report metadata-dependency-analyzer

# Check 5: Slack notifications work
curl -X POST "$SLACK_WEBHOOK_URL" -H "Content-Type: application/json" -d '{"text":"✅ Validator health check passed"}'
```

### Continuous Health Monitoring

```bash
#!/bin/bash
# Run every 6 hours via cron

# Check false positive rate
FP_RATE=$(node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/analyze-validator-telemetry.js metadata-dependency-analyzer | grep "False Positive Rate" | awk '{print $4}' | tr -d '%')

if [ $FP_RATE -gt 5 ]; then
  curl -X POST "$SLACK_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"⚠️  Metadata Dependency Analyzer false positive rate elevated: ${FP_RATE}% (target <5%)\"}"
fi

# Check average execution time
AVG_TIME=$(node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/analyze-validator-telemetry.js flow-xml-validator | grep "Average Execution Time" | awk '{print $4}' | tr -d 'ms')

if [ $AVG_TIME -gt 2000 ]; then
  curl -X POST "$SLACK_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"⚠️  Flow XML Validator slow: ${AVG_TIME}ms avg (target <2000ms)\"}"
fi
```

---

**Last Updated**: 2025-11-13
**Version**: 1.0.0
**Maintained By**: RevPal Engineering
