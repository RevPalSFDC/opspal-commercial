# Common Tasks Reference - Detailed Guide

**Context Type**: Progressive Disclosure (loaded on-demand)
**Priority**: Low
**Trigger**: When user message contains: `example`, `how to`, `walkthrough`, `tutorial`, `show me`, `step by step`
**Estimated Tokens**: 1,296

---

## Overview

Step-by-step examples for frequently performed metadata management tasks. This context provides complete walkthroughs with commands, expected outcomes, and troubleshooting tips.

**Purpose**: Reference examples and patterns for common metadata operations.

---

## Enhanced Common Tasks with Validation

### Creating Validated New Field

Complete validated field creation workflow with comprehensive checks:

```bash
# Complete validated field creation workflow
create_validated_field() {
    local object_name=$1
    local field_name=$2
    local field_spec=$3

    echo "🚀 Starting validated field creation: ${object_name}.${field_name}"

    # STEP 1: Validate field design
    if ! node scripts/lib/metadata-validator.js validate-new-field \
        --object "${object_name}" \
        --field "${field_name}" \
        --spec "${field_spec}"; then
        echo "❌ Field design validation failed"
        return 1
    fi

    # STEP 2: Generate metadata with validation
    node scripts/lib/validated-metadata-generator.js generate-field \
        --object "${object_name}" \
        --field "${field_name}" \
        --spec "${field_spec}" \
        --output "force-app/main/default/objects/${object_name}/fields/${field_name}.field-meta.xml"

    # STEP 3: Generate validated package
    generate_validated_metadata_package "${object_name}" "${field_name}"

    # STEP 4: Deploy with comprehensive validation
    deploy_field_with_comprehensive_validation \
        "manifest/generated-package.xml" \
        "${object_name}" \
        "${field_name}"

    # STEP 5: Final validation and health check
    if comprehensive_field_health_check "${object_name}" "${field_name}"; then
        echo "✅ Validated field creation completed successfully"
        return 0
    else
        echo "❌ Field health check failed"
        return 1
    fi
}
```

**What This Does**:
1. Validates field design before any changes
2. Generates metadata with validation checks
3. Creates deployment package
4. Deploys with comprehensive validation
5. Runs final health check

**Use When**: Creating any new custom field that requires validation.

---

### Validation Rule Creation with Flow Impact Analysis

Create validation rules with comprehensive flow compatibility checking:

```bash
# Create validation rules with comprehensive flow compatibility checking
create_validation_rule_with_flow_analysis() {
    local object_name=$1
    local rule_name=$2
    local formula=$3

    echo "🔍 Creating validation rule with flow impact analysis..."

    # STEP 1: Analyze formula for flow-blocking patterns
    if echo "${formula}" | grep -q "PRIORVALUE"; then
        echo "⚠️  PRIORVALUE detected - analyzing flow impact..."

        local flow_impact
        flow_impact=$(node scripts/lib/flow-impact-analyzer.js analyze-validation-rule \
            --object "${object_name}" \
            --formula "${formula}" \
            --check-flow-compatibility)

        if [[ "${flow_impact}" == "blocking" ]]; then
            echo "🚨 Validation rule will block flows - suggesting alternatives..."
            node scripts/lib/flow-safe-validator-generator.js suggest-alternatives \
                --object "${object_name}" \
                --original-formula "${formula}"
            return 1
        fi
    fi

    # STEP 2: Create validation rule with validation framework
    node scripts/lib/validated-validation-rule-creator.js create \
        --object "${object_name}" \
        --rule-name "${rule_name}" \
        --formula "${formula}" \
        --validate-syntax \
        --check-dependencies

    echo "✅ Validation rule created with flow compatibility validation"
}
```

**What This Does**:
1. Detects PRIORVALUE usage in formula
2. Analyzes impact on existing flows
3. Suggests alternatives if blocking detected
4. Creates validation rule with full checks

**Critical Pattern**: PRIORVALUE in validation rules can block before-update flows.

**Use When**: Creating validation rules that may interact with flows.

---

### Batch Metadata Deployment with Comprehensive Validation

Enhanced batch deployment with validation framework:

```bash
# Enhanced batch deployment with validation framework
deploy_metadata_batch_with_validation() {
    local package_manifest=$1
    local org_alias=${2:-$SF_TARGET_ORG}

    echo "🚀 Starting batch metadata deployment with comprehensive validation..."

    # STEP 1: Validate entire package
    if ! node scripts/lib/metadata-package-validator.js validate-batch \
        --manifest "${package_manifest}" \
        --org "${org_alias}" \
        --comprehensive-check; then
        echo "❌ Package validation failed"
        return 1
    fi

    # STEP 2: Analyze deployment sequence
    local deployment_plan
    deployment_plan=$(node scripts/lib/metadata-deployment-planner.js plan \
        --manifest "${package_manifest}" \
        --org "${org_alias}" \
        --optimize-sequence)

    # STEP 3: Execute phased deployment with validation
    while IFS= read -r deployment_phase; do
        echo "📦 Deploying phase: ${deployment_phase}"

        if ! node scripts/lib/validated-metadata-deployer.js deploy-phase \
            --phase "${deployment_phase}" \
            --org "${org_alias}" \
            --validation-required; then
            echo "❌ Phase deployment failed: ${deployment_phase}"
            return 1
        fi

        # Validate phase completion
        if ! validate_deployment_phase_completion "${deployment_phase}" "${org_alias}"; then
            echo "❌ Phase validation failed: ${deployment_phase}"
            return 1
        fi

    done <<< "${deployment_plan}"

    # STEP 4: Final comprehensive validation
    if comprehensive_metadata_health_check "${package_manifest}" "${org_alias}"; then
        echo "✅ Batch metadata deployment completed with full validation"
        return 0
    else
        echo "❌ Final validation failed"
        return 1
    fi
}
```

**What This Does**:
1. Validates entire package before deployment
2. Analyzes optimal deployment sequence (Order of Operations)
3. Executes phased deployment with validation at each phase
4. Runs comprehensive final health check

**Key Pattern**: Phased deployment prevents partial failures and allows rollback.

**Use When**: Deploying packages with multiple metadata components.

---

## Additional Common Tasks

### Deploy Custom Field with FLS

**See**: `contexts/metadata-manager/fls-field-deployment.md` for complete FLS-aware field deployment pattern.

**Quick Example**:
```bash
node scripts/lib/fls-aware-field-deployer.js Account \
  '{"fullName":"CustomField__c","type":"Text","length":255}' \
  --org myorg
```

---

### Create Flow with Validation

**See**: `contexts/metadata-manager/flow-management-framework.md` for complete flow management lifecycle.

**Quick Example**:
```bash
# Validate best practices first
node scripts/lib/flow-best-practices-validator.js ./flows/MyFlow.flow-meta.xml

# Deploy with version management
node scripts/lib/ooo-metadata-operations.js deployFlowWithVersionManagement \
  MyFlow ./flows/MyFlow.flow-meta.xml myorg --cleanup --keep 5
```

---

### Modify Picklist Values Safely

**See**: `contexts/metadata-manager/picklist-modification-protocol.md` for complete safe picklist modification patterns.

**Quick Pattern**:
1. Query all record types for object
2. Retrieve picklist metadata
3. Add value to ALL record types
4. Deploy atomically

---

### Create Master-Detail Relationship

**See**: `contexts/metadata-manager/master-detail-relationship.md` for complete master-detail patterns.

**Quick Pattern**:
1. Validate master object exists
2. Create master-detail field metadata
3. Deploy with FLS-aware pattern
4. Wait 15-30 minutes before layout deployment

---

### Bulk Field Deployment

**See**: `contexts/metadata-manager/bulk-operations.md` for complete bulk processing patterns.

**Quick Example**:
```javascript
const bulkDeployer = new BulkMetadataDeployer({ orgAlias, parallelLimit: 5 });

await bulkDeployer.deployMultipleFields([
    { object: 'Account', field: fieldMeta1 },
    { object: 'Contact', field: fieldMeta2 }
], { atomic: false, continueOnError: true });
```

---

### Verify Field Deployment

**See**: `contexts/metadata-manager/field-verification-protocol.md` for complete verification patterns.

**Quick Pattern**:
```bash
# Schema verification (no FLS required)
sf schema field list --object Account --json | jq '.result[] | select(.name == "CustomField__c")'

# FLS verification
sf data query --query "SELECT PermissionsRead FROM FieldPermissions
  WHERE Field = 'Account.CustomField__c' AND Parent.Name = 'AgentAccess'"
```

---

### Load Runbook Context

**See**: `contexts/metadata-manager/runbook-context-loading.md` for complete runbook loading patterns.

**Quick Example**:
```bash
node scripts/lib/runbook-context-extractor.js \
    --org myorg \
    --operation-type metadata \
    --format summary
```

---

## Troubleshooting Common Issues

### Issue: Field Deployment Fails Verification

**Symptom**: Field deployed but verification reports "field not found"

**Cause**: Agent lacks FLS permissions

**Solution**: Use FLS-aware atomic deployment pattern:
```bash
node scripts/lib/fls-aware-field-deployer.js Account '{"fullName":"Field__c","type":"Text","length":255}' --org myorg
```

---

### Issue: Flow Deployment Fails with "Missing Field Reference"

**Symptom**: Flow references field that doesn't exist yet

**Cause**: Field not deployed before flow

**Solution**: Follow Order of Operations:
1. Deploy fields first (with FLS)
2. Verify field exists
3. Then deploy flow inactive
4. Verify flow references
5. Activate flow

---

### Issue: Picklist Value Not Visible for Some Users

**Symptom**: New picklist value added but users can't see it

**Cause**: Record type accessibility not updated

**Solution**: Update ALL record types when adding picklist values:
```javascript
await addPicklistValueToAllRecordTypes('Account', 'Industry', 'New Value', allRecordTypes);
```

---

### Issue: Batch Deployment Partially Succeeds

**Symptom**: Some components deployed, others failed

**Cause**: Incorrect deployment sequence (Order of Operations violation)

**Solution**: Use phased deployment with dependency analysis:
```bash
node scripts/lib/metadata-deployment-planner.js plan --manifest package.xml --optimize-sequence
```

---

## Best Practices Summary

1. **Always Validate Before Deploy**: Use validation framework to catch issues early
2. **Follow Order of Operations**: Fields → FLS → Flows → Layouts
3. **Use Atomic Operations**: Deploy field + FLS together in single transaction
4. **Check Historical Context**: Load runbook to avoid known failures
5. **Verify After Deploy**: Run comprehensive health checks
6. **Handle Errors Gracefully**: Implement rollback strategies
7. **Test in Sandbox First**: Never test patterns directly in production

---

**When This Context is Loaded**: When user message contains keywords: `example`, `how to`, `walkthrough`, `tutorial`, `show me`, `step by step`, `guide`, `reference`

**Back to Core Agent**: See `agents/sfdc-metadata-manager.md` for overview

**Related Contexts**:
- `fls-field-deployment.md` - FLS-aware field deployment
- `flow-management-framework.md` - Flow lifecycle management
- `picklist-modification-protocol.md` - Safe picklist changes
- `master-detail-relationship.md` - Relationship management
- `bulk-operations.md` - Batch processing
- `field-verification-protocol.md` - Verification patterns
- `runbook-context-loading.md` - Historical context loading

---

**Context File**: `contexts/metadata-manager/common-tasks-reference.md`
**Lines**: 144 (original agent lines 2247-2391)
**Priority**: Low
**Related Scripts**: Multiple validation and deployment scripts
