# Instance-Agnostic Toolkit Reference

Use `scripts/lib/instance-agnostic-toolkit.js` whenever Salesforce work would otherwise depend on hardcoded org aliases, field API names, validation bypasses, or bespoke recovery logic.

## Required Usage Pattern

```javascript
const toolkit = require('./scripts/lib/instance-agnostic-toolkit');
const kit = toolkit.createToolkit(null, { verbose: true });

await kit.init();

const org = await kit.getOrgContext();
const orgParam = kit.getOrgParam();
const fieldApiName = await kit.getField('Contact', 'funnel stage');
```

## Core Helpers

| Helper | Use |
|--------|-----|
| `createToolkit()` | Create a toolkit instance for the current org context |
| `init()` | Load org context before using toolkit methods |
| `getOrgContext()` | Resolve the active org without hardcoding aliases |
| `getOrgParam()` | Build the correct `sf` CLI org parameter from resolved context |
| `getField()` / `getFields()` | Resolve API names from business-language field references |
| `getConfig()` / `setConfig()` | Read and persist org-specific configuration safely |
| `executeWithBypass()` | Wrap operations that need validation-sensitive write handling |
| `executeWithRecovery()` | Run high-risk operations with retry, bypass, and recovery flow |
| `generateAttributionCSV()` | Build attribution update payloads without custom CSV glue |
| `getCampaignJourneyStats()` | Reuse campaign-journey reporting patterns |

## Non-Negotiable Rules

- Do not hardcode org aliases when `getOrgContext()` or `getOrgParam()` can derive them.
- Do not hardcode field API names when `getField()` or `getFields()` can resolve them.
- Wrap bulk or mutating workflows in `executeWithRecovery()` unless there is a documented reason not to.
- Use `executeWithBypass()` when validation rules or blocking automation must be managed deliberately.
- Persist org-specific decisions in toolkit-backed config rather than duplicating one-off logic in the agent prompt.

## Safe Recovery Pattern

```javascript
await kit.executeWithRecovery(async () => {
  return await runOperation();
}, {
  objectName: 'Contact',
  maxRetries: 3
});
```

## When To Reach For It

- Flow, metadata, or data operations that must survive org-specific variation
- Discovery work that needs fuzzy field lookup before SOQL, CSV, or metadata changes
- Bulk updates where retries, validation bypass, or recovery classification matter
- Attribution, funnel, or enrichment workflows that already have toolkit support

## Repair Guidance

If a workflow is failing because of alias, field-name, or validation-rule assumptions, stop and rework it around the toolkit before continuing operational execution.
