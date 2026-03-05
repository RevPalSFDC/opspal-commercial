## Contact Lifecycle

{{#if featureDetails.contactLifecycle}}
**Total Contacts:** {{featureDetails.contactLifecycle.totalContacts}}
**Lifecycle Stages:** {{featureDetails.contactLifecycle.stageCount}}

### Lifecycle Stages

{{#if featureDetails.contactLifecycle.stages}}
| Stage | Count | % of Total |
|-------|-------|------------|
{{#each featureDetails.contactLifecycle.stages}}
| {{this.label}} | {{this.count}} | {{this.percentage}}% |
{{/each}}
{{else}}
Lifecycle stages not configured or data unavailable.
{{/if}}

### Lead Scoring

{{#if featureDetails.contactLifecycle.leadScoring}}
- **Scoring Model:** {{featureDetails.contactLifecycle.leadScoring.model}}
- **Average Score:** {{featureDetails.contactLifecycle.leadScoring.avgScore}}
- **MQL Threshold:** {{featureDetails.contactLifecycle.leadScoring.mqlThreshold}}
{{else}}
Lead scoring not configured.
{{/if}}

### Notes

{{featureDetails.contactLifecycle.notes}}
{{else}}
Contact lifecycle information not available. Run feature detection to populate.
{{/if}}
