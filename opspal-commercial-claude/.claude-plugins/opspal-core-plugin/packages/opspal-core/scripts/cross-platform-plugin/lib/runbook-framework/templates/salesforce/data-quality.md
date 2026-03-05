## Data Quality Rules

{{#if featureDetails.dataQuality}}
**Validation Rules:** {{featureDetails.dataQuality.validationRuleCount}}
**Duplicate Rules:** {{featureDetails.dataQuality.duplicateRuleCount}}
**Objects with Rules:** {{featureDetails.dataQuality.objectCount}}

### Top Validation Rules

{{#if featureDetails.dataQuality.topRules}}
| Rule Name | Object | Type |
|-----------|--------|------|
{{#each featureDetails.dataQuality.topRules}}
| {{this.name}} | {{this.object}} | {{this.description}} |
{{/each}}
{{else}}
No validation rules documented.
{{/if}}
{{else}}
Data quality information not available. Run feature detection to populate.
{{/if}}
