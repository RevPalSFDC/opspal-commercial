---
name: extract-user-reports
description: Extract reports and dashboards created by a specific user and generate reusable templates
argument-hint: "[options]"
arguments:
  - name: org
    description: Salesforce org alias
    required: true
  - name: user
    description: Full name of the report owner (must match Owner.Name in Salesforce)
    required: true
  - name: output
    description: Custom output directory for templates (optional)
    required: false
---

# Extract User Reports & Dashboards

Extract all reports and dashboards created by a specific user from a Salesforce org and generate intelligent, reusable templates.

## What This Command Does

1. **Discovery** - Queries Salesforce for all reports/dashboards owned by the specified user
2. **Metadata Extraction** - Retrieves full report details via Analytics REST API
3. **Analysis** - Categorizes by function (sales/marketing/CS) and audience level
4. **Template Generation** - Creates anonymized, parameterized templates with variations
5. **Validation & Registration** - Validates templates and registers in the template registry

## Critical Requirement

**All generated templates are 100% instance-agnostic:**
- No personal names (creator, owner)
- No client/company names
- No org-specific identifiers
- Templates named by business function only (prefix: `bp-`)

## Execution Steps

<user-prompt-context>
User wants to extract reports/dashboards from org "{{org}}" created by user "{{user}}"
{{#if output}}Custom output directory: {{output}}{{/if}}
</user-prompt-context>

### Step 1: Verify Org Connection

First, verify the org connection:

```bash
sf org display --target-org {{org}} --json | jq '.result.username'
```

### Step 2: Verify User Exists

Confirm the user name matches exactly:

```bash
sf data query --query "SELECT Id, Name FROM User WHERE Name = '{{user}}'" --target-org {{org}} --json
```

### Step 3: Run Extraction

Execute the user reports extractor:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/user-reports-extractor.js \
  --org {{org}} \
  --user "{{user}}" \
  {{#if output}}--output {{output}}{{/if}}
```

### Step 4: Review Results

The extraction will:
1. Save discovery data to `instances/salesforce/{{org}}/user-reports-discovery.json`
2. Save metadata to `instances/salesforce/{{org}}/user-reports-metadata.json`
3. Generate templates in `plugins/opspal-salesforce/templates/reports/best-practices/`
4. Create a summary at `templates/reports/best-practices/EXTRACTION_SUMMARY.md`

### Step 5: Verify Anonymization

**CRITICAL**: Verify no personal information leaked into templates:

```bash
# Check for any personal/company names in generated templates
grep -r "{{user}}" ${CLAUDE_PLUGIN_ROOT}/templates/reports/best-practices/ || echo "✅ No personal names found"
grep -r "{{org}}" ${CLAUDE_PLUGIN_ROOT}/templates/reports/best-practices/ || echo "✅ No org references found"
```

## Output Structure

```
${CLAUDE_PLUGIN_ROOT}/templates/reports/best-practices/
├── README.md
├── EXTRACTION_SUMMARY.md
├── sales/
│   ├── executive/
│   │   └── bp-sales-*.json
│   ├── manager/
│   │   └── bp-sales-*.json
│   └── individual/
│       └── bp-sales-*.json
├── marketing/
│   └── ...
└── customer-success/
    └── ...
```

## Template Features

Each generated template includes:
- **Variations**: simple, standard, cpq, enterprise
- **Field Fallbacks**: Cross-org field resolution patterns
- **CPQ Support**: Automatic SBQQ field substitutions
- **Dashboard Usage**: Recommended dashboard placements

## Next Steps

After extraction, you can:

1. **Deploy a template**:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/report-template-deployer.js \
     --template best-practices/sales/executive/bp-sales-pipeline-coverage.json \
     --org target-org \
     --variation standard
   ```

2. **Review portability scores** in the EXTRACTION_SUMMARY.md

3. **Customize templates** by editing the JSON files

## Troubleshooting

### "No reports found"
- Verify the user name matches exactly (case-sensitive)
- Check if user has any reports: `sf data query --query "SELECT COUNT() FROM Report WHERE Owner.Name = '{{user}}'" --target-org {{org}}`

### "Authentication failed"
- Ensure org is authenticated: `sf org display --target-org {{org}}`
- Re-authenticate if needed: `sf org login web --alias {{org}}`

### "Low portability scores"
- Reports with many custom fields need field fallback configuration
- Consider creating simpler variations for highly customized reports
