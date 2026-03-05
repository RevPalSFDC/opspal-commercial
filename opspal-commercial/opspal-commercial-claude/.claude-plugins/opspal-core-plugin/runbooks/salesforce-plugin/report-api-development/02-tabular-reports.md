# Runbook 02: Tabular Reports

**Version**: v3.51.0
**Last Updated**: November 26, 2025
**Status**: Complete

---

## Table of Contents

1. [Overview](#1-overview)
2. [When to Use Tabular Format](#2-when-to-use-tabular-format)
3. [REST API Implementation](#3-rest-api-implementation)
4. [Metadata API Implementation](#4-metadata-api-implementation)
5. [Column Configuration](#5-column-configuration)
6. [Filter Configuration](#6-filter-configuration)
7. [Dashboard Integration](#7-dashboard-integration)
8. [Export Optimization](#8-export-optimization)
9. [MCP Tool Usage](#9-mcp-tool-usage)
10. [Best Practices](#10-best-practices)
11. [Common Errors and Fixes](#11-common-errors-and-fixes)
12. [Complete Examples](#12-complete-examples)

---

## 1. Overview

### What is a Tabular Report?

A **Tabular report** is the simplest Salesforce report format, displaying data as a flat list of records in rows and columns - similar to a spreadsheet. Each row represents one record, and each column represents one field.

### Key Characteristics

| Characteristic | Value |
|---------------|-------|
| Format Name | `TABULAR` |
| Groupings (Down) | 0 |
| Groupings (Across) | 0 |
| Aggregates | None (row count only) |
| Maximum Rows (API) | 50,000 |
| Maximum Columns | No hard limit (15 recommended) |
| Dashboard Support | Yes (top N records) |
| Export Support | Excellent (preserves all rows) |

### Tabular Format Structure

```
┌────────────────────────────────────────────────────────┐
│ TABULAR REPORT                                         │
├─────────────┬─────────────┬─────────────┬─────────────┤
│ Column 1    │ Column 2    │ Column 3    │ Column 4    │
├─────────────┼─────────────┼─────────────┼─────────────┤
│ Record 1    │ Value       │ Value       │ Value       │
├─────────────┼─────────────┼─────────────┼─────────────┤
│ Record 2    │ Value       │ Value       │ Value       │
├─────────────┼─────────────┼─────────────┼─────────────┤
│ Record 3    │ Value       │ Value       │ Value       │
├─────────────┼─────────────┼─────────────┼─────────────┤
│ ...         │ ...         │ ...         │ ...         │
└─────────────┴─────────────┴─────────────┴─────────────┘
Grand Total: Row Count
```

---

## 2. When to Use Tabular Format

### Ideal Use Cases

**1. Data Exports**
```
✅ Large data exports (>2,000 rows)
✅ Backup snapshots
✅ Feed data to external systems
✅ Compliance data extracts
```

**2. Simple Lists**
```
✅ Task lists for users
✅ Activity logs
✅ Quick record lookups
✅ Data verification reports
```

**3. Dashboard Components**
```
✅ Top 10 lists
✅ Recent records
✅ Next actions
✅ Priority queues
```

**4. Fallback from Summary**
```
✅ When Summary format truncates at 2,000 rows
✅ When groupings aren't essential
✅ When raw data is more valuable than aggregates
```

### When NOT to Use Tabular

| Scenario | Use Instead | Reason |
|----------|-------------|--------|
| Need subtotals | SUMMARY | Tabular can't aggregate by group |
| Need pivot analysis | MATRIX | Tabular is one-dimensional |
| Compare multiple sources | JOINED | Tabular has single report type |
| Need SUM/AVG/MAX | SUMMARY/MATRIX | Tabular only counts rows |

### Decision Flowchart

```
Need a report?
│
├─ Need groupings/subtotals?
│  ├─ YES → Summary/Matrix/Joined
│  └─ NO → Continue
│
├─ Just need a list of records?
│  ├─ YES → TABULAR ✓
│  └─ NO → Continue
│
├─ Will exceed 2,000 rows?
│  ├─ YES → TABULAR (mandatory) ✓
│  └─ NO → Summary acceptable
│
└─ Primary purpose is export?
   ├─ YES → TABULAR ✓
   └─ NO → Evaluate Summary
```

---

## 3. REST API Implementation

### Base JSON Structure

```json
{
  "reportMetadata": {
    "name": "My_Tabular_Report",
    "reportFormat": "TABULAR",
    "reportType": {
      "type": "Opportunity"
    },
    "detailColumns": [
      "OPPORTUNITY_NAME",
      "ACCOUNT.NAME",
      "AMOUNT",
      "CLOSE_DATE",
      "STAGE_NAME"
    ],
    "reportFilters": [],
    "standardDateFilter": {
      "column": "CLOSE_DATE",
      "durationValue": "THIS_FISCAL_QUARTER",
      "startDate": null,
      "endDate": null
    },
    "reportBooleanFilter": null,
    "sortBy": [
      {
        "sortColumn": "CLOSE_DATE",
        "sortOrder": "Desc"
      }
    ],
    "topRows": null
  }
}
```

### Create Report via REST API

**Endpoint**: `POST /services/data/v62.0/analytics/reports`

```bash
# Create a new tabular report
curl -X POST \
  "https://yourinstance.salesforce.com/services/data/v62.0/analytics/reports" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reportMetadata": {
      "name": "Q4_Opportunities_Export",
      "reportFormat": "TABULAR",
      "reportType": {
        "type": "Opportunity"
      },
      "detailColumns": [
        "OPPORTUNITY_NAME",
        "ACCOUNT.NAME",
        "AMOUNT",
        "CLOSE_DATE",
        "STAGE_NAME",
        "OWNER_FULL_NAME"
      ],
      "standardDateFilter": {
        "column": "CLOSE_DATE",
        "durationValue": "THIS_FISCAL_QUARTER"
      },
      "sortBy": [
        {
          "sortColumn": "AMOUNT",
          "sortOrder": "Desc"
        }
      ]
    }
  }'
```

### Run Report and Get Data

**Endpoint**: `POST /services/data/v62.0/analytics/reports/{reportId}`

```bash
# Run report and get results
curl -X POST \
  "https://yourinstance.salesforce.com/services/data/v62.0/analytics/reports/00O5f000004XXXX" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

**Response Structure**:

```json
{
  "attributes": {
    "describeUrl": "/services/data/v62.0/analytics/reports/00O5f000004XXXX/describe",
    "instancesUrl": "/services/data/v62.0/analytics/reports/00O5f000004XXXX/instances",
    "type": "Report"
  },
  "reportMetadata": {
    "name": "Q4_Opportunities_Export",
    "reportFormat": "TABULAR",
    "detailColumns": ["OPPORTUNITY_NAME", "ACCOUNT.NAME", "AMOUNT", "CLOSE_DATE", "STAGE_NAME"]
  },
  "reportExtendedMetadata": {
    "detailColumnInfo": {
      "OPPORTUNITY_NAME": {
        "label": "Opportunity Name",
        "dataType": "string"
      },
      "AMOUNT": {
        "label": "Amount",
        "dataType": "currency"
      }
    }
  },
  "factMap": {
    "T!T": {
      "rows": [
        {
          "dataCells": [
            {"label": "Acme Corp - Renewal", "value": "Acme Corp - Renewal"},
            {"label": "Acme Corp", "value": "001XXXXXXXXXXXX"},
            {"label": "$150,000.00", "value": 150000},
            {"label": "12/15/2025", "value": "2025-12-15"},
            {"label": "Negotiation", "value": "Negotiation"}
          ]
        },
        {
          "dataCells": [
            {"label": "Beta Inc - Expansion", "value": "Beta Inc - Expansion"},
            {"label": "Beta Inc", "value": "001XXXXXXXXXXXX"},
            {"label": "$95,000.00", "value": 95000},
            {"label": "12/20/2025", "value": "2025-12-20"},
            {"label": "Proposal", "value": "Proposal"}
          ]
        }
      ],
      "aggregates": [
        {"label": "2", "value": 2}
      ]
    }
  },
  "allData": true,
  "hasDetailRows": true
}
```

### Clone Existing Report

```bash
# Clone an existing report and modify
curl -X POST \
  "https://yourinstance.salesforce.com/services/data/v62.0/analytics/reports?cloneId=00O5f000004XXXX" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reportMetadata": {
      "name": "Q4_Opportunities_Clone",
      "reportFilters": [
        {
          "column": "STAGE_NAME",
          "filterType": "equals",
          "value": "Closed Won"
        }
      ]
    }
  }'
```

### Update Existing Report

```bash
# Update report with new columns
curl -X PATCH \
  "https://yourinstance.salesforce.com/services/data/v62.0/analytics/reports/00O5f000004XXXX" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reportMetadata": {
      "detailColumns": [
        "OPPORTUNITY_NAME",
        "ACCOUNT.NAME",
        "AMOUNT",
        "CLOSE_DATE",
        "STAGE_NAME",
        "PROBABILITY",
        "NEXT_STEP"
      ]
    }
  }'
```

---

## 4. Metadata API Implementation

### Basic XML Structure

**File**: `force-app/main/default/reports/MyFolder/My_Tabular_Report.report-meta.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>My_Tabular_Report</name>
    <description>Tabular report for opportunity export</description>
    <reportType>Opportunity</reportType>
    <format>Tabular</format>
    <showDetails>true</showDetails>

    <!-- Columns -->
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
        <field>STAGE_NAME</field>
    </columns>

    <!-- Filters -->
    <filter>
        <criteriaItems>
            <column>STAGE_NAME</column>
            <columnToColumn>false</columnToColumn>
            <isUnlocked>true</isUnlocked>
            <operator>equals</operator>
            <value>Prospecting,Qualification,Needs Analysis</value>
        </criteriaItems>
    </filter>

    <!-- Date Filter -->
    <timeFrameFilter>
        <dateColumn>CLOSE_DATE</dateColumn>
        <interval>INTERVAL_CURFY</interval>
    </timeFrameFilter>

    <!-- Sort -->
    <sortColumn>CLOSE_DATE</sortColumn>
    <sortOrder>Desc</sortOrder>

    <!-- Scope -->
    <scope>organization</scope>
</Report>
```

### Folder Structure

```
force-app/
└── main/
    └── default/
        └── reports/
            ├── MyFolder/
            │   ├── My_Tabular_Report.report-meta.xml
            │   └── Another_Report.report-meta.xml
            └── MyFolder-meta.xml
```

**Folder Metadata**: `MyFolder-meta.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ReportFolder xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>MyFolder</name>
    <accessType>Public</accessType>
    <publicFolderAccess>ReadWrite</publicFolderAccess>
</ReportFolder>
```

### Deploy via Metadata API

**Using SF CLI**:

```bash
# Deploy single report
sf project deploy start \
  --source-dir force-app/main/default/reports/MyFolder/My_Tabular_Report.report-meta.xml \
  --target-org production

# Deploy entire folder
sf project deploy start \
  --source-dir force-app/main/default/reports/MyFolder \
  --target-org production

# Deploy with dry-run
sf project deploy start \
  --source-dir force-app/main/default/reports/MyFolder \
  --target-org production \
  --dry-run
```

### Package.xml for Retrieval

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>MyFolder</members>
        <members>MyFolder/My_Tabular_Report</members>
        <name>Report</name>
    </types>
    <types>
        <members>MyFolder</members>
        <name>ReportFolder</name>
    </types>
    <version>62.0</version>
</Package>
```

```bash
# Retrieve reports
sf project retrieve start \
  --manifest package.xml \
  --target-org production \
  --output-dir retrieved
```

### Complete XML Example with All Options

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>Comprehensive_Tabular_Report</name>
    <description>Full-featured tabular report example</description>
    <reportType>Opportunity</reportType>
    <format>Tabular</format>
    <showDetails>true</showDetails>

    <!-- Column Definitions with Display Options -->
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
        <field>CLOSE_DATE</field>
    </columns>
    <columns>
        <field>STAGE_NAME</field>
    </columns>
    <columns>
        <field>TYPE</field>
    </columns>
    <columns>
        <field>OWNER_FULL_NAME</field>
    </columns>
    <columns>
        <field>CREATED_DATE</field>
    </columns>
    <columns>
        <field>LAST_UPDATE</field>
    </columns>

    <!-- Multi-Criteria Filter -->
    <filter>
        <booleanFilter>1 AND (2 OR 3) AND 4</booleanFilter>
        <criteriaItems>
            <column>AMOUNT</column>
            <columnToColumn>false</columnToColumn>
            <isUnlocked>true</isUnlocked>
            <operator>greaterThan</operator>
            <value>10000</value>
        </criteriaItems>
        <criteriaItems>
            <column>STAGE_NAME</column>
            <columnToColumn>false</columnToColumn>
            <isUnlocked>true</isUnlocked>
            <operator>equals</operator>
            <value>Qualification,Needs Analysis</value>
        </criteriaItems>
        <criteriaItems>
            <column>STAGE_NAME</column>
            <columnToColumn>false</columnToColumn>
            <isUnlocked>true</isUnlocked>
            <operator>equals</operator>
            <value>Proposal,Negotiation</value>
        </criteriaItems>
        <criteriaItems>
            <column>ACCOUNT.TYPE</column>
            <columnToColumn>false</columnToColumn>
            <isUnlocked>true</isUnlocked>
            <operator>notEqual</operator>
            <value>Competitor</value>
        </criteriaItems>
    </filter>

    <!-- Date Filter -->
    <timeFrameFilter>
        <dateColumn>CLOSE_DATE</dateColumn>
        <interval>INTERVAL_CURFY</interval>
    </timeFrameFilter>

    <!-- Sorting -->
    <sortColumn>AMOUNT</sortColumn>
    <sortOrder>Desc</sortOrder>

    <!-- Scope -->
    <scope>organization</scope>

    <!-- Currency Display -->
    <currency>USD</currency>

    <!-- Division (if enabled) -->
    <!-- <division>Global</division> -->
</Report>
```

---

## 5. Column Configuration

### Field Name Formats

**Standard Fields** (use API name directly):

```json
{
  "detailColumns": [
    "OPPORTUNITY_NAME",      // Standard object name field
    "AMOUNT",                // Standard currency field
    "CLOSE_DATE",            // Standard date field
    "STAGE_NAME",            // Standard picklist
    "PROBABILITY",           // Standard percent
    "CREATED_DATE",          // System field
    "LAST_UPDATE",           // System field
    "OWNER_FULL_NAME"        // Owner lookup field
  ]
}
```

**Related Object Fields** (use dot notation):

```json
{
  "detailColumns": [
    "ACCOUNT.NAME",                  // Parent account name
    "ACCOUNT.INDUSTRY",              // Parent account industry
    "ACCOUNT.BILLINGCITY",           // Parent account address
    "ACCOUNT.OWNER_NAME",            // Account owner
    "CONTACT.NAME",                  // Primary contact
    "CONTACT.EMAIL",                 // Contact email
    "ACCOUNT.PARENT.NAME"            // Grandparent account
  ]
}
```

**Custom Fields** (include __c suffix):

```json
{
  "detailColumns": [
    "Custom_Field__c",               // Custom field on main object
    "ACCOUNT.Custom_Account__c",     // Custom field on parent
    "Lookup__r.Field__c"             // Custom lookup relationship
  ]
}
```

### Discovering Available Columns

**Step 1: Get Report Type Metadata**

```bash
# Using MCP tool
mcp_salesforce_report_type_describe --report_type "Opportunity"

# Using REST API
curl -X GET \
  "https://yourinstance.salesforce.com/services/data/v62.0/analytics/reportTypes/Opportunity" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response Structure**:

```json
{
  "reportTypeMetadata": {
    "reportTypeCategories": [
      {
        "label": "Opportunity Information",
        "columns": [
          {
            "name": "OPPORTUNITY_NAME",
            "label": "Opportunity Name",
            "dataType": "string"
          },
          {
            "name": "AMOUNT",
            "label": "Amount",
            "dataType": "currency"
          }
        ]
      },
      {
        "label": "Account Information",
        "columns": [
          {
            "name": "ACCOUNT.NAME",
            "label": "Account Name",
            "dataType": "string"
          }
        ]
      }
    ]
  }
}
```

### Column Order and Selection

**Best Practices**:

1. **Lead with identifiers** (Name, ID fields)
2. **Group related fields** (Account fields together)
3. **Limit to 15 columns** for readability
4. **Include date fields** for filtering context

**Example Optimized Column Order**:

```json
{
  "detailColumns": [
    // Identification
    "OPPORTUNITY_NAME",
    "ACCOUNT.NAME",

    // Key Metrics
    "AMOUNT",
    "PROBABILITY",
    "EXPECTED_REVENUE",

    // Status
    "STAGE_NAME",
    "FORECAST_CATEGORY",

    // Timeline
    "CLOSE_DATE",
    "CREATED_DATE",
    "LAST_ACTIVITY_DATE",

    // Ownership
    "OWNER_FULL_NAME",

    // Additional Context
    "TYPE",
    "LEAD_SOURCE",
    "NEXT_STEP"
  ]
}
```

---

## 6. Filter Configuration

### Filter Types and Operators

| Operator | API Value | Use Case | Example |
|----------|-----------|----------|---------|
| Equals | `equals` | Exact match | Stage = "Closed Won" |
| Not Equal | `notEqual` | Exclusion | Type != "Competitor" |
| Less Than | `lessThan` | Number/Date comparison | Amount < 10000 |
| Greater Than | `greaterThan` | Number/Date comparison | Amount > 10000 |
| Less or Equal | `lessOrEqual` | Range boundary | Probability <= 50 |
| Greater or Equal | `greaterOrEqual` | Range boundary | Probability >= 75 |
| Contains | `contains` | Partial text match | Name contains "Corp" |
| Not Contain | `notContain` | Exclusion | Name not contains "Test" |
| Starts With | `startsWith` | Prefix match | Name starts with "A" |
| Includes | `includes` | Multi-select picklist | Products includes "X" |
| Excludes | `excludes` | Multi-select exclusion | Products excludes "Y" |

### REST API Filter Configuration

**Simple Filters**:

```json
{
  "reportMetadata": {
    "reportFilters": [
      {
        "column": "STAGE_NAME",
        "filterType": "equals",
        "value": "Closed Won"
      },
      {
        "column": "AMOUNT",
        "filterType": "greaterThan",
        "value": "10000"
      }
    ]
  }
}
```

**Multi-Value Filters**:

```json
{
  "reportMetadata": {
    "reportFilters": [
      {
        "column": "STAGE_NAME",
        "filterType": "equals",
        "value": "Qualification,Needs Analysis,Proposal"
      }
    ]
  }
}
```

**Boolean Filter Logic**:

```json
{
  "reportMetadata": {
    "reportFilters": [
      {
        "column": "AMOUNT",
        "filterType": "greaterThan",
        "value": "50000"
      },
      {
        "column": "STAGE_NAME",
        "filterType": "equals",
        "value": "Negotiation"
      },
      {
        "column": "STAGE_NAME",
        "filterType": "equals",
        "value": "Closed Won"
      }
    ],
    "reportBooleanFilter": "1 AND (2 OR 3)"
  }
}
```

### Metadata API Filter Configuration

```xml
<filter>
    <booleanFilter>1 AND (2 OR 3) AND 4</booleanFilter>
    <criteriaItems>
        <column>AMOUNT</column>
        <columnToColumn>false</columnToColumn>
        <isUnlocked>true</isUnlocked>
        <operator>greaterThan</operator>
        <value>50000</value>
    </criteriaItems>
    <criteriaItems>
        <column>STAGE_NAME</column>
        <columnToColumn>false</columnToColumn>
        <isUnlocked>true</isUnlocked>
        <operator>equals</operator>
        <value>Negotiation,Closed Won</value>
    </criteriaItems>
    <criteriaItems>
        <column>TYPE</column>
        <columnToColumn>false</columnToColumn>
        <isUnlocked>true</isUnlocked>
        <operator>equals</operator>
        <value>New Business,Expansion</value>
    </criteriaItems>
    <criteriaItems>
        <column>ISCLOSED</column>
        <columnToColumn>false</columnToColumn>
        <isUnlocked>false</isUnlocked>
        <operator>equals</operator>
        <value>0</value>
    </criteriaItems>
</filter>
```

### Standard Date Filter Options

**REST API Date Filters**:

```json
{
  "reportMetadata": {
    "standardDateFilter": {
      "column": "CLOSE_DATE",
      "durationValue": "THIS_FISCAL_QUARTER",
      "startDate": null,
      "endDate": null
    }
  }
}
```

**Available Duration Values**:

| Value | Description |
|-------|-------------|
| `THIS_WEEK` | Current week |
| `LAST_WEEK` | Previous week |
| `THIS_MONTH` | Current month |
| `LAST_MONTH` | Previous month |
| `THIS_QUARTER` | Current quarter |
| `LAST_QUARTER` | Previous quarter |
| `THIS_FISCAL_QUARTER` | Current fiscal quarter |
| `LAST_FISCAL_QUARTER` | Previous fiscal quarter |
| `THIS_YEAR` | Current year |
| `LAST_YEAR` | Previous year |
| `THIS_FISCAL_YEAR` | Current fiscal year |
| `LAST_FISCAL_YEAR` | Previous fiscal year |
| `LAST_N_DAYS:30` | Last 30 days |
| `NEXT_N_DAYS:90` | Next 90 days |
| `CUSTOM` | Custom date range |

**Custom Date Range**:

```json
{
  "reportMetadata": {
    "standardDateFilter": {
      "column": "CLOSE_DATE",
      "durationValue": "CUSTOM",
      "startDate": "2025-01-01",
      "endDate": "2025-03-31"
    }
  }
}
```

**Metadata API Date Filter**:

```xml
<timeFrameFilter>
    <dateColumn>CLOSE_DATE</dateColumn>
    <interval>INTERVAL_CURFY</interval>
</timeFrameFilter>
```

**Available Interval Values**:

| Interval | Description |
|----------|-------------|
| `INTERVAL_CURRENT` | Today |
| `INTERVAL_CURWEEK` | This week |
| `INTERVAL_LASTWEEK` | Last week |
| `INTERVAL_CURMONTH` | This month |
| `INTERVAL_LASTMONTH` | Last month |
| `INTERVAL_CURQ` | This quarter |
| `INTERVAL_LASTQ` | Last quarter |
| `INTERVAL_CURY` | This year |
| `INTERVAL_LASTY` | Last year |
| `INTERVAL_CURFY` | This fiscal year |
| `INTERVAL_LASTFY` | Last fiscal year |
| `INTERVAL_LAST30` | Last 30 days |
| `INTERVAL_LAST60` | Last 60 days |
| `INTERVAL_LAST90` | Last 90 days |
| `INTERVAL_LAST120` | Last 120 days |
| `INTERVAL_NEXT30` | Next 30 days |
| `INTERVAL_NEXT60` | Next 60 days |
| `INTERVAL_NEXT90` | Next 90 days |

---

## 7. Dashboard Integration

### Row Limits for Dashboards

**Critical**: Dashboard components from tabular reports are limited to displaying a subset of rows.

| Dashboard Component Type | Default Row Limit | Max Row Limit |
|-------------------------|-------------------|---------------|
| Table | 10 | 200 |
| Chart (data source) | 10 | 200 |
| Lightning Table | 10 | 200 |

### Configuring Top Rows

**REST API**:

```json
{
  "reportMetadata": {
    "topRows": {
      "rowLimit": 10,
      "direction": "bottomUp"
    }
  }
}
```

**Options**:
- `rowLimit`: Number of rows (1-200)
- `direction`: `"topDown"` (first N) or `"bottomUp"` (last N after sort)

**Metadata API**:

```xml
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <!-- ... other elements ... -->
    <rowLimit>10</rowLimit>
</Report>
```

### Sorting for Dashboard Display

**Best Practice**: Always sort tabular reports appropriately for dashboard context.

**Top 10 by Amount** (REST API):

```json
{
  "reportMetadata": {
    "sortBy": [
      {
        "sortColumn": "AMOUNT",
        "sortOrder": "Desc"
      }
    ],
    "topRows": {
      "rowLimit": 10,
      "direction": "topDown"
    }
  }
}
```

**Most Recent 10** (REST API):

```json
{
  "reportMetadata": {
    "sortBy": [
      {
        "sortColumn": "CREATED_DATE",
        "sortOrder": "Desc"
      }
    ],
    "topRows": {
      "rowLimit": 10,
      "direction": "topDown"
    }
  }
}
```

**Bottom 10 by Probability** (REST API):

```json
{
  "reportMetadata": {
    "sortBy": [
      {
        "sortColumn": "PROBABILITY",
        "sortOrder": "Asc"
      }
    ],
    "topRows": {
      "rowLimit": 10,
      "direction": "topDown"
    }
  }
}
```

### Dashboard XML Reference

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Dashboard xmlns="http://soap.sforce.com/2006/04/metadata">
    <backgroundEndColor>#FFFFFF</backgroundEndColor>
    <backgroundFadeDirection>Diagonal</backgroundFadeDirection>
    <backgroundStartColor>#FFFFFF</backgroundStartColor>
    <dashboardFilters/>
    <dashboardGridLayout>
        <dashboardGridComponents>
            <colSpan>6</colSpan>
            <columnIndex>0</columnIndex>
            <dashboardComponent>
                <autoselectColumnsFromReport>true</autoselectColumnsFromReport>
                <componentType>Table</componentType>
                <displayUnits>Auto</displayUnits>
                <header>Top 10 Opportunities</header>
                <indicatorHighColor>#54C254</indicatorHighColor>
                <indicatorLowColor>#C25454</indicatorLowColor>
                <indicatorMiddleColor>#C2C254</indicatorMiddleColor>
                <report>MyFolder/Top_10_Opportunities</report>
                <showPicturesOnTables>true</showPicturesOnTables>
                <sortBy>RowValueDescending</sortBy>
            </dashboardComponent>
            <rowIndex>0</rowIndex>
            <rowSpan>4</rowSpan>
        </dashboardGridComponents>
    </dashboardGridLayout>
    <dashboardType>SpecifiedUser</dashboardType>
    <isGridLayout>true</isGridLayout>
    <runningUser>admin@company.com</runningUser>
    <textColor>#000000</textColor>
    <title>Sales Dashboard</title>
    <titleColor>#000000</titleColor>
    <titleSize>12</titleSize>
</Dashboard>
```

---

## 8. Export Optimization

### Large Data Export Strategy

**When exporting >2,000 rows, Tabular is mandatory** (Summary truncates).

**REST API Async Export**:

```bash
# Step 1: Create async export instance
curl -X POST \
  "https://yourinstance.salesforce.com/services/data/v62.0/analytics/reports/00O5f000004XXXX/instances" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json"

# Response: {"id": "0LG5f000000XXXX", "status": "Running"}

# Step 2: Poll for completion
curl -X GET \
  "https://yourinstance.salesforce.com/services/data/v62.0/analytics/reports/00O5f000004XXXX/instances/0LG5f000000XXXX" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# Step 3: Get results when status is "Success"
curl -X GET \
  "https://yourinstance.salesforce.com/services/data/v62.0/analytics/reports/00O5f000004XXXX/instances/0LG5f000000XXXX" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Optimizing Column Selection for Export

**Minimize Columns** for faster exports:

```json
{
  "reportMetadata": {
    "detailColumns": [
      "Id",
      "OPPORTUNITY_NAME",
      "ACCOUNT.NAME",
      "AMOUNT",
      "CLOSE_DATE",
      "STAGE_NAME"
    ]
  }
}
```

**Include ID Fields** for data integration:

```json
{
  "detailColumns": [
    "Id",                    // Record ID
    "ACCOUNT.ID",            // Related Account ID
    "OPPORTUNITY_NAME",
    "AMOUNT"
  ]
}
```

### Export Script Example

```javascript
/**
 * Export large tabular report to file
 * @see {@link docs/runbooks/report-api-development/02-tabular-reports.md}
 */
async function exportTabularReport(reportId, outputPath) {
  const conn = await getConnection();

  // Create async instance
  const instance = await conn.request({
    method: 'POST',
    url: `/services/data/v62.0/analytics/reports/${reportId}/instances`,
    body: {}
  });

  // Poll until complete
  let status = 'Running';
  let results;

  while (status === 'Running' || status === 'New') {
    await sleep(2000); // Wait 2 seconds between polls

    results = await conn.request({
      method: 'GET',
      url: `/services/data/v62.0/analytics/reports/${reportId}/instances/${instance.id}`
    });

    status = results.status;
    console.log(`Export status: ${status}`);
  }

  if (status !== 'Success') {
    throw new Error(`Export failed with status: ${status}`);
  }

  // Extract data
  const rows = [];
  const factMap = results.factMap;
  const columnInfo = results.reportExtendedMetadata.detailColumnInfo;

  // Header row
  const headers = Object.keys(columnInfo).map(col => columnInfo[col].label);
  rows.push(headers);

  // Data rows
  if (factMap['T!T']) {
    for (const row of factMap['T!T'].rows) {
      const dataRow = row.dataCells.map(cell => cell.value);
      rows.push(dataRow);
    }
  }

  // Write to CSV
  const csv = rows.map(row => row.join(',')).join('\n');
  await fs.writeFile(outputPath, csv);

  console.log(`Exported ${rows.length - 1} records to ${outputPath}`);
  return rows.length - 1;
}
```

---

## 9. MCP Tool Usage

### List Report Types

```javascript
// Find available report types for tabular reports
const reportTypes = await mcp_salesforce_report_type_list({
  search: "Opportunity"
});

// Returns: ["Opportunity", "OpportunityProduct", "OpportunityHistory", ...]
```

### Describe Report Type

```javascript
// Get available fields for column selection
const typeInfo = await mcp_salesforce_report_type_describe({
  report_type: "Opportunity"
});

// Use typeInfo.reportTypeCategories to find field API names
```

### Create Tabular Report

```javascript
// Create new tabular report using MCP
const report = await mcp_salesforce_report_create({
  name: "Q4_Opportunity_Export",
  folder: "Sales_Reports",
  format: "TABULAR",
  reportType: "Opportunity",
  columns: [
    "OPPORTUNITY_NAME",
    "ACCOUNT.NAME",
    "AMOUNT",
    "CLOSE_DATE",
    "STAGE_NAME"
  ],
  filters: [
    {
      field: "STAGE_NAME",
      operator: "equals",
      value: "Closed Won"
    }
  ],
  dateFilter: {
    column: "CLOSE_DATE",
    duration: "THIS_FISCAL_QUARTER"
  },
  sortBy: {
    column: "AMOUNT",
    order: "Desc"
  }
});

console.log(`Created report: ${report.id}`);
```

### Clone and Modify

```javascript
// Clone existing report with modifications
const cloned = await mcp_salesforce_report_clone({
  sourceReportId: "00O5f000004XXXX",
  name: "Q4_Opportunity_Export_v2",
  folder: "Sales_Reports",
  modifications: {
    filters: [
      {
        field: "AMOUNT",
        operator: "greaterThan",
        value: "25000"
      }
    ]
  }
});
```

### Run Report

```javascript
// Execute report and get results
const results = await mcp_salesforce_report_run({
  reportId: "00O5f000004XXXX",
  async: true // Use async for large reports
});

console.log(`Total records: ${results.factMap['T!T'].aggregates[0].value}`);
```

### Deploy via Metadata

```javascript
// Deploy report from XML file
await mcp_salesforce_report_deploy({
  sourcePath: "force-app/main/default/reports/Sales/Q4_Export.report-meta.xml",
  targetOrg: "production"
});
```

---

## 10. Best Practices

### Column Selection

**DO**:
```
✅ Include identifiers first (Name, ID)
✅ Group related fields together
✅ Limit to 15 columns for readability
✅ Include ID fields for data integration
✅ Use meaningful field order
```

**DON'T**:
```
❌ Include all available fields
❌ Duplicate information (Name AND Id of same record)
❌ Include sensitive fields in exports
❌ Mix unrelated fields randomly
```

### Filter Strategy

**DO**:
```
✅ Filter early to reduce data volume
✅ Use date filters for time-bounded reports
✅ Index-friendly filters (exact match over LIKE)
✅ Test filter logic with sample data
```

**DON'T**:
```
❌ Create unfiltered reports (performance impact)
❌ Use CONTAINS on large text fields
❌ Over-filter (may miss edge cases)
❌ Mix complex boolean logic without testing
```

### Performance Optimization

| Optimization | Impact | Implementation |
|--------------|--------|----------------|
| Add date filter | High | Reduces scan scope |
| Limit columns | Medium | Reduces data transfer |
| Use indexed fields in filters | High | Faster query execution |
| Avoid formula fields | Medium | Reduces CPU time |
| Sort on indexed field | Medium | Faster ordering |

### Naming Conventions

```
Format: {Purpose}_{Object}_{Qualifier}

Examples:
- Export_Opportunities_Q4_2025
- Dashboard_Cases_Top10_Open
- Integration_Accounts_Active
- Audit_Contacts_NoEmail
```

---

## 11. Common Errors and Fixes

### Error: "Invalid column name"

**Cause**: Field API name doesn't match report type

**Fix**:
```javascript
// Step 1: Verify field exists in report type
const typeInfo = await mcp_salesforce_report_type_describe({
  report_type: "Opportunity"
});

// Step 2: Find correct API name
const columns = typeInfo.reportTypeCategories
  .flatMap(cat => cat.columns)
  .map(col => col.name);

console.log(columns);
// Look for exact API name match
```

### Error: "Cannot use field in filter"

**Cause**: Field doesn't support filtering or wrong operator

**Fix**:
```javascript
// Check filterable fields
const typeInfo = await mcp_salesforce_report_type_describe({
  report_type: "Opportunity"
});

const filterableFields = typeInfo.reportTypeCategories
  .flatMap(cat => cat.columns)
  .filter(col => col.filterable)
  .map(col => ({ name: col.name, dataType: col.dataType }));

// Use appropriate operator for data type
// - String: equals, contains, startsWith
// - Number: equals, lessThan, greaterThan
// - Date: equals, lessThan, greaterThan
// - Picklist: equals, notEqual
```

### Error: "Report type not found"

**Cause**: Custom report type API name incorrect

**Fix**:
```bash
# List all report types
sf data query --query "SELECT DeveloperName FROM ReportType" --use-tooling-api

# Use DeveloperName as report type
```

### Error: "Sort column not in report"

**Cause**: Trying to sort by column not in detailColumns

**Fix**:
```json
{
  "reportMetadata": {
    "detailColumns": [
      "OPPORTUNITY_NAME",
      "AMOUNT",
      "CLOSE_DATE"
    ],
    "sortBy": [
      {
        "sortColumn": "AMOUNT",
        "sortOrder": "Desc"
      }
    ]
  }
}
```

**Note**: Sort column must exist in detailColumns array.

### Error: "Maximum row limit exceeded"

**Cause**: Report returns >50,000 rows

**Fix**:
1. Add more restrictive filters
2. Use date filter to narrow scope
3. Split into multiple reports by criteria

```json
{
  "reportFilters": [
    {
      "column": "CREATED_DATE",
      "filterType": "greaterOrEqual",
      "value": "2025-01-01"
    },
    {
      "column": "CREATED_DATE",
      "filterType": "lessThan",
      "value": "2025-04-01"
    }
  ]
}
```

---

## 12. Complete Examples

### Example 1: Sales Pipeline Export

**Use Case**: Export all open opportunities for external analysis

**REST API**:

```json
{
  "reportMetadata": {
    "name": "Sales_Pipeline_Export",
    "reportFormat": "TABULAR",
    "reportType": {
      "type": "Opportunity"
    },
    "detailColumns": [
      "Id",
      "OPPORTUNITY_NAME",
      "ACCOUNT.NAME",
      "ACCOUNT.ID",
      "AMOUNT",
      "PROBABILITY",
      "EXPECTED_REVENUE",
      "CLOSE_DATE",
      "STAGE_NAME",
      "FORECAST_CATEGORY",
      "OWNER_FULL_NAME",
      "TYPE",
      "LEAD_SOURCE",
      "CREATED_DATE"
    ],
    "reportFilters": [
      {
        "column": "ISCLOSED",
        "filterType": "equals",
        "value": "false"
      },
      {
        "column": "AMOUNT",
        "filterType": "greaterThan",
        "value": "0"
      }
    ],
    "standardDateFilter": {
      "column": "CLOSE_DATE",
      "durationValue": "THIS_FISCAL_YEAR"
    },
    "sortBy": [
      {
        "sortColumn": "CLOSE_DATE",
        "sortOrder": "Asc"
      }
    ]
  }
}
```

**Metadata API**:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>Sales_Pipeline_Export</name>
    <reportType>Opportunity</reportType>
    <format>Tabular</format>
    <showDetails>true</showDetails>

    <columns>
        <field>CUST_ID</field>
    </columns>
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
        <field>CLOSE_DATE</field>
    </columns>
    <columns>
        <field>STAGE_NAME</field>
    </columns>
    <columns>
        <field>FORECAST_CATEGORY</field>
    </columns>
    <columns>
        <field>OWNER_FULL_NAME</field>
    </columns>
    <columns>
        <field>TYPE</field>
    </columns>
    <columns>
        <field>LEAD_SOURCE</field>
    </columns>
    <columns>
        <field>CREATED_DATE</field>
    </columns>

    <filter>
        <criteriaItems>
            <column>ISCLOSED</column>
            <columnToColumn>false</columnToColumn>
            <isUnlocked>true</isUnlocked>
            <operator>equals</operator>
            <value>0</value>
        </criteriaItems>
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

    <sortColumn>CLOSE_DATE</sortColumn>
    <sortOrder>Asc</sortOrder>
    <scope>organization</scope>
</Report>
```

### Example 2: Dashboard Top 10 Accounts

**Use Case**: Show top 10 accounts by revenue on executive dashboard

**REST API**:

```json
{
  "reportMetadata": {
    "name": "Top_10_Accounts_Revenue",
    "reportFormat": "TABULAR",
    "reportType": {
      "type": "Account"
    },
    "detailColumns": [
      "ACCOUNT.NAME",
      "INDUSTRY",
      "ANNUAL_REVENUE",
      "EMPLOYEES",
      "OWNER_FULL_NAME",
      "TYPE"
    ],
    "reportFilters": [
      {
        "column": "TYPE",
        "filterType": "equals",
        "value": "Customer"
      },
      {
        "column": "ANNUAL_REVENUE",
        "filterType": "greaterThan",
        "value": "0"
      }
    ],
    "sortBy": [
      {
        "sortColumn": "ANNUAL_REVENUE",
        "sortOrder": "Desc"
      }
    ],
    "topRows": {
      "rowLimit": 10,
      "direction": "topDown"
    }
  }
}
```

**Metadata API**:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>Top_10_Accounts_Revenue</name>
    <reportType>AccountList</reportType>
    <format>Tabular</format>
    <showDetails>true</showDetails>

    <columns>
        <field>ACCOUNT.NAME</field>
    </columns>
    <columns>
        <field>INDUSTRY</field>
    </columns>
    <columns>
        <field>ANNUAL_REVENUE</field>
    </columns>
    <columns>
        <field>EMPLOYEES</field>
    </columns>
    <columns>
        <field>OWNER_FULL_NAME</field>
    </columns>
    <columns>
        <field>TYPE</field>
    </columns>

    <filter>
        <criteriaItems>
            <column>TYPE</column>
            <columnToColumn>false</columnToColumn>
            <isUnlocked>true</isUnlocked>
            <operator>equals</operator>
            <value>Customer</value>
        </criteriaItems>
        <criteriaItems>
            <column>ANNUAL_REVENUE</column>
            <columnToColumn>false</columnToColumn>
            <isUnlocked>true</isUnlocked>
            <operator>greaterThan</operator>
            <value>0</value>
        </criteriaItems>
    </filter>

    <sortColumn>ANNUAL_REVENUE</sortColumn>
    <sortOrder>Desc</sortOrder>
    <rowLimit>10</rowLimit>
    <scope>organization</scope>
</Report>
```

### Example 3: Activity Log for Compliance

**Use Case**: Export all activities for compliance audit

**REST API**:

```json
{
  "reportMetadata": {
    "name": "Compliance_Activity_Log",
    "reportFormat": "TABULAR",
    "reportType": {
      "type": "Activity"
    },
    "detailColumns": [
      "Id",
      "SUBJECT",
      "ASSIGNED_FULL_NAME",
      "ACCOUNT_NAME",
      "CONTACT_NAME",
      "ACTIVITY_DATE",
      "TASK_TYPE",
      "STATUS",
      "DESCRIPTION",
      "CREATED_DATE",
      "CREATED_BY"
    ],
    "standardDateFilter": {
      "column": "ACTIVITY_DATE",
      "durationValue": "LAST_N_DAYS:90"
    },
    "sortBy": [
      {
        "sortColumn": "ACTIVITY_DATE",
        "sortOrder": "Desc"
      }
    ]
  }
}
```

### Example 4: Integration Data Extract

**Use Case**: Extract contact data for external system integration

**REST API**:

```json
{
  "reportMetadata": {
    "name": "Integration_Contact_Extract",
    "reportFormat": "TABULAR",
    "reportType": {
      "type": "Contact"
    },
    "detailColumns": [
      "CONTACT.ID",
      "FIRST_NAME",
      "LAST_NAME",
      "EMAIL",
      "PHONE",
      "MOBILE",
      "TITLE",
      "DEPARTMENT",
      "ACCOUNT.ID",
      "ACCOUNT.NAME",
      "MAILING_STREET",
      "MAILING_CITY",
      "MAILING_STATE",
      "MAILING_ZIP",
      "MAILING_COUNTRY",
      "LAST_UPDATE"
    ],
    "reportFilters": [
      {
        "column": "EMAIL",
        "filterType": "notEqual",
        "value": ""
      },
      {
        "column": "DO_NOT_CALL",
        "filterType": "equals",
        "value": "false"
      }
    ],
    "standardDateFilter": {
      "column": "LAST_UPDATE",
      "durationValue": "LAST_N_DAYS:7"
    },
    "sortBy": [
      {
        "sortColumn": "LAST_UPDATE",
        "sortOrder": "Desc"
      }
    ]
  }
}
```

---

## Related Runbooks

- **Previous**: [Runbook 01: Report Formats Fundamentals](01-report-formats-fundamentals.md) - Format selection and API overview
- **Next**: [Runbook 03: Summary Reports](03-summary-reports.md) - Grouped reports with aggregates
- **Validation**: [Runbook 08: Validation & Deployment](08-validation-deployment.md) - Pre-deployment checks
- **Troubleshooting**: [Runbook 09: Troubleshooting & Optimization](09-troubleshooting-optimization.md) - Error resolution

---

**Last Updated**: November 26, 2025
**Maintained By**: Salesforce Plugin Team
**Plugin Version**: v3.51.0
