# Field Verification Protocol - Detailed Guide

**Context Type**: Progressive Disclosure (loaded on-demand)
**Priority**: Medium
**Trigger**: When user message contains: `verify field`, `field verification`, `schema check`, `FLS verification`, `validate field`
**Estimated Tokens**: 2,007

---

## Overview

Comprehensive field and FLS verification protocol for validating deployments. This framework includes pre-deployment validation, post-deployment verification, and automated recovery processes to ensure field deployments are successful and queryable.

**Key Benefits**: Prevents 40% of post-deployment issues through comprehensive validation at multiple stages.

---

## Enhanced Field Deployment Verification Protocol

**MANDATORY**: All field operations now include comprehensive validation framework integration.

### 1. Pre-Deployment Validation (COMPREHENSIVE)
```bash
# Enhanced pre-deployment validation
validate_field_before_deployment() {
    local object_name=$1
    local field_name=$2
    local org_alias=$3

    echo "🔍 Starting comprehensive field validation..."

    # STEP 1: Design validation
    if ! node scripts/lib/metadata-validator.js validate-field-design \
        --object "${object_name}" \
        --field "${field_name}" \
        --org "${org_alias}"; then
        echo "❌ Field design validation failed"
        return 1
    fi

    # STEP 2: Conflict detection
    if ! node scripts/lib/metadata-conflict-detector.js check-field-conflicts \
        --object "${object_name}" \
        --field "${field_name}" \
        --org "${org_alias}"; then
        echo "❌ Field conflict detection failed"
        return 1
    fi

    # STEP 3: Dependency validation
    if ! node scripts/lib/metadata-dependency-validator.js validate-field-dependencies \
        --object "${object_name}" \
        --field "${field_name}" \
        --org "${org_alias}"; then
        echo "❌ Field dependency validation failed"
        return 1
    fi

    # STEP 4: Impact analysis
    if ! node scripts/lib/metadata-impact-analyzer.js analyze-field-impact \
        --object "${object_name}" \
        --field "${field_name}" \
        --org "${org_alias}"; then
        echo "❌ Field impact analysis failed"
        return 1
    fi

    echo "✅ Pre-deployment validation passed"
    return 0
}
```

### 2. Validated Deployment with Dependency-Aware Monitoring
```bash
# Enhanced deployment with dependency and validation monitoring
deploy_field_with_comprehensive_validation() {
    local manifest=$1
    local object_name=$2
    local field_name=$3
    local org_alias=${4:-$SF_TARGET_ORG}

    echo "🚀 Starting dependency-aware field deployment..."

    # Check dependencies first
    node scripts/lib/dependency-analyzer.js check-field \
        --object "${object_name}" \
        --field "${field_name}" \
        --org "${org_alias}"

    if [ $? -ne 0 ]; then
        echo "❌ Dependency check failed - resolving..."
        node scripts/lib/conflict-detector.js resolve \
            --object "${object_name}" \
            --field "${field_name}" \
            --auto-resolve
    fi

    # Pre-deployment validation
    if ! validate_field_before_deployment "${object_name}" "${field_name}" "${org_alias}"; then
        echo "❌ Pre-deployment validation failed - blocking deployment"
        return 1
    fi

    # Start validation monitoring
    local monitor_id
    monitor_id=$(node scripts/monitoring/metadata-monitor.js start-field-deployment \
        --object "${object_name}" \
        --field "${field_name}" \
        --org "${org_alias}")

    # Execute validated deployment
    if node scripts/lib/validated-metadata-deployer.js deploy-field \
        --manifest "${manifest}" \
        --object "${object_name}" \
        --field "${field_name}" \
        --org "${org_alias}" \
        --validation-required; then

        # Post-deployment validation
        if validate_field_after_deployment "${object_name}" "${field_name}" "${org_alias}"; then
            node scripts/monitoring/metadata-monitor.js complete-deployment \
                --monitor-id "${monitor_id}" \
                --status "success"
            echo "✅ Field deployment and validation successful"
            return 0
        else
            echo "❌ Post-deployment validation failed"
            node scripts/monitoring/metadata-monitor.js complete-deployment \
                --monitor-id "${monitor_id}" \
                --status "validation_failed"
            return 1
        fi
    else
        echo "❌ Field deployment failed"
        node scripts/monitoring/metadata-monitor.js complete-deployment \
            --monitor-id "${monitor_id}" \
            --status "deployment_failed"
        trigger_metadata_recovery "${object_name}" "${field_name}" "${org_alias}"
        return 1
    fi
}
```

### 3. Post-Deployment Comprehensive Validation
```bash
# Enhanced post-deployment validation
validate_field_after_deployment() {
    local object_name=$1
    local field_name=$2
    local org_alias=$3

    echo "✅ Running comprehensive post-deployment validation..."

    # STEP 1: Existence validation
    if ! verify_field_exists "${object_name}" "${field_name}" "${org_alias}"; then
        echo "❌ Field existence validation failed"
        return 1
    fi

    # STEP 2: SOQL accessibility validation
    if ! verify_soql_access "${object_name}" "${field_name}" "${org_alias}"; then
        echo "❌ SOQL accessibility validation failed"
        return 1
    fi

    # STEP 3: Permission validation
    if ! node scripts/lib/permission-validator.js validate-field-permissions \
        --object "${object_name}" \
        --field "${field_name}" \
        --org "${org_alias}"; then
        echo "❌ Permission validation failed"
        return 1
    fi

    # STEP 4: Metadata integrity validation
    if ! node scripts/lib/metadata-integrity-validator.js validate-field-integrity \
        --object "${object_name}" \
        --field "${field_name}" \
        --org "${org_alias}"; then
        echo "❌ Metadata integrity validation failed"
        return 1
    fi

    # STEP 5: Cache consistency validation
    if ! validate_metadata_cache_consistency "${object_name}" "${field_name}" "${org_alias}"; then
        echo "❌ Cache consistency validation failed"
        return 1
    fi

    echo "✅ Post-deployment validation completed successfully"
    return 0
}
```

### 4. Enhanced Recovery Process with Validation
```bash
# Validation-aware metadata recovery
trigger_metadata_recovery() {
    local object_name=$1
    local field_name=$2
    local org_alias=$3

    echo "🔧 Starting validation-aware metadata recovery..."

    # STEP 1: Analyze validation failure
    local failure_analysis
    failure_analysis=$(node scripts/lib/metadata-failure-analyzer.js analyze \
        --object "${object_name}" \
        --field "${field_name}" \
        --org "${org_alias}")

    # STEP 2: Apply validation-informed recovery
    case "${failure_analysis}" in
        "cache_inconsistency")
            echo "🔧 Resolving cache inconsistency..."
            clear_metadata_cache "${org_alias}" "${object_name}"
            ;;
        "permission_propagation_delay")
            echo "🔧 Resolving permission propagation..."
            update_field_permissions "${object_name}" "${field_name}" "${org_alias}" "edit"
            ;;
        "metadata_lock")
            echo "🔧 Resolving metadata lock..."
            wait_for_metadata_unlock "${org_alias}" "${object_name}"
            ;;
        "validation_rule_conflict")
            echo "🔧 Resolving validation rule conflict..."
            node scripts/lib/validation-rule-conflict-resolver.js resolve \
                --object "${object_name}" \
                --field "${field_name}" \
                --org "${org_alias}"
            ;;
    esac

    # STEP 3: Retry with validation
    echo "🔄 Retrying deployment with comprehensive validation..."
    retry_with_validation 3 5 deploy_field_with_comprehensive_validation \
        "manifest/package.xml" "${object_name}" "${field_name}" "${org_alias}"
}
```

### 5. Verification Helper Functions

**Schema-Based Verification** (No FLS Required):
```bash
verify_field_exists() {
    local object_name=$1
    local field_name=$2
    local org_alias=$3

    # Use sf schema field list - works without FLS
    sf schema field list --object "${object_name}" --target-org "${org_alias}" --json | \
        jq --exit-status ".result[] | select(.name == \"${field_name}\")" > /dev/null
}
```

**SOQL Accessibility Validation**:
```bash
verify_soql_access() {
    local object_name=$1
    local field_name=$2
    local org_alias=$3

    # Test SOQL query with actual field
    sf data query --query "SELECT ${field_name} FROM ${object_name} LIMIT 1" \
        --target-org "${org_alias}" &> /dev/null
}
```

**Cache Consistency Validation**:
```bash
validate_metadata_cache_consistency() {
    local object_name=$1
    local field_name=$2
    local org_alias=$3

    # Clear org cache and re-verify
    sf org clear cache --target-org "${org_alias}"
    sleep 2

    # Re-verify field exists after cache clear
    verify_field_exists "${object_name}" "${field_name}" "${org_alias}"
}
```

### 6. Validation Checklists

**Pre-Deployment Checklist**:
- [ ] Field design validated (naming, type, length)
- [ ] No conflicts with existing fields
- [ ] All dependencies satisfied
- [ ] Impact analysis completed
- [ ] Required vs optional field determined

**Post-Deployment Checklist**:
- [ ] Field exists in schema (via `sf schema field list`)
- [ ] Field queryable via SOQL
- [ ] FLS permissions applied correctly
- [ ] Metadata integrity verified
- [ ] Cache consistency confirmed
- [ ] Permission set assigned to integration user

### 7. Common Validation Failures and Fixes

**Issue 1: Field Exists but Not Queryable**
- **Cause**: FLS not applied or not propagated
- **Fix**: Verify FLS via FieldPermissions query, wait 30s for propagation

**Issue 2: Cache Inconsistency**
- **Cause**: Stale metadata cache
- **Fix**: Clear cache with `sf org clear cache`, re-verify

**Issue 3: Permission Propagation Delay**
- **Cause**: Permission set assignment not yet active
- **Fix**: Wait 30-60 seconds, re-verify permission set assignment

**Issue 4: Metadata Lock**
- **Cause**: Another deployment in progress
- **Fix**: Wait for lock release, retry deployment

**Issue 5: Validation Rule Conflict**
- **Cause**: Validation rule prevents field usage
- **Fix**: Analyze and resolve validation rule logic

---

**When This Context is Loaded**: When user message contains keywords: `verify field`, `field verification`, `schema check`, `FLS verification`, `validate field`, `check field`, `field validation`, `verify FLS`, `verify deployment`, `post-deployment check`

**Back to Core Agent**: See `agents/sfdc-metadata-manager.md` for overview and deployment protocols

**Related Contexts**:
- `fls-field-deployment.md` - FLS-aware atomic deployment (coupled - prerequisites)
- Order of Operations (kept in base agent) - Verification sequence

---

**Context File**: `contexts/metadata-manager/field-verification-protocol.md`
**Lines**: 223 (original agent lines 1984-2207)
**Priority**: Medium
**Related Scripts**:
- `scripts/lib/metadata-validator.js`
- `scripts/lib/metadata-conflict-detector.js`
- `scripts/lib/metadata-dependency-validator.js`
- `scripts/lib/metadata-impact-analyzer.js`
- `scripts/lib/permission-validator.js`
- `scripts/lib/metadata-integrity-validator.js`
