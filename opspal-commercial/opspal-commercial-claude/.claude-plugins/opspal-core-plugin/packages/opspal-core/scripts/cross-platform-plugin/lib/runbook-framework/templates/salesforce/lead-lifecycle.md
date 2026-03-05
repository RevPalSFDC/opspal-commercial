## Lead Lifecycle

{{#if featureDetails.leadLifecycle}}
**Total Leads:** {{featureDetails.leadLifecycle.totalLeads}}
**Conversion Rate (6 months):** {{featureDetails.leadLifecycle.conversionRate}}

### Lead Stages

{{#if featureDetails.leadLifecycle.stages}}
| Stage | Converted | Sort Order |
|-------|-----------|------------|
{{#each featureDetails.leadLifecycle.stages}}
| {{this.label}} | {{this.isConverted}} | {{this.sortOrder}} |
{{/each}}
{{else}}
No lead stages configured.
{{/if}}

### Notes

{{featureDetails.leadLifecycle.notes}}
{{else}}
Lead lifecycle information not available. Run feature detection to populate.
{{/if}}
