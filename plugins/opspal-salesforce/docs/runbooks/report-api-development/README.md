# Report API Development Runbooks

**Version**: v3.51.0
**Last Updated**: November 26, 2025
**Status**: Complete

---

## Overview

This collection of 9 comprehensive runbooks covers **building Salesforce reports via API** for all four report formats: Tabular, Summary, Matrix, and Joined. Each runbook documents both **REST API (Analytics JSON)** and **Metadata API (XML)** approaches with guidance on when to use each.

**Total Documentation**: 23,500+ lines across 9 runbooks
**Coverage**: 100% of report formats + validation + deployment + troubleshooting
**Integration**: CLI, agents, scripts, MCP tools, Living Runbook System

**Key Highlight**: Joined reports receive extra depth (2 runbooks) covering the complex multi-block architecture and cross-block formulas.

---

## Quick Navigation

| Runbook | Topics | Use When | Est. Lines |
|---------|--------|----------|------------|
| [**1. Report Formats Fundamentals**](01-report-formats-fundamentals.md) | Format selection decision tree, REST vs Metadata API, MCP tools | Choosing format and API method | 2,800+ |
| [**2. Tabular Reports**](02-tabular-reports.md) | Column config, selective filters, row limits, dashboards | Creating simple list reports | 2,200+ |
| [**3. Summary Reports**](03-summary-reports.md) | Groupings, aggregates, dateGranularity, 2,000-row limit | Creating grouped reports with subtotals | 3,000+ |
| [**4. Matrix Reports**](04-matrix-reports.md) | Dual grouping, sparse grids, cell intersections | Creating cross-tabulation reports | 2,800+ |
| [**5. Joined Reports - Basics**](05-joined-reports-basics.md) | Multi-block architecture, when to use, common groupings | Understanding joined report fundamentals | 2,400+ |
| [**6. Joined Reports - Advanced**](06-joined-reports-advanced.md) | Cross-block formulas, template approach, Metadata API XML | Building complex joined reports | 3,200+ |
| [**7. Custom Report Types**](07-custom-report-types.md) | Creating custom types via API, relationship definitions | Extending available report types | 2,500+ |
| [**8. Validation & Deployment**](08-validation-deployment.md) | Format-specific validation, pre-deployment checks, testing | Validating and deploying reports | 2,400+ |
| [**9. Troubleshooting & Optimization**](09-troubleshooting-optimization.md) | Common API errors, performance tuning, format switching | Fixing issues and improving performance | 2,200+ |

---

## Critical Information

### The 2,000-Row HARD LIMIT (Summary Format)

**CRITICAL**: The Analytics REST API silently truncates Summary format reports at 2,000 rows. No error is returned - data is simply missing.

| Row Estimate | Recommended Action |
|--------------|-------------------|
| < 1,500 | Safe to use SUMMARY format |
| 1,500 - 2,000 | Use SUMMARY with warning |
| > 2,000 | **MUST use TABULAR** (auto-switch recommended) |

Always estimate row count before creating Summary reports. See [Runbook 3](03-summary-reports.md) for detection and mitigation strategies.

### API Method Selection

| Scenario | Recommended API | Why |
|----------|----------------|-----|
| Dynamic/real-time creation | REST API (JSON) | Faster iteration, immediate feedback |
| Source control/CI-CD | Metadata API (XML) | Version control, repeatable deployments |
| Joined reports | Metadata API (XML) | REST API has limited joined support |
| Template-based creation | Either | Depends on infrastructure |

---

## Common Workflows

### First-Time Report Builder

**Goal**: Create and deploy your first report via API

1. **Choose format** → [Runbook 1: Report Formats Fundamentals](01-report-formats-fundamentals.md)
   - Understand the 4 report formats
   - Use decision tree to select format
   - Choose API method (REST or Metadata)

2. **Learn format specifics** → [Runbooks 2-6](02-tabular-reports.md)
   - Tabular: Simple lists, exports
   - Summary: Grouped with subtotals
   - Matrix: Cross-tabulation
   - Joined: Multi-object comparison

3. **Build your report** → Format-specific runbook
   - Follow JSON or XML examples
   - Apply validation rules
   - Test with sample data

4. **Validate thoroughly** → [Runbook 8: Validation & Deployment](08-validation-deployment.md)
   - Run format-specific validation
   - Check field availability
   - Verify aggregation compatibility

5. **Deploy and verify** → [Runbook 8: Validation & Deployment](08-validation-deployment.md)
   - Deploy to target folder
   - Run report to verify
   - Check for expected data

**Estimated Time**: 1-2 hours for first report (subsequent: 15-30 minutes)

---

### Building Joined Reports (Multi-Block)

**Goal**: Create a joined report comparing data from multiple sources

1. **Understand joined architecture** → [Runbook 5: Joined Basics](05-joined-reports-basics.md)
   - When to use joined reports
   - Block structure (2-5 blocks)
   - Common grouping strategies

2. **Plan your blocks** → [Runbook 5: Section 3](05-joined-reports-basics.md)
   - Identify report types for each block
   - Plan filters per block
   - Choose common grouping field

3. **Build advanced features** → [Runbook 6: Joined Advanced](06-joined-reports-advanced.md)
   - Add cross-block formulas
   - Use template-based approach
   - Generate Metadata API XML

4. **Deploy via Metadata API** → [Runbook 6: Section 5](06-joined-reports-advanced.md)
   - REST API has limitations for joined
   - Use `sf project deploy`
   - Verify block alignment

**Estimated Time**: 2-4 hours for first joined report

---

### Troubleshooting Report Errors

**Goal**: Fix API errors quickly

1. **Identify error type** → [Runbook 9: Troubleshooting](09-troubleshooting-optimization.md)
   - Common error codes
   - Error message parsing
   - Format-specific issues

2. **Apply fix** → [Runbook 9: Section 3](09-troubleshooting-optimization.md)
   - Invalid field errors
   - Aggregation compatibility
   - Filter syntax issues
   - Permission errors

3. **Prevent future errors** → [Runbook 8: Validation](08-validation-deployment.md)
   - Pre-deployment validation
   - Field availability checks
   - Format-specific rules

**Estimated Time**: 10-30 minutes depending on error complexity

---

## Format Capabilities Matrix

| Feature | TABULAR | SUMMARY | MATRIX | JOINED |
|---------|---------|---------|--------|--------|
| Max groupings (down) | 0 | 3 | 3 | Per block |
| Max groupings (across) | 0 | 0 | 2 | Per block |
| Aggregates | No | Yes | Yes | Per block |
| Charts | Limited | Yes | Yes | 1 total |
| Row limit (API) | 50,000 | **2,000** | ~1,500 | ~500/block |
| Export to Excel | Yes | Yes | Yes | Limited |
| Dashboard support | Yes | Yes | Yes | Limited |

---

## Access Methods

### CLI Access

```bash
# List all report runbooks
flow runbook --list --domain reports

# Search by keyword
flow runbook --search "joined" --domain reports
flow runbook --search "validation" --domain reports

# View specific runbook
flow runbook reports/1              # By number
flow runbook reports/summary        # By topic
```

### Agent Integration (Automatic)

Report agents automatically load relevant runbook sections:

| Agent | Primary Runbooks | Use Case |
|-------|-----------------|----------|
| `sfdc-reports-dashboards` | 1, 2, 8 | Master orchestrator |
| `sfdc-report-designer` | 1-6 | Format-specific design |
| `sfdc-report-validator` | 3, 8 | Pre-deployment validation |
| `sfdc-report-template-deployer` | 5, 6, 8 | Template deployment |
| `sfdc-report-type-manager` | 7 | Custom report types |

### Script Integration

Report scripts reference runbooks in JSDoc:

```javascript
/**
 * Creates a report via Analytics REST API
 * @see {@link docs/runbooks/report-api-development/01-report-formats-fundamentals.md}
 */
async function createReport(config) { ... }
```

### Direct File Access

All runbooks available in this directory:
- `01-report-formats-fundamentals.md`
- `02-tabular-reports.md`
- `03-summary-reports.md`
- `04-matrix-reports.md`
- `05-joined-reports-basics.md`
- `06-joined-reports-advanced.md`
- `07-custom-report-types.md`
- `08-validation-deployment.md`
- `09-troubleshooting-optimization.md`

---

## Key Features

### Format Selection Decision Tree (Runbook 1)

```
Need simple list/export?
├─ YES → TABULAR
└─ NO → Need grouping?
         ├─ NO → TABULAR
         └─ YES → Need 2 dimensions?
                  ├─ YES → MATRIX
                  └─ NO → Need multiple report types?
                           ├─ YES → JOINED
                           └─ NO → Row count > 2000?
                                    ├─ YES → TABULAR (forced)
                                    └─ NO → SUMMARY
```

### Format-Specific Validation Rules (Runbook 8)

| Format | Critical Validations |
|--------|---------------------|
| TABULAR | No groupings present, no aggregates, column limit ≤15 |
| SUMMARY | Has groupings, grouping fields NOT in columns, dateGranularity for dates, rows < 2000 |
| MATRIX | Both groupingsDown AND groupingsAcross, sparse grid handling |
| JOINED | 2-5 blocks, each block has reportType, common grouping recommended |

### Aggregation Compatibility (Runbook 8)

| Field Type | SUM | AVG | MIN | MAX | COUNT | GROUP BY |
|------------|-----|-----|-----|-----|-------|----------|
| Currency | Yes | Yes | Yes | Yes | Yes | No |
| Number | Yes | Yes | Yes | Yes | Yes | Yes |
| Percent | Yes | Yes | Yes | Yes | Yes | No |
| Date | No | No | Yes | Yes | Yes | Yes |
| Picklist | No | No | No | No | Yes | Yes |
| Text | No | No | No | No | Yes | Yes |

---

## API Reference

### REST API (Analytics)

**Base Endpoint**: `/services/data/vXX.0/analytics/reports`

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Create report | POST | `/reports` |
| Clone report | POST | `/reports?cloneId={sourceId}` |
| Update report | PATCH | `/reports/{reportId}` |
| Run report | POST | `/reports/{reportId}` |
| Delete report | DELETE | `/reports/{reportId}` |

### Metadata API (XML)

**Deployment**: `sf project deploy start -d force-app/main/default/reports`

**Report XML Structure**:
```xml
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>Report_Name</name>
    <reportType>Opportunity</reportType>
    <format>Summary</format>
    <columns>...</columns>
    <groupingsDown>...</groupingsDown>
    <aggregates>...</aggregates>
</Report>
```

### MCP Tools

| Tool | Purpose |
|------|---------|
| `mcp_salesforce_report_type_list` | List available report types |
| `mcp_salesforce_report_type_describe` | Get report type metadata |
| `mcp_salesforce_report_create` | Create new report |
| `mcp_salesforce_report_clone` | Clone existing report |
| `mcp_salesforce_report_deploy` | Deploy report metadata |
| `mcp_salesforce_report_run` | Execute report |

---

## Living Runbook Integration

### Automatic Observation

The Living Runbook System captures report operations:
- Format selection patterns
- Common validation errors
- Deployment success rates
- Performance metrics

### Generated Insights

View org-specific report patterns:

```bash
# View synthesized report patterns for org
node scripts/lib/runbook-context-extractor.js \
  --org [org-alias] \
  --operation-type report_creation \
  --format json
```

---

## Related Documentation

### Design Guidelines (WHAT/WHY)
- [REPORT_DASHBOARD_DESIGN_GUIDELINES.md](../../REPORT_DASHBOARD_DESIGN_GUIDELINES.md)

### API Implementation (HOW)
- This runbook series

### Scripts
- `scripts/lib/universal-report-creator.js`
- `scripts/lib/report-template-deployer.js`
- `scripts/lib/report-format-selector.js` (NEW)
- `scripts/lib/report-format-validator.js` (NEW)
- `scripts/lib/joined-report-builder.js` (NEW)

### Templates
- `templates/reports/format-bases/tabular-base.json`
- `templates/reports/format-bases/summary-base.json`
- `templates/reports/format-bases/matrix-base.json`
- `templates/reports/format-bases/joined-base.json`

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v3.51.0 | 2025-11-26 | Initial release - Complete 9-runbook series with extra joined depth |

---

**Last Updated**: November 26, 2025
**Maintained By**: Salesforce Plugin Team
**Plugin Version**: v3.51.0
