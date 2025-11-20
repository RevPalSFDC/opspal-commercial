---
name: healthcheck
description: Comprehensive health check for Salesforce Essentials plugin and SF CLI setup
---

# Salesforce Essentials Health Check

Running comprehensive health check...

## 🔍 Health Check Results

### 1. Salesforce CLI Installation

Checking if Salesforce CLI is installed...

```bash
sf --version
```

**Expected**: Salesforce CLI version information
**Issues if fails**:
- CLI not installed
- CLI not in system PATH

**Fix**:
```bash
# Install Salesforce CLI
npm install -g @salesforce/cli

# Or use installer from:
# https://developer.salesforce.com/tools/sfdxcli
```

---

### 2. Authenticated Orgs

Checking for authenticated Salesforce orgs...

```bash
sf org list --all
```

**Expected**: List of authenticated orgs with aliases
**Issues if empty**:
- No orgs authenticated
- Need to connect to Salesforce

**Fix**:
```bash
# Authenticate to Salesforce org
sf org login web --alias my-org

# Or run:
/getstarted
```

---

### 3. Default Org Connection

Checking default org (if set)...

```bash
sf config get target-org
```

**Expected**: Default org alias or "No results found"
**Issues**:
- No default org set (optional but recommended)

**Fix**:
```bash
# Set default org
sf config set target-org my-org
```

---

### 4. Test API Connection

Testing connection to default org (if available)...

```bash
sf org display --target-org <default-org>
```

**Expected**: Org details, username, instance URL
**Issues if fails**:
- Authentication expired
- Network connectivity issues
- Org no longer exists

**Fix**:
```bash
# Re-authenticate
sf org login web --alias my-org

# Or refresh token
sf org open --target-org my-org
```

---

### 5. Environment Variables

Checking common Salesforce environment variables...

Variables checked:
- `SF_TARGET_ORG` - Default org alias (optional)
- `SF_LOG_LEVEL` - Logging level (optional)

**Status**: ✅ Not required but helpful

**Optional Setup**:
```bash
# Set default org via environment
export SF_TARGET_ORG=my-org

# Enable debug logging
export SF_LOG_LEVEL=debug
```

---

### 6. Plugin Dependencies

Checking required dependencies for Salesforce Essentials...

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

**Optional but recommended**:
- `jq` - JSON parsing (for advanced scripts)
- `git` - Version control

**Install jq** (optional):
```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq

# Windows
choco install jq
```

---

### 7. Plugin Files Check

Verifying Salesforce Essentials plugin files...

**Checking**:
- ✅ Agent files (12 agents)
- ✅ Command files (/getstarted, /agents-guide, /healthcheck)
- ✅ Template files (error-messages.yaml)
- ✅ Plugin manifest (.claude-plugin/plugin.json)

**Status**: All files present

---

### 8. Quick Test

Running a simple SOQL query to verify full functionality...

```bash
# Query User object (always exists)
sf data query --query "SELECT Id, Username FROM User LIMIT 1" --target-org <default-org>
```

**Expected**: One user record returned
**Issues if fails**:
- Connection problems
- Permission issues
- Query syntax errors

---

## 📊 Health Check Summary

### ✅ System Status

| Component | Status | Action Needed |
|-----------|--------|---------------|
| SF CLI Installed | ✅/❌ | Install if missing |
| Orgs Authenticated | ✅/❌ | Run /getstarted |
| Default Org Set | ✅/⚠️ | Optional but recommended |
| API Connection | ✅/❌ | Re-authenticate if failed |
| Node.js | ✅/❌ | Update if < v18 |
| Plugin Files | ✅ | Complete |
| End-to-End Test | ✅/❌ | Fix connection issues |

### 🎯 Recommended Actions

**If all ✅ (Green)**:
You're all set! Your Salesforce Essentials setup is healthy.

**If any ❌ (Red)**:
1. Follow the "Fix" instructions above for each failed check
2. Run /healthcheck again to verify fixes
3. If issues persist, check error messages for details

**If any ⚠️ (Yellow)**:
Optional improvements available but not required for basic functionality.

---

## 🚀 Quick Start (If New Setup)

If this is your first time using Salesforce Essentials:

1. **Install Salesforce CLI**:
   ```bash
   npm install -g @salesforce/cli
   ```

2. **Authenticate to Salesforce**:
   ```bash
   /getstarted
   ```
   Or manually:
   ```bash
   sf org login web --alias my-sandbox
   ```

3. **Set default org** (optional):
   ```bash
   sf config set target-org my-sandbox
   ```

4. **Run healthcheck again**:
   ```bash
   /healthcheck
   ```

5. **Try your first agent**:
   ```
   Use sfdc-discovery to analyze my Salesforce org
   ```

---

## 🔧 Common Issues & Solutions

### Issue: "sf: command not found"

**Cause**: Salesforce CLI not installed or not in PATH

**Fix**:
```bash
# Install globally
npm install -g @salesforce/cli

# Verify installation
sf --version

# If still not found, check PATH
echo $PATH
```

---

### Issue: "No org configurations found"

**Cause**: No Salesforce orgs authenticated

**Fix**:
```bash
# Run interactive setup
/getstarted

# Or authenticate manually
sf org login web --alias my-org
```

---

### Issue: "The org cannot be found"

**Cause**: Trying to use an org that isn't authenticated

**Fix**:
```bash
# List available orgs
sf org list

# Use an authenticated org or add new one
sf org login web --alias correct-org
```

---

### Issue: "Invalid version" for Node.js

**Cause**: Node.js version too old (< v18)

**Fix**:
```bash
# Check current version
node --version

# Update Node.js
# macOS (via Homebrew)
brew upgrade node

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Windows - download from nodejs.org
```

---

### Issue: Authentication keeps expiring

**Cause**: OAuth token timeout

**Fix**:
```bash
# Refresh authentication
sf org login web --alias my-org

# For persistent connection, use JWT bearer flow (advanced)
# See: https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_auth_jwt_flow.htm
```

---

### Issue: SOQL query fails with "Object not found"

**Cause**: Querying object that doesn't exist in this org

**Fix**:
```bash
# List all objects in org
sf sobject list --sobject all --target-org my-org

# Use object that exists
sf data query --query "SELECT Id FROM Account LIMIT 1" --target-org my-org
```

---

## 📚 Additional Resources

### Getting Started
- Run `/getstarted` - Interactive Salesforce setup wizard
- Run `/agents-guide` - Find the right agent for your task

### Documentation
- Salesforce CLI Docs: https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/
- Plugin README: See `.claude-plugins/salesforce-essentials/README.md`
- Error Reference: See `.claude-plugins/salesforce-essentials/templates/error-messages.yaml`

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

2. **Try discovery**:
   ```
   Use sfdc-discovery to analyze my Salesforce org and show top 3 improvement areas
   ```

3. **Build a query**:
   ```
   Use sfdc-query-specialist to show all Opportunities created this month
   ```

4. **Analyze fields**:
   ```
   Use sfdc-field-analyzer to find unused fields on Account object
   ```

---

**Health check complete!** If you see any ❌ indicators above, follow the fix instructions and run /healthcheck again.
