# Context Summaries for Base Agent - Phase D

**Purpose**: These summaries replace the extracted content in the base agent (sfdc-metadata-manager.md). They provide high-level overviews and direct users to load full contexts when needed.

**Total Lines**: ~270 lines (9 contexts × 30 lines)

---

## Context 1: Flow Management Framework

Complete flow lifecycle management with version control, best practices validation, and safe deployment patterns.

**When to Load Full Context**: When user message contains keywords: `flow`, `automation`, `activate flow`, `deactivate flow`, `flow version`, `deploy flow`, `flow definition`, `flow lifecycle`

**Key Capabilities**:
- Flow version management with automatic incrementing and rollback
- Best practices validation requiring 70/100 compliance score
- Anti-pattern detection (DML in loops, SOQL in loops, hard-coded IDs)
- 9-step safe deployment sequence: inactive → verify → activate → test
- Automatic cleanup of old versions (keep last 5)
- Smoke testing with test record creation and validation

**Critical Rules**:
- ALWAYS validate best practices before deployment
- NEVER activate flows without version management
- Block deployment if compliance score < 70 or CRITICAL violations found
- Use deployFlowWithVersionManagement() (NOT deployFlowSafe alone)

**Related Tools**:
- `flow-version-manager.js` - Version operations
- `flow-best-practices-validator.js` - Compliance checking
- `ooo-metadata-operations.js` - Safe deployment orchestration

**Full Context**: Load from `contexts/metadata-manager/flow-management-framework.md` (222 lines, 1,998 tokens)

---

## Context 2: Runbook Context Loading

Dynamic runbook loading for org-specific operational context and historical knowledge.

**When to Load Full Context**: When user message contains keywords: `runbook`, `operational context`, `org-specific`, `load context`, `runbook context`, `instance context`, `org runbook`, `operational playbook`

**Key Capabilities**:
- Load org-specific runbook from `instances/<org>/RUNBOOK.md`
- Extract relevant context based on operation type (metadata, data, deployment)
- 50-100ms context extraction (minimal performance impact)
- Prevents recurring metadata failures by loading historical knowledge
- Automatic fallback to general patterns if no runbook exists

**Usage Pattern**:
```javascript
const context = extractRunbookContext(orgAlias, {
    operationType: 'metadata',
    maxTokens: 2000
});
// Context includes known exceptions, recommended approaches, org quirks
```

**Benefits**:
- Prevents repeating known failures
- Org-specific customization awareness
- Historical deployment patterns
- Known gotchas and workarounds

**Full Context**: Load from `contexts/metadata-manager/runbook-context-loading.md` (262 lines, 1,944 tokens)

---

## Context 3: FLS-Aware Field Deployment

Atomic field deployment with automatic FLS bundling that prevents 40% of verification failures.

**When to Load Full Context**: When user message contains keywords: `field deployment`, `FLS`, `field-level security`, `custom field`, `deploy field`, `create field`, `add field`, `field permissions`, `FLS bundling`, `atomic field`

**Key Capabilities**:
- Deploy field + permission set in single atomic transaction
- Automatic FLS bundling with AgentAccess permission set
- Two-phase verification (schema + FLS) - no false failures
- Auto-assignment to integration user
- MCP tools integration for streamlined workflow
- Auto-excludes required fields from permission sets

**Critical Pattern**:
```javascript
const deployer = new FLSAwareFieldDeployer({ orgAlias });
await deployer.deployFieldWithFLS('Account', fieldMetadata);
// Field immediately queryable - no verification failures
```

**Why This Matters**: Old approach deployed field first, then FLS separately, causing 40% false verification failures when agents tried to verify before FLS propagated.

**Coupled Contexts**: Works with Field Verification Protocol for post-deployment validation.

**Full Context**: Load from `contexts/metadata-manager/fls-field-deployment.md` (199 lines, 1,791 tokens)

---

## Context 4: Picklist Modification Protocol

Safe picklist modification preventing 100% of record type accessibility failures.

**When to Load Full Context**: When user message contains keywords: `picklist`, `picklist values`, `add value`, `modify picklist`, `record type`, `picklist modification`, `update picklist`, `picklist value`, `record type access`

**Key Capabilities**:
- Two-phase metadata model (field + record type)
- Atomic updates using UnifiedPicklistManager
- Auto-discovers all record types (instance-agnostic)
- Built-in post-deployment verification
- One-line verify-and-fix pattern for discrepancies

**Critical Understanding**: Salesforce requires TWO metadata operations:
1. Field metadata (defines values org-wide)
2. Record type metadata (controls accessibility per record type)

**WRONG Pattern** (causes "Value not found" errors):
```javascript
// Updating only field metadata
await updateFieldMetadata(picklist);
```

**RIGHT Pattern** (atomic update):
```javascript
const manager = new UnifiedPicklistManager({ org });
await manager.updatePicklistAcrossRecordTypes({
    objectName, fieldApiName, valuesToAdd, recordTypes: 'all'
});
```

**Coupled Contexts**: Extends to Picklist Dependency Deployment for controlling/dependent relationships.

**Full Context**: Load from `contexts/metadata-manager/picklist-modification-protocol.md` (165 lines, 1,485 tokens)

---

## Context 5: Picklist Dependency Deployment

Complete picklist dependency management including controlling/dependent field handling.

**When to Load Full Context**: When user message contains keywords: `picklist dependency`, `controlling field`, `dependent field`, `picklist cascade`, `field dependency`, `picklist relationship`, `dependent picklist`, `controlling picklist`

**Key Capabilities**:
- 7-step deployment playbook for dependency creation
- Dependency matrix configuration (controlling value → dependent values)
- Global Value Set integration
- PicklistDependencyManager for automated deployment
- Comprehensive validation before deployment

**Critical Complexity**: Picklist dependencies require special metadata handling:
1. controllingField attribute must be set
2. valueSettings array defines dependency matrix
3. Record type metadata updated for both fields atomically
4. Deployment order: Global Sets → Controlling Field → Dependent Field → Record Types

**Example Dependency**:
```javascript
const dependencyMatrix = {
    'Technology': ['SaaS', 'Hardware', 'Services'],
    'Finance': ['Banking', 'Insurance', 'Investment'],
    'Healthcare': ['Provider', 'Payer', 'Pharma']
};
// Industry controls Account_Type__c
```

**NEVER DO**: Deploy dependencies without validation, create circular dependencies, use Tooling API for dependencies.

**Coupled Contexts**: Builds on Picklist Modification Protocol for basic picklist operations.

**Full Context**: Load from `contexts/metadata-manager/picklist-dependency-deployment.md` (431 lines, 3,879 tokens) - LARGEST CONTEXT

---

## Context 6: Master-Detail Relationship

Master-detail relationship creation and modification with propagation handling.

**When to Load Full Context**: When user message contains keywords: `master-detail`, `relationship`, `cascade`, `reparenting`, `rollup`, `master-detail field`, `relationship field`, `cascading delete`, `relationship propagation`

**Key Capabilities**:
- Master-Detail propagation protocol (15-30 min delays)
- Two deployment strategies (manual UI vs automated API)
- MetadataPropagationWaiter for automated waiting
- Permission set validation and propagation
- 5-phase mandatory workflow

**Critical Understanding**: 15-30 minute propagation is NORMAL - NOT a deployment failure. Salesforce metadata indexing requires time before related lists become available in layouts.

**Deployment Strategies**:
1. **Manual UI Approach**: Works immediately (best for ad-hoc changes)
2. **Automated API Approach**: Requires 15-30 min wait (required for CI/CD)

**Common Error**: `Cannot find related list: Children`
- **Cause**: Master-Detail not yet propagated
- **Solution**: Use MetadataPropagationWaiter or manual UI

**Integration**: Uses FLS-Aware Field Deployment for atomic field + permission creation.

**Full Context**: Load from `contexts/metadata-manager/master-detail-relationship.md` (202 lines, 1,818 tokens)

---

## Context 7: Field Verification Protocol

Comprehensive field and FLS verification protocol for validating deployments.

**When to Load Full Context**: When user message contains keywords: `verify field`, `field verification`, `schema check`, `FLS verification`, `validate field`, `check field`, `field validation`, `verify FLS`, `verify deployment`, `post-deployment check`

**Key Capabilities**:
- 4-phase validation framework (pre-deployment, monitoring, post-deployment, recovery)
- 5-step post-deployment verification
- Design validation, conflict detection, dependency validation, impact analysis
- Automated recovery process with failure analysis
- Schema-based verification (no FLS required)

**Verification Phases**:
1. **Pre-Deployment**: Design, conflicts, dependencies, impact analysis
2. **Deployment Monitoring**: Real-time validation during deployment
3. **Post-Deployment**: Existence, SOQL access, permissions, integrity, cache consistency
4. **Recovery**: Failure analysis and automated remediation

**Common Validation Failures**:
- Field exists but not queryable (FLS not propagated)
- Cache inconsistency (stale metadata cache)
- Permission propagation delay (30-60 seconds)
- Metadata lock (another deployment in progress)

**Coupled Contexts**: Verifies deployments from FLS-Aware Field Deployment.

**Full Context**: Load from `contexts/metadata-manager/field-verification-protocol.md` (223 lines, 2,007 tokens)

---

## Context 8: Common Tasks Reference

Reference examples for common metadata management tasks with step-by-step walkthroughs.

**When to Load Full Context**: When user message contains keywords: `example`, `how to`, `walkthrough`, `tutorial`, `show me`, `step by step`, `guide`, `reference`, `task example`, `common tasks`

**Key Capabilities**:
- Validated field creation with comprehensive checks
- Validation rule creation with flow impact analysis
- Batch metadata deployment with validation
- Complete walkthroughs for frequent operations
- Troubleshooting guides with solutions

**Example Tasks**:
- Deploy custom field with FLS
- Create flow with validation
- Modify picklist values safely
- Create master-detail relationship
- Bulk field deployment
- Verify field deployment

**Usage**: Load when user asks for examples, how-to guides, or step-by-step instructions.

**Cross-References**: References all other contexts for detailed patterns.

**Full Context**: Load from `contexts/metadata-manager/common-tasks-reference.md` (394 lines, 1,296 tokens)

---

## Context 9: Bulk Operations

Bulk metadata operations for managing multiple components at scale with parallel processing.

**When to Load Full Context**: When user message contains keywords: `bulk`, `batch`, `multiple objects`, `mass operation`, `bulk deploy`, `batch operation`, `multiple fields`, `parallel`, `mass update`, `batch processing`

**Key Capabilities**:
- 4 mandatory patterns for 15x performance improvement
- Parallel metadata deployment (30s → 2s for 30 components)
- Batched validation checks (15s → 800ms)
- Parallel retrieval operations (16s → 1.2s)
- Cache-first component checks (9s → 600ms)

**Performance Improvements**:
- Deploy 30 components: 30,000ms → 2,000ms (15x faster)
- Validate 30 components: 15,000ms → 800ms (18.8x faster)
- Retrieve 20 objects: 16,000ms → 1,200ms (13.3x faster)
- Check 30 components: 9,000ms → 600ms (15x faster)

**Pattern**: Replace sequential `for` loops with `Promise.all()` for independent operations.

**WRONG**:
```javascript
for (const component of components) {
  await deployComponent(component);
}
```

**RIGHT**:
```javascript
await Promise.all(components.map(c => deployComponent(c)));
```

**Caution**: Respect Order of Operations - don't parallelize components with dependencies.

**Full Context**: Load from `contexts/metadata-manager/bulk-operations.md` (360 lines, 1,251 tokens)

---

## Summary Statistics

**Total Context Summaries**: 9
**Total Summary Lines**: ~270 lines
**Total Extracted Lines**: 1,941 lines
**Average Summary per Context**: 30 lines
**Compression Ratio**: 7.2:1 (1,941 lines → 270 lines)

**Token Savings** (when contexts not loaded):
- Base agent before extraction: ~24,840 tokens
- Base agent after (with summaries): ~3,240 tokens (270 lines × 12 tokens/line)
- Savings: ~21,600 tokens (87% reduction)

**When Contexts Loaded** (weighted by usage frequency):
- Average contexts loaded per request: 1-2
- Average tokens added: ~2,000-4,000 tokens
- Net benefit: Still 65%+ token savings in typical scenarios

---

**Usage Instructions for Base Agent Integration**:

Replace the extracted sections in `sfdc-metadata-manager.md` with these summaries. Each summary:
1. Provides overview of capabilities
2. Lists trigger keywords for loading full context
3. Shows critical patterns or rules
4. References the full context file path
5. Notes any coupled contexts

**Next Steps**:
1. Update base agent with these summaries
2. Test progressive disclosure with 10 scenarios
3. Measure actual token savings
4. Create final Week 2 summary
