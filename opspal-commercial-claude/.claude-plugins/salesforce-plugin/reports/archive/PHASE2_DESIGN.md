# Phase 2: Advanced Decision Engine - Design Document

**Implementation Date**: 2025-10-16
**Status**: 🚧 IN PROGRESS
**Estimated Effort**: 12 hours

## Overview

Phase 2 enhances the dedup-safety-engine with advanced scoring, conflict detection, and bulk processing capabilities. This phase focuses on improving decision quality and processing speed for large-scale dedupe operations.

## Current State Analysis

### Existing Scoring System (from dedup-safety-engine.js:175-238)

**Survivor Score Formula**:
```
score = (contacts + opps) * 100                    // Relationship score
      + statusScore (+200/-50)                      // Status score
      + clamp((ARR + MRR*12 + ACV + TCV)/1000)     // Revenue score
      + 150 (if integration ID)                     // Integration ID bonus
      + websiteScore (+50/-200)                     // Website quality
      + nameBlankPenalty (-500)                     // Name blank penalty
      + completenessScore                           // Data completeness
      + recentActivityScore                         // Recent activity
```

**Confidence Calculation** (lines 462-475):
```javascript
calculateConfidence(decision) {
    const maxScore = Math.max(scoreA, scoreB);
    const minScore = Math.min(scoreA, scoreB);
    const ratio = minScore / maxScore;
    const confidence = 50 + ((1 - ratio) * 50);  // Returns 50-100%
    return Math.round(confidence);
}
```

**Limitations**:
1. Confidence only based on score ratio, not data quality
2. No detection of conflicting integration IDs across fields
3. No relationship conflict detection (competing ownership)
4. Manual pair-by-pair processing only
5. No feedback mechanism from merge results

## Phase 2 Enhancements

### 1. Enhanced Confidence Scoring (0-100 scale)

**Goal**: Multi-factor confidence score incorporating data quality, guardrail signals, and statistical factors.

**New Formula**:
```
confidence = base_confidence (30%)
           + data_quality (25%)
           + guardrail_confidence (25%)
           + score_separation (20%)
```

**Components**:

**A. Base Confidence (30 points)**:
- Both records have Name: +10
- Both records have integration ID: +10
- Both records have relationships: +10

**B. Data Quality Score (25 points)**:
- Field completeness average: 0-10 points
- No blank critical fields: +5
- Website validity: +5
- Address completeness: +5

**C. Guardrail Confidence (25 points)**:
- No guardrails triggered: +25
- Only REVIEW guardrails: +15
- BLOCK guardrails present: 0

**D. Score Separation (20 points)**:
- Winner score > loser by 50%+: +20
- Winner score > loser by 25-50%: +15
- Winner score > loser by 10-25%: +10
- Winner score > loser by <10%: +5

**Output Categories**:
- 90-100%: **Very High** - Auto-approve safe
- 75-89%: **High** - Approve with quick review
- 60-74%: **Medium** - Review recommended
- 40-59%: **Low** - Manual review required
- 0-39%: **Very Low** - Block or extensive investigation

### 2. Conflict Detection System

**Goal**: Detect and prevent merges where records have conflicting data that indicates separate entities.

**A. Integration ID Conflict Matrix**:

Current implementation checks for different values in the SAME field. New enhancement:

**Cross-Field Conflict Detection**:
```javascript
{
    "conflicts": [
        {
            "type": "CROSS_FIELD_CONFLICT",
            "recordA_field": "ERP_Customer_ID__c",
            "recordA_value": "CUST-12345",
            "recordB_field": "Billing_System_ID__c",
            "recordB_value": "BILL-67890",
            "severity": "WARN",  // Same system, different IDs
            "reason": "Both records have IDs from billing system but values differ"
        }
    ]
}
```

**Conflict Types**:
1. **Same-Field Conflict**: Both have value A vs value B in same field (existing)
2. **Cross-Field Conflict**: Both have IDs from same external system in different fields
3. **Missing-Match Conflict**: One has ID, other doesn't (suspicious if both should have)

**B. Relationship Conflict Detection**:

**Competing Ownership**:
- Contacts associated with both accounts but different primary contacts
- Opportunities with different account owners
- Cases with conflicting support relationships

**Relationship Patterns**:
```javascript
{
    "relationship_conflicts": [
        {
            "type": "COMPETING_CONTACTS",
            "recordA_contacts": ["001xx", "001yy"],
            "recordB_contacts": ["001zz", "001ww"],
            "overlap": 0,  // No shared contacts
            "severity": "BLOCK",
            "reason": "No shared contacts suggests separate customer bases"
        },
        {
            "type": "OPPORTUNITY_OWNER_MISMATCH",
            "recordA_owner": "User A",
            "recordB_owner": "User B",
            "severity": "REVIEW",
            "reason": "Different opportunity owners may indicate different accounts"
        }
    ]
}
```

### 3. Bulk Decision Generator

**Goal**: Process thousands of duplicate pairs efficiently with parallel processing and progress tracking.

**Architecture**:

**A. Batch Processing**:
```javascript
class BulkDecisionGenerator extends DedupSafetyEngine {
    constructor(orgAlias, backupDir, importanceReport, config, bulkHandler) {
        super(orgAlias, backupDir, importanceReport, config, bulkHandler);
        this.batchSize = config.batchSize || 100;
        this.concurrency = config.concurrency || 5;
        this.progressTracker = new ProgressTracker();
    }

    async processBulk(pairsArray) {
        // Split into batches
        const batches = this.createBatches(pairsArray, this.batchSize);

        // Process with concurrency control
        for (let i = 0; i < batches.length; i += this.concurrency) {
            const batchPromises = batches
                .slice(i, i + this.concurrency)
                .map(batch => this.processBatch(batch));

            await Promise.all(batchPromises);
            this.progressTracker.update(i + this.concurrency);
        }
    }

    async processBatch(pairs) {
        // Preload all records in batch with single query
        const allIds = pairs.flatMap(p => [p.idA, p.idB]);
        await this.preloadRecords(allIds);

        // Analyze all pairs in batch
        return Promise.all(pairs.map(p => this.analyzePair(p.idA, p.idB)));
    }
}
```

**B. Record Preloading**:
- Fetch all records in batch with single SOQL query
- Cache in memory for fast pair analysis
- Reduces API calls from 2N to 1 per batch

**C. Progress Tracking**:
```javascript
{
    "total_pairs": 10000,
    "processed": 2500,
    "remaining": 7500,
    "elapsed": "00:15:30",
    "eta": "00:45:00",
    "rate": "2.7 pairs/sec",
    "decisions": {
        "approved": 1800,
        "review": 500,
        "blocked": 200
    }
}
```

**D. Checkpoint & Resume**:
- Save progress every N batches
- Resume from checkpoint on interruption
- Useful for 50k+ pair operations that take hours

### 4. Merge Result Feedback Mechanism

**Goal**: Learn from merge outcomes to improve future decision quality.

**A. Feedback Collection**:

**Post-Merge Metadata**:
```json
{
    "merge_id": "merge_2025-10-16_12345",
    "pair_id": "001xx_001yy",
    "executed_at": "2025-10-16T18:30:00Z",
    "survivor": "001xx",
    "deleted": "001yy",
    "original_confidence": 85,
    "outcome": "SUCCESS",
    "feedback": {
        "data_loss": false,
        "rollback_required": false,
        "user_correction": false,
        "actual_confidence": 90
    },
    "metrics": {
        "contacts_transferred": 15,
        "opportunities_transferred": 3,
        "fields_merged": 42,
        "conflicts_encountered": 0
    }
}
```

**Feedback Sources**:
1. **Automatic**: Merge API response (success/error)
2. **User-Reported**: Manual feedback after merge
3. **System-Detected**: Rollback operations, data quality checks

**B. Learning Model**:

**Confidence Adjustment**:
```javascript
{
    "learning": {
        "original_prediction": {
            "confidence": 85,
            "decision": "APPROVE"
        },
        "actual_outcome": {
            "success": true,
            "confidence_adjustment": +5  // Increase by 5%
        },
        "pattern_learned": {
            "when_conditions": [
                "both_have_integration_ids",
                "score_separation > 30%",
                "no_guardrails_triggered"
            ],
            "then_confidence": "increase by 5%"
        }
    }
}
```

**Pattern Recognition**:
- Track which factor combinations correlate with merge success
- Adjust confidence weights based on historical outcomes
- Identify high-risk patterns (e.g., "always fails when X and Y both true")

**C. Feedback Reports**:

**Accuracy Metrics**:
```
Merge Success Rate by Confidence:
- 90-100% confidence: 98% success (196/200 merges)
- 75-89% confidence: 92% success (460/500 merges)
- 60-74% confidence: 78% success (390/500 merges)
- <60% confidence: 45% success (90/200 merges)

Recommendation: Adjust confidence thresholds or scoring weights
```

## Implementation Tasks

### Task 2.1: Enhanced Confidence Scoring (3 hours)

**Files to Modify**:
- `dedup-safety-engine.js` - Add `calculateEnhancedConfidence()` method

**New Methods**:
```javascript
calculateEnhancedConfidence(decision) {
    const base = this.calculateBaseConfidence(decision);
    const dataQuality = this.calculateDataQualityScore(decision);
    const guardrails = this.calculateGuardrailConfidence(decision);
    const separation = this.calculateScoreSeparation(decision);

    const total = base + dataQuality + guardrails + separation;

    return {
        total: Math.round(total),
        breakdown: { base, dataQuality, guardrails, separation },
        category: this.getConfidenceCategory(total)
    };
}

calculateBaseConfidence(decision) { /* ... */ }
calculateDataQualityScore(decision) { /* ... */ }
calculateGuardrailConfidence(decision) { /* ... */ }
calculateScoreSeparation(decision) { /* ... */ }
getConfidenceCategory(score) { /* ... */ }
```

**Test Cases**:
- Perfect match (both complete, no guardrails): 95%+ confidence
- Good match (mostly complete, no BLOCK): 80%+ confidence
- Uncertain match (incomplete, REVIEW guardrails): 60-75% confidence
- Poor match (many conflicts, BLOCK guardrails): <50% confidence

### Task 2.2: Conflict Detection (3 hours)

**Files to Create**:
- `conflict-detector.js` - Standalone conflict detection module

**New Class**:
```javascript
class ConflictDetector {
    constructor(integrationIds, relationships) {
        this.integrationIds = integrationIds;
        this.relationships = relationships;
    }

    detectIntegrationIdConflicts(recordA, recordB) { /* ... */ }
    detectCrossFieldConflicts(recordA, recordB) { /* ... */ }
    detectRelationshipConflicts(idA, idB) { /* ... */ }
    detectCompetingOwnership(idA, idB) { /* ... */ }
}
```

**Integration**:
- Call from `analyzePair()` after guardrails
- Add conflicts to decision object
- Adjust confidence based on conflict severity

### Task 2.3: Bulk Decision Generator (4 hours)

**Files to Create**:
- `bulk-decision-generator.js` - Bulk processing engine

**Features**:
- Batch loading of records (reduce API calls 2N → 1)
- Parallel processing with concurrency control
- Progress tracking with ETA
- Checkpoint and resume capability
- Memory-efficient streaming for 50k+ pairs

**CLI Interface**:
```bash
node bulk-decision-generator.js process \
    peregrine-main \
    duplicate-pairs.csv \
    --batch-size 500 \
    --concurrency 10 \
    --checkpoint-interval 1000 \
    --output decisions.json
```

### Task 2.4: Merge Feedback System (2 hours)

**Files to Create**:
- `merge-feedback-collector.js` - Collect feedback from merge operations
- `merge-learning-engine.js` - Analyze feedback and adjust scoring

**Workflow**:
1. Execute merge with merge-executor.js
2. Collect outcome metadata automatically
3. Store in feedback database (JSON or Supabase)
4. Periodically analyze patterns
5. Generate confidence adjustment recommendations

**Feedback Schema**:
```json
{
    "merge_id": "string",
    "pair_id": "string",
    "timestamp": "ISO8601",
    "original_decision": { /* full decision object */ },
    "outcome": "SUCCESS|ERROR|ROLLBACK",
    "metrics": { /* transfer counts */ },
    "feedback": { /* user/system feedback */ }
}
```

## Testing Strategy

### Test Data Sets

**Small Org** (bluerabbit2021-revpal - 12 records):
- Test confidence scoring edge cases
- Validate conflict detection logic
- Quick iteration on algorithm changes

**Medium Org** (peregrine-main - 37,466 records):
- Test bulk processing performance
- Validate batch loading efficiency
- Measure throughput (pairs/sec)

**Large Org** (rentable-sandbox - 10k+ records):
- Test checkpoint/resume functionality
- Validate memory management
- Measure end-to-end processing time

### Success Metrics

| Metric | Target | Measured |
|--------|--------|----------|
| Confidence accuracy | 90%+ | TBD |
| Bulk processing speed | 10+ pairs/sec | TBD |
| Memory usage (50k pairs) | <2GB | TBD |
| API call reduction | 50%+ fewer calls | TBD |
| Conflict detection rate | 95%+ true positives | TBD |

## Backward Compatibility

All enhancements maintain full backward compatibility:

✅ Existing `calculateConfidence()` remains unchanged (basic mode)
✅ New `calculateEnhancedConfidence()` is opt-in
✅ CLI interface remains compatible
✅ Decision object schema is extended, not changed

## Dependencies

**Required**:
- Phase 1 complete (BulkAPIHandler integration)
- Working dedup-safety-engine.js
- Backup and importance detection working

**Optional**:
- Supabase for feedback storage (can use JSON files)
- Machine learning libraries for pattern recognition (future)

## Risk Mitigation

**Performance Risk**: Bulk processing too slow
- **Mitigation**: Implement batch preloading, measure throughput early
- **Fallback**: Reduce batch size, increase checkpointing

**Accuracy Risk**: Enhanced confidence reduces accuracy
- **Mitigation**: A/B test against existing confidence for 1000+ pairs
- **Fallback**: Make enhanced confidence opt-in, keep basic as default

**Memory Risk**: Large datasets cause OOM errors
- **Mitigation**: Streaming processing, checkpoint frequently
- **Fallback**: Reduce batch size, split into multiple runs

## Next Steps After Phase 2

### Phase 3: Production Optimization
- Connection pooling for Bulk API
- Circuit breaker pattern for failures
- Automatic retry with exponential backoff
- Real-time monitoring dashboard
- Automated quality reports

---

**Last Updated**: 2025-10-16
**Author**: Claude Code
**Status**: Design Complete - Ready for Implementation
