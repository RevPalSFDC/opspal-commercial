---
description: Quick company/contact enrichment for missing fields using domain-based derivation or web scraping
argument-hint: "<object-type> <field-name> [options]"
tags: [enrichment, data-quality, automation, bulk-operations]
version: 1.0.0
---

# HubSpot Field Enrichment Command

## Overview

The `/hsenrich` command performs bulk enrichment of HubSpot records when critical fields are missing but derivable from other data (e.g., company name from domain).

## Syntax

```bash
/hsenrich <object-type> <field-name> [options]
```

## Parameters

- **object-type** (required): HubSpot object to enrich (`companies`, `contacts`, `deals`)
- **field-name** (required): Field to populate (`name`, `industry`, `company`, etc.)
- **options** (optional):
  - `--confidence <level>`: Minimum confidence threshold (50-100, default: 70)
  - `--method <type>`: Enrichment method (`domain`, `web`, `api`)
  - `--preview`: Show sample without executing updates
  - `--limit <n>`: Limit to first N records (default: all)

## Examples

### Enrich Company Names from Domains
```bash
/hsenrich companies name
```
Finds all companies without names but with domains, derives names, and updates high-confidence matches.

### Preview Contact Industry Enrichment
```bash
/hsenrich contacts industry --preview
```
Shows sample of what would be enriched without making changes.

### Custom Confidence Threshold
```bash
/hsenrich companies name --confidence 80
```
Only update companies with ≥80% confidence scores.

## How It Works

1. **Discovery**: Queries portal for records missing the specified field
2. **Strategy Selection**:
   - `domain` method: Fast derivation from domain/website (default for company names)
   - `web` method: Web scraping for accurate data (slower, use for <100 records)
   - `api` method: Third-party API enrichment (requires API keys)
3. **Confidence Scoring**: Each enrichment gets a confidence score (0-100%)
4. **Preview**: Shows sample of 10-20 records for approval
5. **Batch Update**: Updates high-confidence records in batches
6. **Verification**: Samples updated records to verify accuracy
7. **Reporting**: Generates completion report with statistics

## Supported Field Combinations

| Object | Field | Default Method | Notes |
|--------|-------|----------------|-------|
| companies | name | domain | Derives from domain/website URL |
| companies | industry | web | Scrapes website for industry info |
| companies | employee_count | api | Uses Clearbit/LinkedIn APIs |
| contacts | company | domain | Derives from email domain |
| contacts | jobtitle | web | Scrapes LinkedIn profile |
| deals | amount | calculation | Calculates from line items |

## Confidence Thresholds

- **≥75%**: High confidence - automatic update approved
- **50-74%**: Medium confidence - requires manual review
- **<50%**: Low confidence - skip or manual entry required

## Output Files

The command generates:
1. `enriched-data-{timestamp}.json` - All results with confidence scores
2. `high-confidence-{timestamp}.json` - High-confidence subset
3. `batch-update-payload-{timestamp}.json` - HubSpot API payload
4. `enrichment-report-{timestamp}.md` - Comprehensive report
5. `verification-results-{timestamp}.json` - Quality verification

## Prerequisites

- **Environment**: Must have active portal configured (`.env` with `HUBSPOT_API_KEY`)
- **Permissions**: API key must have `crm.objects.companies.write` scope (or equivalent)
- **Data**: Records must have source field populated (e.g., domain for name enrichment)

## Safety Features

- **Preview Mode**: Always shows sample before bulk updates
- **Confidence Filtering**: Only updates high-confidence matches by default
- **Verification**: Random sample verification after updates
- **Rollback**: Original data preserved in JSON files
- **Rate Limiting**: Respects HubSpot API limits

## Task Instructions for Claude

When the user runs `/hsenrich <object> <field>`:

1. **Parse Parameters**:
   ```javascript
   const objectType = args[0]; // companies, contacts, deals
   const fieldName = args[1];  // name, industry, etc.
   const options = parseOptions(args.slice(2));
   ```

2. **Validate Prerequisites**:
   - Check `.env` file exists and has `HUBSPOT_API_KEY`
   - Verify object type and field name are valid
   - Confirm API key has required scopes

3. **Discover Records**:
   ```bash
   # Use run-with-env.sh for environment loading
   ./scripts/run-with-env.sh node -e "
   const { deriveCompanyName } = require('./scripts/lib/hubspot-domain-name-deriver');
   // Query and enrich logic here
   "
   ```

4. **Select Enrichment Strategy**:
   - For `companies.name`: Use `hubspot-domain-name-deriver` library (domain-based)
   - For other fields: Check if specialized script exists, otherwise use web scraping
   - For >100 records: Prefer fast methods (domain derivation, API lookups)
   - For <100 records: Web scraping acceptable

5. **Generate Preview**:
   - Sample 10-20 records
   - Show: `domain → derived_name (confidence%)`
   - Display statistics: total, high/medium/low confidence counts
   - Ask user: "Proceed with updating {count} high-confidence records?"

6. **Execute Update** (if approved):
   ```bash
   ./scripts/run-with-env.sh node ./scripts/execute-batch-update.js ./enriched-payload.json
   ```

7. **Verify & Report**:
   - Sample 10-20 updated records
   - Confirm values match expectations
   - Generate completion report
   - Update `instances/{portal}/ENRICHMENT_HISTORY.md`

8. **Handle Errors**:
   - API authentication failures → Suggest portal switch or MCP restart
   - Rate limiting → Implement exponential backoff
   - Validation errors → Show detailed error messages

## Example Session Flow

```
User: /hsenrich companies name

Claude:
🔍 Discovering companies without names...
✅ Found 680 companies with domains but no names

📊 Enrichment Preview (Sample):
1. apartmentiq.io → "Apartment IQ" (85%)
2. bwalk.com → "Bwalk" (85%)
3. sparrow-partners.com → "Sparrow Partners" (75%)
4. doranmanagement.com → "Doranmanagement" (75%)
...

Statistics:
- Total: 680 companies
- High confidence (≥75%): 646 (95.0%)
- Medium confidence (50-74%): 34 (5.0%)
- Ready to update: 673 companies

Proceed with updating 673 companies? (yes/no)

User: yes

Claude:
🔄 Executing batch update...
📦 Batch 1/7: ✅ 100 companies updated
📦 Batch 2/7: ✅ 100 companies updated
...
📦 Batch 7/7: ✅ 73 companies updated

✅ Update complete! 673 companies updated successfully.

🔍 Verifying updates (sample: 20 companies)...
✅ Verification: 20/20 matched (100%)

📄 Files generated:
- enriched-data-1759847833785.json
- batch-update-payload-1759847833785.json
- enrichment-report-1759847833785.md

📊 Summary: 99.0% of companies now have names (673/680)
```

## Best Practices

1. **Start with Preview**: Always use `--preview` first for large datasets
2. **Incremental Updates**: For >1000 records, process in batches by date range
3. **Verify Samples**: Check 10-20 samples manually before bulk updates
4. **Document Operations**: All enrichments logged in `ENRICHMENT_HISTORY.md`
5. **Monitor Quality**: Track success rates, re-run for low-confidence records

## Troubleshooting

### "Authentication credentials not found"
- **Cause**: MCP server has stale API key after portal switch
- **Solution**: Restart Claude Code or use `./scripts/run-with-env.sh`

### "No records found to enrich"
- **Cause**: All records already have the field populated
- **Solution**: Check field name spelling, verify data in HubSpot portal

### "Confidence threshold too restrictive"
- **Cause**: `--confidence` set too high, filtered out most matches
- **Solution**: Lower threshold to 60-70% or review medium-confidence matches

### "Rate limit exceeded"
- **Cause**: Too many API calls in 10-second window
- **Solution**: Script automatically handles rate limiting, wait and retry

## Related Commands

- `/hsmerge` - Merge duplicate companies
- `/hsdedup` - Find and resolve duplicates
- `/hssfdc-analyze` - Analyze Salesforce sync configuration
- `/reflect` - Generate session improvement playbook

## Technical Implementation

The enrichment uses:
- **Library**: `scripts/lib/hubspot-domain-name-deriver.js`
- **Wrapper**: `scripts/run-with-env.sh` (environment loading)
- **Update Script**: `scripts/execute-batch-update.js`
- **Verification**: `scripts/verify-updates.js`

## Success Metrics

From production use (2025-10-07):
- **Records Processed**: 680 companies
- **Success Rate**: 99.0% (673/680)
- **Execution Time**: 7.2 seconds (batch update)
- **Verification Accuracy**: 100% (20/20 sampled)
- **API Error Rate**: 0%

---

**Version**: 1.0.0
**Last Updated**: 2025-10-07
**Maintained By**: RevPal HubSpot Agent System