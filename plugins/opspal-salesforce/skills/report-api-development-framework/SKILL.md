---
name: report-api-development-framework
description: Salesforce report API lifecycle for format selection, REST vs Metadata API implementation, joined report handling, validation, deployment, and optimization. Use when creating or modifying reports end-to-end via API.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Report API Development Framework

## When to Use This Skill

Use this skill when:
- Creating or modifying Salesforce reports programmatically via API
- Choosing between Analytics REST API vs Metadata API for report operations
- Building report definitions with specific formats (tabular, summary, matrix, joined)
- Deploying report templates across orgs

**Not for**: Report type discovery only (use `report-type-reference`), joined report specifics (use `joined-report-engineering-framework`), or dashboard design (use `sfdc-dashboard-designer` agent).

## API Selection

| Operation | API | Endpoint |
|-----------|-----|----------|
| Run a report | Analytics REST | `GET /analytics/reports/{id}` |
| Create/update report | Metadata API | `sf project deploy` with `.report-meta.xml` |
| Clone a report | Analytics REST | `POST /analytics/reports?cloneId={id}` |
| List reports in folder | Analytics REST | `GET /analytics/reports?folderIds={id}` |
| Get report metadata | Analytics REST | `GET /analytics/reports/{id}/describe` |

## Report Format Constraints

| Format | Groupings | Detail Rows | Cross-Block | Use Case |
|--------|-----------|-------------|-------------|----------|
| Tabular | 0 | Yes (max 2,000) | N/A | Simple lists |
| Summary | 1-3 row | Yes (max 2,000) | N/A | Grouped data with subtotals |
| Matrix | 1-2 row + 1-2 column | Optional | N/A | Pivot table style |
| Joined | Per-block (max 2) | Per-block | Yes | Multi-source comparison |

## Workflow

1. Choose format based on grouping and comparison needs
2. Build `.report-meta.xml` with report type, columns, filters, groupings
3. Validate column API names exist in target org
4. Deploy via `sf project deploy start --metadata "Report:folder/ReportName"`
5. Verify report runs successfully in target org

## Routing Boundaries

Use this skill for report CRUD lifecycle and deployment.
Use `report-type-reference` for report type discovery only.

## References

- [format selection](./format-selection.md)
- [joined reports](./joined-reports.md)
- [validation and deployment](./validation-deployment.md)
- [troubleshooting and optimization](./troubleshooting-optimization.md)
