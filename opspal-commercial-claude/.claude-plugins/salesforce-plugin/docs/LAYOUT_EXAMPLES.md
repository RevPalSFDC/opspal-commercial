# Salesforce Layout Generation Examples

## Complete End-to-End Examples

This document provides complete, production-ready examples of layout generation using the salesforce-plugin v3.13.0 with **fieldInstance pattern v2.0.0**.

---

## Example 1: Marketing Contact Layout

**Goal:** Create a Contact layout optimized for marketing team tracking campaign attribution and lead progression.

**User Request:**
```
Create a Contact layout for our marketing team
```

**Agent Response:**
```
I'll generate a marketing-optimized Contact layout. Let me use the marketing persona template.

Invoking sfdc-layout-generator...

✓ Loaded persona template: marketing
✓ Retrieved 145 fields for Contact
✓ Scored all fields based on marketing priorities

Field Classification:
  - CRITICAL (90-100): 7 fields
    * Name, Email, Marketing_Stage__c, Last_Touch_Campaign__c
  - IMPORTANT (75-89): 13 fields
    * First_Touch_Campaign__c, Recent_MQL_Date__c, Prospect_Status__c
  - CONTEXTUAL (50-74): 18 fields
    * SQL_Date_Stamp__c, Customer_Date_Stamp__c, engagement fields

✓ Generated 5 sections:
  1. Contact Essentials (8 fields)
  2. Marketing Status & Progression (6 fields)
  3. Campaign Attribution (6 fields)
  4. Funnel Milestones (5 fields)
  5. Marketing Preferences & Compliance (4 fields)

✓ Selected components:
  - Highlights Panel (Email, Marketing_Stage__c, Last_Touch_Campaign__c)
  - Field Sections (using fieldInstance pattern v2.0)
  - Campaign Members related list
  - Activities timeline
  - Opportunities related list

✓ Generated CompactLayout with 4 key fields
✓ Quality validation: 87/100 (B+)

📁 Files saved to:
   instances/my-sandbox/generated-layouts/2025-10-18-153022/
   - Contact_marketing_FlexiPage.flexipage-meta.xml
   - Contact_marketing_CompactLayout.compactLayout-meta.xml
   - Contact_marketing_generation_summary.json
   - DEPLOYMENT_INSTRUCTIONS.md

Ready to deploy to sandbox!
```

### Generated FlexiPage Structure

**File:** `Contact_marketing_FlexiPage.flexipage-meta.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<FlexiPage xmlns="http://soap.sforce.com/2006/04/metadata">
    <!-- Header: Highlights Panel -->
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

    <!-- Field Facet: Email (Example 1 of 25) -->
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
        <name>Facet-1</name>
        <type>Facet</type>
    </flexiPageRegions>

    <!-- Field Facet: Marketing_Stage__c (Example 2 of 25) -->
    <flexiPageRegions>
        <itemInstances>
            <fieldInstance>
                <fieldInstanceProperties>
                    <name>uiBehavior</name>
                    <value>none</value>
                </fieldInstanceProperties>
                <fieldItem>Record.Marketing_Stage__c</fieldItem>
                <identifier>RecordMarketingStageField</identifier>
            </fieldInstance>
        </itemInstances>
        <name>Facet-2</name>
        <type>Facet</type>
    </flexiPageRegions>

    <!-- ...23 more field facets... -->

    <!-- Column Wrapper Facet: Section 1, Column 1 -->
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
        <name>Facet-ContactEssentialsCol1</name>
        <type>Facet</type>
    </flexiPageRegions>

    <!-- Columns Container Facet -->
    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentInstanceProperties>
                    <name>body</name>
                    <value>Facet-ContactEssentialsCol1</value>
                </componentInstanceProperties>
                <componentName>flexipage:column</componentName>
                <identifier>flexipage_column1</identifier>
            </componentInstance>
        </itemInstances>
        <name>Facet-ContactEssentialsColumns</name>
        <type>Facet</type>
    </flexiPageRegions>

    <!-- Field Section Component -->
    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentInstanceProperties>
                    <name>columns</name>
                    <value>Facet-ContactEssentialsColumns</value>
                </componentInstanceProperties>
                <componentInstanceProperties>
                    <name>horizontalAlignment</name>
                    <value>false</value>
                </componentInstanceProperties>
                <componentInstanceProperties>
                    <name>label</name>
                    <value>Contact Essentials</value>
                </componentInstanceProperties>
                <componentName>flexipage:fieldSection</componentName>
                <identifier>flexipage_fieldSection1</identifier>
            </componentInstance>
        </itemInstances>
        <!-- ...4 more sections... -->
        <name>Facet-DetailTab</name>
        <type>Facet</type>
    </flexiPageRegions>

    <!-- Tabs Facet -->
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

    <!-- Main Region: Tabset -->
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

    <!-- Sidebar Region: Related Lists -->
    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentInstanceProperties>
                    <name>relatedListApiName</name>
                    <value>CampaignMembers</value>
                </componentInstanceProperties>
                <componentName>force:relatedListSingleContainer</componentName>
                <identifier>force_relatedListSingleContainer1</identifier>
            </componentInstance>
        </itemInstances>
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

    <masterLabel>Contact - Marketing</masterLabel>
    <sobjectType>Contact</sobjectType>
    <template>
        <name>flexipage:recordHomeTemplateDesktop</name>
    </template>
    <type>RecordPage</type>
</FlexiPage>
```

### Deployment Steps

```bash
# 1. Copy files to Salesforce project
cp instances/my-sandbox/generated-layouts/2025-10-18-153022/* \
   force-app/main/default/

# 2. Deploy to sandbox
sf project deploy start \
   --source-dir force-app/main/default \
   --target-org my-sandbox

# 3. Assign to Marketing app + Marketing User profile
# (via Setup → Lightning App Builder → Activation)

# 4. Test with marketing user

# 5. Validate quality
/analyze-layout --object Contact --org my-sandbox
```

**Expected Result:** Quality score 87/100 (B+), all 25 fields visible, Campaign Members related list first.

---

## Example 2: Customer Success Account Layout

**Goal:** Create Account layout for CSM team focused on health scores, renewals, and adoption metrics.

**User Request:**
```
Generate an Account layout for our customer success managers in the CSM sandbox
```

**Agent Response:**
```
I'll generate a customer-success optimized Account layout for the CSM sandbox.

Invoking sfdc-layout-generator...

✓ Loaded persona template: customer-success
✓ Retrieved 178 fields for Account
✓ Scored all fields based on CSM priorities

Field Classification:
  - CRITICAL (90-100): 7 fields
    * Name, Health_Score__c, Renewal_Date__c, ARR__c, CSM_Owner__c
  - IMPORTANT (75-89): 16 fields
    * Product_Adoption_Score__c, NPS_Score__c, Risk_Level__c, Last_QBR_Date__c
  - CONTEXTUAL (50-74): 22 fields
    * Contract fields, implementation dates, support tier

✓ Generated 5 sections:
  1. Account Information (7 fields)
  2. Health & Risk (6 fields)
  3. Adoption & Usage (6 fields)
  4. Renewals & Contracts (6 fields)
  5. Engagement History (5 fields)

✓ Selected components:
  - Highlights Panel (Health_Score__c, ARR__c, Renewal_Date__c)
  - Field Sections (using fieldInstance pattern v2.0)
  - Cases related list
  - Contracts related list
  - Opportunities (expansion) related list
  - Activities timeline

✓ Generated CompactLayout with 4 key fields
✓ Quality validation: 89/100 (B+)

📁 Files saved to:
   instances/csm-sandbox/generated-layouts/2025-10-18-154530/

Ready to deploy!
```

### Quality Analysis

```json
{
  "overall_score": 89,
  "grade": "B+",
  "breakdown": {
    "field_organization": 95,
    "component_selection": 88,
    "mobile_optimization": 85,
    "persona_alignment": 92,
    "best_practices": 87
  },
  "recommendations": [
    "Consider adding conditional visibility for at-risk accounts",
    "Add dashboard component for team metrics (if sales manager persona used)"
  ],
  "deployment_ready": true
}
```

### Key Fields Included

**Section 1: Account Information**
- Name, Type, Industry
- ARR__c, Customer_Stage__c
- CSM_Owner__c, Executive_Sponsor__c

**Section 2: Health & Risk**
- Health_Score__c, Risk_Level__c
- NPS_Score__c, Churn_Reason__c
- Risk_Notes__c, Last_Touchpoint_Date__c

**Section 3: Adoption & Usage**
- Product_Adoption_Score__c, Primary_Use_Case__c
- Active_Users__c, Feature_Adoption__c
- Onboarding_Status__c, Implementation_Date__c

**Section 4: Renewals & Contracts**
- Renewal_Date__c, Contract_End_Date__c
- Contract_Value__c, Renewal_Probability__c
- Expansion_Potential__c, Support_Tier__c

**Section 5: Engagement History**
- Last_QBR_Date__c, Next_QBR_Date__c
- Success_Plan_Status__c, EBR_Date__c
- Training_Completed__c

---

## Example 3: Multi-Persona Opportunity Layouts

**Goal:** Create different Opportunity layouts for sales reps, sales managers, and executives.

**User Request:**
```
I need three different Opportunity layouts - one for reps, one for managers, and one for execs
```

**Agent Response:**
```
I'll generate three persona-specific Opportunity layouts. Let me create them one by one.

=== Layout 1: Sales Rep ===

Invoking sfdc-layout-generator (persona: sales-rep)...

✓ Generated 4 sections, 56 fields
✓ Focus: Deal details, next steps, contacts
✓ Quality score: 88/100 (B+)
📁 Saved to: instances/my-sandbox/generated-layouts/2025-10-18-155022-sales-rep/

=== Layout 2: Sales Manager ===

Invoking sfdc-layout-generator (persona: sales-manager)...

✓ Generated 5 sections, 68 fields
✓ Focus: Pipeline metrics, forecast category, team ownership
✓ Quality score: 86/100 (B)
📁 Saved to: instances/my-sandbox/generated-layouts/2025-10-18-155045-sales-manager/

=== Layout 3: Executive ===

Invoking sfdc-layout-generator (persona: executive)...

✓ Generated 3 sections, 32 fields
✓ Focus: High-level KPIs only (Amount, Stage, Close Date, Forecast)
✓ Quality score: 91/100 (A-)
📁 Saved to: instances/my-sandbox/generated-layouts/2025-10-18-155108-executive/

All three layouts generated successfully!

Deployment plan:
1. Deploy all three FlexiPages to sandbox
2. Assign Opportunity_sales_rep_Page to Sales app + Sales Rep profile
3. Assign Opportunity_sales_manager_Page to Sales app + Sales Manager profile
4. Assign Opportunity_executive_Page to Executive Dashboard app + Executive profile
5. Test with users from each role
```

### Comparison

| Aspect | Sales Rep | Sales Manager | Executive |
|--------|-----------|---------------|-----------|
| **Sections** | 4 | 5 | 3 |
| **Total Fields** | 56 | 68 | 32 |
| **Top Fields** | Amount, Stage, Next Step | Pipeline, Forecast, Team | Amount, Stage, Close Date |
| **Related Lists** | Contacts, Tasks, Quotes | Opportunities (team), Reports | Dashboard widgets |
| **Quality Score** | 88 (B+) | 86 (B) | 91 (A-) |
| **Complexity** | Detail-focused | Metrics-focused | High-level only |

---

## Pattern Details

All examples above use **fieldInstance pattern v2.0.0**:

**Why This Pattern:**
- ✅ Works in all Salesforce editions
- ✅ No Dynamic Forms permission required
- ✅ Explicit control over every field
- ✅ Maximum deployment compatibility

**Pattern Structure:**
```
1. Field Facets (one per field with <fieldInstance>)
2. Column Wrapper Facets (wrap fields in flexipage:column)
3. Columns Container Facet (combine columns)
4. Field Section Components Facet (flexipage:fieldSection)
5. Detail Tab Facet (all sections)
6. Tabs Facet (wrap detail tab)
7. Main Region (flexipage:tabset)
8. Sidebar Region (related lists)
```

**See:** `docs/LAYOUT_PATTERNS.md` for complete pattern documentation.

---

## Common Variations

### Variation 1: Add Conditional Visibility

```xml
<!-- Example: Show "Renewal" section only for Renewal record type -->
<componentInstanceProperties>
    <name>visibilityRule</name>
    <value>
        <criteriaItems>
            <leftValue>RecordType</leftValue>
            <operator>EQUAL</operator>
            <rightValue>Renewal</rightValue>
        </criteriaItems>
    </value>
</componentInstanceProperties>
```

### Variation 2: Custom Related List Order

```xml
<!-- Prioritize Cases for CSM layouts -->
<itemInstances>
    <componentInstance>
        <componentInstanceProperties>
            <name>relatedListApiName</name>
            <value>Cases</value>
        </componentInstanceProperties>
        <componentName>force:relatedListSingleContainer</componentName>
        <identifier>force_relatedListSingleContainer_cases</identifier>
    </componentInstance>
</itemInstances>
```

### Variation 3: Mobile-Optimized Compact Layout

```xml
<!-- Keep to 4-6 fields for mobile highlights panel -->
<CompactLayout xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Contact_marketing_Compact</fullName>
    <fields>Email</fields>
    <fields>Marketing_Stage__c</fields>
    <fields>Last_Touch_Campaign__c</fields>
    <fields>Recent_MQL_Date__c</fields>
    <label>Contact Marketing Compact</label>
</CompactLayout>
```

---

## Troubleshooting

### Issue: Deployment Fails with "Component not found"

**Cause:** Using old v1.0 pattern with Dynamic Forms dependency

**Solution:**
```bash
# Verify version
grep "version.*2.0.0" scripts/lib/layout-template-engine.js

# If v1.0, regenerate layout with v2.0
/design-layout --object Contact --persona marketing --org my-sandbox
```

### Issue: Fields Not Appearing

**Cause:** Field-level security or facet hierarchy broken

**Solution:**
1. Check FLS for user profile
2. Verify complete facet chain exists
3. Check for typos in `Record.FieldName`

### Issue: Quality Score Below 85

**Cause:** Too many fields, missing components, or poor organization

**Solution:**
```bash
# Regenerate with different persona
/design-layout --object Contact --persona marketing --org my-sandbox

# Or adjust persona template
# Edit templates/layouts/personas/marketing.json
```

---

**Last Updated:** 2025-10-18
**Pattern Version:** fieldInstance v2.0.0
**Plugin Version:** 3.13.0
