# Get Started with Salesforce Essentials

Welcome to **RevOps Essentials for Salesforce**! This guide will help you connect your Salesforce org and run your first automation.

---

## Step 1: Prerequisites Check

Before we begin, let's verify you have the necessary tools installed.

**Required:**
- ✅ Salesforce CLI (`sf`) - [Install Guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_install_cli.htm)
- ✅ Access to a Salesforce org (Production, Sandbox, or Developer Edition)

**Optional but Recommended:**
- 📦 `jq` for JSON processing - Makes output prettier ([Install](https://stedolan.github.io/jq/download/))

Let me check what's installed on your system:

```bash
# Check Salesforce CLI
if command -v sf &> /dev/null; then
    echo "✅ Salesforce CLI installed: $(sf --version)"
else
    echo "❌ Salesforce CLI not found. Install from: https://developer.salesforce.com/tools/salesforcecli"
fi

# Check jq (optional)
if command -v jq &> /dev/null; then
    echo "✅ jq installed: $(jq --version)"
else
    echo "⚠️  jq not found (optional but recommended). Install from: https://stedolan.github.io/jq/download/"
fi
```

---

## Step 2: Connect Your Salesforce Org

Now let's connect to your Salesforce org. You have two options:

### Option A: OAuth Web Login (Recommended)

This opens a browser window for secure authentication:

```bash
# Connect to production/developer org
sf org login web --alias my-org

# OR connect to a sandbox
sf org login web --alias my-sandbox --instance-url https://test.salesforce.com
```

**What happens:**
1. Browser opens to Salesforce login
2. You log in with your username/password
3. CLI stores the OAuth token securely
4. Connection is saved as "my-org" (or whatever alias you chose)

### Option B: Username/Password (Advanced)

If you prefer username/password authentication:

```bash
sf org login jwt --username your.email@company.com --alias my-org
```

**Note:** This requires setting up a Connected App with JWT. Most users should use Option A.

---

## Step 3: Verify Connection

Let's test that the connection works:

```bash
# Display org information
sf org display --target-org my-org

# List all connected orgs
sf org list
```

**Expected output:**
```
=== Org Description
KEY           VALUE
────────────  ──────────────────────────────
Access Token  00D...
Alias         my-org
Username      your.email@company.com
Org Id        00D...
Instance Url  https://yourinstance.my.salesforce.com
```

✅ **Success!** If you see output like above, your org is connected.

---

## Step 4: Set as Default (Optional but Recommended)

Make this org your default so you don't have to specify it every time:

```bash
sf config set target-org=my-org
```

Now all commands will use "my-org" by default unless you specify otherwise.

---

## Step 5: Your First Discovery

Let's use the **sfdc-discovery** agent to analyze your org:

**Try this prompt:**
```
Use the sfdc-discovery agent to analyze my Salesforce org and show me:
- Total objects and fields
- Unused fields (candidates for cleanup)
- Automation complexity
- Top recommendations
```

**What you'll get:**
- Comprehensive org overview
- Object/field counts and statistics
- Automation analysis (triggers, flows, process builders)
- Unused field recommendations
- Security and permission insights

This usually takes 2-3 minutes depending on org size.

---

## Step 6: Next Steps - What Can You Do?

Now that you're connected, here are some common tasks to try:

### 📊 **Discovery & Analysis**

**Find unused fields:**
```
Use sfdc-field-analyzer to identify unused fields on the Account object
```

**Analyze a layout:**
```
Use sfdc-layout-analyzer to analyze the Account page layout and suggest improvements
```

**Query data:**
```
Use sfdc-query-specialist to show me all Accounts created this month with their owners
```

### 🛠️ **Basic Operations**

**Create a field:**
```
Use sfdc-metadata-manager to create a text field called "Customer_Segment__c" on the Account object
```

**Create a report:**
```
Use sfdc-reports-dashboards to create a report showing all open opportunities by stage
```

**Export data:**
```
Use sfdc-data-operations to export all Contacts with their Account names to a CSV file
```

### 📝 **Documentation**

**Create a diagram:**
```
Use diagram-generator to create a flowchart of my lead-to-opportunity process
```

**Generate a PDF report:**
```
Use pdf-generator to create a PDF of my org discovery findings
```

---

## Step 7: Common Troubleshooting

### Issue: "ERROR running org display: No authorization information found"

**Solution:** Your org connection expired. Reconnect with:
```bash
sf org login web --alias my-org
```

### Issue: "sf: command not found"

**Solution:** Salesforce CLI isn't installed or not in your PATH.
- Install from: https://developer.salesforce.com/tools/salesforcecli
- Restart your terminal after installation

### Issue: "Cannot read properties of undefined"

**Solution:** You may need to specify the org:
```bash
sf org display --target-org my-org
```

Or set it as default:
```bash
sf config set target-org=my-org
```

### Issue: Commands are slow

**Tip:** Some operations query large data sets. You can:
- Limit results: Add `LIMIT 100` to SOQL queries
- Target specific objects instead of org-wide scans
- Run during off-peak hours for large orgs

---

## What's Included in Essentials (Free)

You now have access to **12 Salesforce agents**:

| Agent | What It Does |
|-------|--------------|
| **sfdc-discovery** | Comprehensive org analysis |
| **sfdc-query-specialist** | SOQL queries with optimization |
| **sfdc-field-analyzer** | Field metadata analysis |
| **sfdc-object-auditor** | Object auditing and insights |
| **sfdc-metadata-manager** | Create/update fields, objects, layouts |
| **sfdc-data-operations** | Import/export data |
| **sfdc-reports-dashboards** | Create reports and dashboards |
| **sfdc-security-admin** | Manage permissions and profiles |
| **flow-template-specialist** | Use flow templates |
| **sfdc-layout-analyzer** | Analyze page layouts |
| **sfdc-planner** | Plan implementations |
| **sfdc-cli-executor** | Execute Salesforce CLI commands |

---

## Need More Advanced Features?

Essentials is perfect for day-to-day operations. If you need advanced capabilities, check out:

### 🚀 **RevOps Professional Edition**

**Includes everything in Essentials PLUS:**
- CPQ assessments (20+ health checks)
- RevOps audits with statistical analysis
- Automation conflict detection
- Advanced orchestration (merges, consolidations)
- Living Runbooks & Order of Operations Library
- 130+ additional agents

**[See Full Comparison →](../../../COMPARISON.md)**

### 💼 **Consulting Services**

Need expert help? We offer:
- RevOps Assessments ($8K-15K)
- CPQ Health Checks ($5K-12K)
- Automation Redesigns ($10K-20K)
- Data Migrations ($15K-50K)

**[Book a Free Consultation →](https://calendly.com/revpal-engineering)**

---

## Quick Reference

### Essential Commands

```bash
# List connected orgs
sf org list

# Switch to a different org
sf config set target-org=my-other-org

# Open org in browser
sf org open --target-org my-org

# Display org limits
sf data query --query "SELECT Id, Name FROM Organization LIMIT 1" --use-tooling-api

# Check API usage
sf org display limits --target-org my-org
```

### Getting Help

- **Documentation**: [Salesforce Essentials Guide](../../../docs/SALESFORCE_ESSENTIALS.md)
- **GitHub Issues**: [Report a bug or request a feature](https://github.com/RevPalSFDC/opspal-plugin-essentials/issues)
- **Community**: [Join discussions](https://github.com/RevPalSFDC/opspal-plugin-essentials/discussions)

---

## You're All Set! 🎉

Your Salesforce org is connected and you're ready to automate. Here are some suggested next steps:

1. **Run a discovery:** `Use sfdc-discovery agent to analyze my org`
2. **Explore your data:** `Use sfdc-query-specialist to show me a summary of my Opportunities`
3. **Check for issues:** `Use sfdc-field-analyzer to find unused fields`
4. **Create documentation:** `Use diagram-generator to map my sales process`

**Happy automating!** If you run into any issues, just ask for help or check the [Troubleshooting Guide](../../../docs/TROUBLESHOOTING.md).

---

**Questions?** Contact us at engineering@gorevpal.com or [book a free consultation](https://calendly.com/revpal-engineering).
