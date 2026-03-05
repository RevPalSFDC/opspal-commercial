# Runbook 03: Summary Reports

**Version**: v3.51.0
**Last Updated**: November 26, 2025
**Status**: Complete

---

## Table of Contents

1. [Overview](#1-overview)
2. [🚨 CRITICAL: The 2,000-Row Limit](#2-critical-the-2000-row-limit)
3. [When to Use Summary Format](#3-when-to-use-summary-format)
4. [REST API Implementation](#4-rest-api-implementation)
5. [Metadata API Implementation](#5-metadata-api-implementation)
6. [Groupings Configuration](#6-groupings-configuration)
7. [Aggregates Configuration](#7-aggregates-configuration)
8. [Date Granularity](#8-date-granularity)
9. [MCP Tool Usage](#9-mcp-tool-usage)
10. [Best Practices](#10-best-practices)
11. [Row Count Detection & Mitigation](#11-row-count-detection--mitigation)
12. [Common Errors and Fixes](#12-common-errors-and-fixes)
13. [Complete Examples](#13-complete-examples)

---

## 1. Overview

### What is a Summary Report?

A **Summary report** groups records by one or more fields and displays subtotals, grand totals, and aggregates for each grouping level. It's the most common report format for business analytics in Salesforce.

### Key Characteristics

| Characteristic | Value |
|---------------|-------|
| Format Name | `SUMMARY` |
| Maximum Groupings (Down) | 3 |
| Groupings (Across) | 0 |
| Aggregates | Yes (SUM, AVG, MIN, MAX, COUNT) |
| **Maximum Rows (API)** | **2,000 (HARD LIMIT - SILENT TRUNCATION)** |
| Maximum Columns | No hard limit |
| Dashboard Support | Yes |
| Export Support | Limited (may truncate) |

### Summary Format Structure

```
┌─────────────────────────────────────────────────────────────┐
│ SUMMARY REPORT                                               │
├─────────────────────────────────────────────────────────────┤
│ ▼ Grouping Level 1: Value A                                  │
│   ├── Record 1 | Col1 | Col2 | Col3                         │
│   ├── Record 2 | Col1 | Col2 | Col3                         │
│   └── Subtotal: Count=2, Sum=$X, Avg=$Y                     │
│                                                              │
│ ▼ Grouping Level 1: Value B                                  │
│   ├── Record 3 | Col1 | Col2 | Col3                         │
│   ├── Record 4 | Col1 | Col2 | Col3                         │
│   ├── Record 5 | Col1 | Col2 | Col3                         │
│   └── Subtotal: Count=3, Sum=$X, Avg=$Y                     │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│ Grand Total: Count=5, Sum=$Total, Avg=$Avg                  │
└─────────────────────────────────────────────────────────────┘
```

### Multi-Level Grouping Structure

```
┌─────────────────────────────────────────────────────────────┐
│ ▼ Level 1: Stage = Qualification                             │
│   ├── ▼ Level 2: Owner = John Smith                         │
│   │   ├── Opp 1 | $10,000 | 12/01                          │
│   │   ├── Opp 2 | $25,000 | 12/15                          │
│   │   └── Subtotal L2: 2 records, $35,000                   │
│   │                                                          │
│   ├── ▼ Level 2: Owner = Jane Doe                           │
│   │   ├── Opp 3 | $50,000 | 12/20                          │
│   │   └── Subtotal L2: 1 record, $50,000                    │
│   │                                                          │
│   └── Subtotal L1: 3 records, $85,000                       │
│                                                              │
│ ▼ Level 1: Stage = Proposal                                  │
│   └── ...                                                    │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│ Grand Total: X records, $Total                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 🚨 CRITICAL: The 2,000-Row Limit

### The Problem

**The Analytics REST API silently truncates Summary reports at 2,000 detail rows.**

There is **NO error message**. The report appears to run successfully, but you're missing data.

### How Truncation Works

```
Your data: 5,000 opportunity records

What you expect:
┌──────────────────────────────────┐
│ Grand Total: 5,000 records       │
│ Sum: $12,500,000                 │
└──────────────────────────────────┘

What you get (SILENTLY):
┌──────────────────────────────────┐
│ Grand Total: 2,000 records       │  ← TRUNCATED!
│ Sum: $5,000,000                  │  ← WRONG!
└──────────────────────────────────┘
```

### Detection Methods

**Method 1: Check `allData` Flag**

```javascript
const results = await runReport(reportId);

if (results.allData === false) {
  console.warn('⚠️ WARNING: Report data was truncated!');
  console.warn(`Only ${results.factMap['T!T'].rows.length} of total rows returned`);
}
```

**Method 2: Compare Row Count to Record Count**

```javascript
// Get actual record count
const countQuery = "SELECT COUNT() FROM Opportunity WHERE CloseDate = THIS_FISCAL_YEAR";
const actualCount = await conn.query(countQuery);

// Run report
const reportResults = await runReport(reportId);
const reportCount = reportResults.factMap['T!T'].aggregates[0].value;

if (actualCount.totalSize > reportCount) {
  console.error(`❌ DATA LOSS: Expected ${actualCount.totalSize}, got ${reportCount}`);
  console.error('Report is using SUMMARY format with >2,000 rows');
  console.error('SOLUTION: Switch to TABULAR format');
}
```

**Method 3: Pre-Flight Row Estimation**

```javascript
async function estimateRowCount(reportType, filters) {
  // Build SOQL equivalent
  let soql = `SELECT COUNT() FROM ${reportType}`;

  if (filters.length > 0) {
    const whereClauses = filters.map(f =>
      `${f.column} ${operatorToSoql(f.filterType)} '${f.value}'`
    );
    soql += ` WHERE ${whereClauses.join(' AND ')}`;
  }

  const result = await conn.query(soql);
  return result.totalSize;
}

// Usage
const estimate = await estimateRowCount('Opportunity', [
  { column: 'CloseDate', filterType: 'equals', value: 'THIS_FISCAL_YEAR' }
]);

if (estimate > 2000) {
  console.error(`❌ CANNOT use SUMMARY format: ${estimate} rows exceeds 2,000 limit`);
  console.log('Switching to TABULAR format automatically...');
}
```

### Row Count Decision Matrix

| Row Estimate | Recommended Action | Risk Level |
|--------------|-------------------|------------|
| < 1,500 | ✅ Safe to use SUMMARY | Low |
| 1,500 - 1,800 | ⚠️ Use SUMMARY with monitoring | Medium |
| 1,800 - 2,000 | ⚠️ Consider TABULAR | High |
| > 2,000 | ❌ **MUST use TABULAR** | **Critical** |

### Automatic Format Switching

```javascript
/**
 * Select appropriate format based on row count
 * @see {@link docs/runbooks/report-api-development/03-summary-reports.md}
 */
async function selectFormatWithRowCheck(config) {
  const { reportType, filters, preferredFormat } = config;

  // Estimate row count
  const estimate = await estimateRowCount(reportType, filters);

  console.log(`Row estimate: ${estimate}`);

  if (estimate > 2000) {
    console.warn(`⚠️ Row count ${estimate} exceeds 2,000 SUMMARY limit`);
    console.warn('Automatically switching to TABULAR format');

    return {
      format: 'TABULAR',
      reason: 'ROW_LIMIT_EXCEEDED',
      originalFormat: preferredFormat,
      rowEstimate: estimate
    };
  }

  if (estimate > 1800 && preferredFormat === 'SUMMARY') {
    console.warn(`⚠️ Row count ${estimate} approaching 2,000 limit`);
    console.warn('Consider using TABULAR for safety');

    return {
      format: 'SUMMARY',
      reason: 'WITHIN_LIMIT_WITH_WARNING',
      rowEstimate: estimate,
      warning: 'Close to 2,000 row limit - monitor data growth'
    };
  }

  return {
    format: preferredFormat,
    reason: 'SAFE',
    rowEstimate: estimate
  };
}
```

---

## 3. When to Use Summary Format

### Ideal Use Cases

**1. Grouped Analysis**
```
✅ Sales by region
✅ Cases by status
✅ Revenue by product category
✅ Activities by owner
```

**2. Subtotal Requirements**
```
✅ Sum of amounts per stage
✅ Average deal size by rep
✅ Count of leads by source
✅ Max opportunity per account
```

**3. Dashboard Charts**
```
✅ Pie charts (requires grouping)
✅ Bar charts by category
✅ Donut charts
✅ Funnel charts
```

**4. Trend Analysis (Single Dimension)**
```
✅ Revenue by quarter
✅ Cases by month
✅ Conversion rates by period
```

### When NOT to Use Summary

| Scenario | Use Instead | Reason |
|----------|-------------|--------|
| > 2,000 rows | **TABULAR** | Silent truncation |
| Two-dimensional analysis | **MATRIX** | Need groupingsAcross |
| No grouping needed | **TABULAR** | Summary overhead |
| Cross-object comparison | **JOINED** | Multiple report types |
| Large data exports | **TABULAR** | Full data preservation |

### Decision Flowchart

```
Need grouped analysis?
│
├─ NO → Use TABULAR
│
└─ YES → Continue
   │
   ├─ Need 2D cross-tabulation?
   │  ├─ YES → Use MATRIX
   │  └─ NO → Continue
   │
   ├─ Row count > 2,000?
   │  ├─ YES → Use TABULAR (mandatory)
   │  ├─ UNKNOWN → Estimate first!
   │  └─ NO (<1,800) → Use SUMMARY ✓
   │
   └─ Row count 1,800-2,000?
      ├─ Critical data? → Use TABULAR (safe)
      └─ Can monitor? → Use SUMMARY with warning
```

---

## 4. REST API Implementation

### Base JSON Structure

```json
{
  "reportMetadata": {
    "name": "Opportunities_by_Stage",
    "reportFormat": "SUMMARY",
    "reportType": {
      "type": "Opportunity"
    },
    "groupingsDown": [
      {
        "name": "STAGE_NAME",
        "sortOrder": "Asc",
        "dateGranularity": "None"
      }
    ],
    "detailColumns": [
      "OPPORTUNITY_NAME",
      "ACCOUNT.NAME",
      "AMOUNT",
      "CLOSE_DATE"
    ],
    "aggregates": [
      {
        "name": "RowCount"
      },
      {
        "name": "s!AMOUNT",
        "label": "Sum of Amount"
      },
      {
        "name": "a!AMOUNT",
        "label": "Average Amount"
      }
    ],
    "reportFilters": [],
    "standardDateFilter": {
      "column": "CLOSE_DATE",
      "durationValue": "THIS_FISCAL_YEAR"
    },
    "hasDetailRows": true
  }
}
```

### Create Summary Report via REST API

```bash
curl -X POST \
  "https://yourinstance.salesforce.com/services/data/v62.0/analytics/reports" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reportMetadata": {
      "name": "Revenue_by_Stage_Q4",
      "reportFormat": "SUMMARY",
      "reportType": {
        "type": "Opportunity"
      },
      "groupingsDown": [
        {
          "name": "STAGE_NAME",
          "sortOrder": "Asc",
          "dateGranularity": "None"
        }
      ],
      "detailColumns": [
        "OPPORTUNITY_NAME",
        "ACCOUNT.NAME",
        "AMOUNT",
        "CLOSE_DATE",
        "OWNER_FULL_NAME"
      ],
      "aggregates": [
        {"name": "RowCount"},
        {"name": "s!AMOUNT", "label": "Total Amount"},
        {"name": "a!AMOUNT", "label": "Average Amount"}
      ],
      "standardDateFilter": {
        "column": "CLOSE_DATE",
        "durationValue": "THIS_FISCAL_QUARTER"
      },
      "hasDetailRows": true
    }
  }'
```

### Multi-Level Grouping

```json
{
  "reportMetadata": {
    "name": "Revenue_by_Region_and_Owner",
    "reportFormat": "SUMMARY",
    "reportType": {
      "type": "Opportunity"
    },
    "groupingsDown": [
      {
        "name": "ACCOUNT.BILLINGSTATE",
        "sortOrder": "Asc",
        "dateGranularity": "None"
      },
      {
        "name": "OWNER_FULL_NAME",
        "sortOrder": "Asc",
        "dateGranularity": "None"
      },
      {
        "name": "STAGE_NAME",
        "sortOrder": "Asc",
        "dateGranularity": "None"
      }
    ],
    "detailColumns": [
      "OPPORTUNITY_NAME",
      "AMOUNT",
      "CLOSE_DATE"
    ],
    "aggregates": [
      {"name": "RowCount"},
      {"name": "s!AMOUNT"}
    ]
  }
}
```

### Run Report and Get Results

```bash
curl -X POST \
  "https://yourinstance.salesforce.com/services/data/v62.0/analytics/reports/00O5f000004XXXX" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response Structure** (Summary Format):

```json
{
  "reportMetadata": {
    "name": "Revenue_by_Stage_Q4",
    "reportFormat": "SUMMARY",
    "groupingsDown": [
      {"name": "STAGE_NAME", "sortOrder": "Asc", "dateGranularity": "None"}
    ]
  },
  "groupingsDown": {
    "groupings": [
      {"key": "Qualification", "label": "Qualification", "value": "Qualification"},
      {"key": "Needs Analysis", "label": "Needs Analysis", "value": "Needs Analysis"},
      {"key": "Proposal", "label": "Proposal", "value": "Proposal"},
      {"key": "Negotiation", "label": "Negotiation", "value": "Negotiation"}
    ]
  },
  "factMap": {
    "0!T": {
      "rows": [
        {"dataCells": [{"label": "Opp 1", "value": "Opp 1"}, {"label": "$10,000", "value": 10000}]},
        {"dataCells": [{"label": "Opp 2", "value": "Opp 2"}, {"label": "$15,000", "value": 15000}]}
      ],
      "aggregates": [
        {"label": "2", "value": 2},
        {"label": "$25,000.00", "value": 25000}
      ]
    },
    "1!T": {
      "rows": [...],
      "aggregates": [{"label": "5", "value": 5}, {"label": "$75,000.00", "value": 75000}]
    },
    "T!T": {
      "rows": [],
      "aggregates": [
        {"label": "15", "value": 15},
        {"label": "$250,000.00", "value": 250000}
      ]
    }
  },
  "allData": true,
  "hasDetailRows": true
}
```

### Understanding factMap Keys

```
Key Format: {grouping1Index}_{grouping2Index}_...!{rowType}

Examples:
- "T!T" - Grand total (T = Total)
- "0!T" - First grouping value subtotal
- "1!T" - Second grouping value subtotal
- "0_0!T" - First group, first subgroup subtotal
- "0_1!T" - First group, second subgroup subtotal
```

---

## 5. Metadata API Implementation

### Basic XML Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>Revenue_by_Stage</name>
    <description>Summary of opportunity revenue grouped by stage</description>
    <reportType>Opportunity</reportType>
    <format>Summary</format>
    <showDetails>true</showDetails>

    <!-- Groupings -->
    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>STAGE_NAME</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>

    <!-- Detail Columns (NOT the grouping field!) -->
    <columns>
        <field>OPPORTUNITY_NAME</field>
    </columns>
    <columns>
        <field>ACCOUNT.NAME</field>
    </columns>
    <columns>
        <field>AMOUNT</field>
    </columns>
    <columns>
        <field>CLOSE_DATE</field>
    </columns>

    <!-- Aggregates -->
    <aggregates>
        <calculatedFormula>RowCount</calculatedFormula>
        <datatype>number</datatype>
        <developerName>RowCount</developerName>
        <isActive>true</isActive>
        <isCrossBlock>false</isCrossBlock>
        <masterLabel>Record Count</masterLabel>
        <scale>0</scale>
    </aggregates>
    <aggregates>
        <calculatedFormula>AMOUNT:SUM</calculatedFormula>
        <datatype>currency</datatype>
        <developerName>FORMULA1</developerName>
        <isActive>true</isActive>
        <isCrossBlock>false</isCrossBlock>
        <masterLabel>Total Amount</masterLabel>
        <scale>2</scale>
    </aggregates>

    <!-- Date Filter -->
    <timeFrameFilter>
        <dateColumn>CLOSE_DATE</dateColumn>
        <interval>INTERVAL_CURFY</interval>
    </timeFrameFilter>

    <scope>organization</scope>
</Report>
```

### Multi-Level Grouping XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>Revenue_by_Region_Owner_Stage</name>
    <reportType>Opportunity</reportType>
    <format>Summary</format>
    <showDetails>true</showDetails>

    <!-- Level 1 Grouping -->
    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>ACCOUNT.BILLINGSTATE</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>

    <!-- Level 2 Grouping -->
    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>OWNER_FULL_NAME</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>

    <!-- Level 3 Grouping -->
    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>STAGE_NAME</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>

    <!-- Columns -->
    <columns>
        <field>OPPORTUNITY_NAME</field>
    </columns>
    <columns>
        <field>AMOUNT</field>
    </columns>
    <columns>
        <field>CLOSE_DATE</field>
    </columns>

    <!-- Aggregates -->
    <aggregates>
        <calculatedFormula>AMOUNT:SUM</calculatedFormula>
        <datatype>currency</datatype>
        <developerName>FORMULA1</developerName>
        <isActive>true</isActive>
        <masterLabel>Total Amount</masterLabel>
        <scale>2</scale>
    </aggregates>
    <aggregates>
        <calculatedFormula>AMOUNT:AVG</calculatedFormula>
        <datatype>currency</datatype>
        <developerName>FORMULA2</developerName>
        <isActive>true</isActive>
        <masterLabel>Average Amount</masterLabel>
        <scale>2</scale>
    </aggregates>

    <scope>organization</scope>
</Report>
```

### Complete Summary Report XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>Comprehensive_Sales_Summary</name>
    <description>Multi-level sales summary with all features</description>
    <reportType>Opportunity</reportType>
    <format>Summary</format>
    <showDetails>true</showDetails>

    <!-- Groupings (Max 3 levels) -->
    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>STAGE_NAME</field>
        <sortOrder>Asc</sortOrder>
        <sortByName>s!AMOUNT</sortByName>
    </groupingsDown>
    <groupingsDown>
        <dateGranularity>Month</dateGranularity>
        <field>CLOSE_DATE</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>

    <!-- Detail Columns -->
    <columns>
        <field>OPPORTUNITY_NAME</field>
    </columns>
    <columns>
        <field>ACCOUNT.NAME</field>
    </columns>
    <columns>
        <field>AMOUNT</field>
    </columns>
    <columns>
        <field>PROBABILITY</field>
    </columns>
    <columns>
        <field>OWNER_FULL_NAME</field>
    </columns>

    <!-- Multiple Aggregates -->
    <aggregates>
        <calculatedFormula>RowCount</calculatedFormula>
        <datatype>number</datatype>
        <developerName>RowCount</developerName>
        <isActive>true</isActive>
        <masterLabel>Count</masterLabel>
        <scale>0</scale>
    </aggregates>
    <aggregates>
        <calculatedFormula>AMOUNT:SUM</calculatedFormula>
        <datatype>currency</datatype>
        <developerName>FORMULA1</developerName>
        <isActive>true</isActive>
        <masterLabel>Total Revenue</masterLabel>
        <scale>2</scale>
    </aggregates>
    <aggregates>
        <calculatedFormula>AMOUNT:AVG</calculatedFormula>
        <datatype>currency</datatype>
        <developerName>FORMULA2</developerName>
        <isActive>true</isActive>
        <masterLabel>Avg Deal Size</masterLabel>
        <scale>2</scale>
    </aggregates>
    <aggregates>
        <calculatedFormula>AMOUNT:MAX</calculatedFormula>
        <datatype>currency</datatype>
        <developerName>FORMULA3</developerName>
        <isActive>true</isActive>
        <masterLabel>Largest Deal</masterLabel>
        <scale>2</scale>
    </aggregates>
    <aggregates>
        <calculatedFormula>PROBABILITY:AVG</calculatedFormula>
        <datatype>percent</datatype>
        <developerName>FORMULA4</developerName>
        <isActive>true</isActive>
        <masterLabel>Avg Probability</masterLabel>
        <scale>0</scale>
    </aggregates>

    <!-- Filters -->
    <filter>
        <booleanFilter>1 AND 2</booleanFilter>
        <criteriaItems>
            <column>AMOUNT</column>
            <columnToColumn>false</columnToColumn>
            <isUnlocked>true</isUnlocked>
            <operator>greaterThan</operator>
            <value>0</value>
        </criteriaItems>
        <criteriaItems>
            <column>STAGE_NAME</column>
            <columnToColumn>false</columnToColumn>
            <isUnlocked>true</isUnlocked>
            <operator>notEqual</operator>
            <value>Closed Lost</value>
        </criteriaItems>
    </filter>

    <!-- Date Filter -->
    <timeFrameFilter>
        <dateColumn>CLOSE_DATE</dateColumn>
        <interval>INTERVAL_CURFY</interval>
    </timeFrameFilter>

    <scope>organization</scope>
    <currency>USD</currency>
</Report>
```

---

## 6. Groupings Configuration

### Grouping Field Requirements

**CRITICAL RULE**: Grouping fields should **NOT** be in detailColumns

```json
// ❌ WRONG - grouping field in columns causes issues
{
  "groupingsDown": [{"name": "STAGE_NAME"}],
  "detailColumns": ["OPPORTUNITY_NAME", "STAGE_NAME", "AMOUNT"]
}

// ✅ CORRECT - grouping field NOT in columns
{
  "groupingsDown": [{"name": "STAGE_NAME"}],
  "detailColumns": ["OPPORTUNITY_NAME", "AMOUNT", "CLOSE_DATE"]
}
```

### Grouping Options

**REST API**:

```json
{
  "groupingsDown": [
    {
      "name": "STAGE_NAME",        // Field API name
      "sortOrder": "Asc",          // "Asc" or "Desc"
      "dateGranularity": "None"    // For non-date fields
    }
  ]
}
```

**Available sortOrder Values**:
- `"Asc"` - Ascending (A-Z, 0-9, oldest first)
- `"Desc"` - Descending (Z-A, 9-0, newest first)

### Multi-Level Grouping (Max 3)

```json
{
  "groupingsDown": [
    {
      "name": "ACCOUNT.TYPE",
      "sortOrder": "Asc",
      "dateGranularity": "None"
    },
    {
      "name": "STAGE_NAME",
      "sortOrder": "Asc",
      "dateGranularity": "None"
    },
    {
      "name": "OWNER_FULL_NAME",
      "sortOrder": "Asc",
      "dateGranularity": "None"
    }
  ]
}
```

### Sort by Aggregate

```json
{
  "groupingsDown": [
    {
      "name": "STAGE_NAME",
      "sortOrder": "Desc",
      "dateGranularity": "None",
      "sortAggregate": "s!AMOUNT"  // Sort by Sum of Amount
    }
  ]
}
```

**Available sortAggregate Values**:
- `"RowCount"` - Sort by record count
- `"s!FIELDNAME"` - Sort by sum
- `"a!FIELDNAME"` - Sort by average
- `"mx!FIELDNAME"` - Sort by maximum
- `"m!FIELDNAME"` - Sort by minimum

---

## 7. Aggregates Configuration

### Aggregate Types

| Prefix | Aggregate | Applies To | Example |
|--------|-----------|------------|---------|
| `s!` | Sum | Number, Currency | `s!AMOUNT` |
| `a!` | Average | Number, Currency, Percent | `a!PROBABILITY` |
| `mx!` | Maximum | Number, Currency, Date | `mx!CLOSE_DATE` |
| `m!` | Minimum | Number, Currency, Date | `m!CREATED_DATE` |
| `RowCount` | Count | All records | `RowCount` |

### REST API Aggregate Configuration

```json
{
  "aggregates": [
    {
      "name": "RowCount"
    },
    {
      "name": "s!AMOUNT",
      "label": "Total Revenue"
    },
    {
      "name": "a!AMOUNT",
      "label": "Average Deal Size"
    },
    {
      "name": "mx!AMOUNT",
      "label": "Largest Deal"
    },
    {
      "name": "m!AMOUNT",
      "label": "Smallest Deal"
    },
    {
      "name": "a!PROBABILITY",
      "label": "Avg Win Rate"
    }
  ]
}
```

### Metadata API Aggregate Configuration

```xml
<!-- Count -->
<aggregates>
    <calculatedFormula>RowCount</calculatedFormula>
    <datatype>number</datatype>
    <developerName>RowCount</developerName>
    <isActive>true</isActive>
    <masterLabel>Record Count</masterLabel>
    <scale>0</scale>
</aggregates>

<!-- Sum -->
<aggregates>
    <calculatedFormula>AMOUNT:SUM</calculatedFormula>
    <datatype>currency</datatype>
    <developerName>SumAmount</developerName>
    <isActive>true</isActive>
    <masterLabel>Total Revenue</masterLabel>
    <scale>2</scale>
</aggregates>

<!-- Average -->
<aggregates>
    <calculatedFormula>AMOUNT:AVG</calculatedFormula>
    <datatype>currency</datatype>
    <developerName>AvgAmount</developerName>
    <isActive>true</isActive>
    <masterLabel>Average Deal</masterLabel>
    <scale>2</scale>
</aggregates>

<!-- Maximum -->
<aggregates>
    <calculatedFormula>AMOUNT:MAX</calculatedFormula>
    <datatype>currency</datatype>
    <developerName>MaxAmount</developerName>
    <isActive>true</isActive>
    <masterLabel>Largest Deal</masterLabel>
    <scale>2</scale>
</aggregates>

<!-- Minimum -->
<aggregates>
    <calculatedFormula>AMOUNT:MIN</calculatedFormula>
    <datatype>currency</datatype>
    <developerName>MinAmount</developerName>
    <isActive>true</isActive>
    <masterLabel>Smallest Deal</masterLabel>
    <scale>2</scale>
</aggregates>
```

### Custom Formula Aggregates

```xml
<!-- Percentage calculation -->
<aggregates>
    <calculatedFormula>AMOUNT:SUM / PARENTGROUPVAL(AMOUNT:SUM, STAGE_NAME) * 100</calculatedFormula>
    <datatype>percent</datatype>
    <developerName>PctOfStage</developerName>
    <isActive>true</isActive>
    <masterLabel>% of Stage Total</masterLabel>
    <scale>1</scale>
</aggregates>

<!-- Calculated metric -->
<aggregates>
    <calculatedFormula>AMOUNT:SUM / RowCount</calculatedFormula>
    <datatype>currency</datatype>
    <developerName>AvgDealCalc</developerName>
    <isActive>true</isActive>
    <masterLabel>Calculated Avg</masterLabel>
    <scale>2</scale>
</aggregates>
```

### Aggregate Compatibility Matrix

| Field Type | SUM | AVG | MIN | MAX | COUNT |
|------------|-----|-----|-----|-----|-------|
| Currency | ✅ | ✅ | ✅ | ✅ | ✅ |
| Number | ✅ | ✅ | ✅ | ✅ | ✅ |
| Percent | ✅ | ✅ | ✅ | ✅ | ✅ |
| Date | ❌ | ❌ | ✅ | ✅ | ✅ |
| DateTime | ❌ | ❌ | ✅ | ✅ | ✅ |
| Picklist | ❌ | ❌ | ❌ | ❌ | ✅ |
| Text | ❌ | ❌ | ❌ | ❌ | ✅ |
| Checkbox | ❌ | ❌ | ❌ | ❌ | ✅ |
| Lookup | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 8. Date Granularity

### When to Use Date Granularity

Date granularity is **REQUIRED** when grouping by date fields to specify how dates should be rolled up.

```json
// ❌ WRONG - date field without granularity
{
  "groupingsDown": [
    {
      "name": "CLOSE_DATE",
      "sortOrder": "Asc",
      "dateGranularity": "None"  // Groups by individual date - too granular!
    }
  ]
}

// ✅ CORRECT - date field with appropriate granularity
{
  "groupingsDown": [
    {
      "name": "CLOSE_DATE",
      "sortOrder": "Asc",
      "dateGranularity": "Month"  // Groups by month
    }
  ]
}
```

### Available Granularity Values

**REST API** (`dateGranularity`):

| Value | Description | Use Case |
|-------|-------------|----------|
| `"None"` | Individual values | Non-date fields, or exact date grouping |
| `"Day"` | Group by day | Daily tracking |
| `"Week"` | Group by week | Weekly rollup |
| `"Month"` | Group by month | Monthly reporting |
| `"Quarter"` | Group by quarter | Quarterly analysis |
| `"Year"` | Group by year | Annual trends |
| `"FiscalQuarter"` | Fiscal quarter | Aligned to fiscal calendar |
| `"FiscalYear"` | Fiscal year | Aligned to fiscal calendar |

**Metadata API** (`<dateGranularity>`):

| Value | Description |
|-------|-------------|
| `None` | No grouping (individual values) |
| `Day` | Daily |
| `Week` | Weekly |
| `Month` | Monthly |
| `Quarter` | Calendar quarter |
| `Year` | Calendar year |
| `FiscalQuarter` | Fiscal quarter |
| `FiscalYear` | Fiscal year |

### Examples by Use Case

**Monthly Trend Report**:

```json
{
  "groupingsDown": [
    {
      "name": "CLOSE_DATE",
      "sortOrder": "Asc",
      "dateGranularity": "Month"
    },
    {
      "name": "STAGE_NAME",
      "sortOrder": "Asc",
      "dateGranularity": "None"
    }
  ]
}
```

**Fiscal Quarter Performance**:

```json
{
  "groupingsDown": [
    {
      "name": "CLOSE_DATE",
      "sortOrder": "Asc",
      "dateGranularity": "FiscalQuarter"
    },
    {
      "name": "OWNER_FULL_NAME",
      "sortOrder": "Asc",
      "dateGranularity": "None"
    }
  ]
}
```

**Weekly Activity Tracking**:

```json
{
  "groupingsDown": [
    {
      "name": "ACTIVITY_DATE",
      "sortOrder": "Desc",
      "dateGranularity": "Week"
    }
  ]
}
```

### Metadata API Date Granularity

```xml
<!-- Monthly grouping -->
<groupingsDown>
    <dateGranularity>Month</dateGranularity>
    <field>CLOSE_DATE</field>
    <sortOrder>Asc</sortOrder>
</groupingsDown>

<!-- Fiscal quarter grouping -->
<groupingsDown>
    <dateGranularity>FiscalQuarter</dateGranularity>
    <field>CLOSE_DATE</field>
    <sortOrder>Asc</sortOrder>
</groupingsDown>
```

---

## 9. MCP Tool Usage

### Create Summary Report

```javascript
// Create summary report using MCP
const report = await mcp_salesforce_report_create({
  name: "Revenue_by_Stage_Summary",
  folder: "Sales_Reports",
  format: "SUMMARY",
  reportType: "Opportunity",
  groupings: [
    {
      field: "STAGE_NAME",
      sortOrder: "Asc",
      dateGranularity: "None"
    }
  ],
  columns: [
    "OPPORTUNITY_NAME",
    "ACCOUNT.NAME",
    "AMOUNT",
    "CLOSE_DATE"
  ],
  aggregates: [
    { type: "RowCount" },
    { type: "SUM", field: "AMOUNT", label: "Total Revenue" },
    { type: "AVG", field: "AMOUNT", label: "Avg Deal Size" }
  ],
  dateFilter: {
    column: "CLOSE_DATE",
    duration: "THIS_FISCAL_YEAR"
  }
});
```

### Pre-Flight Row Count Check

```javascript
// CRITICAL: Check row count before creating Summary report
async function createSafeReport(config) {
  // Step 1: Estimate row count
  const countQuery = `SELECT COUNT() FROM ${config.reportType}`;
  const count = await mcp_salesforce_data_query({ query: countQuery });

  // Step 2: Check against limit
  if (count.totalSize > 2000) {
    console.warn(`⚠️ Row count ${count.totalSize} exceeds 2,000 limit`);
    console.warn('Switching to TABULAR format');

    config.format = 'TABULAR';
    delete config.groupings;  // Remove groupings
    delete config.aggregates; // Remove aggregates
  }

  // Step 3: Create report
  return await mcp_salesforce_report_create(config);
}
```

### Multi-Level Grouping with MCP

```javascript
const report = await mcp_salesforce_report_create({
  name: "Pipeline_by_Region_Stage_Owner",
  folder: "Executive_Reports",
  format: "SUMMARY",
  reportType: "Opportunity",
  groupings: [
    { field: "ACCOUNT.BILLINGSTATE", sortOrder: "Asc" },
    { field: "STAGE_NAME", sortOrder: "Asc" },
    { field: "OWNER_FULL_NAME", sortOrder: "Asc" }
  ],
  columns: [
    "OPPORTUNITY_NAME",
    "AMOUNT",
    "CLOSE_DATE"
  ],
  aggregates: [
    { type: "RowCount" },
    { type: "SUM", field: "AMOUNT" }
  ],
  filters: [
    { field: "ISCLOSED", operator: "equals", value: "false" }
  ],
  dateFilter: {
    column: "CLOSE_DATE",
    duration: "THIS_FISCAL_YEAR"
  }
});
```

### Run and Validate Results

```javascript
// Run report and check for truncation
const results = await mcp_salesforce_report_run({
  reportId: report.id
});

// Check allData flag
if (results.allData === false) {
  console.error('❌ WARNING: Data was truncated!');
  console.error('Consider switching to TABULAR format');
}

// Extract subtotals
const grandTotal = results.factMap['T!T'].aggregates;
console.log(`Grand Total Count: ${grandTotal[0].value}`);
console.log(`Grand Total Amount: ${grandTotal[1].value}`);

// Extract group subtotals
const groupKeys = Object.keys(results.factMap)
  .filter(key => key !== 'T!T' && key.endsWith('!T'));

for (const key of groupKeys) {
  const groupData = results.factMap[key];
  console.log(`Group ${key}: ${groupData.aggregates[0].value} records`);
}
```

---

## 10. Best Practices

### Grouping Strategy

**DO**:
```
✅ Limit to 2 grouping levels for readability
✅ Put most important grouping first
✅ Use date granularity appropriate to timeframe
✅ Consider sorting by aggregate (highest revenue first)
```

**DON'T**:
```
❌ Include grouping field in detailColumns
❌ Use 3 groupings unless necessary
❌ Group by high-cardinality fields (e.g., Name)
❌ Use "None" granularity for dates (too many groups)
```

### Aggregate Selection

**DO**:
```
✅ Include RowCount for context
✅ Choose aggregates relevant to business question
✅ Limit to 4-5 aggregates maximum
✅ Use appropriate scale (2 decimal for currency)
```

**DON'T**:
```
❌ Include every possible aggregate
❌ Use SUM on percentage fields
❌ Apply numeric aggregates to text fields
❌ Create redundant aggregates (AVG when data is SUM/COUNT)
```

### Row Count Management

| Scenario | Best Practice |
|----------|--------------|
| Unknown row count | Always estimate before creating |
| Near 2,000 limit | Add restrictive filters OR use TABULAR |
| Growing data set | Add date filter to limit scope |
| Critical reporting | Use TABULAR for guaranteed accuracy |

### Performance Optimization

| Optimization | Impact | Implementation |
|--------------|--------|----------------|
| Limit groupings | High | Use 1-2 levels instead of 3 |
| Add date filter | High | Narrow time range |
| Filter early | High | Reduce base record set |
| Limit aggregates | Medium | Only essential calculations |
| Use indexed fields | Medium | Filter/group on indexed fields |

---

## 11. Row Count Detection & Mitigation

### Pre-Creation Row Estimation

```javascript
/**
 * Estimate row count before creating Summary report
 * @returns {Promise<{count: number, safe: boolean, recommendation: string}>}
 */
async function estimateSummaryReportRows(config) {
  const { reportType, filters, dateFilter } = config;

  // Build estimation query
  let soql = `SELECT COUNT() FROM ${reportType}`;
  const whereClauses = [];

  // Add filter conditions
  if (filters) {
    for (const filter of filters) {
      whereClauses.push(`${filter.field} ${filter.operator} '${filter.value}'`);
    }
  }

  // Add date filter
  if (dateFilter) {
    whereClauses.push(`${dateFilter.column} = ${dateFilter.duration}`);
  }

  if (whereClauses.length > 0) {
    soql += ` WHERE ${whereClauses.join(' AND ')}`;
  }

  const result = await conn.query(soql);
  const count = result.totalSize;

  // Determine safety
  let safe = true;
  let recommendation = 'SUMMARY format is safe';

  if (count > 2000) {
    safe = false;
    recommendation = 'MUST use TABULAR format - row count exceeds 2,000 limit';
  } else if (count > 1800) {
    recommendation = 'Consider TABULAR format - close to 2,000 limit';
  } else if (count > 1500) {
    recommendation = 'SUMMARY format safe, but monitor data growth';
  }

  return {
    count,
    safe,
    recommendation,
    limit: 2000,
    percentOfLimit: ((count / 2000) * 100).toFixed(1)
  };
}
```

### Post-Execution Truncation Check

```javascript
/**
 * Check if report results were truncated
 * @param {Object} results - Report execution results
 * @returns {Object} Truncation status
 */
function checkTruncation(results) {
  const allData = results.allData;
  const totalRows = results.factMap['T!T']?.aggregates[0]?.value || 0;

  if (allData === false) {
    return {
      truncated: true,
      rowsReturned: totalRows,
      message: `⚠️ DATA TRUNCATED: Only ${totalRows} rows returned. Actual data exceeds 2,000 row limit.`,
      action: 'SWITCH_TO_TABULAR'
    };
  }

  if (totalRows >= 1900) {
    return {
      truncated: false,
      rowsReturned: totalRows,
      message: `⚠️ WARNING: ${totalRows} rows is close to 2,000 limit. Monitor data growth.`,
      action: 'MONITOR'
    };
  }

  return {
    truncated: false,
    rowsReturned: totalRows,
    message: `✅ All ${totalRows} rows returned successfully.`,
    action: 'NONE'
  };
}
```

### Automatic Format Switching Service

```javascript
/**
 * Create report with automatic format selection
 * @see {@link docs/runbooks/report-api-development/03-summary-reports.md}
 */
async function createReportSafe(config) {
  const { format: preferredFormat } = config;

  // Only check if SUMMARY format requested
  if (preferredFormat !== 'SUMMARY') {
    return await mcp_salesforce_report_create(config);
  }

  // Estimate rows
  const estimate = await estimateSummaryReportRows(config);
  console.log(`Row estimate: ${estimate.count} (${estimate.percentOfLimit}% of limit)`);

  // Force TABULAR if over limit
  if (!estimate.safe) {
    console.warn(`❌ ${estimate.recommendation}`);
    console.warn('Converting to TABULAR format...');

    const tabularConfig = {
      ...config,
      format: 'TABULAR',
      groupings: undefined,
      aggregates: undefined
    };

    const report = await mcp_salesforce_report_create(tabularConfig);
    return {
      ...report,
      formatChanged: true,
      originalFormat: 'SUMMARY',
      reason: estimate.recommendation
    };
  }

  // Create with SUMMARY format
  const report = await mcp_salesforce_report_create(config);
  return {
    ...report,
    formatChanged: false,
    rowEstimate: estimate.count
  };
}
```

---

## 12. Common Errors and Fixes

### Error: "Invalid grouping field"

**Cause**: Field doesn't support grouping

**Fix**:
```javascript
// Check if field supports grouping
const typeInfo = await mcp_salesforce_report_type_describe({
  report_type: "Opportunity"
});

const groupableFields = typeInfo.reportTypeCategories
  .flatMap(cat => cat.columns)
  .filter(col => col.groupable)
  .map(col => col.name);

console.log('Groupable fields:', groupableFields);
```

### Error: "Grouping field in columns"

**Cause**: Same field in groupingsDown and detailColumns

**Fix**:
```json
// Remove grouping field from columns
{
  "groupingsDown": [{"name": "STAGE_NAME"}],
  "detailColumns": [
    "OPPORTUNITY_NAME",
    // "STAGE_NAME", ← REMOVE THIS
    "AMOUNT",
    "CLOSE_DATE"
  ]
}
```

### Error: "Invalid aggregate"

**Cause**: Aggregate not compatible with field type

**Fix**:
```javascript
// Check field type before applying aggregate
const fieldInfo = typeInfo.reportTypeCategories
  .flatMap(cat => cat.columns)
  .find(col => col.name === 'MY_FIELD');

// Only these types support SUM/AVG:
// - currency
// - number
// - percent

if (['currency', 'number', 'percent'].includes(fieldInfo.dataType)) {
  // Safe to use SUM, AVG
} else {
  // Only use COUNT
}
```

### Error: "Date granularity required"

**Cause**: Date field grouped without granularity

**Fix**:
```json
// Add appropriate date granularity
{
  "groupingsDown": [
    {
      "name": "CLOSE_DATE",
      "sortOrder": "Asc",
      "dateGranularity": "Month"  // Add this
    }
  ]
}
```

### Error: "Maximum grouping levels exceeded"

**Cause**: More than 3 groupingsDown

**Fix**:
- Reduce to maximum 3 grouping levels
- Consider using MATRIX for 2D analysis
- Split into multiple reports

### Data Missing (No Error)

**Cause**: Silent truncation at 2,000 rows

**Fix**:
```javascript
// ALWAYS check allData flag
const results = await runReport(reportId);

if (results.allData === false) {
  throw new Error('Report truncated! Switch to TABULAR format');
}
```

---

## 13. Complete Examples

### Example 1: Sales Pipeline by Stage

**Use Case**: View opportunity pipeline grouped by stage with revenue totals

**REST API**:

```json
{
  "reportMetadata": {
    "name": "Sales_Pipeline_by_Stage",
    "reportFormat": "SUMMARY",
    "reportType": {"type": "Opportunity"},
    "groupingsDown": [
      {
        "name": "STAGE_NAME",
        "sortOrder": "Asc",
        "dateGranularity": "None"
      }
    ],
    "detailColumns": [
      "OPPORTUNITY_NAME",
      "ACCOUNT.NAME",
      "AMOUNT",
      "CLOSE_DATE",
      "OWNER_FULL_NAME"
    ],
    "aggregates": [
      {"name": "RowCount"},
      {"name": "s!AMOUNT", "label": "Total Revenue"},
      {"name": "a!AMOUNT", "label": "Avg Deal Size"}
    ],
    "reportFilters": [
      {"column": "ISCLOSED", "filterType": "equals", "value": "false"}
    ],
    "standardDateFilter": {
      "column": "CLOSE_DATE",
      "durationValue": "THIS_FISCAL_YEAR"
    },
    "hasDetailRows": true
  }
}
```

**Metadata API**:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>Sales_Pipeline_by_Stage</name>
    <reportType>Opportunity</reportType>
    <format>Summary</format>
    <showDetails>true</showDetails>

    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>STAGE_NAME</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>

    <columns>
        <field>OPPORTUNITY_NAME</field>
    </columns>
    <columns>
        <field>ACCOUNT.NAME</field>
    </columns>
    <columns>
        <field>AMOUNT</field>
    </columns>
    <columns>
        <field>CLOSE_DATE</field>
    </columns>
    <columns>
        <field>OWNER_FULL_NAME</field>
    </columns>

    <aggregates>
        <calculatedFormula>RowCount</calculatedFormula>
        <datatype>number</datatype>
        <developerName>RowCount</developerName>
        <isActive>true</isActive>
        <masterLabel>Count</masterLabel>
        <scale>0</scale>
    </aggregates>
    <aggregates>
        <calculatedFormula>AMOUNT:SUM</calculatedFormula>
        <datatype>currency</datatype>
        <developerName>TotalRevenue</developerName>
        <isActive>true</isActive>
        <masterLabel>Total Revenue</masterLabel>
        <scale>2</scale>
    </aggregates>
    <aggregates>
        <calculatedFormula>AMOUNT:AVG</calculatedFormula>
        <datatype>currency</datatype>
        <developerName>AvgDeal</developerName>
        <isActive>true</isActive>
        <masterLabel>Avg Deal Size</masterLabel>
        <scale>2</scale>
    </aggregates>

    <filter>
        <criteriaItems>
            <column>ISCLOSED</column>
            <columnToColumn>false</columnToColumn>
            <isUnlocked>true</isUnlocked>
            <operator>equals</operator>
            <value>0</value>
        </criteriaItems>
    </filter>

    <timeFrameFilter>
        <dateColumn>CLOSE_DATE</dateColumn>
        <interval>INTERVAL_CURFY</interval>
    </timeFrameFilter>

    <scope>organization</scope>
</Report>
```

### Example 2: Monthly Revenue Trend

**Use Case**: Track monthly revenue with quarter-over-quarter comparison

**REST API**:

```json
{
  "reportMetadata": {
    "name": "Monthly_Revenue_Trend",
    "reportFormat": "SUMMARY",
    "reportType": {"type": "Opportunity"},
    "groupingsDown": [
      {
        "name": "CLOSE_DATE",
        "sortOrder": "Asc",
        "dateGranularity": "Month"
      }
    ],
    "detailColumns": [
      "OPPORTUNITY_NAME",
      "ACCOUNT.NAME",
      "AMOUNT",
      "STAGE_NAME"
    ],
    "aggregates": [
      {"name": "RowCount"},
      {"name": "s!AMOUNT", "label": "Monthly Revenue"},
      {"name": "a!AMOUNT", "label": "Avg Deal Size"},
      {"name": "mx!AMOUNT", "label": "Largest Deal"}
    ],
    "reportFilters": [
      {"column": "ISWON", "filterType": "equals", "value": "true"}
    ],
    "standardDateFilter": {
      "column": "CLOSE_DATE",
      "durationValue": "LAST_N_MONTHS:12"
    },
    "hasDetailRows": true
  }
}
```

### Example 3: Rep Performance by Region

**Use Case**: Two-level grouping for regional sales analysis

**REST API**:

```json
{
  "reportMetadata": {
    "name": "Rep_Performance_by_Region",
    "reportFormat": "SUMMARY",
    "reportType": {"type": "Opportunity"},
    "groupingsDown": [
      {
        "name": "ACCOUNT.BILLINGSTATE",
        "sortOrder": "Asc",
        "dateGranularity": "None"
      },
      {
        "name": "OWNER_FULL_NAME",
        "sortOrder": "Asc",
        "dateGranularity": "None"
      }
    ],
    "detailColumns": [
      "OPPORTUNITY_NAME",
      "AMOUNT",
      "CLOSE_DATE",
      "STAGE_NAME"
    ],
    "aggregates": [
      {"name": "RowCount"},
      {"name": "s!AMOUNT", "label": "Total Revenue"},
      {"name": "a!AMOUNT", "label": "Avg Deal Size"}
    ],
    "standardDateFilter": {
      "column": "CLOSE_DATE",
      "durationValue": "THIS_FISCAL_YEAR"
    }
  }
}
```

### Example 4: Case Volume by Priority and Status

**Use Case**: Service report with multiple groupings

**Metadata API**:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>Case_Volume_Priority_Status</name>
    <reportType>CaseList</reportType>
    <format>Summary</format>
    <showDetails>true</showDetails>

    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>PRIORITY</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>
    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>STATUS</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>

    <columns>
        <field>CASE_NUMBER</field>
    </columns>
    <columns>
        <field>SUBJECT</field>
    </columns>
    <columns>
        <field>ACCOUNT.NAME</field>
    </columns>
    <columns>
        <field>CREATED_DATEONLY</field>
    </columns>
    <columns>
        <field>OWNER_FULL_NAME</field>
    </columns>

    <aggregates>
        <calculatedFormula>RowCount</calculatedFormula>
        <datatype>number</datatype>
        <developerName>RowCount</developerName>
        <isActive>true</isActive>
        <masterLabel>Case Count</masterLabel>
        <scale>0</scale>
    </aggregates>

    <timeFrameFilter>
        <dateColumn>CREATED_DATEONLY</dateColumn>
        <interval>INTERVAL_CURQ</interval>
    </timeFrameFilter>

    <scope>organization</scope>
</Report>
```

---

## Related Runbooks

- **Previous**: [Runbook 02: Tabular Reports](02-tabular-reports.md) - Simple list reports
- **Next**: [Runbook 04: Matrix Reports](04-matrix-reports.md) - Cross-tabulation analysis
- **Format Selection**: [Runbook 01: Report Formats Fundamentals](01-report-formats-fundamentals.md) - Choosing the right format
- **Validation**: [Runbook 08: Validation & Deployment](08-validation-deployment.md) - Pre-deployment checks

---

**Last Updated**: November 26, 2025
**Maintained By**: Salesforce Plugin Team
**Plugin Version**: v3.51.0
