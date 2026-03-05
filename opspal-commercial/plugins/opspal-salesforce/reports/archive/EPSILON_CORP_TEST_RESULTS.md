# epsilon-corp Sandbox Testing Results - Phase 2

## Test Environment
- **Org**: epsilon-corp2021-revpal
- **Total Accounts**: 12 veterinary clinics
- **Backup**: 2025-10-16-18-12-02
- **Test Date**: 2025-10-16
- **Test Pairs**: 3 manually selected pairs

## Test Results Summary

| Pair | Record A | Record B | Decision | Correct? | Notes |
|------|----------|----------|----------|----------|-------|
| 1 | Downtown Veterinary Clinic (WA) | Paws & Claws Animal Hospital (TX) | BLOCK | ✅ Yes | Different entities, different states |
| 2 | Riverside Animal Clinic | Garden State Veterinary Group | BLOCK | ✅ Yes | Different entities, different states |
| 3 | Sunshine Pet Care Center (FL) | Premier Pet Care Center (no data) | APPROVE | ⚠️ Uncertain | Potential Type 2 error - data asymmetry |

## Detailed Analysis

### Pair 1: Downtown vs Paws & Claws ✅ CORRECT BLOCK
**Decision**: BLOCK (TYPE_1_STATE_DOMAIN_MISMATCH)

**Data**:
- Downtown: WASHINGTON state, www.downtownvetclinic.com
- Paws & Claws: TEXAS state, www.pawsandclaws.com

**Guardrails Triggered**:
- TYPE_1_DOMAIN_MISMATCH (0% domain overlap)
- TYPE_1_STATE_DOMAIN_MISMATCH (different states + different domains)

**Conflicts Detected**: 0 (after bug fix)

**Verdict**: ✅ **Correctly blocked** - These are genuinely different veterinary clinics in different states.

**Bug Found & Fixed**: ConflictDetector was initially flagging UUID and Salesforce ID fields as BLOCK-level conflicts. Fixed by adding exclusion patterns to match existing guardrail logic.

### Pair 2: Riverside vs Garden State ✅ CORRECT BLOCK
**Decision**: BLOCK (TYPE_1_STATE_DOMAIN_MISMATCH)

**Guardrails Triggered**:
- TYPE_1_DOMAIN_MISMATCH
- TYPE_1_STATE_DOMAIN_MISMATCH

**Conflicts Detected**: 0

**Verdict**: ✅ **Correctly blocked** - Different entities in different states.

### Pair 3: Sunshine vs Premier ⚠️ POTENTIAL TYPE 2 ERROR
**Decision**: APPROVE (66% confidence)

**Data**:
```
Sunshine Pet Care Center (001VG00000aGMpRYAW):
- State: Florida
- City: Miami
- Website: www.sunshinevetcare.com
- Phone: (305) 555-0303
- Score: 449 (2 contacts, 0 opps)

Premier Pet Care Center (001VG00000cBSxXYAW):
- State: null
- City: null
- Website: null
- Phone: null
- Score: 302 (1 contact, 0 opps)
```

**Guardrails Triggered**: 0 (no data to compare!)

**Conflicts Detected**: 0

**Verdict**: ⚠️ **Uncertain - Potential Type 2 Error**

**Why Approved**:
- No guardrails triggered (Record B has no state/domain to compare)
- No conflicts detected (no integration ID mismatches)
- Clear winner based on data completeness

**Why It's Risky**:
- **Different names**: "Sunshine" vs "Premier" - not similar enough
- **Zero data overlap**: Can't validate they're the same business
- **Data asymmetry**: One record is essentially a shell with minimal data

**Critical Learning**: The system is vulnerable to approving merges when one record is too sparse to trigger guardrails.

## Key Findings

### ✅ What Worked Well

1. **ConflictDetector Integration**:
   - Successfully detects integration ID conflicts
   - Properly excludes UUID/Salesforce ID fields (after bug fix)
   - Works seamlessly with guardrails

2. **Guardrail System**:
   - TYPE_1_STATE_DOMAIN_MISMATCH effectively catches different entities
   - Domain overlap checking works well
   - State mismatch detection is reliable

3. **Scoring System**:
   - Clear winner identification (relationship score, data completeness)
   - Scores properly weighted across factors

### ⚠️ Issues Discovered

1. **Bug: ConflictDetector False Positives** (**FIXED**)
   - **Problem**: UUID and Salesforce ID fields flagged as BLOCK-level conflicts
   - **Root Cause**: Missing exclusion patterns for fields that SHOULD differ
   - **Fix**: Added exclusion patterns to `detectIntegrationIdConflicts()`
   - **Status**: ✅ Fixed and verified

2. **Critical Gap: Data Asymmetry Vulnerability** (**NEW**)
   - **Problem**: System approves merges when one record is too sparse
   - **Risk**: Type 2 errors (merging different entities)
   - **Example**: Pair 3 - different names, no data to validate sameness
   - **Status**: 🔴 Needs Phase 3 guardrail

### 📋 Recommendations for Phase 3

1. **Add Data Asymmetry Guardrail**:
   - Detect when one record has <30% data completeness
   - Require minimum data overlap for approval (e.g., domain OR phone match)
   - Escalate to REVIEW if names differ and no validation data exists

   ```javascript
   // Proposed guardrail
   if (completenessA < 30 || completenessB < 30) {
       if (!hasDomainMatch && !hasPhoneMatch && namesSimilarity < 70) {
           return { type: 'DATA_ASYMMETRY', severity: 'REVIEW' };
       }
   }
   ```

2. **Enhance Name Similarity Checking**:
   - Current: Basic string comparison
   - Proposed: Fuzzy matching with threshold (e.g., 70% similarity required)
   - Consider: Soundex or Levenshtein distance for names

3. **Improve Confidence Scoring**:
   - Factor in data completeness balance
   - Penalize high asymmetry (e.g., 449 vs 302 with no overlap data)
   - Lower confidence when validation fields are missing

## Testing Metrics

- **Total Pairs Tested**: 3
- **Correct Blocks**: 2 (100% of blocking decisions)
- **Uncertain Approvals**: 1 (33% of test pairs)
- **Bugs Found**: 1 (ConflictDetector exclusion patterns)
- **Bugs Fixed**: 1 (100% fixed)

## Code Changes Made During Testing

**File**: `scripts/lib/conflict-detector.js` (Lines 60-96)

**Change**: Added exclusion patterns to prevent false positive conflicts on UUID/Salesforce ID fields

```javascript
const excludePatterns = [
    /uuid/i,                    // UUID fields
    /guid/i,                    // GUID fields
    /salesforce/i,              // Salesforce ID copies
    /^id$/i,                    // Standard Id field
    /recordid/i,                // RecordId fields
    /^full.*id/i                // Full_Salesforce_Id pattern
];
```

**Rationale**: These fields are expected to differ between duplicate records and should not be flagged as conflicts. This matches the logic already present in `checkIntegrationIdConflict` guardrail.

## Next Steps

1. ✅ **Complete epsilon-corp testing** (DONE)
2. ⏳ **Test on acme-corp sandbox** (37,466 accounts) - Pending
3. ⏳ **Test on delta-corp sandbox** (10k+ accounts) - Pending
4. ⏳ **Document all learnings for Phase 3** - In progress

## Conclusion

Phase 2 implementation is **functionally working** on epsilon-corp sandbox with **one critical gap identified**:

- **Guardrails and conflict detection**: Working correctly after bug fix
- **Data asymmetry vulnerability**: Needs Phase 3 guardrail to prevent Type 2 errors
- **Scoring and survivor selection**: Working well

The system correctly blocked 2/3 pairs (100% of blocking decisions), but approved 1 uncertain pair due to data sparsity. This is a valuable finding that will inform Phase 3 design.

**Recommendation**: Proceed with acme-corp and delta-corp testing to gather more data on edge cases, then design Phase 3 with data asymmetry guardrail as a priority.
