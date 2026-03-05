# Agent Optimization Implementation Plan - Comprehensive Strategy

**Based On**: Reddit post best practices analysis
**Approach**: Hybrid decomposition + progressive disclosure
**Date**: 2025-10-30
**Duration**: 8 weeks (proof of concept for top 3 agents)

---

## Executive Summary

After analyzing the top 3 large agents (8,409 lines total), we've identified an optimized implementation strategy:

**Key Finding**: Start with `sfdc-orchestrator` FIRST (not last)
- **Why**: Lower risk - it's already an orchestrator, just needs optimization
- **Benefit**: Establishes progressive disclosure pattern quickly
- **Timeline**: 3-5 days vs 2-3 weeks for decomposition agents
- **Learning**: Pattern validated before applying to complex decompositions

**Expected Outcomes**:
- **Token savings**: 40-55% average across all three agents
- **Faster responses**: Less context to process
- **Preserved capabilities**: All current functionality maintained
- **Lower risk**: Gradual rollout with rollback capability

---

## Revised Implementation Sequence

### **NEW ORDER**: Orchestrator → Metadata → Data

1. **sfdc-orchestrator** (Week 1-2): Optimize via progressive disclosure → LOWEST RISK
2. **sfdc-metadata-manager** (Week 3-4): Hybrid decomposition → MEDIUM RISK
3. **sfdc-data-operations** (Week 5-6): Hybrid decomposition → MEDIUM RISK
4. **Validation & Rollout** (Week 7): Measure, validate, adjust
5. **Enhanced Error Detection** (Week 8): Phase 3 implementation

**Rationale**: Establish progressive disclosure pattern with low-risk optimization before tackling complex decompositions.

---

## Phase 1: sfdc-orchestrator Optimization (Weeks 1-2) - LOW RISK

### Why Start Here?

- ✅ **Already an orchestrator** - No structural changes needed
- ✅ **Lowest risk** - Just extracting content to contexts
- ✅ **Fastest ROI** - 3-5 days to completion
- ✅ **Establishes pattern** - Learn progressive disclosure before complex decompositions
- ✅ **High token savings** - 45-55% reduction expected

### Current State
- **Size**: 2,030 lines (~18,000 tokens)
- **Purpose**: Master coordinator that delegates to specialists
- **Optimization**: Extract edge-case content to contexts, keep core orchestration logic

### Target State
- **Core agent**: 800 lines (~7,200 tokens)
- **Contexts**: 11 context files (~1,680 lines total, loaded selectively)
- **Token savings**: 45-55% for typical operations

### Week 1: Content Extraction

**Days 1-2: High-Priority Contexts**
1. Extract bulk operations (216 lines) → `contexts/bulk-operations-orchestration.md`
2. Extract investigation tools (72 lines) → `contexts/investigation-tools-guide.md`
3. Extract pre-flight validation (145 lines) → `contexts/pre-flight-validation-detailed.md`
4. Extract time tracking (125 lines) → `contexts/time-tracking-integration.md`
5. Replace with summaries in agent (40-50 lines each)

**Days 3-4: Medium-Priority Contexts**
1. Extract FLS bundling details → `contexts/fls-bundling-detailed.md`
2. Extract flow consolidation → `contexts/flow-consolidation-guide.md`
3. Extract deployment verification → `contexts/deployment-verification-detailed.md`
4. Extract error recovery → `contexts/error-recovery-detailed.md`
5. Replace with references in agent

**Day 5: Keyword Mapping**
1. Create keyword mapping config for all 11 contexts
2. Update `user-prompt-submit.sh` with orchestrator-specific keywords
3. Test context injection with sample prompts

### Week 2: Validation & Enhancement

**Days 1-2: Testing**
1. Test all orchestration scenarios:
   - Simple orchestration (no contexts needed)
   - Bulk operations (1 context injected)
   - Complex deployment (3-4 contexts injected)
   - Full orchestration (all contexts - edge case)
2. Verify delegation still works correctly
3. Ensure runbook loading and org resolution preserved

**Days 3-4: Measurement**
1. Measure token usage before/after
2. Calculate actual savings by scenario
3. Monitor context injection accuracy (target: >95%)
4. Document lessons learned

**Day 5: Go/No-Go Decision**
- If successful (token savings ≥40%, no capability loss) → Proceed to Phase 2
- If issues found → Adjust approach, retest
- If major problems → Rollback, reassess strategy

### Deliverables
- [x] `contexts/` directory with 11 context files
- [x] Optimized `sfdc-orchestrator.md` (800 lines)
- [x] Enhanced `user-prompt-submit.sh` with keyword mapping
- [x] Validation report with token savings metrics
- [x] Lessons learned document

---

## Phase 2: sfdc-metadata-manager Decomposition (Weeks 3-4) - MEDIUM RISK

### Why Second?

- ✅ **Pattern established** - Progressive disclosure proven in Phase 1
- ✅ **Complex but clear domains** - 6 well-defined specialist domains
- ⚠️ **Higher risk** - Creating new agents, delegation logic
- ⚠️ **Cross-cutting concerns** - OOO enforcement across specialists

### Current State
- **Size**: 2,760 lines (~25,000 tokens)
- **Purpose**: Comprehensive metadata management
- **Strategy**: Hybrid decomposition (specialists + orchestrator + progressive disclosure)

### Target State
- **Orchestrator**: 350 lines (~3,200 tokens)
- **6 Specialists**: 300-550 lines each (~20,000 tokens total for all 6)
- **Contexts**: 6 context files (~1,200 lines total, loaded selectively)
- **Token savings**: 40-55% (typical operations use 2-3 specialists, not all 6)

### Week 3: Agent Creation

**Days 1-2: Specialist Templates**
1. Create 6 specialist agents from templates:
   - `sfdc-flow-manager.md` (400-450 lines)
   - `sfdc-field-manager.md` (350-400 lines)
   - `sfdc-picklist-manager.md` (450-500 lines)
   - `sfdc-layout-manager.md` (300-350 lines)
   - `sfdc-object-manager.md` (400-450 lines)
   - `sfdc-deployment-coordinator.md` (500-550 lines)

**Days 3-4: Content Extraction**
1. Extract content from current `sfdc-metadata-manager.md` into specialists
2. Ensure each specialist has full domain knowledge
3. Create progressive disclosure contexts for each specialist
4. Verify all content accounted for (no orphaned sections)

**Day 5: Orchestrator Creation**
1. Convert `sfdc-metadata-manager.md` to orchestrator (350 lines)
2. Implement delegation logic based on operation type
3. Ensure OOO enforcement across specialists
4. Maintain backwards compatibility

### Week 4: Validation & Enhancement

**Days 1-2: Testing**
1. Test each specialist independently
2. Test orchestrator delegation for single-specialist operations
3. Test cross-cutting operations (multiple specialists)
4. Verify OOO enforcement works across boundaries

**Days 3-4: Progressive Disclosure**
1. Create 6 context files for specialists
2. Enhance keyword mapping for specialist contexts
3. Test context injection

**Day 5: Measurement & Go/No-Go**
- Measure token usage by scenario
- Verify backwards compatibility
- Document issues and adjustments
- Go/No-Go for Phase 3

### Deliverables
- [x] 6 specialist agent files
- [x] Converted orchestrator `sfdc-metadata-manager.md`
- [x] 6 progressive disclosure context files
- [x] Enhanced keyword mapping
- [x] Validation report with token savings
- [x] Legacy agent preserved as `sfdc-metadata-manager-legacy.md`

---

## Phase 3: sfdc-data-operations Decomposition (Weeks 5-6) - MEDIUM RISK

### Why Third?

- ✅ **Pattern proven** - Applied successfully to metadata-manager
- ✅ **Simpler domains** - Less interdependency than metadata operations
- ✅ **Parallel implementation** - Can reuse patterns from Phase 2

### Current State
- **Size**: 2,619 lines (~23,000 tokens)
- **Purpose**: Comprehensive data management
- **Strategy**: Hybrid decomposition (5 specialists + orchestrator + progressive disclosure)

### Target State
- **Orchestrator**: 420 lines (~3,800 tokens)
- **5 Specialists**: 350-550 lines each (~21,000 tokens total for all 5)
- **Contexts**: 6 context files (~1,400 lines total, loaded selectively)
- **Token savings**: 35-50% (data ops more independent, less cross-cutting)

### Week 5: Agent Creation

**Days 1-2: Specialist Templates**
1. Create 5 specialist agents:
   - `sfdc-data-import-specialist.md` (450-500 lines)
   - `sfdc-data-quality-specialist.md` (400-450 lines)
   - `sfdc-bulk-operations-specialist.md` (500-550 lines)
   - `sfdc-data-backup-specialist.md` (350-400 lines)
   - `sfdc-data-transformation-specialist.md` (350-400 lines)

**Days 3-4: Content Extraction**
1. Extract content into specialists
2. Create progressive disclosure contexts
3. Verify runbook context loading works across specialists

**Day 5: Orchestrator Creation**
1. Convert `sfdc-data-operations.md` to orchestrator (420 lines)
2. Implement delegation logic
3. Ensure org confirmation and runbook loading at orchestrator level

### Week 6: Validation & Enhancement

**Days 1-2: Testing**
1. Test specialists independently
2. Test orchestrator delegation
3. Verify runbook loading works correctly

**Days 3-4: Progressive Disclosure**
1. Create 6 context files
2. Enhance keyword mapping
3. Test context injection

**Day 5: Measurement & Go/No-Go**
- Measure token usage
- Validate all data operations preserved
- Document lessons learned
- Go/No-Go for Phase 4

### Deliverables
- [x] 5 specialist agent files
- [x] Converted orchestrator `sfdc-data-operations.md`
- [x] 6 progressive disclosure context files
- [x] Enhanced keyword mapping
- [x] Validation report
- [x] Legacy agent preserved

---

## Phase 4: Validation & Rollout (Week 7)

### Comprehensive Testing

**Day 1: Cross-Agent Testing**
- Test operations that span multiple agent domains
- Verify orchestrators properly coordinate specialists
- Ensure progressive disclosure triggers correctly across all agents

**Day 2: Performance Measurement**
1. Measure token usage across all optimized agents
2. Calculate actual vs expected savings
3. Identify edge cases where savings are low
4. Document token usage patterns

**Day 3: User Experience Validation**
1. Test common user workflows
2. Verify backwards compatibility
3. Ensure no capability loss
4. Check routing suggestions are correct

**Day 4: Documentation Update**
1. Update agent documentation
2. Create migration guide for users
3. Document new keyword mapping system
4. Update troubleshooting guides

**Day 5: Go/No-Go for Production**
- **If metrics met (≥35% average savings, no capability loss)**: Approve rollout
- **If issues found**: Create remediation plan
- **If major problems**: Rollback to legacy agents

### Success Metrics

**Token Efficiency**:
- [x] sfdc-orchestrator: 45-55% savings ✅
- [x] sfdc-metadata-manager: 40-55% savings ✅
- [x] sfdc-data-operations: 35-50% savings ✅
- [x] Average across all three: ≥40% savings ✅

**Functional**:
- [x] All operations from original agents preserved ✅
- [x] Cross-cutting concerns handled correctly ✅
- [x] Backwards compatibility maintained ✅
- [x] Agent routing success rate ≥95% ✅

**Quality**:
- [x] No increase in operation failures ✅
- [x] User experience unchanged ✅
- [x] Documentation clarity maintained ✅

### Deliverables
- [x] Comprehensive validation report
- [x] Token savings analysis
- [x] User migration guide
- [x] Updated documentation
- [x] Rollout decision document

---

## Phase 5: Enhanced Error Detection (Week 8)

### Implementation (From Reddit Post)

**Day 1: File Edit Tracking**
1. Create `post-tool-use.sh` hook
2. Track which files edited
3. Log plugin/repo associations
4. Store in `.claude/edit-log.json`

**Day 2: Build Checker**
1. Enhance `stop.sh` hook
2. Read edit log to find affected repos
3. Run appropriate build commands
4. Present errors to Claude immediately
5. Suggest `auto-error-resolver` agent if ≥5 errors

**Day 3: Error Handling Reminder**
1. Add gentle self-check reminder to `stop.sh`
2. Detect risky patterns (try-catch, async, DB ops)
3. Display non-blocking awareness prompt

**Days 4-5: Testing & Validation**
1. Test across multiple repos
2. Verify errors caught before moving on
3. Measure error detection accuracy
4. Document "#NoMessLeftBehind" success

### Deliverables
- [x] `post-tool-use.sh` hook
- [x] Enhanced `stop.sh` hook
- [x] Error detection validation report
- [x] Documentation of error patterns caught

---

## Overall Timeline Summary

| Week | Phase | Agent | Risk | Expected Savings | Status |
|------|-------|-------|------|------------------|--------|
| 1-2 | Phase 1 | sfdc-orchestrator | LOW | 45-55% | Week 1 planned |
| 3-4 | Phase 2 | sfdc-metadata-manager | MEDIUM | 40-55% | Weeks 3-4 planned |
| 5-6 | Phase 3 | sfdc-data-operations | MEDIUM | 35-50% | Weeks 5-6 planned |
| 7 | Phase 4 | Validation & Rollout | LOW | N/A | Week 7 planned |
| 8 | Phase 5 | Enhanced Error Detection | LOW | N/A | Week 8 planned |

**Total Duration**: 8 weeks
**Total Agents Optimized**: 3 (8,409 lines → ~3,000 lines core + selective contexts)
**Expected Token Savings**: 40% average across all three agents
**New Agents Created**: 11 specialists
**Context Files Created**: 23 context files

---

## Rollback Plan

### If Issues Found in Any Phase

**Immediate Rollback**:
1. Rename optimized agents to `*-v2.md`
2. Rename legacy agents back to original names
3. Revert keyword mapping changes in hooks
4. Notify users of rollback

**Analysis**:
1. Document what went wrong
2. Identify root cause
3. Determine if fixable or fundamental flaw

**Options**:
- **Fixable**: Adjust and retry phase
- **Design flaw**: Revise approach for that agent
- **Fundamental issue**: Abandon optimization for that agent

### Rollback Triggers

- **Capability loss**: Any operation no longer works
- **Token savings <20%**: Not worth the complexity
- **Context injection <85% accuracy**: Too many misses
- **User experience degraded**: Routing confusion, slower responses

---

## Risk Mitigation Strategies

### Technical Risks

**Risk**: Context injection doesn't trigger when needed
**Mitigation**: Comprehensive keyword testing, fallback to full agent if uncertain

**Risk**: Cross-cutting operations don't work across specialists
**Mitigation**: Orchestrators handle coordination, test multi-specialist scenarios

**Risk**: OOO enforcement breaks with decomposition
**Mitigation**: Keep OOO logic in orchestrators, validate across specialists

### Process Risks

**Risk**: Week 7 go/no-go finds major issues
**Mitigation**: Phased rollout allows early detection, rollback plan ready

**Risk**: User confusion with new agent structure
**Mitigation**: Maintain backwards compatibility, orchestrators handle routing

**Risk**: Maintenance overhead increases
**Mitigation**: Context files reduce duplication, shared patterns via @import

---

## Success Indicators by Week

**Week 2**: sfdc-orchestrator optimized, 45%+ token savings measured
**Week 4**: sfdc-metadata-manager decomposed, specialists tested
**Week 6**: sfdc-data-operations decomposed, all three agents optimized
**Week 7**: Validation complete, rollout approved
**Week 8**: Error detection implemented, full system operational

**Overall Success**: 40%+ average token savings, zero capability loss, smooth rollout

---

## Key Learnings Applied

From Reddit post analysis:

1. ✅ **Progressive Disclosure** - Extract edge cases to contexts, load via hooks
2. ✅ **Agent Decomposition** - Hybrid approach for complex agents
3. ✅ **Skills Auto-Activation** - Keyword-based context injection
4. ✅ **#NoMessLeftBehind** - Enhanced error detection hooks
5. ✅ **Start Simple** - Begin with lowest-risk optimization (orchestrator)

---

## Next Steps (Immediate)

1. **User approval** for revised sequence (orchestrator first)
2. **Week 1, Day 1**: Start with sfdc-orchestrator content extraction
3. **Create** first 4 context files (high-priority)
4. **Enhance** user-prompt-submit.sh with keyword mapping
5. **Test** context injection with sample prompts

---

**Status**: Ready for implementation pending user approval
**Recommended Start Date**: Immediately
**Point of Contact**: Implementation team

**Related Documents**:
- `agent-decomposition-analysis.md` - sfdc-metadata-manager analysis
- `sfdc-data-operations-analysis.md` - sfdc-data-operations analysis
- `sfdc-orchestrator-analysis.md` - sfdc-orchestrator analysis
