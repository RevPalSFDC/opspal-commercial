# Task 2.4: Merge Feedback System - Implementation Complete

**Implementation Date**: 2025-10-16
**Status**: ✅ COMPLETE
**Estimated Effort**: 2 hours
**Actual Effort**: ~2 hours

## Overview

Implemented a learning system that collects feedback from merge operations and uses historical data to improve future decision quality. The system tracks merge outcomes, identifies patterns, generates confidence score adjustments, and provides actionable recommendations.

## Components Implemented

### 1. MergeFeedbackCollector

**Location**: `scripts/lib/merge-feedback-collector.js`
**Size**: ~550 lines
**Purpose**: Collect and analyze feedback from merge operations

**Key Features**:
- ✅ Records merge outcomes (SUCCESS, ERROR, ROLLBACK)
- ✅ Tracks actual vs predicted confidence
- ✅ Calculates accuracy metrics by confidence band
- ✅ Identifies patterns in guardrails, conflicts, and decisions
- ✅ Generates recommendations for confidence adjustments
- ✅ Exports feedback data for analysis

### 2. MergeLearningEngine

**Location**: `scripts/lib/merge-learning-engine.js`
**Size**: ~480 lines
**Purpose**: Learn from feedback and generate confidence adjustments

**Key Features**:
- ✅ Generates adjustment rules from historical data
- ✅ Applies adjustments to future decisions
- ✅ Provides example applications
- ✅ Saves/loads adjustment configurations
- ✅ Generates comprehensive learning reports

## Feedback Database Schema

### Feedback Record Structure

```json
{
  "version": "1.0.0",
  "created": "2025-10-16T18:00:00Z",
  "lastUpdated": "2025-10-16T20:30:00Z",
  "merges": [
    {
      "merge_id": "merge_1697479800000_abc123",
      "timestamp": "2025-10-16T18:30:00Z",
      "pair_id": "001xx_001yy",

      "original_decision": {
        "decision": "APPROVE",
        "recommended_survivor": "001xx",
        "recommended_deleted": "001yy",
        "confidence": 85,
        "enhanced_confidence": { "total": 88, "category": "HIGH" },
        "guardrails_triggered": ["TYPE_2_RELATIONSHIP_ASYMMETRY"],
        "conflicts_detected": 0
      },

      "execution": {
        "executed_at": "2025-10-16T18:30:00Z",
        "actual_survivor": "001xx",
        "actual_deleted": "001yy",
        "followed_recommendation": true
      },

      "outcome": {
        "status": "SUCCESS",
        "error_message": null,
        "rollback_required": false,
        "data_loss": false,
        "user_correction": false
      },

      "metrics": {
        "contacts_transferred": 15,
        "opportunities_transferred": 3,
        "cases_transferred": 0,
        "fields_merged": 42,
        "conflicts_encountered": 0,
        "duration_ms": 2500
      },

      "actual_confidence": 90
    }
  ],
  "stats": {
    "totalMerges": 1250,
    "successfulMerges": 1180,
    "failedMerges": 50,
    "rolledBackMerges": 20
  }
}
```

### Feedback Collection Workflow

```
1. Execute merge via merge-executor
   ↓
2. Collect outcome metadata (automatic)
   ↓
3. Calculate actual confidence based on outcome
   ↓
4. Store feedback record in database
   ↓
5. Update aggregated statistics
   ↓
6. Save to merge-feedback.json
```

## Actual Confidence Calculation

**Purpose**: Assess the TRUE quality of a merge based on outcome

**Formula**:
```javascript
actualConfidence = 100
  - 50 (if status === 'ERROR')
  - 40 (if rollback_required)
  - 30 (if data_loss)
  - 10 (if user_correction)
  - (conflicts_encountered × 5)
  - 5 (if duration > 30 seconds)

Result: Max(0, actualConfidence)
```

**Examples**:
- Perfect merge (no issues): 100%
- Merge with user correction: 90%
- Merge with 2 conflicts: 90%
- Merge with error: 50%
- Merge with rollback: 20%

## Accuracy Metrics

### By Confidence Band

**Output Example**:
```
Merge Success Rate by Confidence Band:

90-100% confidence:
  Total: 200
  Successful: 196
  Failed: 4
  Success Rate: 98.0%
  Avg Predicted: 94.5
  Avg Actual: 96.2

75-89% confidence:
  Total: 500
  Successful: 460
  Failed: 40
  Success Rate: 92.0%
  Avg Predicted: 82.3
  Avg Actual: 87.1

60-74% confidence:
  Total: 350
  Successful: 273
  Failed: 77
  Success Rate: 78.0%
  Avg Predicted: 67.2
  Avg Actual: 72.5

40-59% confidence:
  Total: 150
  Successful: 68
  Failed: 82
  Success Rate: 45.3%
  Avg Predicted: 51.8
  Avg Actual: 48.2

0-39% confidence:
  Total: 50
  Successful: 15
  Failed: 35
  Success Rate: 30.0%
  Avg Predicted: 28.5
  Avg Actual: 25.3
```

**Interpretation**:
- 90-100% band: Excellent accuracy (98% success, predicted ≈ actual)
- 75-89% band: Good accuracy (92% success, slight underprediction)
- 60-74% band: Acceptable accuracy (78% success, underprediction)
- 40-59% band: Poor accuracy (45% success, predicted close to actual)
- 0-39% band: Very poor accuracy (30% success, predicted close to actual)

## Pattern Analysis

### 1. By Decision Type

**Example**:
```json
{
  "APPROVE": {
    "total": 950,
    "successful": 890,
    "success_rate": "93.7%"
  },
  "REVIEW": {
    "total": 250,
    "successful": 230,
    "success_rate": "92.0%"
  },
  "BLOCK": {
    "total": 50,
    "successful": 10,
    "success_rate": "20.0%"
  }
}
```

**Insight**: BLOCK decisions have low success when executed (shouldn't have been merged)

### 2. By Guardrail Patterns

**Example**:
```json
{
  "NO_GUARDRAILS": {
    "total": 600,
    "successful": 585,
    "success_rate": "97.5%"
  },
  "TYPE_2_RELATIONSHIP_ASYMMETRY": {
    "total": 200,
    "successful": 180,
    "success_rate": "90.0%"
  },
  "TYPE_1_DOMAIN_MISMATCH,TYPE_2_DATA_RICHNESS_MISMATCH": {
    "total": 50,
    "successful": 30,
    "success_rate": "60.0%"
  }
}
```

**Insight**: Multiple guardrails correlate with lower success rates

### 3. By Conflict Detection

**Example**:
```json
{
  "NO_CONFLICTS": {
    "total": 1000,
    "successful": 960,
    "success_rate": "96.0%"
  },
  "1_CONFLICTS": {
    "total": 150,
    "successful": 120,
    "success_rate": "80.0%"
  },
  "2_CONFLICTS": {
    "total": 100,
    "successful": 60,
    "success_rate": "60.0%"
  }
}
```

**Insight**: Conflicts strongly correlate with merge failure

### 4. By Followed Recommendation

**Example**:
```json
{
  "true": {
    "total": 1100,
    "successful": 1050,
    "success_rate": "95.5%"
  },
  "false": {
    "total": 150,
    "successful": 80,
    "success_rate": "53.3%"
  }
}
```

**Insight**: Not following recommendations significantly reduces success rate

## Confidence Adjustment Rules

### Rule Generation

The learning engine generates adjustment rules based on patterns:

**Rule Type 1: Confidence Band Adjustment**
```json
{
  "type": "CONFIDENCE_BAND_ADJUSTMENT",
  "condition": {
    "confidence_range": { "min": 75, "max": 89 }
  },
  "adjustment": +3,
  "reason": "Historical success rate: 92.0% (500 merges)",
  "confidence_level": "MEDIUM"
}
```

**Application**: Increase confidence by 3% for decisions in 75-89% band

**Rule Type 2: Guardrail Pattern Adjustment**
```json
{
  "type": "GUARDRAIL_PATTERN_ADJUSTMENT",
  "condition": {
    "guardrails": ["TYPE_1_DOMAIN_MISMATCH"]
  },
  "adjustment": -10,
  "reason": "Guardrails 'TYPE_1_DOMAIN_MISMATCH' have 65.0% success rate (80 merges)",
  "confidence_level": "LOW"
}
```

**Application**: Decrease confidence by 10% when domain mismatch guardrail triggered

**Rule Type 3: Conflict Pattern Adjustment**
```json
{
  "type": "CONFLICT_PATTERN_ADJUSTMENT",
  "condition": {
    "conflicts": 0
  },
  "adjustment": +3,
  "reason": "NO_CONFLICTS have 96.0% success rate (1000 merges)",
  "confidence_level": "LOW"
}
```

**Application**: Increase confidence by 3% when no conflicts detected

**Rule Type 4: Recommendation Adherence Adjustment**
```json
{
  "type": "RECOMMENDATION_ADHERENCE_ADJUSTMENT",
  "condition": {
    "followed_recommendation": false
  },
  "adjustment": -10,
  "reason": "Not following recommendations has 53.3% success vs 95.5% when followed",
  "confidence_level": "MEDIUM"
}
```

**Application**: Decrease confidence by 10% when recommendation not followed

### Rule Application Example

**Scenario**: Decision with 85% confidence, 1 guardrail (TYPE_2_RELATIONSHIP_ASYMMETRY), no conflicts

**Adjustments Applied**:
```
Base Confidence: 85%

+ Confidence Band Adjustment (75-89% band): +3%
  Reason: Historical success rate 92.0%

+ No Conflicts Adjustment: +3%
  Reason: NO_CONFLICTS have 96.0% success rate

= Adjusted Confidence: 91%
```

**Result**: Confidence increased from 85% → 91% based on learned patterns

## Recommendations

### Automatic Recommendations

The system generates recommendations based on metrics:

**Example 1: Decrease Confidence**
```json
{
  "band": "60-74%",
  "type": "DECREASE_CONFIDENCE",
  "reason": "Success rate (78.0%) is below 80% but predicted confidence is high",
  "suggestion": "Consider decreasing confidence scores in this band by ~5%",
  "data": {
    "current_success_rate": "78.0%",
    "avg_predicted": 67.2,
    "avg_actual": 72.5,
    "sample_size": 350
  }
}
```

**Example 2: Increase Confidence**
```json
{
  "band": "75-89%",
  "type": "INCREASE_CONFIDENCE",
  "reason": "Success rate (92.0%) is very high but predicted confidence is conservative",
  "suggestion": "Consider increasing confidence scores in this band by ~5%",
  "data": {
    "current_success_rate": "92.0%",
    "avg_predicted": 82.3,
    "avg_actual": 87.1,
    "sample_size": 500
  }
}
```

**Example 3: Confidence Accurate**
```json
{
  "band": "90-100%",
  "type": "CONFIDENCE_ACCURATE",
  "reason": "Success rate (98.0%) is good and confidence prediction is accurate",
  "suggestion": "No adjustment needed - confidence scoring is working well",
  "data": {
    "current_success_rate": "98.0%",
    "avg_predicted": 94.5,
    "avg_actual": 96.2,
    "sample_size": 200
  }
}
```

## CLI Interface

### Collect Feedback (Programmatic)

```javascript
const MergeFeedbackCollector = require('./merge-feedback-collector');
const collector = new MergeFeedbackCollector('./merge-feedback.json');

// After executing merge
const mergeId = await collector.recordMerge(decision, outcome);
console.log(`Merge recorded: ${mergeId}`);
```

### View Metrics

```bash
node merge-feedback-collector.js metrics

# Output:
═══════════════════════════════════════════════════════════════════
MERGE ACCURACY METRICS
═══════════════════════════════════════════════════════════════════
Total Merges: 1250
Overall Success Rate: 94.4%

By Confidence Band:
───────────────────────────────────────────────────────────────────

90-100%:
  Total: 200
  Successful: 196
  Failed: 4
  Success Rate: 98.0%
  Avg Predicted Confidence: 94.5
  Avg Actual Confidence: 96.2
...
```

### View Pattern Analysis

```bash
node merge-feedback-collector.js patterns

# Output:
By Decision Type:
{
  "APPROVE": { "total": 950, "successful": 890, "success_rate": "93.7%" },
  ...
}

By Followed Recommendation:
{
  "true": { "total": 1100, "successful": 1050, "success_rate": "95.5%" },
  "false": { "total": 150, "successful": 80, "success_rate": "53.3%" }
}
...
```

### Generate Adjustments

```bash
node merge-learning-engine.js generate

# Output:
Generating confidence adjustments from feedback data...

Generated 8 adjustment rules from 1250 merges

[CONFIDENCE_BAND_ADJUSTMENT]
  Adjustment: +3%
  Reason: Historical success rate: 92.0% (500 merges)
  Confidence: MEDIUM

[GUARDRAIL_PATTERN_ADJUSTMENT]
  Adjustment: -10%
  Reason: Guardrails 'TYPE_1_DOMAIN_MISMATCH' have 65.0% success rate (80 merges)
  Confidence: LOW
...

✅ Adjustments saved to: confidence-adjustments.json
```

### Apply Adjustments

```bash
node merge-learning-engine.js apply decisions.json --adjustments confidence-adjustments.json

# Output:
Applying adjustments to 100 decisions...

Decision 001xx_001yy:
  Original: 85%
  Adjusted: 91%
  Change: +6%
  Rules applied: 2

Decision 001zz_001ww:
  Original: 68%
  Adjusted: 63%
  Change: -5%
  Rules applied: 1

✅ Applied adjustments to 45/100 decisions
Updated decisions saved to: decisions-adjusted.json
```

### Generate Learning Report

```bash
node merge-learning-engine.js report

# Output:
═══════════════════════════════════════════════════════════════════
MERGE LEARNING REPORT
═══════════════════════════════════════════════════════════════════
Total Rules Generated: 8
Sample Size: 1250 merges
Generated: 2025-10-16T20:30:00Z

───────────────────────────────────────────────────────────────────
ADJUSTMENT RULES
───────────────────────────────────────────────────────────────────
...

───────────────────────────────────────────────────────────────────
RECOMMENDATIONS
───────────────────────────────────────────────────────────────────
...

───────────────────────────────────────────────────────────────────
EXAMPLE APPLICATIONS
───────────────────────────────────────────────────────────────────
...

✅ Full report saved to: learning-report.json
```

## Integration with Dedup Workflow

### Complete Workflow

```
1. Analyze duplicate pairs → dedup-safety-engine.js
   ↓ (generates decisions)

2. Review and approve decisions → Manual review
   ↓ (approved decisions)

3. Execute merges → merge-executor.js
   ↓ (merge outcomes)

4. Collect feedback → merge-feedback-collector.js
   ↓ (feedback database updated)

5. Generate adjustments → merge-learning-engine.js
   ↓ (adjustment rules)

6. Apply to future decisions → dedup-safety-engine.js (with adjustments)
   ↓ (improved decision quality)

[Repeat cycle - continuous improvement]
```

### Example Integration Script

```javascript
// analyze-with-learning.js
const DedupSafetyEngine = require('./dedup-safety-engine');
const MergeLearningEngine = require('./merge-learning-engine');

(async () => {
    // Initialize engine
    const engine = new DedupSafetyEngine(orgAlias, backupDir, importanceReport);

    // Load learned adjustments
    const learningEngine = new MergeLearningEngine('./merge-feedback.json');
    const adjustments = learningEngine.loadAdjustments('./confidence-adjustments.json');

    // Analyze pairs with adjustments
    for (const pair of pairs) {
        const decision = await engine.analyzePair(pair.idA, pair.idB);

        // Apply learned adjustments
        const adjusted = learningEngine.applyAdjustments(decision, adjustments);
        decision.adjusted_confidence = adjusted.adjusted_confidence;
        decision.confidence_adjustment_details = adjusted;

        decisions.push(decision);
    }

    // Save decisions with adjusted confidence
    engine.saveResults('decisions-with-learning.json');
})();
```

## Performance Considerations

**Feedback Collection**:
- Cost: 1 file write per merge (~1ms)
- Storage: ~2 KB per merge record
- 10,000 merges: ~20 MB database

**Pattern Analysis**:
- Cost: O(n) where n = number of merges
- 10,000 merges: ~1-2 seconds to analyze

**Adjustment Generation**:
- Cost: O(n) pattern analysis + O(m) rule generation
- 10,000 merges, 10 rules: ~2-3 seconds

**Adjustment Application**:
- Cost: O(r × d) where r = rules, d = decisions
- 10 rules, 10,000 decisions: ~0.5-1 second

## Success Criteria

- ✅ Records merge outcomes automatically
- ✅ Calculates accuracy metrics by confidence band
- ✅ Identifies patterns in guardrails and conflicts
- ✅ Generates confidence adjustment rules
- ✅ Applies adjustments to future decisions
- ✅ Provides actionable recommendations
- ✅ CLI interface for all operations
- ✅ Persistent feedback database
- ✅ Example applications included
- ✅ Fully documented

## Known Limitations

1. **Requires historical data**: Needs 50+ merges per confidence band for reliable adjustments
2. **Manual integration**: Adjustments must be manually applied to decision workflow
3. **Static rules**: Rules don't update automatically (must regenerate periodically)
4. **No A/B testing**: Can't automatically test if adjustments improve accuracy
5. **Recommendation filtering**: Only applies at decision time, not post-execution

## Future Enhancements (Phase 3+)

1. **Automatic adjustment application**: Integrate directly into dedup-safety-engine
2. **A/B testing framework**: Test adjusted vs non-adjusted confidence in parallel
3. **Real-time learning**: Update rules as new feedback arrives
4. **Machine learning integration**: Use ML models for pattern detection
5. **Confidence calibration**: Automatically calibrate confidence scores to target accuracy
6. **Multi-org learning**: Learn patterns across multiple Salesforce orgs
7. **Feedback dashboard**: Web UI for visualizing metrics and patterns

---

**Last Updated**: 2025-10-16
**Implementation Complete**: Task 2.4 (Merge Feedback System)
**Phase 2 Status**: ✅ ALL TASKS COMPLETE
