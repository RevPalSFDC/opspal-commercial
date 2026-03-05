## Data Model

{{#if objects}}
{{#each objects}}
### {{this.name}}

- **API Name:** {{this.api_name}}
{{#if this.record_count}}- **Record Count:** {{this.record_count}}{{/if}}
{{#if this.custom_fields_count}}- **Custom Fields:** {{this.custom_fields_count}}{{/if}}
{{#if this.observation_count}}- **Operations Observed:** {{this.observation_count}}{{/if}}
{{#if this.description}}

{{this.description}}
{{/if}}

{{/each}}
{{else}}
No objects documented yet. Run discovery to populate this section.
{{/if}}
