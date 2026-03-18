# Week 1 Internal Testing - Quick Start Guide

**Version**: 1.0.0
**Last Updated**: 2025-11-13
**Duration**: 7 days
**Goal**: Validate validator effectiveness in internal sandbox before beta rollout

## Overview

Week 1 Internal Testing validates all 4 pre-deployment validators in controlled sandbox environments. This phase confirms validators work correctly, measure initial performance, and identify critical issues before beta user exposure.

**Success Criteria**:
- ✅ Zero false negatives (all errors caught)
- ✅ <3% false positives
- ✅ All validators execute in <2 seconds
- ✅ 20+ real test scenarios completed

---

## Prerequisites

### 1. Environment Setup

```bash
# Clone repository (if not already done)
git clone https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace
cd opspal-plugin-internal-plugins/.claude-plugins/opspal-salesforce

# Install dependencies
npm install

# Verify installation
npm test  # Should show 122/122 tests passing
```

### 2. Sandbox Access

**Required**:
- Sandbox org with admin access
- Salesforce CLI installed (`sf --version`)
- Org authenticated (`sf org login web --alias internal-sandbox`)

**Recommended Sandbox**:
- Developer Sandbox (sufficient for testing)
- Sample data (Accounts, Opportunities, Contacts)
- Existing metadata (Flows, Validation Rules, Layouts)

### 3. Enable Telemetry

```bash
# Add to ~/.bashrc or ~/.zshrc
export VALIDATOR_TELEMETRY_ENABLED=1
export SF_ORG_ALIAS=internal-sandbox
export USER_EMAIL=your-email@company.com

# Reload shell
source ~/.bashrc  # or source ~/.zshrc

# Verify
echo $VALIDATOR_TELEMETRY_ENABLED  # Should print: 1
```

### 4. Create Log Directory

```bash
mkdir -p logs/telemetry
mkdir -p logs/incidents
mkdir -p logs/week-1-testing
```

---

## Day 1-2: Setup & Initial Testing

### Day 1: Environment Validation

**Morning (2 hours)**:

1. **Verify test suite passes**:
```bash
npm test

# Expected output:
# ✅ Metadata Dependency Analyzer: 28/28 tests (100%)
# ✅ Flow XML Validator: 30/30 tests (100%)
# ✅ CSV Parser Safe: 26/26 tests (100%)
# ✅ Automation Feasibility Analyzer: 38/38 tests (100%)
# 📈 Overall: 122/122 tests passing (100% coverage)
```

2. **Verify Salesforce CLI connectivity**:
```bash
sf org display --target-org internal-sandbox

# Expected: Organization details displayed
```

3. **Test telemetry system**:
```bash
node scripts/lib/validator-telemetry.js report metadata-dependency-analyzer

# Expected: Empty report (no validations yet)
```

**Afternoon (2 hours)**:

4. **Run first test scenario** (Metadata Dependency Analyzer):
```bash
# Create test field
sf data create record --sobject CustomField__mdt \
  --values "DeveloperName=Test_Field__c,Object=Account"

# Create validation rule referencing field
sf data create record --sobject ValidationRule \
  --values "EntityName=Account,ValidationFormula=ISBLANK(Test_Field__c),ErrorMessage=Required"

# Attempt deletion (should be blocked)
node scripts/lib/metadata-dependency-analyzer.js internal-sandbox Account Test_Field__c

# Expected output:
# ❌ Field deletion blocked: Test_Field__c has dependencies
# Dependencies found:
# - ValidationRule: 1 rule(s)
```

5. **Verify telemetry logged**:
```bash
cat logs/telemetry/metadata-dependency-analyzer.jsonl

# Expected: One JSON line with timestamp, outcome='blocked', etc.
```

6. **Submit feedback**:
```bash
node scripts/submit-validator-feedback.js metadata-dependency-analyzer

# Answer prompts:
# 1. Was validation accurate? → Yes
# 2. Did it save time? → Yes → 30 minutes
# 3. Satisfaction: → 5 (Very satisfied)
```

### Day 2: Test All Validators

**Morning (3 hours)**:

7. **Flow XML Validator Test**:
```bash
# Create Flow with syntax error
cat > test-flow-invalid.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <status>Draft</status>
    <processType>Flow</processType>
    <!-- Missing required fields -->
</Flow>
EOF

# Validate (should fail)
node scripts/lib/flow-xml-validator.js test-flow-invalid.xml

# Expected: Syntax errors detected
```

8. **CSV Parser Safe Test**:
```bash
# Create CSV with issues
cat > test-import.csv << 'EOF'
Name,Email
"John Doe","john@example.com"
"Jane Smith""jane@example.com"
EOF

# Parse (should detect quote error)
node scripts/lib/csv-parser-safe.js test-import.csv

# Expected: Quote escaping error detected
```

9. **Automation Feasibility Analyzer Test**:
```bash
# Analyze complex request
node scripts/lib/automation-feasibility-analyzer.js \
  "Create a Flow with 10 decision branches and 5 loops for lead assignment"

# Expected: HYBRID feasibility, 70+ hours estimated
```

**Afternoon (2 hours)**:

10. **Verify all telemetry logged**:
```bash
ls -lh logs/telemetry/

# Expected: 4 JSONL files (one per validator)
```

11. **Generate first report**:
```bash
node scripts/analyze-validator-telemetry.js

# Expected: Summary with execution statistics
```

---

## Day 3-5: Real Scenario Testing

### Test Scenario Checklist

Run **at least 20 real scenarios** across all validators:

#### Metadata Dependency Analyzer (5 scenarios)

- [ ] **Scenario 1**: Field with validation rule dependency
  - Create Account custom field
  - Create validation rule referencing field
  - Attempt deletion → Should block
  - Submit feedback: Accurate? Time saved?

- [ ] **Scenario 2**: Field with Flow dependency
  - Create Opportunity custom field
  - Create Record-Triggered Flow using field
  - Activate Flow
  - Attempt field deletion → Should block
  - Submit feedback

- [ ] **Scenario 3**: Field with layout dependency (warning only)
  - Create Contact custom field
  - Add to layout
  - Attempt deletion → Should warn (not block)
  - Submit feedback

- [ ] **Scenario 4**: Field with no dependencies
  - Create unused custom field
  - Attempt deletion → Should pass
  - Submit feedback

- [ ] **Scenario 5**: Field with multiple dependencies
  - Create field referenced by 2 validation rules + 1 Flow
  - Attempt deletion → Should block with all dependencies listed
  - Submit feedback

#### Flow XML Validator (5 scenarios)

- [ ] **Scenario 6**: Flow with syntax errors
  - Create Flow XML with malformed tags
  - Validate → Should block
  - Submit feedback

- [ ] **Scenario 7**: Flow with best practice violations
  - Create Flow with DML in loop
  - Validate with --best-practices → Should warn
  - Submit feedback

- [ ] **Scenario 8**: Valid Flow
  - Create properly formatted Flow
  - Validate → Should pass
  - Submit feedback

- [ ] **Scenario 9**: Flow with auto-fixable errors
  - Create Flow with fixable issues
  - Validate with --auto-fix → Should fix and pass
  - Submit feedback

- [ ] **Scenario 10**: Complex Flow (performance test)
  - Create Flow with 50+ elements
  - Validate → Should complete in <2 seconds
  - Submit feedback

#### CSV Parser Safe (5 scenarios)

- [ ] **Scenario 11**: CSV with BOM
  - Create CSV with UTF-8 BOM
  - Parse → Should detect and remove BOM
  - Submit feedback

- [ ] **Scenario 12**: CSV with Windows line endings
  - Create CSV with \r\n line endings
  - Parse → Should normalize to \n
  - Submit feedback

- [ ] **Scenario 13**: CSV with schema validation
  - Create CSV missing required columns
  - Parse with schema → Should block
  - Submit feedback

- [ ] **Scenario 14**: Valid CSV
  - Create properly formatted CSV
  - Parse → Should pass
  - Submit feedback

- [ ] **Scenario 15**: Large CSV (performance test)
  - Create CSV with 10,000 rows
  - Parse → Should complete in <2 seconds
  - Submit feedback

#### Automation Feasibility Analyzer (5 scenarios)

- [ ] **Scenario 16**: Simple Flow request
  - Request: "Create a Flow to update Account status"
  - Analyze → FULLY_AUTOMATED (≥71%)
  - Submit feedback

- [ ] **Scenario 17**: Complex approval request
  - Request: "Create a 3-step approval process with dynamic approvers"
  - Analyze → HYBRID (31-70%)
  - Submit feedback

- [ ] **Scenario 18**: Multiple automation types
  - Request: "Create a Flow and a Quick Action and a validation rule"
  - Analyze → Should detect all 3 types
  - Submit feedback

- [ ] **Scenario 19**: Unrealistic expectation
  - Request: "Fully automate complex CPQ pricing with 50 rules"
  - Analyze → MOSTLY_MANUAL (≤30%), should flag expectation mismatch
  - Submit feedback

- [ ] **Scenario 20**: Performance test
  - Request with very long description (1000+ words)
  - Analyze → Should complete in <1 second
  - Submit feedback

### Daily Progress Tracking

**End of Day 3**:
```bash
# Check progress
node scripts/analyze-validator-telemetry.js

# Expected: 6-8 validations logged
# Target: False positive rate <3%
```

**End of Day 4**:
```bash
# Check progress
node scripts/analyze-validator-telemetry.js

# Expected: 12-16 validations logged
# Target: All validators averaging <2s execution time
```

**End of Day 5**:
```bash
# Final check
node scripts/analyze-validator-telemetry.js

# Expected: 20+ validations logged
# Target: Zero false negatives, <3% false positives
```

---

## Day 6-7: Analysis & Go/No-Go Decision

### Day 6: Data Analysis

**Morning (3 hours)**:

1. **Generate comprehensive report**:
```bash
node scripts/analyze-validator-telemetry.js > logs/week-1-testing/final-report.txt

cat logs/week-1-testing/final-report.txt
```

2. **Calculate actual ROI**:
```bash
# Extract metrics
ERRORS_PREVENTED=$(grep "Total Blocked" logs/week-1-testing/final-report.txt | awk '{print $3}')
TIME_SAVED=$(grep "Total Time Saved" logs/week-1-testing/final-report.txt | awk '{print $4}')

# Annualize (assume 1 week data)
ANNUAL_ROI=$(echo "$TIME_SAVED * 52 * 150" | bc)

echo "Week 1 Annual ROI Projection: \$$ANNUAL_ROI"
# Target: ≥$200,000/year
```

3. **Review user feedback**:
```bash
# Count feedback submissions
TOTAL_FEEDBACK=$(cat logs/telemetry/*-feedback.jsonl | wc -l)
echo "Total feedback submissions: $TOTAL_FEEDBACK"

# Target: ≥80% of validations have feedback
```

**Afternoon (2 hours)**:

4. **Identify issues**:
```bash
# Check for false positives
grep "falsePositive.*true" logs/telemetry/*-feedback.jsonl

# Check for false negatives
grep "falseNegative.*true" logs/telemetry/*-feedback.jsonl

# Check for low satisfaction (<3 stars)
grep "satisfied.*[12]" logs/telemetry/*-feedback.jsonl
```

5. **Document findings**:
```bash
cat > logs/week-1-testing/findings.md << 'EOF'
# Week 1 Testing Findings

## Summary
- Total validations: [count]
- Errors prevented: [count]
- False positives: [count] ([percentage]%)
- False negatives: [count] ([percentage]%)
- Average execution time: [time]ms
- User satisfaction: [rating]/5

## Issues Identified
[List any critical bugs, high false positive rates, or performance problems]

## Recommendations
[Next steps for beta rollout or fixes needed]
EOF
```

### Day 7: Go/No-Go Decision

**Decision Criteria**:

| Metric | Target | Actual | Pass? |
|--------|--------|--------|-------|
| Error prevention rate | ≥50% | ___ | ☐ |
| False positive rate | <10% | ___ | ☐ |
| False negative rate | <20% | ___ | ☐ |
| Avg execution time | <5s | ___ | ☐ |
| User satisfaction | ≥3/5 | ___ | ☐ |
| Zero critical bugs | Yes | ___ | ☐ |

**Go Decision** (all criteria met):
- ✅ Proceed to Week 2-3 Beta Testing
- ✅ Select 5-10 beta users
- ✅ Prepare beta onboarding materials

**No-Go Decision** (any criteria not met):
- ❌ Address identified issues
- ❌ Repeat Week 1 testing
- ❌ Delay beta rollout

**Communicate Decision**:
```bash
# Go decision
curl -X POST "$SLACK_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "✅ Week 1 Internal Testing COMPLETE - All success criteria met. Proceeding to Beta Testing (Week 2-3). Report: [link]"
  }'

# No-go decision
curl -X POST "$SLACK_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "⚠️ Week 1 Internal Testing - Issues identified. Addressing before beta. Details: [link]"
  }'
```

---

## Quick Commands Reference

### Daily Commands

```bash
# Morning standup: Check overnight telemetry
node scripts/analyze-validator-telemetry.js --since $(date -d '24 hours ago' +%Y-%m-%d)

# Run test scenario
node scripts/lib/[validator-name].js [args]

# Submit feedback immediately after
node scripts/submit-validator-feedback.js [validator-name]

# End of day: Progress check
node scripts/analyze-validator-telemetry.js
```

### Troubleshooting Commands

```bash
# Telemetry not logging?
echo $VALIDATOR_TELEMETRY_ENABLED  # Should be 1
ls -la logs/telemetry/             # Should have JSONL files

# Invalid JSON in logs?
jq '.' logs/telemetry/[validator].jsonl  # Should parse without errors

# Validator errors?
cat logs/incidents/[validator]-[date].log  # Check error logs
```

---

## Success Indicators (Green Lights)

✅ **All validators execute without errors**
✅ **False positive rate <3%**
✅ **At least 10 real errors caught**
✅ **Average execution time <2 seconds**
✅ **User feedback mostly positive (≥4/5 stars)**
✅ **No critical bugs or crashes**
✅ **Telemetry logging works correctly**
✅ **20+ test scenarios completed**

---

## Common Issues & Solutions

### Issue 1: Telemetry not logging

**Symptom**: No JSONL files in `logs/telemetry/`

**Solution**:
```bash
export VALIDATOR_TELEMETRY_ENABLED=1
mkdir -p logs/telemetry
chmod 755 logs/telemetry
```

### Issue 2: False positives too high (>10%)

**Symptom**: Valid operations blocked incorrectly

**Solution**:
- Review validation logic
- Adjust thresholds
- Add bypass mechanism
- Document in `logs/week-1-testing/findings.md`

### Issue 3: Validator crashes

**Symptom**: Validator exits with error code

**Solution**:
1. Disable validator immediately: `export [VALIDATOR]_ENABLED=false`
2. Document incident: `logs/incidents/INCIDENT_[DATE]_[VALIDATOR].md`
3. Investigate and fix bug
4. Re-test before re-enabling

### Issue 4: Execution time >5 seconds

**Symptom**: Validations taking too long

**Solution**:
- Profile validator code
- Add caching
- Reduce validation scope
- Document in findings

---

## Next Steps After Week 1

**If Go Decision**:
1. Select 5-10 beta users
2. Prepare beta onboarding email
3. Schedule beta kickoff meeting
4. Create beta monitoring dashboard

**If No-Go Decision**:
1. Fix identified issues
2. Re-run failing scenarios
3. Re-generate report
4. Re-evaluate go/no-go criteria

---

## Resources

- **Production Validation Plan**: [PHASE_1_PRODUCTION_VALIDATION_PLAN.md](PHASE_1_PRODUCTION_VALIDATION_PLAN.md)
- **Rollback Procedures**: [VALIDATOR_ROLLBACK_PROCEDURES.md](VALIDATOR_ROLLBACK_PROCEDURES.md)
- **Telemetry Integration**: [VALIDATOR_TELEMETRY_INTEGRATION_GUIDE.md](VALIDATOR_TELEMETRY_INTEGRATION_GUIDE.md)
- **Feedback Form**: [../templates/user-feedback-form.md](../templates/user-feedback-form.md)

---

**Last Updated**: 2025-11-13
**Version**: 1.0.0
**Maintained By**: RevPal Engineering
