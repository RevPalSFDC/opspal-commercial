# Salesloft Account Merger - Complete Guide

## Current Situation
- **87 duplicate account groups** identified in your Salesloft instance
- **Major duplicates include**: Irvine Company (517 vs 23 people), UDR (248 vs 30 people), KMG Prestige (246 vs 2 people)
- **20 safe merge candidates** with <20 total people affected

## Account Merger Tool

### Installation & Setup
```bash
# Tool location
/home/chris/Desktop/RevPal/Agents/scripts/salesloft-account-merger.py

# Already configured with your API token
```

### Core Capabilities

#### 1. Find Duplicates
```bash
# Find all duplicate accounts
python3 scripts/salesloft-account-merger.py --find-duplicates

# Shows duplicates grouped by cleaned domain
# Lists people count for impact assessment
```

#### 2. Analyze Specific Merge
```bash
# Analyze before merging (dry run)
python3 scripts/salesloft-account-merger.py \
  --primary 5594928 \
  --duplicates 18463819

# Shows:
# - Total people affected
# - Conflicts (CRM ID, Owner differences)
# - Recommendations (safe/manual review needed)
```

#### 3. Execute Merge
```bash
# Execute a specific merge
python3 scripts/salesloft-account-merger.py \
  --primary 5594928 \
  --duplicates 18463819 \
  --execute

# Process:
# 1. Backs up all account data
# 2. Moves all people to primary
# 3. Merges custom fields
# 4. Archives duplicate account
```

#### 4. Auto-Merge Safe Duplicates
```bash
# Find and merge safe duplicates automatically
python3 scripts/salesloft-account-merger.py \
  --find-duplicates \
  --auto-merge \
  --limit 5 \
  --execute

# Only merges accounts with:
# - <20 total people
# - Exactly 2 accounts (no complex multi-merges)
```

## Merger Process Details

### What Happens During a Merge

1. **Pre-Merge Analysis**
   - Validates both accounts exist
   - Counts total people affected
   - Identifies conflicts (CRM ID, owner, custom fields)
   - Generates impact assessment

2. **Backup Creation**
   - Full account data saved to `/tmp/salesloft_account_backup_*.json`
   - Includes all people, custom fields, activities
   - Enables rollback if needed

3. **People Migration**
   - All people moved from duplicate to primary account
   - Maintains all activity history
   - Preserves cadence memberships
   - Rate limited to avoid API throttling

4. **Data Consolidation**
   - Custom fields merged (primary takes precedence)
   - Tags combined
   - Notes preserved with people
   - Activity history maintained

5. **Account Archival**
   - Duplicate account archived (not deleted)
   - Can be unarchived if needed
   - Maintains audit trail

### Conflict Resolution Rules

| Conflict Type | Resolution | Example |
|---------------|------------|---------|
| **Different CRM IDs** | Keep primary's CRM ID | Primary: SF123, Duplicate: SF456 → Keep SF123 |
| **Different Owners** | Keep primary's owner | Primary: John, Duplicate: Jane → Keep John |
| **Custom Field Conflicts** | Primary value wins | Primary: "Enterprise", Duplicate: "SMB" → Keep "Enterprise" |
| **Empty vs Populated** | Use populated value | Primary: null, Duplicate: "Value" → Use "Value" |

## Recommended Merge Strategy

### Phase 1: Quick Wins (Immediate)
Target the 20 safe candidates identified:
```bash
# Execute safe merges in batches of 5
python3 scripts/salesloft-account-merger.py \
  --find-duplicates --auto-merge --limit 5 --execute

# Monitor results
# If successful, continue with next batch
```

### Phase 2: High-Value Merges (This Week)
Review and merge high-impact duplicates:

1. **Irvine Company** (517 + 23 = 540 people)
   ```bash
   python3 scripts/salesloft-account-merger.py \
     --primary 5594928 --duplicates 18463819
   # Review conflicts, then add --execute
   ```

2. **UDR** (248 + 30 = 278 people)
   ```bash
   python3 scripts/salesloft-account-merger.py \
     --primary 8001879 --duplicates 8342358
   ```

3. **KMG Prestige** (246 + 2 = 248 people)
   ```bash
   python3 scripts/salesloft-account-merger.py \
     --primary 5475898 --duplicates 101114286
   ```

### Phase 3: Complex Cases (Manual Review)
For accounts with CRM conflicts or multiple duplicates:

1. Export analysis to CSV
2. Review with Sales Ops team
3. Determine primary based on:
   - Which has correct CRM ID
   - Most complete data
   - Most recent activity
4. Execute merge with documented decision

## Common Scenarios & Solutions

### Scenario 1: Different CRM IDs
**Problem**: Two Salesloft accounts point to different Salesforce accounts
**Solution**:
1. Check which Salesforce account is correct/active
2. Merge Salesloft accounts to match correct SF account
3. Update/merge Salesforce accounts if needed

### Scenario 2: Regional Duplicates
**Example**: "UDR" and "UDR - Regional - BOS"
**Solution**:
1. Keep main company account as primary
2. Move regional contacts to main account
3. Use tags/custom fields to indicate region

### Scenario 3: Acquisition/Rebrand
**Example**: Company changed names but both exist
**Solution**:
1. Keep newer brand as primary
2. Move all historical data
3. Add note about previous name

## Monitoring & Validation

### Post-Merge Checks
```bash
# Verify people were moved
curl -X GET "https://api.salesloft.com/v2/accounts/{primary_id}" \
  -H "Authorization: Bearer $SALESLOFT_TOKEN" | jq '.data.counts.people'

# Check archived account
curl -X GET "https://api.salesloft.com/v2/accounts/{duplicate_id}" \
  -H "Authorization: Bearer $SALESLOFT_TOKEN" | jq '.data.archived_at'

# Verify CRM sync
# Check Salesforce to ensure mapping is correct
```

### Success Metrics
- ✅ Reduction in duplicate accounts: Target 90% (78 of 87 groups)
- ✅ Improved sync rate: From 97% to 99%+
- ✅ Zero PostgreSQL duplicate errors
- ✅ Cleaner reporting: Single view per company

## Rollback Procedure

If a merge needs to be reversed:

1. **Unarchive the duplicate account**
   ```python
   # Use the API to remove archived_at timestamp
   PUT /v2/accounts/{duplicate_id}
   {"archived_at": null}
   ```

2. **Move people back** (if needed)
   ```python
   # Use backup file to identify people
   # Move each person back to original account
   ```

3. **Restore custom fields**
   ```python
   # Use backup to restore original values
   ```

## Prevention Strategy

### Going Forward
1. **Enable domain cleaning** in Salesloft import settings
2. **Set up duplicate detection** webhook
3. **Train team** on proper account creation
4. **Regular audits** using the find-duplicates script
5. **CRM integration** to prevent creation of duplicates

### Weekly Maintenance
```bash
# Run every Monday
python3 scripts/salesloft-account-merger.py --find-duplicates

# Review new duplicates
# Merge before they accumulate contacts
```

## Quick Reference

### Most Common Commands
```bash
# Find all duplicates
python3 scripts/salesloft-account-merger.py --find-duplicates

# Test a merge (dry run)
python3 scripts/salesloft-account-merger.py --primary [ID] --duplicates [ID]

# Execute a merge
python3 scripts/salesloft-account-merger.py --primary [ID] --duplicates [ID] --execute

# Auto-merge safe duplicates
python3 scripts/salesloft-account-merger.py --find-duplicates --auto-merge --limit 5 --execute
```

### File Locations
- **Merger Script**: `/home/chris/Desktop/RevPal/Agents/scripts/salesloft-account-merger.py`
- **Backups**: `/tmp/salesloft_account_backup_*.json`
- **Merge Logs**: `/tmp/salesloft_merge_log_*.json`

### Support
- API Issues: Check rate limits (429 errors)
- Conflicts: Review CRM IDs in Salesforce
- Failed Merges: Check backup files for recovery