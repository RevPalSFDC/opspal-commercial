# Response Validation System - User Guide

## Overview

The Response Validation System automatically validates agent responses for plausibility, statistical accuracy, and internal consistency. It catches obviously incorrect claims (like "98% of 30k accounts are orphaned") and prompts agents to re-check their work before presenting final results.

**Version**: 1.0.0
**Status**: Production Ready
**Last Updated**: 2025-10-19

## Quick Start

### Automatic Validation

The validation system runs automatically when:

1. **Production operations** - Any mention of production/main environments
2. **Bulk operations** - Operations affecting >100 records
3. **Statistical claims** - Responses containing percentages, ratios, or distributions
4. **Destructive operations** - DELETE, TRUNCATE, merge operations
5. **Field analysis** - Usage rates, orphan detection, adoption metrics
6. **Extreme percentages** - Values >90% or <5%

### Manual Validation

Force validation on any response:

```bash
# Validate a response file
node .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/lib/response-validation-orchestrator.js \
  validate \
  --response /path/to/response.txt \
  --context '{"org":"production","operation":"field-analysis"}'

# View validation report
node .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/lib/response-validation-orchestrator.js \
  report \
  --result /path/to/validation-result.json
```

### Configuration

Edit `.claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/.claude-plugin/settings.json`:

```json
{
  "response_validation": {
    "enabled": true,
    "mode": "block_and_retry",  // or "warn_only", "log_only"
    "smart_detection": true,
    "thresholds": {
      "auto_retry_confidence": 0.8,
      "warn_confidence": 0.5
    }
  }
}
```

## Validation Modes

### Block and Retry (Default)

**Best for**: Production operations, data quality work

**Behavior**:
- High confidence failures (>80%) → Automatically blocks response and requests re-validation
- Medium confidence concerns (50-80%) → Shows response with warning banner
- Low confidence (< 50%) → Passes through

**Example**:
```
Original Claim: "98% of 30,000 accounts are orphaned"
→ Validation FAILS (confidence: 85%)
→ Response BLOCKED
→ Agent prompted to re-validate
→ Re-validated Claim: "12% of 30,000 accounts are orphaned"
→ Final response shown with validation report
```

### Warn Only

**Best for**: Exploratory analysis, sandbox work

**Behavior**:
- All failures → Show response with warning banner
- No automatic re-validation

**Example**:
```
┌────────────────────────────────────────────┐
│ ⚠️  VALIDATION NOTICE                      │
│                                            │
│ This response contains claims that may     │
│ need verification:                         │
│ • Percentage 98% exceeds threshold (95%)  │
│                                            │
│ Confidence: 85% (high concern)             │
│ Consider double-checking before action     │
└────────────────────────────────────────────┘

[Original response follows...]
```

### Log Only

**Best for**: Development, testing

**Behavior**:
- All responses pass through
- Validation results logged for analysis
- No user-visible warnings or blocks

## Validation Checks

### 1. Statistical Claims

**What it checks**:
- Percentages outside 5-95% range
- Suspiciously round numbers (10%, 25%, 50%) on large datasets
- Ratio plausibility (e.g., 29,400/30,000 = 98% orphans)
- Distribution totals matching sums

**Example catches**:
```
❌ "98% of accounts are orphaned"
   → Percentage exceeds 95% threshold

❌ "Exactly 75% of fields are unused"
   → Suspiciously round percentage for large dataset

✅ "45% of leads are qualified"
   → Normal percentage, passes validation
```

### 2. Record Counts

**What it checks**:
- Counts against org profile (if available)
- Deviation from expected ranges (>50% = suspicious)
- Zero counts for required/standard fields

**Example catches**:
```
❌ "0 records use the Email field on Contact"
   → Zero count suspicious for standard field

❌ "Found 15,000 accounts (expected ~30,000)"
   → 50% deviation from org profile

✅ "Found 28,000 accounts (expected 30,000)"
   → 7% deviation, within tolerance
```

### 3. Cross-References

**What it checks**:
- Totals match sums of parts
- Contradictory statements (95% with + 92% without)
- Query logic matches claims

**Example catches**:
```
❌ "Total: 1000. Breakdown: 300 + 400 + 200 + 150"
   → Sum is 1050, not 1000 (5% discrepancy)

❌ "95% have emails AND 92% don't have emails"
   → Contradictory percentages (sum > 100%)

✅ "Total: 1000. Breakdown: 300 + 400 + 300"
   → Sum matches total
```

## Org Profile Management

### Update Org Profile

Teach the validator about your org's typical record counts:

```bash
node .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/lib/response-sanity-checker.js \
  update-profile \
  --org rentable-production \
  --counts '{"Account": 30000, "Contact": 45000, "Lead": 12000}'
```

### View Org Profile

```bash
node .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/lib/response-sanity-checker.js \
  get-profile \
  --org rentable-production

# Output:
# {
#   "Account": 30000,
#   "Contact": 45000,
#   "Lead": 12000
# }
```

### How Profiles are Used

The validator compares claimed counts against org profile:

```
Response: "Found 15,000 accounts in rentable-production"
Profile: Account: 30,000
Deviation: 50% (15k vs 30k)
Result: FLAGGED (deviation > 50% threshold)
```

Profiles are cached in `.cache/org-profiles.json`.

## Smart Detection

### Detection Rules

| Rule | Trigger | Weight | Example |
|------|---------|--------|---------|
| Production | `prod`, `production`, `main` | 1.0 | "Deploying to production" |
| Bulk | `>100 records` | 0.9 | "Updating 500 records" |
| Statistical | `%`, `X out of Y`, `ratio` | 0.8 | "98% orphaned" |
| Destructive | `DELETE`, `TRUNCATE`, `merge` | 1.0 | "DELETE 200 records" |
| Field Analysis | `usage`, `adoption`, `orphan` | 0.7 | "Field usage: 15%" |
| Extreme % | `>90%` or `<5%` | 0.9 | "2% have emails" |
| Zero Counts | `0 records`, `no records` | 0.8 | "0 records use field" |

### Skip Patterns

Validation is **skipped** for:
- Read-only queries (`SELECT` without `UPDATE`/`DELETE`)
- Documentation responses (explanations, tutorials)
- Sandbox environments (unless production also mentioned)
- Single record operations

### Risk Scoring

Detection score = sum of weights for matched rules (normalized to 0-1)

```
Example: "Deploying to production, updating 500 accounts"
- Production rule: 1.0
- Bulk rule: 0.9
- Total: 1.9 → Normalized: 0.95 (critical risk)
- Result: Validation REQUIRED
```

## Usage Examples

### Example 1: Valid Response (Passes)

**Response**:
```
Lead Analysis - Sandbox

Analyzed 1,000 leads:
- Qualified: 450 (45%)
- Unqualified: 350 (35%)
- New: 200 (20%)
```

**Validation**:
```
✅ Status: PASSED
Confidence: 0%
Reason: All claims within normal ranges
```

### Example 2: Suspicious Percentage (Auto-Retry)

**Original Response**:
```
Field Analysis - Production

Total Accounts: 30,000
Orphaned: 29,400
Orphan Rate: 98%
```

**Validation**:
```
⚠️  VALIDATION FAILURE - AUTO-RETRY

Original Claim: "98% orphaned"
Issue: Percentage exceeds 95% threshold
Confidence: 85% (high)

Re-validation requested...
```

**Re-validated Response**:
```
Field Analysis - Production

Total Accounts: 30,000
Orphaned: 3,600
Orphan Rate: 12%

[Correction: Original query had incorrect WHERE clause]
```

**Final Validation**:
```
✅ RE-VALIDATION COMPLETE

Updated Claim: "12% orphaned"
Status: PASSED
Confidence: 95%

Changes:
- Original: 98% (29,400/30,000)
- Re-validated: 12% (3,600/30,000)
- Correction: Query logic fixed
```

### Example 3: Zero Count (Warning)

**Response**:
```
Email Analysis

Query: SELECT Id, Email FROM Contact WHERE Email = null
Results: 45,000 records

0 records use the Email field.
```

**Validation**:
```
┌────────────────────────────────────────────┐
│ ⚠️  VALIDATION NOTICE                      │
│                                            │
│ Suspicious claims detected:                │
│ • Zero count for standard field (Email)   │
│                                            │
│ Confidence: 90% (high concern)             │
│ Verify query logic before proceeding      │
└────────────────────────────────────────────┘
```

## CLI Commands

### Validate Response

```bash
node .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/lib/response-validation-orchestrator.js \
  validate \
  --response response.txt \
  --context '{"org":"production","operation":"field-analysis"}' \
  --mode block_and_retry
```

### Check Smart Detection

```bash
node .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/lib/smart-detection.js \
  summary \
  --response response.txt \
  --context '{"org":"production"}'

# Output:
# {
#   "shouldValidate": true,
#   "riskScore": 0.85,
#   "riskLevel": "critical",
#   "triggers": ["Production environment detected", "Statistical claims detected"],
#   "recommendation": "validate_and_block"
# }
```

### Run Sanity Checker

```bash
node .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/lib/response-sanity-checker.js \
  validate \
  --response response.txt \
  --context '{"org":"production"}'

# Output:
# {
#   "valid": false,
#   "confidence": 0.85,
#   "concerns": [
#     {
#       "claim": "98%",
#       "reason": "Percentage exceeds threshold (95%)",
#       "confidence": 0.85
#     }
#   ],
#   "recommendation": "auto_retry"
# }
```

## Configuration Reference

### Complete Settings

```json
{
  "response_validation": {
    "enabled": true,
    "mode": "block_and_retry",
    "smart_detection": true,
    "max_retries": 1,
    "timeout_ms": 30000,

    "thresholds": {
      "percentage_bounds": [5, 95],
      "record_count_deviation": 0.5,
      "cross_reference_tolerance": 0.1,
      "auto_retry_confidence": 0.8,
      "warn_confidence": 0.5
    },

    "domains": {
      "salesforce": {
        "validate_soql": true,
        "org_profiles": "cached",
        "field_limits": {
          "Account": {
            "min": 100,
            "max": 1000000,
            "typical_orphan_rate": 0.15
          }
        }
      }
    },

    "detection_rules": {
      "production": { "weight": 1.0, "enabled": true },
      "bulk": { "weight": 0.9, "threshold": 100, "enabled": true },
      "statistical": { "weight": 0.8, "enabled": true }
    },

    "skip_patterns": {
      "read_only": true,
      "documentation": true,
      "sandbox": true
    }
  }
}
```

### Tuning Recommendations

**Conservative (Catch More)**:
```json
{
  "thresholds": {
    "percentage_bounds": [10, 90],
    "auto_retry_confidence": 0.7,
    "warn_confidence": 0.4
  }
}
```

**Permissive (Fewer Warnings)**:
```json
{
  "thresholds": {
    "percentage_bounds": [3, 97],
    "auto_retry_confidence": 0.9,
    "warn_confidence": 0.6
  }
}
```

## Troubleshooting

### False Positive

**Symptom**: Valid response was flagged

**Solutions**:
1. Update org profile with correct record counts
2. Adjust percentage bounds in settings
3. Add exception rule for specific pattern
4. Lower confidence thresholds

**Example**:
```bash
# Valid response: "92% of contacts are active"
# Flagged because >90%
# Solution: This org actually has high active rate

# Update settings to allow higher percentages:
{
  "thresholds": {
    "percentage_bounds": [5, 97]
  }
}
```

### False Negative

**Symptom**: Incorrect response not caught

**Solutions**:
1. Add heuristic for this pattern
2. Tighten thresholds
3. Enable additional detection rules
4. Review smart detection triggers

### Performance Issues

**Symptom**: Validation taking >10 seconds

**Solutions**:
1. Enable org profile caching
2. Use parallel validation (if available)
3. Reduce timeout per check
4. Disable expensive validations

## Best Practices

### 1. Update Org Profiles Regularly

```bash
# Monthly: Update profiles with current counts
node response-sanity-checker.js update-profile \
  --org production \
  --counts "$(sf data query --query 'SELECT COUNT() FROM Account')"
```

### 2. Review Validation Logs

```bash
# Weekly: Check for patterns in .cache/validation-log.jsonl
cat .cache/validation-log.jsonl | grep '"action":"retry"' | jq -s 'length'
```

### 3. Monitor False Positive Rate

```bash
# Track via reflection system
# If >10% false positive rate → adjust thresholds
```

### 4. Use Mode Appropriately

- **Production**: `block_and_retry`
- **Sandbox Development**: `warn_only`
- **Testing/CI**: `log_only`

## Integration

### With Reflection System

Validation catches are automatically logged to reflections:

```javascript
{
  "category": "data_quality",
  "issue": "Validation caught suspicious claim",
  "original_claim": "98% orphaned",
  "corrected_claim": "12% orphaned",
  "validation_confidence": 0.85,
  "action_taken": "auto_retry"
}
```

### With Agent Workflows

Invoke validator from any agent:

```javascript
const orchestrator = new ResponseValidationOrchestrator();
const result = await orchestrator.orchestrate(agentResponse, context);

if (!result.passed && result.action === 'retry_needed') {
  // Re-invoke agent with revalidationPrompt
  const revalidated = await invokeAgent(originalAgent, result.revalidationPrompt);
  // Compare and show diff
}
```

## Metrics

Track these metrics to measure effectiveness:

- **Catch Rate**: % of incorrect responses caught
- **False Positive Rate**: % of valid responses flagged
- **Auto-Retry Success**: % of retries that changed response
- **Time Overhead**: Avg validation time
- **User Satisfaction**: Feedback from reflections

**Target Metrics**:
- Catch Rate: >80%
- False Positive Rate: <10%
- Auto-Retry Success: >70%
- Time Overhead: <5 seconds
- User Satisfaction: >80%

## Support

### Documentation
- Agent: `.claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/agents/response-validator.md`
- Tests: `.claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/lib/__tests__/response-validation.test.js`
- Examples: `.claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/lib/__tests__/fixtures/`

### Feedback
Submit issues via `/reflect` or create GitHub issue in plugin repository.

---

**Version**: 1.0.0
**Last Updated**: 2025-10-19
**Maintained By**: Developer Tools Plugin Team
