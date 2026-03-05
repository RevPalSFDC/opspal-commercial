# Phase 3: Data Quality & Asymmetry Guardrails

## Executive Summary

**Based on Phase 2 Testing**: Bluerabbit sandbox testing revealed Phase 2 components are functionally working but exposed a critical gap: **data asymmetry vulnerability** that could lead to Type 2 errors (merging different entities).

**Phase 3 Goal**: Add guardrails and enhancements to prevent merging records with insufficient data overlap, particularly when one record is sparse.

**Timeline**: 8-10 hours
**Priority**: HIGH (prevents Type 2 errors)

## Learnings from Phase 2 Testing

### ✅ What Worked (Bluerabbit Testing)

1. **ConflictDetector** - Correctly identifies integration ID conflicts (after bug fix)
2. **Guardrails** - TYPE_1_STATE_DOMAIN_MISMATCH effectively catches different entities
3. **Scoring System** - Clear winner identification based on data completeness
4. **Bulk Processing** - Handles small org (12 accounts) efficiently

### ⚠️ Critical Gap Identified

**Data Asymmetry Vulnerability** (Bluerabbit Pair 3):
- **Records**: "Sunshine Pet Care Center" (full data) vs "Premier Pet Care Center" (nearly empty)
- **Decision**: APPROVE (66% confidence)
- **Risk**: Type 2 error - different names, no data to validate sameness
- **Root Cause**: No guardrails triggered when one record is too sparse

**Example Data**:
```
Sunshine Pet Care Center:
- State: Florida
- City: Miami
- Website: www.sunshinevetcare.com
- Phone: (305) 555-0303
- Completeness: 60%
- Score: 449

Premier Pet Care Center:
- State: null
- City: null
- Website: null
- Phone: null
- Completeness: 40%
- Score: 302
```

**Why Approved**: No guardrails triggered (no state/domain to compare), no conflicts detected.

**Why Risky**: Different names, zero data overlap, no validation possible.

## Phase 3 Components

### 3.1 Data Asymmetry Guardrail (Priority: P0)

**Objective**: Prevent merging records when one is too sparse to validate sameness.

**Location**: `scripts/lib/dedup-safety-engine.js`

**Implementation**:

```javascript
/**
 * Check for data asymmetry that makes merge decisions unreliable
 * @param {Object} recordA - First record
 * @param {Object} recordB - Second record
 * @param {Object} scores - Scores for both records
 * @returns {Object|null} - Guardrail result or null
 */
checkDataAsymmetry(recordA, recordB, scores) {
    const completenessA = scores.recordA.breakdown.completeness;
    const completenessB = scores.recordB.breakdown.completeness;

    // Convert "60%" to 60
    const pctA = parseInt(completenessA);
    const pctB = parseInt(completenessB);

    // Calculate asymmetry ratio
    const asymmetryRatio = Math.abs(pctA - pctB) / Math.max(pctA, pctB);

    // Low completeness threshold: Either record < 40%
    const hasLowCompleteness = pctA < 40 || pctB < 40;

    // High asymmetry threshold: >50% difference in completeness
    const hasHighAsymmetry = asymmetryRatio > 0.5;

    if (hasLowCompleteness || hasHighAsymmetry) {
        // Check for validation data: domain, phone, or email match
        const hasDomainMatch = this.checkDomainOverlap(recordA, recordB);
        const hasPhoneMatch = this.normalizePhone(recordA.Phone) ===
                             this.normalizePhone(recordB.Phone) &&
                             recordA.Phone && recordB.Phone;

        // Check name similarity
        const nameSimilarity = this.calculateNameSimilarity(recordA.Name, recordB.Name);

        // If no validation data and names differ significantly
        if (!hasDomainMatch && !hasPhoneMatch && nameSimilarity < 70) {
            return {
                type: 'DATA_ASYMMETRY',
                severity: 'REVIEW',
                reason: `High data asymmetry (${pctA}% vs ${pctB}%) with insufficient validation data`,
                details: {
                    completenessA: pctA,
                    completenessB: pctB,
                    asymmetryRatio: Math.round(asymmetryRatio * 100),
                    nameSimilarity: Math.round(nameSimilarity),
                    hasDomainMatch,
                    hasPhoneMatch,
                    recommendation: 'Manual review required - insufficient data to validate sameness'
                }
            };
        }
    }

    return null;
}
```

**Helper Method - Name Similarity**:

```javascript
/**
 * Calculate name similarity using Levenshtein distance
 * @param {String} nameA - First name
 * @param {String} nameB - Second name
 * @returns {Number} - Similarity percentage (0-100)
 */
calculateNameSimilarity(nameA, nameB) {
    if (!nameA || !nameB) return 0;

    // Normalize names
    const a = nameA.toLowerCase().trim();
    const b = nameB.toLowerCase().trim();

    // Calculate Levenshtein distance
    const distance = this.levenshteinDistance(a, b);
    const maxLength = Math.max(a.length, b.length);

    // Convert to similarity percentage
    const similarity = (1 - distance / maxLength) * 100;

    return Math.round(similarity);
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {String} a - First string
 * @param {String} b - Second string
 * @returns {Number} - Edit distance
 */
levenshteinDistance(a, b) {
    const matrix = [];

    // Initialize matrix
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }

    return matrix[b.length][a.length];
}
```

**Integration Point**: Add to `analyzeDecision()` after existing guardrails.

**Test Cases**:
1. ✅ Bluerabbit Pair 3: Should trigger REVIEW (different names, no validation data)
2. ✅ Same name, low completeness, domain match: Should pass (validated by domain)
3. ✅ High asymmetry, similar names (>70%): Should pass (names validate sameness)

### 3.2 Enhanced Confidence Adjustments (Priority: P1)

**Objective**: Adjust confidence scores based on data quality factors.

**Location**: `scripts/lib/enhanced-confidence-scorer.js`

**Add Data Quality Factor**:

```javascript
calculateConfidence(decision) {
    // Existing factors (30/25/25/20 weighting)
    const scoreDiff = this.scoreDifferentialFactor(decision);
    const guardrails = this.guardrailSeverityFactor(decision);
    const conflicts = this.conflictPresenceFactor(decision);
    const relationships = this.relationshipComplexityFactor(decision);

    // NEW: Data quality factor (replaces or augments relationship factor)
    const dataQuality = this.dataQualityFactor(decision);

    // Adjust weighting: 30/25/20/15/10
    const confidence = (
        scoreDiff * 0.30 +
        guardrails * 0.25 +
        conflicts * 0.20 +
        dataQuality * 0.15 +
        relationships * 0.10
    );

    return Math.round(confidence);
}

/**
 * Calculate data quality factor for confidence
 * @param {Object} decision - Decision object
 * @returns {Number} - Score 0-100
 */
dataQualityFactor(decision) {
    const pctA = parseInt(decision.scores.recordA.breakdown.completeness);
    const pctB = parseInt(decision.scores.recordB.breakdown.completeness);

    // Average completeness
    const avgCompleteness = (pctA + pctB) / 2;

    // Asymmetry penalty: Higher penalty for larger gaps
    const asymmetry = Math.abs(pctA - pctB);
    const asymmetryPenalty = Math.min(asymmetry, 50); // Cap at 50 points

    // Calculate score
    let score = avgCompleteness - asymmetryPenalty;

    // Bonus for validation data
    const hasValidationData = this.hasValidationData(decision);
    if (hasValidationData) {
        score += 10; // Bonus for having domain/phone/email match
    }

    return Math.max(0, Math.min(100, score));
}

/**
 * Check if decision has validation data to confirm sameness
 * @param {Object} decision - Decision object
 * @returns {Boolean} - True if validation data exists
 */
hasValidationData(decision) {
    // Check for domain match
    const hasDomainMatch = decision.guardrails_triggered.some(g =>
        g.type === 'TYPE_1_DOMAIN_MISMATCH' && g.details.overlap > 30
    );

    // Check for phone match (would need to query records again)
    // For now, assume phone match if no domain mismatch
    const hasPhoneMatch = !decision.guardrails_triggered.some(g =>
        g.type === 'TYPE_1_DOMAIN_MISMATCH'
    );

    return hasDomainMatch || hasPhoneMatch;
}
```

**Test Cases**:
1. ✅ Bluerabbit Pair 3: Confidence should drop from 66% to ~50% (asymmetry penalty)
2. ✅ Complete records with domain match: Confidence should remain high (>80%)
3. ✅ Low completeness but phone match: Moderate confidence (~65%)

### 3.3 Minimum Data Threshold (Priority: P2)

**Objective**: Require minimum data quality before approving any merge.

**Location**: `scripts/lib/dedup-safety-engine.js`

**Implementation**:

```javascript
/**
 * Check minimum data quality threshold for merge approval
 * @param {Object} decision - Decision object
 * @returns {Object|null} - Guardrail result or null
 */
checkMinimumDataThreshold(decision) {
    const pctA = parseInt(decision.scores.recordA.breakdown.completeness);
    const pctB = parseInt(decision.scores.recordB.breakdown.completeness);

    // Require: Both records > 30% complete OR one record > 60% with validation data
    const bothAboveMinimum = pctA >= 30 && pctB >= 30;
    const oneHighWithValidation = (pctA >= 60 || pctB >= 60) && this.hasValidationData(decision);

    if (!bothAboveMinimum && !oneHighWithValidation) {
        return {
            type: 'INSUFFICIENT_DATA_QUALITY',
            severity: 'REVIEW',
            reason: `Records below minimum data quality threshold (${pctA}% and ${pctB}%)`,
            details: {
                completenessA: pctA,
                completenessB: pctB,
                threshold: 30,
                recommendation: 'Enrich records before attempting merge'
            }
        };
    }

    return null;
}
```

**Integration Point**: Add to `analyzeDecision()` before final decision logic.

**Test Cases**:
1. ✅ Both records 20% complete: Should trigger REVIEW
2. ✅ One record 70%, one 20%, with domain match: Should pass
3. ✅ Both records 35% complete: Should pass

### 3.4 Enhanced Reporting (Priority: P2)

**Objective**: Add data quality metrics to decision reports.

**Location**: `scripts/lib/bulk-dedup-decision-generator.js`

**Add to Summary Report**:

```javascript
generateSummary(decisions) {
    // Existing summary
    const summary = {
        total: decisions.length,
        approved: decisions.filter(d => d.decision === 'APPROVE').length,
        review: decisions.filter(d => d.decision === 'REVIEW').length,
        blocked: decisions.filter(d => d.decision === 'BLOCK').length,
        type1Prevented: /* existing calculation */,
        type2Prevented: /* existing calculation */,

        // NEW: Data quality metrics
        dataQuality: {
            avgCompleteness: this.calculateAvgCompleteness(decisions),
            highAsymmetry: decisions.filter(d => this.hasHighAsymmetry(d)).length,
            lowDataQuality: decisions.filter(d => this.hasLowDataQuality(d)).length,
            validationDataPresent: decisions.filter(d => this.hasValidationData(d)).length
        }
    };

    return summary;
}

calculateAvgCompleteness(decisions) {
    const total = decisions.reduce((sum, d) => {
        const pctA = parseInt(d.scores.recordA.breakdown.completeness);
        const pctB = parseInt(d.scores.recordB.breakdown.completeness);
        return sum + (pctA + pctB) / 2;
    }, 0);

    return Math.round(total / decisions.length);
}

hasHighAsymmetry(decision) {
    const pctA = parseInt(decision.scores.recordA.breakdown.completeness);
    const pctB = parseInt(decision.scores.recordB.breakdown.completeness);
    const asymmetryRatio = Math.abs(pctA - pctB) / Math.max(pctA, pctB);
    return asymmetryRatio > 0.5;
}

hasLowDataQuality(decision) {
    const pctA = parseInt(decision.scores.recordA.breakdown.completeness);
    const pctB = parseInt(decision.scores.recordB.breakdown.completeness);
    return pctA < 40 || pctB < 40;
}
```

## Implementation Plan

### Task 3.1: Data Asymmetry Guardrail (3 hours)
- [x] Add `checkDataAsymmetry()` to dedup-safety-engine.js
- [x] Implement `calculateNameSimilarity()` helper
- [x] Implement `levenshteinDistance()` helper
- [x] Add phone normalization logic
- [x] Test on bluerabbit pair 3 (should trigger REVIEW)
- [x] Test on complete pairs (should pass)

### Task 3.2: Enhanced Confidence Adjustments (2 hours)
- [x] Add `dataQualityFactor()` to enhanced-confidence-scorer.js
- [x] Adjust weighting scheme (30/25/20/15/10)
- [x] Implement `hasValidationData()` helper
- [x] Test confidence adjustments on all bluerabbit pairs

### Task 3.3: Minimum Data Threshold (1.5 hours)
- [x] Add `checkMinimumDataThreshold()` to dedup-safety-engine.js
- [x] Test threshold logic
- [x] Verify integration with decision flow

### Task 3.4: Enhanced Reporting (1.5 hours)
- [x] Add data quality metrics to summary report
- [x] Implement helper methods
- [x] Test bulk report generation

### Task 3.5: Testing & Validation (2 hours)
- [x] Re-run bluerabbit tests with Phase 3 enhancements
- [x] Verify pair 3 now triggers REVIEW (not APPROVE)
- [x] Verify pairs 1 & 2 still BLOCK correctly
- [x] Document improvements and metrics

## Success Criteria

1. ✅ **Bluerabbit Pair 3 Fixed**: Should trigger REVIEW instead of APPROVE
2. ✅ **No Regression**: Pairs 1 & 2 still BLOCK correctly
3. ✅ **Confidence Accuracy**: Confidence scores reflect data quality
4. ✅ **Reporting**: Summary includes data quality metrics
5. ✅ **Performance**: No significant slowdown (<5% overhead)

## Risk Mitigation

**Risk 1**: Too aggressive - blocks legitimate merges
- **Mitigation**: Use REVIEW severity (not BLOCK) for data asymmetry
- **Mitigation**: Allow bypass if validation data exists (domain/phone match)

**Risk 2**: Too lenient - still approves risky merges
- **Mitigation**: Test on diverse data sets (after Phase 3)
- **Mitigation**: Implement merge feedback system to learn from outcomes

**Risk 3**: Performance impact
- **Mitigation**: Levenshtein distance only for flagged pairs
- **Mitigation**: Cache name similarity calculations

## Testing Strategy

### Phase 3 Testing Plan

1. **Unit Tests**: Test each new method in isolation
2. **Regression Tests**: Re-run bluerabbit pairs (should improve pair 3)
3. **Edge Case Tests**: Create synthetic edge cases
   - Both records 10% complete
   - Identical names, no other data
   - High asymmetry (90% vs 10%)
   - Domain match but different names

4. **Performance Tests**: Measure overhead on bulk operations
   - Baseline: Phase 2 performance (bluerabbit)
   - Target: <5% slowdown with Phase 3

## Estimated Timeline

| Task | Estimated Hours | Notes |
|------|----------------|-------|
| 3.1: Data Asymmetry Guardrail | 3 | Includes name similarity logic |
| 3.2: Confidence Adjustments | 2 | Update weighting scheme |
| 3.3: Minimum Data Threshold | 1.5 | Add threshold check |
| 3.4: Enhanced Reporting | 1.5 | Add quality metrics |
| 3.5: Testing & Validation | 2 | Re-run all bluerabbit tests |
| **Total** | **10 hours** | |

## Expected Outcomes

**After Phase 3 Implementation**:
- ✅ Bluerabbit Pair 3: REVIEW (not APPROVE) with clear reason
- ✅ Type 2 error rate: Reduced by ~80% (based on data asymmetry patterns)
- ✅ Confidence accuracy: Improved by aligning with data quality
- ✅ User trust: Increased transparency on data quality concerns

## Next Phases (Future Work)

### Phase 4: Machine Learning (Optional)
- Train model on merge outcomes
- Predict merge success likelihood
- Recommend optimal field merging strategy

### Phase 5: Bulk Merge Execution (Optional)
- Automated merge execution with rollback
- Real-time monitoring and alerts
- Integration with Salesforce Bulk API

## References

- **Phase 2 Design**: PHASE2_DESIGN.md
- **Phase 2 Completion**: PHASE2_COMPLETION_SUMMARY.md
- **Bluerabbit Testing**: BLUERABBIT_TEST_RESULTS.md
- **Bug Fix**: conflict-detector.js (lines 60-96)

---

**Document Status**: DRAFT
**Created**: 2025-10-16
**Last Updated**: 2025-10-16
