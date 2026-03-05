# Phase 3 - Testing and Validation Plan

**Phase**: Phase 3 (Testing)
**Agent**: sfdc-metadata-manager
**Duration**: 1 week (7 days)
**Status**: 🚀 Starting
**Start Date**: 2025-10-30

---

## Executive Summary

Phase 3 validates the progressive disclosure implementation for sfdc-metadata-manager by testing keyword detection accuracy, context loading performance, and real-world token savings. This phase ensures the optimization delivers the projected benefits without breaking functionality.

**Primary Goals**:
1. Validate keyword detection algorithm (target: >90% accuracy)
2. Measure context loading performance (target: <200ms)
3. Confirm token savings in practice (target: >50% weighted average)
4. Ensure no broken references or missing content
5. Test all 10 scenarios from keyword-mapping.json

---

## Phase 3 Timeline

### Week 3 Schedule

**Days 1-2: Testing Infrastructure** (Oct 30-31)
- Create progressive disclosure test harness
- Implement keyword detection testing framework
- Set up context loading measurement tools
- Create test data and mock messages

**Days 3-4: Scenario Testing** (Nov 1-2)
- Run 10 test scenarios from keyword-mapping.json
- Validate keyword detection accuracy
- Measure context loading performance
- Document pass/fail for each scenario

**Day 5: Real-World Validation** (Nov 3)
- Test with actual user messages
- Validate token savings in practice
- Identify any missing context triggers
- Test edge cases and boundary conditions

**Days 6-7: Documentation and Reporting** (Nov 4-5)
- Document test results
- Create final Phase 3 report
- Update project documentation
- Prepare Phase 2 completion report (combining Weeks 2-3)

---

## Testing Approach

### 1. Keyword Detection Testing

**Objective**: Validate that the keyword scoring algorithm correctly identifies which contexts to load.

**Algorithm to Test**:
```
score = (keywordMatches × 1 + intentPatternMatches × 2) × priorityWeight

Where:
- keywordMatches: Number of keywords found in user message
- intentPatternMatches: Number of regex patterns matched
- priorityWeight: high=3, medium=2, low=1
```

**Test Methodology**:
1. Create test messages for each scenario
2. Run keyword detection algorithm
3. Calculate expected contexts based on algorithm
4. Compare expected vs actual context recommendations
5. Measure accuracy as: (correct contexts / total contexts) × 100

**Success Criteria**:
- Accuracy > 90% across all scenarios
- No false negatives (missing required contexts)
- Acceptable false positives (loading extra contexts is better than missing)

---

### 2. Context Loading Performance Testing

**Objective**: Measure the time required to load contexts and inject them into the agent.

**Metrics to Measure**:
- Time to detect keywords (ms)
- Time to read context file (ms)
- Time to format context for injection (ms)
- Total context loading time (ms)
- Token count of loaded contexts

**Test Methodology**:
1. Simulate context loading for each scenario
2. Measure each step with high-resolution timers
3. Calculate average, min, max, and p95 times
4. Compare against 200ms target

**Success Criteria**:
- Average loading time < 200ms
- p95 loading time < 500ms
- No single context > 1000ms

---

### 3. Token Savings Measurement

**Objective**: Validate actual token savings match projections.

**Scenarios to Test**:
1. **No Context Loading** (50% of queries)
   - Simple questions that don't require detailed contexts
   - Expected: 60.4% savings

2. **Light Context Loading** (35% of queries)
   - 1-2 contexts loaded
   - Expected: 44-52% savings

3. **Heavy Context Loading** (15% of queries)
   - 3-4 contexts loaded
   - Expected: 28-36% savings

**Test Methodology**:
1. For each scenario, calculate tokens:
   - Base agent tokens (new)
   - Context tokens (if loaded)
   - Total tokens
2. Compare to original base agent tokens (24,840)
3. Calculate savings percentage
4. Compute weighted average based on query distribution

**Success Criteria**:
- Weighted average savings > 50%
- No scenario exceeds original base agent size
- Savings match projections within ±5%

---

## Test Scenarios (From keyword-mapping.json)

### Scenario 1: Flow Deployment
**Prompt**: "Deploy a new flow for Opportunity validation"
**Expected Contexts**: [flow-management-framework]
**Expected Score**: ≥6
**Priority**: High

**Test Steps**:
1. Run keyword detection on prompt
2. Verify flow-management-framework is recommended
3. Verify score ≥6
4. Load context and measure tokens
5. Validate no broken references

---

### Scenario 2: Field with FLS
**Prompt**: "Create custom field Revenue_Tier__c on Account with FLS permissions"
**Expected Contexts**: [fls-field-deployment]
**Expected Score**: ≥9
**Priority**: High

**Test Steps**:
1. Run keyword detection on prompt
2. Verify fls-field-deployment is recommended
3. Verify score ≥9
4. Load context and measure tokens
5. Validate atomic deployment pattern is present

---

### Scenario 3: Picklist Modification
**Prompt**: "Add new values to Industry picklist on Account with record type mapping"
**Expected Contexts**: [picklist-modification-protocol, picklist-dependency-deployment]
**Expected Score**: ≥6 per context
**Priority**: High

**Test Steps**:
1. Run keyword detection on prompt
2. Verify both picklist contexts recommended
3. Verify combined score indicates high relevance
4. Load contexts and measure tokens
5. Validate coupling between contexts

---

### Scenario 4: Master-Detail Creation
**Prompt**: "Create master-detail relationship from OpportunityLineItem to Opportunity"
**Expected Contexts**: [master-detail-relationship, fls-field-deployment]
**Expected Score**: ≥9
**Priority**: High

**Test Steps**:
1. Run keyword detection on prompt
2. Verify both contexts recommended
3. Verify master-detail context scores highest
4. Load contexts and measure tokens
5. Validate propagation protocol is present

---

### Scenario 5: Bulk Field Deployment
**Prompt**: "Deploy 15 custom fields across multiple objects"
**Expected Contexts**: [bulk-operations, fls-field-deployment]
**Expected Score**: ≥6
**Priority**: Medium

**Test Steps**:
1. Run keyword detection on prompt
2. Verify bulk-operations is recommended
3. Verify fls-field-deployment is also suggested
4. Load contexts and measure tokens
5. Validate parallel processing patterns present

---

### Scenario 6: Dependent Picklist Setup
**Prompt**: "Create dependent picklist where Product_Category__c controls Product_Type__c"
**Expected Contexts**: [picklist-dependency-deployment, picklist-modification-protocol]
**Expected Score**: ≥12 (combined)
**Priority**: High

**Test Steps**:
1. Run keyword detection on prompt
2. Verify both picklist contexts recommended
3. Verify combined score ≥12
4. Load contexts and measure tokens
5. Validate 7-step deployment playbook present

---

### Scenario 7: Field Verification
**Prompt**: "Verify all fields deployed correctly with FLS permissions"
**Expected Contexts**: [field-verification-protocol]
**Expected Score**: ≥6
**Priority**: Medium

**Test Steps**:
1. Run keyword detection on prompt
2. Verify field-verification-protocol recommended
3. Verify score ≥6
4. Load context and measure tokens
5. Validate 4-phase validation framework present

---

### Scenario 8: Runbook Loading
**Prompt**: "Load operational runbook for gamma-corp org"
**Expected Contexts**: [runbook-context-loading]
**Expected Score**: ≥6
**Priority**: Medium

**Test Steps**:
1. Run keyword detection on prompt
2. Verify runbook-context-loading recommended
3. Verify score ≥6
4. Load context and measure tokens
5. Validate org-specific loading logic present

---

### Scenario 9: Common Task Example
**Prompt**: "Show me an example of deploying a custom object with fields"
**Expected Contexts**: [common-tasks-reference]
**Expected Score**: ≥4
**Priority**: Low

**Test Steps**:
1. Run keyword detection on prompt
2. Verify common-tasks-reference recommended
3. Verify score ≥4
4. Load context and measure tokens
5. Validate walkthroughs are present

---

### Scenario 10: Simple Metadata Query
**Prompt**: "Describe the Account object metadata"
**Expected Contexts**: [] (none - base agent only)
**Expected Score**: 0 (no contexts needed)
**Priority**: N/A

**Test Steps**:
1. Run keyword detection on prompt
2. Verify NO contexts recommended
3. Verify score remains low
4. Validate base agent can handle query alone
5. Confirm token savings are maximum (60.4%)

---

## Edge Case Testing

### Edge Case 1: Ambiguous Keywords
**Prompt**: "How do I deploy?"
**Challenge**: Generic "deploy" keyword matches multiple contexts
**Expected Behavior**: Load most relevant contexts based on priority and intent patterns

### Edge Case 2: Multiple High-Priority Contexts
**Prompt**: "Create a flow that modifies picklist values on master-detail relationships"
**Challenge**: Triggers 3-4 high-priority contexts
**Expected Behavior**: Load all relevant contexts, measure token impact

### Edge Case 3: Misspelled Keywords
**Prompt**: "Deploy a flo for opportuntiy validation"
**Challenge**: Typos may prevent keyword matching
**Expected Behavior**: Intent patterns should still trigger context loading

### Edge Case 4: Context Reference Chains
**Prompt**: "Verify field deployment with FLS"
**Challenge**: Triggers coupled contexts (Context 3 → Context 7)
**Expected Behavior**: Load both coupled contexts automatically

---

## Test Infrastructure

### Required Components

**1. Keyword Detection Simulator**
```javascript
// Simulates keyword detection algorithm
class KeywordDetectionSimulator {
    constructor(keywordMapping) {
        this.mapping = keywordMapping;
    }

    detectContexts(userMessage) {
        const scores = [];
        for (const context of this.mapping.contexts) {
            const score = this.calculateScore(userMessage, context);
            if (score > 0) {
                scores.push({ contextName: context.contextName, score });
            }
        }
        return scores.sort((a, b) => b.score - a.score);
    }

    calculateScore(message, context) {
        let keywordMatches = 0;
        let intentMatches = 0;

        // Count keyword matches
        for (const keyword of context.keywords) {
            if (message.toLowerCase().includes(keyword.toLowerCase())) {
                keywordMatches++;
            }
        }

        // Count intent pattern matches
        for (const pattern of context.intentPatterns) {
            if (new RegExp(pattern, 'i').test(message)) {
                intentMatches++;
            }
        }

        // Calculate weighted score
        const priorityWeight = context.priority === 'high' ? 3 :
                             context.priority === 'medium' ? 2 : 1;

        return (keywordMatches * 1 + intentMatches * 2) * priorityWeight;
    }
}
```

**2. Context Loader**
```javascript
// Simulates context loading and token counting
class ContextLoader {
    async loadContext(contextName) {
        const start = performance.now();

        const contextPath = `contexts/metadata-manager/${contextName}.md`;
        const content = await fs.readFile(contextPath, 'utf8');
        const tokens = this.countTokens(content);

        const elapsed = performance.now() - start;

        return { contextName, content, tokens, loadTime: elapsed };
    }

    countTokens(text) {
        // Approximate: 1 token ≈ 4 characters
        return Math.ceil(text.length / 4);
    }
}
```

**3. Test Runner**
```javascript
// Orchestrates test execution
class ProgressiveDisclosureTestRunner {
    async runAllTests() {
        const results = [];

        for (const scenario of testScenarios) {
            const result = await this.runScenario(scenario);
            results.push(result);
        }

        return this.generateReport(results);
    }

    async runScenario(scenario) {
        // Detect contexts
        const detectedContexts = detector.detectContexts(scenario.prompt);

        // Validate detection
        const correctDetection = this.validateDetection(
            detectedContexts,
            scenario.expectedContexts
        );

        // Load contexts and measure
        const loadedContexts = [];
        for (const ctx of detectedContexts) {
            const loaded = await loader.loadContext(ctx.contextName);
            loadedContexts.push(loaded);
        }

        // Calculate metrics
        return {
            scenario: scenario.name,
            correct: correctDetection,
            contextsLoaded: loadedContexts.length,
            totalTokens: this.sumTokens(loadedContexts),
            avgLoadTime: this.avgLoadTime(loadedContexts)
        };
    }
}
```

---

## Success Criteria Summary

| Criterion | Target | Measurement Method |
|-----------|--------|-------------------|
| Keyword detection accuracy | >90% | (Correct / Total) × 100 |
| Context loading time | <200ms avg | Performance timer |
| Token savings (weighted) | >50% | Scenario-based calculation |
| Test scenario pass rate | 100% | All 10 scenarios pass |
| Broken references | 0 | Manual validation |
| False negatives | 0 | No missing required contexts |

---

## Deliverables

### Testing Phase Outputs

1. **Test Infrastructure Code**
   - Keyword detection simulator
   - Context loader with timing
   - Test runner and orchestrator

2. **Test Results Document**
   - All 10 scenario results
   - Edge case findings
   - Performance metrics
   - Token savings calculations

3. **Test Data**
   - Test messages for each scenario
   - Expected vs actual results
   - Timing measurements
   - Token counts

4. **Phase 3 Completion Report**
   - Overall test results
   - Issues found and fixed
   - Final validation
   - Recommendations for Phase 4 (if needed)

---

## Risk Mitigation

### Potential Issues and Mitigations

**Risk 1: Low Keyword Detection Accuracy**
- **Mitigation**: Adjust keyword weights, add more intent patterns, tune algorithm
- **Threshold**: If <80%, refine keyword-mapping.json

**Risk 2: Slow Context Loading**
- **Mitigation**: Optimize file reading, implement caching, parallelize loads
- **Threshold**: If >500ms, investigate bottlenecks

**Risk 3: Lower Token Savings Than Projected**
- **Mitigation**: Analyze which contexts are over-loading, optimize summaries
- **Threshold**: If <40%, review context size and coupling

**Risk 4: Broken References After Extraction**
- **Mitigation**: Manual validation of all cross-references, fix immediately
- **Threshold**: Zero tolerance - must fix all broken references

---

## Next Steps After Phase 3

### If All Tests Pass (Expected)
1. Create final Phase 2 report (Weeks 2-3 combined)
2. Update project documentation
3. Consider applying pattern to other agents
4. Plan Phase 4 (additional agent optimization)

### If Tests Reveal Issues
1. Document issues and root causes
2. Prioritize fixes by severity
3. Implement fixes and re-test
4. Delay Phase 4 until Phase 3 criteria met

---

**Phase 3 Status**: 🚀 **STARTING**
**Estimated Completion**: 2025-11-05 (7 days)

---

*Document Version: 1.0*
*Created: 2025-10-30*
