## Marketing Automation

{{#if featureDetails.marketingAutomation}}
**Active Workflows:** {{featureDetails.marketingAutomation.activeWorkflows}}
**Active Sequences:** {{featureDetails.marketingAutomation.activeSequences}}
**Email Templates:** {{featureDetails.marketingAutomation.emailTemplates}}

### Workflows by Type

{{#if featureDetails.marketingAutomation.workflowsByType}}
| Type | Count | Status |
|------|-------|--------|
{{#each featureDetails.marketingAutomation.workflowsByType}}
| {{this.type}} | {{this.count}} | {{this.activeCount}} active |
{{/each}}
{{else}}
No workflow data available.
{{/if}}

### Active Sequences

{{#if featureDetails.marketingAutomation.sequences}}
{{#each featureDetails.marketingAutomation.sequences}}
- **{{this.name}}**: {{this.steps}} steps, {{this.enrolled}} enrolled
{{/each}}
{{else}}
No sequences configured.
{{/if}}

### Email Performance

{{#if featureDetails.marketingAutomation.emailStats}}
- **Open Rate:** {{featureDetails.marketingAutomation.emailStats.openRate}}
- **Click Rate:** {{featureDetails.marketingAutomation.emailStats.clickRate}}
- **Bounce Rate:** {{featureDetails.marketingAutomation.emailStats.bounceRate}}
{{/if}}
{{else}}
Marketing automation information not available. Run feature detection to populate.
{{/if}}
