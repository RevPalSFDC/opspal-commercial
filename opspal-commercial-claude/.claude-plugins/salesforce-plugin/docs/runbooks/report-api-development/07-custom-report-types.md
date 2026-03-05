# Runbook 07: Custom Report Types

> **Series**: Report API Development Runbooks
> **Document**: 07 of 09
> **Focus**: Creating and Managing Custom Report Types via API
> **Complexity**: Advanced
> **Prerequisites**: Runbooks 01-06 (Report Formats)

---

## Table of Contents

1. [Overview](#1-overview)
2. [When to Create Custom Report Types](#2-when-to-create-custom-report-types)
3. [Custom Report Type Architecture](#3-custom-report-type-architecture)
4. [Metadata API: Creating Report Types](#4-metadata-api-creating-report-types)
5. [REST API: Discovering Report Types](#5-rest-api-discovering-report-types)
6. [Relationship Definitions](#6-relationship-definitions)
7. [Field Layouts and Sections](#7-field-layouts-and-sections)
8. [Cross-Object Report Types](#8-cross-object-report-types)
9. [Custom Object Report Types](#9-custom-object-report-types)
10. [Report Type Deployment](#10-report-type-deployment)
11. [Validation and Testing](#11-validation-and-testing)
12. [Common Patterns and Examples](#12-common-patterns-and-examples)
13. [Troubleshooting](#13-troubleshooting)
14. [Quick Reference](#14-quick-reference)

---

## 1. Overview

### What Are Custom Report Types?

Custom Report Types (CRTs) define:
- **Which objects** can be reported on
- **How objects relate** to each other (parent-child relationships)
- **Which fields** are available in reports
- **How fields are organized** in the report builder UI

### Standard vs Custom Report Types

| Aspect | Standard Report Types | Custom Report Types |
|--------|----------------------|---------------------|
| **Creation** | Auto-created by Salesforce | Created by administrators |
| **Objects** | Single object or predefined combinations | Any object combination |
| **Relationships** | Fixed by Salesforce | Configurable (up to 4 levels) |
| **Fields** | All standard/custom fields | Curated field selection |
| **Outer Joins** | Not supported | Supported ("with or without") |
| **Use Case** | Common reporting needs | Specialized reporting needs |

### When Custom Report Types Are Required

```
Standard Report Type Sufficient?
├─ Single object report? → Usually YES (use standard)
├─ Standard object combination?
│   └─ Accounts with Contacts? → YES (standard exists)
│   └─ Opportunities with Products? → YES (standard exists)
│   └─ Cases with Activities? → YES (standard exists)
├─ Custom object reporting? → Usually NEEDS custom RT
├─ Need "with or without" relationships? → NEEDS custom RT
├─ Need curated field list? → NEEDS custom RT
├─ Cross-object custom calculations? → NEEDS custom RT
└─ Reporting on junction objects? → NEEDS custom RT
```

---

## 2. When to Create Custom Report Types

### Decision Matrix

| Scenario | Custom RT Needed? | Why |
|----------|-------------------|-----|
| Report on custom object alone | Sometimes | Standard RT may exist if object was created via UI |
| Custom object with lookup to standard | Yes | No standard RT includes custom objects |
| Standard object with lookup to custom | Yes | Same reason |
| Master-detail on custom objects | Yes | No pre-built relationship |
| "Accounts with or without Contacts" | Yes | Outer join requires custom RT |
| Curated field list for specific team | Yes | Control available fields |
| Hide sensitive fields from reporters | Yes | Field visibility control |
| Junction object reporting | Yes | Many-to-many relationships |
| Activity reporting with custom objects | Yes | Activities have special handling |

### Common Use Cases

**1. Custom Object Hierarchies**
```
Custom_Parent__c
└── Custom_Child__c
    └── Custom_Grandchild__c
```

**2. Standard-to-Custom Relationships**
```
Account
└── Custom_Subscription__c
    └── Custom_Usage__c
```

**3. Many-to-Many Relationships**
```
Contact ←→ Junction_Object__c ←→ Campaign
```

**4. Activity Tracking**
```
Custom_Object__c
└── Tasks (with or without)
└── Events (with or without)
```

---

## 3. Custom Report Type Architecture

### Metadata Structure

```
ReportType/
├── [ReportTypeName].reportType-meta.xml    # Main definition
└── (Referenced in package.xml)
```

### Core Components

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ReportType xmlns="http://soap.sforce.com/2006/04/metadata">
    <!-- Identity -->
    <fullName>Subscriptions_with_Usage</fullName>
    <label>Subscriptions with Usage</label>
    <description>Report on subscriptions and their usage records</description>

    <!-- Deployment -->
    <deployed>true</deployed>

    <!-- Category (determines where RT appears in builder) -->
    <category>other</category>

    <!-- Primary Object (A object) -->
    <baseObject>Subscription__c</baseObject>

    <!-- Relationships (B, C, D objects) -->
    <join>
        <relationship>Usage_Records__r</relationship>
        <outerJoin>true</outerJoin>  <!-- "with or without" -->
    </join>

    <!-- Field Layout Sections -->
    <sections>
        <columns>...</columns>
        <masterLabel>Subscription Information</masterLabel>
    </sections>
</ReportType>
```

### Relationship Levels

Custom Report Types support up to **4 object levels**:

```
Level A (Primary/Base)     → Required, always included
    │
    └── Level B            → Optional, related to A
            │
            └── Level C    → Optional, related to B
                    │
                    └── Level D    → Optional, related to C
```

### Join Types

| Join Type | XML Setting | Behavior |
|-----------|-------------|----------|
| Inner Join | `<outerJoin>false</outerJoin>` | Only records with related records |
| Outer Join | `<outerJoin>true</outerJoin>` | "With or without" related records |

---

## 4. Metadata API: Creating Report Types

### Complete XML Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ReportType xmlns="http://soap.sforce.com/2006/04/metadata">
    <!-- ===== IDENTITY ===== -->
    <fullName>Accounts_with_Opportunities_and_Products</fullName>
    <label>Accounts with Opportunities and Products</label>
    <description>Comprehensive account reporting including opportunity pipeline and product mix</description>

    <!-- ===== DEPLOYMENT STATUS ===== -->
    <!-- Set to false during development, true for production -->
    <deployed>true</deployed>

    <!-- ===== CATEGORY ===== -->
    <!-- Determines grouping in report type selection -->
    <!-- Options: accounts, opportunities, leads, contacts, cases,
                 campaigns, activities, forecasts, files,
                 contracts, products, quotas, other -->
    <category>accounts</category>

    <!-- ===== PRIMARY OBJECT (A) ===== -->
    <baseObject>Account</baseObject>

    <!-- ===== RELATED OBJECT (B) ===== -->
    <join>
        <!-- Child relationship name from A to B -->
        <relationship>Opportunities</relationship>

        <!-- Inner (false) or Outer (true) join -->
        <outerJoin>false</outerJoin>

        <!-- ===== NESTED RELATED OBJECT (C) ===== -->
        <join>
            <relationship>OpportunityLineItems</relationship>
            <outerJoin>true</outerJoin>
        </join>
    </join>

    <!-- ===== FIELD LAYOUT SECTIONS ===== -->
    <sections>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Id</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Name</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Industry</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>AnnualRevenue</field>
            <table>Account</table>
        </columns>
        <masterLabel>Account Information</masterLabel>
    </sections>

    <sections>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Name</field>
            <table>Account.Opportunities</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Amount</field>
            <table>Account.Opportunities</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>StageName</field>
            <table>Account.Opportunities</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>CloseDate</field>
            <table>Account.Opportunities</table>
        </columns>
        <masterLabel>Opportunity Information</masterLabel>
    </sections>

    <sections>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Product2.Name</field>
            <table>Account.Opportunities.OpportunityLineItems</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Quantity</field>
            <table>Account.Opportunities.OpportunityLineItems</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>TotalPrice</field>
            <table>Account.Opportunities.OpportunityLineItems</table>
        </columns>
        <masterLabel>Product Information</masterLabel>
    </sections>
</ReportType>
```

### Category Reference

```javascript
const REPORT_TYPE_CATEGORIES = {
    // Standard Categories
    'accounts': 'Account Reports',
    'opportunities': 'Opportunity Reports',
    'leads': 'Lead Reports',
    'contacts': 'Contact Reports',
    'cases': 'Case Reports',
    'campaigns': 'Campaign Reports',
    'activities': 'Activity Reports',
    'forecasts': 'Forecast Reports',
    'files': 'File Reports',
    'contracts': 'Contract Reports',
    'products': 'Product Reports',
    'quotas': 'Quota Reports',
    'other': 'Other Reports',

    // Additional Standard Categories
    'adminreports': 'Administrative Reports',
    'territory': 'Territory Reports'
};

// Best Practice: Match category to primary object type
function suggestCategory(baseObject) {
    const categoryMap = {
        'Account': 'accounts',
        'Opportunity': 'opportunities',
        'Lead': 'leads',
        'Contact': 'contacts',
        'Case': 'cases',
        'Campaign': 'campaigns',
        'Task': 'activities',
        'Event': 'activities',
        'Contract': 'contracts',
        'Product2': 'products'
    };

    return categoryMap[baseObject] || 'other';
}
```

### File System Structure

```
force-app/
└── main/
    └── default/
        └── reportTypes/
            ├── Accounts_with_Subscriptions.reportType-meta.xml
            ├── Subscriptions_with_Usage.reportType-meta.xml
            └── Contact_Campaign_History.reportType-meta.xml
```

### Package.xml Entry

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>Accounts_with_Subscriptions</members>
        <members>Subscriptions_with_Usage</members>
        <members>Contact_Campaign_History</members>
        <name>ReportType</name>
    </types>
    <version>62.0</version>
</Package>
```

---

## 5. REST API: Discovering Report Types

### List All Report Types

```bash
# Get all available report types
sf data query --query "
    SELECT
        DeveloperName,
        MasterLabel,
        SobjectType,
        IsActive
    FROM ReportType
    ORDER BY MasterLabel
" --use-tooling-api --json
```

### Describe Specific Report Type

```bash
# Using MCP tool
# mcp_salesforce_report_type_describe

# REST API endpoint
GET /services/data/v62.0/analytics/reportTypes/{reportType}
```

### Report Type Describe Response

```json
{
    "reportTypeMetadata": {
        "name": "AccountOpportunity",
        "label": "Accounts with Opportunities",
        "reportTypeCategories": [
            {
                "name": "accounts",
                "label": "Account Reports"
            }
        ],
        "reportTypeRelationships": [
            {
                "objectName": "Account",
                "alias": "ACCOUNT",
                "parentRelationshipName": null
            },
            {
                "objectName": "Opportunity",
                "alias": "OPPORTUNITY",
                "parentRelationshipName": "Account.Opportunities"
            }
        ]
    },
    "reportExtendedMetadata": {
        "detailColumnInfo": {
            "ACCOUNT_ID": {
                "dataType": "id",
                "label": "Account ID",
                "apiName": "Account.Id"
            },
            "ACCOUNT_NAME": {
                "dataType": "string",
                "label": "Account Name",
                "apiName": "Account.Name"
            },
            "OPPORTUNITY_NAME": {
                "dataType": "string",
                "label": "Opportunity Name",
                "apiName": "Opportunity.Name"
            }
        },
        "groupingColumnInfo": {...},
        "aggregateColumnInfo": {...}
    }
}
```

### List Available Fields for Report Type

```javascript
/**
 * Get all available fields for a report type
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} reportTypeName - API name of report type
 * @returns {Promise<Object>} Field information organized by object
 */
async function getReportTypeFields(orgAlias, reportTypeName) {
    const { execSync } = require('child_process');

    // Get report type describe
    const describeCmd = `sf api request rest /services/data/v62.0/analytics/reportTypes/${reportTypeName} --target-org ${orgAlias}`;
    const result = JSON.parse(execSync(describeCmd, { encoding: 'utf-8' }));

    const fieldsByObject = {};

    // Process detail columns (available for grouping and display)
    if (result.reportExtendedMetadata?.detailColumnInfo) {
        for (const [key, info] of Object.entries(result.reportExtendedMetadata.detailColumnInfo)) {
            const objectName = extractObjectFromFieldKey(key);

            if (!fieldsByObject[objectName]) {
                fieldsByObject[objectName] = {
                    detailColumns: [],
                    groupableColumns: [],
                    aggregateColumns: []
                };
            }

            fieldsByObject[objectName].detailColumns.push({
                apiName: key,
                label: info.label,
                dataType: info.dataType,
                filterable: info.filterable,
                sortable: info.sortable
            });
        }
    }

    // Process grouping columns
    if (result.reportExtendedMetadata?.groupingColumnInfo) {
        for (const [key, info] of Object.entries(result.reportExtendedMetadata.groupingColumnInfo)) {
            const objectName = extractObjectFromFieldKey(key);
            if (fieldsByObject[objectName]) {
                fieldsByObject[objectName].groupableColumns.push({
                    apiName: key,
                    label: info.label,
                    dataType: info.dataType,
                    bucketable: info.bucketable
                });
            }
        }
    }

    return fieldsByObject;
}

function extractObjectFromFieldKey(fieldKey) {
    // Field keys are formatted like OBJECT_FIELDNAME or OBJECT.RELATIONSHIP_FIELDNAME
    const parts = fieldKey.split('_');
    return parts[0];
}
```

### Check If Report Type Exists

```javascript
/**
 * Check if a custom report type exists in the org
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} reportTypeName - API name to check
 * @returns {Promise<boolean>}
 */
async function reportTypeExists(orgAlias, reportTypeName) {
    const { execSync } = require('child_process');

    try {
        const query = `
            SELECT Id, DeveloperName
            FROM ReportType
            WHERE DeveloperName = '${reportTypeName}'
        `;

        const result = JSON.parse(execSync(
            `sf data query --query "${query}" --use-tooling-api --target-org ${orgAlias} --json`,
            { encoding: 'utf-8' }
        ));

        return result.result.records.length > 0;
    } catch (error) {
        return false;
    }
}
```

---

## 6. Relationship Definitions

### Understanding Salesforce Relationships

```
Relationship Types:
├── Lookup (many-to-one)
│   └── Child object has lookup field to parent
│   └── Accessed via child relationship name on parent
│   └── Example: Contact.AccountId → Account
│
├── Master-Detail (many-to-one, strict)
│   └── Child cannot exist without parent
│   └── Roll-up summaries possible
│   └── Example: OpportunityLineItem → Opportunity
│
└── Many-to-Many (via Junction Object)
    └── Two master-detail relationships
    └── Example: Contact ←→ CampaignMember ←→ Campaign
```

### Finding Child Relationship Names

```bash
# Describe parent object to find child relationships
sf sobject describe Account --json | jq '.childRelationships[] | {name: .relationshipName, object: .childSObject}'
```

**Example Output:**
```json
[
    {"name": "Contacts", "object": "Contact"},
    {"name": "Opportunities", "object": "Opportunity"},
    {"name": "Cases", "object": "Case"},
    {"name": "Notes", "object": "Note"},
    {"name": "AttachedContentDocuments", "object": "ContentDocumentLink"}
]
```

### Custom Object Relationship Names

For custom objects, relationship names follow patterns:

```
Standard Lookup to Custom:
├── Field: Account__c (lookup to Account)
└── Relationship Name: Account__r (from custom object perspective)
└── Child Relationship: Custom_Objects__r (from Account perspective)

Custom-to-Custom Lookup:
├── Field: Parent_Custom__c (lookup to Parent_Custom__c)
└── Relationship Name: Parent_Custom__r
└── Child Relationship: Child_Customs__r

Master-Detail:
├── Similar to lookup but relationship is required
└── Roll-up summary fields available on parent
```

### Relationship Discovery Script

```javascript
/**
 * Discover available relationships for building report types
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} objectName - Object to analyze
 * @returns {Promise<Object>} Relationship information
 */
async function discoverRelationships(orgAlias, objectName) {
    const { execSync } = require('child_process');

    // Get object describe
    const describeResult = JSON.parse(execSync(
        `sf sobject describe ${objectName} --target-org ${orgAlias} --json`,
        { encoding: 'utf-8' }
    ));

    const describe = describeResult.result;

    return {
        objectName,
        label: describe.label,

        // Parent relationships (this object looks up to others)
        parentRelationships: describe.fields
            .filter(f => f.type === 'reference' && f.relationshipName)
            .map(f => ({
                fieldName: f.name,
                relationshipName: f.relationshipName,
                referenceTo: f.referenceTo,
                required: !f.nillable
            })),

        // Child relationships (other objects look up to this)
        childRelationships: describe.childRelationships
            .filter(cr => cr.relationshipName)
            .map(cr => ({
                relationshipName: cr.relationshipName,
                childObject: cr.childSObject,
                fieldOnChild: cr.field,
                cascadeDelete: cr.cascadeDelete
            }))
    };
}

// Usage example
async function buildRelationshipMap(orgAlias, baseObject, depth = 3) {
    const visited = new Set();
    const relationshipMap = {};

    async function explore(objectName, currentDepth, path) {
        if (currentDepth > depth || visited.has(objectName)) return;
        visited.add(objectName);

        const relationships = await discoverRelationships(orgAlias, objectName);
        relationshipMap[objectName] = {
            path,
            ...relationships
        };

        // Explore child relationships
        for (const child of relationships.childRelationships) {
            await explore(
                child.childObject,
                currentDepth + 1,
                `${path} → ${child.relationshipName}`
            );
        }
    }

    await explore(baseObject, 1, baseObject);
    return relationshipMap;
}
```

### Join Configuration Examples

**Inner Join (With Related Records Only)**
```xml
<join>
    <relationship>Opportunities</relationship>
    <outerJoin>false</outerJoin>
</join>
```
*Result: Only accounts that have at least one opportunity*

**Outer Join (With or Without Related Records)**
```xml
<join>
    <relationship>Opportunities</relationship>
    <outerJoin>true</outerJoin>
</join>
```
*Result: All accounts, including those without opportunities*

**Nested Joins (3+ Levels)**
```xml
<join>
    <relationship>Opportunities</relationship>
    <outerJoin>false</outerJoin>
    <join>
        <relationship>OpportunityLineItems</relationship>
        <outerJoin>true</outerJoin>
        <join>
            <relationship>PricebookEntry</relationship>
            <outerJoin>false</outerJoin>
        </join>
    </join>
</join>
```

---

## 7. Field Layouts and Sections

### Section Structure

Field layouts control how fields appear in the report builder UI:

```xml
<sections>
    <!-- Each section groups related fields -->
    <columns>
        <!-- Individual field definitions -->
        <checkedByDefault>true</checkedByDefault>
        <field>Name</field>
        <table>Account</table>
    </columns>
    <masterLabel>Account Information</masterLabel>
</sections>
```

### Column Properties

| Property | Description | Values |
|----------|-------------|--------|
| `checkedByDefault` | Pre-selected in report builder | `true` / `false` |
| `field` | API name of field | Standard or custom field name |
| `table` | Object path | Object name or relationship path |

### Table Path Syntax

```xml
<!-- Level A (Base Object) -->
<table>Account</table>

<!-- Level B (First Child) -->
<table>Account.Opportunities</table>

<!-- Level C (Second Child) -->
<table>Account.Opportunities.OpportunityLineItems</table>

<!-- Level D (Third Child) -->
<table>Account.Opportunities.OpportunityLineItems.PricebookEntry</table>
```

### Building Sections Programmatically

```javascript
/**
 * Generate field layout sections for a report type
 */
class ReportTypeSectionBuilder {
    constructor() {
        this.sections = [];
    }

    /**
     * Add a section for an object in the report type
     * @param {Object} config Section configuration
     */
    addSection(config) {
        const {
            label,
            tablePath,
            fields,
            defaultFields = []
        } = config;

        const columns = fields.map(field => {
            const fieldName = typeof field === 'string' ? field : field.name;
            const isDefault = typeof field === 'string'
                ? defaultFields.includes(fieldName)
                : field.default === true;

            return {
                checkedByDefault: isDefault,
                field: fieldName,
                table: tablePath
            };
        });

        this.sections.push({
            masterLabel: label,
            columns
        });

        return this;
    }

    /**
     * Generate XML for all sections
     */
    generateXML() {
        let xml = '';

        for (const section of this.sections) {
            xml += '    <sections>\n';

            for (const col of section.columns) {
                xml += '        <columns>\n';
                xml += `            <checkedByDefault>${col.checkedByDefault}</checkedByDefault>\n`;
                xml += `            <field>${col.field}</field>\n`;
                xml += `            <table>${col.table}</table>\n`;
                xml += '        </columns>\n';
            }

            xml += `        <masterLabel>${section.masterLabel}</masterLabel>\n`;
            xml += '    </sections>\n';
        }

        return xml;
    }

    /**
     * Get sections as JSON (for programmatic use)
     */
    toJSON() {
        return this.sections;
    }
}

// Usage
const sectionBuilder = new ReportTypeSectionBuilder();

sectionBuilder
    .addSection({
        label: 'Account Information',
        tablePath: 'Account',
        fields: [
            { name: 'Id', default: false },
            { name: 'Name', default: true },
            { name: 'Industry', default: false },
            { name: 'Type', default: false },
            { name: 'AnnualRevenue', default: true }
        ]
    })
    .addSection({
        label: 'Opportunity Details',
        tablePath: 'Account.Opportunities',
        fields: [
            { name: 'Id', default: false },
            { name: 'Name', default: true },
            { name: 'Amount', default: true },
            { name: 'StageName', default: true },
            { name: 'CloseDate', default: false },
            { name: 'Probability', default: false }
        ]
    });

console.log(sectionBuilder.generateXML());
```

### Best Practices for Field Selection

```javascript
/**
 * Field selection guidelines for report type layouts
 */
const FIELD_SELECTION_GUIDELINES = {
    // Always include these for each object
    required: ['Id', 'Name', 'CreatedDate', 'LastModifiedDate'],

    // Default to checked for common reporting needs
    defaultChecked: {
        'Account': ['Name', 'Industry', 'Type', 'AnnualRevenue', 'Owner.Name'],
        'Opportunity': ['Name', 'Amount', 'StageName', 'CloseDate'],
        'Contact': ['Name', 'Email', 'Title', 'Account.Name'],
        'Lead': ['Name', 'Company', 'Status', 'LeadSource'],
        'Case': ['CaseNumber', 'Subject', 'Status', 'Priority']
    },

    // Exclude these (too technical or rarely useful)
    exclude: [
        'IsDeleted', 'SystemModstamp', 'MasterRecordId',
        'PhotoUrl', 'LastViewedDate', 'LastReferencedDate'
    ],

    // Group by functional area
    sectionOrganization: {
        'identification': ['Name', 'Id', 'RecordType.Name'],
        'ownership': ['Owner.Name', 'CreatedBy.Name', 'LastModifiedBy.Name'],
        'dates': ['CreatedDate', 'LastModifiedDate', 'CloseDate'],
        'financials': ['Amount', 'AnnualRevenue', 'ExpectedRevenue'],
        'status': ['Status', 'StageName', 'Type', 'Priority']
    }
};

/**
 * Auto-generate recommended field layout for an object
 */
async function generateRecommendedLayout(orgAlias, objectName, tablePath) {
    const { execSync } = require('child_process');

    const describe = JSON.parse(execSync(
        `sf sobject describe ${objectName} --target-org ${orgAlias} --json`,
        { encoding: 'utf-8' }
    )).result;

    const fields = describe.fields
        .filter(f => {
            // Exclude certain field types and names
            if (FIELD_SELECTION_GUIDELINES.exclude.includes(f.name)) return false;
            if (f.type === 'base64') return false;  // Binary fields
            if (f.deprecatedAndHidden) return false;
            return true;
        })
        .map(f => ({
            name: f.name,
            label: f.label,
            type: f.type,
            default: FIELD_SELECTION_GUIDELINES.required.includes(f.name) ||
                     (FIELD_SELECTION_GUIDELINES.defaultChecked[objectName] || []).includes(f.name)
        }))
        .sort((a, b) => {
            // Sort: defaults first, then alphabetically
            if (a.default !== b.default) return b.default - a.default;
            return a.label.localeCompare(b.label);
        });

    return {
        label: `${describe.label} Information`,
        tablePath,
        fields
    };
}
```

---

## 8. Cross-Object Report Types

### Multi-Object Architecture Patterns

**Pattern 1: Standard Hierarchy**
```
Account (A)
└── Opportunity (B)
    └── OpportunityLineItem (C)
        └── Product2 (D) via PricebookEntry
```

**Pattern 2: Account-Centric**
```
Account (A)
├── Contacts (B) - outer join
├── Opportunities (B) - inner join
└── Cases (B) - outer join
```
*Note: Only ONE B-level relationship in a single report type*

**Pattern 3: Activity Tracking**
```
Custom_Object__c (A)
└── Activities (B) - OpenActivities or ActivityHistories
    └── (polymorphic - Tasks and Events)
```

### Complete Cross-Object Example

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ReportType xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Accounts_Opps_Products_Revenue</fullName>
    <label>Accounts with Opportunities, Products, and Revenue</label>
    <description>Comprehensive account pipeline analysis including product mix</description>
    <deployed>true</deployed>
    <category>accounts</category>

    <!-- Level A: Account -->
    <baseObject>Account</baseObject>

    <!-- Level B: Opportunity -->
    <join>
        <relationship>Opportunities</relationship>
        <outerJoin>false</outerJoin>

        <!-- Level C: OpportunityLineItem -->
        <join>
            <relationship>OpportunityLineItems</relationship>
            <outerJoin>true</outerJoin>
        </join>
    </join>

    <!-- Account Fields -->
    <sections>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Name</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Industry</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Type</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>AnnualRevenue</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>NumberOfEmployees</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>BillingCountry</field>
            <table>Account</table>
        </columns>
        <masterLabel>Account Information</masterLabel>
    </sections>

    <!-- Opportunity Fields -->
    <sections>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Name</field>
            <table>Account.Opportunities</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Amount</field>
            <table>Account.Opportunities</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>StageName</field>
            <table>Account.Opportunities</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>CloseDate</field>
            <table>Account.Opportunities</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Probability</field>
            <table>Account.Opportunities</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>ExpectedRevenue</field>
            <table>Account.Opportunities</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Type</field>
            <table>Account.Opportunities</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>LeadSource</field>
            <table>Account.Opportunities</table>
        </columns>
        <masterLabel>Opportunity Details</masterLabel>
    </sections>

    <!-- Product Fields (via Line Items) -->
    <sections>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Product2.Name</field>
            <table>Account.Opportunities.OpportunityLineItems</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Product2.ProductCode</field>
            <table>Account.Opportunities.OpportunityLineItems</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Product2.Family</field>
            <table>Account.Opportunities.OpportunityLineItems</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Quantity</field>
            <table>Account.Opportunities.OpportunityLineItems</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>UnitPrice</field>
            <table>Account.Opportunities.OpportunityLineItems</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>TotalPrice</field>
            <table>Account.Opportunities.OpportunityLineItems</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Discount</field>
            <table>Account.Opportunities.OpportunityLineItems</table>
        </columns>
        <masterLabel>Product Mix</masterLabel>
    </sections>
</ReportType>
```

### Handling Polymorphic Relationships

Activities (Tasks/Events) are polymorphic - they can relate to many different objects:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ReportType xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Accounts_with_All_Activities</fullName>
    <label>Accounts with All Activities</label>
    <description>Accounts with their associated tasks and events</description>
    <deployed>true</deployed>
    <category>activities</category>

    <baseObject>Account</baseObject>

    <!-- Using ActivityHistories for completed activities -->
    <join>
        <relationship>ActivityHistories</relationship>
        <outerJoin>true</outerJoin>
    </join>

    <sections>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Name</field>
            <table>Account</table>
        </columns>
        <masterLabel>Account</masterLabel>
    </sections>

    <sections>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Subject</field>
            <table>Account.ActivityHistories</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>ActivityDate</field>
            <table>Account.ActivityHistories</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>ActivityType</field>
            <table>Account.ActivityHistories</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Status</field>
            <table>Account.ActivityHistories</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Owner.Name</field>
            <table>Account.ActivityHistories</table>
        </columns>
        <masterLabel>Activity History</masterLabel>
    </sections>
</ReportType>
```

**Activity Relationship Names:**
- `OpenActivities` - Open tasks and future events
- `ActivityHistories` - Completed tasks and past events
- `Tasks` - All tasks (open and closed)
- `Events` - All events (past and future)

---

## 9. Custom Object Report Types

### Single Custom Object Report Type

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ReportType xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Subscription_Report</fullName>
    <label>Subscriptions</label>
    <description>Report on subscription custom object</description>
    <deployed>true</deployed>
    <category>other</category>

    <baseObject>Subscription__c</baseObject>

    <sections>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Name</field>
            <table>Subscription__c</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Account__r.Name</field>
            <table>Subscription__c</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Status__c</field>
            <table>Subscription__c</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>MRR__c</field>
            <table>Subscription__c</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Start_Date__c</field>
            <table>Subscription__c</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>End_Date__c</field>
            <table>Subscription__c</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Renewal_Date__c</field>
            <table>Subscription__c</table>
        </columns>
        <masterLabel>Subscription Information</masterLabel>
    </sections>
</ReportType>
```

### Custom Object Hierarchy Report Type

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ReportType xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Subscriptions_with_Usage</fullName>
    <label>Subscriptions with Usage Records</label>
    <description>Subscription tracking with associated usage data</description>
    <deployed>true</deployed>
    <category>other</category>

    <!-- Master object -->
    <baseObject>Subscription__c</baseObject>

    <!-- Detail object (master-detail relationship) -->
    <join>
        <relationship>Usage_Records__r</relationship>
        <outerJoin>true</outerJoin>
    </join>

    <!-- Subscription Section -->
    <sections>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Name</field>
            <table>Subscription__c</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Account__r.Name</field>
            <table>Subscription__c</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Product__r.Name</field>
            <table>Subscription__c</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Status__c</field>
            <table>Subscription__c</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Quantity__c</field>
            <table>Subscription__c</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Unit_Price__c</field>
            <table>Subscription__c</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>MRR__c</field>
            <table>Subscription__c</table>
        </columns>
        <masterLabel>Subscription Details</masterLabel>
    </sections>

    <!-- Usage Section -->
    <sections>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Name</field>
            <table>Subscription__c.Usage_Records__r</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Usage_Date__c</field>
            <table>Subscription__c.Usage_Records__r</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Quantity_Used__c</field>
            <table>Subscription__c.Usage_Records__r</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Usage_Type__c</field>
            <table>Subscription__c.Usage_Records__r</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Unit_of_Measure__c</field>
            <table>Subscription__c.Usage_Records__r</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Overage_Flag__c</field>
            <table>Subscription__c.Usage_Records__r</table>
        </columns>
        <masterLabel>Usage Records</masterLabel>
    </sections>
</ReportType>
```

### Standard-to-Custom Report Type

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ReportType xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Accounts_with_Subscriptions</fullName>
    <label>Accounts with Subscriptions</label>
    <description>Account reporting including custom subscription data</description>
    <deployed>true</deployed>
    <category>accounts</category>

    <baseObject>Account</baseObject>

    <join>
        <relationship>Subscriptions__r</relationship>
        <outerJoin>true</outerJoin>

        <join>
            <relationship>Usage_Records__r</relationship>
            <outerJoin>true</outerJoin>
        </join>
    </join>

    <!-- Account Fields -->
    <sections>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Name</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Industry</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Type</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>AnnualRevenue</field>
            <table>Account</table>
        </columns>
        <masterLabel>Account Information</masterLabel>
    </sections>

    <!-- Subscription Fields -->
    <sections>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Name</field>
            <table>Account.Subscriptions__r</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Status__c</field>
            <table>Account.Subscriptions__r</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>MRR__c</field>
            <table>Account.Subscriptions__r</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Start_Date__c</field>
            <table>Account.Subscriptions__r</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>End_Date__c</field>
            <table>Account.Subscriptions__r</table>
        </columns>
        <masterLabel>Subscription Details</masterLabel>
    </sections>

    <!-- Usage Fields -->
    <sections>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Usage_Date__c</field>
            <table>Account.Subscriptions__r.Usage_Records__r</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Quantity_Used__c</field>
            <table>Account.Subscriptions__r.Usage_Records__r</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Usage_Type__c</field>
            <table>Account.Subscriptions__r.Usage_Records__r</table>
        </columns>
        <masterLabel>Usage Information</masterLabel>
    </sections>
</ReportType>
```

---

## 10. Report Type Deployment

### Deployment via SF CLI

**1. Create Directory Structure**
```bash
mkdir -p force-app/main/default/reportTypes
```

**2. Save Report Type XML**
```bash
# Save your report type file
cat > force-app/main/default/reportTypes/Custom_Report_Type.reportType-meta.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<ReportType xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Custom_Report_Type</fullName>
    <label>Custom Report Type</label>
    <description>Description here</description>
    <deployed>true</deployed>
    <category>other</category>
    <baseObject>Account</baseObject>
    <sections>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Name</field>
            <table>Account</table>
        </columns>
        <masterLabel>Account Information</masterLabel>
    </sections>
</ReportType>
EOF
```

**3. Deploy**
```bash
# Deploy to sandbox
sf project deploy start \
    --source-dir force-app/main/default/reportTypes \
    --target-org sandbox-alias

# Deploy to production
sf project deploy start \
    --source-dir force-app/main/default/reportTypes \
    --target-org production-alias \
    --test-level RunLocalTests
```

### Deployment Script

```javascript
/**
 * Deploy custom report types with validation
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ReportTypeDeployer {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.reportTypesDir = 'force-app/main/default/reportTypes';
    }

    /**
     * Validate report type XML before deployment
     */
    validateReportType(filePath) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const errors = [];

        // Check required elements
        if (!content.includes('<fullName>')) {
            errors.push('Missing required element: fullName');
        }
        if (!content.includes('<label>')) {
            errors.push('Missing required element: label');
        }
        if (!content.includes('<baseObject>')) {
            errors.push('Missing required element: baseObject');
        }
        if (!content.includes('<deployed>')) {
            errors.push('Missing required element: deployed');
        }
        if (!content.includes('<category>')) {
            errors.push('Missing required element: category');
        }

        // Check for at least one section
        if (!content.includes('<sections>')) {
            errors.push('Missing required element: sections (at least one required)');
        }

        // Validate XML structure
        try {
            // Basic XML validation
            if (!content.startsWith('<?xml')) {
                errors.push('Missing XML declaration');
            }
        } catch (e) {
            errors.push(`XML parsing error: ${e.message}`);
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Check if base object exists in org
     */
    async validateBaseObject(objectName) {
        try {
            execSync(
                `sf sobject describe ${objectName} --target-org ${this.orgAlias} --json`,
                { encoding: 'utf-8', stdio: 'pipe' }
            );
            return { exists: true };
        } catch (error) {
            return { exists: false, error: `Object '${objectName}' not found in org` };
        }
    }

    /**
     * Deploy a single report type
     */
    async deploySingle(reportTypePath) {
        const fileName = path.basename(reportTypePath);
        const reportTypeName = fileName.replace('.reportType-meta.xml', '');

        console.log(`\nDeploying report type: ${reportTypeName}`);

        // Validate XML
        const validation = this.validateReportType(reportTypePath);
        if (!validation.valid) {
            console.error('Validation errors:');
            validation.errors.forEach(e => console.error(`  - ${e}`));
            return { success: false, errors: validation.errors };
        }

        // Deploy
        try {
            const result = execSync(
                `sf project deploy start --source-dir "${reportTypePath}" --target-org ${this.orgAlias} --json`,
                { encoding: 'utf-8' }
            );

            const deployResult = JSON.parse(result);

            if (deployResult.status === 0) {
                console.log(`✓ Successfully deployed: ${reportTypeName}`);
                return { success: true };
            } else {
                console.error(`✗ Deployment failed: ${reportTypeName}`);
                return {
                    success: false,
                    errors: deployResult.result?.details?.componentFailures || ['Unknown error']
                };
            }
        } catch (error) {
            const errorMsg = error.message || 'Deployment failed';
            console.error(`✗ Error deploying ${reportTypeName}: ${errorMsg}`);
            return { success: false, errors: [errorMsg] };
        }
    }

    /**
     * Deploy all report types in directory
     */
    async deployAll() {
        if (!fs.existsSync(this.reportTypesDir)) {
            console.error(`Directory not found: ${this.reportTypesDir}`);
            return { success: false, errors: ['Directory not found'] };
        }

        const files = fs.readdirSync(this.reportTypesDir)
            .filter(f => f.endsWith('.reportType-meta.xml'));

        if (files.length === 0) {
            console.log('No report types found to deploy');
            return { success: true, deployed: 0 };
        }

        console.log(`Found ${files.length} report type(s) to deploy`);

        const results = {
            success: true,
            deployed: 0,
            failed: 0,
            errors: []
        };

        for (const file of files) {
            const filePath = path.join(this.reportTypesDir, file);
            const result = await this.deploySingle(filePath);

            if (result.success) {
                results.deployed++;
            } else {
                results.failed++;
                results.success = false;
                results.errors.push({
                    file,
                    errors: result.errors
                });
            }
        }

        console.log(`\nDeployment Summary:`);
        console.log(`  Deployed: ${results.deployed}`);
        console.log(`  Failed: ${results.failed}`);

        return results;
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const orgAlias = args[0];
    const action = args[1] || 'all';
    const target = args[2];

    if (!orgAlias) {
        console.error('Usage: node deploy-report-types.js <org-alias> [all|single] [file-path]');
        process.exit(1);
    }

    const deployer = new ReportTypeDeployer(orgAlias);

    if (action === 'single' && target) {
        deployer.deploySingle(target).then(result => {
            process.exit(result.success ? 0 : 1);
        });
    } else {
        deployer.deployAll().then(result => {
            process.exit(result.success ? 0 : 1);
        });
    }
}

module.exports = { ReportTypeDeployer };
```

### Package.xml for Report Types

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>*</members>
        <name>ReportType</name>
    </types>
    <version>62.0</version>
</Package>
```

Or for specific report types:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>Accounts_with_Subscriptions</members>
        <members>Subscriptions_with_Usage</members>
        <members>Contact_Campaign_Analysis</members>
        <name>ReportType</name>
    </types>
    <version>62.0</version>
</Package>
```

### Retrieve Existing Report Types

```bash
# Retrieve all report types
sf project retrieve start \
    --metadata "ReportType:*" \
    --target-org your-org-alias

# Retrieve specific report types
sf project retrieve start \
    --metadata "ReportType:Accounts_with_Subscriptions" \
    --metadata "ReportType:Custom_Opportunity_Report" \
    --target-org your-org-alias

# Using package.xml
sf project retrieve start \
    --manifest manifest/package.xml \
    --target-org your-org-alias
```

---

## 11. Validation and Testing

### Pre-Deployment Validation

```javascript
/**
 * Comprehensive report type validation
 */
class ReportTypeValidator {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
    }

    /**
     * Validate all aspects of a report type definition
     */
    async validate(xmlContent) {
        const results = {
            valid: true,
            errors: [],
            warnings: []
        };

        // Parse XML
        const parsed = this.parseReportTypeXML(xmlContent);
        if (!parsed.success) {
            results.valid = false;
            results.errors.push(parsed.error);
            return results;
        }

        const rt = parsed.data;

        // Validate required elements
        this.validateRequiredElements(rt, results);

        // Validate base object exists
        await this.validateBaseObject(rt.baseObject, results);

        // Validate relationships
        if (rt.joins) {
            await this.validateRelationships(rt.baseObject, rt.joins, results);
        }

        // Validate sections and fields
        await this.validateSections(rt, results);

        // Check for best practice violations
        this.checkBestPractices(rt, results);

        results.valid = results.errors.length === 0;
        return results;
    }

    parseReportTypeXML(xmlContent) {
        // Basic XML parsing (in production, use proper XML parser)
        try {
            const extractValue = (tag) => {
                const match = xmlContent.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
                return match ? match[1] : null;
            };

            return {
                success: true,
                data: {
                    fullName: extractValue('fullName'),
                    label: extractValue('label'),
                    description: extractValue('description'),
                    deployed: extractValue('deployed') === 'true',
                    category: extractValue('category'),
                    baseObject: extractValue('baseObject'),
                    joins: this.extractJoins(xmlContent),
                    sections: this.extractSections(xmlContent)
                }
            };
        } catch (error) {
            return { success: false, error: `XML parsing failed: ${error.message}` };
        }
    }

    extractJoins(xmlContent) {
        const joins = [];
        const joinMatches = xmlContent.matchAll(/<join>([\s\S]*?)<\/join>/g);

        for (const match of joinMatches) {
            const joinContent = match[1];
            const relationship = joinContent.match(/<relationship>([^<]+)<\/relationship>/)?.[1];
            const outerJoin = joinContent.match(/<outerJoin>([^<]+)<\/outerJoin>/)?.[1] === 'true';

            if (relationship) {
                joins.push({ relationship, outerJoin });
            }
        }

        return joins;
    }

    extractSections(xmlContent) {
        const sections = [];
        const sectionMatches = xmlContent.matchAll(/<sections>([\s\S]*?)<\/sections>/g);

        for (const match of sectionMatches) {
            const sectionContent = match[1];
            const masterLabel = sectionContent.match(/<masterLabel>([^<]+)<\/masterLabel>/)?.[1];

            const columns = [];
            const columnMatches = sectionContent.matchAll(/<columns>([\s\S]*?)<\/columns>/g);

            for (const colMatch of columnMatches) {
                const colContent = colMatch[1];
                columns.push({
                    field: colContent.match(/<field>([^<]+)<\/field>/)?.[1],
                    table: colContent.match(/<table>([^<]+)<\/table>/)?.[1],
                    checkedByDefault: colContent.match(/<checkedByDefault>([^<]+)<\/checkedByDefault>/)?.[1] === 'true'
                });
            }

            sections.push({ masterLabel, columns });
        }

        return sections;
    }

    validateRequiredElements(rt, results) {
        const required = ['fullName', 'label', 'baseObject', 'category'];

        for (const field of required) {
            if (!rt[field]) {
                results.errors.push(`Missing required element: ${field}`);
            }
        }

        // Validate category value
        const validCategories = [
            'accounts', 'opportunities', 'leads', 'contacts', 'cases',
            'campaigns', 'activities', 'forecasts', 'files', 'contracts',
            'products', 'quotas', 'other', 'adminreports', 'territory'
        ];

        if (rt.category && !validCategories.includes(rt.category)) {
            results.errors.push(`Invalid category: ${rt.category}. Valid values: ${validCategories.join(', ')}`);
        }

        // Check fullName format
        if (rt.fullName && !/^[A-Za-z][A-Za-z0-9_]*$/.test(rt.fullName)) {
            results.errors.push('fullName must start with letter and contain only alphanumeric characters and underscores');
        }
    }

    async validateBaseObject(objectName, results) {
        if (!objectName) return;

        const { execSync } = require('child_process');

        try {
            execSync(
                `sf sobject describe ${objectName} --target-org ${this.orgAlias} --json`,
                { encoding: 'utf-8', stdio: 'pipe' }
            );
        } catch (error) {
            results.errors.push(`Base object '${objectName}' does not exist in target org`);
        }
    }

    async validateRelationships(baseObject, joins, results) {
        const { execSync } = require('child_process');

        try {
            const describe = JSON.parse(execSync(
                `sf sobject describe ${baseObject} --target-org ${this.orgAlias} --json`,
                { encoding: 'utf-8', stdio: 'pipe' }
            )).result;

            const childRelationships = describe.childRelationships
                .filter(r => r.relationshipName)
                .map(r => r.relationshipName);

            for (const join of joins) {
                if (!childRelationships.includes(join.relationship)) {
                    results.errors.push(
                        `Relationship '${join.relationship}' not found on '${baseObject}'. ` +
                        `Available: ${childRelationships.slice(0, 10).join(', ')}...`
                    );
                }
            }
        } catch (error) {
            results.warnings.push(`Could not validate relationships: ${error.message}`);
        }
    }

    async validateSections(rt, results) {
        if (!rt.sections || rt.sections.length === 0) {
            results.errors.push('At least one section with columns is required');
            return;
        }

        for (const section of rt.sections) {
            if (!section.masterLabel) {
                results.errors.push('Each section requires a masterLabel');
            }

            if (!section.columns || section.columns.length === 0) {
                results.errors.push(`Section '${section.masterLabel}' has no columns`);
            }

            for (const col of section.columns || []) {
                if (!col.field) {
                    results.errors.push(`Column in '${section.masterLabel}' missing field name`);
                }
                if (!col.table) {
                    results.errors.push(`Column '${col.field}' in '${section.masterLabel}' missing table reference`);
                }
            }
        }
    }

    checkBestPractices(rt, results) {
        // Check for too many default columns
        const defaultColumns = rt.sections
            ?.flatMap(s => s.columns || [])
            ?.filter(c => c.checkedByDefault) || [];

        if (defaultColumns.length > 15) {
            results.warnings.push(
                `${defaultColumns.length} columns checked by default. ` +
                'Consider reducing to improve report builder performance.'
            );
        }

        // Check for description
        if (!rt.description) {
            results.warnings.push('Adding a description helps users understand this report type');
        }

        // Check deployment status
        if (!rt.deployed) {
            results.warnings.push('Report type is set to undeployed (will not be visible to users)');
        }
    }
}

// Usage
async function validateReportType(orgAlias, xmlPath) {
    const fs = require('fs');
    const validator = new ReportTypeValidator(orgAlias);
    const xmlContent = fs.readFileSync(xmlPath, 'utf-8');

    const results = await validator.validate(xmlContent);

    if (results.valid) {
        console.log('✓ Report type validation passed');
    } else {
        console.log('✗ Validation failed:');
        results.errors.forEach(e => console.log(`  ERROR: ${e}`));
    }

    if (results.warnings.length > 0) {
        console.log('\nWarnings:');
        results.warnings.forEach(w => console.log(`  WARNING: ${w}`));
    }

    return results;
}

module.exports = { ReportTypeValidator, validateReportType };
```

### Post-Deployment Testing

```javascript
/**
 * Test that deployed report type works correctly
 */
async function testReportType(orgAlias, reportTypeName) {
    const { execSync } = require('child_process');
    const results = {
        tests: [],
        passed: true
    };

    // Test 1: Report type exists
    try {
        const query = `SELECT Id, DeveloperName FROM ReportType WHERE DeveloperName = '${reportTypeName}'`;
        const result = JSON.parse(execSync(
            `sf data query --query "${query}" --use-tooling-api --target-org ${orgAlias} --json`,
            { encoding: 'utf-8' }
        ));

        if (result.result.records.length > 0) {
            results.tests.push({ name: 'Report Type Exists', passed: true });
        } else {
            results.tests.push({
                name: 'Report Type Exists',
                passed: false,
                error: 'Report type not found'
            });
            results.passed = false;
        }
    } catch (error) {
        results.tests.push({
            name: 'Report Type Exists',
            passed: false,
            error: error.message
        });
        results.passed = false;
    }

    // Test 2: Can describe report type via REST API
    try {
        const describeResult = JSON.parse(execSync(
            `sf api request rest /services/data/v62.0/analytics/reportTypes/${reportTypeName} --target-org ${orgAlias}`,
            { encoding: 'utf-8' }
        ));

        if (describeResult.reportTypeMetadata) {
            results.tests.push({ name: 'REST API Describe', passed: true });
        } else {
            results.tests.push({
                name: 'REST API Describe',
                passed: false,
                error: 'Invalid response structure'
            });
            results.passed = false;
        }
    } catch (error) {
        results.tests.push({
            name: 'REST API Describe',
            passed: false,
            error: error.message
        });
        results.passed = false;
    }

    // Test 3: Can create a report using this type
    try {
        const reportMetadata = {
            reportMetadata: {
                name: `Test_Report_${Date.now()}`,
                reportType: {
                    type: reportTypeName
                },
                reportFormat: 'TABULAR'
            }
        };

        // Try to create (will delete immediately)
        const createResult = JSON.parse(execSync(
            `sf api request rest /services/data/v62.0/analytics/reports --method POST --body '${JSON.stringify(reportMetadata)}' --target-org ${orgAlias}`,
            { encoding: 'utf-8' }
        ));

        if (createResult.reportMetadata?.id) {
            results.tests.push({ name: 'Report Creation', passed: true });

            // Clean up test report
            execSync(
                `sf api request rest /services/data/v62.0/analytics/reports/${createResult.reportMetadata.id} --method DELETE --target-org ${orgAlias}`,
                { encoding: 'utf-8', stdio: 'pipe' }
            );
        }
    } catch (error) {
        results.tests.push({
            name: 'Report Creation',
            passed: false,
            error: error.message
        });
        results.passed = false;
    }

    // Print results
    console.log('\nReport Type Test Results:');
    console.log('='.repeat(50));
    for (const test of results.tests) {
        const status = test.passed ? '✓' : '✗';
        console.log(`${status} ${test.name}`);
        if (!test.passed) {
            console.log(`  Error: ${test.error}`);
        }
    }
    console.log('='.repeat(50));
    console.log(results.passed ? 'All tests passed!' : 'Some tests failed.');

    return results;
}

module.exports = { testReportType };
```

---

## 12. Common Patterns and Examples

### Pattern 1: Subscription Analytics Report Type

**Use Case**: SaaS company needs to report on subscription data with usage metrics

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ReportType xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Subscription_Analytics</fullName>
    <label>Subscription Analytics</label>
    <description>Comprehensive subscription reporting with usage, revenue, and customer data</description>
    <deployed>true</deployed>
    <category>other</category>

    <baseObject>Subscription__c</baseObject>

    <join>
        <relationship>Usage_Records__r</relationship>
        <outerJoin>true</outerJoin>
    </join>

    <!-- Subscription Core -->
    <sections>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Name</field>
            <table>Subscription__c</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Account__r.Name</field>
            <table>Subscription__c</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Status__c</field>
            <table>Subscription__c</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Plan_Type__c</field>
            <table>Subscription__c</table>
        </columns>
        <masterLabel>Subscription Overview</masterLabel>
    </sections>

    <!-- Financial Metrics -->
    <sections>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>MRR__c</field>
            <table>Subscription__c</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>ARR__c</field>
            <table>Subscription__c</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Discount_Percentage__c</field>
            <table>Subscription__c</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Net_Revenue__c</field>
            <table>Subscription__c</table>
        </columns>
        <masterLabel>Financial Metrics</masterLabel>
    </sections>

    <!-- Lifecycle -->
    <sections>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Start_Date__c</field>
            <table>Subscription__c</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>End_Date__c</field>
            <table>Subscription__c</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Renewal_Date__c</field>
            <table>Subscription__c</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Contract_Term_Months__c</field>
            <table>Subscription__c</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Auto_Renew__c</field>
            <table>Subscription__c</table>
        </columns>
        <masterLabel>Subscription Lifecycle</masterLabel>
    </sections>

    <!-- Usage Data -->
    <sections>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Usage_Date__c</field>
            <table>Subscription__c.Usage_Records__r</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Feature__c</field>
            <table>Subscription__c.Usage_Records__r</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Quantity_Used__c</field>
            <table>Subscription__c.Usage_Records__r</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Limit__c</field>
            <table>Subscription__c.Usage_Records__r</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Usage_Percentage__c</field>
            <table>Subscription__c.Usage_Records__r</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Overage__c</field>
            <table>Subscription__c.Usage_Records__r</table>
        </columns>
        <masterLabel>Usage Metrics</masterLabel>
    </sections>
</ReportType>
```

### Pattern 2: Customer 360 Report Type

**Use Case**: Complete customer view across sales, service, and engagement

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ReportType xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Customer_360_View</fullName>
    <label>Customer 360 View</label>
    <description>Comprehensive customer analysis including opportunities, cases, and activities</description>
    <deployed>true</deployed>
    <category>accounts</category>

    <baseObject>Account</baseObject>

    <!-- Contacts with outer join - some accounts may not have contacts -->
    <join>
        <relationship>Contacts</relationship>
        <outerJoin>true</outerJoin>
    </join>

    <!-- Account Information -->
    <sections>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Name</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Type</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Industry</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>AnnualRevenue</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>NumberOfEmployees</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Rating</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Owner.Name</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>BillingCity</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>BillingCountry</field>
            <table>Account</table>
        </columns>
        <masterLabel>Account Profile</masterLabel>
    </sections>

    <!-- Custom Account Metrics -->
    <sections>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Customer_Since__c</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Lifetime_Value__c</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Health_Score__c</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>NPS_Score__c</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Churn_Risk__c</field>
            <table>Account</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Last_Activity_Date__c</field>
            <table>Account</table>
        </columns>
        <masterLabel>Customer Metrics</masterLabel>
    </sections>

    <!-- Contact Information -->
    <sections>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Name</field>
            <table>Account.Contacts</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Title</field>
            <table>Account.Contacts</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Email</field>
            <table>Account.Contacts</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Phone</field>
            <table>Account.Contacts</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Contact_Role__c</field>
            <table>Account.Contacts</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Primary_Contact__c</field>
            <table>Account.Contacts</table>
        </columns>
        <masterLabel>Contacts</masterLabel>
    </sections>
</ReportType>
```

### Pattern 3: Campaign ROI Analysis Report Type

**Use Case**: Marketing team needs to analyze campaign performance with member engagement

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ReportType xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Campaign_ROI_Analysis</fullName>
    <label>Campaign ROI Analysis</label>
    <description>Campaign performance with member engagement and opportunity attribution</description>
    <deployed>true</deployed>
    <category>campaigns</category>

    <baseObject>Campaign</baseObject>

    <join>
        <relationship>CampaignMembers</relationship>
        <outerJoin>true</outerJoin>

        <join>
            <relationship>CampaignMemberStatuses</relationship>
            <outerJoin>true</outerJoin>
        </join>
    </join>

    <!-- Campaign Overview -->
    <sections>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Name</field>
            <table>Campaign</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>Type</field>
            <table>Campaign</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Status</field>
            <table>Campaign</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>StartDate</field>
            <table>Campaign</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>EndDate</field>
            <table>Campaign</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>IsActive</field>
            <table>Campaign</table>
        </columns>
        <masterLabel>Campaign Details</masterLabel>
    </sections>

    <!-- Financial Performance -->
    <sections>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>BudgetedCost</field>
            <table>Campaign</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>ActualCost</field>
            <table>Campaign</table>
        </columns>
        <columns>
            <checkedByDefault>true</checkedByDefault>
            <field>ExpectedRevenue</field>
            <table>Campaign</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>AmountAllOpportunities</field>
            <table>Campaign</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>AmountWonOpportunities</field>
            <table>Campaign</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>ROI__c</field>
            <table>Campaign</table>
        </columns>
        <masterLabel>Financial Metrics</masterLabel>
    </sections>

    <!-- Engagement Metrics -->
    <sections>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>NumberSent</field>
            <table>Campaign</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>NumberOfResponses</field>
            <table>Campaign</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>NumberOfLeads</field>
            <table>Campaign</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>NumberOfConvertedLeads</field>
            <table>Campaign</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>NumberOfContacts</field>
            <table>Campaign</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>NumberOfOpportunities</field>
            <table>Campaign</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>NumberOfWonOpportunities</field>
            <table>Campaign</table>
        </columns>
        <masterLabel>Engagement Statistics</masterLabel>
    </sections>

    <!-- Campaign Members -->
    <sections>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Contact.Name</field>
            <table>Campaign.CampaignMembers</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Lead.Name</field>
            <table>Campaign.CampaignMembers</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>Status</field>
            <table>Campaign.CampaignMembers</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>HasResponded</field>
            <table>Campaign.CampaignMembers</table>
        </columns>
        <columns>
            <checkedByDefault>false</checkedByDefault>
            <field>FirstRespondedDate</field>
            <table>Campaign.CampaignMembers</table>
        </columns>
        <masterLabel>Campaign Members</masterLabel>
    </sections>
</ReportType>
```

### Pattern 4: Report Type Generator Script

```javascript
/**
 * Generate custom report types from configuration
 */
class ReportTypeGenerator {
    constructor() {
        this.xmlTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<ReportType xmlns="http://soap.sforce.com/2006/04/metadata">
{{content}}
</ReportType>`;
    }

    /**
     * Generate a report type from configuration
     */
    generate(config) {
        const {
            fullName,
            label,
            description = '',
            deployed = true,
            category = 'other',
            baseObject,
            joins = [],
            sections = []
        } = config;

        let content = '';

        // Identity
        content += `    <fullName>${this.escapeXml(fullName)}</fullName>\n`;
        content += `    <label>${this.escapeXml(label)}</label>\n`;
        if (description) {
            content += `    <description>${this.escapeXml(description)}</description>\n`;
        }

        // Deployment
        content += `    <deployed>${deployed}</deployed>\n`;
        content += `    <category>${category}</category>\n`;

        // Base Object
        content += `    <baseObject>${baseObject}</baseObject>\n`;

        // Joins (recursive)
        if (joins.length > 0) {
            content += this.generateJoinsXML(joins, 1);
        }

        // Sections
        for (const section of sections) {
            content += this.generateSectionXML(section);
        }

        return this.xmlTemplate.replace('{{content}}', content.trimEnd());
    }

    generateJoinsXML(joins, depth) {
        let xml = '';
        const indent = '    '.repeat(depth);

        for (const join of joins) {
            xml += `${indent}<join>\n`;
            xml += `${indent}    <relationship>${join.relationship}</relationship>\n`;
            xml += `${indent}    <outerJoin>${join.outerJoin === true}</outerJoin>\n`;

            if (join.joins && join.joins.length > 0) {
                xml += this.generateJoinsXML(join.joins, depth + 1);
            }

            xml += `${indent}</join>\n`;
        }

        return xml;
    }

    generateSectionXML(section) {
        let xml = '    <sections>\n';

        for (const column of section.columns || []) {
            xml += '        <columns>\n';
            xml += `            <checkedByDefault>${column.default === true}</checkedByDefault>\n`;
            xml += `            <field>${this.escapeXml(column.field)}</field>\n`;
            xml += `            <table>${this.escapeXml(column.table)}</table>\n`;
            xml += '        </columns>\n';
        }

        xml += `        <masterLabel>${this.escapeXml(section.label)}</masterLabel>\n`;
        xml += '    </sections>\n';

        return xml;
    }

    escapeXml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}

// Usage example
const generator = new ReportTypeGenerator();

const subscriptionReportType = generator.generate({
    fullName: 'Subscriptions_with_Usage',
    label: 'Subscriptions with Usage',
    description: 'Track subscription metrics and usage data',
    deployed: true,
    category: 'other',
    baseObject: 'Subscription__c',
    joins: [
        {
            relationship: 'Usage_Records__r',
            outerJoin: true
        }
    ],
    sections: [
        {
            label: 'Subscription Details',
            columns: [
                { field: 'Name', table: 'Subscription__c', default: true },
                { field: 'Account__r.Name', table: 'Subscription__c', default: true },
                { field: 'Status__c', table: 'Subscription__c', default: true },
                { field: 'MRR__c', table: 'Subscription__c', default: true },
                { field: 'Start_Date__c', table: 'Subscription__c', default: false },
                { field: 'End_Date__c', table: 'Subscription__c', default: false }
            ]
        },
        {
            label: 'Usage Records',
            columns: [
                { field: 'Usage_Date__c', table: 'Subscription__c.Usage_Records__r', default: false },
                { field: 'Quantity_Used__c', table: 'Subscription__c.Usage_Records__r', default: false },
                { field: 'Feature__c', table: 'Subscription__c.Usage_Records__r', default: false }
            ]
        }
    ]
});

console.log(subscriptionReportType);

module.exports = { ReportTypeGenerator };
```

---

## 13. Troubleshooting

### Common Deployment Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Entity of type 'ReportType' named 'X' cannot be found` | Report type name mismatch | Ensure fullName matches file name (without extension) |
| `Invalid object: X` | Base object doesn't exist | Deploy custom objects first, verify object API name |
| `Invalid child relationship: X` | Wrong relationship name | Query parent object describe for correct child relationship names |
| `Field X does not exist` | Field not in org | Deploy fields first, verify field API name and accessibility |
| `Category value is invalid` | Wrong category value | Use valid category from list in section 4 |
| `Duplicate developer name` | Report type already exists | Use unique fullName or retrieve/modify existing |

### Debugging Report Type Issues

```javascript
/**
 * Debug helper for report type deployment issues
 */
async function debugReportType(orgAlias, reportTypePath) {
    const { execSync } = require('child_process');
    const fs = require('fs');

    console.log('=== Report Type Debug ===\n');

    // Read file
    const content = fs.readFileSync(reportTypePath, 'utf-8');
    console.log('1. File Contents Preview:');
    console.log(content.substring(0, 500) + '...\n');

    // Extract base object
    const baseObjectMatch = content.match(/<baseObject>([^<]+)<\/baseObject>/);
    const baseObject = baseObjectMatch ? baseObjectMatch[1] : null;

    if (baseObject) {
        console.log(`2. Base Object: ${baseObject}`);

        // Check if object exists
        try {
            execSync(
                `sf sobject describe ${baseObject} --target-org ${orgAlias} --json`,
                { encoding: 'utf-8', stdio: 'pipe' }
            );
            console.log('   ✓ Object exists in org\n');
        } catch (error) {
            console.log('   ✗ Object NOT FOUND in org\n');
        }

        // List available child relationships
        try {
            const describe = JSON.parse(execSync(
                `sf sobject describe ${baseObject} --target-org ${orgAlias} --json`,
                { encoding: 'utf-8', stdio: 'pipe' }
            )).result;

            const childRels = describe.childRelationships
                .filter(r => r.relationshipName)
                .map(r => r.relationshipName);

            console.log('3. Available Child Relationships:');
            childRels.slice(0, 15).forEach(r => console.log(`   - ${r}`));
            if (childRels.length > 15) {
                console.log(`   ... and ${childRels.length - 15} more`);
            }
            console.log('');
        } catch (error) {
            console.log('3. Could not retrieve child relationships\n');
        }
    }

    // Extract and validate relationships
    const relationshipMatches = content.matchAll(/<relationship>([^<]+)<\/relationship>/g);
    console.log('4. Relationships Used:');
    for (const match of relationshipMatches) {
        console.log(`   - ${match[1]}`);
    }
    console.log('');

    // Extract and validate table paths
    const tableMatches = content.matchAll(/<table>([^<]+)<\/table>/g);
    const tables = new Set();
    for (const match of tableMatches) {
        tables.add(match[1]);
    }
    console.log('5. Table Paths:');
    for (const table of tables) {
        console.log(`   - ${table}`);
    }
    console.log('');

    // Try deployment with --check-only
    console.log('6. Validation (check-only deployment):');
    try {
        execSync(
            `sf project deploy start --source-dir "${reportTypePath}" --target-org ${orgAlias} --dry-run --json`,
            { encoding: 'utf-8', stdio: 'pipe' }
        );
        console.log('   ✓ Validation passed\n');
    } catch (error) {
        console.log('   ✗ Validation failed:');
        try {
            const errorJson = JSON.parse(error.stdout || error.message);
            if (errorJson.result?.details?.componentFailures) {
                for (const failure of errorJson.result.details.componentFailures) {
                    console.log(`     - ${failure.problem}`);
                }
            }
        } catch {
            console.log(`     ${error.message}`);
        }
    }
}

module.exports = { debugReportType };
```

### Relationship Name Discovery

```bash
# Find child relationship name on parent object
sf sobject describe Account --target-org your-org --json | jq '.childRelationships[] | select(.childSObject == "Opportunity") | .relationshipName'

# Output: "Opportunities"

# Find all relationships for custom object
sf sobject describe Custom_Object__c --target-org your-org --json | jq '.childRelationships[] | {name: .relationshipName, child: .childSObject}'
```

### Field API Name Discovery

```bash
# Get all fields for an object
sf sobject describe Subscription__c --target-org your-org --json | jq '.fields[] | {name: .name, label: .label, type: .type}'

# Get reference fields (lookups/master-detail)
sf sobject describe Subscription__c --target-org your-org --json | jq '.fields[] | select(.type == "reference") | {name: .name, relationshipName: .relationshipName, referenceTo: .referenceTo}'
```

---

## 14. Quick Reference

### Report Type XML Template

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ReportType xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>{{FULL_NAME}}</fullName>
    <label>{{LABEL}}</label>
    <description>{{DESCRIPTION}}</description>
    <deployed>true</deployed>
    <category>{{CATEGORY}}</category>
    <baseObject>{{BASE_OBJECT}}</baseObject>

    <!-- Optional: Child Relationships -->
    <join>
        <relationship>{{CHILD_RELATIONSHIP_NAME}}</relationship>
        <outerJoin>{{true|false}}</outerJoin>
    </join>

    <!-- Required: At least one section -->
    <sections>
        <columns>
            <checkedByDefault>{{true|false}}</checkedByDefault>
            <field>{{FIELD_API_NAME}}</field>
            <table>{{TABLE_PATH}}</table>
        </columns>
        <masterLabel>{{SECTION_LABEL}}</masterLabel>
    </sections>
</ReportType>
```

### Valid Categories

```
accounts, opportunities, leads, contacts, cases, campaigns,
activities, forecasts, files, contracts, products, quotas,
other, adminreports, territory
```

### Table Path Patterns

```
Level A:     {BaseObject}
Level B:     {BaseObject}.{ChildRelationship}
Level C:     {BaseObject}.{ChildRelationship}.{GrandchildRelationship}
Level D:     {BaseObject}.{ChildRelationship}.{GrandchildRelationship}.{GreatGrandchildRelationship}
```

### Join Types

| outerJoin | Behavior | Use Case |
|-----------|----------|----------|
| `false` | Inner join | Only records WITH related records |
| `true` | Outer join | Records WITH OR WITHOUT related records |

### CLI Commands

```bash
# Deploy
sf project deploy start --source-dir force-app/main/default/reportTypes --target-org ORG

# Retrieve all
sf project retrieve start --metadata "ReportType:*" --target-org ORG

# Retrieve specific
sf project retrieve start --metadata "ReportType:My_Custom_Report" --target-org ORG

# Query existing
sf data query --query "SELECT DeveloperName, MasterLabel FROM ReportType" --use-tooling-api --target-org ORG
```

### Validation Checklist

```
□ fullName matches filename (minus extension)
□ baseObject exists in org
□ All relationship names are valid child relationships
□ All field API names exist and are accessible
□ All table paths correctly chain relationships
□ At least one section with columns defined
□ Category is valid
□ deployed=true for production use
```

---

## Related Runbooks

- **[01-report-formats-fundamentals.md](./01-report-formats-fundamentals.md)** - Format selection and basics
- **[02-tabular-reports.md](./02-tabular-reports.md)** - Simple list reports
- **[03-summary-reports.md](./03-summary-reports.md)** - Grouped reports with subtotals
- **[04-matrix-reports.md](./04-matrix-reports.md)** - Cross-tabulation reports
- **[05-joined-reports-basics.md](./05-joined-reports-basics.md)** - Multi-block fundamentals
- **[06-joined-reports-advanced.md](./06-joined-reports-advanced.md)** - Cross-block formulas
- **[08-validation-and-deployment.md](./08-validation-and-deployment.md)** - Deployment workflows
- **[09-troubleshooting-optimization.md](./09-troubleshooting-optimization.md)** - Error resolution

---

**Version**: 1.0.0
**Last Updated**: 2025-11-26
**Maintainer**: Salesforce Plugin Team
**Feedback**: Submit issues via reflection system
