# Advanced Error Recovery with Validation Integration - Detailed Guide

**Context Type**: Progressive Disclosure (loaded on "error", "failure", "recovery", "retry" keywords)
**Priority**: High
**Trigger**: When orchestrating operations that may fail or require recovery mechanisms

---

## Overview

**CRITICAL**: All orchestrations include validation-aware error recovery with automatic resolution, predictive prevention, and real-time monitoring.

---

## Validation-Aware Error Recovery

```bash
# Enhanced error recovery with validation framework
auto_resolve_orchestration_error_with_validation() {
    local error_type=$1
    local operation_context=$2
    local validation_context=$3

    echo "🔧 Starting validation-aware error recovery..."

    # Use validation context to inform recovery strategy
    case "$error_type" in
        "VALIDATION_FAILURE")
            echo "🔧 Auto-resolving validation failure..."
            node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validation-recovery.js resolve \
                --validation-context "$validation_context" \
                --auto-fix \
                --preserve-validation-integrity
            ;;
        "AGENT_VALIDATION_ERROR")
            echo "🔧 Auto-resolving agent validation error..."
            node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/agent-validator.js recover \
                --agent-context "$operation_context" \
                --validation-recovery \
                --maintain-validation-chain
            ;;
        "ORCHESTRATION_VALIDATION_DRIFT")
            echo "🔧 Auto-correcting validation drift..."
            node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validation-drift-corrector.js correct \
                --operation-context "$operation_context" \
                --validation-context "$validation_context" \
                --auto-realign
            ;;
        "COMPOSITE_VALIDATION_FAILURE")
            echo "🔧 Auto-resolving composite validation failure..."
            node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/composite-validation-recovery.js resolve \
                --composite-context "$operation_context" \
                --validation-preservation-mode
            ;;
        *)
            echo "⚠️  Using standard error recovery with validation preservation"
            node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/error-recovery.js --preserve-validation \
                --error-type "$error_type" \
                --validation-context "$validation_context"
            ;;
    esac
}
```

---

## Predictive Validation and Error Prevention

```bash
# Continuous validation monitoring for orchestration health
monitor_orchestration_validation_health() {
    local operation_id=$1

    while orchestration_active "$operation_id"; do
        # Check comprehensive validation status
        validation_health=$(node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/monitoring/validation-monitor.js \
            check-comprehensive-health --operation-id "$operation_id")

        case "$validation_health" in
            "validation_degrading")
                echo "⚠️ Validation health degrading - taking preventive action"
                preventive_validation_maintenance "$operation_id"
                ;;
            "validation_drift_detected")
                echo "⚠️ Validation drift detected - auto-correcting"
                auto_correct_validation_drift "$operation_id"
                ;;
            "validation_failure_risk")
                echo "🚨 Validation failure risk - implementing protective measures"
                implement_validation_protection "$operation_id"
                ;;
            "validation_healthy")
                # Continue monitoring
                ;;
        esac

        # Check agent validation consistency
        agent_validation_status=$(node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/monitoring/agent-validation-monitor.js \
            check-agent-consistency --operation-id "$operation_id")

        if [[ "$agent_validation_status" != "consistent" ]]; then
            echo "⚠️ Agent validation inconsistency detected"
            harmonize_agent_validation "$operation_id"
        fi

        sleep 60  # Check every minute for comprehensive validation
    done
}
```

---

## Integration with Error Recovery System (Enhanced)

All orchestration operations now include comprehensive validation integration:

```javascript
// Validation-aware error recovery wrapping
const validatedOrchestrationOperation = await withValidationAwareErrorRecovery(async () => {
    return await executeValidatedOrchestration(orchestrationConfig);
}, {
    validationFramework: 'comprehensive',
    retryPatterns: [
        'validation-temporary-failure',
        'agent-validation-error',
        'orchestration-validation-drift',
        'composite-validation-timeout'
    ],
    autoFix: [
        'validation-inconsistency',
        'agent-validation-mismatch',
        'orchestration-validation-drift',
        'composite-validation-failure'
    ],
    escalation: [
        'validation-framework-failure',
        'critical-validation-compromise',
        'validation-security-violation'
    ],
    rollback: [
        'validation-integrity-lost',
        'orchestration-validation-corrupted',
        'agent-validation-chain-broken'
    ],
    validationRecovery: {
        preserveValidationChain: true,
        maintainValidationIntegrity: true,
        autoRepairValidationDrift: true
    }
});
```

---

## Real-time Monitoring Integration (Enhanced)

All orchestrations include comprehensive validation monitoring:

```bash
# Enhanced orchestration dashboard at http://localhost:3000/orchestrations
# Real-time tracking of:
# - Validation pipeline success rates across agents
# - Agent coordination validation consistency
# - Orchestration validation drift detection
# - Error prevention through validation
# - Recovery success rates with validation preservation
# - Performance impact of validation framework
# - Validation reliability metrics
# - Compliance validation status
```

---

## Key Capabilities

### Automatic Resolution
- **Validation failures**: Auto-fix with integrity preservation
- **Agent validation errors**: Recovery with chain maintenance
- **Validation drift**: Auto-correction and realignment
- **Composite failures**: Structured resolution with preservation

### Predictive Prevention
- **Continuous monitoring**: Real-time validation health checks
- **Drift detection**: Automatic correction before failures
- **Failure risk**: Protective measures implementation
- **Consistency checks**: Agent validation harmonization

### Reliability Metrics
- **95%+ error prevention** through comprehensive pre-validation
- **Zero-surprise coordination** with validation-first approach
- **Automatic error recovery** with validation context preservation
- **Comprehensive audit trail** for all validation decisions

---

**When This Context is Loaded**: When user message contains keywords: "error", "failure", "recovery", "retry", "fix", "failed", "resolve", "troubleshoot"

**Back to Core Agent**: See `sfdc-orchestrator.md` for orchestration overview and delegation patterns

**Related Scripts**:
- `scripts/lib/validation-recovery.js`
- `scripts/lib/agent-validator.js`
- `scripts/lib/validation-drift-corrector.js`
- `scripts/lib/composite-validation-recovery.js`
- `scripts/monitoring/validation-monitor.js`
