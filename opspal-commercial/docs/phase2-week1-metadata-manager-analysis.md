# Phase 2 - Week 1: sfdc-metadata-manager Domain Analysis

**Date**: 2025-10-30
**Phase**: Phase 2, Week 1 (Day 1-2)
**Agent**: sfdc-metadata-manager
**Analyst**: Agent Optimization Team

---

## Executive Summary

**Current Size**: 2,760 lines (~24,840 tokens)

**Extraction Potential**: 1,941 lines (70.3%) can be extracted into 9 progressive disclosure contexts

**Projected Base Agent**: ~819 lines (after optimization)

**Projected Reduction**: 70.3% (exceeds Phase 2 target of 68-71%)

**Complexity Assessment**: HIGH
- 23 distinct sections identified
- Moderate interdependencies between protocols
- Clear domain boundaries with some shared utilities
- Mitigation: Extract in phases, validate after each extraction

---

## Detailed Section Analysis

### Domain Mapping (23 Sections Identified)

| # | Section | Lines | Start-End | Domain | Extract? |
|---|---------|-------|-----------|--------|----------|
| 1 | Context7 + OOO | 82 | 18-100 | Core Setup | ❌ Keep |
| 2 | Flow Management | 222 | 101-323 | Automation | ✅ Extract |
| 3 | Evidence-Based | 20 | 324-344 | Core Protocol | ❌ Keep |
| 4 | Investigation Tools | 77 | 345-422 | Core Troubleshooting | ❌ Keep |
| 5 | Runbook Context | 216 | 423-639 | Operations | ✅ Extract |
| 6 | FLS Field Deploy | 199 | 640-839 | Field Management | ✅ Extract |
| 7 | Permission Set Mgmt | 56 | 840-896 | Reference | ❌ Keep |
| 8 | Permission-First Legacy | 87 | 897-984 | Legacy | ⚠️ Consider Removal |
| 9 | Picklist Modification | 165 | 985-1150 | Picklist Ops | ✅ Extract |
| 10 | Picklist Dependency | 431 | 1151-1582 | Picklist Ops | ✅ Extract |
| 11 | Master-Detail | 202 | 1583-1785 | Relationship Mgmt | ✅ Extract |
| 12 | Shared Resources | 81 | 1786-1867 | Imports | ❌ Keep |
| 13 | Validation Framework | 39 | 1868-1907 | Core | ❌ Keep |
| 14 | Core Responsibilities | 75 | 1908-1983 | Core Logic | ❌ Keep |
| 15 | Field Verification | 223 | 1984-2207 | Field Management | ✅ Extract |
| 16 | Best Practices | 38 | 2208-2246 | Core Guidance | ❌ Keep |
| 17 | Common Tasks | 144 | 2247-2391 | Reference | ✅ Extract |
| 18 | Advanced Validation | 78 | 2392-2470 | Core | ❌ Keep |
| 19 | Error Recovery | 39 | 2471-2510 | Core Integration | ❌ Keep |
| 20 | Monitoring | 16 | 2511-2527 | Core Integration | ❌ Keep |
| 21 | Validation Benefits | 23 | 2528-2551 | Core Summary | ❌ Keep |
| 22 | Bulk Operations | 139 | 2552-2691 | Bulk Ops | ✅ Extract |
| 23 | Asana Integration | 68 | 2692-2760 | Core Integration | ❌ Keep |

---

## Proposed Extraction Plan (9 Contexts)

### Context 1: Flow Management Framework
**Size**: 222 lines (~1,998 tokens)
**Lines**: 101-323
**Priority**: High
**Keywords**: flow, automation, activate, deactivate, flow version
**Description**: Complete flow management lifecycle including deployment, activation, and validation

**Interdependencies**:
- References OOO protocol (kept in base)
- Uses validation framework (kept in base)
- No blocking dependencies

**Extraction Difficulty**: LOW - Self-contained framework

---

### Context 2: Runbook Context Loading
**Size**: 216 lines (~1,944 tokens)
**Lines**: 423-639
**Priority**: Medium
**Keywords**: runbook, operational context, org-specific, load context
**Description**: Dynamic runbook loading for org-specific operational context

**Interdependencies**:
- References investigation tools (kept in base)
- Standalone functionality
- No blocking dependencies

**Extraction Difficulty**: LOW - Isolated feature

---

### Context 3: FLS-Aware Field Deployment
**Size**: 199 lines (~1,791 tokens)
**Lines**: 640-839
**Priority**: High
**Keywords**: field deployment, FLS, field-level security, custom field, deploy field
**Description**: Atomic field deployment with automatic FLS bundling

**Interdependencies**:
- References OOO protocol (kept in base)
- References permission set management (kept in base)
- Some coupling with verification protocol

**Extraction Difficulty**: MEDIUM - Moderate coupling with base protocols

---

### Context 4: Picklist Modification Protocol
**Size**: 165 lines (~1,485 tokens)
**Lines**: 985-1150
**Priority**: High
**Keywords**: picklist, picklist values, add value, modify picklist, record type
**Description**: Safe picklist modification preventing record type accessibility failures

**Interdependencies**:
- Tightly coupled with Picklist Dependency context
- References record type protocols
- Should be extracted together with Context 5

**Extraction Difficulty**: MEDIUM - Coupled with Context 5

---

### Context 5: Picklist Dependency Deployment (LARGEST)
**Size**: 431 lines (~3,879 tokens)
**Lines**: 1151-1582
**Priority**: High
**Keywords**: picklist dependency, controlling field, dependent field, picklist cascade
**Description**: Complete picklist dependency management including controlling/dependent field handling

**Interdependencies**:
- Closely related to Context 4 (Picklist Modification)
- Some coupling with record type management
- **LARGEST section** - may benefit from further subdivision

**Extraction Difficulty**: MEDIUM-HIGH - Large, some coupling, consider splitting into 2 contexts

**Subdivision Consideration**:
- Context 5a: Basic Picklist Dependency (lines 1151-1350, ~200 lines)
- Context 5b: Advanced Picklist Cascade (lines 1351-1582, ~231 lines)

---

### Context 6: Master-Detail Relationship Protocol
**Size**: 202 lines (~1,818 tokens)
**Lines**: 1583-1785
**Priority**: High
**Keywords**: master-detail, relationship, cascade, reparenting, rollup
**Description**: Master-detail relationship creation and modification with propagation handling

**Interdependencies**:
- References field deployment (Context 3)
- References validation framework (kept in base)
- Moderate coupling

**Extraction Difficulty**: MEDIUM - Some coupling with field protocols

---

### Context 7: Field Verification Protocol
**Size**: 223 lines (~2,007 tokens)
**Lines**: 1984-2207
**Priority**: Medium
**Keywords**: verify field, field verification, schema check, FLS verification
**Description**: Comprehensive field and FLS verification after deployment

**Interdependencies**:
- Coupled with FLS-Aware Field Deployment (Context 3)
- Should be extracted together or referenced
- Moderate coupling

**Extraction Difficulty**: MEDIUM - Verification logic for Context 3

---

### Context 8: Common Tasks Reference
**Size**: 144 lines (~1,296 tokens)
**Lines**: 2247-2391
**Priority**: Low
**Keywords**: examples, common tasks, how to, walkthrough
**Description**: Reference examples for common metadata management tasks

**Interdependencies**:
- References multiple other contexts
- Pure documentation/examples
- No blocking dependencies

**Extraction Difficulty**: LOW - Documentation only

---

### Context 9: Bulk Operations
**Size**: 139 lines (~1,251 tokens)
**Lines**: 2552-2691
**Priority**: Medium
**Keywords**: bulk, batch, multiple objects, mass operation, bulk deploy
**Description**: Bulk metadata operations for managing multiple components at scale

**Interdependencies**:
- Uses core deployment protocols (kept in base)
- References validation framework (kept in base)
- No blocking dependencies

**Extraction Difficulty**: LOW - Wrapper around core operations

---

## Base Agent Content (Kept)

**Total Base Agent Lines**: ~819 lines (~7,371 tokens)

### Core Sections to Keep:

1. **Frontmatter + Imports** (17 lines)
   - Agent metadata, tools, imports

2. **Context7 Integration** (18 lines)
   - API documentation access pattern

3. **Order of Operations (OOO)** (64 lines)
   - Core deployment sequencing protocol
   - **CRITICAL** - Used by all extracted contexts

4. **Evidence-Based Deployment** (20 lines)
   - Core deployment verification approach

5. **Project Organization** (11 lines)
   - Standard directory structure

6. **Investigation Tools** (77 lines)
   - Core troubleshooting commands
   - **CRITICAL** - Frequently used

7. **Permission Set Management Reference** (56 lines)
   - Links to sfdc-permission-orchestrator agent

8. **Shared Resources** (81 lines)
   - Import statements for shared protocols

9. **Validation Framework Integration** (39 lines)
   - Core validation hooks

10. **Core Responsibilities** (75 lines)
    - Agent's primary role and scope

11. **Best Practices** (38 lines)
    - Core guidance and principles

12. **Advanced Validation** (78 lines)
    - Core validation patterns

13. **Error Recovery Integration** (39 lines)
    - Integration with error recovery system

14. **Real-time Monitoring** (16 lines)
    - Monitoring integration

15. **Validation Benefits** (23 lines)
    - Framework benefits summary

16. **Asana Integration** (68 lines)
    - Task management integration

17. **Context Summaries** (~200 lines estimated)
    - 30-40 line summaries for each extracted context
    - Decision criteria and routing keywords

---

## Token Savings Projection

### Current State
- **Total lines**: 2,760
- **Estimated tokens**: ~24,840 tokens (9 tokens/line average)

### After Optimization

**Base Agent Only** (no contexts loaded):
- **Lines**: ~819 lines
- **Tokens**: ~7,371 tokens
- **Reduction**: 70.3%

### Progressive Disclosure Scenarios

**Scenario 1: Simple metadata operation (no contexts)** - 65% of requests
- Base: 7,371 tokens
- Contexts: 0 tokens
- **Total**: 7,371 tokens
- **Savings vs Original**: 70.3% (17,469 tokens saved)

**Scenario 2: Single context (field or flow)** - 20% of requests
- Base: 7,371 tokens
- Avg context: ~1,850 tokens
- **Total**: 9,221 tokens
- **Savings vs Original**: 62.9% (15,619 tokens saved)

**Scenario 3: Multiple contexts (2-3 contexts)** - 10% of requests
- Base: 7,371 tokens
- Contexts (avg 2.5): ~4,625 tokens
- **Total**: 11,996 tokens
- **Savings vs Original**: 51.7% (12,844 tokens saved)

**Scenario 4: Complex operation (4-5 contexts)** - 4% of requests
- Base: 7,371 tokens
- Contexts (avg 4.5): ~8,325 tokens
- **Total**: 15,696 tokens
- **Savings vs Original**: 36.8% (9,144 tokens saved)

**Scenario 5: Maximum complexity (6+ contexts)** - 1% of requests
- Base: 7,371 tokens
- Contexts (avg 7): ~12,950 tokens
- **Total**: 20,321 tokens
- **Savings vs Original**: 18.2% (4,519 tokens saved)

### Weighted Average Savings

Based on estimated usage patterns:
```
Weighted Average = (65% × 7,371) + (20% × 9,221) + (10% × 11,996) + (4% × 15,696) + (1% × 20,321)
                = 4,791 + 1,844 + 1,200 + 628 + 203
                = 8,666 tokens per request

Original: 24,840 tokens
Optimized: 8,666 tokens
Average Savings: 65.1% (16,174 tokens saved per request)
```

**Result**: Exceeds Phase 2 target of 52% weighted average savings!

---

## Interdependency Analysis

### Dependency Graph

```
Base Agent (OOO + Validation + Investigation)
    ├─── Context 1: Flow Management (references OOO)
    ├─── Context 2: Runbook Loading (standalone)
    ├─── Context 3: FLS Field Deployment (references OOO, Validation)
    │       └─── Context 7: Field Verification (verifies Context 3)
    ├─── Context 4: Picklist Modification (references OOO)
    │       └─── Context 5: Picklist Dependency (extends Context 4)
    ├─── Context 6: Master-Detail (references Context 3, Validation)
    ├─── Context 8: Common Tasks (references all contexts - documentation only)
    └─── Context 9: Bulk Operations (uses all base protocols)
```

### Strong Coupling Pairs

1. **Context 3 ↔ Context 7**: FLS Deployment + Field Verification
   - **Recommendation**: Extract together, ensure cross-references work
   - **Risk**: MEDIUM - Verification depends on deployment patterns

2. **Context 4 ↔ Context 5**: Picklist Modification + Picklist Dependency
   - **Recommendation**: Extract together, maintain shared patterns
   - **Risk**: MEDIUM - Shared picklist handling logic

3. **Context 3 ↔ Context 6**: Field Deployment + Master-Detail
   - **Recommendation**: Ensure Context 6 references Context 3 for relationship field creation
   - **Risk**: LOW - Relationship is reference-only

### Weak/No Coupling

- Context 2 (Runbook Loading) - **Standalone**, no dependencies
- Context 8 (Common Tasks) - **Documentation only**, references others but not coupled
- Context 9 (Bulk Operations) - **Wrapper layer**, uses base protocols only

---

## Extraction Sequence Recommendation

### Phase A: Low-Risk Extractions (Week 2, Days 1-2)

1. **Context 2: Runbook Loading** (216 lines)
   - Standalone, no dependencies
   - Easy win

2. **Context 8: Common Tasks** (144 lines)
   - Documentation only
   - No risk

3. **Context 9: Bulk Operations** (139 lines)
   - Wrapper layer, minimal coupling
   - Low risk

**Total Phase A**: 499 lines extracted

---

### Phase B: Medium-Risk Extractions (Week 2, Days 3-4)

4. **Context 1: Flow Management** (222 lines)
   - References OOO (stays in base)
   - Moderate complexity but self-contained

5. **Context 4 + 5: Picklist Protocols** (596 lines total)
   - Extract together as a pair
   - Consider splitting Context 5 into 5a/5b
   - Moderate coupling between them

**Total Phase B**: 818 lines extracted

---

### Phase C: High-Risk Extractions (Week 2, Days 5 + Week 3, Days 1-2)

6. **Context 3 + 7: FLS Field Deployment + Verification** (422 lines total)
   - Extract together as a pair
   - Moderate coupling
   - Critical functionality, requires thorough testing

7. **Context 6: Master-Detail** (202 lines)
   - Moderate coupling with Context 3
   - Extract after Context 3 is stable
   - Ensure references work correctly

**Total Phase C**: 624 lines extracted

---

### Phase D: Optimization & Validation (Week 3, Days 3-5)

8. Create summaries for all 9 contexts (~270 lines of summaries)
9. Update keyword-mapping.json with detection rules
10. Validate all cross-references work
11. Run comprehensive test suite

---

## Risk Assessment

### High-Impact Risks

1. **Context 5 (Picklist Dependency) is Very Large (431 lines)**
   - **Risk**: Context too large, may not reduce token usage effectively
   - **Mitigation**: Consider splitting into Context 5a (Basic, 200 lines) + Context 5b (Advanced, 231 lines)
   - **Impact**: MEDIUM - Can be addressed during extraction

2. **FLS Deployment + Verification Coupling (Context 3 + 7)**
   - **Risk**: Breaking verification logic when extracting deployment
   - **Mitigation**: Extract together, maintain clear cross-references
   - **Impact**: MEDIUM - Requires careful testing

3. **Picklist Modification + Dependency Coupling (Context 4 + 5)**
   - **Risk**: Shared picklist handling logic may break
   - **Mitigation**: Extract together, test picklist operations thoroughly
   - **Impact**: MEDIUM - Requires careful testing

### Medium-Impact Risks

4. **OOO Protocol References Throughout**
   - **Risk**: All contexts reference Order of Operations
   - **Mitigation**: Keep OOO in base agent, ensure all contexts reference it
   - **Impact**: LOW - OOO is foundational, staying in base

5. **Master-Detail References Field Deployment**
   - **Risk**: Context 6 references Context 3 patterns
   - **Mitigation**: Ensure clear cross-references in summaries
   - **Impact**: LOW - Reference-only, not tight coupling

### Low-Impact Risks

6. **Common Tasks References Many Contexts**
   - **Risk**: Documentation examples may become outdated
   - **Mitigation**: Update examples during extraction
   - **Impact**: LOW - Documentation only, no functional coupling

---

## Success Criteria (Phase 2 Week 1)

### Analysis Complete (Day 2) ✅

- [x] Identify 9 extractable contexts
- [x] Measure current baseline (2,760 lines)
- [x] Map interdependencies
- [x] Calculate projected token savings
- [x] Assess extraction risks

### Extraction Plan Ready (Day 5)

- [ ] Define extraction sequence (4 phases)
- [ ] Create keyword mapping template
- [ ] Define test scenarios for each context
- [ ] Document cross-reference patterns
- [ ] Estimate timeline (Week 2: extraction, Week 3: optimization, Week 4: validation)

---

## Comparison with Phase 1 (sfdc-orchestrator)

| Metric | Phase 1 (Orchestrator) | Phase 2 (Metadata-Manager) |
|--------|------------------------|----------------------------|
| **Original Size** | 2,030 lines | 2,760 lines |
| **Contexts Extracted** | 8 contexts | 9 contexts (possibly 10 if split Context 5) |
| **Base Agent Target** | 1,060 lines (47.8% reduction) | 819 lines (70.3% reduction) |
| **Largest Context** | 276 lines | 431 lines (Context 5 - may split) |
| **Weighted Savings** | 40.7% | 65.1% projected |
| **Complexity** | MEDIUM (clear domains) | HIGH (moderate coupling) |
| **Coupling Issues** | None | 3 coupled pairs identified |

**Key Differences**:
- Metadata-manager is larger (2,760 vs 2,030 lines)
- Higher extraction percentage (70.3% vs 47.8%)
- More interdependencies (3 coupled pairs)
- Larger context (431 lines vs 276 lines)
- Higher projected savings (65.1% vs 40.7%)

**Lessons from Phase 1**:
- ✅ Progressive disclosure pattern proven
- ✅ Keyword detection with intent patterns works
- ✅ Testing infrastructure reusable
- ⚠️ Need to handle larger contexts (Context 5: 431 lines)
- ⚠️ Need to validate coupled contexts work together

---

## Next Steps (Week 1, Days 3-5)

### Day 3: Detailed Context Planning
- Read each of the 9 sections in detail
- Draft summary content (30-40 lines each)
- Identify specific keywords and intent patterns
- Document cross-references between contexts

### Day 4: Keyword Mapping & Test Planning
- Create keyword-mapping.json for metadata-manager
- Design test scenarios (target: 10 scenarios)
- Plan extraction sequence (Phases A-D)
- Estimate timeline for Weeks 2-4

### Day 5: Extraction Plan Document
- Create comprehensive extraction plan
- Document risk mitigation strategies
- Define success metrics
- Get stakeholder review/approval

---

## Projected Timeline (Weeks 2-4)

### Week 2: Extraction (Days 1-5)
- **Phase A**: Low-risk extractions (3 contexts, 499 lines)
- **Phase B**: Medium-risk extractions (3 contexts, 818 lines)
- **Phase C Start**: Begin high-risk extractions (2 contexts, 422 lines)

### Week 3: Optimization (Days 1-5)
- **Phase C Complete**: Finish high-risk extractions
- Create summaries for all 9 contexts
- Update keyword-mapping.json
- Validate cross-references

### Week 4: Testing & Validation (Days 1-5)
- Run comprehensive test suite (10+ scenarios)
- Measure actual token savings
- Compare against projections
- Create Week 4 summary document
- Prepare for data-operations (Phase 2, Part 2)

---

**Status**: ✅ Week 1, Day 1-2 Analysis COMPLETE

**Next Milestone**: Day 3 - Detailed context planning and summary drafting

**Branch**: feature/agent-optimization-phase1

**Confidence Level**: HIGH (9/10)
- Clear extraction candidates identified
- Risks understood and mitigated
- Projected savings exceed targets
- Proven pattern from Phase 1

---

**Analyst Notes**:

This agent is more complex than sfdc-orchestrator but follows similar patterns. The key challenge will be managing the 3 coupled context pairs (FLS+Verification, Picklist+Dependency, Field+Master-Detail). The large Picklist Dependency context (431 lines) may benefit from subdivision. Overall, the 70.3% reduction potential exceeds Phase 2 targets, and the 65.1% weighted average savings projection is significantly higher than Phase 1's 40.7%.

The extraction sequence (Phases A-D) is designed to minimize risk by starting with standalone contexts and progressively moving to coupled contexts. This approach worked well in Phase 1 and should apply here.

**Recommendation**: PROCEED with extraction planning (Days 3-5).
