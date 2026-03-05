# sfdc-data-operations Decomposition Analysis

**Current Size**: 2,619 lines
**Target Size**: 300-400 lines (orchestrator) + 3-4 specialists (400-500 lines each)

**Date**: 2025-10-30

---

## Domain Boundary Analysis

Based on structural analysis, identified **6 distinct domains** for data operations:

### Domain 1: Data Import/Export (Lines 2051-2105 + scattered, ~400 lines estimated)
**Responsibility**: CSV imports, bulk data uploads, data exports, format transformations

**Content** (currently scattered):
- CSV import validation and processing
- Bulk data upload patterns
- Data export to various formats
- File format transformations (CSV, Excel, JSON)
- Import error handling and retry logic
- Pre-import validation

**Specialist Agent**: `sfdc-data-import-specialist.md`
**Size**: ~450-500 lines

**Progressive Disclosure Contexts**:
- `contexts/data-import-troubleshooting.md` - CSV errors, encoding issues, field mapping
- `contexts/bulk-upload-optimization.md` - Batch sizing, memory management
- `contexts/data-export-formats.md` - Format-specific export patterns

---

### Domain 2: Data Quality Management (Lines 1841-1972 + validation sections, ~350 lines)
**Responsibility**: Data quality assessment, duplicate detection, data enrichment, validation

**Content**:
- Data quality enhancements (v3.2.0)
- Duplicate detection algorithms
- Data enrichment patterns
- Field completeness analysis
- Data validation frameworks
- Quality scoring metrics

**Specialist Agent**: `sfdc-data-quality-specialist.md`
**Size**: ~400-450 lines

**Progressive Disclosure Contexts**:
- `contexts/duplicate-detection-algorithms.md` - Fuzzy matching, multi-criteria
- `contexts/data-quality-scoring.md` - Quality metrics, thresholds
- `contexts/data-enrichment-strategies.md` - Enrichment patterns

---

### Domain 3: Bulk Operations & Parallelization (Lines 386-635, ~250 lines)
**Responsibility**: Bulk API management, parallelization, batch optimization

**Content**:
- Bulk Operations Decision Framework (lines 386-573)
- Advanced Parallelization for Data Operations (lines 574-635)
- Bulk API Job Status Checking (lines 1161-1271)
- Batch size optimization
- Parallel execution strategies
- Job monitoring and recovery

**Specialist Agent**: `sfdc-bulk-operations-specialist.md`
**Size**: ~500-550 lines

**Progressive Disclosure Contexts**:
- `contexts/bulk-api-optimization.md` - Batch sizing, memory limits
- `contexts/parallel-execution-patterns.md` - Concurrency patterns
- `contexts/job-monitoring-strategies.md` - Status tracking, error recovery

---

### Domain 4: Data Backup & Recovery (Lines 897-1160, ~263 lines)
**Responsibility**: Intelligent backup infrastructure, data snapshots, recovery procedures

**Content**:
- Intelligent Backup Infrastructure (NEW - Cohort #2, P1)
- Backup strategies and scheduling
- Data snapshot management
- Recovery procedures
- Backup validation
- Incremental vs full backups

**Specialist Agent**: `sfdc-data-backup-specialist.md`
**Size**: ~350-400 lines

**Progressive Disclosure Contexts**:
- `contexts/backup-scheduling-strategies.md` - Backup timing, frequency
- `contexts/recovery-procedures.md` - Restoration patterns
- `contexts/backup-validation.md` - Verification approaches

---

### Domain 5: Query Operations & Optimization (Lines 1272-1296 + scattered, ~300 lines estimated)
**Responsibility**: SOQL query construction, optimization, validation

**Content**:
- Query Validation (MANDATORY)
- Query optimization patterns
- Index utilization strategies
- Query performance monitoring
- SOQL best practices
- Governor limit management

**Decision**: Check if `sfdc-query-specialist` already handles this domain.

**If sfdc-query-specialist exists**: Reference it from orchestrator, don't create new specialist

**If doesn't exist**: Create `sfdc-query-specialist.md` (~400 lines)

---

### Domain 6: Data Transformation & Migration (Currently embedded, ~300 lines estimated)
**Responsibility**: Data transformations, field mapping, record type migrations, relationship updates

**Content** (currently scattered):
- Field mapping and transformation logic
- Record type migration patterns
- Relationship restructuring
- Data format conversions
- Lookup to master-detail conversions

**Specialist Agent**: `sfdc-data-transformation-specialist.md`
**Size**: ~350-400 lines

**Progressive Disclosure Contexts**:
- `contexts/field-mapping-patterns.md` - Complex transformation examples
- `contexts/relationship-migration.md` - Lookup to MD conversion patterns

---

## Cross-Cutting Concerns (Remain in Orchestrator)

### 1. Runbook Context Loading (Lines 39-385, ~346 lines)
**Decision**: Keep in orchestrator - applies to ALL data operations

**Content**:
- Pre-operation runbook check
- Known data quality issues
- Historical data operation strategies
- Object-specific data patterns
- Success metrics tracking

**Size in Orchestrator**: ~150 lines (condensed overview)
**Move to Context**: Detailed runbook procedures → `contexts/runbook-data-operations-detailed.md`

---

### 2. Org Resolution & Confirmation (Lines 636-720, ~84 lines)
**Decision**: Keep in orchestrator - applies to ALL operations

**Content**:
- Org alias validation
- Multi-org environment confirmation
- Prevent wrong-org operations
- User confirmation prompts

**Size in Orchestrator**: ~60 lines

---

### 3. Playbook Usage for Bulk Operations (Lines 721-806, ~85 lines)
**Decision**: Keep in orchestrator - guides specialist selection

**Content**:
- Playbook-driven operation selection
- When to use which specialist
- Bulk operation decision trees

**Size in Orchestrator**: ~50 lines

---

### 4. Multi-Object Ownership Discovery (Lines 807-896, ~89 lines)
**Decision**: CROSS-CUTTING - Keep in orchestrator or move to context

**Content**:
- Ownership discovery across objects
- Owner transfer patterns
- User status verification

**Size in Orchestrator**: ~40 lines (overview)
**Move to Context**: `contexts/ownership-transfer-patterns.md`

---

### 5. Pre-Operation State Validation (Lines 1297-1436, ~139 lines)
**Decision**: Keep in orchestrator - validates before delegation

**Content**:
- Evidence-based data operations (FP-008)
- Pre-operation validation checklist
- State verification before operations
- Validation framework integration

**Size in Orchestrator**: ~100 lines

---

### 6. Asana Integration (Lines 2466+, ~68 lines)
**Decision**: Keep in orchestrator

---

## Proposed Decomposition Structure

```
sfdc-data-operations.md (ORCHESTRATOR, 400-450 lines)
├─ Core responsibilities:
│  ├─ Receive data operation requests
│  ├─ Load runbook context (proven patterns)
│  ├─ Validate org and pre-operation state
│  ├─ Determine which specialist(s) to invoke
│  ├─ Coordinate multi-specialist operations
│  ├─ Handle cross-cutting concerns (org confirmation, playbooks, validation)
│  └─ Track Asana task updates
│
├─ Specialist agents (invoked by orchestrator):
│  ├─ sfdc-data-import-specialist.md (450-500 lines)
│  │  └─ CSV imports, bulk uploads, data exports
│  ├─ sfdc-data-quality-specialist.md (400-450 lines)
│  │  └─ Quality assessment, duplicate detection, enrichment
│  ├─ sfdc-bulk-operations-specialist.md (500-550 lines)
│  │  └─ Bulk API, parallelization, job monitoring
│  ├─ sfdc-data-backup-specialist.md (350-400 lines)
│  │  └─ Backup infrastructure, snapshots, recovery
│  └─ sfdc-data-transformation-specialist.md (350-400 lines)
│     └─ Field mapping, migrations, transformations
│
└─ Progressive disclosure contexts (loaded by hooks):
   ├─ contexts/runbook-data-operations-detailed.md (loaded on "runbook" keyword)
   ├─ contexts/bulk-optimization-guide.md (loaded on "bulk|performance" keywords)
   ├─ contexts/data-import-troubleshooting.md (loaded on "import error|failed" keywords)
   ├─ contexts/duplicate-detection-algorithms.md (loaded on "duplicate" keyword)
   ├─ contexts/backup-strategies.md (loaded on "backup|snapshot" keywords)
   └─ contexts/ownership-transfer-patterns.md (loaded on "ownership|owner" keywords)
```

**Note on sfdc-query-specialist**: Need to check if this agent already exists. If yes, orchestrator delegates query operations to it instead of creating new specialist.

---

## Token Savings Calculation

**Current State**:
- Every invocation loads: 2,619 lines (~23,000 tokens)

**After Decomposition**:

**Scenario 1: Simple CSV import**
- User invokes orchestrator: 420 lines
- Orchestrator delegates to sfdc-data-import-specialist: 480 lines
- Hook injects data-import-troubleshooting (on error only): 0 lines (no error)
- **Total**: 900 lines (~8,000 tokens) - **65% reduction**

**Scenario 2: Bulk data quality assessment**
- User invokes orchestrator: 420 lines
- Orchestrator delegates to:
  - sfdc-data-quality-specialist: 430 lines
  - sfdc-bulk-operations-specialist: 520 lines (for parallel processing)
- Hook injects bulk-optimization-guide: 150 lines
- **Total**: 1,520 lines (~14,000 tokens) - **39% reduction**

**Scenario 3: Complex import with backup + validation**
- User invokes orchestrator: 420 lines
- Orchestrator delegates to:
  - sfdc-data-backup-specialist: 380 lines (pre-import backup)
  - sfdc-data-quality-specialist: 430 lines (pre-import validation)
  - sfdc-data-import-specialist: 480 lines (execute import)
- Hook injects:
  - runbook-data-operations-detailed: 200 lines
  - data-import-troubleshooting: 180 lines
- **Total**: 2,090 lines (~19,000 tokens) - **17% reduction**

**Average Expected Savings**: 35-50%

---

## Delegation Patterns in Orchestrator

```yaml
# Pseudo-code for orchestrator logic

# 1. Always load runbook context first
load_runbook_context(org_alias, operation_type)

# 2. Validate org and confirm operation
confirm_org(org_alias)
validate_pre_operation_state()

# 3. Determine operation type and delegate
if operation includes "import|upload|export":
  delegate to sfdc-data-import-specialist
  if also includes "validate|quality":
    delegate to sfdc-data-quality-specialist first

if operation includes "duplicate|quality|enrich":
  delegate to sfdc-data-quality-specialist

if operation includes "bulk|batch|parallel|job":
  delegate to sfdc-bulk-operations-specialist

if operation includes "backup|snapshot|restore":
  delegate to sfdc-data-backup-specialist
  if also includes "import|export":
    create backup before delegating to import specialist

if operation includes "transform|migrate|map":
  delegate to sfdc-data-transformation-specialist

if operation includes "query|soql":
  check if sfdc-query-specialist exists
  if exists: delegate to sfdc-query-specialist
  else: handle in orchestrator with query validation

# 4. Track in Asana if linked
update_asana_task(operation_status)
```

---

## Comparison to sfdc-metadata-manager

| Aspect | sfdc-metadata-manager | sfdc-data-operations | Notes |
|--------|----------------------|---------------------|-------|
| **Domains** | 6 specialists | 5 specialists | Data ops fewer but more complex |
| **Cross-cutting** | OOO, validation | Runbook loading, org confirmation | Different concerns |
| **Token savings** | 40-55% | 35-50% | Similar savings |
| **Complexity** | High (dependencies) | Medium (less interdependency) | Data ops more independent |

**Key Difference**: Data operations have **less interdependency** between specialists compared to metadata operations. Import doesn't necessarily require quality check (though recommended). This makes delegation simpler.

---

## Implementation Dependencies

**Scripts Referenced** (ensure specialists have access):
- `scripts/lib/runbook-context-extractor.js` - Runbook loading
- `scripts/lib/bulk-operation-orchestrator.js` - Bulk API operations
- `scripts/lib/data-quality-analyzer.js` - Quality assessment
- `scripts/lib/duplicate-detector.js` - Duplicate detection
- `scripts/lib/csv-validator.js` - CSV validation
- `scripts/lib/backup-manager.js` - Backup operations
- `scripts/lib/safe-query-executor.js` - Query validation

**Shared Imports** (all agents include):
- `@import agents/shared/error-prevention-notice.yaml`
- `@import agents/shared/ooo-write-operations-pattern.md`
- `@import agents/shared/playbook-reference.yaml`

---

## Risk Assessment

**High Risks**:
- Runbook context loading must work across all specialists
- Org confirmation critical to prevent wrong-org operations
- Backup operations must complete before destructive operations

**Mitigations**:
- Orchestrator loads runbook BEFORE delegation
- Orchestrator enforces org confirmation at entry point
- Orchestrator sequences backup → destructive operation
- Test with non-production org first

**Medium Risks**:
- Query operations may need dedicated specialist (if doesn't exist)
- Bulk operations complex - may require orchestrator intervention

**Mitigations**:
- Check if sfdc-query-specialist exists, create if needed
- Bulk specialist has comprehensive job monitoring
- Orchestrator can intervene on bulk job failures

**Low Risks**:
- Token savings may not meet 35% target for complex operations
- Specialists may need to communicate (e.g., quality check before import)

**Mitigations**:
- Measure baseline before decomposition
- Orchestrator handles inter-specialist communication
- Progressive disclosure reduces context for simple operations

---

## Success Criteria

**Functional**:
- [ ] All current data operations still supported
- [ ] Runbook context loading works across specialists
- [ ] Org confirmation prevents wrong-org operations
- [ ] Backup-before-destructive pattern enforced

**Performance**:
- [ ] 35-50% token reduction measured
- [ ] Response time unchanged or improved
- [ ] Bulk operations performance maintained

**Quality**:
- [ ] No increase in data operation failures
- [ ] Data quality validation still enforced
- [ ] Backup/recovery procedures preserved

**Maintainability**:
- [ ] Specialists are independently testable
- [ ] Context files reduce code duplication
- [ ] Clear domain boundaries maintained

---

## Timeline for sfdc-data-operations Decomposition

**Week 4** (after sfdc-metadata-manager complete):
- Days 1-2: Create specialist agent templates (import, quality, bulk, backup, transformation)
- Days 3-4: Extract content from current agent into specialists
- Day 5: Create orchestrator with delegation logic

**Week 5**:
- Days 1-2: Create progressive disclosure contexts
- Day 3: Test runbook loading across specialists
- Days 4-5: Testing and validation

**Week 6**: Move to next agent (sfdc-orchestrator)

---

**Next Document**: `sfdc-orchestrator-analysis.md` (Week 1, Day 3-4)

**Cross-References**:
- See `agent-decomposition-analysis.md` for sfdc-metadata-manager decomposition
- See overall implementation plan in `docs/agent-optimization-implementation-plan.md` (to be created)
