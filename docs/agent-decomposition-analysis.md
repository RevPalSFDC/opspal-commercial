# Agent Decomposition Analysis - Week 1

## Overview

Analysis of top 3 large agents (>2,000 lines) to identify domain boundaries and design hybrid decomposition strategy combining specialist agents + orchestrators with progressive disclosure.

**Date**: 2025-10-30
**Analysts**: Claude Code + User

---

## Analysis 1: sfdc-metadata-manager.md

**Current Size**: 2,760 lines
**Target Size**: 300-400 lines (orchestrator) + 4-5 specialists (300-500 lines each)

### Domain Boundary Analysis

Based on structural analysis (## headers), identified 9 distinct domains:

#### Domain 1: Flow Management (Lines 101-323, ~222 lines)
**Responsibility**: Flow lifecycle, versioning, validation, deployment

**Content**:
- Flow Management Framework documentation references
- Flow version management (MANDATORY rules)
- Flow best practices validation (anti-patterns, compliance scoring)
- Safe flow deployment sequence (5-step process)
- Flow activation verification

**Specialist Agent**: `sfdc-flow-manager.md`
**Size**: ~400-450 lines (comprehensive flow expertise)

**Progressive Disclosure Contexts**:
- `contexts/flow-troubleshooting.md` - Debugging flow issues
- `contexts/flow-anti-patterns.md` - Detailed anti-pattern catalog
- `contexts/flow-migration-guide.md` - Version migration procedures

---

#### Domain 2: Field Management (Lines 640-896, ~256 lines)
**Responsibility**: Field creation, FLS, field history tracking, field dependencies

**Content**:
- FLS-aware field deployment (Oct 2025 protocol)
- Field history tracking validation (20 field limit)
- Field-level security verification
- Field dependency detection
- Atomic field deployment patterns

**Specialist Agent**: `sfdc-field-manager.md`
**Size**: ~350-400 lines

**Progressive Disclosure Contexts**:
- `contexts/field-history-limits.md` - Detailed limit documentation
- `contexts/field-troubleshooting.md` - Common field deployment errors
- `contexts/field-migration-patterns.md` - Data migration with field changes

---

#### Domain 3: Picklist Management (Lines 985-1582, ~597 lines)
**Responsibility**: Picklist modifications, record type mapping, picklist dependencies

**Content**:
- Picklist Modification Protocol (prevents RT accessibility failures)
- GlobalValueSet management
- Record type picklist value mappings
- Picklist dependency deployment
- Picklist field creation with dependencies

**Specialist Agent**: `sfdc-picklist-manager.md`
**Size**: ~450-500 lines (complex domain with many edge cases)

**Progressive Disclosure Contexts**:
- `contexts/picklist-record-type-edge-cases.md` - Complex RT scenarios
- `contexts/picklist-formula-validation.md` - Formula restrictions with picklists
- `contexts/picklist-dependency-graph.md` - Dependency mapping examples

---

#### Domain 4: Layout Management (New Domain - Currently Embedded)
**Responsibility**: Page layouts, Lightning pages, field assignments

**Content** (currently scattered across file):
- Page layout field additions
- Lightning page modifications
- Field visibility rules
- Layout assignments to profiles/record types

**Specialist Agent**: `sfdc-layout-manager.md`
**Size**: ~300-350 lines

**Progressive Disclosure Contexts**:
- `contexts/layout-field-requirements.md` - Required fields per layout
- `contexts/lightning-page-patterns.md` - Lightning page best practices

---

#### Domain 5: Object Management (New Domain - Currently Embedded)
**Responsibility**: Custom objects, record types, object relationships

**Content** (currently scattered across file):
- Custom object creation
- Record type management
- Master-detail relationships (lines 1583-1785, ~202 lines)
- Lookup relationships
- Object deployment validation

**Specialist Agent**: `sfdc-object-manager.md`
**Size**: ~400-450 lines

**Progressive Disclosure Contexts**:
- `contexts/object-relationship-troubleshooting.md` - Relationship issues
- `contexts/master-detail-propagation.md` - Field propagation rules

---

#### Domain 6: Deployment Coordination (Lines 324-639, ~315 lines)
**Responsibility**: Orchestrating multi-component deployments, OOO enforcement

**Content**:
- Order of Operations (OOO) enforcement (lines 36-100, ~64 lines)
- Evidence-based deployment protocol
- Investigation tools (runbook loading)
- Deployment verification
- Atomic deployment sequences
- Pre-deployment validation

**Specialist Agent**: `sfdc-deployment-coordinator.md`
**Size**: ~500-550 lines (central coordination role)

**Progressive Disclosure Contexts**:
- `contexts/deployment-troubleshooting.md` - Deployment failure patterns
- `contexts/deployment-rollback-procedures.md` - Rollback strategies
- `contexts/order-of-operations-detailed.md` - Comprehensive OOO guide

---

#### Domain 7: Permission Set Management (Lines 840-984, ~144 lines)
**Responsibility**: Permission set operations, FLS, object access

**Content**:
- Permission set merge operations
- FLS assignment patterns
- Object permission management
- Two-tier permission architecture references

**Specialist Agent**: `sfdc-permission-coordinator.md` (or enhance existing sfdc-permission-orchestrator)
**Size**: ~300 lines (or skip if sfdc-permission-orchestrator handles this)

**Decision**: Check if `sfdc-permission-orchestrator` already covers this. If yes, reference it from metadata-manager orchestrator.

---

#### Domain 8: Validation Framework (Lines 1786-2551, ~765 lines)
**Responsibility**: Pre-deployment validation, metadata integrity checks

**Content**:
- Validation framework integration
- Dependency intelligence
- Field deployment verification
- Best practices validation
- Error recovery integration
- Real-time monitoring

**Decision**: This is CROSS-CUTTING - belongs in orchestrator or contexts

**Keep in Orchestrator**: Validation framework overview and when to use it
**Move to Context**: Detailed validation procedures loaded on errors/validation keywords

**Context File**: `contexts/validation-framework-detailed.md`

---

#### Domain 9: Bulk Operations (Lines 2552-2691, ~139 lines)
**Responsibility**: Multi-component deployments, bulk field creation

**Content**:
- Bulk field creation patterns
- Bulk layout updates
- Bulk permission set updates
- Performance optimization for bulk operations

**Decision**: This is a PATTERN, not a domain - can be handled by specialists

**Keep in Orchestrator**: Reference to bulk patterns
**Move to Context**: Detailed bulk operation examples loaded on "bulk" keyword

**Context File**: `contexts/bulk-operation-patterns.md`

---

#### Domain 10: Asana Integration (Lines 2692-2760, ~68 lines)
**Responsibility**: Task management integration for metadata operations

**Decision**: CROSS-CUTTING - keep in orchestrator

---

### Proposed Decomposition Structure

```
sfdc-metadata-manager.md (ORCHESTRATOR, 300-400 lines)
├─ Core responsibilities:
│  ├─ Receive user requests
│  ├─ Determine which specialist(s) to invoke
│  ├─ Coordinate multi-specialist operations (e.g., field + layout + deployment)
│  ├─ Enforce Order of Operations (OOO)
│  ├─ Handle cross-cutting concerns (validation, Asana, monitoring)
│  └─ Maintain backwards compatibility
│
├─ Specialist agents (invoked by orchestrator):
│  ├─ sfdc-flow-manager.md (400-450 lines)
│  │  └─ contexts/flow-troubleshooting.md
│  ├─ sfdc-field-manager.md (350-400 lines)
│  │  └─ contexts/field-troubleshooting.md
│  ├─ sfdc-picklist-manager.md (450-500 lines)
│  │  └─ contexts/picklist-edge-cases.md
│  ├─ sfdc-layout-manager.md (300-350 lines)
│  │  └─ contexts/layout-best-practices.md
│  ├─ sfdc-object-manager.md (400-450 lines)
│  │  └─ contexts/object-troubleshooting.md
│  └─ sfdc-deployment-coordinator.md (500-550 lines)
│     └─ contexts/deployment-troubleshooting.md
│
└─ Progressive disclosure contexts (loaded by hooks):
   ├─ contexts/order-of-operations-detailed.md (loaded on "deploy" keyword)
   ├─ contexts/validation-framework-detailed.md (loaded on "validate|error" keywords)
   ├─ contexts/bulk-operation-patterns.md (loaded on "bulk" keyword)
   ├─ contexts/permission-set-patterns.md (loaded on "permission" keyword)
   └─ contexts/troubleshooting-master-guide.md (loaded on "error|failed|conflict" keywords)
```

### Token Savings Calculation

**Current State**:
- Every invocation loads: 2,760 lines (~25,000 tokens)

**After Decomposition**:

**Scenario 1: Simple field deployment**
- User invokes orchestrator: 350 lines
- Orchestrator delegates to sfdc-field-manager: 380 lines
- Hook injects field-troubleshooting (on error only): 0 lines (no error)
- **Total**: 730 lines (~6,500 tokens) - **74% reduction**

**Scenario 2: Complex multi-component deployment**
- User invokes orchestrator: 350 lines
- Orchestrator delegates to:
  - sfdc-field-manager: 380 lines
  - sfdc-layout-manager: 320 lines
  - sfdc-deployment-coordinator: 520 lines
- Hook injects order-of-operations-detailed: 200 lines
- **Total**: 1,770 lines (~16,000 tokens) - **36% reduction**

**Scenario 3: Troubleshooting failed deployment**
- User invokes orchestrator: 350 lines
- Orchestrator delegates to sfdc-deployment-coordinator: 520 lines
- Hook injects:
  - deployment-troubleshooting: 250 lines
  - validation-framework-detailed: 200 lines
- **Total**: 1,320 lines (~12,000 tokens) - **52% reduction**

**Average Expected Savings**: 40-55%

---

### Delegation Patterns in Orchestrator

The orchestrator will use keyword detection and operation type to delegate:

```yaml
# Pseudo-code for orchestrator logic

if operation includes "field" keyword:
  delegate to sfdc-field-manager
  if also includes "layout":
    delegate to sfdc-layout-manager after field-manager completes
  if also includes "deploy":
    delegate to sfdc-deployment-coordinator at end

if operation includes "flow" keyword:
  delegate to sfdc-flow-manager

if operation includes "picklist" keyword:
  delegate to sfdc-picklist-manager
  if also includes "record type":
    ensure RT mapping handled

if operation includes "object" keyword:
  delegate to sfdc-object-manager
  if also includes "relationship":
    ensure relationship protocol followed

if operation includes "deploy" keyword at START:
  delegate to sfdc-deployment-coordinator
  coordinator determines which specialists to invoke
```

### Cross-Cutting Concerns (Remain in Orchestrator)

- **Order of Operations (OOO)**: Orchestrator enforces sequence across specialists
- **Validation Framework**: Orchestrator ensures validation called before delegation
- **Asana Integration**: Orchestrator handles task updates
- **Error Recovery**: Orchestrator coordinates recovery across specialists
- **Runbook Loading**: Orchestrator loads runbook context before delegation

---

### Implementation Dependencies

**Scripts Referenced** (ensure specialists have access):
- `scripts/lib/ooo-metadata-operations.js` - Atomic deployment operations
- `scripts/lib/flow-best-practices-validator.js` - Flow validation
- `scripts/lib/flow-version-manager.js` - Flow version operations
- `scripts/lib/deployment-source-validator.js` - Deployment validation
- `scripts/lib/field-history-tracker.js` - Field history limits
- `scripts/lib/picklist-dependency-analyzer.js` - Picklist dependencies

**Shared Imports** (all agents include):
- `@import agents/shared/error-prevention-notice.yaml`
- `@import agents/shared/playbook-reference.yaml`

---

### Next Steps (Complete Week 1)

1. ✅ Analyze sfdc-metadata-manager structure (COMPLETE)
2. ⏭️ Analyze sfdc-data-operations (2,619 lines)
3. ⏭️ Analyze sfdc-orchestrator (2,030 lines)
4. ⏭️ Design orchestrator delegation logic
5. ⏭️ Create specialist agent templates
6. ⏭️ Design keyword mapping config for progressive disclosure
7. ⏭️ Document full decomposition strategy

---

## Risk Assessment

**High Risks**:
- Cross-cutting operations may require multiple specialists (coordination complexity)
- OOO enforcement must work across specialist boundaries
- Backwards compatibility if users directly invoke "sfdc-metadata-manager"

**Mitigations**:
- Keep orchestrator as primary interface (transparent delegation)
- OOO logic stays in orchestrator or deployment-coordinator
- Validate with test cases before rollout
- Keep legacy agent available during transition

**Medium Risks**:
- Keyword detection may miss edge cases (wrong specialist invoked)
- Hook-based context injection may not trigger at right time

**Mitigations**:
- Comprehensive keyword mapping config with fallbacks
- Orchestrator can invoke multiple specialists if unclear
- Monitor agent routing success rates via hooks

**Low Risks**:
- Token savings may not meet 40% target
- Maintenance overhead of 6 agents vs 1

**Mitigations**:
- Measure baseline before decomposition
- Specialists share common patterns via @import
- Context files reduce duplication

---

## Success Criteria for sfdc-metadata-manager Decomposition

**Functional**:
- [ ] All current operations still supported
- [ ] Cross-cutting operations work correctly
- [ ] OOO enforcement maintained
- [ ] Backwards compatible with existing usage

**Performance**:
- [ ] 40-55% token reduction measured
- [ ] Response time unchanged or improved
- [ ] Agent routing success rate >95%

**Quality**:
- [ ] No increase in deployment failures
- [ ] Validation framework still enforced
- [ ] Error recovery works across specialists

**Maintainability**:
- [ ] Specialists are independently testable
- [ ] Context files reduce code duplication
- [ ] Clear domain boundaries maintained

---

## Timeline for sfdc-metadata-manager Decomposition

**Week 2**:
- Days 1-2: Create specialist agent templates (flow, field, picklist, layout, object, deployment)
- Days 3-4: Extract content from current agent into specialists
- Day 5: Create orchestrator with delegation logic

**Week 3**:
- Days 1-2: Create progressive disclosure contexts
- Day 3: Enhance user-prompt-submit.sh with keyword detection
- Days 4-5: Testing and validation

**Week 4**: Move to next agent (sfdc-data-operations)

---

**Next Document**: `sfdc-data-operations-analysis.md` (Week 1, Day 2-3)
