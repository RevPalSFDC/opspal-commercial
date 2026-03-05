---
name: report-api-development-framework
description: Salesforce report API lifecycle for format selection, REST vs Metadata API implementation, joined report handling, validation, deployment, and optimization. Use when creating or modifying reports end-to-end via API.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Report API Development Framework

Use this skill for full report creation and deployment workflow.

## Workflow

1. Select report format and API path.
2. Build report definition with required fields/filters/groupings.
3. Apply format-specific constraints (including row limits).
4. Validate before deploy.
5. Deploy and tune performance.

## Routing Boundaries

Use this skill for report CRUD lifecycle and deployment.
Do not use this skill for report type discovery only; use `report-type-reference`.

## References

- [format selection](./format-selection.md)
- [joined reports](./joined-reports.md)
- [validation and deployment](./validation-deployment.md)
- [troubleshooting and optimization](./troubleshooting-optimization.md)
