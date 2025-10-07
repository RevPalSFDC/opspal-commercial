# 📋 Salesloft Manual Fixes Checklist

After running the automated fixes, complete these manual steps in Salesloft:

## 🔴 Critical Manual Steps (Must Complete)

### 1. ☐ Reconnect to Correct Salesforce Instance
**Time Required**: 5 minutes
**Priority**: CRITICAL - Nothing will sync until this is done

1. Log into Salesloft: https://app.salesloft.com
2. Navigate to: **Settings → Integrations → Salesforce**
3. If connected to wrong instance (na34), click **Disconnect**
4. Click **Connect to Salesforce**
5. **IMPORTANT**: Use this exact URL: `https://rentable.my.salesforce.com`
   - Do NOT use `login.salesforce.com`
   - Do NOT let it auto-detect
6. Complete the OAuth authorization
7. Verify connection shows "Connected to rentable.my.salesforce.com"

✅ **Verification**: Run `python3 scripts/verify-salesloft-fixes.py` to confirm connection

---

### 2. ☐ Map Required Fields
**Time Required**: 10 minutes
**Priority**: HIGH - Some syncs will fail without proper field mapping

Navigate to: **Settings → CRM → Field Configuration**

#### Required Field Mappings:

**Contact Object**:
- ☐ Email → Email
- ☐ First Name → FirstName
- ☐ Last Name → LastName
- ☐ Phone → Phone
- ☐ Mobile Phone → MobilePhone
- ☐ Title → Title
- ☐ Account → AccountId

**Lead Object**:
- ☐ Email → Email
- ☐ First Name → FirstName
- ☐ Last Name → LastName
- ☐ Company → Company
- ☐ Phone → Phone
- ☐ Lead Status → Status

**Account Object**:
- ☐ Name → Name
- ☐ Website → Website
- ☐ Industry → Industry
- ☐ Annual Revenue → AnnualRevenue

**Activity Fields**:
- ☐ Subject → Subject
- ☐ Description → Description
- ☐ Due Date → ActivityDate
- ☐ Status → Status

---

### 3. ☐ Configure Sync Settings
**Time Required**: 5 minutes
**Priority**: MEDIUM - Improves performance

Navigate to: **Settings → CRM → Sync Settings**

- ☐ Set sync frequency to **5 minutes** (not real-time initially)
- ☐ Set batch size to **50** (reduce if seeing timeouts)
- ☐ Enable **Email Activity Sync**
- ☐ Enable **Call Activity Sync**
- ☐ Enable **Task Sync**
- ☐ Set sync direction to **Bidirectional** for Contacts/Leads

---

## 🟡 Optional Optimizations

### 4. ☐ Review User Permissions
**Time Required**: 5 minutes per user
**Priority**: LOW - Only if specific users have issues

For each sales user:
1. Navigate to: **Settings → Users**
2. Click on user name
3. Verify:
   - ☐ CRM User is mapped correctly
   - ☐ Permissions include "CRM Sync"
   - ☐ Email connected properly

### 5. ☐ Configure Cadence Settings
**Time Required**: 10 minutes
**Priority**: LOW - For automation

Navigate to: **Settings → Cadences → CRM Settings**
- ☐ Enable "Auto-add to Salesforce Campaign"
- ☐ Set default Task type for cadence steps
- ☐ Configure email tracking preferences

---

## ✅ Verification Steps

After completing manual fixes, verify everything is working:

### Quick Verification (5 minutes)
```bash
# 1. Check connection and health
python3 scripts/verify-salesloft-fixes.py

# 2. Monitor for 5 minutes
python3 scripts/salesloft-sync-health-monitor.py --mode once
```

### Full Verification (15 minutes)
1. ☐ Create a test Contact in Salesforce
2. ☐ Wait 5 minutes for sync
3. ☐ Verify Contact appears in Salesloft
4. ☐ Send a test email from Salesloft
5. ☐ Verify email activity syncs to Salesforce
6. ☐ Check Activity History on Contact record

---

## 📊 Success Criteria

Your system is fully fixed when:

| Metric | Target | How to Check |
|--------|--------|--------------|
| ✅ CRM Connected | Yes | Settings → CRM shows "Connected" |
| ✅ Correct Instance | rentable.my.salesforce.com | Settings → CRM shows correct URL |
| ✅ All Users Mapped | 100% | No unmapped users in Settings → Users |
| ✅ No Duplicates | 0 | People list has no duplicates |
| ✅ Sync Success Rate | >95% | Health monitor shows high success |
| ✅ Health Score | >80 | Verification script shows score >80 |

---

## 🚨 Troubleshooting

### If Connection Fails
- Clear browser cookies for Salesforce
- Try incognito/private browser window
- Ensure you're using Production, not Sandbox
- Check Salesforce session isn't expired

### If Sync Still Failing
1. Check Salesforce user permissions
2. Verify API limits aren't exceeded
3. Check field-level security in Salesforce
4. Review mapped fields for required fields

### If Duplicates Persist
- Check merge settings in Salesloft
- Manually merge in Salesloft People tab
- Verify email is the matching key

---

## 📞 Getting Help

If issues persist after completing this checklist:

1. **Check Logs**:
   ```bash
   ls -la /tmp/salesloft*.log
   tail -100 /tmp/salesloft_sync_*.log
   ```

2. **Run Diagnostics**:
   ```bash
   python3 scripts/salesloft-integration-validator.py --verbose
   ```

3. **Contact Support**:
   - Salesloft Support: support@salesloft.com
   - Include error logs and health check results

---

## 📝 Notes Section

Use this space to track any specific issues or customizations:

```
Date: ___________
Issues Found:
_________________________________
_________________________________
_________________________________

Actions Taken:
_________________________________
_________________________________
_________________________________

Results:
_________________________________
_________________________________
_________________________________
```

---

**Last Updated**: September 2025
**Document Version**: 1.0
**Time to Complete**: ~30 minutes for all manual steps