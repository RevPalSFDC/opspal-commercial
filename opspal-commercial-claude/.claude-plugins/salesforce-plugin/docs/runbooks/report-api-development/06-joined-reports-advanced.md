# Runbook 06: Joined Reports - Advanced

**Version**: v3.51.0
**Last Updated**: November 26, 2025
**Status**: Complete

---

## Table of Contents

1. [Overview](#1-overview)
2. [Cross-Block Formulas](#2-cross-block-formulas)
3. [Advanced Block Configuration](#3-advanced-block-configuration)
4. [Template-Based Approach](#4-template-based-approach)
5. [Complete Metadata API Reference](#5-complete-metadata-api-reference)
6. [Deployment Strategies](#6-deployment-strategies)
7. [Joined Report Builder Script](#7-joined-report-builder-script)
8. [Complex Examples](#8-complex-examples)
9. [Performance Optimization](#9-performance-optimization)
10. [Troubleshooting Advanced Issues](#10-troubleshooting-advanced-issues)
11. [Migration from UI to API](#11-migration-from-ui-to-api)
12. [Complete Reference Implementation](#12-complete-reference-implementation)

---

## 1. Overview

### Advanced Joined Report Features

This runbook covers advanced features not available via the REST API:

| Feature | REST API | Metadata API | This Runbook |
|---------|----------|--------------|--------------|
| Create Joined Reports | ❌ No | ✅ Yes | Section 5 |
| Cross-Block Formulas | ❌ No | ✅ Yes | Section 2 |
| Complex Block Filters | Limited | ✅ Full | Section 3 |
| Multi-Block Aggregates | ❌ No | ✅ Yes | Section 2 |
| Template Approach | ❌ No | ✅ Yes | Section 4 |
| Full XML Control | ❌ No | ✅ Yes | Section 5 |
| CI/CD Deployment | ❌ No | ✅ Yes | Section 6 |

### Prerequisites

- Completed [Runbook 05: Joined Reports Basics](05-joined-reports-basics.md)
- Understanding of multi-block architecture
- Familiarity with Metadata API deployment (`sf project deploy`)
- Basic XML knowledge

---

## 2. Cross-Block Formulas

### What are Cross-Block Formulas?

Cross-block formulas perform calculations **across blocks**, allowing you to:
- Calculate ratios between blocks (Win Rate)
- Compare values between blocks (YoY Change)
- Aggregate data across blocks (Combined Total)
- Create derived metrics (Conversion Rate)

### Formula Syntax

```xml
<aggregates>
    <calculatedFormula>BLOCK_EXPRESSION</calculatedFormula>
    <datatype>DATA_TYPE</datatype>
    <developerName>UNIQUE_NAME</developerName>
    <isActive>true</isActive>
    <isCrossBlock>true</isCrossBlock>  <!-- CRITICAL: Mark as cross-block -->
    <masterLabel>Display Label</masterLabel>
    <scale>DECIMAL_PLACES</scale>
</aggregates>
```

### Referencing Block Values

**Block Reference Syntax**:

```
B{blockId}#{aggregateName}

Examples:
- B1#RowCount           = Row count from Block 1
- B2#s!AMOUNT           = Sum of Amount from Block 2
- B_WON#RowCount        = Row count from block named B_WON
- B_LOST#s!AMOUNT       = Sum of Amount from block named B_LOST
```

### Common Cross-Block Formulas

**1. Win Rate (Won / Total)**

```xml
<aggregates>
    <calculatedFormula>B_WON#RowCount / (B_WON#RowCount + B_LOST#RowCount) * 100</calculatedFormula>
    <datatype>percent</datatype>
    <developerName>Win_Rate</developerName>
    <isActive>true</isActive>
    <isCrossBlock>true</isCrossBlock>
    <masterLabel>Win Rate</masterLabel>
    <scale>1</scale>
</aggregates>
```

**2. Year-over-Year Change**

```xml
<aggregates>
    <calculatedFormula>(B_TFY#s!AMOUNT - B_LFY#s!AMOUNT) / B_LFY#s!AMOUNT * 100</calculatedFormula>
    <datatype>percent</datatype>
    <developerName>YoY_Change</developerName>
    <isActive>true</isActive>
    <isCrossBlock>true</isCrossBlock>
    <masterLabel>YoY Change %</masterLabel>
    <scale>1</scale>
</aggregates>
```

**3. Combined Total Across Blocks**

```xml
<aggregates>
    <calculatedFormula>B1#s!AMOUNT + B2#s!AMOUNT + B3#s!AMOUNT</calculatedFormula>
    <datatype>currency</datatype>
    <developerName>Combined_Total</developerName>
    <isActive>true</isActive>
    <isCrossBlock>true</isCrossBlock>
    <masterLabel>Combined Revenue</masterLabel>
    <scale>2</scale>
</aggregates>
```

**4. Conversion Rate (Block 2 / Block 1)**

```xml
<aggregates>
    <calculatedFormula>B_CONVERTED#RowCount / B_LEADS#RowCount * 100</calculatedFormula>
    <datatype>percent</datatype>
    <developerName>Conversion_Rate</developerName>
    <isActive>true</isActive>
    <isCrossBlock>true</isCrossBlock>
    <masterLabel>Lead Conversion Rate</masterLabel>
    <scale>1</scale>
</aggregates>
```

**5. Average Deal Size Comparison**

```xml
<aggregates>
    <calculatedFormula>(B_WON#s!AMOUNT / B_WON#RowCount) - (B_LOST#s!AMOUNT / B_LOST#RowCount)</calculatedFormula>
    <datatype>currency</datatype>
    <developerName>Avg_Deal_Diff</developerName>
    <isActive>true</isActive>
    <isCrossBlock>true</isCrossBlock>
    <masterLabel>Avg Deal Size Diff (Won vs Lost)</masterLabel>
    <scale>2</scale>
</aggregates>
```

### Handling Division by Zero

Cross-block formulas should handle cases where denominators might be zero:

```xml
<!-- Safe division with fallback -->
<aggregates>
    <calculatedFormula>
        IF(B_TOTAL#RowCount > 0,
           B_WON#RowCount / B_TOTAL#RowCount * 100,
           0)
    </calculatedFormula>
    <datatype>percent</datatype>
    <developerName>Safe_Win_Rate</developerName>
    <isActive>true</isActive>
    <isCrossBlock>true</isCrossBlock>
    <masterLabel>Win Rate</masterLabel>
    <scale>1</scale>
</aggregates>
```

### Cross-Block Formula Limitations

| Limitation | Details |
|------------|---------|
| Block References | Must use exact block IDs from XML |
| Aggregate References | Must match developerName of block aggregates |
| Functions | Limited to basic math (+, -, *, /) and IF() |
| Nesting | Maximum 3 levels of nesting |
| Cross-Block Grouping | Formula applies at grouping level, not detail |

---

## 3. Advanced Block Configuration

### Complex Block Filters

**Boolean Filter Logic per Block**:

```xml
<block>
    <blockInfo>
        <blockId>B_QUALIFIED</blockId>
        <joinTable>a</joinTable>
    </blockInfo>
    <filter>
        <booleanFilter>1 AND (2 OR 3) AND 4</booleanFilter>
        <criteriaItems>
            <column>Opportunity$Amount</column>
            <columnToColumn>false</columnToColumn>
            <operator>greaterThan</operator>
            <value>10000</value>
        </criteriaItems>
        <criteriaItems>
            <column>Opportunity$StageName</column>
            <columnToColumn>false</columnToColumn>
            <operator>equals</operator>
            <value>Qualification,Needs Analysis</value>
        </criteriaItems>
        <criteriaItems>
            <column>Opportunity$StageName</column>
            <columnToColumn>false</columnToColumn>
            <operator>equals</operator>
            <value>Proposal,Negotiation</value>
        </criteriaItems>
        <criteriaItems>
            <column>Opportunity$ForecastCategory</column>
            <columnToColumn>false</columnToColumn>
            <operator>notEqual</operator>
            <value>Omitted</value>
        </criteriaItems>
    </filter>
    <!-- ... columns and aggregates -->
</block>
```

### Block-Specific Groupings

Each block can have additional groupings beyond the common grouping:

```xml
<!-- Common grouping for all blocks -->
<groupingsDown>
    <dateGranularity>None</dateGranularity>
    <field>ACCOUNT_NAME</field>
    <sortOrder>Asc</sortOrder>
</groupingsDown>

<!-- Block 1: Additional grouping by Stage -->
<block>
    <blockInfo>
        <blockId>B1</blockId>
        <joinTable>a</joinTable>
    </blockInfo>
    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>Opportunity$StageName</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>
    <!-- ... -->
</block>

<!-- Block 2: Additional grouping by Status -->
<block>
    <blockInfo>
        <blockId>B2</blockId>
        <joinTable>a</joinTable>
    </blockInfo>
    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>Case$Status</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>
    <!-- ... -->
</block>
```

### Block-Specific Date Filters

```xml
<!-- Block 1: This Year -->
<block>
    <blockInfo>
        <blockId>B_TFY</blockId>
        <joinTable>a</joinTable>
    </blockInfo>
    <timeFrameFilter>
        <dateColumn>CLOSE_DATE</dateColumn>
        <interval>INTERVAL_CURFY</interval>
    </timeFrameFilter>
    <!-- ... -->
</block>

<!-- Block 2: Last Year -->
<block>
    <blockInfo>
        <blockId>B_LFY</blockId>
        <joinTable>a</joinTable>
    </blockInfo>
    <timeFrameFilter>
        <dateColumn>CLOSE_DATE</dateColumn>
        <interval>INTERVAL_LASTFY</interval>
    </timeFrameFilter>
    <!-- ... -->
</block>
```

### Conditional Column Display

Show different columns based on block context:

```xml
<!-- Block 1: Sales metrics -->
<block>
    <columns>
        <field>Opportunity$Name</field>
    </columns>
    <columns>
        <field>Opportunity$Amount</field>
    </columns>
    <columns>
        <field>Opportunity$Probability</field>
    </columns>
    <columns>
        <field>Opportunity$ExpectedRevenue</field>
    </columns>
</block>

<!-- Block 2: Service metrics -->
<block>
    <columns>
        <field>Case$CaseNumber</field>
    </columns>
    <columns>
        <field>Case$Subject</field>
    </columns>
    <columns>
        <field>Case$Priority</field>
    </columns>
    <columns>
        <field>Case$Status</field>
    </columns>
    <columns>
        <field>Case$CreatedDate</field>
    </columns>
</block>
```

---

## 4. Template-Based Approach

### Why Use Templates?

Templates enable:
- **Consistency** - Standardized report structure
- **Reusability** - Create multiple reports from one template
- **Maintenance** - Update template, regenerate reports
- **Parameterization** - Customize via variables

### Template Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <!-- TEMPLATE: Sales vs Service by Account -->
    <!-- Variables: {{REPORT_NAME}}, {{YEAR}}, {{ACCOUNT_FILTER}} -->

    <name>{{REPORT_NAME}}</name>
    <description>Sales and service analysis - {{YEAR}}</description>
    <format>MultiBlock</format>

    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>ACCOUNT_NAME</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>

    <!-- Block 1: Opportunities -->
    <block>
        <blockInfo>
            <blockId>B_SALES</blockId>
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
        <filter>
            <criteriaItems>
                <column>Opportunity$Account.Type</column>
                <columnToColumn>false</columnToColumn>
                <operator>equals</operator>
                <value>{{ACCOUNT_FILTER}}</value>
            </criteriaItems>
        </filter>
        <timeFrameFilter>
            <dateColumn>CLOSE_DATE</dateColumn>
            <interval>{{DATE_INTERVAL}}</interval>
        </timeFrameFilter>
        <aggregates>
            <calculatedFormula>Opportunity$Amount:SUM</calculatedFormula>
            <datatype>currency</datatype>
            <developerName>B_SALES_Revenue</developerName>
            <isActive>true</isActive>
            <masterLabel>Sales Revenue</masterLabel>
            <scale>2</scale>
        </aggregates>
    </block>

    <!-- Block 2: Cases -->
    <block>
        <blockInfo>
            <blockId>B_SERVICE</blockId>
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
        <aggregates>
            <calculatedFormula>RowCount</calculatedFormula>
            <datatype>number</datatype>
            <developerName>B_SERVICE_Cases</developerName>
            <isActive>true</isActive>
            <masterLabel>Cases</masterLabel>
            <scale>0</scale>
        </aggregates>
    </block>

    <reportType>AccountWithOpportunities</reportType>
    <scope>organization</scope>
</Report>
```

### Template Processing Script

```javascript
/**
 * Process joined report template with variables
 * @see {@link docs/runbooks/report-api-development/06-joined-reports-advanced.md}
 */
const fs = require('fs');
const path = require('path');

class JoinedReportTemplateProcessor {
  constructor(templatePath) {
    this.template = fs.readFileSync(templatePath, 'utf8');
  }

  /**
   * Generate report from template with variable substitution
   */
  generate(variables) {
    let report = this.template;

    // Replace all template variables
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      report = report.replace(regex, value);
    }

    // Validate all variables were replaced
    const remaining = report.match(/{{[A-Z_]+}}/g);
    if (remaining) {
      throw new Error(`Unreplaced template variables: ${remaining.join(', ')}`);
    }

    return report;
  }

  /**
   * Generate and save report
   */
  generateAndSave(variables, outputPath) {
    const report = this.generate(variables);
    fs.writeFileSync(outputPath, report);
    console.log(`Generated: ${outputPath}`);
    return outputPath;
  }
}

// Usage
const processor = new JoinedReportTemplateProcessor(
  'templates/reports/joined/sales-service-template.xml'
);

// Generate for different accounts/years
const reports = [
  {
    REPORT_NAME: 'Sales_vs_Service_Enterprise_2025',
    YEAR: '2025',
    ACCOUNT_FILTER: 'Enterprise',
    DATE_INTERVAL: 'INTERVAL_CURFY'
  },
  {
    REPORT_NAME: 'Sales_vs_Service_SMB_2025',
    YEAR: '2025',
    ACCOUNT_FILTER: 'SMB',
    DATE_INTERVAL: 'INTERVAL_CURFY'
  },
  {
    REPORT_NAME: 'Sales_vs_Service_All_2024',
    YEAR: '2024',
    ACCOUNT_FILTER: 'Customer',
    DATE_INTERVAL: 'INTERVAL_LASTFY'
  }
];

for (const vars of reports) {
  processor.generateAndSave(
    vars,
    `force-app/main/default/reports/SalesService/${vars.REPORT_NAME}.report-meta.xml`
  );
}
```

### Template Registry

```javascript
/**
 * Registry of joined report templates
 */
const JOINED_REPORT_TEMPLATES = {
  'sales-vs-service': {
    path: 'templates/reports/joined/sales-service-template.xml',
    description: 'Compare opportunities and cases by account',
    variables: ['REPORT_NAME', 'YEAR', 'ACCOUNT_FILTER', 'DATE_INTERVAL'],
    blocks: ['B_SALES', 'B_SERVICE']
  },
  'won-vs-lost': {
    path: 'templates/reports/joined/won-lost-template.xml',
    description: 'Compare won and lost opportunities',
    variables: ['REPORT_NAME', 'DATE_INTERVAL'],
    blocks: ['B_WON', 'B_LOST']
  },
  'yoy-comparison': {
    path: 'templates/reports/joined/yoy-template.xml',
    description: 'Year-over-year revenue comparison',
    variables: ['REPORT_NAME', 'GROUPING_FIELD'],
    blocks: ['B_TFY', 'B_LFY']
  },
  'customer-360': {
    path: 'templates/reports/joined/customer360-template.xml',
    description: 'Full customer view (Sales, Service, Activities)',
    variables: ['REPORT_NAME', 'ACCOUNT_FILTER'],
    blocks: ['B_OPPS', 'B_CASES', 'B_ACTIVITIES']
  }
};

function listTemplates() {
  console.log('Available Joined Report Templates:');
  for (const [name, config] of Object.entries(JOINED_REPORT_TEMPLATES)) {
    console.log(`\n  ${name}`);
    console.log(`    Description: ${config.description}`);
    console.log(`    Variables: ${config.variables.join(', ')}`);
    console.log(`    Blocks: ${config.blocks.join(', ')}`);
  }
}
```

---

## 5. Complete Metadata API Reference

### Full XML Schema

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <!-- ============================================ -->
    <!-- REPORT IDENTIFICATION                         -->
    <!-- ============================================ -->
    <name>Report_API_Name</name>
    <description>Report description (optional)</description>
    <folder>FolderName</folder>

    <!-- ============================================ -->
    <!-- FORMAT (REQUIRED: MultiBlock for Joined)      -->
    <!-- ============================================ -->
    <format>MultiBlock</format>

    <!-- ============================================ -->
    <!-- COMMON GROUPINGS (Applied to all blocks)      -->
    <!-- ============================================ -->
    <groupingsDown>
        <dateGranularity>None|Day|Week|Month|Quarter|Year|FiscalQuarter|FiscalYear</dateGranularity>
        <field>FIELD_API_NAME</field>
        <sortOrder>Asc|Desc</sortOrder>
        <sortByName>AGGREGATE_NAME</sortByName>  <!-- Optional: Sort by aggregate -->
    </groupingsDown>
    <!-- Up to 3 groupingsDown allowed -->

    <!-- ============================================ -->
    <!-- BLOCK 1 DEFINITION                            -->
    <!-- ============================================ -->
    <block>
        <blockInfo>
            <blockId>B1</blockId>               <!-- Unique block identifier -->
            <joinTable>a</joinTable>            <!-- Table alias (a, b, c, etc.) -->
        </blockInfo>

        <!-- Block Columns -->
        <columns>
            <field>Object$FieldName</field>    <!-- Joined report field syntax -->
        </columns>
        <columns>
            <field>Object$RelatedObject.Field</field>
        </columns>

        <!-- Block Groupings (in addition to common) -->
        <groupingsDown>
            <dateGranularity>None</dateGranularity>
            <field>Object$GroupField</field>
            <sortOrder>Asc</sortOrder>
        </groupingsDown>

        <!-- Block Aggregates -->
        <aggregates>
            <calculatedFormula>Object$Amount:SUM</calculatedFormula>
            <datatype>currency|number|percent</datatype>
            <developerName>B1_SumAmount</developerName>
            <isActive>true</isActive>
            <isCrossBlock>false</isCrossBlock>
            <masterLabel>Total Amount</masterLabel>
            <scale>2</scale>
        </aggregates>

        <!-- Block Filters -->
        <filter>
            <booleanFilter>1 AND 2</booleanFilter>  <!-- Optional: Logic expression -->
            <criteriaItems>
                <column>Object$Field</column>
                <columnToColumn>false</columnToColumn>
                <isUnlocked>true</isUnlocked>
                <operator>equals|notEqual|lessThan|greaterThan|contains|startsWith</operator>
                <value>FilterValue</value>
            </criteriaItems>
        </filter>

        <!-- Block Date Filter -->
        <timeFrameFilter>
            <dateColumn>DATE_FIELD</dateColumn>
            <interval>INTERVAL_CURFY</interval>
        </timeFrameFilter>
    </block>

    <!-- ============================================ -->
    <!-- BLOCK 2 DEFINITION (Similar structure)        -->
    <!-- ============================================ -->
    <block>
        <blockInfo>
            <blockId>B2</blockId>
            <joinTable>b</joinTable>
        </blockInfo>
        <!-- ... columns, groupings, aggregates, filters ... -->
    </block>

    <!-- ============================================ -->
    <!-- CROSS-BLOCK FORMULAS                          -->
    <!-- ============================================ -->
    <aggregates>
        <calculatedFormula>B1#B1_SumAmount / B2#B2_SumAmount * 100</calculatedFormula>
        <datatype>percent</datatype>
        <developerName>CrossBlock_Ratio</developerName>
        <isActive>true</isActive>
        <isCrossBlock>true</isCrossBlock>      <!-- CRITICAL: Mark as cross-block -->
        <masterLabel>Block 1 vs Block 2 %</masterLabel>
        <scale>1</scale>
    </aggregates>

    <!-- ============================================ -->
    <!-- REPORT TYPE                                   -->
    <!-- ============================================ -->
    <reportType>AccountWithOpportunities</reportType>

    <!-- ============================================ -->
    <!-- SCOPE AND OPTIONS                             -->
    <!-- ============================================ -->
    <scope>organization|user|team</scope>
    <showDetails>true|false</showDetails>
    <showGrandTotal>true|false</showGrandTotal>
    <showSubTotals>true|false</showSubTotals>

    <!-- ============================================ -->
    <!-- CURRENCY (if multi-currency org)              -->
    <!-- ============================================ -->
    <currency>USD|EUR|GBP|...</currency>

</Report>
```

### Field Naming Reference

```
Standard Reports vs Joined Reports Field Naming:

Standard Format:
├── OPPORTUNITY_NAME           (standard field)
├── AMOUNT                     (standard field)
├── ACCOUNT.NAME               (related object)
├── Custom_Field__c            (custom field)
└── OWNER_FULL_NAME            (lookup field)

Joined Report Format (Object$Field):
├── Opportunity$Name           (standard field)
├── Opportunity$Amount         (standard field)
├── Opportunity$Account.Name   (related object)
├── Opportunity$Custom_Field__c (custom field)
└── Opportunity$Owner.Name     (lookup field)

Case Object:
├── Case$CaseNumber
├── Case$Subject
├── Case$Status
├── Case$Account.Name
└── Case$Owner.Name
```

### Interval Values Reference

| Interval | Description |
|----------|-------------|
| `INTERVAL_CUSTOM` | Custom date range |
| `INTERVAL_CURRENT` | Today |
| `INTERVAL_CURWEEK` | This Week |
| `INTERVAL_LASTWEEK` | Last Week |
| `INTERVAL_CURMONTH` | This Month |
| `INTERVAL_LASTMONTH` | Last Month |
| `INTERVAL_CURQ` | This Quarter |
| `INTERVAL_LASTQ` | Last Quarter |
| `INTERVAL_CURY` | This Year |
| `INTERVAL_LASTY` | Last Year |
| `INTERVAL_CURFY` | This Fiscal Year |
| `INTERVAL_LASTFY` | Last Fiscal Year |
| `INTERVAL_LAST30` | Last 30 Days |
| `INTERVAL_LAST60` | Last 60 Days |
| `INTERVAL_LAST90` | Last 90 Days |
| `INTERVAL_NEXT30` | Next 30 Days |
| `INTERVAL_NEXT60` | Next 60 Days |
| `INTERVAL_NEXT90` | Next 90 Days |

---

## 6. Deployment Strategies

### Standard Deployment

```bash
# Single report deployment
sf project deploy start \
  --source-dir force-app/main/default/reports/JoinedReports/My_Report.report-meta.xml \
  --target-org production

# Folder deployment
sf project deploy start \
  --source-dir force-app/main/default/reports/JoinedReports \
  --target-org production

# With dry-run validation
sf project deploy start \
  --source-dir force-app/main/default/reports/JoinedReports \
  --target-org production \
  --dry-run
```

### Package.xml Deployment

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>JoinedReports</members>
        <members>JoinedReports/Sales_vs_Service</members>
        <members>JoinedReports/Won_vs_Lost</members>
        <members>JoinedReports/YoY_Comparison</members>
        <name>Report</name>
    </types>
    <types>
        <members>JoinedReports</members>
        <name>ReportFolder</name>
    </types>
    <version>62.0</version>
</Package>
```

```bash
# Deploy using manifest
sf project deploy start \
  --manifest package.xml \
  --target-org production
```

### CI/CD Pipeline Integration

```yaml
# GitHub Actions example
name: Deploy Joined Reports

on:
  push:
    branches: [main]
    paths:
      - 'force-app/main/default/reports/JoinedReports/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install Salesforce CLI
        run: npm install @salesforce/cli --global

      - name: Authenticate
        run: |
          echo "${{ secrets.SF_AUTH_URL }}" > auth.txt
          sf org login web --alias production

      - name: Validate
        run: |
          sf project deploy start \
            --source-dir force-app/main/default/reports/JoinedReports \
            --target-org production \
            --dry-run

      - name: Deploy
        run: |
          sf project deploy start \
            --source-dir force-app/main/default/reports/JoinedReports \
            --target-org production
```

### Rollback Strategy

```bash
# Retrieve previous version before deployment
sf project retrieve start \
  --metadata Report:JoinedReports/My_Report \
  --target-org production \
  --output-dir backup/

# If deployment fails, restore from backup
sf project deploy start \
  --source-dir backup/force-app/main/default/reports/JoinedReports \
  --target-org production
```

---

## 7. Joined Report Builder Script

### Builder Class

```javascript
/**
 * Programmatic joined report builder
 * @see {@link docs/runbooks/report-api-development/06-joined-reports-advanced.md}
 */
class JoinedReportBuilder {
  constructor(name, reportType) {
    this.name = name;
    this.reportType = reportType;
    this.blocks = [];
    this.commonGroupings = [];
    this.crossBlockFormulas = [];
    this.scope = 'organization';
    this.showDetails = true;
  }

  /**
   * Add common grouping field (applies to all blocks)
   */
  addCommonGrouping(field, options = {}) {
    this.commonGroupings.push({
      field,
      sortOrder: options.sortOrder || 'Asc',
      dateGranularity: options.dateGranularity || 'None'
    });
    return this;
  }

  /**
   * Add a block to the report
   */
  addBlock(config) {
    const block = {
      id: config.id || `B${this.blocks.length + 1}`,
      joinTable: String.fromCharCode(97 + this.blocks.length), // a, b, c, ...
      columns: config.columns || [],
      aggregates: config.aggregates || [],
      filters: config.filters || [],
      groupings: config.groupings || [],
      dateFilter: config.dateFilter || null
    };
    this.blocks.push(block);
    return this;
  }

  /**
   * Add cross-block formula
   */
  addCrossBlockFormula(config) {
    this.crossBlockFormulas.push({
      formula: config.formula,
      datatype: config.datatype || 'number',
      name: config.name,
      label: config.label,
      scale: config.scale || 2
    });
    return this;
  }

  /**
   * Generate Metadata API XML
   */
  generateXML() {
    const xml = [];

    xml.push('<?xml version="1.0" encoding="UTF-8"?>');
    xml.push('<Report xmlns="http://soap.sforce.com/2006/04/metadata">');
    xml.push(`    <name>${this.name}</name>`);
    xml.push('    <format>MultiBlock</format>');

    // Common groupings
    for (const grouping of this.commonGroupings) {
      xml.push('    <groupingsDown>');
      xml.push(`        <dateGranularity>${grouping.dateGranularity}</dateGranularity>`);
      xml.push(`        <field>${grouping.field}</field>`);
      xml.push(`        <sortOrder>${grouping.sortOrder}</sortOrder>`);
      xml.push('    </groupingsDown>');
    }

    // Blocks
    for (const block of this.blocks) {
      xml.push('    <block>');
      xml.push('        <blockInfo>');
      xml.push(`            <blockId>${block.id}</blockId>`);
      xml.push(`            <joinTable>${block.joinTable}</joinTable>`);
      xml.push('        </blockInfo>');

      // Block columns
      for (const col of block.columns) {
        xml.push('        <columns>');
        xml.push(`            <field>${col}</field>`);
        xml.push('        </columns>');
      }

      // Block groupings
      for (const grouping of block.groupings) {
        xml.push('        <groupingsDown>');
        xml.push(`            <dateGranularity>${grouping.dateGranularity || 'None'}</dateGranularity>`);
        xml.push(`            <field>${grouping.field}</field>`);
        xml.push(`            <sortOrder>${grouping.sortOrder || 'Asc'}</sortOrder>`);
        xml.push('        </groupingsDown>');
      }

      // Block aggregates
      for (const agg of block.aggregates) {
        xml.push('        <aggregates>');
        xml.push(`            <calculatedFormula>${agg.formula}</calculatedFormula>`);
        xml.push(`            <datatype>${agg.datatype || 'number'}</datatype>`);
        xml.push(`            <developerName>${agg.name}</developerName>`);
        xml.push('            <isActive>true</isActive>');
        xml.push('            <isCrossBlock>false</isCrossBlock>');
        xml.push(`            <masterLabel>${agg.label}</masterLabel>`);
        xml.push(`            <scale>${agg.scale || 0}</scale>`);
        xml.push('        </aggregates>');
      }

      // Block filters
      if (block.filters.length > 0) {
        xml.push('        <filter>');
        for (const filter of block.filters) {
          xml.push('            <criteriaItems>');
          xml.push(`                <column>${filter.column}</column>`);
          xml.push('                <columnToColumn>false</columnToColumn>');
          xml.push(`                <operator>${filter.operator}</operator>`);
          xml.push(`                <value>${filter.value}</value>`);
          xml.push('            </criteriaItems>');
        }
        xml.push('        </filter>');
      }

      // Block date filter
      if (block.dateFilter) {
        xml.push('        <timeFrameFilter>');
        xml.push(`            <dateColumn>${block.dateFilter.column}</dateColumn>`);
        xml.push(`            <interval>${block.dateFilter.interval}</interval>`);
        xml.push('        </timeFrameFilter>');
      }

      xml.push('    </block>');
    }

    // Cross-block formulas
    for (const formula of this.crossBlockFormulas) {
      xml.push('    <aggregates>');
      xml.push(`        <calculatedFormula>${formula.formula}</calculatedFormula>`);
      xml.push(`        <datatype>${formula.datatype}</datatype>`);
      xml.push(`        <developerName>${formula.name}</developerName>`);
      xml.push('        <isActive>true</isActive>');
      xml.push('        <isCrossBlock>true</isCrossBlock>');
      xml.push(`        <masterLabel>${formula.label}</masterLabel>`);
      xml.push(`        <scale>${formula.scale}</scale>`);
      xml.push('    </aggregates>');
    }

    xml.push(`    <reportType>${this.reportType}</reportType>`);
    xml.push(`    <scope>${this.scope}</scope>`);
    xml.push(`    <showDetails>${this.showDetails}</showDetails>`);
    xml.push('</Report>');

    return xml.join('\n');
  }

  /**
   * Save to file
   */
  save(outputPath) {
    const xml = this.generateXML();
    const fs = require('fs');
    fs.writeFileSync(outputPath, xml);
    console.log(`Saved: ${outputPath}`);
    return outputPath;
  }

  /**
   * Deploy to org
   */
  async deploy(orgAlias) {
    const fs = require('fs');
    const { execSync } = require('child_process');

    // Save to temp file
    const tempPath = `/tmp/${this.name}.report-meta.xml`;
    this.save(tempPath);

    // Deploy
    try {
      const result = execSync(
        `sf project deploy start --source-dir ${tempPath} --target-org ${orgAlias}`,
        { encoding: 'utf8' }
      );
      console.log('Deployment successful');
      return { success: true, result };
    } catch (error) {
      console.error('Deployment failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = { JoinedReportBuilder };
```

### Builder Usage Examples

```javascript
const { JoinedReportBuilder } = require('./joined-report-builder');

// Example 1: Sales vs Service
const salesVsService = new JoinedReportBuilder('Sales_vs_Service_Report', 'AccountWithOpportunities')
  .addCommonGrouping('ACCOUNT_NAME', { sortOrder: 'Asc' })
  .addBlock({
    id: 'B_SALES',
    columns: ['Opportunity$Name', 'Opportunity$Amount', 'Opportunity$StageName'],
    aggregates: [
      { formula: 'Opportunity$Amount:SUM', datatype: 'currency', name: 'B_SALES_Revenue', label: 'Revenue', scale: 2 },
      { formula: 'RowCount', datatype: 'number', name: 'B_SALES_Count', label: 'Deals', scale: 0 }
    ],
    dateFilter: { column: 'CLOSE_DATE', interval: 'INTERVAL_CURFY' }
  })
  .addBlock({
    id: 'B_SERVICE',
    columns: ['Case$CaseNumber', 'Case$Subject', 'Case$Status', 'Case$Priority'],
    aggregates: [
      { formula: 'RowCount', datatype: 'number', name: 'B_SERVICE_Count', label: 'Cases', scale: 0 }
    ]
  })
  .addCrossBlockFormula({
    formula: 'B_SALES#B_SALES_Revenue / B_SERVICE#B_SERVICE_Count',
    datatype: 'currency',
    name: 'Revenue_Per_Case',
    label: 'Revenue per Case',
    scale: 2
  });

// Save XML
salesVsService.save('force-app/main/default/reports/JoinedReports/Sales_vs_Service.report-meta.xml');

// Example 2: Won vs Lost with Win Rate
const wonVsLost = new JoinedReportBuilder('Won_vs_Lost_Analysis', 'Opportunity')
  .addCommonGrouping('FULL_NAME', { sortOrder: 'Asc' })
  .addBlock({
    id: 'B_WON',
    columns: ['Opportunity$Name', 'Opportunity$Amount', 'Opportunity$CloseDate'],
    aggregates: [
      { formula: 'Opportunity$Amount:SUM', datatype: 'currency', name: 'B_WON_Revenue', label: 'Won Revenue', scale: 2 },
      { formula: 'RowCount', datatype: 'number', name: 'B_WON_Count', label: 'Won Deals', scale: 0 }
    ],
    filters: [
      { column: 'Opportunity$IsWon', operator: 'equals', value: '1' }
    ],
    dateFilter: { column: 'CLOSE_DATE', interval: 'INTERVAL_CURFY' }
  })
  .addBlock({
    id: 'B_LOST',
    columns: ['Opportunity$Name', 'Opportunity$Amount', 'Opportunity$CloseDate'],
    aggregates: [
      { formula: 'Opportunity$Amount:SUM', datatype: 'currency', name: 'B_LOST_Revenue', label: 'Lost Revenue', scale: 2 },
      { formula: 'RowCount', datatype: 'number', name: 'B_LOST_Count', label: 'Lost Deals', scale: 0 }
    ],
    filters: [
      { column: 'Opportunity$IsClosed', operator: 'equals', value: '1' },
      { column: 'Opportunity$IsWon', operator: 'equals', value: '0' }
    ],
    dateFilter: { column: 'CLOSE_DATE', interval: 'INTERVAL_CURFY' }
  })
  .addCrossBlockFormula({
    formula: 'B_WON#B_WON_Count / (B_WON#B_WON_Count + B_LOST#B_LOST_Count) * 100',
    datatype: 'percent',
    name: 'Win_Rate',
    label: 'Win Rate',
    scale: 1
  });

wonVsLost.save('force-app/main/default/reports/JoinedReports/Won_vs_Lost_Analysis.report-meta.xml');
```

---

## 8. Complex Examples

### Example 1: Customer 360 (5 Blocks)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>Customer_360_View</name>
    <description>Complete customer view: Sales, Service, Activities, Contracts, Quotes</description>
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
            <blockId>B_OPPS</blockId>
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
            <developerName>B_OPPS_Revenue</developerName>
            <isActive>true</isActive>
            <masterLabel>Pipeline</masterLabel>
            <scale>0</scale>
        </aggregates>
        <aggregates>
            <calculatedFormula>RowCount</calculatedFormula>
            <datatype>number</datatype>
            <developerName>B_OPPS_Count</developerName>
            <isActive>true</isActive>
            <masterLabel>Opps</masterLabel>
            <scale>0</scale>
        </aggregates>
    </block>

    <!-- Block 2: Cases -->
    <block>
        <blockInfo>
            <blockId>B_CASES</blockId>
            <joinTable>b</joinTable>
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
            <developerName>B_CASES_Count</developerName>
            <isActive>true</isActive>
            <masterLabel>Cases</masterLabel>
            <scale>0</scale>
        </aggregates>
    </block>

    <!-- Block 3: Activities -->
    <block>
        <blockInfo>
            <blockId>B_ACTIVITIES</blockId>
            <joinTable>c</joinTable>
        </blockInfo>
        <columns>
            <field>Task$Subject</field>
        </columns>
        <columns>
            <field>Task$ActivityDate</field>
        </columns>
        <columns>
            <field>Task$Status</field>
        </columns>
        <aggregates>
            <calculatedFormula>RowCount</calculatedFormula>
            <datatype>number</datatype>
            <developerName>B_ACTIVITIES_Count</developerName>
            <isActive>true</isActive>
            <masterLabel>Activities</masterLabel>
            <scale>0</scale>
        </aggregates>
    </block>

    <!-- Block 4: Contracts -->
    <block>
        <blockInfo>
            <blockId>B_CONTRACTS</blockId>
            <joinTable>d</joinTable>
        </blockInfo>
        <columns>
            <field>Contract$ContractNumber</field>
        </columns>
        <columns>
            <field>Contract$Status</field>
        </columns>
        <columns>
            <field>Contract$StartDate</field>
        </columns>
        <columns>
            <field>Contract$EndDate</field>
        </columns>
        <aggregates>
            <calculatedFormula>RowCount</calculatedFormula>
            <datatype>number</datatype>
            <developerName>B_CONTRACTS_Count</developerName>
            <isActive>true</isActive>
            <masterLabel>Contracts</masterLabel>
            <scale>0</scale>
        </aggregates>
    </block>

    <!-- Block 5: Quotes -->
    <block>
        <blockInfo>
            <blockId>B_QUOTES</blockId>
            <joinTable>e</joinTable>
        </blockInfo>
        <columns>
            <field>Quote$QuoteNumber</field>
        </columns>
        <columns>
            <field>Quote$TotalPrice</field>
        </columns>
        <columns>
            <field>Quote$Status</field>
        </columns>
        <aggregates>
            <calculatedFormula>Quote$TotalPrice:SUM</calculatedFormula>
            <datatype>currency</datatype>
            <developerName>B_QUOTES_Value</developerName>
            <isActive>true</isActive>
            <masterLabel>Quote Value</masterLabel>
            <scale>0</scale>
        </aggregates>
    </block>

    <!-- Cross-Block Formulas -->
    <aggregates>
        <calculatedFormula>B_OPPS#B_OPPS_Revenue + B_QUOTES#B_QUOTES_Value</calculatedFormula>
        <datatype>currency</datatype>
        <developerName>Total_Pipeline</developerName>
        <isActive>true</isActive>
        <isCrossBlock>true</isCrossBlock>
        <masterLabel>Total Pipeline</masterLabel>
        <scale>0</scale>
    </aggregates>
    <aggregates>
        <calculatedFormula>B_CASES#B_CASES_Count / B_OPPS#B_OPPS_Count</calculatedFormula>
        <datatype>number</datatype>
        <developerName>Cases_Per_Opp</developerName>
        <isActive>true</isActive>
        <isCrossBlock>true</isCrossBlock>
        <masterLabel>Cases per Opp</masterLabel>
        <scale>2</scale>
    </aggregates>

    <reportType>AccountWithOpportunities</reportType>
    <scope>organization</scope>
    <showDetails>true</showDetails>
</Report>
```

### Example 2: YoY Comparison with Growth Rate

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>YoY_Revenue_with_Growth</name>
    <description>Year-over-year comparison with growth calculations</description>
    <format>MultiBlock</format>

    <groupingsDown>
        <dateGranularity>None</dateGranularity>
        <field>STAGE_NAME</field>
        <sortOrder>Asc</sortOrder>
    </groupingsDown>

    <!-- This Year Block -->
    <block>
        <blockInfo>
            <blockId>B_TY</blockId>
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
            <developerName>B_TY_Revenue</developerName>
            <isActive>true</isActive>
            <masterLabel>This Year Revenue</masterLabel>
            <scale>0</scale>
        </aggregates>
        <aggregates>
            <calculatedFormula>RowCount</calculatedFormula>
            <datatype>number</datatype>
            <developerName>B_TY_Count</developerName>
            <isActive>true</isActive>
            <masterLabel>This Year Deals</masterLabel>
            <scale>0</scale>
        </aggregates>
    </block>

    <!-- Last Year Block -->
    <block>
        <blockInfo>
            <blockId>B_LY</blockId>
            <joinTable>b</joinTable>
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
            <developerName>B_LY_Revenue</developerName>
            <isActive>true</isActive>
            <masterLabel>Last Year Revenue</masterLabel>
            <scale>0</scale>
        </aggregates>
        <aggregates>
            <calculatedFormula>RowCount</calculatedFormula>
            <datatype>number</datatype>
            <developerName>B_LY_Count</developerName>
            <isActive>true</isActive>
            <masterLabel>Last Year Deals</masterLabel>
            <scale>0</scale>
        </aggregates>
    </block>

    <!-- Cross-Block: Revenue Growth % -->
    <aggregates>
        <calculatedFormula>IF(B_LY#B_LY_Revenue > 0, (B_TY#B_TY_Revenue - B_LY#B_LY_Revenue) / B_LY#B_LY_Revenue * 100, 0)</calculatedFormula>
        <datatype>percent</datatype>
        <developerName>Revenue_Growth_Pct</developerName>
        <isActive>true</isActive>
        <isCrossBlock>true</isCrossBlock>
        <masterLabel>Revenue Growth %</masterLabel>
        <scale>1</scale>
    </aggregates>

    <!-- Cross-Block: Deal Count Change -->
    <aggregates>
        <calculatedFormula>B_TY#B_TY_Count - B_LY#B_LY_Count</calculatedFormula>
        <datatype>number</datatype>
        <developerName>Deal_Count_Change</developerName>
        <isActive>true</isActive>
        <isCrossBlock>true</isCrossBlock>
        <masterLabel>Deal Count Change</masterLabel>
        <scale>0</scale>
    </aggregates>

    <!-- Cross-Block: Avg Deal Size Change -->
    <aggregates>
        <calculatedFormula>(B_TY#B_TY_Revenue / B_TY#B_TY_Count) - (B_LY#B_LY_Revenue / B_LY#B_LY_Count)</calculatedFormula>
        <datatype>currency</datatype>
        <developerName>Avg_Deal_Change</developerName>
        <isActive>true</isActive>
        <isCrossBlock>true</isCrossBlock>
        <masterLabel>Avg Deal Size Change</masterLabel>
        <scale>0</scale>
    </aggregates>

    <reportType>Opportunity</reportType>
    <scope>organization</scope>
</Report>
```

---

## 9. Performance Optimization

### Block Optimization

| Optimization | Impact | Implementation |
|--------------|--------|----------------|
| Limit blocks | High | Use 2-3 blocks maximum |
| Filter early | High | Add restrictive filters per block |
| Limit columns | Medium | 5-8 columns per block |
| Hide detail rows | Medium | Set showDetails=false |
| Common grouping | High | Align blocks efficiently |

### Reduce Data Volume Per Block

```xml
<!-- Add restrictive filters to each block -->
<block>
    <filter>
        <!-- Filter to current fiscal year -->
        <criteriaItems>
            <column>Opportunity$CloseDate</column>
            <operator>greaterOrEqual</operator>
            <value>THIS_FISCAL_YEAR</value>
        </criteriaItems>
        <!-- Filter out small deals -->
        <criteriaItems>
            <column>Opportunity$Amount</column>
            <operator>greaterThan</operator>
            <value>1000</value>
        </criteriaItems>
    </filter>
    <timeFrameFilter>
        <dateColumn>CLOSE_DATE</dateColumn>
        <interval>INTERVAL_CURFY</interval>
    </timeFrameFilter>
</block>
```

### Efficient Cross-Block Formulas

```xml
<!-- ❌ Inefficient: Multiple complex calculations -->
<aggregates>
    <calculatedFormula>
        (B1#B1_Sum + B2#B2_Sum) / (B1#B1_Count + B2#B2_Count) *
        (B3#B3_Sum / B3#B3_Count) / (B4#B4_Sum / B4#B4_Count)
    </calculatedFormula>
    ...
</aggregates>

<!-- ✅ Efficient: Simple, direct calculations -->
<aggregates>
    <calculatedFormula>B1#B1_Sum / B2#B2_Sum * 100</calculatedFormula>
    ...
</aggregates>
```

### When to Split into Multiple Reports

Consider splitting when:
- More than 5 blocks needed
- Blocks have >500 rows each
- Cross-block formulas become complex (>3 block references)
- Report load time exceeds 10 seconds

---

## 10. Troubleshooting Advanced Issues

### Cross-Block Formula Not Working

**Symptom**: Formula shows 0 or blank

**Causes and Fixes**:

```
1. Missing isCrossBlock flag
   ❌ <isCrossBlock>false</isCrossBlock>
   ✅ <isCrossBlock>true</isCrossBlock>

2. Wrong block reference
   ❌ B1#Amount        (missing aggregate name)
   ✅ B1#B1_SumAmount  (correct aggregate reference)

3. Aggregate doesn't exist
   ❌ B1#NonExistent   (aggregate not defined in block)
   ✅ B1#B1_Revenue    (matches developerName in block)

4. Division by zero
   ❌ B1#Count / B2#Count * 100
   ✅ IF(B2#Count > 0, B1#Count / B2#Count * 100, 0)
```

### Blocks Not Aligning

**Symptom**: Data appears disconnected across blocks

**Fixes**:

```xml
<!-- Ensure common grouping uses correct field syntax -->
<!-- Standard field -->
<groupingsDown>
    <field>ACCOUNT_NAME</field>  <!-- Use report-level field name -->
</groupingsDown>

<!-- Verify field exists in all block report types -->
<!-- Check: Can each report type access this field? -->
```

### Deployment Validation Errors

**Error**: "Invalid field: Object$Field"

**Fix**: Verify field naming convention for joined reports

```
Standard: OPPORTUNITY_NAME
Joined:   Opportunity$Name

Standard: ACCOUNT.NAME
Joined:   Opportunity$Account.Name or Account$Name (depends on context)
```

**Error**: "Block ID already exists"

**Fix**: Ensure unique block IDs

```xml
<block>
    <blockInfo>
        <blockId>B1</blockId>  <!-- Must be unique -->
    </blockInfo>
</block>
<block>
    <blockInfo>
        <blockId>B2</blockId>  <!-- Different ID -->
    </blockInfo>
</block>
```

---

## 11. Migration from UI to API

### Step 1: Create in UI

Build joined report in Salesforce UI to validate structure:
1. Create report with desired blocks
2. Configure columns, filters, aggregates
3. Test with sample data
4. Verify cross-block calculations

### Step 2: Retrieve via CLI

```bash
# Retrieve report metadata
sf project retrieve start \
  --metadata Report:FolderName/Report_Name \
  --target-org production \
  --output-dir retrieved/
```

### Step 3: Analyze XML

```bash
# View retrieved report
cat retrieved/force-app/main/default/reports/FolderName/Report_Name.report-meta.xml
```

### Step 4: Templatize

1. Identify variable elements (names, filters, dates)
2. Replace with template variables `{{VARIABLE}}`
3. Document required variables
4. Create template processor

### Step 5: Test Deployment

```bash
# Validate deployment
sf project deploy start \
  --source-dir force-app/main/default/reports/JoinedReports \
  --target-org sandbox \
  --dry-run

# Deploy to sandbox
sf project deploy start \
  --source-dir force-app/main/default/reports/JoinedReports \
  --target-org sandbox
```

---

## 12. Complete Reference Implementation

### Directory Structure

```
force-app/
└── main/
    └── default/
        └── reports/
            ├── JoinedReports/
            │   ├── Sales_vs_Service.report-meta.xml
            │   ├── Won_vs_Lost_Analysis.report-meta.xml
            │   ├── YoY_Comparison.report-meta.xml
            │   └── Customer_360.report-meta.xml
            └── JoinedReports-meta.xml

templates/
└── reports/
    └── joined/
        ├── sales-service-template.xml
        ├── won-lost-template.xml
        ├── yoy-template.xml
        └── customer360-template.xml

scripts/
└── lib/
    └── joined-report-builder.js
```

### Folder Metadata

```xml
<!-- JoinedReports-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<ReportFolder xmlns="http://soap.sforce.com/2006/04/metadata">
    <name>JoinedReports</name>
    <accessType>Public</accessType>
    <publicFolderAccess>ReadWrite</publicFolderAccess>
</ReportFolder>
```

### Complete Implementation Script

```javascript
/**
 * Complete joined report implementation workflow
 * @see {@link docs/runbooks/report-api-development/06-joined-reports-advanced.md}
 */
const { JoinedReportBuilder } = require('./joined-report-builder');
const fs = require('fs');
const path = require('path');

async function createJoinedReportSuite() {
  const outputDir = 'force-app/main/default/reports/JoinedReports';

  // Ensure directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 1. Sales vs Service
  const salesVsService = new JoinedReportBuilder('Sales_vs_Service', 'AccountWithOpportunities')
    .addCommonGrouping('ACCOUNT_NAME')
    .addBlock({
      id: 'B_SALES',
      columns: ['Opportunity$Name', 'Opportunity$Amount', 'Opportunity$StageName', 'Opportunity$CloseDate'],
      aggregates: [
        { formula: 'Opportunity$Amount:SUM', datatype: 'currency', name: 'B_SALES_Revenue', label: 'Revenue', scale: 0 },
        { formula: 'RowCount', datatype: 'number', name: 'B_SALES_Count', label: 'Deals', scale: 0 }
      ],
      dateFilter: { column: 'CLOSE_DATE', interval: 'INTERVAL_CURFY' }
    })
    .addBlock({
      id: 'B_SERVICE',
      columns: ['Case$CaseNumber', 'Case$Subject', 'Case$Status', 'Case$Priority'],
      aggregates: [
        { formula: 'RowCount', datatype: 'number', name: 'B_SERVICE_Count', label: 'Cases', scale: 0 }
      ]
    })
    .addCrossBlockFormula({
      formula: 'B_SALES#B_SALES_Revenue / B_SERVICE#B_SERVICE_Count',
      datatype: 'currency',
      name: 'Revenue_Per_Case',
      label: 'Revenue/Case',
      scale: 0
    });

  salesVsService.save(path.join(outputDir, 'Sales_vs_Service.report-meta.xml'));

  // 2. Won vs Lost
  const wonVsLost = new JoinedReportBuilder('Won_vs_Lost_Analysis', 'Opportunity')
    .addCommonGrouping('FULL_NAME')
    .addBlock({
      id: 'B_WON',
      columns: ['Opportunity$Name', 'Opportunity$Amount', 'Opportunity$CloseDate'],
      aggregates: [
        { formula: 'Opportunity$Amount:SUM', datatype: 'currency', name: 'B_WON_Revenue', label: 'Won Revenue', scale: 0 },
        { formula: 'RowCount', datatype: 'number', name: 'B_WON_Count', label: 'Won', scale: 0 }
      ],
      filters: [{ column: 'Opportunity$IsWon', operator: 'equals', value: '1' }],
      dateFilter: { column: 'CLOSE_DATE', interval: 'INTERVAL_CURFY' }
    })
    .addBlock({
      id: 'B_LOST',
      columns: ['Opportunity$Name', 'Opportunity$Amount', 'Opportunity$CloseDate'],
      aggregates: [
        { formula: 'Opportunity$Amount:SUM', datatype: 'currency', name: 'B_LOST_Revenue', label: 'Lost Revenue', scale: 0 },
        { formula: 'RowCount', datatype: 'number', name: 'B_LOST_Count', label: 'Lost', scale: 0 }
      ],
      filters: [
        { column: 'Opportunity$IsClosed', operator: 'equals', value: '1' },
        { column: 'Opportunity$IsWon', operator: 'equals', value: '0' }
      ],
      dateFilter: { column: 'CLOSE_DATE', interval: 'INTERVAL_CURFY' }
    })
    .addCrossBlockFormula({
      formula: 'B_WON#B_WON_Count / (B_WON#B_WON_Count + B_LOST#B_LOST_Count) * 100',
      datatype: 'percent',
      name: 'Win_Rate',
      label: 'Win Rate',
      scale: 1
    });

  wonVsLost.save(path.join(outputDir, 'Won_vs_Lost_Analysis.report-meta.xml'));

  console.log('Joined report suite created successfully!');
  console.log(`Output directory: ${outputDir}`);

  return {
    reports: ['Sales_vs_Service', 'Won_vs_Lost_Analysis'],
    outputDir
  };
}

// Run
createJoinedReportSuite()
  .then(result => console.log('Created:', result.reports))
  .catch(err => console.error('Error:', err));
```

---

## Related Runbooks

- **Previous**: [Runbook 05: Joined Reports Basics](05-joined-reports-basics.md) - Multi-block fundamentals
- **Next**: [Runbook 07: Custom Report Types](07-custom-report-types.md) - Creating report types for blocks
- **Format Selection**: [Runbook 01: Report Formats Fundamentals](01-report-formats-fundamentals.md) - Choosing the right format
- **Deployment**: [Runbook 08: Validation & Deployment](08-validation-deployment.md) - Pre-deployment checks

---

**Last Updated**: November 26, 2025
**Maintained By**: Salesforce Plugin Team
**Plugin Version**: v3.51.0
