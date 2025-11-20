# Get Started with HubSpot Essentials

Welcome to **RevOps Essentials for HubSpot**! This guide will help you connect your HubSpot portal and run your first automation.

---

## Step 1: Prerequisites Check

Before we begin, let's verify you have what you need.

**Required:**
- ✅ HubSpot account with API access
- ✅ Appropriate permissions (Super Admin or Marketing/Sales/Service Hub Professional/Enterprise)
- ✅ Node.js installed (for some operations) - [Install Guide](https://nodejs.org/)

**Optional but Recommended:**
- 📦 `jq` for JSON processing - Makes output prettier ([Install](https://stedolan.github.io/jq/download/))

Let me check what's installed on your system:

```bash
# Check Node.js
if command -v node &> /dev/null; then
    echo "✅ Node.js installed: $(node --version)"
else
    echo "⚠️  Node.js not found (needed for some operations). Install from: https://nodejs.org/"
fi

# Check npm
if command -v npm &> /dev/null; then
    echo "✅ npm installed: $(npm --version)"
else
    echo "⚠️  npm not found. Install Node.js to get npm."
fi

# Check jq (optional)
if command -v jq &> /dev/null; then
    echo "✅ jq installed: $(jq --version)"
else
    echo "⚠️  jq not found (optional but recommended). Install from: https://stedolan.github.io/jq/download/"
fi
```

---

## Step 2: Get Your HubSpot API Key

You need an API key to connect to HubSpot. Here's how to get one:

### Option A: Private App Access Token (Recommended - HubSpot Professional+)

**Best for:** Secure, scoped access to specific HubSpot APIs

**Steps:**
1. Go to your HubSpot account
2. Click Settings (gear icon) → Integrations → Private Apps
3. Click "Create a private app"
4. Name it: "RevOps Essentials"
5. **Scopes tab** - Enable these scopes:
   - `crm.objects.contacts.read` + `.write`
   - `crm.objects.companies.read` + `.write`
   - `crm.objects.deals.read` + `.write`
   - `crm.schemas.contacts.read`
   - `crm.schemas.companies.read`
   - `automation.read` (if available)
6. Click "Create app"
7. **Copy the Access Token** (you'll only see it once!)

### Option B: API Key (Legacy - Being Deprecated)

**For older accounts or Free tier:**

**Steps:**
1. Go to Settings → Integrations → API Key
2. Click "Show" or "Create key"
3. **Copy the API Key**

⚠️ **Note:** HubSpot is deprecating API keys in favor of Private Apps. Use Private Apps if available.

---

## Step 3: Store Your API Key Securely

**NEVER commit API keys to git or share them publicly!**

Store your key as an environment variable:

### For macOS/Linux:

Add to your `~/.bashrc`, `~/.zshrc`, or `~/.profile`:

```bash
export HUBSPOT_ACCESS_TOKEN="your-access-token-here"
```

Then reload:
```bash
source ~/.bashrc  # or ~/.zshrc
```

### For Windows (PowerShell):

```powershell
$env:HUBSPOT_ACCESS_TOKEN = "your-access-token-here"
```

Or set permanently:
```powershell
[System.Environment]::SetEnvironmentVariable('HUBSPOT_ACCESS_TOKEN', 'your-access-token-here', 'User')
```

### Verify it's set:

```bash
# macOS/Linux
echo $HUBSPOT_ACCESS_TOKEN

# Windows PowerShell
echo $env:HUBSPOT_ACCESS_TOKEN
```

You should see your token (first few characters).

---

## Step 4: Test Your Connection

Let's verify the connection works by fetching your HubSpot account info:

```bash
# Test with curl (basic check)
curl -X GET \
  "https://api.hubapi.com/account-info/v3/details" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN"
```

**Expected output:**
```json
{
  "portalId": 12345678,
  "accountType": "PAID_PRO",
  "timeZone": "America/New_York",
  ...
}
```

✅ **Success!** If you see your portal info, you're connected.

❌ **Error?** See [Troubleshooting](#step-7-common-troubleshooting) below.

---

## Step 5: Install HubSpot Client Library (Optional)

For better performance with some agents, install the HubSpot Node.js client:

```bash
npm install -g @hubspot/api-client
```

This is optional but recommended for:
- Batch operations
- Complex property management
- Workflow operations

---

## Step 6: Your First Discovery

Let's use the **hubspot-property-manager** agent to analyze your portal:

**Try this prompt:**
```
Use the hubspot-property-manager agent to analyze my HubSpot properties and show me:
- Total contact properties
- Total company properties
- Unused properties (candidates for cleanup)
- Naming inconsistencies
```

**What you'll get:**
- Comprehensive property overview
- Usage statistics
- Data quality insights
- Cleanup recommendations

This usually takes 1-2 minutes depending on portal size.

---

## Step 7: Next Steps - What Can You Do?

Now that you're connected, here are some common tasks to try:

### 📊 **Discovery & Analysis**

**Analyze properties:**
```
Use hubspot-property-manager to identify unused properties on the Contact object
```

**Review workflows:**
```
Use hubspot-workflow to list all active workflows and their trigger types
```

**Get analytics:**
```
Use hubspot-analytics-reporter to show me contact creation trends for the last 30 days
```

### 🛠️ **Basic Operations**

**Create a property:**
```
Use hubspot-property-manager to create a text property called "customer_segment" on the Company object
```

**Update contacts:**
```
Use hubspot-contact-manager to update all contacts in the "MQL" lifecycle stage with a specific tag
```

**Manage deals:**
```
Use hubspot-pipeline-manager to show me all open deals in the "Proposal" stage
```

### 🔄 **Workflows & Automation**

**Create a simple workflow:**
```
Use hubspot-workflow to create a workflow that sends a welcome email when a contact is created
```

**Analyze automation:**
```
Use hubspot-data-hygiene-specialist to identify duplicate contacts
```

### 📝 **Documentation**

**Create a diagram:**
```
Use diagram-generator to create a flowchart of my lead nurture process
```

**Generate a PDF report:**
```
Use pdf-generator to create a PDF of my portal property analysis
```

---

## Step 8: Common Troubleshooting

### Issue: "401 Unauthorized" Error

**Causes:**
- Expired or invalid access token
- Token doesn't have required scopes
- Token not properly set in environment

**Solution:**
1. Verify token is set: `echo $HUBSPOT_ACCESS_TOKEN`
2. Regenerate token in HubSpot (Settings → Private Apps)
3. Update environment variable with new token
4. Restart terminal

### Issue: "403 Forbidden" Error

**Cause:** Your access token doesn't have the required scopes.

**Solution:**
1. Go to HubSpot → Settings → Private Apps
2. Edit your app
3. Add missing scopes (see Step 2 above)
4. Regenerate token
5. Update environment variable

### Issue: "Rate limit exceeded"

**Cause:** HubSpot API has rate limits (varies by subscription).

**Solution:**
- Wait 10-60 seconds and retry
- For batch operations, reduce batch size
- Upgrade to higher HubSpot tier for higher limits

### Issue: Node.js errors

**Solution:**
```bash
# Update npm
npm install -g npm@latest

# Reinstall HubSpot client
npm install -g @hubspot/api-client
```

---

## What's Included in Essentials (Free)

You now have access to **10 HubSpot agents**:

| Agent | What It Does |
|-------|--------------|
| **hubspot-property-manager** | Property analysis and management |
| **hubspot-analytics-reporter** | Basic reporting and analytics |
| **hubspot-data** | Data operations and hygiene basics |
| **hubspot-contact-manager** | Contact CRUD operations |
| **hubspot-pipeline-manager** | Deal and pipeline management |
| **hubspot-workflow** | Basic workflow creation |
| **hubspot-api** | Basic API operations |
| **hubspot-admin-specialist** | Portal settings and configuration |
| **hubspot-reporting-builder** | Create custom reports |
| **hubspot-data-hygiene-specialist** | Data quality and deduplication |

---

## Need More Advanced Features?

Essentials is perfect for day-to-day operations. If you need advanced capabilities, check out:

### 🚀 **RevOps Professional Edition**

**Includes everything in Essentials PLUS:**
- Comprehensive RevOps assessments
- Revenue intelligence (predictive forecasting)
- Advanced workflow builder (AI-powered)
- SFDC sync management (browser automation)
- Lead scoring specialist
- Conversation intelligence
- CMS page management
- 25+ additional agents

**[See Full Comparison →](../../../COMPARISON.md)**

### 💼 **Consulting Services**

Need expert help? We offer:
- HubSpot RevOps Assessments ($8K-15K)
- Automation Architecture ($10K-20K)
- Data Migrations ($15K-50K)
- SFDC Integration Setup ($5K-12K)

**[Book a Free Consultation →](https://calendly.com/revpal-engineering)**

---

## Quick Reference

### Essential API Endpoints

```bash
# Get account info
curl -X GET "https://api.hubapi.com/account-info/v3/details" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN"

# List contacts (first 10)
curl -X GET "https://api.hubapi.com/crm/v3/objects/contacts?limit=10" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN"

# Get properties for contacts
curl -X GET "https://api.hubapi.com/crm/v3/properties/contacts" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN"

# List workflows (requires Automation scope)
curl -X GET "https://api.hubapi.com/automation/v4/workflows" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN"
```

### Useful Resources

- **HubSpot API Docs**: https://developers.hubspot.com/docs/api/overview
- **Private Apps Guide**: https://developers.hubspot.com/docs/api/private-apps
- **Rate Limits**: https://developers.hubspot.com/docs/api/usage-details

### Getting Help

- **Documentation**: [HubSpot Essentials Guide](../../../docs/HUBSPOT_ESSENTIALS.md)
- **GitHub Issues**: [Report a bug or request a feature](https://github.com/RevPalSFDC/opspal-plugin-essentials/issues)
- **Community**: [Join discussions](https://github.com/RevPalSFDC/opspal-plugin-essentials/discussions)

---

## You're All Set! 🎉

Your HubSpot portal is connected and you're ready to automate. Here are some suggested next steps:

1. **Analyze properties:** `Use hubspot-property-manager to analyze my contact properties`
2. **Explore workflows:** `Use hubspot-workflow to list all active workflows`
3. **Check data quality:** `Use hubspot-data-hygiene-specialist to find duplicate contacts`
4. **Create documentation:** `Use diagram-generator to map my lead workflow`

**Happy automating!** If you run into any issues, just ask for help or check the [Troubleshooting Guide](../../../docs/TROUBLESHOOTING.md).

---

## Advanced Tips

### Store Portal ID for Reference

Get your portal ID for reference:

```bash
export HUBSPOT_PORTAL_ID=$(curl -s -X GET \
  "https://api.hubapi.com/account-info/v3/details" \
  -H "Authorization: Bearer $HUBSPOT_ACCESS_TOKEN" | jq -r '.portalId')

echo "Your Portal ID: $HUBSPOT_PORTAL_ID"
```

### Test Multiple Portals

If you work with multiple HubSpot portals:

```bash
# Portal 1
export HUBSPOT_ACCESS_TOKEN_PROD="token-for-production"

# Portal 2
export HUBSPOT_ACCESS_TOKEN_STAGING="token-for-staging"

# Switch between them
export HUBSPOT_ACCESS_TOKEN=$HUBSPOT_ACCESS_TOKEN_PROD
```

### Use .env Files (Safer)

Create a `.env` file in your project directory:

```bash
# .env
HUBSPOT_ACCESS_TOKEN=your-token-here
HUBSPOT_PORTAL_ID=12345678
```

**Important:** Add `.env` to your `.gitignore`!

---

**Questions?** Contact us at engineering@gorevpal.com or [book a free consultation](https://calendly.com/revpal-engineering).
