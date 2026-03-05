---
description: Automated duplicate detection and resolution for HubSpot companies sharing Salesforce Account IDs with lift-and-shift execution
argument-hint: "[options]"
---

# HubSpot Company Deduplication

Detect and resolve duplicate HubSpot companies that share the same Salesforce Account ID using the proven lift-and-shift pattern with two-phase commit.

## Usage

```
/hsdedup [options]
```

## Options

- `--scan` - Scan for duplicates only (no resolution)
- `--dry-run` - Preview what would be resolved without making changes
- `--confirm` - Execute live resolution (requires explicit confirmation)
- `--max=N` - Limit resolution to N duplicate groups (default: all)
- `--batch=N` - Process N groups before pausing (default: 10)

## What It Does

### Scan Mode (`--scan`)
1. **Query Companies**: Search for all companies with `salesforceaccountid` populated
2. **Group by SF Account ID**: Find companies sharing same SF Account
3. **Generate Report**: List duplicate groups with counts
4. **Master Selection**: Identify recommended master for each group

### Dry-Run Mode (`--dry-run`)
1. Perform scan
2. Fetch associations for each duplicate
3. Show what would be migrated
4. No actual changes made
5. Generate preview report

### Live Execution (`--confirm`)
1. Execute lift-and-shift for each duplicate group:
   - **Phase 1**: Migrate associations (contacts, deals, tickets)
   - **Validation Gate**: Verify all associations migrated
   - **Phase 2**: Delete duplicate (only if Phase 1 succeeded)
2. Maintain audit logs
3. Generate execution summary

## Master Selection Logic

Prioritization order for selecting master company:
1. **Lifecycle Stage**: customer > salesqualifiedlead > lead > subscriber
2. **Association Count**: Most contacts + deals + tickets
3. **Last Modified**: Most recently updated

## Examples

### Scan for Duplicates

```bash
/hsdedup --scan
```

**Output**:
```
🔍 Scanning for duplicate companies...

Found 52 duplicate groups sharing Salesforce Account IDs:

Group 1: Trion Properties
  SF Account: 0012A00002D1juIQAR
  Master: 12345678901 (lead, 11 contacts, 7 deals)
  Duplicate: 12345678902 (customer, 0 contacts, 0 deals)

Group 2: Invesco
  SF Account: 0012A00002D1kbjQAB
  Master: 23456789012 (lead, 63 contacts, 2 deals)
  Duplicate: 23456789013 (salesqualifiedlead, 0 contacts, 0 deals)

...

Total: 52 duplicate groups, 52 duplicates to resolve
```

### Preview Resolution (Dry-Run)

```bash
/hsdedup --dry-run --max=3
```

**Output**:
```
🧪 DRY RUN - No changes will be made

[1/3] Coastline Real Estate Advisors (HQ)
  Master: 34567890123 (customer)
  Duplicate: 34567890124 (lead)
  Would migrate: 3 contacts, 0 deals, 0 tickets
  Would delete: 34567890124

[2/3] TAM Residential
  Master: 45678901234 (lead)
  Duplicate: 45678901235 (customer)
  Would migrate: 150 contacts, 16 deals, 0 tickets
  Would delete: 45678901235

[3/3] Morgan Properties (HQ)
  Master: 56789012345 (customer)
  Duplicate: 56789012346 (customer)
  Would migrate: 274 contacts, 1 deals, 0 tickets
  Would delete: 56789012346

Summary:
  Groups: 3
  Contacts to migrate: 427
  Deals to migrate: 17
  Tickets to migrate: 0
  Duplicates to delete: 3
```

### Execute Resolution

```bash
/hsdedup --confirm --max=52 --batch=10
```

**Output**:
```
⚠️  LIVE EXECUTION - Changes will be made

Processing 52 duplicate groups in batches of 10...

[1/52] Trion Properties
  ✅ Migrated 11 contacts
  ✅ Migrated 7 deals
  ✅ Deleted duplicate 12345678902

[2/52] Invesco
  ✅ Migrated 63 contacts
  ✅ Migrated 2 deals
  ✅ Deleted duplicate 23456789013

...

[52/52] Kildare Partners
  ✅ Migrated 0 contacts
  ✅ Migrated 0 deals
  ✅ Deleted duplicate 67890123456

═══════════════════════════════════════════════════════════════════
📊 EXECUTION SUMMARY
═══════════════════════════════════════════════════════════════════
Total processed: 52
Successful: 52
Failed: 0
Duration: 425s

Contacts migrated: 1,695
Deals migrated: 56
Tickets migrated: 0

💾 Results saved to: instances/example-company/dedup-results-2025-10-07.json
═══════════════════════════════════════════════════════════════════
```

## Safety Features

### Two-Phase Commit
- **Phase 1**: Migrate all associations
- **Validation**: Verify migration completed successfully
- **Phase 2**: Delete duplicate ONLY if validation passed
- **Prevents**: Data loss from incomplete migrations

### Idempotency
- Handles HTTP 400/409 as success (association already exists)
- Safe to retry failed operations
- No duplicate associations created

### Rate Limiting
- 100ms between individual associations
- 500ms between companies
- 5 seconds between batches
- Respects HubSpot's 100 req/10s limit

### Audit Logging
- Before/after state for each operation
- Rollback data for recovery
- Execution timestamps
- Error details for troubleshooting

## Output Files

### Scan Results
`instances/{portal}/duplicate-scan-{date}.json`
- List of all duplicate groups
- Master selection recommendations
- Association counts

### Execution Results
`instances/{portal}/dedup-results-{date}.json`
- Detailed operation logs
- Success/failure status
- Associations migrated
- Errors encountered

### Audit Logs
`instances/{portal}/merge-audit/{session-id}/`
- Before state snapshots
- Operation progress
- Rollback data

## Prerequisites

1. **Active Portal**: Must have portal configured and selected
2. **API Access**: Valid HubSpot API key with required scopes
3. **SF Sync**: Understanding of SF sync configuration
4. **Backup**: Recommended to have portal backup before large-scale operations

## Required Scopes

- `crm.objects.companies.read`
- `crm.objects.companies.write`
- `crm.objects.contacts.read`
- `crm.objects.deals.read`
- `crm.objects.tickets.read`

## Related Commands

- `/hsmerge` - Analyze merge strategy for specific companies
- `/hssfdc-scrape` - Scrape Salesforce sync settings
- `/hshealth` - Check portal health

## Related Documentation

- `docs/SALESFORCE_SYNC_MERGE_CONSTRAINTS.md` - SF sync limitations
- `docs/HUBSPOT_PATTERN_LIBRARY.md` - Lift-and-shift pattern
- `instances/example-company/DUPLICATE_RESOLUTION_SUMMARY.md` - Case study

## Implementation

Uses the following scripts and modules:
- `scripts/lib/hubspot-merge-strategy-selector.js` - Strategy selection
- `scripts/lib/association-migrator.js` - Association migration
- `scripts/lib/two-phase-commit-validator.js` - Data safety
- `scripts/lift-and-shift-company-duplicates.js` - Batch execution

## Rollback

If issues occur:
1. Stop execution (Ctrl+C)
2. Review audit logs: `instances/{portal}/merge-audit/`
3. Check results file for failed operations
4. Use rollback data to restore if needed
5. Contact support if SF sync integrity compromised

## Best Practices

1. **Start Small**: Test with `--max=3` first
2. **Dry-Run First**: Always preview before live execution
3. **Monitor Progress**: Watch for failed operations
4. **Verify Results**: Check master companies retain SF sync
5. **Review Audit**: Examine logs after completion
6. **Weekly Scans**: Detect new duplicates early

## Troubleshooting

### No Duplicates Found
- Verify SF sync is enabled in portal
- Check that companies have `salesforceaccountid` populated
- Confirm portal selection is correct

### Migration Failures
- Check API rate limits
- Verify API key scopes
- Review error logs in results file
- Examine two-phase commit validation output

### SF Sync Broke
- Check master company still has `salesforceaccountid`
- Verify in Salesforce: Account still exists
- Review integration settings in HubSpot
- Contact HubSpot support if sync disconnected
