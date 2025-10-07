# Salesloft Domain Cleanup Results

## Summary
Successfully cleaned malformed domains for Salesloft accounts to resolve PostgreSQL duplicate key constraint violations.

## Execution Results
- **Date**: 2025-09-24
- **Total Accounts Scanned**: 143 accounts with malformed domains
- **Successfully Fixed**: 72 accounts (50.3%)
- **Domain Conflicts**: 71 accounts (49.7%)

## Pattern Analysis
The malformed domains included:
- `http://www.` prefix: 78 accounts
- Trailing slashes: 70 accounts
- `https://www.` prefix: 33 accounts
- `https://` prefix: 14 accounts
- `http://` prefix: 13 accounts
- `www.` prefix only: 5 accounts

## Successfully Fixed Accounts (72)
Examples of cleaned domains:
- Westminster Management: `http://www.wmapts.com` → `wmapts.com`
- Beitel Group: `https://www.beitel.com/` → `beitel.com`
- Affinius Capital: `https://affiniuscapital.com/` → `affiniuscapital.com`
- NTS Capital: `https://ntscapital.com/` → `ntscapital.com`
- Denizen Management: `www.denizenmanagement.com` → `denizenmanagement.com`
- And 67 more accounts...

## Domain Conflicts (71)
These accounts could not be updated because their cleaned domain already exists on another account:
- Irvine Company: `irvinecompany.com` (duplicate)
- Kushner Companies: `kushner.com` (duplicate)
- Towne Properties: `towneproperties.com` (duplicate)
- KMG Prestige: `kmgprestige.com` (duplicate)
- Angelo Gordon & Co: `angelogordon.com` (duplicate)
- And 66 more duplicates...

## Impact on Sync Errors
This cleanup should resolve:
1. **PostgreSQL duplicate key violations** - No more "duplicate key value violates unique constraint" errors for the 72 fixed accounts
2. **Person creation failures** - People can now be properly associated with these accounts
3. **CRM sync issues** - Cleaner domain matching between Salesforce and Salesloft

## Next Steps for Duplicates
For the 71 accounts with domain conflicts:
1. **Manual Review Required**: Each duplicate needs investigation to determine:
   - Which account should keep the domain
   - Whether accounts should be merged
   - If one is obsolete and should be archived

2. **Investigation Process**:
   ```sql
   -- Find all accounts with the same domain
   SELECT id, name, domain, created_at, counts.people
   FROM accounts
   WHERE domain = 'target-domain.com'
   ORDER BY created_at;
   ```

3. **Resolution Options**:
   - Merge duplicate accounts
   - Archive inactive duplicates
   - Append suffixes for subsidiaries (e.g., `company-west.com`, `company-east.com`)

## Prevention Measures
1. **Import Settings**: Ensure "Clean Domains" is enabled in Salesloft
2. **Salesforce Field**: Clean Website fields in Salesforce before sync
3. **Validation**: Add domain format validation to prevent future issues

## Technical Details
- **Script Used**: `/home/chris/Desktop/RevPal/Agents/scripts/fix-account-domains.py`
- **API Endpoint**: `PUT https://api.salesloft.com/v2/accounts/{id}`
- **Cleaning Rules**: Remove `http://`, `https://`, `www.`, trailing `/`, and paths

## Reports Generated
- JSON Report: `/tmp/salesloft_account_domains_20250924_102340.json`
- CSV Report: `/tmp/salesloft_account_domains_20250924_102340.csv`

## Result
✅ **50% Success Rate** - Half of the malformed domains have been cleaned, significantly reducing sync errors
⚠️ **Manual Action Required** - 71 duplicate accounts need manual review and resolution