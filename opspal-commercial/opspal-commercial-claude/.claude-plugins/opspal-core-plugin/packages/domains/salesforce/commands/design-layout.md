---
name: design-layout
description: Generate optimized Salesforce Lightning Page using proven fieldInstance pattern and AI-guided persona templates
allowed-tools: Read, Write, Bash, TodoWrite, Task
thinking-mode: enabled
---

# Design Salesforce Layout

## Purpose

Generate optimized, persona-based Lightning Pages (FlexiPages), Compact Layouts, and optionally Classic Layouts using AI-powered template engine with intelligent field scoring.

## When to Use

✅ **Use this command when:**
- Creating new layouts from scratch
- Redesigning existing layouts for better UX
- Migrating from Classic to Lightning Experience
- Creating layouts with maximum org compatibility (fieldInstance pattern)
- Replacing layouts that fail deployment due to Dynamic Forms issues
- Standardizing layouts across orgs
- Acting on `/analyze-layout` recommendations (score <85)

## Prerequisites

### Required Access
- Salesforce CLI authenticated to target org
- Metadata API read permissions (to retrieve field metadata)
- Target org accessible

### Required Configuration
- Salesforce CLI installed (`sf`)
- Target org alias configured
- Persona templates available (included with plugin)

## Usage

### Basic Usage

```bash
/design-layout --object {Object} --persona {persona} --org {org-alias}
```

### With Auto-Detection

```bash
/design-layout --object {Object} --detect-persona --org {org-alias}
```

### With Object Template

```bash
/design-layout --object {Object} --persona {persona} --org {org-alias} --object-template {template}
```

## Parameters

### Required Parameters

- **--object** (REQUIRED): Salesforce object API name
  - Examples: `Opportunity`, `Account`, `Contact`, `Lead`, `Case`
  - Must be exact API name (case-sensitive)
  - Standard and custom objects supported

- **--persona** (REQUIRED unless --detect-persona): Persona template name
  - Available: `sales-rep`, `sales-manager`, `executive`, `support-agent`, `support-manager`, `marketing`, `customer-success`
  - Determines field priorities, component selection, section organization

- **--org** (REQUIRED): Salesforce CLI org alias
  - Must match authenticated org in `sf org list`
  - Typically use sandbox for testing

### Optional Parameters

- **--detect-persona**: Auto-detect persona from current user profile/role
  - Analyzes Profile, Role, PermissionSets to determine best persona
  - Shows confidence level (HIGH, MEDIUM, LOW)
  - Asks for confirmation if confidence <75%

- **--object-template**: Specific object template to use
  - Examples: `sales-cloud-default`, `cpq-enhanced`, `service-cloud-default`
  - Overrides default object-persona mapping
  - See `templates/layouts/objects/` for available templates

- **--include-classic**: Generate Classic Layout in addition to FlexiPage
  - Useful for backward compatibility
  - Mirrors FlexiPage field arrangement

- **--output-dir**: Custom output directory
  - Default: `instances/{org}/generated-layouts/{timestamp}/`
  - Directory created automatically if doesn't exist

- **--verbose**: Show detailed generation output
  - Field scoring details
  - Section generation logic
  - Component selection rationale

## What This Command Does

### Generation Workflow

**Step 1: Persona Selection**
- If `--detect-persona`: Analyzes user profile/role
- If `--persona`: Uses specified persona
- Loads persona template JSON
- Validates persona exists

**Step 2: Field Scoring**
- Retrieves all fields for object from org
- Scores each field (0-100):
  - Persona Priority (40 pts)
  - Field Metadata (30 pts)
  - Usage Patterns (20 pts - if available)
  - Business Logic (10 pts)
- Classifies fields: CRITICAL, IMPORTANT, CONTEXTUAL, LOW, MINIMAL

**Step 3: Section Generation**
- Groups fields into logical sections
- Section 1: CRITICAL fields (score ≥90)
- Section 2+: IMPORTANT fields (75-89), max 15 per section
- Section N: CONTEXTUAL fields (50-74), limited to 20
- Names sections descriptively

**Step 4: Component Selection**
- Header: Highlights Panel, Path (if status/stage object)
- Main: Field Sections (using fieldInstance pattern), Activities, Chatter
- Sidebar: Related Lists (3-5 from persona template)
- Based on persona best practices and maximum compatibility

**Step 5: Metadata Generation**
- FlexiPage XML metadata
- CompactLayout XML metadata
- Classic Layout XML metadata (if --include-classic)
- Generation summary JSON

**Step 6: Quality Validation**
- Analyzes generated layout
- Calculates quality score (0-100)
- Validates against quality gates (target: 85+)
- Provides recommendations if score <85

**Step 7: Save Output**
- Saves all metadata files to output directory
- Creates deployment instructions
- Logs generation summary

**Step 8: Display Results**
- Overall quality score and grade
- Field/section/component counts
- File locations
- Deployment instructions

## Output Files

### Generated Metadata Files

**Location**: `instances/{org}/generated-layouts/{timestamp}/`

**Files**:
1. `{Object}_{Persona}_FlexiPage.flexipage-meta.xml` - Lightning Page
2. `{Object}_{Persona}_CompactLayout.compactLayout-meta.xml` - Highlights Panel fields
3. `{Object}_{Persona}_Layout.layout-meta.xml` - Classic Layout (if --include-classic)
4. `{Object}_{Persona}_generation_summary.json` - Metadata + quality analysis
5. `DEPLOYMENT_INSTRUCTIONS.md` - Step-by-step deployment guide

## Quality Scoring

Generated layouts are automatically analyzed and scored (0-100):

| Score Range | Grade | Assessment | Action |
|-------------|-------|------------|--------|
| 90-100 | A+, A, A- | Exceptional | Deploy with confidence |
| 85-89 | B+, B | Good | Safe to deploy |
| 80-84 | B- | Above Average | Review recommendations, consider improvements |
| 70-79 | C+, C, C- | Needs Improvement | Apply recommendations, regenerate |
| <70 | D, F | Poor | Significant issues, do not deploy |

**Quality Gates**:
- ✅ Score ≥85: PASS (ready for deployment)
- ⚠️ Score 70-84: WARN (review recommendations)
- ❌ Score <70: FAIL (regenerate with adjustments)

## Example Workflows

### Example 1: Generate Opportunity Layout for Sales Reps

```bash
/design-layout --object Opportunity --persona sales-rep --org my-sandbox --verbose
```

**Expected Output**:

```
🎨 Generating layout for Opportunity (persona: sales-rep)...

✓ Loaded persona template: sales-rep
✓ Retrieved 87 fields for Opportunity
🧮 Scoring fields...
   Critical (90-100): 8 fields
   Important (75-89): 15 fields
   Contextual (50-74): 22 fields
   Low Priority (25-49): 28 fields
   Minimal (0-24): 14 fields

✓ Generated 4 sections with 45 fields
✓ Selected 9 components:
   - Highlights Panel
   - Path
   - Field Section: Opportunity Information (8 fields)
   - Field Section: Additional Details (15 fields)
   - Field Section: Supplemental Information (22 fields)
   - Activities
   - Related List: Contact Roles
   - Related List: Quotes
   - Related List: Tasks

✓ Generated CompactLayout with 5 fields
✓ Quality validation: 88/100 (B+)

📁 Files saved to:
   instances/my-sandbox/generated-layouts/2025-10-18-143522/
   - Opportunity_sales_rep_FlexiPage.flexipage-meta.xml
   - Opportunity_sales_rep_CompactLayout.compactLayout-meta.xml
   - Opportunity_sales_rep_generation_summary.json
   - DEPLOYMENT_INSTRUCTIONS.md

💡 Deployment Instructions:
   1. Review generated files in output directory
   2. Deploy to sandbox using SF CLI or change set
   3. Assign to Sales app + Sales Rep profile
   4. Test with sales rep user
   5. Validate with /analyze-layout command

✓ Complete
```

### Example 2: Auto-Detect Persona

```bash
/design-layout --object Case --detect-persona --org production
```

**Expected Output**:

```
🎨 Generating layout for Case...

🔍 Detecting persona from current user...
   User: support.agent@company.com
   Profile: Service Cloud User
   Role: Support Agent - Americas
   Permission Sets: Service Cloud User, Knowledge User

✓ Detected persona: support-agent (confidence: 95% - HIGH)

Proceeding with support-agent persona...

✓ Loaded persona template: support-agent
✓ Retrieved 112 fields for Case
✓ Generated 5 sections with 68 fields
✓ Selected 11 components including Knowledge and SLA Status
✓ Quality score: 91/100 (A-)

📁 Files saved to:
   instances/production/generated-layouts/2025-10-18-150033/

✓ Complete
```

### Example 3: With Object Template

```bash
/design-layout --object Opportunity --persona sales-manager --org cpq-sandbox \
  --object-template cpq-enhanced --verbose
```

**Expected Output**:

```
🎨 Generating layout for Opportunity (persona: sales-manager)...

✓ Loaded object template: opportunity/cpq-enhanced.json
✓ Loaded persona template: sales-manager.json
✓ Merging templates...

CPQ-specific fields included:
  - SBQQ__QuotePricebookId__c (score: 92 - CRITICAL)
  - SBQQ__PrimaryQuote__c (score: 88 - IMPORTANT)
  - SBQQ__Contracted__c (score: 85 - IMPORTANT)
  - SBQQ__OrderProductBookings__c (score: 82 - IMPORTANT)

✓ Generated 6 sections with 78 fields
✓ Quality score: 86/100 (B)

📁 Files saved to:
   instances/cpq-sandbox/generated-layouts/2025-10-18-151245/

✓ Complete
```

### Example 4: Low Confidence Auto-Detection

```bash
/design-layout --object Account --detect-persona --org hybrid-org
```

**Expected Output**:

```
🎨 Generating layout for Account...

🔍 Detecting persona from current user...
   User: partner.manager@company.com
   Profile: Partner Community User
   Role: Partner Manager
   Permission Sets: Partner Access

⚠️  Low confidence persona detection (62% - MEDIUM)

Detected: sales-manager
Alternatives:
  - executive (score: 58)
  - sales-rep (score: 45)

Recommendation: Confirm persona or specify explicitly

Would you like to:
  1. Proceed with 'sales-manager' (recommended)
  2. Use 'executive' instead
  3. Use 'sales-rep' instead
  4. Cancel and specify persona manually

[User selects option 1]

Proceeding with sales-manager persona...

✓ Generated layout
✓ Quality score: 84/100 (B-)
```

## Common Use Cases

### 1. Lightning Migration

**Goal**: Migrate Classic layouts to optimized Lightning Pages

**Workflow**:
1. Analyze existing Classic layout to establish baseline
2. Generate new Lightning layout with appropriate persona
3. Compare quality scores (target: Lightning ≥ Classic + 10 points)
4. Deploy to sandbox and test
5. Gather user feedback before production deployment

```bash
# Step 1: Analyze Classic
/analyze-layout --object Opportunity --org production

# Step 2: Generate Lightning
/design-layout --object Opportunity --persona sales-rep --org sandbox

# Step 3: Compare and deploy
```

### 2. Persona-Specific Layouts

**Goal**: Create different layouts for different user personas

**Workflow**:
1. Generate layout for each persona (sales-rep, sales-manager, executive)
2. Deploy all layouts to sandbox
3. Assign each layout to appropriate app + profile combination
4. Test with users from each persona
5. Deploy to production

```bash
# Sales Rep layout
/design-layout --object Opportunity --persona sales-rep --org sandbox

# Sales Manager layout
/design-layout --object Opportunity --persona sales-manager --org sandbox

# Executive layout
/design-layout --object Opportunity --persona executive --org sandbox
```

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
- ✅ Maximum deployment reliability

### 4. Quality-Driven Redesign

**Goal**: Improve low-scoring existing layout

**Workflow**:
1. Analyze existing layout (gets score)
2. If score <85, generate new layout
3. Compare old vs new quality scores
4. Deploy new layout if improvement ≥10 points

```bash
# Step 1: Analyze existing
/analyze-layout --object Account --org production
# Result: 72/100 (C)

# Step 2: Generate optimized
/design-layout --object Account --persona sales-rep --org sandbox
# Result: 87/100 (B+)

# Improvement: +15 points → Deploy
```

## Troubleshooting

### Issue: "Persona template not found"

**Symptoms**:
```
❌ Error: Failed to load persona template 'sales-mgr'
```

**Solution**:
- Use exact persona name: `sales-rep`, `sales-manager`, `executive`, `support-agent`, `support-manager`, `marketing`, `customer-success`
- Check spelling (case-sensitive, use hyphens not underscores)

### Issue: "Object not found"

**Symptoms**:
```
❌ Error: Failed to get field metadata for Oportunity
```

**Solution**:
- Verify object API name (case-sensitive)
- Check for typos ("Oportunity" vs "Opportunity")
- For custom objects, ensure `__c` suffix

### Issue: "Low quality score"

**Symptoms**:
```
⚠️  Quality score: 68/100 (D+)

Top Issues:
  1. Too many fields (152 total)
  2. Missing Highlights Panel
  3. No Dynamic Forms
```

**Solution**:
- Review quality recommendations
- Adjust persona template if needed
- Regenerate with different persona or object template
- Contact support if persistent issues

### Issue: "Permission denied"

**Symptoms**:
```
❌ Error: EACCES: permission denied, mkdir 'instances/...'
```

**Solution**:
- Check directory permissions
- Verify working directory is writable
- Use `--output-dir` to specify writable location

## Deployment Instructions

Generated layouts include `DEPLOYMENT_INSTRUCTIONS.md` with specific steps for that layout. General process:

### Sandbox Deployment (Recommended First)

```bash
# Copy files to Salesforce project
cp instances/{org}/generated-layouts/{timestamp}/* force-app/main/default/

# Deploy to sandbox
sf project deploy start --source-dir force-app/main/default --target-org {sandbox}

# Assign Lightning Page to app/profile
# (via Setup → Lightning App Builder → Activation)

# Test with target persona user
```

### Production Deployment

```bash
# After sandbox testing and approval:

# Option 1: Change Set
# Create change set in sandbox, add components, upload to production

# Option 2: SF CLI Deploy (if using SF CLI in production)
sf project deploy start --source-dir force-app/main/default --target-org production
```

### Post-Deployment Validation

```bash
# Validate deployed layout
/analyze-layout --object {Object} --org {deployed-org}

# Should score same or better than generated layout
```

## Best Practices

### Before Generation

1. **Analyze existing layout** (if one exists) to understand current state
2. **Choose appropriate persona** based on primary user base
3. **Review field-level security** for target users
4. **Check org edition** (some components require specific licenses)

### During Generation

1. **Start with standard personas** (sales-rep, support-agent) before customizing
2. **Use verbose mode** to understand generation logic
3. **Review object templates** if available for your use case
4. **Consider mobile users** (if >30% mobile usage, optimize accordingly)

### After Generation

1. **Deploy to sandbox FIRST** (never directly to production)
2. **Test with actual users** from target persona
3. **Validate quality score** with `/analyze-layout`
4. **Gather feedback** with `/layout-feedback` (Phase 4)
5. **Iterate based on feedback** before production deployment

## Integration with Other Commands

### After Analysis

```bash
# Analyze existing layout
/analyze-layout --object Opportunity --org production
# Result: 72/100 (C) - needs improvement

# Generate optimized replacement
/design-layout --object Opportunity --persona sales-rep --org sandbox
# Result: 88/100 (B+) - ready to deploy
```

### Before Deployment (Phase 3)

```bash
# Generate layout
/design-layout --object Case --persona support-agent --org sandbox

# Validate generation
/analyze-layout --object Case --org sandbox

# Deploy (Phase 3 feature - not yet available)
/deploy-layout --object Case --org sandbox --validate-only
```

## Limitations (Phase 2)

### Manual Deployment Only

Phase 2 does **NOT** include automatic deployment:
- ✅ Generates deployment-ready XML metadata
- ✅ Provides detailed deployment instructions
- ❌ **Does NOT** deploy to org automatically

Automatic deployment comes in **Phase 3**.

### No Field Creation

Generates layouts from existing fields only:
- ✅ Scores and includes all existing fields
- ❌ Does NOT create new custom fields
- ❌ Does NOT modify field definitions

### Limited Usage Data

Field scoring without org-specific usage data:
- ✅ Uses field metadata + persona priorities
- ⚠️ Usage patterns (fill rate, update frequency) not yet integrated
- Future enhancement in later phases

### No Live Preview

Cannot preview layout before deployment:
- ✅ Generates valid metadata
- ✅ Validates quality score
- ❌ Cannot show visual preview without deploying
- Future enhancement: Scratch org preview

## Success Criteria

All generated layouts must meet:
- ✅ Quality score ≥85 (B or better)
- ✅ Field count within persona guidelines
- ✅ Section count optimal (3-6)
- ✅ Component count ≤15
- ✅ Mobile-optimized
- ✅ Deployment-ready metadata (valid XML)

---

## Agent Execution Instructions

When this command is invoked, delegate to the **sfdc-layout-generator** agent:

```
Task: Invoke sfdc-layout-generator agent with parameters:
  - Object: {object}
  - Persona: {persona or auto-detect}
  - Org: {org}
  - Object Template: {object-template or default}
  - Include Classic: {include-classic flag}
  - Output Directory: {output-dir or default}
  - Verbose: {verbose flag}

Expected Deliverables:
  1. FlexiPage metadata XML
  2. CompactLayout metadata XML
  3. Classic Layout metadata XML (if --include-classic)
  4. Generation summary JSON
  5. Deployment instructions Markdown
  6. Quality analysis report

Success Criteria:
  - Generation completes successfully
  - Quality score ≥85 (B or better)
  - All metadata files valid and deployment-ready
  - Files saved to output directory
  - Deployment instructions provided
```

---

**Command Version**: 2.0.0
**Last Updated**: 2025-10-18
**Pattern Version**: fieldInstance v2.0.0 (replaces Dynamic Forms v1.0)
**Part of**: salesforce-plugin v3.13.0 (Layout Designer Phase 2)

**Changelog v2.0.0:**
- ✅ Updated to use fieldInstance pattern for maximum compatibility
- ✅ Removed Dynamic Forms dependency
- ✅ Added 2 new personas: marketing, customer-success
- ✅ Replaced "Dynamic Forms Migration" section with "Maximum Compatibility Deployment"
- ✅ Updated all examples and workflows to reference v2.0 pattern
