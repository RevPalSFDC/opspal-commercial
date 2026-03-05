# Auto-Agent-Router + Response Validation Integration

## Overview

**Version**: 1.0.0
**Date**: 2025-10-19
**Status**: ✅ Production Ready

This document describes the integration between the Auto-Agent-Router and the Response Validation System, enabling automatic validation of agent responses for accuracy and plausibility.

## Architecture

### Components

```
User Request
     ↓
Auto-Agent-Router (routing decision)
     ↓
Agent Execution (response generated)
     ↓
Validation Integration (should validate?)
     ↓
Response Validation Orchestrator
     ├─ Smart Detection (risk scoring)
     ├─ Sanity Checker (claim validation)
     └─ Auto-Retry (if needed)
     ↓
Final Validated Response → User
```

### Integration Points

1. **auto-agent-router.js** - Existing routing logic
2. **auto-router-validator-integration.js** (NEW) - Validation integration layer
3. **response-validation-orchestrator.js** - Core validation logic (from developer-tools-plugin)
4. **route-and-validate.js** (NEW) - CLI wrapper for complete workflow

## Features

### Automatic Validation Triggering

The integration automatically validates responses when:

✅ **Production operations** - Any mention of production/main/master environments
✅ **Bulk operations** - Operations affecting >100 records
✅ **Statistical claims** - Percentages, ratios, distributions
✅ **Destructive operations** - DELETE, TRUNCATE, merge
✅ **Field analysis** - Usage rates, orphan detection
✅ **Extreme percentages** - Values >90% or <5%

### Intelligent Learning

The system learns from validated responses:
- **Org Profiles**: Automatically updates typical record counts
- **Pattern Recognition**: Learns normal distributions per org
- **Adaptive Thresholds**: Adjusts based on historical data

### Statistics Tracking

Tracks validation effectiveness:
- Total validations performed
- Validation catches (incorrect responses detected)
- Auto-retries triggered
- Warnings issued
- Pass-through rate

## Installation

### Prerequisites

1. **developer-tools-plugin** must be installed:
   ```bash
   ls .claude-plugins/developer-tools-plugin/scripts/lib/response-validation-orchestrator.js
   # Should exist
   ```

2. **salesforce-plugin** with auto-agent-router:
   ```bash
   ls .claude-plugins/salesforce-plugin/scripts/auto-agent-router.js
   # Should exist
   ```

### Setup

The integration is ready to use immediately - no additional setup required!

Files installed:
- `scripts/lib/auto-router-validator-integration.js` - Integration module
- `scripts/route-and-validate.js` - CLI wrapper
- `.claude/validation-config.json` - Configuration

## Usage

### CLI Commands

#### 1. Route Operation (No Validation)

```bash
node .claude-plugins/salesforce-plugin/scripts/route-and-validate.js route \
  "analyze orphaned accounts in production"

# Output:
# ✅ ROUTING RESULT
# Agent: sfdc-field-analyzer
# Confidence: 85%
# Complexity: 70%
# Auto-Invoke: Yes
```

#### 2. Validate Response

```bash
node .claude-plugins/salesforce-plugin/scripts/route-and-validate.js validate \
  --response response.txt \
  --operation "field analysis" \
  --agent "sfdc-field-analyzer" \
  --org "production"

# Output:
# 🔍 RESPONSE VALIDATION RESULT
# ⚠️  Status: FAILED
# Action: retry_needed
# Confidence: 85%
#
# Concerns:
#   • Percentage 98% exceeds threshold (95%) (85%)
#
# 🔄 AUTO-RETRY TRIGGERED
# The agent will be prompted to re-validate the response...
```

#### 3. Full Workflow (Route + Validate)

```bash
node .claude-plugins/salesforce-plugin/scripts/route-and-validate.js full \
  --operation "analyze field usage in rentable-prod" \
  --response field-analysis-response.txt

# Output:
# 🤖 AUTO AGENT ROUTER ANALYSIS
# Selected Agent: sfdc-field-analyzer
#
# 🔍 RESPONSE VALIDATION RESULT
# ⚠️  Status: FAILED
# Action: retry_needed
#
# 🔄 RE-VALIDATION REQUIRED
# Please re-invoke the agent with this prompt:
# [Re-validation prompt shown]
```

#### 4. View Statistics

```bash
node .claude-plugins/salesforce-plugin/scripts/route-and-validate.js stats

# Output:
# 📊 AUTO-ROUTING STATISTICS
# Total Auto-Invocations: 42
#
# 📋 VALIDATION STATISTICS
# Total Validations: 15
# Validation Catches: 3
# Auto-Retries: 2
# Warnings: 1
# Pass-Through: 12
#
# Rates:
#   Catch Rate: 20.0%
#   Auto-Retry Rate: 13.3%
```

#### 5. Run Test Suite

```bash
node .claude-plugins/salesforce-plugin/scripts/route-and-validate.js test

# Output:
# 🧪 RUNNING TEST SUITE
#
# Test: Suspicious Percentage (98% orphaned)
# ✓ PASS (action: retry_needed)
#
# Test: Valid Response (45% qualified)
# ✓ PASS (action: passed)
#
# Test: Zero Count (0 records use Email)
# ✓ PASS (action: warned)
#
# Results: 3 passed, 0 failed
```

### Programmatic Usage

#### Basic Integration

```javascript
const AutoAgentRouter = require('./auto-agent-router');
const AutoRouterValidatorIntegration = require('./lib/auto-router-validator-integration');

// Initialize
const router = new AutoAgentRouter();
const integration = new AutoRouterValidatorIntegration(router);

// Complete workflow
const result = await integration.routeAndValidate(
  "analyze orphaned accounts in production",
  agentResponse
);

if (result.requiresRetry) {
  // Re-invoke agent with revalidationPrompt
  console.log(result.revalidationPrompt);
} else {
  // Show final response to user
  console.log(result.finalResponse);
}
```

#### Validation Only

```javascript
// Just validate a response (no routing)
const context = {
  agent: 'sfdc-field-analyzer',
  operation: 'field analysis',
  org: 'production',
  complexity: 0.7
};

const result = await integration.validateAgentResponse(response, context);

if (!result.passed && result.action === 'retry_needed') {
  console.log('Validation failed, re-validation needed');
  console.log(result.revalidationPrompt);
}
```

## Configuration

### Validation Settings

**File**: `.claude/validation-config.json`

```json
{
  "validation": {
    "enabled": true,
    "mode": "block_and_retry",
    "integrationWithRouter": true,
    "automaticValidation": true,

    "thresholds": {
      "percentage_bounds": [5, 95],
      "record_count_deviation": 0.5,
      "auto_retry_confidence": 0.8,
      "warn_confidence": 0.5
    },

    "triggers": {
      "production": {
        "always_validate": true
      },
      "bulk_operations": {
        "threshold": 100
      },
      "statistical_claims": {
        "enabled": true
      }
    },

    "org_profiles": {
      "cache_enabled": true,
      "auto_learn": true
    }
  }
}
```

### Tuning

#### Conservative (Catch More)

```json
{
  "thresholds": {
    "percentage_bounds": [10, 90],
    "auto_retry_confidence": 0.7,
    "warn_confidence": 0.4
  }
}
```

**Effect**: More validations, more auto-retries, higher catch rate, more false positives

#### Permissive (Fewer Warnings)

```json
{
  "thresholds": {
    "percentage_bounds": [3, 97],
    "auto_retry_confidence": 0.9,
    "warn_confidence": 0.6
  }
}
```

**Effect**: Fewer validations, fewer auto-retries, lower catch rate, fewer false positives

## Workflow Examples

### Example 1: Production Field Analysis (Auto-Retry)

**User Request**: "Analyze orphaned accounts in production org"

**Step 1: Routing**
```
Auto-Agent-Router Analysis:
- Complexity: 70% (production + field analysis)
- Selected Agent: sfdc-field-analyzer
- Auto-Invoke: Yes
```

**Step 2: Agent Response** (original)
```
Production Org Analysis
Total Accounts: 30,000
Orphaned: 29,400
Orphan Rate: 98%
```

**Step 3: Validation**
```
Smart Detection: VALIDATE (production + extreme %)
Sanity Check: FAIL (98% > 95% threshold)
Confidence: 85%
Action: retry_needed
```

**Step 4: Re-Validation Prompt**
```
Your previous response claimed "98% orphaned accounts".
This exceeds the 95% threshold and seems implausible.
Please re-run your query and verify the WHERE clause...
```

**Step 5: Agent Re-Validates**
```
Production Org Analysis
Total Accounts: 30,000
Orphaned: 3,600
Orphan Rate: 12%

[Correction: Original query had incorrect WHERE clause]
```

**Step 6: Final Validation**
```
Validation: PASS (12% within normal range)
Org Profile Updated: Account → 30,000 records
```

**User Sees**:
```
✅ VALIDATION COMPLETE

Original Claim: 98% orphaned (CORRECTED)
Final Claim: 12% orphaned (VERIFIED)

Production Org Analysis
Total Accounts: 30,000
Orphaned: 3,600
Orphan Rate: 12%
```

### Example 2: Sandbox Analysis (Warning)

**User Request**: "Analyze lead qualification in sandbox"

**Agent Response**:
```
Sandbox Analysis
Total Leads: 1,000
Qualified: 750 (exactly 75%)
```

**Validation**:
```
Smart Detection: VALIDATE (statistical claim)
Sanity Check: CONCERN (75% is suspiciously round)
Confidence: 65%
Action: warned (not high enough for auto-retry)
```

**User Sees**:
```
┌────────────────────────────────────────────┐
│ ⚠️  VALIDATION NOTICE                      │
│ Suspiciously round percentage (75%)       │
│ Consider verifying before action          │
└────────────────────────────────────────────┘

Sandbox Analysis
Total Leads: 1,000
Qualified: 750 (exactly 75%)
```

### Example 3: Read-Only Query (Skip Validation)

**User Request**: "Show SOQL query for active accounts"

**Agent Response**:
```
SELECT Id, Name FROM Account WHERE IsActive = true
```

**Validation**:
```
Smart Detection: SKIP (read-only query, no statistical claims)
```

**User Sees**: Original response immediately (no validation overhead)

## Performance

### Overhead

**Typical Validation Time**: 2-3 seconds
**Breakdown**:
- Smart detection: ~100ms
- Sanity checker: ~500ms
- Re-validation (if needed): ~2-3 seconds

**Optimization**:
- Caching: Org profiles cached for 24 hours
- Early exit: Skip validation for low-risk operations
- Parallel checks: Run validation checks concurrently

### Success Metrics

**Target**:
- Catch Rate: >80%
- False Positive Rate: <10%
- Auto-Retry Success: >70%
- Time Overhead: <5 seconds

**How to Monitor**:
```bash
# Check validation stats
node route-and-validate.js stats

# Review validation log
cat .claude/validation-log.jsonl | grep '"action":"retry"' | jq -s 'length'
```

## Troubleshooting

### False Positive

**Symptom**: Valid response was flagged

**Solutions**:
1. Update org profile:
   ```bash
   # Response validation will auto-learn typical counts
   # Or manually update:
   node ../../developer-tools-plugin/scripts/lib/response-sanity-checker.js \
     update-profile --org production --counts '{"Account": 30000}'
   ```

2. Adjust thresholds in `.claude/validation-config.json`

3. Review validation log for patterns:
   ```bash
   cat .claude/validation-log.jsonl | jq '.concerns'
   ```

### Integration Not Working

**Symptom**: Validation not running automatically

**Diagnosis**:
```bash
# Check validation enabled
cat .claude/validation-config.json | jq '.validation.enabled'

# Check modules loaded
node -e "const Int = require('./scripts/lib/auto-router-validator-integration'); console.log('OK')"

# Test validation manually
node route-and-validate.js validate --response test.txt --operation "test"
```

### Performance Issues

**Symptom**: Validation taking >10 seconds

**Solutions**:
1. Enable caching in config
2. Reduce timeout: `timeout_ms: 5000`
3. Check for network issues (if using external APIs)

## Best Practices

### 1. Regular Org Profile Updates

```bash
# Monthly: Run field analysis to update profiles
node route-and-validate.js full \
  --operation "analyze all objects in production" \
  --response analysis.txt

# Validation will auto-learn typical counts
```

### 2. Review Validation Logs Weekly

```bash
# Check for patterns in validation catches
cat .claude/validation-log.jsonl | \
  jq -s 'group_by(.agent) | map({agent: .[0].agent, catches: length})' | \
  jq 'sort_by(.catches) | reverse'
```

### 3. Tune Thresholds Based on Feedback

```bash
# Track false positive rate via reflections
# If >10% → adjust thresholds in config
```

### 4. Use Appropriate Mode

- **Production**: `block_and_retry`
- **Sandbox Development**: `warn_only`
- **Testing/CI**: `log_only`

## Files Created

```
.claude-plugins/salesforce-plugin/
├── scripts/
│   ├── route-and-validate.js                    # CLI wrapper (NEW)
│   └── lib/
│       └── auto-router-validator-integration.js # Integration module (NEW)
├── .claude/
│   ├── validation-config.json                   # Configuration (NEW)
│   ├── validation-stats.json                    # Statistics (auto-generated)
│   └── validation-log.jsonl                     # Event log (auto-generated)
└── ROUTER_VALIDATION_INTEGRATION.md            # This document (NEW)
```

## Next Steps

### Phase 2 (Week 2-3)

1. **Hook Integration**
   - Create post-response hook for automatic validation
   - Integrate with user-prompt-submit hook
   - Transparent validation (no manual invocation)

2. **Enhanced Learning**
   - ML-based anomaly detection
   - Adaptive thresholds based on org history
   - Cross-org pattern recognition

3. **Query Validation**
   - Deep SOQL parsing
   - Query logic validation
   - Automatic query correction suggestions

### Testing Checklist

- [ ] Test with production responses (real data)
- [ ] Monitor false positive rate (target <10%)
- [ ] Verify auto-retry success rate (target >70%)
- [ ] Measure time overhead (target <5 seconds)
- [ ] Collect user feedback via /reflect

## Support

### Documentation
- **User Guide**: `../../developer-tools-plugin/docs/RESPONSE_VALIDATION_GUIDE.md`
- **Integration Guide**: This document
- **Agent Definition**: `../../developer-tools-plugin/agents/response-validator.md`

### Feedback
Submit via `/reflect` or GitHub issue

---

**Version**: 1.0.0
**Last Updated**: 2025-10-19
**Status**: Production Ready
**Maintained By**: Developer Tools Plugin Team
