const planSchema = require('./schemas/improvement-plan.schema.json');

const PLACEHOLDER_PATTERNS = [
  /\btbd\b/i,
  /to be determined/i,
  /\bplaceholder\b/i,
  /\btodo\b/i,
  /\bfixme\b/i,
  /^n\/a$/i,
  /^unknown$/i,
  /^unknown root cause$/i,
  /root cause analysis pending/i,
  /^needs more analysis$/i,
  /to be generated/i
];

const VAGUE_FILLER_PATTERNS = [
  /^review required$/i,
  /^follow up needed$/i,
  /^investigate further$/i,
  /^needs follow[- ]up$/i,
  /^pending analysis$/i
];

const META_WORKFLOW_PATTERNS = [
  /\bself[- ](?:critique|analysis)\b/i,
  /\bmeta[- ](?:analysis|commentary|process)\b/i,
  /\borchestration mechanics\b/i,
  /\bthis (?:workflow|command)\b/i,
  /\bthe (?:workflow|command) itself\b/i,
  /\bprocess-reflections\b/i,
  /\bphase 2\b/i,
  /\basana\b/i
];

function normalizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\s+/g, ' ').trim();
}

function isPlaceholderText(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return true;
  }

  return PLACEHOLDER_PATTERNS.some(pattern => pattern.test(normalized));
}

function isVagueFillerText(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return true;
  }

  return VAGUE_FILLER_PATTERNS.some(pattern => pattern.test(normalized));
}

function containsMetaWorkflowCritique(value) {
  const normalized = normalizeText(value);
  return META_WORKFLOW_PATTERNS.some(pattern => pattern.test(normalized));
}

function ensureString(errors, value, path, options = {}) {
  const normalized = normalizeText(value);
  const {
    rejectPlaceholder = true,
    rejectVague = true,
    rejectMetaWorkflow = true
  } = options;

  if (!normalized) {
    errors.push(`${path} must be a non-empty string`);
    return normalized;
  }

  if (rejectPlaceholder && isPlaceholderText(normalized)) {
    errors.push(`${path} contains placeholder text: "${normalized}"`);
  }

  if (rejectVague && isVagueFillerText(normalized)) {
    errors.push(`${path} contains vague filler text: "${normalized}"`);
  }

  if (rejectMetaWorkflow && containsMetaWorkflowCritique(normalized)) {
    errors.push(`${path} contains self-referential workflow critique: "${normalized}"`);
  }

  return normalized;
}

function ensureArray(errors, value, path, { minItems = 1 } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return [];
  }

  if (value.length < minItems) {
    errors.push(`${path} must contain at least ${minItems} item(s)`);
  }

  return value;
}

function validatePlanItem(item, index, errors) {
  const prefix = `plan_items[${index}]`;
  const reflectionIds = ensureArray(errors, item?.evidence?.reflection_ids, `${prefix}.evidence.reflection_ids`);
  const implementationSteps = ensureArray(errors, item?.implementation_steps, `${prefix}.implementation_steps`);
  const successCriteria = ensureArray(errors, item?.success_criteria, `${prefix}.success_criteria`);
  const sourceCohortIds = ensureArray(errors, item?.source_cohort_ids, `${prefix}.source_cohort_ids`);

  ensureString(errors, item?.id, `${prefix}.id`);
  ensureString(errors, item?.taxonomy, `${prefix}.taxonomy`);
  ensureString(errors, item?.issue_summary, `${prefix}.issue_summary`);
  ensureString(errors, item?.evidence?.pattern, `${prefix}.evidence.pattern`);
  ensureString(errors, item?.likely_root_cause, `${prefix}.likely_root_cause`);
  ensureString(errors, item?.recommended_fix, `${prefix}.recommended_fix`);
  ensureString(errors, item?.prevention_safeguard, `${prefix}.prevention_safeguard`);
  ensureString(errors, item?.owner_suggestion, `${prefix}.owner_suggestion`);

  if (!['P0', 'P1', 'P2', 'P3'].includes(item?.priority)) {
    errors.push(`${prefix}.priority must be one of P0, P1, P2, P3`);
  }

  implementationSteps.forEach((step, stepIndex) => {
    ensureString(errors, step, `${prefix}.implementation_steps[${stepIndex}]`);
  });

  successCriteria.forEach((criterion, criterionIndex) => {
    ensureString(errors, criterion, `${prefix}.success_criteria[${criterionIndex}]`);
  });

  sourceCohortIds.forEach((cohortId, cohortIndex) => {
    ensureString(errors, cohortId, `${prefix}.source_cohort_ids[${cohortIndex}]`, {
      rejectMetaWorkflow: false
    });
  });

  reflectionIds.forEach((reflectionId, reflectionIndex) => {
    ensureString(errors, reflectionId, `${prefix}.evidence.reflection_ids[${reflectionIndex}]`, {
      rejectMetaWorkflow: false
    });
  });

  const reflectionCount = item?.evidence?.reflection_count;
  if (!Number.isInteger(reflectionCount) || reflectionCount < 1) {
    errors.push(`${prefix}.evidence.reflection_count must be a positive integer`);
  } else if (reflectionIds.length > 0 && reflectionCount !== reflectionIds.length) {
    errors.push(`${prefix}.evidence.reflection_count (${reflectionCount}) must match reflection_ids length (${reflectionIds.length})`);
  }

  const recurrenceCount = item?.evidence?.recurrence_count;
  if (!Number.isInteger(recurrenceCount) || recurrenceCount < 1) {
    errors.push(`${prefix}.evidence.recurrence_count must be a positive integer`);
  }

  if (!Number.isFinite(item?.estimated_effort_hours) || item.estimated_effort_hours <= 0) {
    errors.push(`${prefix}.estimated_effort_hours must be a positive number`);
  }

  if (!Number.isFinite(item?.expected_roi_annual) || item.expected_roi_annual < 0) {
    errors.push(`${prefix}.expected_roi_annual must be zero or greater`);
  }
}

function validateTriageItem(item, index, errors) {
  const prefix = `triage_items[${index}]`;
  const reflectionIds = ensureArray(errors, item?.reflection_ids, `${prefix}.reflection_ids`);

  ensureString(errors, item?.cohort_id, `${prefix}.cohort_id`, {
    rejectMetaWorkflow: false
  });
  ensureString(errors, item?.taxonomy, `${prefix}.taxonomy`);
  ensureString(errors, item?.issue_summary, `${prefix}.issue_summary`);
  ensureString(errors, item?.reason, `${prefix}.reason`);
  ensureString(errors, item?.required_dependency, `${prefix}.required_dependency`);
  ensureString(errors, item?.recommended_next_step, `${prefix}.recommended_next_step`);

  if (!['needs_triage', 'blocked_external_dependency'].includes(item?.status)) {
    errors.push(`${prefix}.status must be needs_triage or blocked_external_dependency`);
  }

  reflectionIds.forEach((reflectionId, reflectionIndex) => {
    ensureString(errors, reflectionId, `${prefix}.reflection_ids[${reflectionIndex}]`, {
      rejectMetaWorkflow: false
    });
  });
}

function validateImprovementPlan(plan) {
  const errors = [];

  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    return {
      valid: false,
      errors: ['plan must be an object'],
      schema: planSchema
    };
  }

  if (plan.schema_version !== planSchema.properties.schema_version.const) {
    errors.push(`schema_version must be ${planSchema.properties.schema_version.const}`);
  }

  ensureString(errors, plan.generated_at, 'generated_at', {
    rejectMetaWorkflow: false
  });
  ensureString(errors, plan.title, 'title');

  const summary = plan.summary;
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    errors.push('summary must be an object');
  } else {
    for (const field of [
      'total_reflections_analyzed',
      'implementation_ready_items',
      'triage_items',
      'aggregate_roi_annual',
      'estimated_effort_hours'
    ]) {
      if (!Number.isFinite(summary[field]) || summary[field] < 0) {
        errors.push(`summary.${field} must be zero or greater`);
      }
    }
  }

  const planItems = ensureArray(errors, plan.plan_items, 'plan_items', { minItems: 0 });
  const triageItems = ensureArray(errors, plan.triage_items, 'triage_items', { minItems: 0 });

  planItems.forEach((item, index) => validatePlanItem(item, index, errors));
  triageItems.forEach((item, index) => validateTriageItem(item, index, errors));

  if (summary && typeof summary === 'object') {
    if (summary.implementation_ready_items !== planItems.length) {
      errors.push(`summary.implementation_ready_items (${summary.implementation_ready_items}) must match plan_items length (${planItems.length})`);
    }
    if (summary.triage_items !== triageItems.length) {
      errors.push(`summary.triage_items (${summary.triage_items}) must match triage_items length (${triageItems.length})`);
    }
  }

  const executionBoundary = plan.execution_boundary;
  if (!executionBoundary || typeof executionBoundary !== 'object' || Array.isArray(executionBoundary)) {
    errors.push('execution_boundary must be an object');
  } else {
    if (executionBoundary.planning_complete !== true) {
      errors.push('execution_boundary.planning_complete must be true');
    }
    if (executionBoundary.task_creation_is_downstream !== true) {
      errors.push('execution_boundary.task_creation_is_downstream must be true');
    }
    ensureString(errors, executionBoundary.downstream_task_system, 'execution_boundary.downstream_task_system', {
      rejectMetaWorkflow: false
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    schema: planSchema
  };
}

function assertValidImprovementPlan(plan) {
  const validation = validateImprovementPlan(plan);
  if (!validation.valid) {
    throw new Error(`Improvement plan validation failed:\n- ${validation.errors.join('\n- ')}`);
  }
  return plan;
}

module.exports = {
  planSchema,
  validateImprovementPlan,
  assertValidImprovementPlan,
  normalizeText,
  isPlaceholderText,
  isVagueFillerText,
  containsMetaWorkflowCritique
};
