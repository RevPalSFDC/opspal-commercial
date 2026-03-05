---
description: Analyze Salesforce sync field mappings for current HubSpot portal
tags: [salesforce, sync, analysis, integration]
---

Analyze the Salesforce sync field mappings for the current HubSpot portal.

**Task:**
1. Determine the current portal name from `.current-portal` file or `HUBSPOT_ACTIVE_PORTAL` environment variable
2. Check if field mapping CSV files exist in `instances/{portal}/` directory:
   - `{PORTAL_ID}_CONTACT_field_mappings.csv`
   - `{PORTAL_ID}_COMPANY_field_mappings.csv`
   - `{PORTAL_ID}_DEAL_field_mappings.csv`
3. If CSV files exist:
   - Run: `node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/sfdc-sync-analyzer.js {portal}`
   - Display the generated SYNC_SUMMARY.md contents
   - Provide link to detailed analysis in SALESFORCE_SYNC_ANALYSIS.md
4. If CSV files don't exist:
   - Show step-by-step UI export instructions from `docs/SALESFORCE_SYNC_EXTRACTION_GUIDE.md`
   - Explain that HubSpot API doesn't provide complete sync mappings
   - Wait for user to export CSV files manually
   - Offer to run analysis once files are added

**Output:**
- Executive summary with field counts and sync rule distribution
- List of critical "Always use Salesforce" fields
- Governance recommendations
- Path to detailed analysis file

**Example Output:**
```
📊 Salesforce Sync Analysis - example-company Portal

Total Fields Syncing: 860

Objects:
- Contacts: 142 fields
- Companies: 366 fields
- Deals: 352 fields

Sync Rules:
- Two way: 114 (13.3%)
- Prefer Salesforce unless blank: 735 (85.5%)
- Always use Salesforce: 11 (1.3%)

Critical "Always use Salesforce" Fields (11):
- Contact: ads_sdr, gbp_sdr, iq_sdr, gbp_account_executive
- Company: aptiq_account_executive, aptiq_csm, iq_sdr
- Deal: sdr

📄 Detailed analysis: instances/example-company/SALESFORCE_SYNC_ANALYSIS.md
```

**Related Commands:**
- `/hssfdc-scrape {portal}` - Attempt automated extraction (limited)
- View extraction guide: `docs/SALESFORCE_SYNC_EXTRACTION_GUIDE.md`
