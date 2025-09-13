# Salesforce Instance Mismatch - Critical Fix Required

## Problem Summary
Salesloft is connected to the WRONG Salesforce instance, causing sync failures and "Unable to find record" errors.

**Current Situation:**
- ❌ Salesloft is connected to: `https://na34.salesforce.com`
- ✅ Rentable production is on: `https://rentable.my.salesforce.com` (resolves to na14 pod)
- 🔴 Result: Records can't be found because Salesloft is looking in the wrong database

## Impact
- All sync attempts fail with "Unable to find record" errors
- ENTITY_IS_DELETED errors may be false positives (records exist on na14, not na34)
- OAuth tokens are pointing to wrong instance
- This affects ALL users trying to sync data

## IMMEDIATE FIX REQUIRED

### Step 1: Disconnect Current (Wrong) Connection
1. Log into Salesloft as an Admin
2. Navigate to **Settings** → **CRM** → **Salesforce**
3. Click **Disconnect** on the current connection
4. Confirm disconnection

### Step 2: Reconnect to Correct Instance
1. Click **Connect to Salesforce**
2. **CRITICAL**: Use the production URL: `https://rentable.my.salesforce.com`
3. Do NOT use: 
   - ❌ https://na34.salesforce.com
   - ❌ https://login.salesforce.com (may redirect to wrong instance)
   - ❌ Any sandbox URLs

### Step 3: OAuth Authentication
1. When prompted, log in with Salesforce production credentials
2. Verify the URL shows `rentable.my.salesforce.com` during OAuth
3. Grant all requested permissions
4. Complete the OAuth flow

### Step 4: Verify Connection
After reconnection, verify in Salesloft:
1. Go to **Settings** → **CRM** → **Salesforce**
2. Confirm connection shows: `https://rentable.my.salesforce.com`
3. Test sync with a known record ID

### Step 5: Re-sync Failed Records
Once connected to correct instance:
1. Navigate to **CRM Activities** with errors
2. Click **Retry Sync** for failed records
3. Monitor for successful syncs

## Root Cause Prevention

### Why This Happened
Possible causes:
1. **OAuth Token Refresh**: Token refreshed against wrong instance
2. **Manual Reconnection**: Someone reconnected using generic login.salesforce.com
3. **Instance Migration**: Rare, but Salesforce may have moved the org
4. **Multiple Connections**: Different users connected to different instances

### Prevent Future Issues
1. **Document Instance URL**: Always use `https://rentable.my.salesforce.com`
2. **Admin-Only Connections**: Restrict CRM connection changes to admins
3. **Monitor Instance**: Set up alerts for instance URL changes
4. **Use MyDomain**: Always use MyDomain URL, never generic URLs

## Verification Checklist
After fixing:
- [ ] Salesloft shows correct instance URL (rentable.my.salesforce.com)
- [ ] Test record can be found and synced
- [ ] No more "Unable to find record" errors
- [ ] ENTITY_IS_DELETED errors stop appearing
- [ ] Users can see Salesforce data in Salesloft

## Additional Notes

### Instance Identification
- **na14**: North America instance 14 (current production)
- **na34**: Different North America instance (WRONG)
- **MyDomain**: `rentable.my.salesforce.com` (always use this)

### Impact on Previous Errors
The ENTITY_IS_DELETED errors you saw may have been caused by this:
- Records exist on na14 (correct instance)
- Salesloft looking on na34 (wrong instance)
- Records appear "deleted" because they don't exist on na34

### Emergency Contacts
If issues persist after reconnection:
1. Salesforce Support: Verify instance URL
2. Salesloft Support: Request connection reset
3. Check with team: Ensure no one else is changing connections

## Script to Verify Connection
```python
import requests
import os

# After reconnection, run this to verify
headers = {
    "Authorization": f"Bearer {os.getenv('SALESLOFT_TOKEN')}",
    "Accept": "application/json"
}

# Check CRM connection status
response = requests.get(
    "https://api.salesloft.com/v2/crm_users",
    headers=headers
)

if response.status_code == 200:
    data = response.json()
    for user in data.get("data", []):
        print(f"User: {user.get('name')}")
        print(f"CRM URL: {user.get('crm_url')}")
        print(f"Connected: {user.get('crm_connected')}")
        print("---")
else:
    print(f"Error: {response.status_code}")
```

---
**Priority: CRITICAL**  
**Time to Fix: 15 minutes**  
**Impact if Not Fixed: All sync operations will continue failing**