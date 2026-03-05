# Validation Framework: Deployment & Flow Consolidation - Detailed Guide

**Context Type**: Progressive Disclosure (loaded on "validation", "deploy", "flow consolidation" keywords)
**Priority**: High
**Trigger**: When orchestrating deployments or flow operations with validation requirements

---

## Overview

**CRITICAL**: All orchestrated deployments and flow operations include comprehensive validation framework integration with automated gates, handoffs, and monitoring.

---

## Enhanced Deployment Verification with Validation Framework

**CRITICAL**: All orchestrated operations now include comprehensive validation framework integration.

### Validation-Enhanced Verification Protocol

1. **Pre-Operation Validation with Comprehensive Framework**
   ```bash
   # Start comprehensive validation monitoring
   node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/monitoring/validation-monitor.js start-comprehensive-monitoring \
     --operation-id "${OPERATION_ID}" \
     --validation-level "comprehensive"

   # Validate entire orchestration plan
   node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/orchestration-validator.js validate-full-plan \
     --plan-file "${PLAN_FILE}" \
     --validation-gates-required \
     --auto-fix-enabled

   # Pre-validate all agent operations
   for agent in ${AGENT_LIST}; do
     node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/agent-validator.js validate-agent-readiness \
       --agent "${agent}" \
       --operation-context "${OPERATION_CONTEXT}" \
       --pre-validation-required
   done

   # Only proceed if all validations pass
   if [[ $(check_validation_status) != "all_passed" ]]; then
     echo "❌ Orchestration validation failed - blocking operation"
     trigger_validation_recovery
     exit 1
   fi
   ```

2. **Inter-Agent Validation Handoffs**
   ```bash
   # Between each agent operation with validation handshake
   validate_agent_handoff() {
     local source_agent=$1
     local target_agent=$2
     local operation_context=$3

     # Validate source agent completion
     if ! node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/agent-validator.js validate-completion \
         --agent "${source_agent}" \
         --operation "${operation_context}"; then
       echo "❌ Source agent validation failed"
       return 1
     fi

     # Pre-validate target agent readiness
     if ! node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/agent-validator.js validate-readiness \
         --agent "${target_agent}" \
         --operation "${operation_context}"; then
       echo "❌ Target agent validation failed"
       return 1
     fi

     # Use validation-aware composite API
     node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validation-aware-composite-api.js handoff-operation \
       --from "${source_agent}" \
       --to "${target_agent}" \
       --validation-required \
       --context "${operation_context}"
   }
   ```

3. **Real-time Validation Monitoring During Orchestration**
   ```bash
   # Continuous validation monitoring
   monitor_orchestration_validation() {
     local operation_id=$1

     while orchestration_active "${operation_id}"; do
       # Check validation status for all active operations
       validation_status=$(node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/monitoring/validation-monitor.js \
         check-status --operation-id "${operation_id}")

       # Alert on validation failures
       if [[ "${validation_status}" == "validation_failure" ]]; then
         echo "🚨 Validation failure detected during orchestration"
         trigger_validation_recovery "${operation_id}"
       fi

       # Check for validation drift
       if [[ "${validation_status}" == "validation_drift" ]]; then
         echo "⚠️ Validation drift detected - auto-correcting"
         auto_correct_validation_drift "${operation_id}"
       fi

       sleep 30  # Check every 30 seconds
     done
   }
   ```

---

## Flow Consolidation with Validation Framework (MANDATORY)

### Enhanced Flow Consolidation Enforcement

```javascript
// ENHANCED MANDATORY FLOW CONSOLIDATION WITH VALIDATION
async function enforceFlowConsolidationWithValidation(automationRequest) {
  // Start validation-enhanced consolidation assessment
  const assessmentId = `flow_validation_${Date.now()}`;

  // Initialize comprehensive validation monitoring
  await validationMonitor.startFlowValidationAssessment(assessmentId, {
    validationLevel: 'comprehensive',
    consolidationValidation: true,
    performanceValidation: true,
    complianceValidation: true
  });

  // Step 1: Use validation-aware composite API for flow assessment
  const validatedAssessment = await validationAwareCompositeAPI.batchValidatedOperation([
    {
      operation: 'validateAndDelegateToAgent',
      agent: 'sfdc-planner',
      task: 'assessFlowConsolidationWithValidation',
      validationRequired: true,
      data: {
        object: automationRequest.object,
        requirements: automationRequest.requirements,
        validationContext: assessmentId
      }
    },
    {
      operation: 'validateExistingFlows',
      object: automationRequest.object,
      triggerType: automationRequest.triggerType,
      validationLevel: 'comprehensive'
    },
    {
      operation: 'validatePerformanceImpact',
      context: 'flow_complexity_analysis',
      validationRequired: true
    }
  ]);

  // Step 2: Validate assessment results
  const flowAssessment = validatedAssessment.results[0];
  const existingFlows = validatedAssessment.results[1];
  const performanceValidation = validatedAssessment.results[2];

  if (!flowAssessment.validationPassed) {
    return {
      action: 'VALIDATION_FAILED',
      reason: 'Flow consolidation assessment failed validation',
      validationErrors: flowAssessment.validationErrors,
      recommendedActions: flowAssessment.validationRecovery
    };
  }

  // Step 3: Calculate validated complexity score
  const complexityScore = flowAssessment.complexityScore;
  const validatedPerformanceImpact = performanceValidation.impact;

  await validationMonitor.checkpoint(assessmentId, 'Complexity assessment validated');

  // Step 4: Make routing decision with validation context
  if (complexityScore >= 7 || !performanceValidation.passed) {
    await validationMonitor.completeAssessment(assessmentId, 'routed_to_apex_validated');
    return {
      agent: 'sfdc-apex-developer',
      reason: `Validated complexity score ${complexityScore} exceeds threshold OR performance validation failed`,
      recommendation: 'Implement as validated Apex trigger/class for optimal performance',
      validationContext: {
        performanceValidation,
        complexityValidation: flowAssessment.complexityValidation,
        complianceValidation: flowAssessment.complianceValidation
      },
      validationPassed: true
    };
  } else if (flowAssessment.canConsolidateValidated) {
    await validationMonitor.completeAssessment(assessmentId, 'consolidated_flow_validated');
    return {
      agent: 'sfdc-automation-builder',
      directive: 'EXTEND_EXISTING_FLOW_VALIDATED',
      targetFlow: flowAssessment.targetFlow,
      reason: 'Validated logic can be safely consolidated into existing flow',
      validationContext: {
        consolidationValidation: flowAssessment.consolidationValidation,
        performanceValidation,
        safetyValidation: flowAssessment.safetyValidation
      },
      validationPassed: true
    };
  } else {
    await validationMonitor.completeAssessment(assessmentId, 'new_validated_flow');
    return {
      agent: 'sfdc-automation-builder',
      directive: 'CREATE_VALIDATED_CONSOLIDATED_FLOW',
      pattern: '[Object]_[TriggerType]_Master',
      reason: 'Validated new trigger type requires separate flow with performance optimization',
      validationContext: {
        newFlowValidation: flowAssessment.newFlowValidation,
        performanceValidation,
        complianceValidation: flowAssessment.complianceValidation
      },
      validationPassed: true
    };
  }
}
```

### Enhanced Orchestration Flow Pattern with Validation

```
User Request → Orchestrator
    ↓
[Initialize Validation Framework]
    ↓
[Comprehensive Validation Assessment]
    ↓
[Flow Consolidation Validation Check]
    ↓
Validation Passed? → No → Validation Recovery → Re-assess
    ↓ Yes
Complexity < 7 AND All Validations Passed? → No → sfdc-apex-developer (with validation context)
    ↓ Yes
Existing Flow AND Consolidation Validated? → Yes → Extend Flow (with validation handoff)
    ↓ No
Create Validated Consolidated Flow (with comprehensive validation)
```

---

## Key Validation Components

### Validation Gates
1. **Pre-operation**: Plan validation, agent readiness, pre-flight checks
2. **Inter-agent**: Source completion, target readiness, handoff validation
3. **Real-time**: Status monitoring (30s intervals), drift detection, failure alerts
4. **Flow-specific**: Consolidation validation, complexity scoring, performance impact

### Validation Scripts
- `scripts/lib/orchestration-validator.js` - Plan and operation validation
- `scripts/lib/agent-validator.js` - Agent readiness and completion validation
- `scripts/monitoring/validation-monitor.js` - Real-time validation monitoring
- `scripts/lib/validation-aware-composite-API.js` - Validated batch operations

### Success Criteria
- **All validation gates passed** before operation proceeds
- **Validation handoffs** between all agent transitions
- **Continuous monitoring** with automatic drift correction
- **Flow complexity** validated and routed appropriately
- **Comprehensive audit trail** of all validation decisions

---

**When This Context is Loaded**: When user message contains keywords: "validation", "deploy", "deployment", "flow consolidation", "flow creation", "validate operation", "comprehensive validation"

**Back to Core Agent**: See `sfdc-orchestrator.md` for orchestration overview and delegation patterns

**Related Scripts**:
- `scripts/lib/orchestration-validator.js`
- `scripts/lib/agent-validator.js`
- `scripts/monitoring/validation-monitor.js`
- `scripts/lib/validation-aware-composite-api.js`
