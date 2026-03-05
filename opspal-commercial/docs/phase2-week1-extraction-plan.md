# Phase 2 - Week 1: Extraction Plan for sfdc-metadata-manager

**Date**: 2025-10-30
**Phase**: Phase 2, Week 1 (Days 3-5)
**Agent**: sfdc-metadata-manager
**Status**: Extraction planning complete

---

## Context Summaries (9 Contexts)

### Context 1: Flow Management Framework (222 lines)

**Summary for Base Agent** (~35 lines):

```markdown
### Flow Management Overview

Complete flow lifecycle management with version control, best practices validation, and safe deployment patterns.

**When to Load Full Context**: When user message contains keywords: `flow`, `automation`, `activate flow`, `deactivate flow`, `flow version`, `deploy flow`

**Key Capabilities**:
- Flow version management with automatic incrementing
- Best practices validation (anti-pattern detection)
- Atomic deployment: inactive → verify → activate → test
- Automatic rollback on failure
- Version cleanup (keep last 5)

**Critical Anti-Patterns Blocked**:
- DML/SOQL operations inside loops (CRITICAL - will fail in production)
- Hard-coded Salesforce IDs
- Missing fault paths on DML elements

**Required Validation**:
- Run `flow-best-practices-validator.js` BEFORE deployment
- Minimum compliance score: 70/100 for production
- Block deployment if CRITICAL violations found

**Example Usage**:
```javascript
const validator = new FlowBestPracticesValidator({ flowPath, verbose: true });
const validation = await validator.validate();
if (validation.complianceScore < 70) throw new Error('Flow fails compliance');

await ooo.deployFlowWithVersionManagement('MyFlow', flowPath, { smokeTest, cleanup: true });
```

**Detailed Context**: See `contexts/metadata-manager/flow-management-framework.md` for complete framework, validation rules, and deployment patterns.
```

---

### Context 2: Runbook Context Loading (216 lines)

**Summary for Base Agent** (~30 lines):

```markdown
### Runbook Context Loading

Dynamically loads org-specific operational context to prevent recurring metadata failures using historical knowledge.

**When to Load Full Context**: When user message contains keywords: `runbook`, `org-specific`, `load context`, `operational context`

**Key Capabilities**:
- Extract org-specific metadata exceptions and patterns
- Pre-flight validation based on historical failures
- Known conflict detection (field history limits, validation rules, record types)
- Apply proven best practices from successful operations

**Usage Pattern**:
```javascript
const context = extractRunbookContext(orgAlias, { operationType: 'metadata' });

if (context.knownExceptions) {
    // Check for recurring metadata issues
    // Apply historical recommendations
}
```

**Common Prevented Failures**:
- Field history tracking limits (max 20 per object)
- Picklist value / record type conflicts
- FLS configuration issues
- Master-detail relationship timing issues

**Detailed Context**: See `contexts/metadata-manager/runbook-context-loading.md` for complete extraction patterns, exception handling, and pre-flight checks.
```

---

### Context 3: FLS-Aware Field Deployment (199 lines)

**Summary for Base Agent** (~35 lines):

```markdown
### FLS-Aware Field Deployment (MANDATORY)

Atomic field deployment with automatic FLS bundling in single transaction. Prevents 40% of verification failures.

**When to Load Full Context**: When user message contains keywords: `field deployment`, `FLS`, `custom field`, `deploy field`, `create field`, `field permissions`

**Breaking Change (Oct 2025)**: ALL field deployments MUST use FLS-aware atomic pattern.

**The Problem with Old Approach**:
1. Deploy field
2. Deploy permission set separately
3. Verify field ❌ FAILS - agent lacks FLS

**Required Pattern** (Atomic):
```javascript
const deployer = new FLSAwareFieldDeployer({ orgAlias, agentPermissionSet: 'AgentAccess' });
await deployer.deployFieldWithFLS('Account', fieldMetadata, { permissions: { read: true, edit: true } });
```

**What This Does**:
1. Generates field metadata XML
2. Creates/updates AgentAccess permission set with `<fieldPermissions>`
3. Deploys BOTH in single transaction (atomic)
4. Assigns permission set to integration user
5. Verifies via schema API (no FLS required)
6. Asserts FLS applied correctly

**Verification Strategy**: Two-phase (schema check + FLS check)

**Detailed Context**: See `contexts/metadata-manager/fls-field-deployment.md` for complete patterns, MCP tool integration, migration guide, and error recovery.
```

---

### Context 4: Picklist Modification Protocol (165 lines)

**Summary for Base Agent** (~32 lines):

```markdown
### Picklist Modification Protocol

Safe picklist modification preventing 100% of record type accessibility failures.

**When to Load Full Context**: When user message contains keywords: `picklist`, `picklist values`, `add value`, `modify picklist`, `record type`

**Critical Rule**: When modifying picklist values, MUST update ALL record types to maintain accessibility.

**The Problem**:
- Add picklist value without record type mapping
- Record type users cannot see new value
- Breaks existing functionality

**Required Pattern**:
```javascript
// 1. Query all record types for object
const recordTypes = await queryRecordTypes('Account');

// 2. Retrieve picklist metadata
const picklistMeta = await retrievePicklistMetadata('Account', 'Industry');

// 3. Add value to ALL record types
await addPicklistValueToAllRecordTypes('Account', 'Industry', 'New Value', recordTypes);

// 4. Deploy atomically
```

**Automatic Validation**: Script validates value appears in ALL record type mappings before deployment.

**Detailed Context**: See `contexts/metadata-manager/picklist-modification-protocol.md` for complete patterns, validation rules, and deployment sequences.
```

---

### Context 5: Picklist Dependency Deployment (431 lines - LARGEST)

**Summary for Base Agent** (~40 lines):

```markdown
### Picklist Dependency Management

Complete controlling/dependent picklist field deployment with cascade handling.

**When to Load Full Context**: When user message contains keywords: `picklist dependency`, `controlling field`, `dependent field`, `picklist cascade`, `field dependency`

**Key Concepts**:
- **Controlling Field**: Parent picklist that filters dependent field values
- **Dependent Field**: Child picklist with values filtered by controlling field selection
- **Value Matrix**: Mapping of which dependent values are valid for each controlling value

**Required Pattern**:
```javascript
// 1. Create controlling field first
await deployField('Account', controllingFieldMetadata);

// 2. Create dependent field
await deployField('Account', dependentFieldMetadata);

// 3. Define value dependencies
const valueDependencies = {
    'Controlling_Value_1': ['Dependent_A', 'Dependent_B'],
    'Controlling_Value_2': ['Dependent_C', 'Dependent_D']
};

// 4. Deploy dependency metadata
await deployPicklistDependency('Account', 'Controlling__c', 'Dependent__c', valueDependencies);
```

**Critical Validations**:
- Controlling field must exist before dependent field
- All controlling values must have dependent value mappings
- Record type accessibility maintained across both fields

**Complex Scenarios**: Cascading dependencies (3+ levels), cross-object dependencies, conditional visibility

**Detailed Context**: See `contexts/metadata-manager/picklist-dependency-deployment.md` for complete dependency patterns, matrix configuration, cascade handling, and troubleshooting.
```

---

### Context 6: Master-Detail Relationship (202 lines)

**Summary for Base Agent** (~33 lines):

```markdown
### Master-Detail Relationship Protocol

Master-detail field creation and modification with sharing propagation handling.

**When to Load Full Context**: When user message contains keywords: `master-detail`, `relationship`, `cascade`, `reparenting`, `rollup`

**Critical Differences from Lookup**:
- **Cascade Delete**: Deleting master deletes all detail records
- **Sharing Inheritance**: Detail records inherit master's sharing
- **Required Field**: Detail MUST have master value
- **Rollup Summaries**: Can create rollup fields on master
- **Reparenting**: Limited or disabled depending on org settings

**Required Pattern**:
```javascript
// 1. Validate master object exists and has required permissions
await validateMasterObject('Opportunity');

// 2. Create master-detail field
const mdField = {
    fullName: 'Opportunity__c',
    type: 'MasterDetail',
    referenceTo: 'Opportunity',
    relationshipLabel: 'Line Items',
    relationshipName: 'Line_Items',
    repadelta-corpMasterDetail: false  // Set carefully
};

await deployer.deployFieldWithFLS('OpportunityLineItem', mdField);

// 3. Wait for propagation (15-30 minutes) before layout deployment
```

**Critical Limitations**:
- Max 2 master-detail relationships per object
- Cannot convert existing lookup with data (must create new field)
- Sharing recalculation required after creation

**Detailed Context**: See `contexts/metadata-manager/master-detail-relationship.md` for complete patterns, conversion procedures, rollup summary setup, and propagation timing.
```

---

### Context 7: Field Verification Protocol (223 lines)

**Summary for Base Agent** (~30 lines):

```markdown
### Field Verification Protocol

Comprehensive field and FLS verification after deployment using schema APIs.

**When to Load Full Context**: When user message contains keywords: `verify field`, `field verification`, `schema check`, `FLS verification`, `post-deployment`

**Two-Phase Verification**:

**Phase 1: Schema Verification** (doesn't require FLS)
```bash
sf schema field list --object Account --json | jq '.result[] | select(.name == "CustomField__c")'
```

**Phase 2: FLS Verification** (confirms permission set)
```bash
sf data query --query "SELECT PermissionsRead, PermissionsEdit FROM FieldPermissions
  WHERE Field = 'Account.CustomField__c' AND Parent.Name = 'AgentAccess'"
```

**What is Verified**:
- Field exists in schema
- Field type matches specification
- Field-level security (read/edit) configured
- Permission set assigned to integration user
- Field is queryable by agent

**Error Recovery**: If verification fails, provides detailed diagnostics and remediation steps.

**Detailed Context**: See `contexts/metadata-manager/field-verification-protocol.md` for complete verification sequences, error handling, and troubleshooting.
```

---

### Context 8: Common Tasks Reference (144 lines)

**Summary for Base Agent** (~25 lines):

```markdown
### Common Tasks Reference

Step-by-step examples for frequently performed metadata management tasks.

**When to Load Full Context**: When user message contains keywords: `example`, `how to`, `walkthrough`, `tutorial`, `show me`

**Covered Scenarios**:
- Deploy custom field with FLS
- Create custom object with fields
- Modify picklist values safely
- Create flow with validation
- Set up master-detail relationship
- Configure permission sets
- Deploy metadata package
- Troubleshoot deployment failures

**Format**: Each example includes:
- Scenario description
- Step-by-step commands
- Expected outcomes
- Common pitfalls
- Troubleshooting tips

**Detailed Context**: See `contexts/metadata-manager/common-tasks-reference.md` for complete walkthroughs and examples.
```

---

### Context 9: Bulk Operations (139 lines)

**Summary for Base Agent** (~28 lines):

```markdown
### Bulk Metadata Operations

Batch processing for managing multiple metadata components at scale.

**When to Load Full Context**: When user message contains keywords: `bulk`, `batch`, `multiple objects`, `mass operation`, `bulk deploy`

**Supported Bulk Operations**:
- Deploy multiple fields across objects
- Update multiple permission sets
- Modify multiple picklist values
- Deploy multiple flows
- Bulk validation rule updates

**Pattern**:
```javascript
const bulkDeployer = new BulkMetadataDeployer({ orgAlias, parallelLimit: 5 });

await bulkDeployer.deployMultipleFields([
    { object: 'Account', field: fieldMeta1 },
    { object: 'Contact', field: fieldMeta2 },
    // ... up to 100 fields
], { atomic: false, continueOnError: true });
```

**Key Features**:
- Parallel processing (configurable limit)
- Error recovery and retry
- Progress tracking
- Atomic vs best-effort modes

**Detailed Context**: See `contexts/metadata-manager/bulk-operations.md` for complete patterns, error handling, and performance optimization.
```

---

## Extraction Sequence (4 Phases)

### Phase A: Low-Risk Extractions (Week 2, Days 1-2)

**Standalone contexts with no dependencies**

1. **Context 2: Runbook Context Loading** (216 lines)
   - Completely standalone
   - No coupling
   - Extract difficulty: LOW

2. **Context 8: Common Tasks Reference** (144 lines)
   - Documentation only
   - References other contexts but not coupled
   - Extract difficulty: LOW

3. **Context 9: Bulk Operations** (139 lines)
   - Wrapper around core operations
   - Uses base protocols only
   - Extract difficulty: LOW

**Phase A Total**: 499 lines extracted

**Expected Timeline**: 2 days
- Day 1: Extract all 3 contexts, create context files
- Day 2: Test extraction, validate no broken references

---

### Phase B: Medium-Risk Extractions (Week 2, Days 3-4)

**Self-contained but moderately complex**

4. **Context 1: Flow Management Framework** (222 lines)
   - References OOO protocol (stays in base)
   - Self-contained framework
   - Extract difficulty: MEDIUM

5. **Context 4: Picklist Modification Protocol** (165 lines)
   - Related to Context 5 but can extract separately
   - References record type protocols
   - Extract difficulty: MEDIUM

6. **Context 5: Picklist Dependency Deployment** (431 lines)
   - Extends Context 4
   - LARGEST context - may split into 5a (200 lines) + 5b (231 lines)
   - Extract difficulty: MEDIUM-HIGH

**Phase B Total**: 818 lines extracted (possibly 819 if split 5a/5b)

**Expected Timeline**: 2 days
- Day 3: Extract Context 1 and Context 4
- Day 4: Extract Context 5 (consider splitting), validate Context 4+5 work together

---

### Phase C: High-Risk Extractions (Week 2 Day 5 + Week 3 Days 1-2)

**Coupled contexts requiring careful coordination**

7. **Context 3: FLS-Aware Field Deployment** (199 lines)
   - Coupled with Context 7 (Field Verification)
   - Critical functionality
   - Extract difficulty: MEDIUM-HIGH

8. **Context 7: Field Verification Protocol** (223 lines)
   - Verifies Context 3 deployment patterns
   - Must extract together with Context 3
   - Extract difficulty: MEDIUM-HIGH

9. **Context 6: Master-Detail Relationship** (202 lines)
   - References Context 3 field deployment patterns
   - Extract after Context 3 stable
   - Extract difficulty: MEDIUM

**Phase C Total**: 624 lines extracted

**Expected Timeline**: 3 days
- Day 5 (Week 2): Extract Context 3 and Context 7 together
- Day 1 (Week 3): Validate Context 3+7 work correctly
- Day 2 (Week 3): Extract Context 6, validate references to Context 3

---

### Phase D: Optimization & Validation (Week 3, Days 3-5)

**Infrastructure and testing**

10. Create summaries for base agent (~270 lines of summaries, 9 contexts × 30 lines)
11. Update keyword-mapping.json with final keywords and test scenarios
12. Validate all cross-references work correctly
13. Run comprehensive test suite (10 scenarios)
14. Measure actual token savings
15. Compare against projections (65.1% target)

**Expected Timeline**: 3 days
- Day 3: Create all summaries, update keyword mapping
- Day 4: Run test suite, validate detection accuracy
- Day 5: Measure token savings, create Week 3 summary document

---

## Week-by-Week Timeline

### Week 2: Extraction (Days 1-5)
- **Monday-Tuesday**: Phase A (3 low-risk contexts, 499 lines)
- **Wednesday-Thursday**: Phase B (3 medium-risk contexts, 818 lines)
- **Friday**: Phase C Start (2 coupled contexts, 422 lines)

### Week 3: Optimization (Days 1-5)
- **Monday-Tuesday**: Phase C Complete (1 context, 202 lines) + validation
- **Wednesday**: Phase D - Create summaries and keyword mapping
- **Thursday**: Phase D - Run test suite and validation
- **Friday**: Phase D - Measure savings, create summary document

### Week 4: Final Validation (Days 1-5)
- **Monday-Tuesday**: Extended test scenarios, edge case testing
- **Wednesday**: Token savings verification, comparison with projections
- **Thursday**: Create comprehensive documentation
- **Friday**: Week 4 summary, prepare for data-operations (Phase 2, Part 2)

---

## Success Criteria

### Extraction Quality
- [ ] All 9 contexts extracted cleanly
- [ ] No broken cross-references
- [ ] Summaries provide clear routing criteria
- [ ] Each summary includes code examples

### Keyword Detection
- [ ] 10+ test scenarios pass
- [ ] Detection accuracy ≥95%
- [ ] False positive rate <5%
- [ ] Coupled contexts detected together

### Token Savings
- [ ] Base agent ≤850 lines (target: 819)
- [ ] Weighted average savings ≥60% (target: 65.1%)
- [ ] Simple operations: ≥65% savings
- [ ] Complex operations: ≥30% savings

### Testing
- [ ] All test scenarios pass
- [ ] Cross-references validated
- [ ] Coupled contexts work together
- [ ] No functionality lost

---

## Risk Mitigation Strategies

### Risk 1: Context 5 Too Large (431 lines)
**Mitigation**: Consider splitting into Context 5a (Basic, 200 lines) + Context 5b (Advanced, 231 lines)
**Decision Point**: After Phase B Day 4 extraction
**Criteria**: If keyword detection loads Context 5 too frequently for simple picklist operations

### Risk 2: Coupled Contexts Break (3 pairs)
**Mitigation**: Extract coupled pairs together, test immediately
**Validation**: Create specific test scenarios for each coupled pair
**Rollback**: Keep original agent file until all tests pass

### Risk 3: Cross-References Break
**Mitigation**: Document all cross-references before extraction
**Validation**: Grep for all context references in summaries
**Fix**: Update references to point to correct context files

### Risk 4: Token Savings Below Target
**Mitigation**: Adjust context sizes, split large contexts
**Threshold**: If weighted savings <60%, re-evaluate extraction
**Action**: Consider extracting additional sections or splitting contexts

---

## Testing Strategy

### Test Scenario Coverage

**Flow Management** (Context 1):
- Deploy new flow
- Activate existing flow
- Flow version rollback

**FLS Field Deployment** (Context 3 + 7):
- Deploy field with FLS
- Verify field exists
- Verify FLS applied

**Picklist Operations** (Context 4 + 5):
- Add picklist value
- Create dependent picklist
- Modify picklist with record types

**Master-Detail** (Context 6):
- Create master-detail relationship
- Verify cascade delete
- Rollup summary field

**Bulk Operations** (Context 9):
- Deploy multiple fields
- Bulk permission set updates

**Runbook Loading** (Context 2):
- Load org context
- Apply historical recommendations

**Common Tasks** (Context 8):
- Request example walkthrough
- Show how-to guide

**Simple Operations** (False Positive Check):
- Query metadata
- Describe object
- No contexts should load

---

## Commit Strategy

**After Each Phase**:
```bash
# Phase A complete
git add contexts/metadata-manager/*.md
git commit -m "feat: Phase 2 Week 2 Phase A - Extract 3 low-risk contexts"

# Phase B complete
git commit -m "feat: Phase 2 Week 2 Phase B - Extract 3 medium-risk contexts"

# Phase C complete
git commit -m "feat: Phase 2 Week 2-3 Phase C - Extract 3 high-risk coupled contexts"

# Phase D complete
git commit -m "feat: Phase 2 Week 3 Phase D - Summaries and validation complete"
```

**Weekly Summaries**:
```bash
# Week 2 complete
git commit -m "feat: Phase 2 Week 2 Complete - metadata-manager extraction done"

# Week 3 complete
git commit -m "feat: Phase 2 Week 3 Complete - metadata-manager optimization done"

# Week 4 complete
git commit -m "feat: Phase 2 Week 4 Complete - metadata-manager validation done (70.3% reduction)"
```

---

**Status**: ✅ Week 1 Days 3-5 Planning COMPLETE

**Next Milestone**: Week 2 Day 1 - Begin Phase A extractions

**Branch**: feature/agent-optimization-phase1

**Confidence**: HIGH (9.5/10) - Clear execution plan with risk mitigation

---

**Prepared by**: Agent Optimization Team
**Date**: 2025-10-30
