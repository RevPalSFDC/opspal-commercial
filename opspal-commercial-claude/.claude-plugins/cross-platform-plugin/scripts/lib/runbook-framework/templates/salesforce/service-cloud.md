## Service Cloud

{{#if featureDetails.serviceCloud}}
{{#if featureDetails.serviceCloud.hasCases}}
**Total Cases:** {{featureDetails.serviceCloud.totalCases}}

### Open Case Status Distribution

{{#if featureDetails.serviceCloud.openCaseStatuses}}
| Status | Count |
|--------|-------|
{{#each featureDetails.serviceCloud.openCaseStatuses}}
| {{this.status}} | {{this.count}} |
{{/each}}
{{else}}
No open cases or status distribution not available.
{{/if}}
{{else}}
Service Cloud not in active use (no cases found).
{{/if}}
{{else}}
Service Cloud information not available. Run feature detection to populate.
{{/if}}
