## CPQ Configuration

{{#if featureDetails.cpq}}
{{#if featureDetails.cpq.hasCPQ}}
**Salesforce CPQ Installed:** Yes
**Quote Count:** {{featureDetails.cpq.quoteCount}}

### Notes

{{featureDetails.cpq.notes}}

### Recommended Actions

- Run `/q2c-audit` for comprehensive CPQ assessment
- Review pricing rules and discount schedules
- Validate approval workflows
- Check bundle and product configuration
{{else}}
Salesforce CPQ is not installed in this org.
{{/if}}
{{else}}
CPQ information not available. Run feature detection to check for SBQQ namespace.
{{/if}}
