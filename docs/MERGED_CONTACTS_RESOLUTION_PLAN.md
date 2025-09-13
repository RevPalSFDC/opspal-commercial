# Merged Contacts Resolution Plan

## Problem Summary
When contacts are merged in Salesforce:
1. The "losing" contact record is deleted (goes to Recycle Bin)
2. The "winning" contact keeps all the data
3. Salesloft still references the old (deleted) Contact ID
4. This causes ENTITY_IS_DELETED errors on every sync attempt

## Current Situation

### Confirmed Merges by Christian Lillegard
Based on the Recycle Bin analysis, these 5 contacts were merged:

| Deleted Contact | Deleted ID | Status |
|-----------------|------------|---------|
| Liz Culibrk (Fairfield) | 0033j00003wOVdnAAG | Winner not found - may be deleted |
| Greg Morehead (Fairfield) | 0033j00003wOVdlAAG | Winner not found - may be deleted |
| Dana Tucker (Cortland) | 0033j00003wOvYuAAK | ✅ Winner found: 0033j00003wOrJsAAK |
| Ashley Tamer (KMG) | 003Rh00000EAxjVIAT | ✅ Winner found: 0033j00003wPERAAA4 |
| Stephen Shows (Berkshire) | 003Rh00000XP0ieIAD | Winner not found - may be deleted |

### Sync Error Impact
- **Mitch Scarski**: 14 failures trying to sync Liz Culibrk
- **Anna Kelly**: 7 failures trying to sync Ashley Tamer  
- **Jordan Wilkins**: 5 failures trying to sync Dana Tucker
- **Kristen Nelson**: 5 failures trying to sync Stephen Shows

## Resolution Options

### Option 1: Manual CRM ID Update in Salesloft (Recommended)

**For contacts where we found the merge winner:**

1. **In Salesloft Admin Panel:**
   - Go to People
   - Search for the person by name (not email, as it might have changed)
   - Click on the person's profile
   - Update the CRM ID field to the new winner ID
   - Save changes

2. **Specific Updates Needed:**
   ```
   Dana Tucker: Change CRM ID from 0033j00003wOvYuAAK → 0033j00003wOrJsAAK
   Ashley Tamer: Change CRM ID from 003Rh00000EAxjVIAT → 0033j00003wPERAAA4
   ```

### Option 2: Break and Resync via API

```python
# Use Salesloft API to update the person
import requests

headers = {
    "Authorization": f"Bearer {SALESLOFT_TOKEN}",
    "Content-Type": "application/json"
}

# Update person with new CRM ID
person_id = "salesloft_person_id"
new_crm_id = "winner_contact_id_from_salesforce"

response = requests.put(
    f"https://api.salesloft.com/v2/people/{person_id}",
    headers=headers,
    json={"crm_id": new_crm_id}
)
```

### Option 3: Remove and Re-add (Clean Slate)

1. **Export the person's data from Salesloft**
2. **Delete the person in Salesloft**
3. **Re-import with the correct CRM ID**

This ensures a clean sync with no legacy references.

### Option 4: Bulk CSV Update

1. **Export all people from Salesloft** with these emails
2. **Update the CSV** with new CRM IDs
3. **Re-import** to update mappings in bulk

## For Contacts Without Merge Winners

For Liz Culibrk, Greg Morehead, and Stephen Shows where no winner was found:

1. **Check if they were completely deleted** (not merged)
2. **Remove from all Salesloft cadences** to stop sync attempts
3. **Archive or delete in Salesloft** if no longer needed

## Prevention for Future Merges

### Immediate Process Change
1. **Before merging in Salesforce:**
   - Note the Contact IDs being merged
   - Identify which will be the winner
   
2. **After merging in Salesforce:**
   - Immediately update Salesloft with the new CRM ID
   - Or remove the person from cadences

### Automated Solution (Long-term)
Create a Salesforce Flow that:
1. Triggers on Contact merge
2. Sends webhook to middleware
3. Updates Salesloft automatically with new CRM ID

### Monitoring
Set up alerts for:
- ENTITY_IS_DELETED errors in sync logs
- Multiple sync failures for same Contact ID
- Bulk deletions in Salesforce

## Quick SQL Queries

### Find merge winners in Salesforce:
```sql
-- Find contacts with similar names at same company
SELECT Id, Name, Email, AccountId, Account.Name 
FROM Contact 
WHERE AccountId IN (
    SELECT AccountId 
    FROM Contact 
    WHERE Id IN ('deleted_ids_here')
)
AND CreatedDate > LAST_YEAR
```

### Check for email address changes:
```sql
-- The winning contact might have a different email
SELECT Id, Name, Email 
FROM Contact 
WHERE Name LIKE '%Tucker%' 
AND Account.Name LIKE '%Cortland%'
```

## Action Items

### Immediate (Today):
1. ✅ Update Dana Tucker's CRM ID in Salesloft
2. ✅ Update Ashley Tamer's CRM ID in Salesloft
3. ✅ Remove Liz Culibrk from all cadences (no winner found)
4. ✅ Remove Greg Morehead from all cadences (no winner found)
5. ✅ Remove Stephen Shows from all cadences (no winner found)

### This Week:
1. Document merge process for team
2. Train team on proper merge handling
3. Set up monitoring for future ENTITY_IS_DELETED errors

### This Month:
1. Implement automated merge detection
2. Create middleware for automatic updates
3. Audit all existing sync errors for similar issues

## Expected Results

After implementing these fixes:
- **50 sync errors will stop** immediately
- **Sync performance will improve** (no repeated failures)
- **Data integrity maintained** between systems
- **Future merges handled properly** with new process