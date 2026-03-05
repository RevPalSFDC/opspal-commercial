# Salesforce Layout Designer Integration Plan

## Overview

This document outlines the steps to integrate the new **fieldInstance pattern** and persona templates into our existing Salesforce Plugin agent roster and toolset.

**Status:** Ready for Implementation
**Created:** 2025-10-18
**Priority:** High (Prevents deployment failures)

---

## What's New

### Core Updates Completed ✅

1. **Layout Template Engine v2.0.0**
   - File: `scripts/lib/layout-template-engine.js`
   - Updated to use proven fieldInstance pattern
   - Removed Dynamic Forms dependency
   - Added 9 new helper methods for facet hierarchy

2. **New Persona Templates**
   - `templates/layouts/personas/marketing.json` - Marketing users (25 fields, 5 sections)
   - `templates/layouts/personas/customer-success.json` - CSM users (30+ fields, 5 sections)
   - Existing templates verified: sales-rep, sales-manager, executive, support-agent, support-manager

3. **Comprehensive Documentation**
   - `docs/LAYOUT_PATTERNS.md` - Complete guide to fieldInstance pattern
   - Pattern architecture explained
   - Common pitfalls documented
   - Troubleshooting guide included

### Integration Needed 🔧

1. **Update Agents** - Reference new patterns and templates
2. **Update Commands** - Remove Dynamic Forms references
3. **Update Documentation** - Add new workflows to USAGE.md
4. **Update Routing** - Make layout generation discoverable
5. **Add Examples** - Document new persona usage

---

## Integration Steps

### Step 1: Update sfdc-layout-generator Agent

**File:** `agents/sfdc-layout-generator.md`

**Changes Needed:**

#### A. Update Header Description (Line 3)
```yaml
# OLD:
description: Generate optimized Salesforce Lightning Pages using AI-guided persona templates

# NEW:
description: Generate optimized Salesforce Lightning Pages using proven fieldInstance pattern and AI-guided persona templates
```

#### B. Update "When to Use" Section (Lines 26-37)
```markdown
# REMOVE:
- Implementing Dynamic Forms for better UX

# ADD:
- Creating layouts using proven fieldInstance pattern (maximum compatibility)
- Avoiding Dynamic Forms incompatibility issues
```

#### C. Add Pattern Reference Section (After Line 48)
```markdown
## Layout Pattern (v2.0.0)

This agent now uses the **proven fieldInstance pattern** for maximum compatibility:

- ✅ Works in all Salesforce editions
- ✅ No special permissions required
- ✅ Explicit field control via <fieldInstance> elements
- ✅ Avoids Dynamic Forms API (incompatible with many orgs)

**Pattern Documentation:** See `docs/LAYOUT_PATTERNS.md` for complete details.

**Key Difference from v1.0:**
- **OLD:** Used Dynamic Forms API (`force:recordFieldSection` with direct field properties)
- **NEW:** Uses fieldInstance with proper facet hierarchy

**Why This Matters:**
Dynamic Forms requires special org configuration and permissions. The fieldInstance pattern works everywhere.
```

#### D. Update Available Personas (Line 66 and elsewhere)
```markdown
# OLD:
Available: sales-rep, sales-manager, executive, support-agent, support-manager

# NEW:
Available: sales-rep, sales-manager, executive, support-agent, support-manager, marketing, customer-success
```

#### E. Update Step 4 Section (Lines 107-135)
```markdown
### Step 4: Generate FlexiPage Metadata

Use layout-template-engine.js:

```bash
node scripts/lib/layout-template-engine.js {org} {object} {persona} \
  --verbose \
  --output-dir /tmp/generated-layouts
```

**FlexiPage Pattern (v2.0.0):**

Generated FlexiPages use the fieldInstance pattern with this hierarchy:

1. **Field Facets** - One `<fieldInstance>` per field with `Record.FieldName`
2. **Column Wrapper Facets** - Wrap field facets in `flexipage:column` components
3. **Columns Container Facet** - Combine column facets
4. **Field Section Components Facet** - `flexipage:fieldSection` for each section
5. **Detail Tab Facet** - Combines all sections
6. **Tabs Facet** - Wraps detail tab
7. **Main Region** - `flexipage:tabset` referencing tabs facet
8. **Sidebar Region** - Related lists and activities

**No Dynamic Forms Dependency:**
- ❌ OLD: Used `force:recordFieldSection` with inline field properties (requires Dynamic Forms enabled)
- ✅ NEW: Uses `fieldInstance` elements with facet hierarchy (works everywhere)

**See:** `docs/LAYOUT_PATTERNS.md` for complete pattern documentation and examples.

**FlexiPage Components** (in order):

**Header Region**:
1. Highlights Panel (compact layout fields)
2. Path Component (if object has status/stage field)

**Main Region**:
1. Field Sections (using fieldInstance pattern) - one per section from Step 3
2. Activities Component (Tasks, Events, Emails)
3. Chatter (if collaboration enabled)

**Sidebar Region**:
1. Related Lists (3-5 priority lists from persona template)
2. Report Charts (for manager/executive personas)
```

#### F. Add Troubleshooting Section (After Line 303)
```markdown
### Dynamic Forms Compatibility

```
❌ Error: Component force:recordFieldSection not found
or
❌ Error: Invalid component type

Possible causes:
  1. Using old v1.0 pattern (Dynamic Forms dependency)
  2. Org doesn't have Dynamic Forms enabled
```

**Action**: Ensure using layout-template-engine.js v2.0.0 which uses fieldInstance pattern (no Dynamic Forms required)

**Verify Version**:
```bash
grep "version.*2.0.0" scripts/lib/layout-template-engine.js
```

If version is 1.x, update to v2.0.0 from plugin repository.
```

### Step 2: Update design-layout Command

**File:** `commands/design-layout.md`

**Changes Needed:**

#### A. Update Description (Line 3)
```yaml
# OLD:
description: Generate optimized Salesforce Lightning Page using AI-guided persona templates

# NEW:
description: Generate optimized Salesforce Lightning Page using proven fieldInstance pattern and AI-guided persona templates
```

#### B. Update "When to Use" Section (Lines 16-22)
```markdown
# REMOVE:
- Implementing Dynamic Forms

# ADD:
- Creating layouts with maximum org compatibility (fieldInstance pattern)
- Replacing layouts that fail deployment due to Dynamic Forms issues
```

#### C. Update Available Personas (Line 66)
```markdown
# OLD:
Available: `sales-rep`, `sales-manager`, `executive`, `support-agent`, `support-manager`

# NEW:
Available: `sales-rep`, `sales-manager`, `executive`, `support-agent`, `support-manager`, `marketing`, `customer-success`
```

#### D. Update Component Selection Description (Lines 124-128)
```markdown
# OLD:
**Step 4: Component Selection**
- Header: Highlights Panel, Path (if status/stage object)
- Main: Field Sections (Dynamic Forms), Activities, Chatter
- Sidebar: Related Lists (3-5 from persona template)
- Based on persona best practices

# NEW:
**Step 4: Component Selection**
- Header: Highlights Panel, Path (if status/stage object)
- Main: Field Sections (using fieldInstance pattern), Activities, Chatter
- Sidebar: Related Lists (3-5 from persona template)
- Based on persona best practices and maximum compatibility
```

#### E. Update Limitations Section (Lines 383-400)
```markdown
# REMOVE ENTIRE SECTION:
### 3. Dynamic Forms Migration
**Goal**: Migrate from Record Detail component to Dynamic Forms
...

# ADD NEW SECTION:
### 3. Maximum Compatibility Deployment

**Goal**: Create layouts that deploy to any Salesforce org (regardless of Dynamic Forms availability)

**Workflow**:
1. Generate new layout using v2.0.0 pattern (automatic)
2. Review generated fieldInstance structure
3. Deploy and test field-level behavior (required, read-only)
4. Verify compatibility across different org types

```bash
/design-layout --object Case --persona support-agent --org service-sandbox --verbose

# Generated layout uses fieldInstance pattern - works in all orgs
```

**Benefits:**
- ✅ No Dynamic Forms permission required
- ✅ Works in Professional, Enterprise, Unlimited, Developer editions
- ✅ Explicit field control and predictable behavior
```

### Step 3: Update Plugin USAGE.md

**File:** `.claude-plugin/USAGE.md`

**Changes Needed:**

#### A. Add New Section: "Layout Generation Workflows"

```markdown
## Layout Generation Workflows

### Overview

The Salesforce Plugin includes AI-powered layout generation using the proven **fieldInstance pattern** for maximum compatibility across all Salesforce orgs.

**Key Features:**
- 7 persona templates (sales-rep, sales-manager, executive, support-agent, support-manager, marketing, customer-success)
- Proven fieldInstance pattern (no Dynamic Forms dependency)
- AI-guided field scoring and section generation
- Quality validation (target: 85+ score)

### Quick Start: Generate a Layout

```bash
# Basic usage
/design-layout --object Contact --persona marketing --org my-sandbox

# With auto-detect persona
/design-layout --object Opportunity --detect-persona --org my-sandbox

# With verbose output
/design-layout --object Account --persona customer-success --org my-sandbox --verbose
```

### Common Workflows

#### 1. Create Marketing Contact Layout

**Scenario:** Marketing team needs a Contact layout focused on campaign attribution and lead nurturing.

**Steps:**
```bash
# Generate marketing-optimized Contact layout
/design-layout --object Contact --persona marketing --org marketing-sandbox --verbose

# Expected fields included:
# - Marketing_Stage__c, Last_Touch_Campaign__c
# - First_Touch_Date__c, Last_Engagement_Date__c
# - Recent_MQL_Date__c, SQL_Date_Stamp__c
# - Campaign Members related list

# Deploy and assign to Marketing app + Marketing User profile
```

**Output:** 5 sections, 25 fields, quality score 85+

#### 2. Create Customer Success Account Layout

**Scenario:** CSM team needs Account layout focused on health scores, renewals, and adoption metrics.

**Steps:**
```bash
# Generate CSM-optimized Account layout
/design-layout --object Account --persona customer-success --org service-sandbox --verbose

# Expected fields included:
# - Health_Score__c, Renewal_Date__c, ARR__c
# - Product_Adoption_Score__c, NPS_Score__c
# - Last_QBR_Date__c, Risk_Level__c
# - Cases and Contracts related lists

# Deploy and assign to Customer Success app + CSM profile
```

**Output:** 5 sections, 30+ fields, quality score 85+

#### 3. Multi-Persona Layouts for Same Object

**Scenario:** Different user roles need different views of the same object (e.g., Opportunity).

**Steps:**
```bash
# Sales Rep layout (deal-focused)
/design-layout --object Opportunity --persona sales-rep --org my-sandbox

# Sales Manager layout (pipeline and forecasting)
/design-layout --object Opportunity --persona sales-manager --org my-sandbox

# Executive layout (high-level KPIs only)
/design-layout --object Opportunity --persona executive --org my-sandbox

# Deploy all three and assign to different profiles
```

**Result:** Each role sees only relevant fields for their work.

### Pattern: fieldInstance (v2.0.0)

All generated layouts use the **proven fieldInstance pattern**:

**Why This Matters:**
- ✅ Works in ALL Salesforce editions (Professional, Enterprise, Unlimited, Developer)
- ✅ No Dynamic Forms permission required
- ✅ Explicit field control via `<fieldInstance>` elements
- ✅ Maximum deployment compatibility

**Pattern Details:** See `docs/LAYOUT_PATTERNS.md`

### Quality Standards

Generated layouts are automatically scored (0-100):

| Score | Grade | Status | Action |
|-------|-------|--------|--------|
| 90-100 | A | Exceptional | Deploy with confidence |
| 85-89 | B | Good | Safe to deploy |
| 80-84 | B- | Above Average | Review recommendations |
| 70-79 | C | Needs Improvement | Apply recommendations, regenerate |
| <70 | D/F | Poor | Do not deploy |

**Target:** All generated layouts should score 85+ (B or better)

### Available Personas

| Persona | Best For | Key Fields | Related Lists |
|---------|----------|------------|---------------|
| **sales-rep** | Individual contributors managing deals | Amount, CloseDate, StageName, Probability | Contacts, Tasks, Quotes |
| **sales-manager** | Pipeline and forecast management | Forecast, Territory, Team metrics | Opportunities, Reports |
| **executive** | High-level KPIs only | Revenue, Win Rate, Forecast Category | Dashboard components |
| **support-agent** | Case management and SLA tracking | Priority, Status, SLA fields | Cases, Activities, Knowledge |
| **support-manager** | Team performance and escalations | Case metrics, Team assignments | Team dashboards |
| **marketing** | Campaign attribution and lead nurturing | Marketing_Stage__c, Campaigns, MQL dates | Campaign Members, Activities |
| **customer-success** | Customer health and renewals | Health_Score__c, ARR__c, Renewal_Date__c | Cases, Contracts, Opportunities |

### Deployment Workflow

1. **Generate** - Use `/design-layout` with appropriate persona
2. **Review** - Check quality score (target: 85+)
3. **Deploy to Sandbox** - Test with actual users from target persona
4. **Validate** - Use `/analyze-layout` to confirm deployment quality
5. **Deploy to Production** - After sandbox validation and user approval

### Troubleshooting

**Issue:** "Component not found" error during deployment

**Cause:** Using old v1.0 pattern with Dynamic Forms dependency

**Fix:** Ensure using layout-template-engine.js v2.0.0:
```bash
grep "version.*2.0.0" scripts/lib/layout-template-engine.js
```

If version is 1.x, update plugin to latest version.

---

**See Also:**
- Pattern documentation: `docs/LAYOUT_PATTERNS.md`
- Agent details: `agents/sfdc-layout-generator.md`
- Command reference: `commands/design-layout.md`
```

### Step 4: Update Agent Discovery/Routing

**File:** Create `.claude-plugins/salesforce-plugin/docs/AGENT_ROUTING.md`

```markdown
# Salesforce Plugin Agent Routing

## Layout Generation Tasks

The following user requests should trigger the **sfdc-layout-generator** agent:

### Keywords

**Primary Keywords:**
- "create layout", "generate layout", "design layout"
- "new Lightning page", "new FlexiPage"
- "layout for [persona]"

**Secondary Keywords:**
- "optimize layout", "improve layout"
- "migrate to Lightning"
- "persona-based layout"

### Example User Requests

✅ **Auto-Route to sfdc-layout-generator:**
- "Create a Contact layout for marketing users"
- "Generate an Opportunity layout for sales reps"
- "Design a Case layout for support agents"
- "Make a customer success Account layout"
- "Optimize the Lead layout for sales managers"
- "Create a Lightning page for executives viewing opportunities"

✅ **Confirm Before Routing:**
- "Can you help with layouts?" → Confirm scope, then route
- "I need a new page" → Clarify if FlexiPage, then route
- "How do I create layouts?" → Provide guidance, offer to generate

❌ **Do NOT Route:**
- "Analyze this layout" → Use sfdc-layout-analyzer instead
- "Deploy this layout" → Use sfdc-layout-deployer (Phase 3)
- "Get layout feedback" → Use sfdc-layout-feedback-processor (Phase 4)

### Routing Decision Tree

```
User mentions "layout" or "Lightning page"
  ↓
Is task CREATION/GENERATION?
  ├─ YES → sfdc-layout-generator
  └─ NO → Is it ANALYSIS?
            ├─ YES → sfdc-layout-analyzer
            └─ NO → Is it DEPLOYMENT?
                      ├─ YES → Manual instructions (Phase 3 pending)
                      └─ NO → Ask for clarification
```

### Slash Command Alternative

Users can directly invoke layout generation:

```bash
/design-layout --object {Object} --persona {persona} --org {org}
```

This bypasses routing and directly invokes sfdc-layout-generator.

### Integration with Auto-Agent-Routing

If proactive agent routing is enabled, these patterns trigger automatic invocation:

**Pattern 1: Object + Persona**
```
"Create [a/an] {Object} layout for {persona} [users/role/team]"
→ Auto-invoke: sfdc-layout-generator with object={Object}, persona={persona}
```

**Pattern 2: Object + Org + Persona**
```
"Generate {Object} layout in {org} for {persona}"
→ Auto-invoke: sfdc-layout-generator with object={Object}, org={org}, persona={persona}
```

**Pattern 3: Persona-Only (Infer Object)**
```
"Make a layout for marketing users"
→ Prompt for object, then invoke sfdc-layout-generator
```

### New Persona Support

As of v3.13.0, two new personas are available:

1. **marketing** - Marketing users focused on campaign attribution
2. **customer-success** - CSMs focused on health scores and renewals

**Routing Examples:**
```
"Create Contact layout for marketing" → persona=marketing, object=Contact
"Generate Account layout for CSM" → persona=customer-success, object=Account
"Design layout for customer success manager" → persona=customer-success
```

### Quality Threshold Routing

After generation, if quality score <85:

```
Quality score: 78/100 (C+)
  ↓
Offer options:
  1. Apply recommendations and regenerate
  2. Use different persona
  3. Proceed with current layout (not recommended)
```

Don't auto-retry without user confirmation.
```

### Step 5: Add Integration Examples

**File:** Create `.claude-plugins/salesforce-plugin/docs/LAYOUT_EXAMPLES.md`

```markdown
# Salesforce Layout Generation Examples

## Complete End-to-End Examples

### Example 1: Marketing Contact Layout

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

**Generated FlexiPage Structure:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<FlexiPage xmlns="http://soap.sforce.com/2006/04/metadata">
    <!-- Header: Highlights Panel -->
    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentName>force:highlightsPanel</componentName>
            </componentInstance>
        </itemInstances>
        <name>header</name>
        <type>Region</type>
    </flexiPageRegions>

    <!-- Field Facet: Email -->
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

    <!-- ...additional field facets... -->

    <!-- Main Region: Tabset -->
    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentInstanceProperties>
                    <name>tabs</name>
                    <value>Facet-Tabs</value>
                </componentInstanceProperties>
                <componentName>flexipage:tabset</componentName>
            </componentInstance>
        </itemInstances>
        <name>main</name>
        <type>Region</type>
    </flexiPageRegions>

    <!-- Sidebar: Related Lists -->
    <flexiPageRegions>
        <itemInstances>
            <componentInstance>
                <componentInstanceProperties>
                    <name>relatedListApiName</name>
                    <value>CampaignMembers</value>
                </componentInstanceProperties>
                <componentName>force:relatedListSingleContainer</componentName>
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

**Deployment Steps:**
```bash
# 1. Copy files to Salesforce project
cp instances/my-sandbox/generated-layouts/2025-10-18-153022/* force-app/main/default/

# 2. Deploy to sandbox
sf project deploy start --source-dir force-app/main/default --target-org my-sandbox

# 3. Assign to Marketing app + Marketing User profile
# (via Setup → Lightning App Builder → Activation)

# 4. Test with marketing user

# 5. Validate quality
/analyze-layout --object Contact --org my-sandbox
```

---

### Example 2: Customer Success Account Layout

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

**Quality Analysis:**
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

---

### Example 3: Multi-Persona Opportunity Layouts

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

**Comparison:**

| Aspect | Sales Rep | Sales Manager | Executive |
|--------|-----------|---------------|-----------|
| **Sections** | 4 | 5 | 3 |
| **Total Fields** | 56 | 68 | 32 |
| **Top Fields** | Amount, Stage, Next Step | Pipeline, Forecast, Team | Amount, Stage, Close Date |
| **Related Lists** | Contacts, Tasks, Quotes | Opportunities (team), Reports | Dashboard widgets |
| **Quality Score** | 88 (B+) | 86 (B) | 91 (A-) |

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

**Last Updated:** 2025-10-18
**Pattern Version:** 2.0.0
**Plugin Version:** 3.13.0
```

---

## Implementation Checklist

Use this checklist to track integration progress:

### Phase 1: Core Updates ✅
- [x] Update layout-template-engine.js to v2.0.0
- [x] Create marketing persona template
- [x] Create customer-success persona template
- [x] Create LAYOUT_PATTERNS.md documentation

### Phase 2: Agent Integration 🔧
- [ ] Update sfdc-layout-generator.md agent
  - [ ] Update header description
  - [ ] Update "When to Use" section
  - [ ] Add pattern reference section
  - [ ] Update available personas list
  - [ ] Update Step 4 (FlexiPage generation)
  - [ ] Add Dynamic Forms troubleshooting
- [ ] Update sfdc-layout-analyzer.md (if needed)
- [ ] Test agent with new personas

### Phase 3: Command Integration 🔧
- [ ] Update design-layout.md command
  - [ ] Update description
  - [ ] Update "When to Use" section
  - [ ] Update available personas
  - [ ] Update component selection description
  - [ ] Replace Dynamic Forms section with compatibility section
- [ ] Test command with marketing and customer-success personas

### Phase 4: Documentation 🔧
- [ ] Update .claude-plugin/USAGE.md
  - [ ] Add "Layout Generation Workflows" section
  - [ ] Add persona comparison table
  - [ ] Add quality standards
  - [ ] Add troubleshooting guide
- [ ] Create docs/AGENT_ROUTING.md
- [ ] Create docs/LAYOUT_EXAMPLES.md
- [ ] Update plugin README.md if needed

### Phase 5: Discovery & Routing 🔧
- [ ] Update auto-agent-router patterns (if applicable)
- [ ] Add layout generation keywords to routing config
- [ ] Test proactive agent routing for layout requests
- [ ] Add to agent discovery docs

### Phase 6: Testing & Validation 🧪
- [ ] Generate test layouts using marketing persona
- [ ] Generate test layouts using customer-success persona
- [ ] Deploy test layouts to sandbox
- [ ] Validate quality scores (target: 85+)
- [ ] Test with actual users
- [ ] Document any issues encountered

### Phase 7: Communication 📢
- [ ] Update CHANGELOG.md
- [ ] Create migration guide for v1.0 users
- [ ] Notify team of new personas and pattern
- [ ] Update training materials (if applicable)

---

## Success Criteria

Integration is complete when:

- ✅ All agents reference fieldInstance pattern v2.0.0
- ✅ All commands mention new personas (marketing, customer-success)
- ✅ No references to "Dynamic Forms" as a requirement
- ✅ USAGE.md includes complete layout generation workflows
- ✅ Agent routing recognizes layout generation requests
- ✅ Test layouts generated with new personas deploy successfully
- ✅ Quality scores consistently meet 85+ threshold
- ✅ Documentation is comprehensive and accurate

---

## Rollout Strategy

### Stage 1: Internal Testing (This Week)
1. Complete Phase 1-3 updates (agents, commands)
2. Generate test layouts in sandbox
3. Validate deployments work
4. Fix any issues discovered

### Stage 2: Documentation (This Week)
1. Complete Phase 4 updates (USAGE.md, examples)
2. Review all documentation for accuracy
3. Create quick-start guide

### Stage 3: Soft Launch (Next Week)
1. Complete Phase 5 updates (routing, discovery)
2. Notify select users of new personas
3. Gather initial feedback
4. Iterate based on feedback

### Stage 4: Full Launch (Week After)
1. Complete Phase 7 updates (changelog, communication)
2. Announce to all users
3. Update training materials
4. Monitor adoption and quality scores

---

## Maintenance Plan

### Ongoing Tasks

**Weekly:**
- Monitor quality scores of generated layouts
- Review user feedback on new personas
- Track deployment success rates

**Monthly:**
- Analyze usage of new personas (marketing, customer-success)
- Review and update persona templates based on feedback
- Add new persona templates as requested

**Quarterly:**
- Comprehensive documentation review
- Pattern validation (ensure still optimal)
- Agent performance assessment

---

## Support & Troubleshooting

### Common Issues

**Issue 1: Old pattern still being used**
- Check layout-template-engine.js version (should be 2.0.0)
- Regenerate layouts after updating
- Clear any cached templates

**Issue 2: New personas not appearing**
- Verify template files exist in `templates/layouts/personas/`
- Check template JSON is valid
- Restart Claude Code session

**Issue 3: Deployment failures**
- Validate XML syntax with `xmllint`
- Check for missing required fields
- Verify facet hierarchy is correct
- See LAYOUT_PATTERNS.md troubleshooting section

### Getting Help

- **Documentation:** `docs/LAYOUT_PATTERNS.md`
- **Examples:** `docs/LAYOUT_EXAMPLES.md`
- **Agent Details:** `agents/sfdc-layout-generator.md`
- **Command Reference:** `commands/design-layout.md`

---

**Created:** 2025-10-18
**Version:** 1.0.0
**Status:** Ready for Implementation
**Owner:** RevPal Engineering
