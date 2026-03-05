---
name: analyze-layout
description: Analyze Lightning Pages and Classic Layouts for quality, performance, and UX optimization opportunities
argument-hint: "--object {Object} --org {org-alias}"
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
allowed-tools:
  - Read
  - Write
  - Bash
  - TodoWrite
  - Task
thinking-mode: enabled
---

# Analyze Salesforce Layout Quality

## Purpose

Generate comprehensive quality analysis for Salesforce Lightning Pages (FlexiPages), Classic Layouts, and Compact Layouts with objective scores (0-100) and actionable recommendations.

## When to Use

✅ **Use this command when:**
- Auditing layout quality before releases
- Planning UX improvements
- Comparing layouts across orgs (production vs sandbox)
- Validating Lightning Experience migration
- Identifying performance bottlenecks on record pages
- Preparing for layout redesign initiatives
- Generating executive UX quality reports

## Prerequisites

### Required Access
- Salesforce CLI authenticated to target org
- Metadata API read permissions
- Tooling API enabled

### Required Configuration
- Salesforce CLI installed (`sf`)
- Target org alias configured
- Instance directory structure (created automatically if missing)

## Usage

### Basic Usage

```bash
/analyze-layout --object {Object} --org {org-alias}
```

### With Options

```bash
/analyze-layout --object {Object} --org {org-alias} --output-dir /custom/path --verbose
```

## Parameters

### Required Parameters

- **--object** (REQUIRED): Salesforce object API name
  - Examples: `Opportunity`, `Account`, `Contact`, `Lead`, `CustomObject__c`
  - Must be exact API name (case-sensitive)
  - Standard and custom objects supported

- **--org** (REQUIRED): Salesforce CLI org alias
  - Must match authenticated org in `sf org list`
  - Can be production, sandbox, or scratch org

### Optional Parameters

- **--output-dir** (OPTIONAL): Custom output directory
  - Default: `instances/{org}/`
  - Directory created automatically if doesn't exist

- **--verbose** (OPTIONAL): Show detailed analysis output
  - Default: false
  - Includes raw JSON analysis file

## What This Command Does

### Analysis Workflow

**Step 1: Validate Connection**
- Confirms org is authenticated
- Extracts org ID and instance URL
- Fails fast if connection unavailable

**Step 2: Retrieve Metadata**
- Queries for all Lightning Pages (FlexiPages) for object
- Retrieves all Classic Layouts for object
- Retrieves all Compact Layouts for object
- Downloads complete XML metadata for each

**Step 3: Analyze Quality**
- Parses metadata to extract structure
- Scores layouts across 5 dimensions (0-100 scale):
  - Field Organization
  - User Experience
  - Performance
  - Accessibility
  - Best Practices
- Assigns letter grade (A+ to F)
- Identifies specific issues and recommendations

**Step 4: Generate Reports**
- Creates executive summary (Markdown)
- Optionally creates raw JSON analysis (with --verbose)
- Saves to instance directory

**Step 5: Display Results**
- Prints overall score and grade
- Shows top 3 recommendations
- Confirms file locations

## Quality Scoring Breakdown

### Lightning Pages (FlexiPage) - 100 Points

| Category | Max Points | What's Evaluated |
|----------|------------|------------------|
| **Field Organization** | 25 | Section count, section labels, fields per section |
| **User Experience** | 25 | Total field count, key field placement, required field marking, mobile optimization |
| **Performance** | 20 | Component count, related list count, slow components |
| **Accessibility** | 15 | Field labels, tab order, ARIA compliance |
| **Best Practices** | 15 | Dynamic Forms adoption, Highlights Panel, conditional visibility |

### Classic Layouts - 100 Points

| Category | Max Points | What's Evaluated |
|----------|------------|------------------|
| **Field Organization** | 30 | Section count, fields per section |
| **User Experience** | 30 | Total field count, section labels |
| **Performance** | 20 | Field count, related list count |
| **Accessibility** | 20 | Standard Salesforce rendering |

### Compact Layouts - 100 Points

| Category | Max Points | What's Evaluated |
|----------|------------|------------------|
| **Field Selection** | 50 | Field count (4-6 optimal), field types |
| **User Experience** | 30 | Key info visibility |
| **Best Practices** | 20 | Primary field present, mobile card optimization |

### Grade Scale

- **A+ (97-100)**: Exceptional layout design
- **A (93-96)**: Excellent layout design
- **A- (90-92)**: Very good layout design
- **B+ (87-89)**: Good layout design
- **B (83-86)**: Above average layout design
- **B- (80-82)**: Solid layout design
- **C+ (77-79)**: Acceptable layout design
- **C (73-76)**: Needs improvement
- **C- (70-72)**: Significant improvement needed
- **D+ (67-69)**: Major redesign recommended
- **D (63-66)**: Poor layout design
- **D- (60-62)**: Very poor layout design
- **F (<60)**: Requires complete redesign

## Output Files

### Executive Summary

**Location**: `instances/{org}/{Object}_Layout_Analysis_{date}.md`

**Contents**:
- Overall score and grade
- Summary statistics (FlexiPage count, layout count, etc.)
- Detailed scores by category
- Prioritized recommendations (HIGH, MEDIUM, LOW)
- Next steps

### Raw JSON Analysis (with --verbose)

**Location**: `instances/{org}/{Object}_Layout_Analysis_Raw_{date}.json`

**Contents**:
- Complete analysis data structure
- All metadata parsed
- Detailed scoring breakdown
- All issues identified

## Example Workflows

### Example 1: Analyze Opportunity Layouts

```bash
/analyze-layout --object Opportunity --org production
```

**Expected Output**:

```
🔍 Analyzing layout quality for Opportunity...

✓ Connected to: user@company.com (00D5w000001X2ZJEA0)
✓ Retrieved 3 FlexiPages for Opportunity
✓ Retrieved 2 Classic Layouts for Opportunity
✓ Retrieved 1 Compact Layout for Opportunity
✓ Generated quality analysis

================================================================================
LAYOUT QUALITY ANALYSIS: Opportunity
================================================================================

Overall Score: 78/100 (C+)

Breakdown:
  - FlexiPages: 3
  - Classic Layouts: 2
  - Compact Layouts: 1

Top Recommendations:
  1. [HIGH] Field Organization scored 15/25 (60%). Review field organization issues.
  2. [HIGH] Reduce field count on "Opportunity_Sales_Page" from 187 to <150
  3. [MEDIUM] Migrate to Dynamic Forms (Field Sections) from Record Detail component

📁 Executive summary saved to:
   instances/production/Opportunity_Layout_Analysis_2025-10-18.md

✓ Analysis complete
```

### Example 2: Verbose Analysis with Custom Output

```bash
/analyze-layout --object Account --org sandbox --output-dir /reports/layouts --verbose
```

**Expected Output**:

```
🔍 Analyzing layout quality for Account...

✓ Connected to: user@company.com.sandbox (00D5w000001X2ZJEA0)
✓ Retrieved 2 FlexiPages for Account
✓ Retrieved 1 Classic Layout for Account
✓ Retrieved 1 Compact Layout for Account
✓ Generated quality analysis

================================================================================
LAYOUT QUALITY ANALYSIS: Account
================================================================================

Overall Score: 85/100 (B)

Breakdown:
  - FlexiPages: 2 analyzed
  - Classic Layouts: 1 analyzed
  - Compact Layouts: 1 analyzed

FlexiPage Details:
  - Account_Sales_Page: 87/100 (B+)
  - Account_Support_Page: 82/100 (B-)

Top Recommendations:
  1. [MEDIUM] Add conditional visibility to "Executive Summary" section
  2. [LOW] Consider adding Highlights Panel to Account_Support_Page

📁 Files saved to:
   /reports/layouts/Account_Layout_Analysis_2025-10-18.md
   /reports/layouts/Account_Layout_Analysis_Raw_2025-10-18.json

✓ Analysis complete
```

### Example 3: No Lightning Pages Found

```bash
/analyze-layout --object Lead --org old-sandbox
```

**Expected Output**:

```
🔍 Analyzing layout quality for Lead...

✓ Connected to: user@company.com.oldsandbox (00D5w000001X2ZJEA0)
⚠️  No Lightning Pages found for Lead
✓ Retrieved 1 Classic Layout for Lead
✓ Retrieved 1 Compact Layout for Lead
✓ Generated quality analysis

================================================================================
LAYOUT QUALITY ANALYSIS: Lead
================================================================================

Overall Score: 62/100 (D)

Breakdown:
  - FlexiPages: 0 (Lightning Experience not configured)
  - Classic Layouts: 1
  - Compact Layouts: 1

Top Recommendations:
  1. [HIGH] No Lightning Pages found. Migrate to Lightning Experience for better UX.
  2. [HIGH] Create optimized Lightning Page for Sales Reps
  3. [MEDIUM] Classic layout has 142 fields - consider reducing to <100

📁 Executive summary saved to:
   instances/old-sandbox/Lead_Layout_Analysis_2025-10-18.md

✓ Analysis complete
```

## Common Use Cases

### 1. Pre-Release Quality Gate

**Goal**: Ensure layout changes don't degrade UX before deploying to production

**Workflow**:
1. Analyze layouts in sandbox after changes
2. Compare score to baseline (previous analysis)
3. If score decreased, investigate and fix before deploying
4. Deploy only if score maintained or improved

```bash
# Baseline (before changes)
/analyze-layout --object Opportunity --org sandbox
# Result: 78/100 (C+)

# After changes
/analyze-layout --object Opportunity --org sandbox
# Result: 82/100 (B-)

# ✓ Score improved by 4 points - safe to deploy
```

### 2. Cross-Org Comparison

**Goal**: Ensure production and sandbox layouts are consistent

**Workflow**:
1. Analyze same object in both orgs
2. Compare scores and recommendations
3. Identify discrepancies (missing pages, different field counts)
4. Sync lower-scoring org to match higher-scoring org

```bash
# Production
/analyze-layout --object Account --org production
# Result: 85/100 (B)

# Sandbox
/analyze-layout --object Account --org sandbox
# Result: 72/100 (C)

# ⚠️  Sandbox 13 points lower - investigate differences
```

### 3. Lightning Migration Validation

**Goal**: Confirm Lightning Pages are equal or better than Classic

**Workflow**:
1. Analyze object before Lightning migration (Classic only)
2. Create Lightning Pages
3. Analyze again with Lightning Pages
4. Validate Lightning score ≥ Classic score
5. Deploy if validated

```bash
# Before Lightning migration
/analyze-layout --object Case --org sandbox
# Result: 68/100 (D+) - Classic layouts only

# After creating Lightning Pages
/analyze-layout --object Case --org sandbox
# Result: 84/100 (B) - Lightning Pages improve quality

# ✓ Migration improves quality by 16 points - proceed
```

### 4. UX Audit Quarterly Review

**Goal**: Track layout quality trends over time

**Workflow**:
1. Schedule quarterly analysis of key objects
2. Store results with date in filename
3. Compare quarter-over-quarter scores
4. Address any declining trends

```bash
# Q1 2025
/analyze-layout --object Opportunity --org production
# Result: 78/100 (C+)
# File: Opportunity_Layout_Analysis_2025-01-15.md

# Q2 2025
/analyze-layout --object Opportunity --org production
# Result: 82/100 (B-)
# File: Opportunity_Layout_Analysis_2025-04-15.md

# ✓ +4 points improvement - UX improvements working
```

## Troubleshooting

### Issue: "Org not authenticated"

**Symptoms**:
```
❌ Error: Not authenticated to org 'my-org'
```

**Solution**:
```bash
sf org login web --alias my-org
sf org display --target-org my-org
```

### Issue: "Object not found"

**Symptoms**:
```
❌ Error: sObject type 'Oportunity' is not supported
```

**Solution**:
- Verify object API name (case-sensitive)
- Check for typos (e.g., "Oportunity" vs "Opportunity")
- For custom objects, ensure `__c` suffix included
- Verify object is deployed to target org

### Issue: "No metadata found"

**Symptoms**:
```
⚠️  No Lightning Pages found for Contact
⚠️  No Classic Layouts found for Contact
```

**Solution**:
- Object may use Salesforce default layouts (no custom layouts)
- Verify custom layouts exist in Setup → Page Layouts / Lightning App Builder
- Check Metadata API permissions
- Confirm Tooling API is enabled

### Issue: "Permission denied writing files"

**Symptoms**:
```
❌ Error: EACCES: permission denied, mkdir 'instances/...'
```

**Solution**:
- Check directory permissions
- Verify working directory is writable
- Try specifying custom output directory with --output-dir

## Interpreting Results

### High Scores (80-100, A/B range)

**What it means**:
- Layouts are well-designed
- Minor optimization opportunities only
- Focus on fine-tuning and persona-specific improvements

**Action**:
- Review recommendations for quick wins
- Consider persona-based variations (Sales Rep vs Manager)
- Maintain quality in future changes

### Medium Scores (60-79, C/D range)

**What it means**:
- Layouts are functional but have issues
- Moderate redesign recommended
- User productivity likely impacted

**Action**:
- Prioritize HIGH recommendations immediately
- Plan redesign sprint (1-2 weeks effort)
- Consider using /design-layout command to generate optimized version
- Test improvements with end users

### Low Scores (<60, F)

**What it means**:
- Layouts have major issues
- Complete redesign required
- Significant UX and/or performance problems

**Action**:
- Do NOT deploy these layouts to production
- Invoke sfdc-layout-generator agent to create new layout from scratch
- Use persona templates as starting point
- Validate redesign scores >80 before deploying

## Integration with Other Commands

### After Analysis → Generate Optimized Layout

```bash
# Step 1: Analyze current state
/analyze-layout --object Opportunity --org production
# Result: 62/100 (D-) - requires redesign

# Step 2: Generate optimized layout
/design-layout --object Opportunity --persona sales-rep --org sandbox
# Generates new layout with score 85+

# Step 3: Re-analyze to confirm
/analyze-layout --object Opportunity --org sandbox
# Result: 87/100 (B+) - improvement confirmed
```

### After Analysis → Submit Feedback

```bash
# Analyze layout
/analyze-layout --object Case --org production
# Result: 74/100 (C)

# Submit feedback on specific issue
/layout-feedback --object Case --org production --issue "Too cluttered - 187 fields"
# Feedback flows to Supabase for tracking
```

## Best Practices

### When to Run Analysis

- **Before every production deployment** - Quality gate
- **After major layout changes** - Validation
- **Quarterly UX audits** - Trend tracking
- **After Lightning migration** - Migration validation
- **When users report layout issues** - Root cause analysis

### Benchmarking

**By Org Type**:
- Production orgs: Target 80+ (B- or better)
- UAT/Sandbox: Target 75+ (C or better)
- Dev sandboxes: Target 70+ (C- or better)

**By Object Complexity**:
- Simple objects (Lead, Contact): Target 85+ (B or better)
- Medium objects (Account, Opportunity): Target 80+ (B- or better)
- Complex objects (CPQ Quote, Case with SLAs): Target 75+ (C or better)

### Continuous Improvement

1. **Baseline**: Run initial analysis, record score
2. **Target**: Set improvement goal (+10 points realistic per sprint)
3. **Implement**: Address top 3 HIGH recommendations
4. **Validate**: Re-analyze, confirm improvement
5. **Iterate**: Repeat until target achieved

---

## Agent Execution Instructions

When this command is invoked, delegate to the **sfdc-layout-analyzer** agent:

```
Task: Invoke sfdc-layout-analyzer agent with parameters:
  - Object: {object}
  - Org: {org}
  - Output Directory: {output-dir or default}
  - Verbose: {verbose flag}

Expected Deliverables:
  1. Executive summary Markdown file
  2. Console output with top recommendations
  3. Optional: Raw JSON analysis (if verbose)

Success Criteria:
  - Analysis completes successfully
  - Quality score generated (0-100)
  - Grade assigned (A+ to F)
  - Top 3 recommendations identified
  - Files saved to instance directory
```

The agent will handle:
- Org validation
- Metadata retrieval
- Quality analysis
- Report generation
- Error handling

---

**Command Version**: 1.0.0
**Last Updated**: 2025-10-18
**Part of**: salesforce-plugin v4.0.0 (Layout Designer feature)
