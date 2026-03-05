## Known Exceptions

{{#if known_exceptions}}
{{#each known_exceptions}}
### {{this.name}}

{{this.description}}

{{#if this.workaround}}**Workaround:** {{this.workaround}}{{/if}}
{{#if this.frequency}}

*Frequency: {{this.frequency}}*
{{/if}}

{{/each}}
{{else}}
No exceptions documented. Exceptions are captured automatically through `/reflect` sessions and operation monitoring.
{{/if}}
