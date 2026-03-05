## Key Workflows

{{#if workflows}}
{{#each workflows}}
### {{this.name}}

- **Type:** {{this.type}}
- **Status:** {{this.status}}
{{#if this.trigger}}- **Trigger:** {{this.trigger}}{{/if}}
{{#if this.description}}

{{this.description}}
{{/if}}

{{/each}}
{{else}}
No workflows documented yet. Operations will automatically detect and document workflows.
{{/if}}
