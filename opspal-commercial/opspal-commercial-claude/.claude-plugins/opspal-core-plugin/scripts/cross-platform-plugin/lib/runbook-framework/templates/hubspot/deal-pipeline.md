## Deal Pipeline

{{#if featureDetails.dealPipeline}}
**Total Deals:** {{featureDetails.dealPipeline.totalDeals}}
**Win Rate:** {{featureDetails.dealPipeline.winRate}}
**Pipelines:** {{featureDetails.dealPipeline.pipelineCount}}

### Pipeline Stages

{{#if featureDetails.dealPipeline.stages}}
| Stage | Deals | Value | Probability |
|-------|-------|-------|-------------|
{{#each featureDetails.dealPipeline.stages}}
| {{this.name}} | {{this.count}} | {{this.value}} | {{this.probability}}% |
{{/each}}
{{else}}
Deal stages not configured or data unavailable.
{{/if}}

### Health Notes

{{featureDetails.dealPipeline.healthNotes}}
{{else}}
Deal pipeline information not available. Run feature detection to populate.
{{/if}}
