## Integrations

{{#if featureDetails.integrations}}
{{#each featureDetails.integrations}}
### {{this.name}}

- **Type:** {{this.type}}
- **Status:** {{this.status}}
{{#if this.syncDirection}}- **Sync Direction:** {{this.syncDirection}}{{/if}}
{{#if this.notes}}- **Notes:** {{this.notes}}{{/if}}

{{/each}}
{{else}}
No integrations documented. Connected apps and integrations will be detected during feature detection.
{{/if}}
