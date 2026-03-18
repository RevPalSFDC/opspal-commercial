const {
  assertValidImprovementPlan,
  normalizeText,
  isPlaceholderText
} = require('./improvement-plan-validator');

function uniqueStrings(values) {
  const seen = new Set();
  const results = [];

  for (const value of values || []) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    results.push(normalized);
  }

  return results;
}

function formatCurrency(value) {
  return `$${Number(value || 0).toLocaleString()}`;
}

function collectCoveredReflectionIds(planItems) {
  const covered = new Set();
  for (const item of planItems || []) {
    const ids = item?.evidence?.reflection_ids || [];
    for (const id of ids) {
      covered.add(id);
    }
  }
  return covered;
}

function buildTriageItems(reflections, planItems) {
  const coveredReflectionIds = collectCoveredReflectionIds(planItems);

  return (reflections || [])
    .filter(reflection => reflection?.id && !coveredReflectionIds.has(reflection.id))
    .map((reflection, index) => {
      const taxonomy = normalizeText(reflection.taxonomy || reflection.focus_area || 'unclassified');
      const rootCause = normalizeText(reflection.root_cause || reflection.error_message || reflection.what_happened || 'manual review required to identify the missing failure signature');
      const issueSummary = `Manually triage ${taxonomy} reflection ${reflection.id.slice(0, 8)} before execution planning`;

      return {
        cohort_id: `triage-${taxonomy.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'reflection'}-${index + 1}`,
        taxonomy,
        status: 'needs_triage',
        issue_summary: issueSummary,
        reason: `This reflection was analyzed but did not land in an implementation-ready cohort. Current evidence points to: ${rootCause}.`,
        required_dependency: 'A maintainer must review the reflection evidence, confirm the dominant failure mode, and assign it to an existing cohort or a new concrete remediation item.',
        recommended_next_step: 'Review the reflection details, classify the root cause, and convert it into a concrete plan item before downstream task execution starts.',
        reflection_ids: [reflection.id]
      };
    });
}

function renderMarkdown(plan) {
  let markdown = `# ${plan.title}\n\n`;
  markdown += `**Generated:** ${plan.generated_at}\n`;
  markdown += `**Open reflections analyzed:** ${plan.summary.total_reflections_analyzed}\n`;
  markdown += `**Implementation-ready issues:** ${plan.summary.implementation_ready_items}\n`;
  markdown += `**Triage follow-up items:** ${plan.summary.triage_items}\n`;
  markdown += `**Estimated effort:** ${plan.summary.estimated_effort_hours} hours\n`;
  markdown += `**Estimated annual ROI:** ${formatCurrency(plan.summary.aggregate_roi_annual)}\n\n`;

  markdown += `## Implementation-Ready Plan\n\n`;

  if (plan.plan_items.length === 0) {
    markdown += `No implementation-ready cohorts were produced from the current reflection set.\n\n`;
  } else {
    plan.plan_items.forEach((item, index) => {
      markdown += `### ${index + 1}. ${item.issue_summary}\n\n`;
      markdown += `- **Priority:** ${item.priority}\n`;
      markdown += `- **Taxonomy:** ${item.taxonomy}\n`;
      markdown += `- **Owner suggestion:** ${item.owner_suggestion}\n`;
      markdown += `- **Estimated effort:** ${item.estimated_effort_hours}h\n`;
      markdown += `- **Expected annual ROI:** ${formatCurrency(item.expected_roi_annual)}\n`;
      markdown += `- **Evidence:** ${item.evidence.pattern}\n`;
      markdown += `- **Reflection IDs:** ${item.evidence.reflection_ids.join(', ')}\n`;
      if (item.evidence.affected_orgs.length > 0) {
        markdown += `- **Affected orgs:** ${item.evidence.affected_orgs.join(', ')}\n`;
      }
      if (item.affected_components.length > 0) {
        markdown += `- **Affected components:** ${item.affected_components.join(', ')}\n`;
      }
      markdown += `- **Likely root cause:** ${item.likely_root_cause}\n`;
      markdown += `- **Recommended fix:** ${item.recommended_fix}\n`;
      markdown += `- **Prevention safeguard:** ${item.prevention_safeguard}\n\n`;

      markdown += `**Implementation steps**\n`;
      item.implementation_steps.forEach((step, stepIndex) => {
        markdown += `${stepIndex + 1}. ${step}\n`;
      });
      markdown += `\n**Success criteria**\n`;
      item.success_criteria.forEach((criterion, criterionIndex) => {
        markdown += `${criterionIndex + 1}. ${criterion}\n`;
      });
      markdown += `\n`;
    });
  }

  markdown += `## Triage Follow-Up\n\n`;

  if (plan.triage_items.length === 0) {
    markdown += `All analyzed reflections were mapped into implementation-ready items.\n\n`;
  } else {
    plan.triage_items.forEach((item, index) => {
      markdown += `### ${index + 1}. ${item.issue_summary}\n\n`;
      markdown += `- **Taxonomy:** ${item.taxonomy}\n`;
      markdown += `- **Status:** ${item.status}\n`;
      markdown += `- **Reason:** ${item.reason}\n`;
      markdown += `- **Required dependency:** ${item.required_dependency}\n`;
      markdown += `- **Recommended next step:** ${item.recommended_next_step}\n`;
      markdown += `- **Reflection IDs:** ${item.reflection_ids.join(', ')}\n\n`;
    });
  }

  markdown += `## Execution Boundary\n\n`;
  markdown += `Planning is complete. Downstream task creation remains separate and must be derived from the approved plan items above, not used to define them.\n`;

  return markdown;
}

function buildImprovementPlanBundle(options = {}) {
  const reflections = Array.isArray(options.reflections) ? options.reflections : [];
  const planItems = Array.isArray(options.planItems) ? options.planItems : [];
  const triageItems = Array.isArray(options.triageItems) ? options.triageItems : [];

  const data = {
    schema_version: '1.0.0',
    generated_at: new Date().toISOString(),
    title: normalizeText(options.title) || 'Reflection Improvement Plan',
    summary: {
      total_reflections_analyzed: reflections.length,
      implementation_ready_items: planItems.length,
      triage_items: triageItems.length,
      aggregate_roi_annual: planItems.reduce((sum, item) => sum + (item.expected_roi_annual || 0), 0),
      estimated_effort_hours: planItems.reduce((sum, item) => sum + (item.estimated_effort_hours || 0), 0)
    },
    plan_items: planItems,
    triage_items: triageItems,
    execution_boundary: {
      planning_complete: true,
      task_creation_is_downstream: true,
      downstream_task_system: normalizeText(options.downstreamTaskSystem) || 'asana'
    }
  };

  const validated = assertValidImprovementPlan(data);
  const markdown = renderMarkdown(validated);

  if (isPlaceholderText(markdown)) {
    throw new Error('Rendered markdown contains placeholder-only content.');
  }

  return {
    data: validated,
    markdown
  };
}

module.exports = {
  buildImprovementPlanBundle,
  buildTriageItems,
  renderMarkdown,
  uniqueStrings
};
