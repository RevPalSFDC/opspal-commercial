# {{org_name}} Operational Runbook

**Instance**: `{{org_alias}}`
**Platform**: {{platform}}
**Last Updated**: {{last_updated}}
**Generated From**: {{observation_count}} observations, {{reflection_count}} reflections
**Version**: {{version}}

---

## Platform Overview

{{#if platform_description}}
{{platform_description}}
{{else}}
This is a {{platform}} instance for {{org_name}}. The runbook below documents observed behaviors, configurations, and operational patterns detected from agent operations and user reflections.
{{/if}}

### Instance Details

- **Org Type**: {{org_type}}
- **API Version**: {{api_version}}
- **Last Assessed**: {{last_assessment_date}}
- **Total Objects**: {{total_objects}}
- **Total Fields**: {{total_fields}}
- **Active Workflows**: {{active_workflows}}

---

## Data Model

{{#if objects}}
{{#each objects}}
### {{this.name}}

- **API Name**: `{{this.api_name}}`
- **Record Count**: {{this.record_count}}
- **Key Fields**: {{this.key_fields}}
- **Customizations**: {{this.custom_fields_count}} custom field(s)

{{#if this.description}}
**Description**: {{this.description}}
{{/if}}

{{#if this.relationships}}
**Relationships**:
{{#each this.relationships}}
- {{this.type}}: {{this.target}} ({{this.field}})
{{/each}}
{{/if}}

{{/each}}
{{else}}
*No object metadata captured yet. Objects will be documented as agent operations are observed.*
{{/if}}

---

## Metric Semantics Decisions

{{#if metric_semantics_entries}}
**Summary**:
- **Mappings confirmed**: {{metric_semantics_mapping_count}}
- **Semantic warnings**: {{metric_semantics_semantic_warning_count}}
- **Failure-mode warnings**: {{metric_semantics_failure_warning_count}}
- **Last updated**: {{metric_semantics_last_updated}}

**Recent Decisions & Warnings**:
{{#each metric_semantics_entries}}
- {{this.timestamp}} | {{this.type}} | {{this.metricId}} {{this.reportName}} {{this.warningSummary}}
{{/each}}

**Process Notes**:
{{metric_semantics_process_notes}}
{{else}}
*No metric semantics decisions logged yet. Mapping confirmations and warnings will appear here after report creation or validation.*
{{/if}}

---

## Report Diagnostics

{{#if report_diagnostics_entries}}
**Summary**:
- **Pass**: {{report_diagnostics_pass_count}}
- **Warn**: {{report_diagnostics_warn_count}}
- **Fail**: {{report_diagnostics_fail_count}}
- **Last updated**: {{report_diagnostics_last_updated}}
{{#if report_diagnostics_intent_summary}}
- **Top intents**: {{report_diagnostics_intent_summary}}
{{/if}}

**Recent Diagnostics**:
{{#each report_diagnostics_entries}}
- {{this.timestamp}} | {{this.reportName}} | {{this.primaryIntent}} | {{this.overallStatus}} {{this.issueSummary}}
{{/each}}

**Process Notes**:
{{report_diagnostics_process_notes}}
{{else}}
*No report diagnostics logged yet. Intent classification and health scoring will appear here after report creation or validation.*
{{/if}}

---

## Persona KPI Alignment

{{#if persona_kpi_entries}}
**Summary**:
- **Pass**: {{persona_kpi_pass_count}}
- **Warn**: {{persona_kpi_warn_count}}
- **Last updated**: {{persona_kpi_last_updated}}
{{#if persona_kpi_persona_summary}}
- **Personas covered**: {{persona_kpi_persona_summary}}
{{/if}}

**Recent Persona Checks**:
{{#each persona_kpi_entries}}
- {{this.timestamp}} | {{this.dashboardName}} | {{this.persona}} | {{this.status}} {{this.issueSummary}}
{{/each}}

**Process Notes**:
{{persona_kpi_process_notes}}
{{else}}
*No persona KPI diagnostics logged yet. Persona alignment warnings will appear here after dashboard validation or audit runs.*
{{/if}}

---

## Key Workflows

{{#if workflows}}
{{#each workflows}}
### {{this.name}}

- **Type**: {{this.type}}
- **Trigger**: {{this.trigger}}
- **Status**: {{this.status}}

{{#if this.logic}}
**Logic**:
{{#each this.logic}}
{{@index}}. {{this}}
{{/each}}
{{/if}}

{{#if this.observed_behavior}}
**Observed Behavior**: {{this.observed_behavior}}
{{/if}}

{{#if this.exception_cases}}
**Exception Cases**:
{{#each this.exception_cases}}
- {{this}}
{{/each}}
{{/if}}

{{/each}}
{{else}}
*No workflows documented yet. Workflows will be captured as they are created or modified.*
{{/if}}

---

## Integrations

{{#if integrations}}
{{#each integrations}}
### {{this.name}}

- **Type**: {{this.type}}
- **Direction**: {{this.direction}}
- **Frequency**: {{this.frequency}}
- **Status**: {{this.status}}

{{#if this.description}}
**Description**: {{this.description}}
{{/if}}

{{#if this.known_issues}}
**Known Issues**:
{{#each this.known_issues}}
- {{this.issue}} ({{this.frequency}} occurrence(s))
  - **Root Cause**: {{this.root_cause}}
  - **Workaround**: {{this.workaround}}
{{/each}}
{{/if}}

{{/each}}
{{else}}
*No integrations documented yet. Integrations will be recorded as they are detected.*
{{/if}}

---

## Known Exceptions

{{#if known_exceptions}}
{{#each known_exceptions}}
### {{this.name}}

- **First Observed**: {{this.first_observed}}
- **Frequency**: {{this.frequency}} occurrence(s)
- **Context**: {{this.context}}

{{#if this.manual_override}}
**Manual Override Used**: {{this.manual_override}}
{{/if}}

**Recommendation**: {{this.recommendation}}

{{/each}}
{{else}}
*No exceptions documented yet. Exceptions will be tracked from reflections and user feedback.*
{{/if}}

---

## Common Error Patterns

{{#if common_errors}}
{{#each common_errors}}
### {{this.taxonomy}}

- **Occurrences**: {{this.count}}
- **Priority**: {{this.priority}}

**Examples**:
{{#each this.examples}}
- {{this.description}}
{{/each}}

**Prevention**: {{this.prevention}}

{{/each}}
{{else}}
*No error patterns identified yet. Patterns will be detected from reflection analysis.*
{{/if}}

---

## Recommendations

{{#if recommendations}}
{{#each recommendations}}
{{@index}}. {{this}}
{{/each}}
{{else}}
*No recommendations yet. Recommendations will be generated from observed patterns and user feedback.*
{{/if}}

---

## Operational Notes

{{#if operational_notes}}
{{operational_notes}}
{{/if}}

### Best Practices

{{#if best_practices}}
{{#each best_practices}}
- {{this}}
{{/each}}
{{else}}
- Review this runbook before major deployments
- Update runbook after significant changes
- Document manual interventions for future automation
- Capture exceptions in `/reflect` for trend analysis
{{/if}}

---

## Revision History

{{#if revision_history}}
| Version | Date | Changes | Generated By |
|---------|------|---------|--------------|
{{#each revision_history}}
| {{this.version}} | {{this.date}} | {{this.changes}} | {{this.generated_by}} |
{{/each}}
{{else}}
| Version | Date | Changes | Generated By |
|---------|------|---------|--------------|
| {{version}} | {{last_updated}} | Initial runbook generation | runbook-synthesizer |
{{/if}}

---

**Automatically generated by RevPal OpsPal Living Runbook System**
*This runbook is continuously updated based on observed agent operations and user reflections.*
