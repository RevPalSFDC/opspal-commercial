# Runbook 1: Report Formats Fundamentals

**Version**: v3.51.0
**Last Updated**: November 26, 2025
**Estimated Reading Time**: 25 minutes

---

## Table of Contents

1. [Overview](#1-overview)
2. [The Four Report Formats](#2-the-four-report-formats)
3. [Format Selection Decision Tree](#3-format-selection-decision-tree)
4. [API Methods Comparison](#4-api-methods-comparison)
5. [REST API (Analytics JSON)](#5-rest-api-analytics-json)
6. [Metadata API (XML)](#6-metadata-api-xml)
7. [MCP Tools for Reports](#7-mcp-tools-for-reports)
8. [Critical Limits and Constraints](#8-critical-limits-and-constraints)
9. [Format Selection Algorithm](#9-format-selection-algorithm)
10. [Quick Reference](#10-quick-reference)

---

## 1. Overview

Salesforce offers four report formats, each suited for different analytical needs. When building reports programmatically via API, selecting the right format is critical for both functionality and performance.

### What This Runbook Covers

- **Format fundamentals**: Understanding each format's capabilities and limitations
- **Selection criteria**: Decision tree for choosing the optimal format
- **API methods**: When to use REST API (JSON) vs Metadata API (XML)
- **MCP integration**: Available tools for report operations
- **Critical constraints**: Row limits, performance considerations

### Prerequisites

- Salesforce org with Report access
- Understanding of report types available in your org
- For REST API: API-enabled user with appropriate permissions
- For Metadata API: `sf` CLI installed and authenticated

---

## 2. The Four Report Formats

### 2.1 Tabular Format

**Description**: A simple spreadsheet-like list of records with columns and rows, but no grouping or charts.

**Best For**:
- Record lists and exports
- Data dumps for external processing
- Dashboard source reports (with row limits)
- Scenarios with >2,000 expected rows

**Characteristics**:
| Attribute | Value |
|-----------|-------|
| Groupings | None |
| Aggregates | None (except row count) |
| Charts | Limited (horizontal bar only) |
| Row Limit (API) | ~50,000 |
| Export | Full Excel support |

**Example Use Cases**:
- "List all opportunities closing this quarter"
- "Export contacts for email campaign"
- "All accounts in California"

**API Format Identifier**:
- REST API: `"reportFormat": "TABULAR"`
- Metadata API: `<format>Tabular</format>`

---

### 2.2 Summary Format

**Description**: Extends tabular by allowing grouping (up to 3 levels) with subtotals and grand totals. Supports charts.

**Best For**:
- Grouped analysis with subtotals
- Dashboard visualizations
- Metrics by category (stage, owner, region)
- Scenarios with <2,000 rows

**Characteristics**:
| Attribute | Value |
|-----------|-------|
| Groupings (down) | 1-3 levels |
| Groupings (across) | 0 |
| Aggregates | SUM, AVG, MIN, MAX, COUNT |
| Charts | Full support |
| Row Limit (API) | **2,000 (HARD LIMIT - silent truncation)** |
| Export | Full Excel support |

**Example Use Cases**:
- "Opportunity amount by stage"
- "Case count by priority by month"
- "Pipeline by sales rep"

**API Format Identifier**:
- REST API: `"reportFormat": "SUMMARY"`
- Metadata API: `<format>Summary</format>`

**CRITICAL WARNING**: The Analytics REST API silently truncates Summary reports at 2,000 rows. No error is returned - data simply disappears. Always estimate row count before using Summary format.

---

### 2.3 Matrix Format

**Description**: A special type of summary report with grouping on both rows AND columns, creating a pivot-table-like view.

**Best For**:
- Two-dimensional analysis
- Cross-tabulation (e.g., Stage by Quarter)
- Comparative analysis
- Heatmap-style visualizations

**Characteristics**:
| Attribute | Value |
|-----------|-------|
| Groupings (down) | 1-3 levels |
| Groupings (across) | 1-2 levels |
| Aggregates | SUM, AVG, MIN, MAX, COUNT |
| Charts | Full support |
| Row Limit (API) | ~1,500 |
| Export | Excel support (may lose formatting) |

**Example Use Cases**:
- "Revenue by Rep by Quarter"
- "Cases by Status by Priority"
- "Opportunities by Stage by Month"

**API Format Identifier**:
- REST API: `"reportFormat": "MATRIX"`
- Metadata API: `<format>Matrix</format>`

**Sparse Grid Consideration**: If groupingsAcross produces many columns (>20), the matrix becomes sparse and hard to read. Consider using Summary with custom formulas instead.

---

### 2.4 Joined Format

**Description**: Combines multiple report blocks (2-5) into one view, each block potentially from a different report type.

**Best For**:
- Cross-object comparisons
- Side-by-side period analysis
- 360-degree views (e.g., Account with Opps and Cases)
- Combining unrelated datasets

**Characteristics**:
| Attribute | Value |
|-----------|-------|
| Blocks | 2-5 blocks |
| Report types | Different type per block allowed |
| Common grouping | Recommended for alignment |
| Cross-block formulas | Supported |
| Charts | 1 chart total |
| Row Limit (API) | ~500 per block |
| Export | Limited (no single Excel) |

**Example Use Cases**:
- "This Quarter vs Last Quarter comparison"
- "Account with Opportunities and Cases"
- "Won vs Lost opportunities"

**API Format Identifier**:
- REST API: `"reportFormat": "JOINED"` (limited support)
- Metadata API: `<format>MultiBlock</format>`

**API Limitation**: REST API has limited support for creating joined reports. Use Metadata API for reliable joined report creation.

---

## 3. Format Selection Decision Tree

Use this decision tree to select the optimal report format:

```
START: What is your primary need?
│
├─► Simple record list / export?
│   └─► USE TABULAR
│
├─► Need grouping with subtotals?
│   │
│   ├─► Need TWO dimensions (rows AND columns)?
│   │   └─► USE MATRIX
│   │       └─ Verify: <20 column values expected?
│   │           ├─► Yes: Matrix is good
│   │           └─► No: Consider Summary + custom formulas
│   │
│   └─► Need ONE dimension (rows only)?
│       │
│       ├─► Row count > 2,000?
│       │   └─► USE TABULAR (Summary truncates!)
│       │       └─ Alternative: Add filters to reduce rows
│       │
│       └─► Row count ≤ 2,000?
│           └─► USE SUMMARY
│
└─► Need data from multiple report types?
    └─► USE JOINED
        └─ Note: Use Metadata API for creation
```

### Quick Selection Guide

| Requirement | Format | Notes |
|------------|--------|-------|
| Export all records | TABULAR | No row limit concerns |
| Grouped totals, <2k rows | SUMMARY | Most common choice |
| Pivot table view | MATRIX | Row x Column analysis |
| Compare periods (Q1 vs Q2) | JOINED | Same type, different filters |
| Compare objects (Opps vs Cases) | JOINED | Different report types |
| Dashboard source | SUMMARY (usually) | Set row limit for dashboards |
| >2,000 rows with grouping | TABULAR | Then group in Excel/BI tool |

---

## 4. API Methods Comparison

Salesforce provides two primary methods for creating reports programmatically:

### 4.1 Overview

| Aspect | REST API (Analytics) | Metadata API (XML) |
|--------|---------------------|-------------------|
| Format | JSON | XML |
| Speed | Fast iteration | Deployment pipeline |
| Source control | Not native | Git-friendly |
| Joined reports | Limited support | Full support |
| Dynamic creation | Excellent | Better for templates |
| Error feedback | Immediate | Deployment logs |
| MCP integration | Direct | Via CLI wrapper |

### 4.2 When to Use REST API (Analytics JSON)

**Best for**:
- Dynamic report creation (runtime generation)
- Rapid prototyping and testing
- Tabular, Summary, Matrix formats
- Real-time report modifications
- One-off report generation

**Example scenarios**:
- "Generate a pipeline report for the current user"
- "Create a custom report based on user selections"
- "Clone and modify an existing report dynamically"

### 4.3 When to Use Metadata API (XML)

**Best for**:
- Source control integration (Git)
- CI/CD pipelines
- Joined reports (required)
- Template-based deployments
- Repeatable deployments across orgs
- Complex report configurations

**Example scenarios**:
- "Deploy standard report set to new sandbox"
- "Create joined report comparing periods"
- "Maintain reports in version control"

### 4.4 Hybrid Approach

For many use cases, a hybrid approach works best:

1. **Design in REST API**: Rapidly iterate on report structure
2. **Export to XML**: Once finalized, export for version control
3. **Deploy via Metadata API**: Use CI/CD for production deployments

---

## 5. REST API (Analytics JSON)

### 5.1 Base Endpoint

```
/services/data/vXX.0/analytics/reports
```

Replace `vXX.0` with your API version (e.g., `v62.0`).

### 5.2 Authentication

```bash
# Get access token
sf org display --target-org [alias] --json | jq -r '.result.accessToken'

# Get instance URL
sf org display --target-org [alias] --json | jq -r '.result.instanceUrl'
```

### 5.3 Core Operations

#### Create Report

```bash
POST /services/data/v62.0/analytics/reports
Content-Type: application/json

{
  "reportMetadata": {
    "name": "My API Report",
    "reportFormat": "SUMMARY",
    "reportType": {
      "type": "Opportunity"
    },
    "detailColumns": [
      "OPPORTUNITY_NAME",
      "ACCOUNT_NAME",
      "AMOUNT",
      "CLOSE_DATE"
    ],
    "groupingsDown": [
      {
        "name": "STAGE_NAME",
        "sortOrder": "Asc",
        "dateGranularity": "None"
      }
    ],
    "aggregates": [
      "s!AMOUNT",
      "RowCount"
    ],
    "reportFilters": [
      {
        "column": "CLOSE_DATE",
        "filterType": "equals",
        "value": "THIS_FISCAL_QUARTER"
      }
    ],
    "folderId": "00lxx000000XXXXX"
  }
}
```

#### Clone Report

```bash
POST /services/data/v62.0/analytics/reports?cloneId=00Oxx000000XXXXX
Content-Type: application/json

{
  "reportMetadata": {
    "name": "Cloned Report - Modified",
    "folderId": "00lxx000000XXXXX"
  }
}
```

#### Update Report

```bash
PATCH /services/data/v62.0/analytics/reports/00Oxx000000XXXXX
Content-Type: application/json

{
  "reportMetadata": {
    "reportFilters": [
      {
        "column": "STAGE_NAME",
        "filterType": "equals",
        "value": "Closed Won"
      }
    ]
  }
}
```

#### Run Report (Execute and Get Data)

```bash
POST /services/data/v62.0/analytics/reports/00Oxx000000XXXXX
Content-Type: application/json

{
  "reportMetadata": {
    "reportFilters": [
      {
        "column": "CLOSE_DATE",
        "filterType": "equals",
        "value": "THIS_FISCAL_QUARTER"
      }
    ]
  }
}
```

### 5.4 JSON Structure Reference

#### Tabular Report JSON

```json
{
  "reportMetadata": {
    "name": "Account List",
    "reportFormat": "TABULAR",
    "reportType": { "type": "Account" },
    "detailColumns": [
      "ACCOUNT_NAME",
      "INDUSTRY",
      "BILLING_STATE",
      "ANNUAL_REVENUE"
    ],
    "reportFilters": [
      {
        "column": "BILLING_STATE",
        "filterType": "equals",
        "value": "California"
      }
    ],
    "folderId": "00lxx000000XXXXX"
  }
}
```

#### Summary Report JSON

```json
{
  "reportMetadata": {
    "name": "Pipeline by Stage",
    "reportFormat": "SUMMARY",
    "reportType": { "type": "Opportunity" },
    "detailColumns": [
      "OPPORTUNITY_NAME",
      "ACCOUNT_NAME",
      "AMOUNT",
      "CLOSE_DATE"
    ],
    "groupingsDown": [
      {
        "name": "STAGE_NAME",
        "sortOrder": "Asc",
        "dateGranularity": "None"
      }
    ],
    "aggregates": ["s!AMOUNT", "RowCount"],
    "showSubtotals": true,
    "showGrandTotal": true,
    "hasDetailRows": true,
    "folderId": "00lxx000000XXXXX"
  }
}
```

#### Matrix Report JSON

```json
{
  "reportMetadata": {
    "name": "Revenue by Rep by Quarter",
    "reportFormat": "MATRIX",
    "reportType": { "type": "Opportunity" },
    "detailColumns": ["OPPORTUNITY_NAME", "AMOUNT"],
    "groupingsDown": [
      {
        "name": "OWNER_FULL_NAME",
        "sortOrder": "Asc",
        "dateGranularity": "None"
      }
    ],
    "groupingsAcross": [
      {
        "name": "CLOSE_DATE",
        "sortOrder": "Asc",
        "dateGranularity": "Quarter"
      }
    ],
    "aggregates": ["s!AMOUNT"],
    "folderId": "00lxx000000XXXXX"
  }
}
```

### 5.5 Key Field References

#### Aggregate Prefixes

| Prefix | Meaning | Example |
|--------|---------|---------|
| `s!` | Sum | `s!AMOUNT` |
| `a!` | Average | `a!AMOUNT` |
| `m!` | Minimum | `m!AMOUNT` |
| `mx!` | Maximum | `mx!AMOUNT` |
| `RowCount` | Count | `RowCount` |

#### Date Granularity Options

| Value | Description |
|-------|-------------|
| `None` | No date grouping (exact date) |
| `Day` | Group by calendar day |
| `Week` | Group by week |
| `Month` | Group by calendar month |
| `Quarter` | Group by calendar quarter |
| `Year` | Group by calendar year |
| `FiscalQuarter` | Group by fiscal quarter |
| `FiscalYear` | Group by fiscal year |

#### Standard Date Filter Values

| Value | Description |
|-------|-------------|
| `TODAY` | Today only |
| `YESTERDAY` | Yesterday only |
| `THIS_WEEK` | Current week |
| `LAST_WEEK` | Previous week |
| `THIS_MONTH` | Current month |
| `LAST_MONTH` | Previous month |
| `THIS_QUARTER` | Current quarter |
| `LAST_QUARTER` | Previous quarter |
| `THIS_FISCAL_QUARTER` | Current fiscal quarter |
| `THIS_FISCAL_YEAR` | Current fiscal year |
| `LAST_N_DAYS:30` | Last 30 days |
| `NEXT_N_DAYS:90` | Next 90 days |

---

## 6. Metadata API (XML)

### 6.1 Report XML Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>Pipeline by Stage</name>
    <description>Opportunities grouped by stage</description>
    <reportType>Opportunity</reportType>
    <format>Summary</format>

    <!-- Columns -->
    <columns>
        <field>OPPORTUNITY_NAME</field>
    </columns>
    <columns>
        <field>ACCOUNT_NAME</field>
    </columns>
    <columns>
        <field>AMOUNT</field>
    </columns>
    <columns>
        <field>CLOSE_DATE</field>
    </columns>

    <!-- Groupings -->
    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>STAGE_NAME</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>

    <!-- Aggregates -->
    <aggregates>
        <calculatedFormula>AMOUNT:SUM</calculatedFormula>
        <datatype>currency</datatype>
        <developerName>SUM_AMOUNT</developerName>
        <isActive>true</isActive>
        <isCrossBlock>false</isCrossBlock>
        <masterLabel>Sum of Amount</masterLabel>
        <scale>2</scale>
    </aggregates>

    <!-- Filters -->
    <filter>
        <criteriaItems>
            <column>CLOSE_DATE</column>
            <columnToColumn>false</columnToColumn>
            <isUnlocked>false</isUnlocked>
            <operator>equals</operator>
            <value>THIS_FISCAL_QUARTER</value>
        </criteriaItems>
    </filter>

    <!-- Settings -->
    <showDetails>true</showDetails>
    <showGrandTotal>true</showGrandTotal>
    <showSubTotals>true</showSubTotals>
    <timeFrameFilter>
        <dateColumn>CLOSE_DATE</dateColumn>
        <interval>INTERVAL_CURFY</interval>
    </timeFrameFilter>
</Report>
```

### 6.2 Deployment Commands

```bash
# Deploy single report
sf project deploy start \
  --source-dir force-app/main/default/reports/MyFolder/MyReport.report-meta.xml \
  --target-org [alias]

# Deploy report folder
sf project deploy start \
  --source-dir force-app/main/default/reports/MyFolder \
  --target-org [alias]

# Deploy with validation only (check-only)
sf project deploy start \
  --source-dir force-app/main/default/reports \
  --target-org [alias] \
  --dry-run

# Retrieve existing report for reference
sf project retrieve start \
  --metadata Report:FolderName/ReportName \
  --target-org [alias]
```

### 6.3 Folder Structure

```
force-app/
└── main/
    └── default/
        └── reports/
            ├── MyReportFolder/
            │   ├── MyReportFolder-meta.xml  (folder definition)
            │   ├── Report1.report-meta.xml
            │   └── Report2.report-meta.xml
            └── package.xml
```

### 6.4 Folder XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ReportFolder xmlns="http://soap.sforce.com/2006/04/metadata">
    <folderShares>
        <accessLevel>View</accessLevel>
        <sharedTo>AllInternalUsers</sharedTo>
        <sharedToType>Group</sharedToType>
    </folderShares>
    <name>My Report Folder</name>
</ReportFolder>
```

### 6.5 Joined Report XML (MultiBlock)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>Account 360 View</name>
    <format>MultiBlock</format>

    <!-- Block 1: Opportunities -->
    <block>
        <blockInfo>
            <blockId>B1</blockId>
            <joinTable>Opportunity</joinTable>
        </blockInfo>
        <columns>
            <field>Opportunity.Name</field>
        </columns>
        <columns>
            <field>Opportunity.Amount</field>
        </columns>
        <columns>
            <field>Opportunity.StageName</field>
        </columns>
    </block>

    <!-- Block 2: Cases -->
    <block>
        <blockInfo>
            <blockId>B2</blockId>
            <joinTable>Case</joinTable>
        </blockInfo>
        <columns>
            <field>Case.CaseNumber</field>
        </columns>
        <columns>
            <field>Case.Subject</field>
        </columns>
        <columns>
            <field>Case.Status</field>
        </columns>
    </block>

    <!-- Common Grouping -->
    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>ACCOUNT_NAME</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>

    <!-- Cross-Block Formula (optional) -->
    <crossFilters>
        <criteriaItems>
            <column>B1!Opportunity.Amount</column>
            <columnToColumn>false</columnToColumn>
            <isUnlocked>false</isUnlocked>
            <operator>greaterThan</operator>
            <value>0</value>
        </criteriaItems>
    </crossFilters>
</Report>
```

---

## 7. MCP Tools for Reports

The Salesforce MCP server provides these report-related tools:

### 7.1 Available Tools

| Tool | Purpose | Common Use |
|------|---------|------------|
| `mcp_salesforce_report_type_list` | List all report types | Discover available types |
| `mcp_salesforce_report_type_describe` | Get type metadata | Get available fields |
| `mcp_salesforce_report_create` | Create new report | Dynamic creation |
| `mcp_salesforce_report_clone` | Clone existing | Template from existing |
| `mcp_salesforce_report_deploy` | Deploy metadata | Metadata API wrapper |
| `mcp_salesforce_report_folder_create` | Create folder | Organize reports |
| `mcp_salesforce_report_folder_list` | List folders | Find target folder |
| `mcp_salesforce_report_run` | Execute report | Get report data |

### 7.2 Usage Examples

#### List Report Types

```javascript
// Via MCP
const types = await mcp_salesforce_report_type_list();

// Returns list of available report types with API names
```

#### Describe Report Type (Get Available Fields)

```javascript
// Via MCP
const metadata = await mcp_salesforce_report_type_describe({
  reportType: 'Opportunity'
});

// Returns available columns, filters, groupable fields
```

#### Create Report

```javascript
// Via MCP
const report = await mcp_salesforce_report_create({
  name: 'My Pipeline Report',
  reportType: 'Opportunity',
  format: 'SUMMARY',
  folderId: '00lxx000000XXXXX',
  columns: ['OPPORTUNITY_NAME', 'AMOUNT', 'CLOSE_DATE'],
  groupingsDown: [{ field: 'STAGE_NAME' }],
  aggregates: ['s!AMOUNT']
});
```

#### Run Report

```javascript
// Via MCP
const results = await mcp_salesforce_report_run({
  reportId: '00Oxx000000XXXXX',
  filters: [
    { column: 'CLOSE_DATE', operator: 'equals', value: 'THIS_QUARTER' }
  ]
});
```

### 7.3 MCP vs Direct API

| Scenario | Recommendation |
|----------|----------------|
| Simple operations | MCP tools |
| Complex configurations | Direct REST API |
| Joined reports | Metadata API (via CLI) |
| Batch operations | Direct API with scripting |

---

## 8. Critical Limits and Constraints

### 8.1 Row Limits by Format

| Format | REST API Limit | UI Limit | Behavior at Limit |
|--------|---------------|----------|-------------------|
| TABULAR | ~50,000 | 2,000 display | Pagination available |
| SUMMARY | **2,000** | 2,000 | **Silent truncation** |
| MATRIX | ~1,500 | 2,000 | Silent truncation |
| JOINED | ~500/block | 2,000 total | Silent truncation |

### 8.2 The 2,000-Row Problem

**CRITICAL**: Summary format reports silently truncate at 2,000 rows via Analytics REST API.

**Detection Strategy**:

```javascript
// BEFORE creating Summary report, estimate row count
const countQuery = `SELECT COUNT() FROM Opportunity
  WHERE CloseDate = THIS_FISCAL_QUARTER`;

const count = await mcp_salesforce_data_query({ query: countQuery });

if (count > 2000) {
  console.warn('⚠️ Row count exceeds 2,000 - use TABULAR format');
  // Auto-switch to TABULAR
}
```

**Mitigation Options**:

1. **Add filters** to reduce rows below 2,000
2. **Use TABULAR** and group in post-processing
3. **Use multiple reports** with segmented filters
4. **Accept truncation** if top-N is acceptable

### 8.3 Other Limits

| Limit | Value | Notes |
|-------|-------|-------|
| Max columns | 100 | Varies by report type |
| Max filters | 20 | Standard filters |
| Max groupings (down) | 3 | Summary/Matrix |
| Max groupings (across) | 2 | Matrix only |
| Max blocks (joined) | 5 | Joined reports |
| Max formula length | 3,900 chars | Custom formulas |
| API calls per report run | 1 | Each run = 1 API call |

### 8.4 Performance Considerations

**Fast Reports**:
- ≤5 columns
- Indexed field filters
- Bounded date ranges
- ≤1,000 rows

**Slow Reports**:
- 15+ columns
- Formula field filters
- Open-ended date ranges
- Cross-object filters
- >10,000 rows

**Best Practices**:
1. Filter on indexed fields (Id, Name, CreatedDate, custom indexed fields)
2. Avoid LIKE patterns with leading wildcards
3. Use specific date ranges instead of "all time"
4. Limit columns to essential fields only

---

## 9. Format Selection Algorithm

Use this algorithm when programmatically selecting report format:

```javascript
/**
 * Recommends optimal report format based on requirements
 * @see {@link docs/runbooks/report-api-development/01-report-formats-fundamentals.md}
 */
function selectReportFormat(requirements) {
  const {
    hasGroupings = false,
    groupingsDownCount = 0,
    groupingsAcrossCount = 0,
    rowEstimate = 0,
    needsMultipleReportTypes = false,
    useCase = 'general'
  } = requirements;

  // Rule 1: Multiple report types = JOINED (mandatory)
  if (needsMultipleReportTypes) {
    return {
      format: 'JOINED',
      reason: 'MULTIPLE_REPORT_TYPES',
      apiMethod: 'METADATA_API',
      warning: 'Use Metadata API for joined report creation'
    };
  }

  // Rule 2: Matrix detection (two-dimensional grouping)
  if (groupingsAcrossCount > 0) {
    return {
      format: 'MATRIX',
      reason: 'TWO_DIMENSIONAL_GROUPING',
      apiMethod: 'REST_API',
      warning: groupingsAcrossCount > 20 ? 'Consider Summary - too many columns' : null
    };
  }

  // Rule 3: Row count override (Summary truncates)
  if (rowEstimate > 2000) {
    return {
      format: 'TABULAR',
      reason: 'ROW_LIMIT_EXCEEDED',
      apiMethod: 'REST_API',
      warning: 'Summary format truncates at 2,000 rows - using TABULAR'
    };
  }

  // Rule 4: Summary for grouped analysis
  if (hasGroupings || groupingsDownCount > 0) {
    return {
      format: 'SUMMARY',
      reason: 'HIERARCHICAL_GROUPING',
      apiMethod: 'REST_API',
      warning: rowEstimate > 1500 ? 'Close to 2,000 row limit - monitor' : null
    };
  }

  // Rule 5: Export use cases
  if (useCase === 'export' || useCase === 'data_dump') {
    return {
      format: 'TABULAR',
      reason: 'EXPORT_USE_CASE',
      apiMethod: 'REST_API',
      warning: null
    };
  }

  // Default: TABULAR (safest)
  return {
    format: 'TABULAR',
    reason: 'DEFAULT_LIST',
    apiMethod: 'REST_API',
    warning: null
  };
}
```

### Usage Example

```javascript
const recommendation = selectReportFormat({
  hasGroupings: true,
  groupingsDownCount: 2,
  groupingsAcrossCount: 0,
  rowEstimate: 850,
  needsMultipleReportTypes: false,
  useCase: 'dashboard'
});

console.log(recommendation);
// {
//   format: 'SUMMARY',
//   reason: 'HIERARCHICAL_GROUPING',
//   apiMethod: 'REST_API',
//   warning: null
// }
```

---

## 10. Quick Reference

### Format Selection

| Need | Format | API Method |
|------|--------|------------|
| Simple list | TABULAR | REST |
| Grouped totals (<2k rows) | SUMMARY | REST |
| Two-dimensional analysis | MATRIX | REST |
| Cross-object comparison | JOINED | Metadata |
| Period comparison | JOINED | Metadata |
| Export/data dump | TABULAR | REST |
| >2,000 rows with grouping | TABULAR | REST |

### API Endpoints

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Create | POST | `/analytics/reports` |
| Clone | POST | `/analytics/reports?cloneId={id}` |
| Update | PATCH | `/analytics/reports/{id}` |
| Run | POST | `/analytics/reports/{id}` |
| Delete | DELETE | `/analytics/reports/{id}` |
| Describe | GET | `/analytics/reports/{id}/describe` |

### Common Field Tokens

| Object | Common Fields |
|--------|---------------|
| Opportunity | OPPORTUNITY_NAME, ACCOUNT_NAME, AMOUNT, CLOSE_DATE, STAGE_NAME, OWNER_FULL_NAME |
| Account | ACCOUNT_NAME, INDUSTRY, BILLING_STATE, ANNUAL_REVENUE, OWNER_FULL_NAME |
| Contact | CONTACT_NAME, EMAIL, PHONE, ACCOUNT_NAME, TITLE |
| Case | CASE_NUMBER, SUBJECT, STATUS, PRIORITY, CONTACT_NAME |
| Lead | LEAD_NAME, EMAIL, COMPANY, STATUS, LEAD_SOURCE |

### Aggregate Prefixes

| Prefix | Operation |
|--------|-----------|
| `s!` | Sum |
| `a!` | Average |
| `m!` | Minimum |
| `mx!` | Maximum |
| `RowCount` | Count |

---

## Next Steps

- **Tabular Reports**: [Runbook 2](02-tabular-reports.md) - Detailed tabular implementation
- **Summary Reports**: [Runbook 3](03-summary-reports.md) - Groupings, aggregates, 2k limit handling
- **Matrix Reports**: [Runbook 4](04-matrix-reports.md) - Cross-tabulation deep dive
- **Joined Reports**: [Runbook 5](05-joined-reports-basics.md) - Multi-block fundamentals

---

**Last Updated**: November 26, 2025
**Runbook Version**: v3.51.0
