# Advanced Orchestration Patterns with Validation - Detailed Guide

**Context Type**: Progressive Disclosure (loaded on "sequential", "pattern", "orchestration pattern" keywords)
**Priority**: Medium
**Trigger**: When implementing complex orchestration patterns requiring sequential execution with validation

---

## Overview

**CRITICAL**: Advanced orchestration patterns for sequential operations with comprehensive validation gates, step-by-step execution, and validation-aware error handling.

---

## Sequential Orchestration with Comprehensive Validation

```javascript
async function validatedSequentialOrchestration(operationName, steps) {
  const operationId = `seq_validated_${Date.now()}`;

  // Initialize comprehensive validation for sequential orchestration
  const validationPlan = await orchestrationValidator.createSequentialValidationPlan(steps);

  if (!validationPlan.feasible) {
    throw new Error(`Sequential orchestration validation failed: ${validationPlan.issues.join(', ')}`);
  }

  // Start orchestration with validation framework
  await asanaTimeIntegration.startAsanaTask(operationId, 'sfdc-orchestrator', {
    estimatedMinutes: validationPlan.totalEstimatedTime,
    complexity: 'project',
    taskType: 'validated_sequential_orchestration',
    context: {
      operationType: 'sequential_with_comprehensive_validation',
      stepCount: steps.length,
      validationPlan: validationPlan,
      validationOverhead: validationPlan.validationOverheadPercent,
      expectedReliability: validationPlan.expectedReliabilityPercent
    }
  });

  try {
    const results = [];

    // Execute each step with validation gates
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const validationGate = validationPlan.gates[i];

      // Pre-step validation
      const preStepValidation = await orchestrationValidator.validateStepReadiness(
        step,
        validationGate,
        results  // Previous results for dependency validation
      );

      if (!preStepValidation.passed) {
        throw new Error(`Step ${i+1} pre-validation failed: ${preStepValidation.errors.join(', ')}`);
      }

      // Execute step with validation
      const stepResult = await executeStepWithValidation(step, validationGate, operationId);

      // Post-step validation
      const postStepValidation = await orchestrationValidator.validateStepCompletion(
        step,
        stepResult,
        validationGate
      );

      if (!postStepValidation.passed) {
        throw new Error(`Step ${i+1} post-validation failed: ${postStepValidation.errors.join(', ')}`);
      }

      results.push({
        ...stepResult,
        validation: {
          pre: preStepValidation,
          post: postStepValidation
        }
      });

      // Stop if step fails (validation ensures clean failure)
      if (!stepResult.success) break;
    }

    // Final orchestration validation
    const finalValidation = await orchestrationValidator.validateOrchestrationCompletion(
      operationName,
      steps,
      results,
      validationPlan
    );

    await asanaTimeIntegration.completeAsanaTask(asana, operationId, {
      success: results.every(r => r.success),
      results: {
        completedSteps: results.length,
        totalSteps: steps.length,
        validationResults: {
          validationOverhead: finalValidation.validationOverhead,
          errorsPrevented: finalValidation.errorsPrevented,
          reliabilityAchieved: finalValidation.reliabilityAchieved,
          validationEfficiency: finalValidation.validationEfficiency
        }
      },
      validationSummary: finalValidation
    });

    return results;

  } catch (error) {
    // Validation-aware error handling
    const validationErrorContext = await orchestrationValidator.analyzeValidationError(
      error,
      operationId,
      validationPlan
    );

    await asanaTimeIntegration.completeAsanaTask(asana, operationId, {
      success: false,
      errorMessage: error.message,
      validationErrorContext: validationErrorContext,
      validationRecoveryRecommendations: validationErrorContext.recoveryRecommendations
    });
    throw error;
  }
}
```

---

## Key Capabilities

### Pre-Step Validation
- **Readiness validation**: Validates step is ready based on previous results
- **Dependency validation**: Checks all dependencies from previous steps
- **Gate validation**: Ensures validation gate criteria met before execution

### Execution with Validation
- **Step-by-step execution**: Sequential execution with validation gates
- **Validation wrapping**: Each step executed with validation context
- **Progress tracking**: Integration with Asana time tracking

### Post-Step Validation
- **Completion validation**: Validates step completed successfully
- **Result validation**: Validates step results meet criteria
- **Chain validation**: Ensures validation chain maintained

### Final Orchestration Validation
- **Completion validation**: Validates entire orchestration completed
- **Results aggregation**: Collects and validates all step results
- **Validation metrics**: Tracks overhead, errors prevented, reliability achieved

---

## Validation Integration

### Validation Plan Creation
```javascript
const validationPlan = await orchestrationValidator.createSequentialValidationPlan(steps);
// Returns: { feasible, issues, totalEstimatedTime, gates, validationOverheadPercent, expectedReliabilityPercent }
```

### Validation Gate Structure
Each step has a validation gate with:
- **Pre-conditions**: Requirements before step execution
- **Post-conditions**: Requirements after step completion
- **Dependencies**: Required inputs from previous steps
- **Success criteria**: Conditions for step success

### Error Handling with Validation Context
```javascript
const validationErrorContext = await orchestrationValidator.analyzeValidationError(
  error,
  operationId,
  validationPlan
);
// Returns: { rootCause, affectedSteps, recoveryRecommendations, validationImpact }
```

---

## Performance Characteristics

### Validation Overhead
- **Typical overhead**: 5-10% additional time
- **Reliability gain**: 95%+ error prevention
- **Trade-off**: Small time cost for large reliability improvement

### Asana Integration
- **Time tracking**: Automatic tracking of each step
- **Progress updates**: Checkpoints after each validated step
- **Completion summary**: Validation metrics included in summary

---

**When This Context is Loaded**: When user message contains keywords: "sequential", "step-by-step", "orchestration pattern", "validation pattern", "complex orchestration", "multi-step"

**Back to Core Agent**: See `sfdc-orchestrator.md` for orchestration overview and delegation patterns

**Related Scripts**:
- `scripts/lib/orchestration-validator.js`
- `scripts/lib/asana-time-integration.js`
