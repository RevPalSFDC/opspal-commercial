# Salesforce FlexiPage Layout Patterns

## Overview

This document explains the proven patterns for creating Salesforce FlexiPage (Lightning Page) metadata that works reliably across all Salesforce orgs, including those with Dynamic Forms disabled or restricted.

**Last Updated:** 2025-12-12
**Status:** Production Ready
**Pattern Version:** 2.1 (fieldInstance + Skills + Deployment)

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| **Skills** | |
| `skills/layout-planning-guide/` | Planning decisions before implementation |
| `skills/layout-cli-api-reference/` | CLI/API command reference |
| `skills/lightning-page-design-guide/` | Lightning Page design patterns |
| `skills/compact-layout-guide/` | Compact layouts and highlights panels |
| **Agents** | |
| `sfdc-layout-generator` | Generate layouts from persona templates |
| `sfdc-layout-analyzer` | Analyze and score existing layouts |
| `sfdc-layout-deployer` | Deploy layouts with validation and backup |
| **Commands** | |
| `/design-layout` | Generate layouts interactively |
| `/analyze-layout` | Analyze existing layouts |
| `/deploy-layout` | Deploy layouts to Salesforce orgs |
| **Guides** | |
| `docs/LAYOUT_DEPLOYMENT_GUIDE.md` | Complete deployment workflow |
| `docs/LAYOUT_EXAMPLES.md` | Example layouts and patterns |

---

## The Problem: Dynamic Forms Incompatibility

### What Doesn't Work

Many Salesforce FlexiPage generators use the **Dynamic Forms API** pattern:

```xml
<componentInstance>
    <componentName>force:recordFieldSection</componentName>
    <componentInstanceProperties>
        <name>field</name>
        <value>Name</value>
    </componentInstanceProperties>
    <componentInstanceProperties>
        <name>field</name>
        <value>Email</value>
    </componentInstanceProperties>
</componentInstance>
```

**Why This Fails:**
- ❌ Requires Dynamic Forms to be enabled in the org
- ❌ Not available in all Salesforce editions
- ❌ Requires specific permissions
- ❌ Deployment fails with cryptic errors like "Component not found" or "Invalid component type"

### What Also Doesn't Work

The legacy **Record Detail Panel** pattern:

```xml
<componentInstance>
    <componentName>force:recordDetailPanelDesktop</componentName>
</componentInstance>
```

**Why This Fails:**
- ❌ Provides no control over which fields are displayed
- ❌ Uses the Page Layout to determine fields (defeats the purpose of FlexiPages)
- ❌ Cannot customize field order or grouping
- ❌ Limited styling and behavior options

---

## The Solution: fieldInstance Pattern

### What Works Everywhere

The **fieldInstance pattern** with proper facet hierarchy:

```xml
<flexiPageRegions>
    <itemInstances>
        <fieldInstance>
            <fieldInstanceProperties>
                <name>uiBehavior</name>
                <value>required</value>
            </fieldInstanceProperties>
            <fieldItem>Record.Name</fieldItem>
            <identifier>RecordNameField</identifier>
        </fieldInstance>
    </itemInstances>
    <name>Facet-1</name>
    <type>Facet</type>
</flexiPageRegions>
```

**Why This Works:**
- ✅ Available in all Salesforce editions
- ✅ No special permissions required
- ✅ Explicit field control
- ✅ Works with or without Dynamic Forms
- ✅ Maximum compatibility across org types

---

## Pattern Architecture

### Facet Hierarchy

The fieldInstance pattern requires a specific hierarchy of facets:

```
1. Field Facets (one per field)
   └─ Contains: <fieldInstance> with Record.FieldName

2. Column Wrapper Facets
   └─ Contains: flexipage:column components wrapping field facets

3. Columns Container Facet
   └─ Contains: flexipage:column components for left/right columns

4. Field Section Components Facet
   └─ Contains: flexipage:fieldSection for each section

5. Detail Tab Facet
   └─ Contains: All field sections combined

6. Tabs Facet
   └─ Contains: flexipage:tab wrapping detail tab

7. Main Region
   └─ Contains: flexipage:tabset referencing tabs facet
```

### Complete Example

Here's a complete example for a 2-field section:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<FlexiPage xmlns="http://soap.sforce.com/2006/04/metadata">
    <!-- HEADER REGION -->
    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentInstanceProperties>
                    <name>collapsed</name>
                    <value>false</value>
                </componentInstanceProperties>
                <componentName>force:highlightsPanel</componentName>
                <identifier>force_highlightsPanel</identifier>
            </componentInstance>
        </itemInstances>
        <name>header</name>
        <type>Region</type>
    </flexiPageRegions>

    <!-- FIELD FACET: Name -->
    <flexiPageRegions>
        <itemInstances>
            <fieldInstance>
                <fieldInstanceProperties>
                    <name>uiBehavior</name>
                    <value>required</value>
                </fieldInstanceProperties>
                <fieldItem>Record.Name</fieldItem>
                <identifier>RecordNameField</identifier>
            </fieldInstance>
        </itemInstances>
        <name>Facet-1</name>
        <type>Facet</type>
    </flexiPageRegions>

    <!-- FIELD FACET: Email -->
    <flexiPageRegions>
        <itemInstances>
            <fieldInstance>
                <fieldInstanceProperties>
                    <name>uiBehavior</name>
                    <value>none</value>
                </fieldInstanceProperties>
                <fieldItem>Record.Email</fieldItem>
                <identifier>RecordEmailField</identifier>
            </fieldInstance>
        </itemInstances>
        <name>Facet-2</name>
        <type>Facet</type>
    </flexiPageRegions>

    <!-- COLUMN WRAPPER: Column 1 -->
    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentInstanceProperties>
                    <name>body</name>
                    <value>Facet-1</value>
                </componentInstanceProperties>
                <componentName>flexipage:column</componentName>
                <identifier>flexipage_column_facet1</identifier>
            </componentInstance>
        </itemInstances>
        <itemInstances>
            <componentInstance>
                <componentInstanceProperties>
                    <name>body</name>
                    <value>Facet-2</value>
                </componentInstanceProperties>
                <componentName>flexipage:column</componentName>
                <identifier>flexipage_column_facet2</identifier>
            </componentInstance>
        </itemInstances>
        <name>Facet-ContactInfoCol1</name>
        <type>Facet</type>
    </flexiPageRegions>

    <!-- COLUMNS CONTAINER -->
    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentInstanceProperties>
                    <name>body</name>
                    <value>Facet-ContactInfoCol1</value>
                </componentInstanceProperties>
                <componentName>flexipage:column</componentName>
                <identifier>flexipage_column1</identifier>
            </componentInstance>
        </itemInstances>
        <name>Facet-ContactInfoColumns</name>
        <type>Facet</type>
    </flexiPageRegions>

    <!-- FIELD SECTION COMPONENT -->
    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentInstanceProperties>
                    <name>columns</name>
                    <value>Facet-ContactInfoColumns</value>
                </componentInstanceProperties>
                <componentInstanceProperties>
                    <name>horizontalAlignment</name>
                    <value>false</value>
                </componentInstanceProperties>
                <componentInstanceProperties>
                    <name>label</name>
                    <value>Contact Information</value>
                </componentInstanceProperties>
                <componentName>flexipage:fieldSection</componentName>
                <identifier>flexipage_fieldSection1</identifier>
            </componentInstance>
        </itemInstances>
        <name>Facet-DetailTab</name>
        <type>Facet</type>
    </flexiPageRegions>

    <!-- TABS FACET -->
    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentInstanceProperties>
                    <name>active</name>
                    <value>true</value>
                </componentInstanceProperties>
                <componentInstanceProperties>
                    <name>body</name>
                    <value>Facet-DetailTab</value>
                </componentInstanceProperties>
                <componentInstanceProperties>
                    <name>title</name>
                    <value>Standard.Tab.detail</value>
                </componentInstanceProperties>
                <componentName>flexipage:tab</componentName>
                <identifier>detailTab</identifier>
            </componentInstance>
        </itemInstances>
        <name>Facet-Tabs</name>
        <type>Facet</type>
    </flexiPageRegions>

    <!-- MAIN REGION -->
    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentInstanceProperties>
                    <name>tabs</name>
                    <value>Facet-Tabs</value>
                </componentInstanceProperties>
                <componentName>flexipage:tabset</componentName>
                <identifier>flexipage_tabset</identifier>
            </componentInstance>
        </itemInstances>
        <name>main</name>
        <type>Region</type>
    </flexiPageRegions>

    <!-- SIDEBAR REGION -->
    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentName>runtime_sales_activities:activityPanel</componentName>
                <identifier>runtime_sales_activities_activityPanel</identifier>
            </componentInstance>
        </itemInstances>
        <itemInstances>
            <componentInstance>
                <componentName>force:relatedListContainer</componentName>
                <identifier>force_relatedListContainer</identifier>
            </componentInstance>
        </itemInstances>
        <name>sidebar</name>
        <type>Region</type>
    </flexiPageRegions>

    <masterLabel>Contact - Example</masterLabel>
    <sobjectType>Contact</sobjectType>
    <template>
        <name>flexipage:recordHomeTemplateDesktop</name>
    </template>
    <type>RecordPage</type>
</FlexiPage>
```

---

## Common Pitfalls

### 1. Missing Facet Hierarchy

**❌ Wrong:**
```xml
<componentInstance>
    <componentName>flexipage:fieldSection</componentName>
    <!-- Trying to add fields directly -->
</componentInstance>
```

**✅ Correct:**
```xml
<!-- Create field facets first -->
<flexiPageRegions>
    <itemInstances>
        <fieldInstance>...</fieldInstance>
    </itemInstances>
    <name>Facet-1</name>
    <type>Facet</type>
</flexiPageRegions>

<!-- Then wrap in column facets -->
<flexiPageRegions>
    <itemInstances>
        <componentInstance>
            <componentInstanceProperties>
                <name>body</name>
                <value>Facet-1</value>
            </componentInstanceProperties>
            <componentName>flexipage:column</componentName>
        </componentInstance>
    </itemInstances>
    <name>Facet-Column1</name>
    <type>Facet</type>
</flexiPageRegions>

<!-- Then reference in fieldSection -->
<componentInstance>
    <componentInstanceProperties>
        <name>columns</name>
        <value>Facet-Column1</value>
    </componentInstanceProperties>
    <componentName>flexipage:fieldSection</componentName>
</componentInstance>
```

### 2. Incorrect Field Reference Format

**❌ Wrong:**
```xml
<fieldItem>Name</fieldItem>                    <!-- Missing Record. prefix -->
<fieldItem>Contact.Name</fieldItem>            <!-- Object name instead of Record -->
<fieldItem>Record_Name</fieldItem>             <!-- Underscore instead of dot -->
```

**✅ Correct:**
```xml
<fieldItem>Record.Name</fieldItem>
<fieldItem>Record.Email</fieldItem>
<fieldItem>Record.Custom_Field__c</fieldItem>
```

### 3. Missing uiBehavior

**❌ Wrong:**
```xml
<fieldInstance>
    <fieldItem>Record.Name</fieldItem>
    <!-- Missing uiBehavior property -->
</fieldInstance>
```

**✅ Correct:**
```xml
<fieldInstance>
    <fieldInstanceProperties>
        <name>uiBehavior</name>
        <value>required</value>  <!-- or "none", "readonly" -->
    </fieldInstanceProperties>
    <fieldItem>Record.Name</fieldItem>
</fieldInstance>
```

### 4. Facet Naming Conflicts

**❌ Wrong:**
```xml
<name>Facet-1</name>  <!-- Used for field facet -->
...
<name>Facet-1</name>  <!-- Reused for column facet - CONFLICT! -->
```

**✅ Correct:**
```xml
<name>Facet-1</name>           <!-- Field facet -->
<name>Facet-Column1</name>     <!-- Column wrapper facet -->
<name>Facet-Columns</name>     <!-- Columns container facet -->
```

---

## Field Behaviors

The `uiBehavior` property controls how fields behave:

| Value | Behavior | Use Case |
|-------|----------|----------|
| `required` | Red asterisk, cannot save without value | Name, Email (when required) |
| `none` | Editable, optional | Most standard fields |
| `readonly` | Display-only, cannot edit | Auto-number, formula, system fields |

---

## Testing Your FlexiPage

### Pre-Deployment Validation

1. **Check XML syntax:**
   ```bash
   xmllint --noout Contact_marketing_Page.flexipage-meta.xml
   ```

2. **Validate facet references:**
   ```bash
   # Ensure all facet names referenced in <value> tags exist
   grep -o 'Facet-[^<]*' Contact_marketing_Page.flexipage-meta.xml | sort | uniq -c
   ```

3. **Validate field API names:**
   ```bash
   # Get all fields from org
   sf sobject describe Contact --target-org my-org | jq -r '.fields[].name'

   # Compare with fields in your FlexiPage
   grep -o 'Record\.[A-Za-z0-9_]*' Contact_marketing_Page.flexipage-meta.xml
   ```

### Deployment Testing

1. **Deploy to sandbox first:**
   ```bash
   sf project deploy start \
       --metadata FlexiPage:Contact_marketing_Page \
       --target-org my-sandbox
   ```

2. **Verify in UI:**
   - Navigate to a Contact record
   - Check that all expected fields appear
   - Verify no unwanted fields are visible
   - Test field editability (required vs. optional vs. readonly)

3. **Check for errors:**
   ```bash
   # View deployment details
   sf project deploy report --job-id 0Af...
   ```

---

## Reference Implementations

### Working Examples

Located in: `instances/peregrine-main/deployment-test/force-app/main/default/flexipages/`

1. **Contact_sales_rep_Page.flexipage-meta.xml**
   - Basic contact information
   - Sales-focused fields
   - 3 sections, ~12 fields

2. **Contact_marketing_Page.flexipage-meta.xml**
   - Marketing attribution fields
   - Campaign tracking
   - 5 sections, 25 fields
   - Demonstrates proper handling of many fields

### Generator Code

Location: `scripts/lib/layout-template-engine.js`

Key methods:
- `generateFlexiPageXML()` - Main entry point
- `generateFieldFacets()` - Creates field-level facets
- `generateColumnWrapperFacets()` - Wraps fields in columns
- `generateFieldSectionComponentsFacet()` - Creates section components

---

## Migration Path

### If You Have Existing FlexiPages Using Dynamic Forms

1. **Identify affected pages:**
   ```bash
   grep -r "force:recordFieldSection" force-app/main/default/flexipages/
   ```

2. **Back up existing metadata:**
   ```bash
   cp -r force-app/main/default/flexipages force-app/main/default/flexipages.backup
   ```

3. **Regenerate using template engine:**
   ```bash
   node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/layout-template-engine.js my-org Contact sales-rep --output-dir ./generated
   ```

4. **Compare and test:**
   - Review generated XML
   - Deploy to sandbox
   - Validate field visibility matches original
   - Check for any missing fields

5. **Update production:**
   - Deploy to production after sandbox validation
   - Monitor for user feedback

---

## Best Practices

### 1. Facet Naming Convention

Use descriptive, hierarchical names:
```
Facet-{SectionName}Col1        # Field facets for column 1
Facet-{SectionName}Col2        # Field facets for column 2
Facet-{SectionName}Columns     # Container for all columns
Facet-DetailTab                # Container for all sections
Facet-Tabs                     # Container for all tabs
```

### 2. Field Organization

- **Column 1:** Most critical fields (Name, Email, Status)
- **Column 2:** Important but secondary (Owner, Created Date)
- **Sections:** Group by workflow (Contact Info, Address, etc.)
- **Max fields per section:** 10-15 for readability

### 3. Template Reuse

Use enhanced persona templates with object-specific guidance:

**Available Personas** (in `templates/layouts/personas/`):
- **sales-rep.json** - Deal-focused fields, pipeline management
- **sales-manager.json** - Team oversight, forecasting, coaching
- **executive.json** - High-level metrics, minimal details
- **support-agent.json** - Case management, SLA tracking
- **support-manager.json** - Team metrics, escalations
- **marketing.json** - Campaign attribution, lead source tracking
- **customer-success.json** - Health scores, renewals, expansion

**Object-Specific Guidance** (v2.1.0 - NEW):
Each persona template now includes `objectGuidance` for 5 objects:
- **Account** - sections, compactFields, relatedLists, defaultTab, rationale
- **Contact** - contact info focus, quick action fields
- **Opportunity** - deal context, forecasting
- **Quote** - pricing, line items access
- **QuoteLineItem** - product details, pricing

**Example Usage**:
```javascript
// Load persona template with object guidance
const persona = require('./templates/layouts/personas/sales-rep.json');
const accountGuidance = persona.objectGuidance?.Account;

// Use recommended sections
const sections = accountGuidance.sections;

// Use recommended compact fields
const compactFields = accountGuidance.compactFields;

// Apply recommended default tab
const defaultTab = accountGuidance.defaultTab; // 'Related' for sales-rep Account
```

**See**: `skills/layout-planning-guide/` for complete persona selection guidance

### 4. Version Control

Always commit:
- FlexiPage XML files
- Companion Page Layouts
- Compact Layouts
- package.xml with all components

---

## Troubleshooting

### Deployment Fails with "Component Not Found"

**Cause:** Usually a misspelled component name or facet reference

**Fix:**
1. Check all `<componentName>` values against Salesforce docs
2. Verify all facet references (grep for `<value>Facet-` and ensure matching `<name>Facet-`)
3. Validate XML syntax with `xmllint`

### Fields Not Appearing in UI

**Cause:** Field not accessible to user profile or facet hierarchy broken

**Fix:**
1. Check field-level security for user profile
2. Verify complete facet chain (field → column → section → tab → main)
3. Check for typos in `Record.FieldName`

### Unwanted Fields Appearing

**Cause:** Page Layout being used instead of FlexiPage

**Fix:**
1. Verify FlexiPage is assigned to correct record type
2. Check Lightning App Builder assignments
3. Ensure FlexiPage is activated

---

## Additional Resources

- **Salesforce Metadata API Guide:** https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/
- **FlexiPage Metadata Type:** https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_flexipage.htm
- **Lightning Page Components:** https://developer.salesforce.com/docs/component-library/overview/components

---

## Changelog

### v2.1.0 (2025-12-12)
- ✅ Added 4 LLM-optimized skills for layout development
  - `layout-planning-guide` - Planning decisions before implementation
  - `layout-cli-api-reference` - CLI/API command reference
  - `lightning-page-design-guide` - Lightning Page design patterns
  - `compact-layout-guide` - Compact layouts and highlights panels
- ✅ Enhanced all 7 persona templates with `objectGuidance` for 5 objects
  - Account, Contact, Opportunity, Quote, QuoteLineItem
  - sections, compactFields, relatedLists, defaultTab, rationale
- ✅ Implemented deployment automation (Phase 3)
  - `sfdc-layout-deployer` agent for orchestrated deployment
  - `/deploy-layout` command with validation, backup, profile assignments
  - `layout-deployer.js` script for programmatic deployment
- ✅ Added default tab analysis and recommendations
- ✅ Added visual indicator detection in compact layouts (IMAGE() formulas)
- ✅ Added quick action field analysis (Phone, Email for contacts)
- ✅ Created Related Documentation navigation table
- ✅ Updated skill integration in sfdc-layout-generator and sfdc-layout-analyzer

### v2.0.0 (2025-10-18)
- ✅ Implemented fieldInstance pattern for maximum compatibility
- ✅ Removed Dynamic Forms dependency
- ✅ Added complete facet hierarchy
- ✅ Updated layout-template-engine.js to use proven pattern
- ✅ Created marketing and customer-success persona templates
- ✅ Documented pattern in detail

### v1.0.0 (Previous)
- ⚠️ Used Dynamic Forms API (incompatible with many orgs)
- ⚠️ Limited to orgs with Dynamic Forms enabled

---

**Document Maintained By:** RevPal Salesforce Plugin Team
**Contact:** plugins@revpal.io
**Last Reviewed:** 2025-12-12
