# Runbook 05: Joined Reports - Basics

**Version**: v3.51.0
**Last Updated**: November 26, 2025
**Status**: Complete

---

## Table of Contents

1. [Overview](#1-overview)
2. [When to Use Joined Reports](#2-when-to-use-joined-reports)
3. [Multi-Block Architecture](#3-multi-block-architecture)
4. [Block Configuration](#4-block-configuration)
5. [Common Grouping Strategies](#5-common-grouping-strategies)
6. [API Method Selection](#6-api-method-selection)
7. [REST API Capabilities and Limitations](#7-rest-api-capabilities-and-limitations)
8. [Basic Metadata API Structure](#8-basic-metadata-api-structure)
9. [MCP Tool Usage](#9-mcp-tool-usage)
10. [Best Practices](#10-best-practices)
11. [Common Errors and Fixes](#11-common-errors-and-fixes)
12. [Basic Examples](#12-basic-examples)

---

## 1. Overview

### What is a Joined Report?

A **Joined report** combines data from multiple report types in a single report view, organized into blocks. Each block can have its own columns, filters, and even different report types, allowing you to compare and analyze data that doesn't share a direct relationship.

### Key Characteristics

| Characteristic | Value |
|---------------|-------|
| Format Name | `JOINED` (also called `MultiBlock`) |
| Minimum Blocks | 2 |
| Maximum Blocks | 5 |
| Report Types per Block | 1 (different types allowed per block) |
| Groupings | Per block + common grouping across blocks |
| Aggregates | Per block + cross-block formulas |
| Maximum Rows (API) | ~500 per block |
| **Recommended API** | **Metadata API (XML)** |
| Dashboard Support | Limited (one chart total) |

### Joined Report Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ JOINED REPORT: "Sales vs Cases by Account"                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ ▼ Common Grouping: Account Name                                              │
│   ┌─────────────────────────────────────┬─────────────────────────────────┐ │
│   │ BLOCK 1: Opportunities              │ BLOCK 2: Cases                  │ │
│   │ (Report Type: Opportunity)          │ (Report Type: Case)             │ │
│   ├─────────────────────────────────────┼─────────────────────────────────┤ │
│   │                                     │                                 │ │
│   │ ▼ Acme Corp                         │ ▼ Acme Corp                     │ │
│   │   Opp 1    $50,000    Won          │   Case 001   High   Resolved   │ │
│   │   Opp 2    $25,000    Pipeline     │   Case 002   Med    Open       │ │
│   │   Subtotal: $75,000 (2)            │   Subtotal: 2 cases            │ │
│   │                                     │                                 │ │
│   │ ▼ Beta Inc                          │ ▼ Beta Inc                      │ │
│   │   Opp 3    $100,000   Pipeline     │   Case 003   Low    Resolved   │ │
│   │   Subtotal: $100,000 (1)           │   Subtotal: 1 case             │ │
│   │                                     │                                 │ │
│   │ Block Total: $175,000 (3)          │ Block Total: 3 cases           │ │
│   └─────────────────────────────────────┴─────────────────────────────────┘ │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ Grand Total: 3 Opportunities ($175K) + 3 Cases                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Block Types

```
Block Structure Options:

1. SAME REPORT TYPE, DIFFERENT FILTERS
   ┌─────────────────┬─────────────────┐
   │ Block 1: Opps   │ Block 2: Opps   │
   │ Status = Won    │ Status = Lost   │
   └─────────────────┴─────────────────┘

2. DIFFERENT REPORT TYPES, COMMON GROUPING
   ┌─────────────────┬─────────────────┐
   │ Block 1: Opps   │ Block 2: Cases  │
   │ by Account      │ by Account      │
   └─────────────────┴─────────────────┘

3. SAME TYPE, DIFFERENT TIME PERIODS
   ┌─────────────────┬─────────────────┐
   │ Block 1: Opps   │ Block 2: Opps   │
   │ This Year       │ Last Year       │
   └─────────────────┴─────────────────┘

4. MULTIPLE OBJECTS WITH RELATIONSHIPS
   ┌─────────────────┬─────────────────┬─────────────────┐
   │ Block 1: Leads  │ Block 2: Opps   │ Block 3: Cases  │
   │ Converted       │ from Leads      │ from Accounts   │
   └─────────────────┴─────────────────┴─────────────────┘
```

---

## 2. When to Use Joined Reports

### Ideal Use Cases

**1. Cross-Object Comparison**
```
✅ Opportunities vs Cases by Account
✅ Leads vs Converted Opportunities
✅ Activities vs Closed Deals
✅ Quotes vs Orders by Product
```

**2. Side-by-Side Time Comparison**
```
✅ This Year vs Last Year revenue
✅ Q4 2024 vs Q4 2025 pipeline
✅ Month-over-month activity
✅ Before vs After campaign launch
```

**3. Win/Loss Analysis**
```
✅ Won vs Lost opportunities
✅ Competitive deal comparison
✅ Conversion rate analysis
✅ Pipeline stage comparison
```

**4. Multi-Dimensional Business Views**
```
✅ Sales + Service metrics by account
✅ Marketing + Sales funnel
✅ Customer 360 analysis
✅ Cross-departmental reporting
```

### When NOT to Use Joined Reports

| Scenario | Use Instead | Reason |
|----------|-------------|--------|
| Single object analysis | SUMMARY/MATRIX | Simpler, better performance |
| Large data exports | TABULAR | Row limits per block |
| Simple trend analysis | MATRIX | Better for time dimensions |
| Cross-tabulation | MATRIX | Built for 2D analysis |
| >5 data sources | Multiple reports | 5 block maximum |
| Real-time dashboards | Individual reports | Performance concerns |

### Decision Flowchart

```
Need to combine data from different sources?
│
├─ NO → Use TABULAR/SUMMARY/MATRIX
│
└─ YES → Continue
   │
   ├─ All sources from same object?
   │  ├─ YES → Can use filtered blocks (same report type)
   │  └─ NO → Need different report types per block
   │
   ├─ More than 5 sources needed?
   │  ├─ YES → Split into multiple reports
   │  └─ NO → Joined report can handle
   │
   ├─ Need common grouping field?
   │  ├─ YES → Ensure field exists in all report types
   │  └─ NO → Blocks will show independently
   │
   └─ Large data volume per block?
      ├─ YES (>500) → Consider alternatives
      └─ NO → Joined report is appropriate ✓
```

---

## 3. Multi-Block Architecture

### Block Independence

Each block in a joined report is essentially an independent report:

```
Block Independence:
├── Own Report Type
├── Own Columns (detailColumns)
├── Own Filters (reportFilters)
├── Own Aggregates
├── Own Detail Rows
└── Own Subtotals

Shared Elements:
├── Common Grouping Field(s)
├── Cross-Block Formulas (advanced)
└── Report-Level Date Filter
```

### Block Anatomy

```javascript
// Block structure
const block = {
  // Identity
  name: "Opportunities_Block",
  reportType: "Opportunity",

  // Data
  columns: ["OPPORTUNITY_NAME", "AMOUNT", "STAGE_NAME"],
  filters: [
    { column: "ISWON", operator: "equals", value: "true" }
  ],

  // Groupings (per block)
  groupingsDown: [
    { field: "ACCOUNT.NAME", sortOrder: "Asc" }
  ],

  // Aggregates (per block)
  aggregates: [
    { name: "RowCount" },
    { name: "s!AMOUNT" }
  ],

  // Options
  showDetailRows: true
};
```

### Block Alignment

Blocks align on **common grouping fields**:

```
Common Grouping: Account Name

Account "Acme Corp":
├── Block 1 (Opportunities): 3 records, $175,000
├── Block 2 (Cases): 2 records
└── Block 3 (Activities): 5 records

Account "Beta Inc":
├── Block 1 (Opportunities): 1 record, $50,000
├── Block 2 (Cases): 0 records (no cases)
└── Block 3 (Activities): 3 records
```

### Maximum Block Configuration

| Blocks | Complexity | Use Case |
|--------|------------|----------|
| 2 | Low | Win/Loss, Year-over-Year |
| 3 | Medium | Sales + Service + Activity |
| 4 | High | Multi-department views |
| 5 | Maximum | Full customer 360 |

**Recommendation**: Start with 2 blocks, add more only when necessary.

---

## 4. Block Configuration

### Required Block Elements

```javascript
// Minimum required for each block
const blockConfig = {
  // REQUIRED
  name: "Block_Name",           // Unique identifier
  reportType: "Opportunity",    // Valid report type

  // RECOMMENDED
  columns: [...],               // Fields to display
  filters: [...],               // Block-specific filters

  // OPTIONAL
  groupingsDown: [...],         // Block-level groupings
  aggregates: [...],            // Block-level aggregates
  showDetailRows: true          // Show/hide detail rows
};
```

### Block Report Types

Each block needs a valid report type. Common combinations:

**Sales + Service**:
```javascript
const blocks = [
  { reportType: "Opportunity" },
  { reportType: "Case" }
];
```

**Win vs Loss**:
```javascript
const blocks = [
  { reportType: "Opportunity", filters: [{ column: "ISWON", value: "true" }] },
  { reportType: "Opportunity", filters: [{ column: "ISWON", value: "false" }] }
];
```

**Time Comparison**:
```javascript
const blocks = [
  { reportType: "Opportunity", dateFilter: { duration: "THIS_FISCAL_YEAR" } },
  { reportType: "Opportunity", dateFilter: { duration: "LAST_FISCAL_YEAR" } }
];
```

**Full Customer View**:
```javascript
const blocks = [
  { reportType: "Opportunity" },      // Sales
  { reportType: "Case" },             // Support
  { reportType: "Task" },             // Activities
  { reportType: "Contract" },         // Contracts
  { reportType: "Quote" }             // Quotes
];
```

### Block Columns

Each block can have different columns:

```javascript
// Block 1: Opportunity details
{
  reportType: "Opportunity",
  columns: [
    "OPPORTUNITY_NAME",
    "AMOUNT",
    "STAGE_NAME",
    "CLOSE_DATE",
    "PROBABILITY"
  ]
}

// Block 2: Case details
{
  reportType: "Case",
  columns: [
    "CASE_NUMBER",
    "SUBJECT",
    "STATUS",
    "PRIORITY",
    "CREATED_DATE"
  ]
}
```

### Block Filters

Block-specific filters narrow each block independently:

```javascript
// Block 1: Won opportunities this year
{
  reportType: "Opportunity",
  filters: [
    { column: "ISWON", operator: "equals", value: "true" },
    { column: "AMOUNT", operator: "greaterThan", value: "0" }
  ],
  dateFilter: {
    column: "CLOSE_DATE",
    duration: "THIS_FISCAL_YEAR"
  }
}

// Block 2: Lost opportunities this year
{
  reportType: "Opportunity",
  filters: [
    { column: "ISCLOSED", operator: "equals", value: "true" },
    { column: "ISWON", operator: "equals", value: "false" }
  ],
  dateFilter: {
    column: "CLOSE_DATE",
    duration: "THIS_FISCAL_YEAR"
  }
}
```

---

## 5. Common Grouping Strategies

### What is Common Grouping?

**Common grouping** aligns blocks by a shared field, typically used to compare related data across different sources.

```
Without Common Grouping:
┌─────────────────┬─────────────────┐
│ Block 1: Opps   │ Block 2: Cases  │
│ (unrelated)     │ (unrelated)     │
│ All Opps listed │ All Cases listed│
└─────────────────┴─────────────────┘

With Common Grouping (Account):
┌─────────────────┬─────────────────┐
│ Block 1: Opps   │ Block 2: Cases  │
│ ▼ Acme Corp     │ ▼ Acme Corp     │
│   Opp 1, Opp 2  │   Case A, B     │
│ ▼ Beta Inc      │ ▼ Beta Inc      │
│   Opp 3         │   Case C        │
└─────────────────┴─────────────────┘
```

### Common Grouping Field Requirements

The common grouping field must:
1. Exist in ALL block report types
2. Have compatible data types
3. Use the same API name across blocks

```javascript
// Valid common grouping (Account exists in both)
const commonGrouping = {
  field: "ACCOUNT.NAME",  // or "ACCOUNT_ID"
  sortOrder: "Asc"
};

// Both blocks must have access to this field
const block1 = { reportType: "Opportunity" };  // Has Account lookup
const block2 = { reportType: "Case" };         // Has Account lookup
```

### Strategy 1: Account-Based Grouping

**Most Common** - Group by account for customer-centric views:

```javascript
// Common grouping
{
  field: "ACCOUNT.NAME",
  sortOrder: "Asc"
}

// Works with:
// - Opportunity (Account lookup)
// - Case (Account lookup)
// - Contact (Account lookup)
// - Quote (Account via Opportunity)
// - Contract (Account lookup)
```

### Strategy 2: Owner-Based Grouping

Group by owner for rep performance views:

```javascript
{
  field: "OWNER_FULL_NAME",
  sortOrder: "Asc"
}

// Works with most objects that have OwnerId
```

### Strategy 3: Date-Based Grouping

Group by time period for trend analysis:

```javascript
{
  field: "CLOSE_DATE",
  sortOrder: "Asc",
  dateGranularity: "Month"
}

// Requires date field to exist in all blocks
// May need different field names per block:
// - Opportunity: CLOSE_DATE
// - Case: CREATED_DATE
// - Task: ACTIVITY_DATE
```

### Strategy 4: Product-Based Grouping

Group by product for product performance:

```javascript
{
  field: "PRODUCT.NAME",
  sortOrder: "Asc"
}

// Works with:
// - OpportunityLineItem (Product2)
// - QuoteLineItem (Product2)
// - OrderItem (Product2)
```

### No Common Grouping

Sometimes blocks don't need alignment:

```javascript
// Independent blocks (no common grouping)
// Each block shows its own data separately

Block 1: "Top 10 Opportunities"
Block 2: "Top 10 Cases"
Block 3: "Recent Activities"

// Useful for dashboard-style summary views
```

---

## 6. API Method Selection

### Metadata API vs REST API for Joined Reports

| Aspect | REST API | Metadata API (Recommended) |
|--------|----------|---------------------------|
| Create Joined Report | Limited | ✅ Full Support |
| Modify Joined Report | Limited | ✅ Full Support |
| Cross-Block Formulas | ❌ Not Supported | ✅ Supported |
| Block Configuration | Limited | ✅ Full Control |
| Source Control | ❌ No | ✅ Yes |
| CI/CD Integration | ❌ Difficult | ✅ Standard |
| Template Approach | ❌ No | ✅ Yes |

### Why Metadata API is Recommended

**1. Full Feature Support**
```
REST API:
├── ❌ Cannot create joined reports from scratch
├── ❌ Cannot add/remove blocks
├── ❌ Cannot configure cross-block formulas
└── ⚠️ Can only modify existing joined reports (limited)

Metadata API:
├── ✅ Create joined reports from XML
├── ✅ Full block configuration
├── ✅ Cross-block formulas
├── ✅ All formatting options
└── ✅ Complete lifecycle management
```

**2. Source Control Benefits**
```xml
<!-- Version controlled XML -->
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>Sales_vs_Cases</name>
    <format>MultiBlock</format>
    <!-- ... full configuration -->
</Report>
```

**3. Deployment Consistency**
```bash
# Deploy with standard tooling
sf project deploy start \
  --source-dir force-app/main/default/reports/JoinedReports \
  --target-org production
```

### When REST API is Acceptable

1. **Running existing joined reports** - Query existing report data
2. **Minor filter updates** - Modify runtime filters
3. **Cloning existing joined reports** - Start from template

```bash
# Run existing joined report
curl -X POST \
  "https://yourinstance.salesforce.com/services/data/v62.0/analytics/reports/00O5f000004XXXX" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# Clone existing joined report
curl -X POST \
  "https://yourinstance.salesforce.com/services/data/v62.0/analytics/reports?cloneId=00O5f000004XXXX" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reportMetadata": {"name": "Sales_vs_Cases_Clone"}}'
```

---

## 7. REST API Capabilities and Limitations

### What REST API CAN Do

**1. Run Existing Joined Reports**

```bash
curl -X POST \
  "https://yourinstance.salesforce.com/services/data/v62.0/analytics/reports/00O5f000004XXXX" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response includes all block data:**

```json
{
  "reportMetadata": {
    "name": "Sales_vs_Cases",
    "reportFormat": "MULTIBLOCK"
  },
  "groupingsDown": {...},
  "factMap": {
    "0_0!T": {...},  // Block 1 data
    "1_0!T": {...},  // Block 2 data
    "T!T": {...}     // Grand totals
  },
  "reportExtendedMetadata": {
    "blocks": [
      {"label": "Opportunities", "key": "0"},
      {"label": "Cases", "key": "1"}
    ]
  }
}
```

**2. Clone Existing Joined Reports**

```bash
curl -X POST \
  "https://yourinstance.salesforce.com/services/data/v62.0/analytics/reports?cloneId=00O5f000004XXXX" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reportMetadata": {
      "name": "Sales_vs_Cases_Q4_2025",
      "standardDateFilter": {
        "column": "CLOSE_DATE",
        "durationValue": "THIS_FISCAL_QUARTER"
      }
    }
  }'
```

**3. Modify Filters on Existing Reports**

```bash
curl -X PATCH \
  "https://yourinstance.salesforce.com/services/data/v62.0/analytics/reports/00O5f000004XXXX" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reportMetadata": {
      "reportFilters": [
        {
          "column": "ACCOUNT.TYPE",
          "filterType": "equals",
          "value": "Customer"
        }
      ]
    }
  }'
```

### What REST API CANNOT Do

**1. Create Joined Reports from Scratch**

```javascript
// ❌ This will FAIL
const response = await fetch('/services/data/v62.0/analytics/reports', {
  method: 'POST',
  body: JSON.stringify({
    reportMetadata: {
      name: "New_Joined_Report",
      reportFormat: "MULTIBLOCK",  // Cannot specify MULTIBLOCK
      blocks: [...]                // Cannot specify blocks
    }
  })
});
// Error: "Cannot create joined reports via REST API"
```

**2. Add or Remove Blocks**

```javascript
// ❌ Cannot modify block structure
const response = await fetch('/services/data/v62.0/analytics/reports/00O5f000004XXXX', {
  method: 'PATCH',
  body: JSON.stringify({
    blocks: [
      { reportType: "Opportunity" },
      { reportType: "Case" },
      { reportType: "Task" }  // Cannot add third block
    ]
  })
});
```

**3. Configure Cross-Block Formulas**

```javascript
// ❌ Cannot add cross-block formulas
const response = await fetch('/services/data/v62.0/analytics/reports/00O5f000004XXXX', {
  method: 'PATCH',
  body: JSON.stringify({
    crossBlockFormulas: [
      {
        name: "Win_Rate",
        formula: "Block1!RowCount / (Block1!RowCount + Block2!RowCount)"
      }
    ]
  })
});
```

**4. Change Block Report Types**

```javascript
// ❌ Cannot change block report types
// Must use Metadata API and redeploy
```

### Interpreting Joined Report Results

**Understanding factMap for Joined Reports:**

```javascript
// factMap key structure for joined reports:
// {blockIndex}_{groupingIndex}!T

const factMapKeys = {
  "0_0!T": "Block 0, Grouping value 0",
  "0_1!T": "Block 0, Grouping value 1",
  "0!T":   "Block 0, Total",
  "1_0!T": "Block 1, Grouping value 0",
  "1_1!T": "Block 1, Grouping value 1",
  "1!T":   "Block 1, Total",
  "T!T":   "Grand Total (all blocks)"
};

// Extracting block data
function extractBlockData(results, blockIndex) {
  const blockKeys = Object.keys(results.factMap)
    .filter(key => key.startsWith(`${blockIndex}_`) || key === `${blockIndex}!T`);

  return blockKeys.map(key => ({
    key,
    data: results.factMap[key]
  }));
}
```

---

## 8. Basic Metadata API Structure

### Joined Report XML Skeleton

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <!-- Report Identification -->
    <name>Sales_vs_Cases_by_Account</name>
    <description>Compare opportunities and cases by account</description>

    <!-- Joined Report Format -->
    <format>MultiBlock</format>

    <!-- Common Grouping (aligns blocks) -->
    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>ACCOUNT_NAME</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>

    <!-- Block 1: Opportunities -->
    <block>
        <blockInfo>
            <blockId>B1</blockId>
            <joinTable>a</joinTable>
        </blockInfo>
        <columns>
            <field>Opportunity$Name</field>
        </columns>
        <columns>
            <field>Opportunity$Amount</field>
        </columns>
        <columns>
            <field>Opportunity$StageName</field>
        </columns>
    </block>

    <!-- Block 2: Cases -->
    <block>
        <blockInfo>
            <blockId>B2</blockId>
            <joinTable>a</joinTable>
        </blockInfo>
        <columns>
            <field>Case$CaseNumber</field>
        </columns>
        <columns>
            <field>Case$Subject</field>
        </columns>
        <columns>
            <field>Case$Status</field>
        </columns>
    </block>

    <!-- Report Type Definitions -->
    <reportType>AccountWithOpportunities</reportType>

    <!-- Scope -->
    <scope>organization</scope>
</Report>
```

### Field Naming in Joined Reports

**Important**: Joined reports use a different field naming convention:

```
Standard Reports: FIELDNAME or OBJECT.FIELDNAME
Joined Reports:   Object$FieldName

Examples:
- Standard: OPPORTUNITY_NAME → Joined: Opportunity$Name
- Standard: AMOUNT → Joined: Opportunity$Amount
- Standard: ACCOUNT.NAME → Joined: Account$Name (in relationship context)
```

### Block Definition Elements

```xml
<block>
    <!-- Block Identity -->
    <blockInfo>
        <blockId>B1</blockId>           <!-- Unique block identifier -->
        <joinTable>a</joinTable>        <!-- Table alias for joins -->
    </blockInfo>

    <!-- Block Columns -->
    <columns>
        <field>Opportunity$Name</field>
    </columns>
    <columns>
        <field>Opportunity$Amount</field>
    </columns>

    <!-- Block-Specific Aggregates -->
    <aggregates>
        <calculatedFormula>Opportunity$Amount:SUM</calculatedFormula>
        <datatype>currency</datatype>
        <developerName>B1_TotalRevenue</developerName>
        <isActive>true</isActive>
        <masterLabel>Total Revenue</masterLabel>
        <scale>2</scale>
    </aggregates>

    <!-- Block-Specific Filters -->
    <filter>
        <criteriaItems>
            <column>Opportunity$IsWon</column>
            <columnToColumn>false</columnToColumn>
            <operator>equals</operator>
            <value>1</value>
        </criteriaItems>
    </filter>
</block>
```

### Deploy Joined Report

```bash
# Project structure
force-app/
└── main/
    └── default/
        └── reports/
            ├── JoinedReports/
            │   └── Sales_vs_Cases_by_Account.report-meta.xml
            └── JoinedReports-meta.xml

# Deploy
sf project deploy start \
  --source-dir force-app/main/default/reports/JoinedReports \
  --target-org production
```

---

## 9. MCP Tool Usage

### Run Existing Joined Report

```javascript
// Run joined report and get all block data
const results = await mcp_salesforce_report_run({
  reportId: "00O5f000004XXXX"
});

// Extract block information
const blocks = results.reportExtendedMetadata.blocks;
console.log(`Report has ${blocks.length} blocks:`);
blocks.forEach((block, i) => {
  console.log(`  Block ${i}: ${block.label}`);
});

// Extract data per block
for (let i = 0; i < blocks.length; i++) {
  const blockTotal = results.factMap[`${i}!T`];
  console.log(`Block ${i} Total:`, blockTotal?.aggregates);
}
```

### Clone and Modify Joined Report

```javascript
// Clone existing joined report with new filters
const cloned = await mcp_salesforce_report_clone({
  sourceReportId: "00O5f000004XXXX",
  name: "Sales_vs_Cases_Q4",
  folder: "Executive_Reports",
  modifications: {
    dateFilter: {
      column: "CLOSE_DATE",
      duration: "THIS_FISCAL_QUARTER"
    }
  }
});

console.log(`Cloned report: ${cloned.id}`);
```

### Deploy Joined Report via Metadata

```javascript
// Deploy joined report from XML file
await mcp_salesforce_report_deploy({
  sourcePath: "force-app/main/default/reports/JoinedReports/Sales_vs_Cases.report-meta.xml",
  targetOrg: "production"
});
```

### Extract Block-Specific Data

```javascript
/**
 * Extract data from a specific block in joined report results
 */
function extractJoinedReportBlockData(results, blockIndex) {
  const blockInfo = results.reportExtendedMetadata.blocks[blockIndex];
  const factMap = results.factMap;

  // Get all grouping values for this block
  const groupings = results.groupingsDown?.groupings || [];

  const blockData = {
    blockLabel: blockInfo.label,
    blockKey: blockInfo.key,
    groups: []
  };

  // Extract data for each grouping
  for (let g = 0; g < groupings.length; g++) {
    const cellKey = `${blockIndex}_${g}!T`;
    const cellData = factMap[cellKey];

    blockData.groups.push({
      groupLabel: groupings[g].label,
      groupValue: groupings[g].value,
      aggregates: cellData?.aggregates || [],
      rows: cellData?.rows || []
    });
  }

  // Block total
  const blockTotalKey = `${blockIndex}!T`;
  blockData.total = factMap[blockTotalKey]?.aggregates || [];

  return blockData;
}

// Usage
const block1Data = extractJoinedReportBlockData(results, 0);
const block2Data = extractJoinedReportBlockData(results, 1);

console.log('Block 1:', block1Data);
console.log('Block 2:', block2Data);
```

---

## 10. Best Practices

### Block Design

**DO**:
```
✅ Start with 2 blocks, add more only when needed
✅ Use clear, descriptive block names
✅ Align blocks with common grouping when possible
✅ Keep column count reasonable per block (5-8)
```

**DON'T**:
```
❌ Create 5 blocks immediately (start simple)
❌ Use blocks without clear business purpose
❌ Ignore common grouping alignment
❌ Duplicate data across blocks
```

### Common Grouping

**DO**:
```
✅ Verify grouping field exists in all block report types
✅ Use lookup fields for cross-object grouping (Account)
✅ Consider NULL handling (records without grouping value)
✅ Test alignment with sample data
```

**DON'T**:
```
❌ Assume fields have same API names across objects
❌ Group on high-cardinality fields
❌ Ignore records that don't match common grouping
```

### Performance Optimization

| Optimization | Impact | Implementation |
|--------------|--------|----------------|
| Limit blocks | High | Use 2-3 blocks maximum |
| Add filters | High | Reduce data per block |
| Common grouping | High | Align blocks efficiently |
| Limit columns | Medium | 5-8 columns per block |
| Hide detail rows | Medium | Show aggregates only |

### Development Workflow

```
1. DESIGN
   └── Identify blocks, report types, common grouping

2. PROTOTYPE (UI)
   └── Create in Salesforce UI first to validate structure

3. RETRIEVE
   └── sf project retrieve start -m Report:MyJoinedReport

4. REFINE (XML)
   └── Modify XML for cross-block formulas, formatting

5. DEPLOY
   └── sf project deploy start -d reports/

6. TEST
   └── Verify all blocks, aggregates, formulas
```

---

## 11. Common Errors and Fixes

### Error: "Invalid report type for block"

**Cause**: Block report type doesn't exist or isn't accessible

**Fix**:
```bash
# List available report types
sf data query --query "SELECT DeveloperName FROM ReportType" --use-tooling-api

# Verify report type exists
sf data query --query "SELECT DeveloperName FROM ReportType WHERE DeveloperName = 'Opportunity'" --use-tooling-api
```

### Error: "Common grouping field not found"

**Cause**: Grouping field doesn't exist in all block report types

**Fix**:
```javascript
// Verify field exists in all report types
async function verifyCommonGroupingField(fieldName, reportTypes) {
  for (const reportType of reportTypes) {
    const typeInfo = await mcp_salesforce_report_type_describe({
      report_type: reportType
    });

    const fieldExists = typeInfo.reportTypeCategories
      .flatMap(cat => cat.columns)
      .some(col => col.name === fieldName);

    if (!fieldExists) {
      console.error(`Field ${fieldName} not found in ${reportType}`);
      return false;
    }
  }
  return true;
}

// Usage
const valid = await verifyCommonGroupingField('ACCOUNT.NAME', ['Opportunity', 'Case']);
```

### Error: "Maximum blocks exceeded"

**Cause**: More than 5 blocks defined

**Fix**: Reduce to maximum 5 blocks or split into multiple reports

### Error: Block data not aligning

**Cause**: Common grouping field has different values in different blocks

**Fix**:
```javascript
// Check for orphan records in each block
// Records without a common grouping value won't align

// Solution 1: Filter out NULL grouping values
{
  filter: {
    criteriaItems: [
      { column: "ACCOUNT_ID", operator: "notEqual", value: "" }
    ]
  }
}

// Solution 2: Accept non-alignment for some records
// They'll appear at the end of the report
```

### Error: "Cannot create joined report via REST API"

**Cause**: Attempting to create joined report using REST API

**Fix**: Use Metadata API (see [Runbook 06](06-joined-reports-advanced.md))

```bash
# Use Metadata API deployment
sf project deploy start \
  --source-dir force-app/main/default/reports/JoinedReports \
  --target-org production
```

---

## 12. Basic Examples

### Example 1: Sales vs Cases by Account

**Use Case**: Compare opportunity revenue and case volume per account

**Metadata API**:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>Sales_vs_Cases_by_Account</name>
    <description>Compare opportunities and support cases by account</description>
    <format>MultiBlock</format>

    <!-- Common Grouping: Account -->
    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>ACCOUNT_NAME</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>

    <!-- Block 1: Opportunities -->
    <block>
        <blockInfo>
            <blockId>B1</blockId>
            <joinTable>a</joinTable>
        </blockInfo>
        <columns>
            <field>Opportunity$Name</field>
        </columns>
        <columns>
            <field>Opportunity$Amount</field>
        </columns>
        <columns>
            <field>Opportunity$StageName</field>
        </columns>
        <columns>
            <field>Opportunity$CloseDate</field>
        </columns>
        <aggregates>
            <calculatedFormula>Opportunity$Amount:SUM</calculatedFormula>
            <datatype>currency</datatype>
            <developerName>B1_Revenue</developerName>
            <isActive>true</isActive>
            <masterLabel>Revenue</masterLabel>
            <scale>2</scale>
        </aggregates>
        <aggregates>
            <calculatedFormula>RowCount</calculatedFormula>
            <datatype>number</datatype>
            <developerName>B1_Count</developerName>
            <isActive>true</isActive>
            <masterLabel>Opps</masterLabel>
            <scale>0</scale>
        </aggregates>
    </block>

    <!-- Block 2: Cases -->
    <block>
        <blockInfo>
            <blockId>B2</blockId>
            <joinTable>a</joinTable>
        </blockInfo>
        <columns>
            <field>Case$CaseNumber</field>
        </columns>
        <columns>
            <field>Case$Subject</field>
        </columns>
        <columns>
            <field>Case$Status</field>
        </columns>
        <columns>
            <field>Case$Priority</field>
        </columns>
        <aggregates>
            <calculatedFormula>RowCount</calculatedFormula>
            <datatype>number</datatype>
            <developerName>B2_Count</developerName>
            <isActive>true</isActive>
            <masterLabel>Cases</masterLabel>
            <scale>0</scale>
        </aggregates>
    </block>

    <reportType>AccountWithOpportunities</reportType>
    <scope>organization</scope>
</Report>
```

### Example 2: Won vs Lost Opportunities

**Use Case**: Side-by-side comparison of won and lost deals

**Metadata API**:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>Won_vs_Lost_Analysis</name>
    <description>Compare won and lost opportunities by owner</description>
    <format>MultiBlock</format>

    <!-- Common Grouping: Owner -->
    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>FULL_NAME</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>

    <!-- Block 1: Won Opportunities -->
    <block>
        <blockInfo>
            <blockId>B_WON</blockId>
            <joinTable>a</joinTable>
        </blockInfo>
        <columns>
            <field>Opportunity$Name</field>
        </columns>
        <columns>
            <field>Opportunity$Amount</field>
        </columns>
        <columns>
            <field>Opportunity$CloseDate</field>
        </columns>
        <filter>
            <criteriaItems>
                <column>Opportunity$IsWon</column>
                <columnToColumn>false</columnToColumn>
                <operator>equals</operator>
                <value>1</value>
            </criteriaItems>
        </filter>
        <aggregates>
            <calculatedFormula>Opportunity$Amount:SUM</calculatedFormula>
            <datatype>currency</datatype>
            <developerName>Won_Revenue</developerName>
            <isActive>true</isActive>
            <masterLabel>Won Revenue</masterLabel>
            <scale>2</scale>
        </aggregates>
    </block>

    <!-- Block 2: Lost Opportunities -->
    <block>
        <blockInfo>
            <blockId>B_LOST</blockId>
            <joinTable>a</joinTable>
        </blockInfo>
        <columns>
            <field>Opportunity$Name</field>
        </columns>
        <columns>
            <field>Opportunity$Amount</field>
        </columns>
        <columns>
            <field>Opportunity$CloseDate</field>
        </columns>
        <filter>
            <booleanFilter>1 AND 2</booleanFilter>
            <criteriaItems>
                <column>Opportunity$IsClosed</column>
                <columnToColumn>false</columnToColumn>
                <operator>equals</operator>
                <value>1</value>
            </criteriaItems>
            <criteriaItems>
                <column>Opportunity$IsWon</column>
                <columnToColumn>false</columnToColumn>
                <operator>equals</operator>
                <value>0</value>
            </criteriaItems>
        </filter>
        <aggregates>
            <calculatedFormula>Opportunity$Amount:SUM</calculatedFormula>
            <datatype>currency</datatype>
            <developerName>Lost_Revenue</developerName>
            <isActive>true</isActive>
            <masterLabel>Lost Revenue</masterLabel>
            <scale>2</scale>
        </aggregates>
    </block>

    <reportType>Opportunity</reportType>
    <timeFrameFilter>
        <dateColumn>CLOSE_DATE</dateColumn>
        <interval>INTERVAL_CURFY</interval>
    </timeFrameFilter>
    <scope>organization</scope>
</Report>
```

### Example 3: Year-over-Year Comparison

**Use Case**: Compare this year's pipeline to last year

**Metadata API**:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>Pipeline_YoY_Comparison</name>
    <description>Compare current fiscal year to previous fiscal year</description>
    <format>MultiBlock</format>

    <!-- Common Grouping: Stage -->
    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>STAGE_NAME</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>

    <!-- Block 1: This Fiscal Year -->
    <block>
        <blockInfo>
            <blockId>B_TFY</blockId>
            <joinTable>a</joinTable>
        </blockInfo>
        <columns>
            <field>Opportunity$Name</field>
        </columns>
        <columns>
            <field>Opportunity$Amount</field>
        </columns>
        <columns>
            <field>Opportunity$CloseDate</field>
        </columns>
        <timeFrameFilter>
            <dateColumn>CLOSE_DATE</dateColumn>
            <interval>INTERVAL_CURFY</interval>
        </timeFrameFilter>
        <aggregates>
            <calculatedFormula>Opportunity$Amount:SUM</calculatedFormula>
            <datatype>currency</datatype>
            <developerName>TFY_Revenue</developerName>
            <isActive>true</isActive>
            <masterLabel>This Year</masterLabel>
            <scale>0</scale>
        </aggregates>
    </block>

    <!-- Block 2: Last Fiscal Year -->
    <block>
        <blockInfo>
            <blockId>B_LFY</blockId>
            <joinTable>a</joinTable>
        </blockInfo>
        <columns>
            <field>Opportunity$Name</field>
        </columns>
        <columns>
            <field>Opportunity$Amount</field>
        </columns>
        <columns>
            <field>Opportunity$CloseDate</field>
        </columns>
        <timeFrameFilter>
            <dateColumn>CLOSE_DATE</dateColumn>
            <interval>INTERVAL_LASTFY</interval>
        </timeFrameFilter>
        <aggregates>
            <calculatedFormula>Opportunity$Amount:SUM</calculatedFormula>
            <datatype>currency</datatype>
            <developerName>LFY_Revenue</developerName>
            <isActive>true</isActive>
            <masterLabel>Last Year</masterLabel>
            <scale>0</scale>
        </aggregates>
    </block>

    <reportType>Opportunity</reportType>
    <scope>organization</scope>
</Report>
```

---

## Related Runbooks

- **Previous**: [Runbook 04: Matrix Reports](04-matrix-reports.md) - Cross-tabulation analysis
- **Next**: [Runbook 06: Joined Reports Advanced](06-joined-reports-advanced.md) - Cross-block formulas, templates
- **Format Selection**: [Runbook 01: Report Formats Fundamentals](01-report-formats-fundamentals.md) - Choosing the right format
- **Custom Types**: [Runbook 07: Custom Report Types](07-custom-report-types.md) - Creating report types for blocks

---

**Last Updated**: November 26, 2025
**Maintained By**: Salesforce Plugin Team
**Plugin Version**: v3.51.0
