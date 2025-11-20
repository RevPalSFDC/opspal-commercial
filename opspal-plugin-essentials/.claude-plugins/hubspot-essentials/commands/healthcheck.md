---
name: healthcheck
description: Comprehensive health check for HubSpot Essentials plugin and API setup
---

# HubSpot Essentials Health Check

Running comprehensive health check...

## 🔍 Health Check Results

### 1. HubSpot API Access Token

Checking for HubSpot API access token...

**Environment Variable**: `HUBSPOT_ACCESS_TOKEN`

```bash
# Check if set (without revealing value)
if [ -n "$HUBSPOT_ACCESS_TOKEN" ]; then
  echo "✅ Access token is set (${#HUBSPOT_ACCESS_TOKEN} characters)"
else
  echo "❌ Access token not set"
fi
```

**Expected**: Access token present
**Issues if missing**:
- Cannot connect to HubSpot API
- All agents will fail

**Fix**:
```bash
# Set in environment
export HUBSPOT_ACCESS_TOKEN="your-access-token-here"

# Or add to .env file
echo "HUBSPOT_ACCESS_TOKEN=your-access-token-here" >> .env

# Or run interactive setup:
/getstarted
```

**Where to get access token**:
1. Go to HubSpot Settings → Integrations → Private Apps
2. Create a new private app (or use existing)
3. Grant required scopes (see below)
4. Copy access token

---

### 2. HubSpot Portal ID

Checking for HubSpot Portal ID (optional)...

**Environment Variable**: `HUBSPOT_PORTAL_ID`

```bash
# Check if set
if [ -n "$HUBSPOT_PORTAL_ID" ]; then
  echo "✅ Portal ID is set: $HUBSPOT_PORTAL_ID"
else
  echo "⚠️  Portal ID not set (optional)"
fi
```

**Expected**: Portal ID present (optional but recommended)
**Issues if missing**:
- Some operations may require portal ID
- Will be prompted when needed

**Fix**:
```bash
# Set portal ID
export HUBSPOT_PORTAL_ID="12345678"

# Add to .env
echo "HUBSPOT_PORTAL_ID=12345678" >> .env
```

**Where to find Portal ID**:
1. Go to HubSpot Settings → Account Setup → Account Defaults
2. Look for "Hub ID" or check URL: app.hubspot.com/contacts/[PORTAL_ID]/

---

### 3. Required API Scopes

Checking HubSpot private app scopes...

**Test connection with minimal scope check**:
```bash
# Test API connection
curl -s -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  "https://api.hubapi.com/crm/v3/objects/contacts?limit=1" | jq
```

**Required Scopes** (minimum):
- `crm.objects.contacts.read` - Read contacts
- `crm.objects.contacts.write` - Create/update contacts
- `crm.objects.companies.read` - Read companies
- `crm.objects.companies.write` - Create/update companies
- `crm.objects.deals.read` - Read deals
- `crm.objects.deals.write` - Create/update deals

**Recommended Additional Scopes**:
- `crm.schemas.contacts.read` - Property definitions
- `crm.schemas.companies.read` - Company properties
- `automation` - Workflows
- `reports` - Analytics

**Fix if scopes missing**:
1. Go to HubSpot Settings → Integrations → Private Apps
2. Edit your private app
3. Add required scopes
4. Generate new access token
5. Update HUBSPOT_ACCESS_TOKEN

---

### 4. API Rate Limits

Checking current API rate limit status...

```bash
# Get rate limit info from last API call
curl -s -I -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  "https://api.hubapi.com/crm/v3/objects/contacts?limit=1" | grep -i "x-hubspot"
```

**Headers to check**:
- `X-HubSpot-RateLimit-Daily` - Daily limit
- `X-HubSpot-RateLimit-Daily-Remaining` - Remaining today
- `X-HubSpot-RateLimit-Secondly` - Per-second limit
- `X-HubSpot-RateLimit-Secondly-Remaining` - Remaining this second

**Expected**: Healthy remaining limits
**Issues**:
- Rate limit exhausted (429 errors)
- Need to wait or upgrade account

**Fix**:
- Wait for rate limit reset (daily limit resets at midnight UTC)
- Reduce operation frequency
- Upgrade HubSpot account for higher limits
- Use batch operations to reduce API calls

---

### 5. Test API Connection

Testing connection to HubSpot API...

```bash
# Test basic API call
curl -s -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  "https://api.hubapi.com/crm/v3/objects/contacts?limit=1" \
  | jq '.results[0].id // "No contacts found"'
```

**Expected**: Contact ID or "No contacts found"
**Issues if fails**:
- Invalid access token
- Network connectivity issues
- API endpoint down
- Insufficient scopes

**Fix**:
```bash
# Verify token is correct (not expired/revoked)
# Check token format: starts with "pat-" for private app tokens

# Test with simple account info endpoint
curl -s -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  "https://api.hubapi.com/account-info/v3/api-usage/daily" | jq
```

---

### 6. Node.js Dependencies

Checking required Node.js environment...

**Node.js**:
```bash
node --version
```
**Expected**: v18.0.0 or higher

**NPM**:
```bash
npm --version
```
**Expected**: v9.0.0 or higher

**Optional dependencies**:
- `jq` - JSON parsing (for scripts)
- `curl` - API testing

**Install missing tools**:
```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq curl

# Windows
choco install jq curl
```

---

### 7. Plugin Files Check

Verifying HubSpot Essentials plugin files...

**Checking**:
- ✅ Agent files (10 agents)
- ✅ Command files (/getstarted, /agents-guide, /healthcheck)
- ✅ Template files (error-messages.yaml)
- ✅ Plugin manifest (.claude-plugin/plugin.json)

**Status**: All files present

---

### 8. Quick Functionality Test

Running end-to-end test...

**Test 1: Get portal info**
```bash
curl -s -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  "https://api.hubapi.com/account-info/v3/details" | jq '.portalId, .timeZone'
```

**Test 2: Count contacts**
```bash
curl -s -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  "https://api.hubapi.com/crm/v3/objects/contacts?limit=1" | jq '.total // 0'
```

**Test 3: List properties**
```bash
curl -s -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  "https://api.hubapi.com/crm/v3/properties/contacts?limit=1" | jq '.results[0].name'
```

**Expected**: All three tests return valid data
**Issues**: See specific test for errors

---

## 📊 Health Check Summary

### ✅ System Status

| Component | Status | Action Needed |
|-----------|--------|---------------|
| Access Token Set | ✅/❌ | Set HUBSPOT_ACCESS_TOKEN |
| Portal ID Set | ✅/⚠️ | Optional but recommended |
| API Scopes | ✅/❌ | Add required scopes |
| Rate Limits | ✅/⚠️ | Monitor usage |
| API Connection | ✅/❌ | Fix authentication |
| Node.js | ✅/❌ | Update if < v18 |
| Plugin Files | ✅ | Complete |
| End-to-End Tests | ✅/❌ | Fix API issues |

### 🎯 Recommended Actions

**If all ✅ (Green)**:
You're all set! Your HubSpot Essentials setup is healthy.

**If any ❌ (Red)**:
1. Follow the "Fix" instructions above for each failed check
2. Run /healthcheck again to verify fixes
3. Check error messages for details

**If any ⚠️ (Yellow)**:
Optional improvements available but not blocking.

---

## 🚀 Quick Start (If New Setup)

If this is your first time using HubSpot Essentials:

1. **Create HubSpot Private App**:
   - Go to Settings → Integrations → Private Apps
   - Click "Create a private app"
   - Add required scopes (see list above)
   - Click "Create app"
   - Copy access token

2. **Set environment variable**:
   ```bash
   export HUBSPOT_ACCESS_TOKEN="your-token-here"
   ```
   Or add to `.env` file

3. **Set portal ID** (optional):
   ```bash
   export HUBSPOT_PORTAL_ID="12345678"
   ```

4. **Run healthcheck**:
   ```bash
   /healthcheck
   ```

5. **Try your first agent**:
   ```
   Use hubspot-property-manager to list all contact properties
   ```

---

## 🔧 Common Issues & Solutions

### Issue: "401 Unauthorized"

**Cause**: Invalid or expired access token

**Fix**:
```bash
# Verify token format
echo $HUBSPOT_ACCESS_TOKEN | cut -c1-4  # Should show "pat-"

# Generate new token in HubSpot
# Settings → Integrations → Private Apps → [Your App] → Regenerate token

# Update environment variable
export HUBSPOT_ACCESS_TOKEN="new-token-here"
```

---

### Issue: "403 Forbidden - Missing required scopes"

**Cause**: Private app doesn't have required API scopes

**Fix**:
1. Go to HubSpot Settings → Integrations → Private Apps
2. Click on your private app
3. Go to "Scopes" tab
4. Add missing scopes (see list in section 3 above)
5. Click "Update"
6. Generate new access token
7. Update HUBSPOT_ACCESS_TOKEN

---

### Issue: "429 Too Many Requests"

**Cause**: Rate limit exceeded

**Fix**:
```bash
# Check current rate limits
curl -I -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  "https://api.hubapi.com/crm/v3/objects/contacts?limit=1" | grep -i "x-hubspot"

# Solutions:
# 1. Wait for reset (daily limit resets at midnight UTC)
# 2. Reduce operation frequency
# 3. Use batch operations
# 4. Upgrade HubSpot account tier
```

---

### Issue: "No contacts found" in test

**Cause**: Portal has no contacts yet (not an error)

**Fix**:
- This is normal for new portals
- Create test contact manually in HubSpot
- Or continue - agents will work when you create data

---

### Issue: Access token in plaintext

**Cause**: Environment variable stored insecurely

**Fix**:
```bash
# Use .env file (add to .gitignore)
echo "HUBSPOT_ACCESS_TOKEN=your-token" >> .env
echo ".env" >> .gitignore

# Load .env in shell
source .env

# Or use secret management tool
# - 1Password CLI
# - AWS Secrets Manager
# - HashiCorp Vault
```

---

### Issue: Cannot find Portal ID

**Cause**: Don't know where to look

**Fix**:
```bash
# Option 1: Check URL
# When logged into HubSpot, URL shows:
# app.hubspot.com/contacts/[PORTAL_ID]/contacts/list/view/all/

# Option 2: API call
curl -s -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" \
  "https://api.hubapi.com/account-info/v3/details" | jq '.portalId'
```

---

## 📚 Additional Resources

### Getting Started
- Run `/getstarted` - Interactive HubSpot setup wizard
- Run `/agents-guide` - Find the right agent for your task

### Documentation
- HubSpot API Docs: https://developers.hubspot.com/docs/api/overview
- Private Apps Guide: https://developers.hubspot.com/docs/api/private-apps
- Plugin README: See `.claude-plugins/hubspot-essentials/README.md`
- Error Reference: See `.claude-plugins/hubspot-essentials/templates/error-messages.yaml`

### Support
- Check error codes in error-messages.yaml
- Review agent examples in each agent file
- Use /agents-guide to find the right agent

---

## 🔄 Next Steps

Once your health check passes:

1. **Explore agents**:
   ```bash
   /agents-guide
   ```

2. **List properties**:
   ```
   Use hubspot-property-manager to show me all contact properties
   ```

3. **Get analytics**:
   ```
   Use hubspot-analytics-reporter to show contact growth trends for last 6 months
   ```

4. **Create a list**:
   ```
   Use hubspot-contact-manager to create a list of contacts created in the last 30 days
   ```

---

**Health check complete!** If you see any ❌ indicators above, follow the fix instructions and run /healthcheck again.
