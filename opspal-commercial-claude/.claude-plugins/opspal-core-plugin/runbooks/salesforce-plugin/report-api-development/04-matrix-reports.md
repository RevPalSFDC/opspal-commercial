# Runbook 04: Matrix Reports

**Version**: v3.51.0
**Last Updated**: November 26, 2025
**Status**: Complete

---

## Table of Contents

1. [Overview](#1-overview)
2. [When to Use Matrix Format](#2-when-to-use-matrix-format)
3. [REST API Implementation](#3-rest-api-implementation)
4. [Metadata API Implementation](#4-metadata-api-implementation)
5. [GroupingsDown Configuration](#5-groupingsdown-configuration)
6. [GroupingsAcross Configuration](#6-groupingsacross-configuration)
7. [Cell Intersections](#7-cell-intersections)
8. [Aggregates and Calculations](#8-aggregates-and-calculations)
9. [Sparse Grid Handling](#9-sparse-grid-handling)
10. [MCP Tool Usage](#10-mcp-tool-usage)
11. [Best Practices](#11-best-practices)
12. [Common Errors and Fixes](#12-common-errors-and-fixes)
13. [Complete Examples](#13-complete-examples)

---

## 1. Overview

### What is a Matrix Report?

A **Matrix report** provides two-dimensional analysis by grouping data both down (rows) and across (columns), creating a cross-tabulation grid similar to a pivot table. Each cell shows aggregated values at the intersection of row and column groupings.

### Key Characteristics

| Characteristic | Value |
|---------------|-------|
| Format Name | `MATRIX` |
| Maximum Groupings (Down) | 3 |
| Maximum Groupings (Across) | 2 |
| **Required** | At least 1 groupingDown AND 1 groupingAcross |
| Aggregates | Yes (SUM, AVG, MIN, MAX, COUNT per cell) |
| Maximum Rows (API) | ~1,500 cells (varies by complexity) |
| Dashboard Support | Yes (excellent for heat maps) |
| Export Support | Preserves grid structure |

### Matrix Format Structure

```
┌────────────────────────────────────────────────────────────────────────────┐
│ MATRIX REPORT                                                               │
├──────────────┬──────────────┬──────────────┬──────────────┬────────────────┤
│              │ Across 1:    │ Across 1:    │ Across 1:    │                │
│              │ Value A      │ Value B      │ Value C      │ Row Total      │
├──────────────┼──────────────┼──────────────┼──────────────┼────────────────┤
│ Down 1:      │              │              │              │                │
│ Value X      │ $10,000 (5)  │ $15,000 (8)  │ $5,000 (2)   │ $30,000 (15)   │
├──────────────┼──────────────┼──────────────┼──────────────┼────────────────┤
│ Down 1:      │              │              │              │                │
│ Value Y      │ $20,000 (10) │ $8,000 (4)   │ $12,000 (6)  │ $40,000 (20)   │
├──────────────┼──────────────┼──────────────┼──────────────┼────────────────┤
│ Down 1:      │              │              │              │                │
│ Value Z      │ $5,000 (3)   │ $25,000 (12) │ $10,000 (5)  │ $40,000 (20)   │
├──────────────┼──────────────┼──────────────┼──────────────┼────────────────┤
│ Column Total │ $35,000 (18) │ $48,000 (24) │ $27,000 (13) │ $110,000 (55)  │
└──────────────┴──────────────┴──────────────┴──────────────┴────────────────┘
```

### Multi-Level Matrix Structure

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                           │       Q1        │       Q2        │               │
│                           ├────────┬────────┼────────┬────────┤               │
│                           │  Won   │  Lost  │  Won   │  Lost  │    Total      │
├────────────────┬──────────┼────────┼────────┼────────┼────────┼───────────────┤
│ California     │ Rep A    │ $50K   │ $10K   │ $60K   │ $15K   │ $135K         │
│                │ Rep B    │ $30K   │ $5K    │ $40K   │ $8K    │ $83K          │
│                │ Subtotal │ $80K   │ $15K   │ $100K  │ $23K   │ $218K         │
├────────────────┼──────────┼────────┼────────┼────────┼────────┼───────────────┤
│ Texas          │ Rep C    │ $45K   │ $12K   │ $55K   │ $20K   │ $132K         │
│                │ Subtotal │ $45K   │ $12K   │ $55K   │ $20K   │ $132K         │
├────────────────┴──────────┼────────┼────────┼────────┼────────┼───────────────┤
│ Grand Total               │ $125K  │ $27K   │ $155K  │ $43K   │ $350K         │
└───────────────────────────┴────────┴────────┴────────┴────────┴───────────────┘
```

---

## 2. When to Use Matrix Format

### Ideal Use Cases

**1. Cross-Tabulation Analysis**
```
✅ Sales by Region vs Product Line
✅ Cases by Priority vs Status
✅ Revenue by Quarter vs Owner
✅ Leads by Source vs Campaign
```

**2. Pivot-Style Reports**
```
✅ Time-based trend by category
✅ Performance comparison across dimensions
✅ Win/Loss analysis by segment
✅ Volume distribution analysis
```

**3. Dashboard Heat Maps**
```
✅ Activity levels across territories
✅ Performance metrics by period
✅ Conversion rates by channel
✅ Resource utilization views
```

**4. Comparative Analysis**
```
✅ Year-over-year comparison
✅ Plan vs Actual
✅ Team vs Team performance
✅ Product vs Product analysis
```

### When NOT to Use Matrix

| Scenario | Use Instead | Reason |
|----------|-------------|--------|
| Single dimension grouping | **SUMMARY** | No cross-tabulation needed |
| Large data exports | **TABULAR** | Matrix has cell limits |
| No grouping needed | **TABULAR** | Matrix requires both dimensions |
| >2 groupingsAcross needed | **Multiple reports** | 2 is max across |
| Cross-object comparison | **JOINED** | Different report types needed |
| Simple row listing | **TABULAR** | Simplest option |

### Decision Flowchart

```
Need cross-tabulation (2D analysis)?
│
├─ NO → Use SUMMARY or TABULAR
│
└─ YES → Continue
   │
   ├─ Need row grouping AND column grouping?
   │  ├─ NO → Use SUMMARY (only groupingsDown)
   │  └─ YES → MATRIX is appropriate ✓
   │
   ├─ More than 2 dimensions across?
   │  ├─ YES → Create multiple reports
   │  └─ NO → MATRIX can handle
   │
   └─ High cardinality fields?
      ├─ YES → Consider aggregating first
      └─ NO → MATRIX is optimal ✓
```

---

## 3. REST API Implementation

### Base JSON Structure

```json
{
  "reportMetadata": {
    "name": "Revenue_by_Stage_and_Quarter",
    "reportFormat": "MATRIX",
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
    "groupingsAcross": [
      {
        "name": "CLOSE_DATE",
        "sortOrder": "Asc",
        "dateGranularity": "Quarter"
      }
    ],
    "detailColumns": [
      "OPPORTUNITY_NAME",
      "ACCOUNT.NAME",
      "AMOUNT"
    ],
    "aggregates": [
      {
        "name": "RowCount"
      },
      {
        "name": "s!AMOUNT",
        "label": "Total Revenue"
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

### Create Matrix Report via REST API

```bash
curl -X POST \
  "https://yourinstance.salesforce.com/services/data/v62.0/analytics/reports" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reportMetadata": {
      "name": "Stage_Quarter_Matrix",
      "reportFormat": "MATRIX",
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
      "groupingsAcross": [
        {
          "name": "CLOSE_DATE",
          "sortOrder": "Asc",
          "dateGranularity": "Quarter"
        }
      ],
      "detailColumns": [
        "OPPORTUNITY_NAME",
        "ACCOUNT.NAME",
        "AMOUNT"
      ],
      "aggregates": [
        {"name": "RowCount"},
        {"name": "s!AMOUNT", "label": "Total Revenue"}
      ],
      "standardDateFilter": {
        "column": "CLOSE_DATE",
        "durationValue": "THIS_FISCAL_YEAR"
      },
      "hasDetailRows": false
    }
  }'
```

### Multi-Level Matrix

```json
{
  "reportMetadata": {
    "name": "Region_Rep_by_Quarter_Status",
    "reportFormat": "MATRIX",
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
      }
    ],
    "groupingsAcross": [
      {
        "name": "CLOSE_DATE",
        "sortOrder": "Asc",
        "dateGranularity": "Quarter"
      },
      {
        "name": "ISWON",
        "sortOrder": "Asc",
        "dateGranularity": "None"
      }
    ],
    "aggregates": [
      {"name": "s!AMOUNT"}
    ]
  }
}
```

### Run Report and Get Results

**Response Structure** (Matrix Format):

```json
{
  "reportMetadata": {
    "name": "Stage_Quarter_Matrix",
    "reportFormat": "MATRIX",
    "groupingsDown": [
      {"name": "STAGE_NAME", "sortOrder": "Asc", "dateGranularity": "None"}
    ],
    "groupingsAcross": [
      {"name": "CLOSE_DATE", "sortOrder": "Asc", "dateGranularity": "Quarter"}
    ]
  },
  "groupingsDown": {
    "groupings": [
      {"key": "Qualification", "label": "Qualification", "value": "Qualification"},
      {"key": "Proposal", "label": "Proposal", "value": "Proposal"},
      {"key": "Negotiation", "label": "Negotiation", "value": "Negotiation"}
    ]
  },
  "groupingsAcross": {
    "groupings": [
      {"key": "2025-Q1", "label": "Q1 2025", "value": "2025-Q1"},
      {"key": "2025-Q2", "label": "Q2 2025", "value": "2025-Q2"},
      {"key": "2025-Q3", "label": "Q3 2025", "value": "2025-Q3"},
      {"key": "2025-Q4", "label": "Q4 2025", "value": "2025-Q4"}
    ]
  },
  "factMap": {
    "0_0!T": {"aggregates": [{"value": 5}, {"value": 50000}]},
    "0_1!T": {"aggregates": [{"value": 8}, {"value": 80000}]},
    "0_2!T": {"aggregates": [{"value": 3}, {"value": 30000}]},
    "0_3!T": {"aggregates": [{"value": 10}, {"value": 100000}]},
    "0!T": {"aggregates": [{"value": 26}, {"value": 260000}]},
    "1_0!T": {"aggregates": [{"value": 12}, {"value": 150000}]},
    "1_1!T": {"aggregates": [{"value": 15}, {"value": 200000}]},
    "1!T": {"aggregates": [{"value": 27}, {"value": 350000}]},
    "T_0!T": {"aggregates": [{"value": 17}, {"value": 200000}]},
    "T_1!T": {"aggregates": [{"value": 23}, {"value": 280000}]},
    "T!T": {"aggregates": [{"value": 53}, {"value": 610000}]}
  }
}
```

### Understanding Matrix factMap Keys

```
Key Format: {rowIndex}_{colIndex}!{type}

Row Index:
- 0, 1, 2... = Specific row grouping values
- T = Row total (all rows)

Column Index:
- 0, 1, 2... = Specific column grouping values
- T = Column total (all columns)

Examples:
- "0_0!T" = First row, first column intersection
- "0_1!T" = First row, second column intersection
- "0!T" = First row total (across all columns)
- "T_0!T" = Column total for first column (across all rows)
- "T!T" = Grand total (all rows, all columns)

Multi-level example (2 row groupings, 2 column groupings):
- "0_0_0_0!T" = First L1 row, first L2 row, first L1 col, first L2 col
- "0_0_T!T" = First L1 row, first L2 row, all columns
- "T_T!T" = Grand total
```

---

## 4. Metadata API Implementation

### Basic XML Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>Revenue_Matrix_Stage_Quarter</name>
    <description>Revenue by stage and quarter</description>
    <reportType>Opportunity</reportType>
    <format>Matrix</format>
    <showDetails>false</showDetails>

    <!-- Row Groupings (Down) -->
    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>STAGE_NAME</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>

    <!-- Column Groupings (Across) -->
    <groupingsAcross>
        <dateGranularity>Quarter</dateGranularity>
        <field>CLOSE_DATE</field>
        <sortOrder>Asc</sortOrder>
    </groupingsAcross>

    <!-- Detail Columns (shown when drilling down) -->
    <columns>
        <field>OPPORTUNITY_NAME</field>
    </columns>
    <columns>
        <field>ACCOUNT.NAME</field>
    </columns>
    <columns>
        <field>AMOUNT</field>
    </columns>

    <!-- Aggregates (shown in each cell) -->
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
        <developerName>SumAmount</developerName>
        <isActive>true</isActive>
        <masterLabel>Total Revenue</masterLabel>
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

### Multi-Level Matrix XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>Region_Rep_Performance_Matrix</name>
    <reportType>Opportunity</reportType>
    <format>Matrix</format>
    <showDetails>false</showDetails>

    <!-- 2 Row Groupings -->
    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>ACCOUNT.BILLINGSTATE</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>
    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>OWNER_FULL_NAME</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>

    <!-- 2 Column Groupings -->
    <groupingsAcross>
        <dateGranularity>Quarter</dateGranularity>
        <field>CLOSE_DATE</field>
        <sortOrder>Asc</sortOrder>
    </groupingsAcross>
    <groupingsAcross>
        <dateGranularity>None</dateGranularity>
        <field>ISWON</field>
        <sortOrder>Desc</sortOrder>
    </groupingsAcross>

    <columns>
        <field>OPPORTUNITY_NAME</field>
    </columns>
    <columns>
        <field>AMOUNT</field>
    </columns>

    <aggregates>
        <calculatedFormula>AMOUNT:SUM</calculatedFormula>
        <datatype>currency</datatype>
        <developerName>TotalRevenue</developerName>
        <isActive>true</isActive>
        <masterLabel>Revenue</masterLabel>
        <scale>2</scale>
    </aggregates>
    <aggregates>
        <calculatedFormula>RowCount</calculatedFormula>
        <datatype>number</datatype>
        <developerName>DealCount</developerName>
        <isActive>true</isActive>
        <masterLabel>Deals</masterLabel>
        <scale>0</scale>
    </aggregates>

    <scope>organization</scope>
</Report>
```

### Complete Matrix Report XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>Comprehensive_Sales_Matrix</name>
    <description>Full-featured matrix report with all options</description>
    <reportType>Opportunity</reportType>
    <format>Matrix</format>
    <showDetails>true</showDetails>

    <!-- Row Groupings (max 3) -->
    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>TYPE</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>
    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>STAGE_NAME</field>
        <sortOrder>Asc</sortOrder>
        <sortByName>s!AMOUNT</sortByName>
    </groupingsDown>

    <!-- Column Groupings (max 2) -->
    <groupingsAcross>
        <dateGranularity>FiscalQuarter</dateGranularity>
        <field>CLOSE_DATE</field>
        <sortOrder>Asc</sortOrder>
    </groupingsAcross>

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
        <developerName>Count</developerName>
        <isActive>true</isActive>
        <masterLabel>Opps</masterLabel>
        <scale>0</scale>
    </aggregates>
    <aggregates>
        <calculatedFormula>AMOUNT:SUM</calculatedFormula>
        <datatype>currency</datatype>
        <developerName>Revenue</developerName>
        <isActive>true</isActive>
        <masterLabel>Revenue</masterLabel>
        <scale>0</scale>
    </aggregates>
    <aggregates>
        <calculatedFormula>AMOUNT:AVG</calculatedFormula>
        <datatype>currency</datatype>
        <developerName>AvgDeal</developerName>
        <isActive>true</isActive>
        <masterLabel>Avg Deal</masterLabel>
        <scale>0</scale>
    </aggregates>
    <aggregates>
        <calculatedFormula>PROBABILITY:AVG</calculatedFormula>
        <datatype>percent</datatype>
        <developerName>AvgProb</developerName>
        <isActive>true</isActive>
        <masterLabel>Avg Prob</masterLabel>
        <scale>0</scale>
    </aggregates>

    <!-- Filters -->
    <filter>
        <criteriaItems>
            <column>AMOUNT</column>
            <columnToColumn>false</columnToColumn>
            <isUnlocked>true</isUnlocked>
            <operator>greaterThan</operator>
            <value>0</value>
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

## 5. GroupingsDown Configuration

### Row Grouping Requirements

GroupingsDown defines the **rows** in your matrix. Like Summary reports, matrix requires at least one groupingsDown.

**REST API**:

```json
{
  "groupingsDown": [
    {
      "name": "STAGE_NAME",        // Field API name
      "sortOrder": "Asc",          // "Asc" or "Desc"
      "dateGranularity": "None"    // Required for non-date fields
    }
  ]
}
```

### Multi-Level Row Grouping (Max 3)

```json
{
  "groupingsDown": [
    {
      "name": "ACCOUNT.BILLINGCOUNTRY",
      "sortOrder": "Asc",
      "dateGranularity": "None"
    },
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
  ]
}
```

### Sort Rows by Aggregate

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

### Date Field as Row Grouping

```json
{
  "groupingsDown": [
    {
      "name": "CREATED_DATE",
      "sortOrder": "Asc",
      "dateGranularity": "Month"  // Group by month
    }
  ]
}
```

---

## 6. GroupingsAcross Configuration

### Column Grouping Requirements

**CRITICAL**: Matrix format requires at least one groupingsAcross. This distinguishes it from Summary format.

**REST API**:

```json
{
  "groupingsAcross": [
    {
      "name": "CLOSE_DATE",        // Field API name
      "sortOrder": "Asc",          // "Asc" or "Desc"
      "dateGranularity": "Quarter" // Required for date fields
    }
  ]
}
```

### Multi-Level Column Grouping (Max 2)

```json
{
  "groupingsAcross": [
    {
      "name": "CLOSE_DATE",
      "sortOrder": "Asc",
      "dateGranularity": "Quarter"
    },
    {
      "name": "ISWON",
      "sortOrder": "Desc",
      "dateGranularity": "None"
    }
  ]
}
```

### Common Column Grouping Patterns

**Time-Based (Most Common)**:

```json
{
  "groupingsAcross": [
    {
      "name": "CLOSE_DATE",
      "sortOrder": "Asc",
      "dateGranularity": "Month"
    }
  ]
}
```

**Categorical**:

```json
{
  "groupingsAcross": [
    {
      "name": "FORECAST_CATEGORY",
      "sortOrder": "Asc",
      "dateGranularity": "None"
    }
  ]
}
```

**Boolean Split**:

```json
{
  "groupingsAcross": [
    {
      "name": "ISWON",
      "sortOrder": "Desc",  // Won first, then Lost
      "dateGranularity": "None"
    }
  ]
}
```

### Metadata API groupingsAcross

```xml
<!-- Time-based column grouping -->
<groupingsAcross>
    <dateGranularity>Quarter</dateGranularity>
    <field>CLOSE_DATE</field>
    <sortOrder>Asc</sortOrder>
</groupingsAcross>

<!-- Categorical column grouping -->
<groupingsAcross>
    <dateGranularity>None</dateGranularity>
    <field>FORECAST_CATEGORY</field>
    <sortOrder>Asc</sortOrder>
</groupingsAcross>

<!-- Two-level column grouping -->
<groupingsAcross>
    <dateGranularity>FiscalQuarter</dateGranularity>
    <field>CLOSE_DATE</field>
    <sortOrder>Asc</sortOrder>
</groupingsAcross>
<groupingsAcross>
    <dateGranularity>None</dateGranularity>
    <field>ISWON</field>
    <sortOrder>Desc</sortOrder>
</groupingsAcross>
```

---

## 7. Cell Intersections

### Understanding Cell Values

Each cell in a matrix represents the intersection of row and column groupings. The cell contains aggregate values (not individual records).

```
Cell (Stage=Proposal, Quarter=Q2):
├── Records where Stage='Proposal' AND CloseDate is Q2
├── Aggregates:
│   ├── Count: 15
│   ├── Sum(Amount): $450,000
│   └── Avg(Amount): $30,000
```

### Extracting Cell Values from API Response

```javascript
/**
 * Extract matrix cell values from API response
 */
function extractMatrixCells(results) {
  const matrix = [];

  const rowGroupings = results.groupingsDown.groupings;
  const colGroupings = results.groupingsAcross.groupings;
  const factMap = results.factMap;

  // Build matrix structure
  for (let r = 0; r < rowGroupings.length; r++) {
    const row = {
      rowKey: rowGroupings[r].key,
      rowLabel: rowGroupings[r].label,
      cells: []
    };

    for (let c = 0; c < colGroupings.length; c++) {
      const cellKey = `${r}_${c}!T`;
      const cellData = factMap[cellKey];

      row.cells.push({
        colKey: colGroupings[c].key,
        colLabel: colGroupings[c].label,
        aggregates: cellData ? cellData.aggregates : null,
        hasData: !!cellData
      });
    }

    // Add row total
    const rowTotalKey = `${r}!T`;
    row.rowTotal = factMap[rowTotalKey]?.aggregates || null;

    matrix.push(row);
  }

  // Add column totals
  const columnTotals = colGroupings.map((col, c) => {
    const colTotalKey = `T_${c}!T`;
    return {
      colKey: col.key,
      colLabel: col.label,
      aggregates: factMap[colTotalKey]?.aggregates || null
    };
  });

  // Grand total
  const grandTotal = factMap['T!T']?.aggregates || null;

  return {
    matrix,
    columnTotals,
    grandTotal
  };
}
```

### Navigating Multi-Level Cells

For multi-level groupings, cell keys have more indexes:

```javascript
/**
 * Build cell key for multi-level matrix
 * @param {number[]} rowIndexes - Row grouping level indexes
 * @param {number[]} colIndexes - Column grouping level indexes
 * @returns {string} Cell key like "0_1_0_2!T"
 */
function buildCellKey(rowIndexes, colIndexes) {
  const rowPart = rowIndexes.join('_');
  const colPart = colIndexes.join('_');
  return `${rowPart}_${colPart}!T`;
}

// Example: 2 row groupings, 2 column groupings
// Cell at: row L1=0, row L2=1, col L1=0, col L2=2
const cellKey = buildCellKey([0, 1], [0, 2]); // "0_1_0_2!T"
```

---

## 8. Aggregates and Calculations

### Aggregate Configuration

Matrix cells can display multiple aggregates simultaneously.

**REST API**:

```json
{
  "aggregates": [
    {"name": "RowCount"},
    {"name": "s!AMOUNT", "label": "Revenue"},
    {"name": "a!AMOUNT", "label": "Avg Deal"},
    {"name": "mx!CLOSE_DATE", "label": "Latest Close"}
  ]
}
```

### Aggregate Types for Matrix

| Prefix | Type | Best Use Cases |
|--------|------|----------------|
| `RowCount` | Count | Volume analysis |
| `s!` | Sum | Revenue, quantity totals |
| `a!` | Average | Performance metrics |
| `mx!` | Maximum | Latest dates, highest values |
| `m!` | Minimum | Earliest dates, lowest values |

### Calculated Aggregates (Metadata API)

```xml
<!-- Win Rate Calculation -->
<aggregates>
    <calculatedFormula>ISWON:SUM / RowCount</calculatedFormula>
    <datatype>percent</datatype>
    <developerName>WinRate</developerName>
    <isActive>true</isActive>
    <masterLabel>Win Rate</masterLabel>
    <scale>1</scale>
</aggregates>

<!-- Average Deal Size -->
<aggregates>
    <calculatedFormula>AMOUNT:SUM / RowCount</calculatedFormula>
    <datatype>currency</datatype>
    <developerName>AvgDealSize</developerName>
    <isActive>true</isActive>
    <masterLabel>Avg Deal</masterLabel>
    <scale>0</scale>
</aggregates>

<!-- Percentage of Parent -->
<aggregates>
    <calculatedFormula>AMOUNT:SUM / PARENTGROUPVAL(AMOUNT:SUM, STAGE_NAME) * 100</calculatedFormula>
    <datatype>percent</datatype>
    <developerName>PctOfStage</developerName>
    <isActive>true</isActive>
    <masterLabel>% of Stage</masterLabel>
    <scale>1</scale>
</aggregates>
```

### Aggregate Placement in Response

```json
{
  "factMap": {
    "0_0!T": {
      "aggregates": [
        {"label": "5", "value": 5},           // RowCount
        {"label": "$50,000", "value": 50000}, // s!AMOUNT
        {"label": "$10,000", "value": 10000}  // a!AMOUNT
      ]
    }
  }
}
```

**Important**: Aggregates are returned in the same order they're defined in the report metadata.

---

## 9. Sparse Grid Handling

### What is a Sparse Grid?

A **sparse grid** occurs when not all row-column combinations have data. For example:

```
          Q1      Q2      Q3      Q4
Stage A   $10K    -       $15K    -
Stage B   -       $20K    $5K     $30K
Stage C   $8K     -       -       $12K
```

The cells marked `-` are empty (no records match that combination).

### Handling Empty Cells in API Response

```javascript
/**
 * Extract matrix with sparse cell handling
 */
function extractSparseMatrix(results) {
  const rowGroupings = results.groupingsDown.groupings;
  const colGroupings = results.groupingsAcross.groupings;
  const factMap = results.factMap;

  const matrix = [];

  for (let r = 0; r < rowGroupings.length; r++) {
    const row = {
      label: rowGroupings[r].label,
      cells: []
    };

    for (let c = 0; c < colGroupings.length; c++) {
      const cellKey = `${r}_${c}!T`;
      const cellData = factMap[cellKey];

      if (cellData && cellData.aggregates) {
        row.cells.push({
          columnLabel: colGroupings[c].label,
          value: cellData.aggregates[0].value,
          formatted: cellData.aggregates[0].label,
          isEmpty: false
        });
      } else {
        // Empty cell - no data for this combination
        row.cells.push({
          columnLabel: colGroupings[c].label,
          value: 0,
          formatted: '-',
          isEmpty: true
        });
      }
    }

    matrix.push(row);
  }

  return matrix;
}
```

### Best Practices for Sparse Grids

**1. Add Appropriate Filters**

Reduce empty cells by filtering to relevant data:

```json
{
  "reportFilters": [
    {
      "column": "AMOUNT",
      "filterType": "greaterThan",
      "value": "0"
    }
  ]
}
```

**2. Choose Appropriate Granularity**

Coarser granularity = fewer empty cells:

```json
// More sparse (many empty cells)
{"dateGranularity": "Day"}

// Less sparse (fewer empty cells)
{"dateGranularity": "Quarter"}
```

**3. Limit Grouping Cardinality**

High-cardinality fields create sparse grids:

```
❌ Grouping by: Individual Account Name (10,000 values)
✅ Grouping by: Account Industry (20 values)
```

**4. Use Conditional Formatting**

In dashboard visualization, handle empty cells gracefully:

```javascript
// Display logic
function formatCellValue(cell) {
  if (cell.isEmpty) {
    return '-'; // or 'N/A' or ''
  }
  return formatCurrency(cell.value);
}
```

---

## 10. MCP Tool Usage

### Create Matrix Report

```javascript
// Create matrix report using MCP
const report = await mcp_salesforce_report_create({
  name: "Stage_Quarter_Matrix",
  folder: "Sales_Analytics",
  format: "MATRIX",
  reportType: "Opportunity",
  groupingsDown: [
    {
      field: "STAGE_NAME",
      sortOrder: "Asc",
      dateGranularity: "None"
    }
  ],
  groupingsAcross: [
    {
      field: "CLOSE_DATE",
      sortOrder: "Asc",
      dateGranularity: "Quarter"
    }
  ],
  columns: [
    "OPPORTUNITY_NAME",
    "AMOUNT"
  ],
  aggregates: [
    { type: "RowCount" },
    { type: "SUM", field: "AMOUNT", label: "Revenue" },
    { type: "AVG", field: "AMOUNT", label: "Avg Deal" }
  ],
  dateFilter: {
    column: "CLOSE_DATE",
    duration: "THIS_FISCAL_YEAR"
  }
});
```

### Multi-Dimensional Matrix

```javascript
const report = await mcp_salesforce_report_create({
  name: "Territory_Performance_Matrix",
  folder: "Executive_Reports",
  format: "MATRIX",
  reportType: "Opportunity",
  groupingsDown: [
    { field: "ACCOUNT.BILLINGSTATE", sortOrder: "Asc" },
    { field: "OWNER_FULL_NAME", sortOrder: "Asc" }
  ],
  groupingsAcross: [
    { field: "CLOSE_DATE", sortOrder: "Asc", dateGranularity: "FiscalQuarter" },
    { field: "ISWON", sortOrder: "Desc" }
  ],
  aggregates: [
    { type: "SUM", field: "AMOUNT" },
    { type: "RowCount" }
  ],
  filters: [
    { field: "ISCLOSED", operator: "equals", value: "true" }
  ]
});
```

### Run and Extract Matrix Data

```javascript
// Run report
const results = await mcp_salesforce_report_run({
  reportId: report.id
});

// Extract structured matrix data
const matrixData = extractMatrixCells(results);

// Display as table
console.log('\nMatrix Report Results:');
console.log('='.repeat(60));

// Header row
const headers = ['', ...matrixData.columnTotals.map(c => c.colLabel), 'Total'];
console.log(headers.join('\t'));

// Data rows
for (const row of matrixData.matrix) {
  const cells = row.cells.map(c =>
    c.hasData ? formatCurrency(c.aggregates[1].value) : '-'
  );
  const rowTotal = row.rowTotal ? formatCurrency(row.rowTotal[1].value) : '-';
  console.log([row.rowLabel, ...cells, rowTotal].join('\t'));
}

// Column totals
const colTotals = matrixData.columnTotals.map(c =>
  c.aggregates ? formatCurrency(c.aggregates[1].value) : '-'
);
const grandTotal = matrixData.grandTotal ?
  formatCurrency(matrixData.grandTotal[1].value) : '-';
console.log(['Total', ...colTotals, grandTotal].join('\t'));
```

---

## 11. Best Practices

### Row/Column Selection

**DO**:
```
✅ Put time dimension across (columns) for trend analysis
✅ Put categorical dimension down (rows) for comparison
✅ Limit grouping levels to 2 down, 1 across for readability
✅ Use meaningful date granularity (Quarter, Month)
```

**DON'T**:
```
❌ Group by high-cardinality fields (too many cells)
❌ Use Day granularity for long time periods
❌ Include grouping fields in detailColumns
❌ Use 3 down + 2 across (too complex)
```

### Aggregate Selection

**DO**:
```
✅ Include RowCount for context
✅ Choose 2-3 key metrics per cell
✅ Use appropriate data types (currency, percent)
✅ Match aggregates to business questions
```

**DON'T**:
```
❌ Include more than 4 aggregates per cell
❌ Use SUM on percentage fields
❌ Create redundant calculations
❌ Mix incompatible aggregates
```

### Performance Optimization

| Optimization | Impact | Implementation |
|--------------|--------|----------------|
| Limit groupings | High | Use 2 down + 1 across |
| Coarser date granularity | High | Quarter instead of Month |
| Add filters | High | Reduce base record set |
| Hide detail rows | Medium | Set hasDetailRows=false |
| Limit aggregates | Medium | 2-3 per cell maximum |

### Common Matrix Patterns

**Pattern 1: Time Trend by Category**
```
Down: Category (Stage, Type, Owner)
Across: Time (Quarter, Month)
Aggregates: Revenue, Count
```

**Pattern 2: Win/Loss Analysis**
```
Down: Category (Stage, Source)
Across: Won/Lost
Aggregates: Count, Revenue, Avg
```

**Pattern 3: Geographic Performance**
```
Down: Region (Country, State)
Across: Time or Product
Aggregates: Revenue, Count
```

**Pattern 4: Forecast Accuracy**
```
Down: Stage
Across: Forecast Category
Aggregates: Revenue, Count
```

---

## 12. Common Errors and Fixes

### Error: "Matrix reports require at least one column grouping"

**Cause**: No groupingsAcross defined

**Fix**:
```json
// ❌ Missing groupingsAcross
{
  "reportFormat": "MATRIX",
  "groupingsDown": [{"name": "STAGE_NAME"}]
}

// ✅ Add groupingsAcross
{
  "reportFormat": "MATRIX",
  "groupingsDown": [{"name": "STAGE_NAME"}],
  "groupingsAcross": [{"name": "CLOSE_DATE", "dateGranularity": "Quarter"}]
}
```

### Error: "Maximum column groupings exceeded"

**Cause**: More than 2 groupingsAcross

**Fix**: Reduce to maximum 2 column grouping levels

```json
// ❌ Too many groupingsAcross
{
  "groupingsAcross": [
    {"name": "CLOSE_DATE", "dateGranularity": "Quarter"},
    {"name": "ISWON"},
    {"name": "TYPE"}  // Third one - not allowed!
  ]
}

// ✅ Maximum 2 levels
{
  "groupingsAcross": [
    {"name": "CLOSE_DATE", "dateGranularity": "Quarter"},
    {"name": "ISWON"}
  ]
}
```

### Error: "Invalid date granularity"

**Cause**: Date granularity on non-date field, or missing for date field

**Fix**:
```json
// ❌ Non-date field with granularity
{
  "name": "STAGE_NAME",
  "dateGranularity": "Month"  // Wrong!
}

// ✅ Non-date field
{
  "name": "STAGE_NAME",
  "dateGranularity": "None"
}

// ❌ Date field without granularity
{
  "name": "CLOSE_DATE",
  "dateGranularity": "None"  // Will create too many columns
}

// ✅ Date field with appropriate granularity
{
  "name": "CLOSE_DATE",
  "dateGranularity": "Quarter"
}
```

### Error: "Report too complex"

**Cause**: Too many cells (row groupings × column groupings × aggregates)

**Fix**:
1. Reduce grouping levels
2. Add filters to reduce data
3. Use coarser date granularity
4. Split into multiple reports

```json
// ❌ Too complex - creates thousands of cells
{
  "groupingsDown": [
    {"name": "ACCOUNT.NAME"},     // 1000+ accounts
    {"name": "STAGE_NAME"},       // 10 stages
    {"name": "OWNER_FULL_NAME"}   // 50 users
  ],
  "groupingsAcross": [
    {"name": "CLOSE_DATE", "dateGranularity": "Day"}  // 365 days
  ]
}
// = 1000 × 10 × 50 × 365 = 182,500,000 potential cells!

// ✅ Simplified - reasonable cell count
{
  "groupingsDown": [
    {"name": "ACCOUNT.TYPE"},     // 5 types
    {"name": "STAGE_NAME"}        // 10 stages
  ],
  "groupingsAcross": [
    {"name": "CLOSE_DATE", "dateGranularity": "Quarter"}  // 4 quarters
  ]
}
// = 5 × 10 × 4 = 200 cells (manageable)
```

### Empty Cells Showing as Errors

**Cause**: Expecting all cells to have data

**Fix**: Handle sparse grids gracefully in code

```javascript
// Check for cell existence before accessing
const cellKey = '0_0!T';
const cellData = factMap[cellKey];

if (cellData && cellData.aggregates) {
  // Cell has data
  console.log(cellData.aggregates[0].value);
} else {
  // Empty cell - no records for this combination
  console.log('No data');
}
```

---

## 13. Complete Examples

### Example 1: Revenue by Stage and Quarter

**Use Case**: Track pipeline progression across quarters

**REST API**:

```json
{
  "reportMetadata": {
    "name": "Pipeline_Stage_Quarter_Matrix",
    "reportFormat": "MATRIX",
    "reportType": {"type": "Opportunity"},
    "groupingsDown": [
      {
        "name": "STAGE_NAME",
        "sortOrder": "Asc",
        "dateGranularity": "None"
      }
    ],
    "groupingsAcross": [
      {
        "name": "CLOSE_DATE",
        "sortOrder": "Asc",
        "dateGranularity": "FiscalQuarter"
      }
    ],
    "detailColumns": [
      "OPPORTUNITY_NAME",
      "ACCOUNT.NAME",
      "AMOUNT"
    ],
    "aggregates": [
      {"name": "RowCount"},
      {"name": "s!AMOUNT", "label": "Total Revenue"},
      {"name": "a!AMOUNT", "label": "Avg Deal"}
    ],
    "reportFilters": [
      {"column": "AMOUNT", "filterType": "greaterThan", "value": "0"}
    ],
    "standardDateFilter": {
      "column": "CLOSE_DATE",
      "durationValue": "THIS_FISCAL_YEAR"
    },
    "hasDetailRows": false
  }
}
```

**Metadata API**:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>Pipeline_Stage_Quarter_Matrix</name>
    <reportType>Opportunity</reportType>
    <format>Matrix</format>
    <showDetails>false</showDetails>

    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>STAGE_NAME</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>

    <groupingsAcross>
        <dateGranularity>FiscalQuarter</dateGranularity>
        <field>CLOSE_DATE</field>
        <sortOrder>Asc</sortOrder>
    </groupingsAcross>

    <columns>
        <field>OPPORTUNITY_NAME</field>
    </columns>
    <columns>
        <field>ACCOUNT.NAME</field>
    </columns>
    <columns>
        <field>AMOUNT</field>
    </columns>

    <aggregates>
        <calculatedFormula>RowCount</calculatedFormula>
        <datatype>number</datatype>
        <developerName>Count</developerName>
        <isActive>true</isActive>
        <masterLabel>Opps</masterLabel>
        <scale>0</scale>
    </aggregates>
    <aggregates>
        <calculatedFormula>AMOUNT:SUM</calculatedFormula>
        <datatype>currency</datatype>
        <developerName>Revenue</developerName>
        <isActive>true</isActive>
        <masterLabel>Revenue</masterLabel>
        <scale>0</scale>
    </aggregates>
    <aggregates>
        <calculatedFormula>AMOUNT:AVG</calculatedFormula>
        <datatype>currency</datatype>
        <developerName>AvgDeal</developerName>
        <isActive>true</isActive>
        <masterLabel>Avg Deal</masterLabel>
        <scale>0</scale>
    </aggregates>

    <filter>
        <criteriaItems>
            <column>AMOUNT</column>
            <columnToColumn>false</columnToColumn>
            <isUnlocked>true</isUnlocked>
            <operator>greaterThan</operator>
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

### Example 2: Win/Loss Analysis by Source

**Use Case**: Compare conversion rates across lead sources

**REST API**:

```json
{
  "reportMetadata": {
    "name": "Win_Loss_by_Source",
    "reportFormat": "MATRIX",
    "reportType": {"type": "Opportunity"},
    "groupingsDown": [
      {
        "name": "LEAD_SOURCE",
        "sortOrder": "Asc",
        "dateGranularity": "None"
      }
    ],
    "groupingsAcross": [
      {
        "name": "ISWON",
        "sortOrder": "Desc",
        "dateGranularity": "None"
      }
    ],
    "aggregates": [
      {"name": "RowCount"},
      {"name": "s!AMOUNT"},
      {"name": "a!AMOUNT"}
    ],
    "reportFilters": [
      {"column": "ISCLOSED", "filterType": "equals", "value": "true"}
    ],
    "standardDateFilter": {
      "column": "CLOSE_DATE",
      "durationValue": "THIS_FISCAL_YEAR"
    }
  }
}
```

### Example 3: Territory Performance Matrix

**Use Case**: Multi-level analysis of regional performance

**REST API**:

```json
{
  "reportMetadata": {
    "name": "Territory_Performance_Matrix",
    "reportFormat": "MATRIX",
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
    "groupingsAcross": [
      {
        "name": "CLOSE_DATE",
        "sortOrder": "Asc",
        "dateGranularity": "Quarter"
      },
      {
        "name": "ISWON",
        "sortOrder": "Desc",
        "dateGranularity": "None"
      }
    ],
    "aggregates": [
      {"name": "s!AMOUNT"},
      {"name": "RowCount"}
    ],
    "reportFilters": [
      {"column": "ISCLOSED", "filterType": "equals", "value": "true"}
    ]
  }
}
```

### Example 4: Case Volume Heat Map

**Use Case**: Visualize case distribution by priority and month

**Metadata API**:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>Case_Volume_Heat_Map</name>
    <reportType>CaseList</reportType>
    <format>Matrix</format>
    <showDetails>false</showDetails>

    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>PRIORITY</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>

    <groupingsAcross>
        <dateGranularity>Month</dateGranularity>
        <field>CREATED_DATEONLY</field>
        <sortOrder>Asc</sortOrder>
    </groupingsAcross>

    <columns>
        <field>CASE_NUMBER</field>
    </columns>
    <columns>
        <field>SUBJECT</field>
    </columns>

    <aggregates>
        <calculatedFormula>RowCount</calculatedFormula>
        <datatype>number</datatype>
        <developerName>CaseCount</developerName>
        <isActive>true</isActive>
        <masterLabel>Cases</masterLabel>
        <scale>0</scale>
    </aggregates>

    <timeFrameFilter>
        <dateColumn>CREATED_DATEONLY</dateColumn>
        <interval>INTERVAL_CURFY</interval>
    </timeFrameFilter>

    <scope>organization</scope>
</Report>
```

---

## Related Runbooks

- **Previous**: [Runbook 03: Summary Reports](03-summary-reports.md) - Single-dimension grouping
- **Next**: [Runbook 05: Joined Reports Basics](05-joined-reports-basics.md) - Multi-block architecture
- **Format Selection**: [Runbook 01: Report Formats Fundamentals](01-report-formats-fundamentals.md) - Choosing the right format
- **Validation**: [Runbook 08: Validation & Deployment](08-validation-deployment.md) - Pre-deployment checks

---

**Last Updated**: November 26, 2025
**Maintained By**: Salesforce Plugin Team
**Plugin Version**: v3.51.0
