# Query New Reflections - Usage Guide

## Overview

The `query-new-reflections.js` script queries the Supabase reflection database and generates structured JSON reports for cohort detection and fix planning.

## Location

**Script:** `/home/chris/Desktop/RevPal/Agents/opspal-internal-plugins/query-new-reflections.js`

**Reports:** `/home/chris/Desktop/RevPal/Agents/opspal-internal-plugins/reports/`

## Prerequisites

Set environment variables:

```bash
export SUPABASE_URL=https://REDACTED_SUPABASE_PROJECT.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=sb_secret_63OlbhjPE6U_TlUx_2EBSQ_7gMXma2V
```

Or hardcode in the script (already done).

## Usage

### Query Only 'new' Reflections (Default)

```bash
cd /home/chris/Desktop/RevPal/Agents/opspal-internal-plugins
node query-new-reflections.js
```

**Output:**
- Console: Summary statistics (stderr)
- File: `reports/open-reflections-{timestamp}.json`
- Stdout: Full JSON report (for piping)

### Query All Reflections

```bash
node query-new-reflections.js --all
```

**Output:**
- File: `reports/all-reflections-{timestamp}.json`

## Output Format

### JSON Structure

```json
{
  "metadata": {
    "query_timestamp": "2025-10-14T15:31:27Z",
    "total_count": 1,
    "query_filter": "reflection_status=new",
    "database_url": "https://..."
  },
  "reflections": [
    {
      "id": "uuid",
      "org": "delta-corp",
      "created_at": "2025-10-14T14:02:03Z",
      "focus_area": "salesforce_merge_operations",
      "outcome": "success_with_learnings",
      "reflection_status": "new",
      "plugin_name": "salesforce-plugin",
      "plugin_version": "3.5.0",
      "total_issues": 6,
      "roi_annual_value": 5000,
      "issues_identified": [
        {
          "taxonomy": "data-quality",
          "root_cause": "...",
          "priority": "P0",
          "description": "...",
          "roi_estimate": 0,
          "agnostic_fix": "...",
          "blast_radius": "HIGH",
          "reproducible_trigger": "..."
        }
      ],
      "full_data": { /* complete reflection data */ }
    }
  ],
  "summary": {
    "total_reflections": 1,
    "total_issues": 6,
    "total_roi_annual": 5000,
    "orgs": ["delta-corp"],
    "plugins": ["salesforce-plugin"],
    "focus_areas": ["salesforce_merge_operations"],
    "statuses": {
      "new": 1
    }
  }
}
```

### Console Output

```
🔍 Querying Supabase for reflections with status="new"...

✅ Query complete: 1 reflections found
   Total Issues: 6
   Total ROI: $5,000/year
   Affected Orgs: delta-corp

📁 Report saved to: reports/open-reflections-20251014-113127.json

🆕 1 reflection(s) with status='new' ready for processing
```

## Integration with /processreflections

This script is the first step in the reflection processing workflow:

```
1. query-new-reflections.js
   ↓ (generates open-reflections-*.json)
2. cohort-clustering.js
   ↓ (generates cohorts-*.json)
3. fix-plan-generator.js
   ↓ (generates fix-plans-*.json)
4. asana-reflection-sync.js
   ↓ (creates Asana tasks)
5. Update reflection status to 'under_review'
```

## Examples

### Quick Status Check

```bash
# Just see the summary
node query-new-reflections.js 2>&1 | grep -A5 "Query complete"
```

### Generate Report for Next Steps

```bash
# Generate report and store path
REPORT=$(node query-new-reflections.js 2>&1 | grep "Report saved" | awk '{print $NF}')
echo "Report: $REPORT"

# Use for cohort detection
node .claude/scripts/lib/cohort-clustering.js $REPORT
```

### Pipe to Another Tool

```bash
# Get JSON output only
node query-new-reflections.js 2>/dev/null | jq '.summary'
```

## Troubleshooting

### Error: SUPABASE_SERVICE_ROLE_KEY not set

**Solution:** Export the environment variable or ensure it's hardcoded in the script.

### Error: HTTP 401 Unauthorized

**Solution:** Check that the service role key is correct and has necessary permissions.

### Error: Cannot find module 'https'

**Solution:** Use Node.js (not browser environment). The script uses Node.js built-in modules.

### No reflections found

**Possible reasons:**
- All reflections have been processed (status != 'new')
- Database is empty
- Query filter is too restrictive

**Check all reflections:**
```bash
node query-new-reflections.js --all
```

## Related Files

- **Analysis Summary:** `reports/ANALYSIS_SUMMARY_20251014.md`
- **Supabase Documentation:** `SUPABASE_REFLECTION_SYSTEM.md`
- **Project Instructions:** `CLAUDE.md`

## Version History

- **v1.0.0** (2025-10-14): Initial release
  - Query by reflection_status
  - Structured JSON output for cohort detection
  - Console summary and file reports

---

**Last Updated:** 2025-10-14
**Maintained By:** RevPal Engineering
