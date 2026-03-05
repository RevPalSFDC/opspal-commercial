# sfdc-orchestrator Optimization Analysis

**Current Size**: 2,030 lines
**Target Size**: 500-600 lines (optimized orchestrator with progressive disclosure)

**Date**: 2025-10-30

---

## Key Finding: This is ALREADY an Orchestrator

**Important**: Unlike `sfdc-metadata-manager` and `sfdc-data-operations`, `sfdc-orchestrator` is ALREADY designed as a master coordinator that delegates to specialists.

**Strategy**: OPTIMIZE, not DECOMPOSE
- Keep as single agent (orchestration is its purpose)
- Extract edge-case content to progressive disclosure contexts
- Enhance delegation patterns
- Reduce size through strategic content extraction

---

## Current Structure Analysis

### Core Orchestration Responsibilities (Keep in Agent)

#### 1. Pre-Operation Protocols (Lines 18-292, ~274 lines → reduce to ~120 lines)
**Content**:
- Org resolution before delegation (lines 18-76)
- Runbook context loading (lines 77-199)
- QA workflow mode confirmation (lines 200-292)

**Optimization**:
- Keep: Core logic and decision trees
- Move to context: Detailed examples, edge cases
- **Reduced size**: ~120 lines

**Progressive Disclosure Contexts**:
- `contexts/org-resolution-edge-cases.md` - Complex disambiguation scenarios
- `contexts/runbook-loading-detailed.md` - Comprehensive runbook usage patterns
- `contexts/qa-workflow-configurations.md` - QA mode setup and configurations

---

#### 2. Pattern Detection & Communication (Lines 303-455, ~152 lines → reduce to ~80 lines)
**Content**:
- Pattern detection & prevention (user expectation management)
- Structured communication pattern (clarity requirement)
- Output styles for report generation

**Optimization**:
- Keep: Core patterns and when to use them
- Move to context: Detailed examples, formatting guidelines
- **Reduced size**: ~80 lines

**Progressive Disclosure Contexts**:
- `contexts/communication-patterns-detailed.md` - Comprehensive communication examples
- `contexts/output-style-formatting.md` - Report generation formatting guide

---

#### 3. Validation Framework Integration (Lines 1191-1263, ~72 lines → reduce to ~50 lines)
**Content**:
- Mandatory validation framework integration
- Trust verification before operations
- Validation enforcement patterns

**Optimization**:
- Keep: Core validation requirements
- Move to context: Detailed validation procedures
- **Reduced size**: ~50 lines

**Progressive Disclosure Contexts**:
- `contexts/validation-framework-detailed.md` - Comprehensive validation procedures
- `contexts/trust-verification-protocols.md` - Detailed trust verification

---

#### 4. Deployment & Flow Management (Lines 892-1603, ~711 lines → reduce to ~150 lines)
**Content**:
- FLS bundling enforcement for field deployments (lines 892-1110)
- Flow Architecture v2.0 pattern enforcement (lines 1302-1344)
- Validation-first planning mode (lines 1345-1377)
- Deployment verification (lines 1378-1473)
- Flow consolidation (lines 1474-1603)

**Optimization**:
- Keep: High-level enforcement patterns and delegation logic
- Move to context: Detailed deployment procedures, flow consolidation steps
- **Reduced size**: ~150 lines

**Progressive Disclosure Contexts**:
- `contexts/fls-bundling-detailed.md` - Comprehensive FLS bundling procedures
- `contexts/flow-architecture-v2.md` - Detailed Flow Architecture v2.0 patterns
- `contexts/deployment-verification-detailed.md` - Step-by-step verification procedures
- `contexts/flow-consolidation-guide.md` - Complete flow consolidation playbook

---

#### 5. Error Recovery & Monitoring (Lines 1730-1882, ~152 lines → reduce to ~80 lines)
**Content**:
- Advanced error recovery with validation integration
- Integration with error recovery system
- Real-time monitoring integration

**Optimization**:
- Keep: Core error recovery patterns and when to invoke
- Move to context: Detailed recovery procedures, monitoring setup
- **Reduced size**: ~80 lines

**Progressive Disclosure Contexts**:
- `contexts/error-recovery-detailed.md` - Comprehensive error recovery procedures
- `contexts/monitoring-setup-guide.md` - Monitoring configuration and usage

---

#### 6. Advanced Orchestration Patterns (Lines 1883-2001, ~118 lines → reduce to ~60 lines)
**Content**:
- Advanced orchestration patterns with validation
- Multi-stage operation coordination
- Parallel execution strategies

**Optimization**:
- Keep: Core patterns and decision trees
- Move to context: Detailed implementation examples
- **Reduced size**: ~60 lines

**Progressive Disclosure Contexts**:
- `contexts/orchestration-patterns-detailed.md` - Advanced pattern implementations
- `contexts/parallel-execution-strategies.md` - Parallelization approaches

---

### Content to Extract (Move to Progressive Disclosure)

#### High-Priority Extractions (Largest Sections)

1. **Bulk Operations** (Lines 456-672, ~216 lines)
   - **Decision**: Extract to context
   - **Context File**: `contexts/bulk-operations-orchestration.md`
   - **Trigger Keywords**: "bulk", "batch", "large dataset"
   - **Keep in Agent**: Reference to bulk patterns + when to use them (~40 lines)

2. **Investigation Tools** (Lines 673-745, ~72 lines)
   - **Decision**: Extract to context
   - **Context File**: `contexts/investigation-tools-guide.md`
   - **Trigger Keywords**: "investigate", "debug", "troubleshoot"
   - **Keep in Agent**: Tool list + when to use (~30 lines)

3. **Pre-Flight Object Validation** (Lines 746-891, ~145 lines)
   - **Decision**: Extract to context
   - **Context File**: `contexts/pre-flight-validation-detailed.md`
   - **Trigger Keywords**: "validate", "pre-flight", "check"
   - **Keep in Agent**: Validation checklist + when to run (~50 lines)

4. **Time Tracking** (Lines 1604-1729, ~125 lines)
   - **Decision**: Extract to context
   - **Context File**: `contexts/time-tracking-integration.md`
   - **Trigger Keywords**: "time estimate", "duration", "tracking"
   - **Keep in Agent**: When to use time tracking (~30 lines)

5. **Shared Resources** (Lines 1111-1190, ~79 lines)
   - **Decision**: Already uses @import - verify these are shared components
   - **Action**: Ensure all @import references are up to date

---

## Size Reduction Calculation

**Current Size**: 2,030 lines (~18,000 tokens)

**After Optimization**:

### Core Agent Content (remains in sfdc-orchestrator.md):
- Pre-operation protocols: 120 lines
- Pattern detection & communication: 80 lines
- Validation framework: 50 lines
- Deployment & flow management: 150 lines
- Error recovery & monitoring: 80 lines
- Advanced orchestration: 60 lines
- Bulk operations (summary): 40 lines
- Investigation tools (summary): 30 lines
- Pre-flight validation (summary): 50 lines
- Time tracking (summary): 30 lines
- Asana integration: 50 lines
- Header/frontmatter/imports: 60 lines

**Total Core Content**: ~800 lines

### Progressive Disclosure Contexts (loaded by hooks):
- `contexts/bulk-operations-orchestration.md`: 200 lines
- `contexts/investigation-tools-guide.md`: 100 lines
- `contexts/pre-flight-validation-detailed.md`: 150 lines
- `contexts/time-tracking-integration.md`: 130 lines
- `contexts/fls-bundling-detailed.md`: 180 lines
- `contexts/flow-consolidation-guide.md`: 150 lines
- `contexts/error-recovery-detailed.md`: 150 lines
- `contexts/orchestration-patterns-detailed.md`: 120 lines
- [8 more contexts]: ~500 lines

**Total Context Content**: ~1,680 lines (loaded selectively)

---

## Token Savings by Scenario

**Scenario 1: Simple orchestration (no bulk, no complex patterns)**
- Load orchestrator core: 800 lines (~7,200 tokens)
- Hook injects: 0 contexts (simple operation)
- **Total**: 800 lines - **61% reduction**

**Scenario 2: Bulk operation orchestration**
- Load orchestrator core: 800 lines
- Hook injects bulk-operations-orchestration: 200 lines
- **Total**: 1,000 lines (~9,000 tokens) - **51% reduction**

**Scenario 3: Complex deployment with validation + error recovery**
- Load orchestrator core: 800 lines
- Hook injects:
  - pre-flight-validation-detailed: 150 lines
  - deployment-verification-detailed: 120 lines
  - error-recovery-detailed: 150 lines
- **Total**: 1,220 lines (~11,000 tokens) - **40% reduction**

**Scenario 4: Full orchestration (worst case - all contexts needed)**
- Load orchestrator core: 800 lines
- Hook injects all contexts: ~1,680 lines
- **Total**: 2,480 lines (~22,000 tokens) - **-22% increase (rare edge case)**

**Expected Average Savings**: 45-55% (most operations don't need all contexts)

---

## Keyword Mapping for Progressive Disclosure

```json
{
  "sfdc-orchestrator-contexts": {
    "bulk-operations-orchestration": {
      "keywords": ["bulk", "batch", "large dataset", "parallel", "thousands"],
      "priority": "high"
    },
    "investigation-tools-guide": {
      "keywords": ["investigate", "debug", "troubleshoot", "diagnose", "root cause"],
      "priority": "medium"
    },
    "pre-flight-validation-detailed": {
      "keywords": ["validate", "pre-flight", "check before", "verify", "validation"],
      "priority": "high"
    },
    "fls-bundling-detailed": {
      "keywords": ["FLS", "field-level security", "permission", "access"],
      "priority": "high"
    },
    "flow-consolidation-guide": {
      "keywords": ["flow consolidation", "merge flows", "consolidate automation"],
      "priority": "medium"
    },
    "deployment-verification-detailed": {
      "keywords": ["deploy", "deployment", "verify deployment", "post-deployment"],
      "priority": "high"
    },
    "error-recovery-detailed": {
      "keywords": ["error", "failed", "recovery", "rollback", "undo"],
      "priority": "high"
    },
    "time-tracking-integration": {
      "keywords": ["time estimate", "duration", "how long", "tracking"],
      "priority": "low"
    },
    "orchestration-patterns-detailed": {
      "keywords": ["orchestration pattern", "multi-step", "complex operation", "coordinate"],
      "priority": "medium"
    },
    "org-resolution-edge-cases": {
      "keywords": ["multiple matches", "ambiguous", "which org", "clarify"],
      "priority": "medium"
    },
    "monitoring-setup-guide": {
      "keywords": ["monitor", "monitoring", "track progress", "status"],
      "priority": "low"
    }
  }
}
```

---

## Delegation Enhancement Opportunities

Since this agent already delegates, we should enhance delegation patterns:

### Current Delegation Pattern (from code examination):
```javascript
await Task({
    subagent_type: 'opspal-salesforce:sfdc-data-operations',
    description: 'Execute bulk operation',
    prompt: `Execute operation on ${orgAlias} (already verified)...`
});
```

### Enhanced Delegation Pattern (add context passing):
```javascript
// Pass runbook context to sub-agents
const subAgentContext = {
    orgAlias: resolvedOrgAlias,
    runbookContext: runbookContext,
    validationRequired: true,
    approvalWorkflow: userApprovalEnabled
};

await Task({
    subagent_type: 'opspal-salesforce:sfdc-data-operations',
    description: 'Execute bulk operation',
    prompt: `
        Execute operation on ${orgAlias} (already verified).

        Context from orchestrator:
        - Runbook context loaded: ${runbookContext.exists}
        - Known exceptions: ${runbookContext.knownExceptions.length}
        - Validation framework: ENABLED
        - Approval required: ${userApprovalEnabled}

        ${prompt}
    `
});
```

**Benefit**: Sub-agents receive orchestrator context, reducing need to re-load runbook, re-validate org, etc.

---

## Comparison to Other Agents

| Aspect | sfdc-metadata-manager | sfdc-data-operations | sfdc-orchestrator |
|--------|----------------------|---------------------|-------------------|
| **Strategy** | Decompose into specialists | Decompose into specialists | Optimize existing orchestrator |
| **Specialists** | 6 new agents | 5 new agents | 0 new agents (already delegates) |
| **Contexts** | ~6 contexts | ~6 contexts | ~11 contexts |
| **Token savings** | 40-55% | 35-50% | 45-55% |
| **Complexity** | High (new delegation logic) | Medium (independent domains) | Low (optimize existing) |
| **Risk** | Medium (breaking existing workflows) | Medium | Low (no structural changes) |

**Key Insight**: sfdc-orchestrator is the EASIEST to optimize because we're not changing its fundamental structure - just extracting content to contexts.

---

## Implementation Strategy

### Phase 1: Extract High-Priority Contexts (Week 3, Days 1-2)

1. Create context files:
   - `contexts/bulk-operations-orchestration.md` (216 lines from agent)
   - `contexts/investigation-tools-guide.md` (72 lines from agent)
   - `contexts/pre-flight-validation-detailed.md` (145 lines from agent)
   - `contexts/time-tracking-integration.md` (125 lines from agent)

2. Replace in agent with summaries (~40-50 lines each)

3. Test that summaries are sufficient for decision-making

### Phase 2: Extract Medium-Priority Contexts (Week 3, Days 3-4)

1. Create context files:
   - `contexts/fls-bundling-detailed.md`
   - `contexts/flow-consolidation-guide.md`
   - `contexts/deployment-verification-detailed.md`
   - `contexts/error-recovery-detailed.md`

2. Replace in agent with references

### Phase 3: Enhance Keyword Mapping (Week 3, Day 5)

1. Update `user-prompt-submit.sh` with orchestrator-specific keyword mapping
2. Test context injection with various operation types
3. Measure token usage before/after

### Phase 4: Validation (Week 4, Day 1)

1. Test all orchestration scenarios
2. Verify delegation still works correctly
3. Ensure runbook loading and org resolution preserved
4. Measure token savings

---

## Risk Assessment

**Very Low Risk**: No structural changes, just content extraction

**Potential Issues**:
- Context injection may not trigger when needed
- Summaries in agent may be insufficient for decision-making
- Token savings may not meet target for complex operations (need all contexts)

**Mitigations**:
- Comprehensive keyword testing
- Keep summaries detailed enough for decisions
- Monitor token usage across operation types
- Can always restore extracted content if needed

---

## Success Criteria

**Functional**:
- [ ] All orchestration capabilities preserved
- [ ] Delegation to sub-agents still works correctly
- [ ] Runbook loading and org resolution unchanged
- [ ] Validation framework integration maintained

**Performance**:
- [ ] 45-55% token reduction for typical operations
- [ ] Response time unchanged or improved
- [ ] Context injection triggers correctly (>95% accuracy)

**Quality**:
- [ ] No increase in operation failures
- [ ] User experience unchanged (transparent optimization)
- [ ] Documentation clarity maintained

**Maintainability**:
- [ ] Context files independently updatable
- [ ] Agent core content easy to understand
- [ ] Keyword mapping easy to extend

---

## Timeline

**Week 3** (After sfdc-metadata-manager and sfdc-data-operations):
- Days 1-2: Extract high-priority contexts
- Days 3-4: Extract medium-priority contexts
- Day 5: Enhance keyword mapping + testing

**Week 4**:
- Day 1: Validation and measurement
- Days 2-5: Apply learnings to remaining large agents

---

**Recommendation**: Start with sfdc-orchestrator FIRST instead of metadata-manager
- **Why**: Lower risk (no decomposition needed)
- **Benefit**: Establishes progressive disclosure pattern
- **Learning**: Pattern can be applied to other agents
- **Timeline**: Faster implementation (3 days vs 2 weeks)

---

**Next Steps**:
1. Get user approval to start with sfdc-orchestrator (lower risk)
2. Create first 4 context files
3. Test keyword injection
4. Measure token savings
5. Apply pattern to metadata-manager and data-operations

**Cross-References**:
- See `agent-decomposition-analysis.md` for metadata-manager decomposition
- See `sfdc-data-operations-analysis.md` for data-operations decomposition
- See overall implementation plan in `docs/agent-optimization-implementation-plan.md`
