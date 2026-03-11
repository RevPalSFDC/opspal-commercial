---
name: deploy-report-template
description: Deploy a report from template with automated field resolution
argument-hint: "\\"
---

# Deploy Report Template

You are deploying a Salesforce report from a template using automated field resolution.

## Task

Deploy a report template to a Salesforce org using the Report Template Deployer system.

## Required Information

Ask the user for these details if not provided:

1. **Template**: Which template to deploy
   - Available templates in `templates/reports/`
   - Examples: "team-performance", "win-loss-analysis", "pipeline-by-stage"

2. **Org**: Target Salesforce org alias
   - Use `sf org list` to show available orgs
   - Default to current org if only one available

3. **Mode**: Deployment mode
   - Options: "dry-run" (validate only) or "live" (create report)
   - Recommend dry-run first to review field mappings

## Optional Parameters

- **Folder Name**: Target folder (e.g., "Sales Reports", "Custom Reports")
- **Report Name**: Custom name override
- **Skip Intelligence**: Skip chart/quality validation (faster but less thorough)
- **Variation**: Template variation to use (e.g., "simple", "cpq", "enterprise")

## Execution Steps

### Step 1: Validate Prerequisites

```bash
# Check if org is authenticated
sf org display --target-org {org}

# List available templates
ls -1 ${CLAUDE_PLUGIN_ROOT}/templates/reports/*/*.json
```

### Step 1.5: Select Variation (Optional)

Check available variations for the template and auto-detect the best one:

```bash
# Check what variation will be auto-detected for the org
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/variation-resolver.js {org-alias} --detect

# List variations available for a template
cat ${CLAUDE_PLUGIN_ROOT}/templates/reports/*/template.json | jq '.variations.availableVariations'
```

**Available Variations:**
| Variation | When to Use |
|-----------|-------------|
| `simple` | New users, quick adoption, basic needs |
| `standard` | Default for most orgs |
| `cpq` | Salesforce CPQ (SBQQ__) installed |
| `enterprise` | Large deals, stricter thresholds |
| `high-touch` | High-touch CS model with engagement metrics |
| `plg` | Product-led growth focus |

### Step 2: Run Deployment (Dry-Run First)

```bash
# Dry-run to validate (auto-detects variation)
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/report-template-deployer.js \
  --template {template-name} \
  --org {org-alias} \
  --dry-run

# Dry-run with specific variation
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/report-template-deployer.js \
  --template {template-name} \
  --org {org-alias} \
  --variation cpq \
  --dry-run

# Review the output:
# - Field resolution rate (target: 95%+)
# - Intelligence scores (chart: 90+, quality: 85+)
# - Any validation errors
```

### Step 3: Review Field Mappings

Show the user:
- How many fields were resolved successfully
- Any fields that failed to resolve (with suggestions)
- Field mapping details for transparency

Example output to display:
```
✅ Field Resolution: 8/8 fields (100%)

Mappings:
  Owner → OWNER_NAME (exact-match)
  Account → ACCOUNT_NAME (exact-match)
  Amount → AMOUNT (exact-match)
  Close Date → CLOSE_DATE (pattern-match)
  ...
```

### Step 4: Ask for Confirmation

If dry-run successful and user confirms, proceed with live deployment:

```bash
# Enable write mode
export ENABLE_WRITE=1

# Deploy for real
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/report-template-deployer.js \
  --template {template-name} \
  --org {org-alias} \
  --folder "{folder-name}"
```

### Step 5: Verify and Report

After successful deployment:
- Show the report URL
- Display intelligence scores
- Recommend next steps (e.g., add to dashboard, share with team)

## Intelligence Script Validation

The deployment includes two intelligence validations:

1. **Chart Type Selector** (Score: 0-100)
   - Analyzes data pattern (COMPARISON, TREND, etc.)
   - Recommends optimal chart type
   - Provides alternatives with rationale
   - ✅ Target: 90+ score

2. **Report Quality Validator** (Score: 0-100)
   - 8-dimensional quality assessment
   - Grade: A+ to F
   - Identifies issues and improvements
   - ✅ Target: 85+ score (A- or higher)

Display these scores to the user and explain what they mean.

## Error Handling

### Low Field Resolution Rate (<70%)

If field resolution is below 70%:
```
⚠️ Low field resolution rate: 60%

Failed fields:
  - CustomField__c: Not found (suggestions: Similar_Field__c, Other_Field__c)
  - Owner: No match (suggestions: CREATED_BY, OWNER_NAME)

Options:
1. Use suggested fields
2. Add fieldHints to template
3. Check if fields exist in target org
4. Use fallback fields from orgAdaptation section
```

### Validation Failures

If Analytics API validation fails:
```
❌ Validation failed: Invalid field name "OWNER_FULL_NAME"

Suggested fix:
  - Update template to use "OWNER_NAME" instead
  - Or add pattern ["OWNER_FULL_NAME", "OWNER_NAME"] to fieldHints
```

### Missing Permissions

If no writable folders found:
```
❌ No writable report folders found

Resolution:
1. Request Editor/Manager access to at least one report folder
2. Or have admin create a folder and grant access
3. Run again once permissions updated
```

## Success Output Format

When deployment succeeds, display:

```
✅ Report Deployed Successfully

📊 Report Details:
   Name: Team Performance - Q4 FY2023
   Type: Opportunity (Summary)
   URL: https://acme-corp.my.salesforce.com/lightning/r/Report/{id}/view

📈 Field Resolution:
   Total: 8 fields
   Resolved: 8 (100%)
   Methods: exact-match (6), pattern-match (2)
   Elapsed: 3.2s

🎯 Intelligence Scores:
   Chart Type: Horizontal Bar (92/100) ⭐
   Report Quality: 88/100 (A-)

💡 Next Steps:
   1. Open report in Salesforce to review
   2. Add to Team Performance dashboard
   3. Share with Sales Managers role
   4. Schedule daily email subscription
```

## Best Practices

1. **Always start with dry-run** to validate field mappings
2. **Review intelligence scores** before deploying
3. **Use meaningful folder names** for organization
4. **Test in sandbox first** before production
5. **Document customizations** if template adapted

## Common Use Cases

### Use Case 1: Deploy Standard Template
```bash
/deploy-report-template \
  template: team-performance \
  org: my-sandbox \
  mode: dry-run
```

### Use Case 2: Deploy with Custom Name
```bash
/deploy-report-template \
  template: pipeline-by-stage \
  org: production \
  name: "Q4 Pipeline Analysis" \
  folder: "Executive Reports"
```

### Use Case 3: Quick Deploy (Skip Intelligence)
```bash
/deploy-report-template \
  template: activity-summary \
  org: my-org \
  skip-intelligence: true
```

### Use Case 4: Deploy with CPQ Variation
```bash
/deploy-report-template \
  template: revenue-performance \
  org: cpq-org \
  variation: cpq \
  folder: "Sales Operations"
```

### Use Case 5: Deploy Simple Variation for Quick Adoption
```bash
/deploy-report-template \
  template: my-pipeline \
  org: new-user-sandbox \
  variation: simple
```

### Use Case 6: Deploy Enterprise Variation with High Thresholds
```bash
/deploy-report-template \
  template: pipeline-health \
  org: enterprise-org \
  variation: enterprise \
  folder: "Executive Reports"
```

## Template Catalog Reference

Show available templates with descriptions:

```bash
# List all templates
find ${CLAUDE_PLUGIN_ROOT}/templates/reports -name "*.json" -exec basename {} \;

# Show template details
cat ${CLAUDE_PLUGIN_ROOT}/templates/reports/sales-leaders/team-performance.json | jq '.templateMetadata'
```

Common templates:
- **team-performance**: Quota attainment by sales rep
- **pipeline-by-stage**: Opportunity pipeline analysis
- **win-loss-analysis**: Win rate trends
- **forecast-accuracy**: Forecast vs actual comparison
- **activity-summary**: Sales activity metrics

## Troubleshooting

### Issue: "Template not found"
**Solution**: Use full path or correct template name from templates directory

### Issue: "Org not authenticated"
**Solution**: Run `sf auth web:login --alias {org-alias}`

### Issue: "Field resolution rate too low"
**Solution**: Check fieldHints in template, verify fields exist in org

### Issue: "Analytics API error"
**Solution**: Check report type is valid, verify field tokens are correct

## Important Notes

- 🔒 **Safety**: Dry-run is the default (requires ENABLE_WRITE=1 for actual deployment)
- 🎯 **Success Rate**: Target 95%+ field resolution across different orgs
- ⚡ **Performance**: 3-5 seconds for dry-run, 5-10 seconds for deployment
- 📊 **Quality**: All deployed reports achieve 85+ quality score (A- or higher)

## Related Commands

- `/list-report-templates` - Browse available templates
- `/validate-report` - Validate existing report quality
- `/create-report-template` - Create new template from existing report

## Feedback

After deployment, ask user to submit reflection if issues encountered:

```bash
/reflect

# Automatically captures:
# - Field resolution issues
# - Template adaptation challenges
# - Org-specific quirks discovered
# - Intelligence script feedback
```
