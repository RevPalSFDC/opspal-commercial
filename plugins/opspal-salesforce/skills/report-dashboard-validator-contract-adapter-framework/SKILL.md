---
name: report-dashboard-validator-contract-adapter-framework
description: Keep hook-call contracts aligned with report/dashboard validator module exports and payload shapes.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Report/Dashboard Validator Contract Adapter

## When to Use This Skill

Use this skill when:
- Maintaining the contract between hook scripts and the report/dashboard validator modules
- Updating validator module exports that hooks consume
- Adding new validation checks to the report/dashboard deployment pipeline
- Debugging hook failures caused by contract mismatches (wrong payload shape)

**Not for**: Report creation (use `report-api-development-framework`), dashboard design (use `sfdc-dashboard-designer` agent), or general deployment validation (use `deployment-validation-framework`).

## Contract Structure

Hooks call validator modules via Node.js `require()`. The contract defines:

| Module Export | Input Shape | Output Shape | Called By |
|--------------|-------------|--------------|-----------|
| `validateReport(metadata)` | `{reportName, reportType, columns[], filters[]}` | `{valid: bool, errors: []}` | Pre-deploy hook |
| `validateDashboard(metadata)` | `{dashboardName, components[], folder}` | `{valid: bool, errors: []}` | Pre-deploy hook |
| `checkReportType(typeName, org)` | `string, string` | `{exists: bool, fields: []}` | Report builder agent |

## Adapter Rules

- Hook scripts must pass the exact payload shape the validator expects
- When validator exports change, update all consuming hooks
- Regression tests must cover: valid input, invalid input, empty input, malformed input
- Validators must return `{valid: false, errors: [...]}` (never throw on bad input)

## Workflow

1. Check current validator module exports against hook call sites
2. If adding a new export, update the contract map documentation
3. Add regression tests for the new contract path
4. Verify hooks pass the correct payload shape after changes

## References

- [Export Contract Map](./export-contract-map.md)
- [Adapter Patterns](./adapter-patterns.md)
- [Regression Tests](./regression-tests.md)
