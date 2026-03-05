## Opportunity Pipeline

{{#if featureDetails.opportunityPipeline}}
**Total Opportunities:** {{featureDetails.opportunityPipeline.totalOpportunities}}
**Win Rate (12 months):** {{featureDetails.opportunityPipeline.winRate}}

### Stage Distribution

{{#if featureDetails.opportunityPipeline.stages}}
| Stage | Count | % of Pipeline |
|-------|-------|---------------|
{{#each featureDetails.opportunityPipeline.stages}}
| {{this.name}} | {{this.count}} | {{this.percentage}}% |
{{/each}}
{{else}}
No open opportunities or stages not configured.
{{/if}}

### Health Notes

{{featureDetails.opportunityPipeline.healthNotes}}
{{else}}
Opportunity pipeline information not available. Run feature detection to populate.
{{/if}}
