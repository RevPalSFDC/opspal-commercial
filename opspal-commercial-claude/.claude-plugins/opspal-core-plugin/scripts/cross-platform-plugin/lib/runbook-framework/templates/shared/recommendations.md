## Recommendations

{{#if recommendations}}
{{#each recommendations}}
- {{this}}
{{/each}}
{{else}}
No recommendations at this time. Continue capturing observations to generate actionable recommendations.
{{/if}}

---

## Best Practices

{{#if best_practices}}
{{#each best_practices}}
- {{this}}
{{/each}}
{{else}}
- Review this runbook before major changes
- Run `/reflect` after development sessions
- Document exceptions immediately
- Update runbook after configuration changes
{{/if}}
