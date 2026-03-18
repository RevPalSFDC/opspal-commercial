---
name: sfpageaudit
description: Analyze Lightning Record Page field assignments for any Salesforce object
argument-hint: "--object {Object} --org {org-alias}"
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
thinking-mode: enabled
---

# Lightning Page Field Inventory Analysis

## Purpose

Analyzes Lightning Record Pages for any Salesforce object across any org, generating comprehensive field inventories and executive summaries with optimization recommendations.

## When to Use

- ✅ Understanding which fields are visible to different user profiles/teams
- ✅ Auditing page complexity and identifying optimization opportunities
- ✅ Supporting data migration planning (knowing which fields are actively used)
- ✅ Training material creation (documenting what fields users see)
- ✅ Compliance validation (ensuring sensitive fields have appropriate visibility)

## Prerequisites

### Required Access
- Salesforce CLI authenticated to target org (`sf org display --target-org {org}`)
- Metadata API read permissions
- Profile and user query permissions

### Required Configuration
- Salesforce CLI installed and configured
- Python 3.x available in environment
- Working directory structure: `/workspace/instances/salesforce/{org}/`

## Usage

### Basic Usage
```bash
/sfpageaudit --object {Object} --org {org-alias}
```

### With Custom Output Directory
```bash
/sfpageaudit --object {Object} --org {org-alias} --output-dir /custom/path
```

## Parameters

- `--object` (REQUIRED): Salesforce object API name
  - Examples: `Opportunity`, `Account`, `Contact`, `Lead`, `Custom__c`
  - Must be exact API name (case-sensitive)

- `--org` (REQUIRED): Salesforce CLI org alias
  - Must match authenticated org alias in `sf org list`
  - Can be production, sandbox, or scratch org

- `--output-dir` (OPTIONAL): Custom output directory path
  - Default: `/workspace/instances/salesforce/{org}/`
  - Directory will be created if it doesn't exist

## What This Command Does

### Step-by-Step Process

1. **Validates Salesforce connection** - Confirms org is authenticated and accessible
2. **Discovers Lightning Pages** - Queries for all record pages for the specified object
3. **Retrieves FlexiPage metadata** - Downloads complete page configurations
4. **Extracts field references** - Parses XML to identify all fields on each page
5. **Retrieves object metadata** - Gets comprehensive field metadata from Salesforce
6. **Enriches field inventories** - Combines page fields with metadata (type, label, help text)
7. **Generates executive summary** - Creates analysis report with statistics and recommendations
8. **Saves all artifacts** - Writes CSVs and summary to instance directory

### Output Files

**Per Lightning Page CSV** (`{PageName}_fields.csv`):
```csv
Field_API_Name,Field_Label,Field_Type,Field_Classification,Help_Text,UI_Behavior
AccountId,Account ID,reference,Standard,,required
Amount,Amount,currency,Standard,,required
Custom_Field__c,Custom Field,text,Custom,This is help text,none
```

**Executive Summary** (`{Object}_Lightning_Pages_Executive_Summary.md`):
- Page inventory with field counts
- Complexity analysis
- Optimization recommendations
- Technical details and artifact locations

## Example Workflows

### Example 1: Analyze Contact Pages

```bash
/sfpageaudit --object Contact --org my-production
```

**Expected Output**:
```
🔍 Analyzing Lightning Pages for Contact in org: my-production

✓ Validated Salesforce connection
✓ Found 3 Lightning Pages for Contact
✓ Retrieved FlexiPage metadata
✓ Extracted 487 total field references
✓ Retrieved Contact metadata (245 fields)
✓ Enriched all field inventories
✓ Generated executive summary

📁 Artifacts saved to: /workspace/instances/salesforce/my-production/
   - Contact_Sales_Page_fields.csv (142 fields)
   - Contact_Support_Page_fields.csv (98 fields)
   - Contact_Default_Page_fields.csv (167 fields)
   - Contact_Lightning_Pages_Executive_Summary.md

📊 Analysis Summary:
   - 3 Lightning Pages analyzed
   - Field counts: 98-167 fields per page
   - 2 recommendations for optimization

💡 Next steps:
   - Review executive summary for optimization opportunities
   - Share CSVs with training team for documentation
   - Validate field visibility aligns with security requirements
```

### Example 2: Analyze Custom Object

```bash
/sfpageaudit --object CustomProduct__c --org my-sandbox
```

**Expected Output**:
```
🔍 Analyzing Lightning Pages for CustomProduct__c in org: my-sandbox

✓ Validated Salesforce connection
✓ Found 1 Lightning Page for CustomProduct__c
✓ Retrieved FlexiPage metadata
✓ Extracted 84 field references
✓ Retrieved CustomProduct__c metadata (112 fields)
✓ Enriched field inventory
✓ Generated executive summary

📁 Artifacts saved to: /workspace/instances/salesforce/my-sandbox/
   - CustomProduct_Record_Page_fields.csv (84 fields)
   - CustomProduct__c_Lightning_Pages_Executive_Summary.md
```

### Example 3: No Lightning Pages Found

```bash
/sfpageaudit --object Lead --org my-scratch-org
```

**Expected Output**:
```
🔍 Analyzing Lightning Pages for Lead in org: my-scratch-org

✓ Validated Salesforce connection
⚠️  No Lightning Pages found for Lead

This means one of the following:
   1. The object uses Salesforce default page layouts (not Lightning Pages)
   2. No custom Lightning Pages have been deployed for this object
   3. FlexiPage metadata may not be accessible (check permissions)

💡 Troubleshooting:
   - Verify Lightning Pages exist in Setup → Lightning App Builder
   - Check if object uses Classic page layouts instead
   - Confirm Metadata API permissions are enabled
```

## Output CSV Format

Each CSV contains the following columns:

| Column | Description | Example |
|--------|-------------|---------|
| `Field_API_Name` | Salesforce API name | `AccountId`, `Custom_Field__c` |
| `Field_Label` | Human-readable label | `Account ID`, `Custom Field` |
| `Field_Type` | Data type | `reference`, `text`, `picklist`, `currency` |
| `Field_Classification` | Standard or Custom | `Standard`, `Custom` |
| `Help_Text` | Field-level help text | `Enter customer notes` (or empty) |
| `UI_Behavior` | Page behavior | `required`, `readonly`, `none` |

## Common Use Cases

### 1. Page Complexity Audit

**Goal**: Identify overly complex pages that may need simplification

**Process**:
1. Run `/sfpageaudit` for target object
2. Review executive summary field count analysis
3. Identify pages with 200+ fields
4. Analyze which fields have low usage/completion rates

### 2. Field Visibility Mapping

**Goal**: Document which fields each user profile can see

**Process**:
1. Run `/sfpageaudit` for object
2. Cross-reference page CSVs with profile assignments
3. Create visibility matrix by profile/record type
4. Validate sensitive fields have appropriate restrictions

### 3. Data Migration Planning

**Goal**: Prioritize which fields to migrate based on actual usage

**Process**:
1. Run `/sfpageaudit` for objects being migrated
2. Fields on Lightning Pages = actively used in UI
3. Fields not on any page = likely low usage
4. Prioritize migration of high-visibility fields first

### 4. Training Documentation

**Goal**: Create accurate field reference guides for end users

**Process**:
1. Run `/sfpageaudit` for object
2. Use CSVs to generate field glossaries
3. Include help text directly from metadata
4. Organize by page/section for context

## Troubleshooting

### Issue: "Salesforce CLI not authenticated"

**Symptoms**:
```
❌ Error: Not authenticated to org 'my-org'
```

**Solution**:
```bash
# Authenticate to org
sf org login web --alias my-org

# Verify authentication
sf org display --target-org my-org
```

### Issue: "FlexiPage metadata not accessible"

**Symptoms**:
```
❌ Error: INVALID_TYPE: FlexiPage
```

**Solution**:
- Verify user has Metadata API permissions
- Check if Tooling API is enabled for org
- Try using `--use-tooling-api` flag for queries

### Issue: "Object not found"

**Symptoms**:
```
❌ Error: sObject type '{Object}' is not supported
```

**Solution**:
- Verify object API name is correct (case-sensitive)
- Check if object is deployed to target org
- For custom objects, ensure `__c` suffix is included

### Issue: "Permission denied writing files"

**Symptoms**:
```
❌ Error: Permission denied: /workspace/instances/...
```

**Solution**:
- Check directory permissions
- If on Windows mount, files stage in `/tmp` first
- Verify working directory is writable

## Advanced Usage

### Multi-Object Analysis

Analyze multiple objects in sequence:

```bash
# Analyze core CRM objects
for obj in Account Contact Opportunity Lead; do
  /sfpageaudit --object $obj --org my-production
done
```

### Cross-Org Comparison

Compare page complexity across orgs:

```bash
# Run for each org
/sfpageaudit --object Opportunity --org production
/sfpageaudit --object Opportunity --org uat
/sfpageaudit --object Opportunity --org dev-sandbox

# Compare field counts from summaries
```

### Custom Output Location

Save to project-specific directory:

```bash
/sfpageaudit --object Account --org my-org \
  --output-dir /projects/crm-audit/lightning-pages/
```

## Technical Details

### Data Sources
- **Salesforce Metadata API**: FlexiPage retrieval
- **Salesforce Tooling API**: Lightning Page discovery
- **Salesforce Describe API**: Object and field metadata

### File Processing
- All files stage in `/tmp` before copying to final destination
- UTF-8 encoding used for all CSVs
- Field names sanitized for cross-platform compatibility

### Performance
- Typical execution: 30-90 seconds depending on page count
- Network-bound (Metadata API retrieval)
- No org data modifications (read-only analysis)

## Best Practices

1. **Run regularly** - Lightning Pages change as orgs evolve
2. **Version control CSVs** - Track field visibility changes over time
3. **Share summaries** - Distribute executive summaries to stakeholders
4. **Combine with usage data** - Cross-reference with actual field completion rates
5. **Validate before migration** - Always audit pages before major org changes

## Limitations

- **Classic page layouts not supported** - Only analyzes Lightning Pages
- **Dynamic forms not fully represented** - Conditional field visibility requires manual review
- **Component fields may be incomplete** - Custom Lightning components may not expose all field references
- **Profile assignments require manual mapping** - Command doesn't automatically determine which profiles see which pages

## Related Commands

- `/dedup` - Analyze duplicate detection rules
- `/audit-automation` - Review automation framework
- `/deploy-report-template` - Deploy analytics templates
- `/reflect` - Submit session feedback for improvements

---

## Agent Execution Instructions

When executing this command, follow the **9-Step Lightning Page Analysis Playbook**:

### Step 1: Validate Instance Directory
- Derive instance directory from org alias: `/workspace/instances/salesforce/{org}/`
- Create directory if missing: `mkdir -p {instance_dir}`
- Set environment variable: `export INSTANCE_DIR={instance_dir}`

### Step 2: Validate Salesforce Connection
```bash
sf org display --target-org {org} --json
```
- Verify org is authenticated and accessible
- Extract org ID and instance URL for validation
- Fail fast if org not available

### Step 3: Discover Lightning Pages
```bash
sf data query \
  --query "SELECT Id, DeveloperName, MasterLabel FROM FlexiPage WHERE Type = 'RecordPage' AND EntityDefinitionId = '{Object}'" \
  --target-org {org} \
  --use-tooling-api \
  --json > /tmp/flexipages_list.json
```

### Step 4: Retrieve FlexiPage Metadata
```bash
# Create package.xml
# Retrieve all FlexiPages for object
sf project retrieve start \
  --manifest /tmp/package.xml \
  --target-dir /tmp/flexipage-metadata \
  --target-org {org}
```

### Step 5: Extract Field References
```bash
python3 {plugin_root}/scripts/lib/extract-flexipage-fields.py \
  /tmp/flexipage-metadata/force-app/main/default/flexipages/{PageName}.flexipage-meta.xml \
  /tmp/{PageName}_fields.csv
```

### Step 6: Retrieve Object Metadata
```bash
sf sobject describe \
  --sobject {Object} \
  --target-org {org} \
  --json > /tmp/{Object}_metadata.json
```

### Step 7: Enrich Field Inventories
```bash
python3 {plugin_root}/scripts/lib/enrich-field-metadata.py \
  /tmp/{PageName}_fields.csv \
  /tmp/{Object}_metadata.json \
  /tmp/{PageName}_enriched.csv
```

### Step 8: Generate Executive Summary
```bash
python3 {plugin_root}/scripts/lib/generate-lightning-page-report.py \
  --org {org} \
  --object {Object} \
  --input-dir /tmp \
  --output-file /tmp/{Object}_Lightning_Pages_Executive_Summary.md
```

### Step 9: Save Artifacts to Instance Directory
```bash
# Copy all CSVs
cp /tmp/*_enriched.csv {instance_dir}/

# Copy executive summary
cp /tmp/{Object}_Lightning_Pages_Executive_Summary.md {instance_dir}/

# Report success
echo "✓ All artifacts saved to {instance_dir}/"
```

### Error Handling

- **Fail fast** on authentication errors (Step 2)
- **Gracefully handle** zero Lightning Pages found (Step 3)
- **Continue on partial failures** - if one page fails to parse, process remaining pages
- **Provide clear error messages** - include troubleshooting steps in output
- **Clean up temp files** - Always remove `/tmp` files after completion or failure

### Progress Reporting

Report progress to user after each step:
```
🔍 Analyzing Lightning Pages for {Object} in org: {org}
✓ Validated Salesforce connection
✓ Found {N} Lightning Pages for {Object}
✓ Retrieved FlexiPage metadata
...
```
