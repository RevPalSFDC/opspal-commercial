# Asana Per-User Authentication for Project Connect

**Version**: 1.0.0
**Date**: 2025-10-31
**Status**: ✅ Implemented

---

## Overview

Project Connect uses **individual user authentication** for Asana operations rather than a shared service account. This approach provides:

- ✅ **Better audit trails** - Actions attributed to actual users
- ✅ **Individual permissions** - Each user operates within their own access
- ✅ **Enhanced security** - No shared credentials to manage
- ✅ **Compliance friendly** - Clear accountability for all operations

---

## Workspace Configuration

**Default Workspace**: `REDACTED_ASANA_WORKSPACE`

All Asana projects created by Project Connect will be in this workspace. Users must have project creation permissions in this workspace.

---

## First-Time Setup

### Step 1: Get Your Personal Access Token

1. Go to **Asana Developer Console**:
   ```
   https://app.asana.com/0/my-apps
   ```

2. Click **"Create new token"**

3. Name your token:
   ```
   RevPal Project Connect
   ```

4. **Copy the token** (it will only be shown once!)

### Step 2: Configure Your Environment

**For current session only:**
```bash
export ASANA_ACCESS_TOKEN=your-token-here
```

**For permanent setup (recommended):**

**Bash users** (~/.bashrc):
```bash
echo 'export ASANA_ACCESS_TOKEN=your-token-here' >> ~/.bashrc
source ~/.bashrc
```

**Zsh users** (~/.zshrc):
```bash
echo 'export ASANA_ACCESS_TOKEN=your-token-here' >> ~/.zshrc
source ~/.zshrc
```

### Step 3: Verify Configuration

```bash
# Check if token is set
echo $ASANA_ACCESS_TOKEN

# Test the token
node .claude-plugins/opspal-core/scripts/lib/asana-auth-helper.js test

# Get your user info
node .claude-plugins/opspal-core/scripts/lib/asana-auth-helper.js whoami
```

---

## Using Project Connect

### Without Asana Authentication

If you don't have Asana authentication configured, Project Connect will:

1. Display setup instructions
2. Offer to continue without Asana
3. Create GitHub repo and Drive folder only
4. Skip Asana project creation

**Example Output:**
```
🔐 Checking Asana authentication...
⚠️  Asana authentication not configured for your user.

╔════════════════════════════════════════════════════════════════╗
║          🔑 Asana Authentication Required                      ║
╚════════════════════════════════════════════════════════════════╝

[Setup instructions displayed]

💡 TIP: You can still use Project Connect without Asana.
   GitHub and Drive will work, Asana will be skipped.
```

### With Asana Authentication

If you have Asana authentication configured:

```
🔐 Checking Asana authentication...
✅ Asana authentication found
   Testing token...
   ✅ Token validated successfully

[Workflow proceeds with full Asana integration]
```

---

## Helper Commands

### Check Authentication Status

```bash
node .claude-plugins/opspal-core/scripts/lib/asana-auth-helper.js check
```

**Output if configured:**
```json
{
  "authenticated": true,
  "token": "2/1234567890abcdef...",
  "workspaceId": "REDACTED_ASANA_WORKSPACE"
}
```

**Output if missing:**
```json
{
  "authenticated": false,
  "message": "ASANA_ACCESS_TOKEN not found in environment"
}
```

### Display Setup Instructions

```bash
node .claude-plugins/opspal-core/scripts/lib/asana-auth-helper.js setup
```

### Test Your Token

```bash
node .claude-plugins/opspal-core/scripts/lib/asana-auth-helper.js test
```

**Success output:**
```json
{
  "valid": true,
  "message": "Token validated successfully",
  "workspaces": [
    {
      "gid": "REDACTED_ASANA_WORKSPACE",
      "name": "RevPal Workspace"
    }
  ]
}

✅ Token is valid!
```

### Get Your User Info

```bash
node .claude-plugins/opspal-core/scripts/lib/asana-auth-helper.js whoami
```

**Output:**
```
Authenticated as:
  Name: Chris Acevedo
  Email: cnacevedo@gmail.com
  Asana GID: 1234567890
  Workspaces: 3
```

---

## Security Best Practices

### DO ✅

- ✅ Keep your token private and personal
- ✅ Store token in environment variables (not code)
- ✅ Rotate tokens every 90 days
- ✅ Revoke unused tokens immediately
- ✅ Use different tokens for different purposes

### DON'T ❌

- ❌ Share your token with teammates
- ❌ Commit tokens to git repositories
- ❌ Store tokens in plain text files
- ❌ Use the same token for multiple applications
- ❌ Leave old tokens active after rotation

### Token Management

**View active tokens:**
```
https://app.asana.com/0/my-apps
```

**Revoke a token:**
1. Go to https://app.asana.com/0/my-apps
2. Find "RevPal Project Connect" token
3. Click "Revoke"
4. Generate new token and update environment

**Rotate token (every 90 days):**
```bash
# 1. Create new token
# 2. Update environment variable
export ASANA_ACCESS_TOKEN=new-token-here

# 3. Update permanent config
sed -i 's/export ASANA_ACCESS_TOKEN=.*/export ASANA_ACCESS_TOKEN=new-token-here/' ~/.bashrc
source ~/.bashrc

# 4. Test new token
node .claude-plugins/opspal-core/scripts/lib/asana-auth-helper.js test

# 5. Revoke old token in Asana dashboard
```

---

## Troubleshooting

### Token Not Found

**Problem**: `ASANA_ACCESS_TOKEN not found in environment`

**Solution**:
```bash
# Check if set
echo $ASANA_ACCESS_TOKEN

# If empty, set it
export ASANA_ACCESS_TOKEN=your-token-here

# Make permanent
echo 'export ASANA_ACCESS_TOKEN=your-token-here' >> ~/.bashrc
source ~/.bashrc
```

### Token Invalid or Expired

**Problem**: `Token validation failed: 401 Unauthorized`

**Solution**:
1. Token may have been revoked or expired
2. Go to https://app.asana.com/0/my-apps
3. Create new token
4. Update environment variable
5. Test again

### Wrong Workspace

**Problem**: `Token works but you don't have access to workspace REDACTED_ASANA_WORKSPACE`

**Solution**:
1. Verify you're a member of the RevPal workspace
2. Contact workspace admin to add you
3. Or configure different workspace ID (not recommended)

### Permission Denied

**Problem**: `Cannot create project - insufficient permissions`

**Solution**:
1. Verify you have project creation permissions
2. Check workspace settings: https://app.asana.com/0/REDACTED_ASANA_WORKSPACE/settings
3. Contact workspace admin to grant permissions

---

## For Workspace Administrators

### Adding New Users

1. Invite user to workspace `REDACTED_ASANA_WORKSPACE`
2. Grant "Member" level access (minimum)
3. Enable "Can create projects" permission
4. User follows setup instructions above

### Workspace Permissions Required

- ✅ Read workspace projects
- ✅ Create new projects
- ✅ Read/write project members
- ✅ Read workspace members (for team assignments)

### Audit Trail

All Asana operations are logged in Supabase `revpal_access_log` table with:
- User email (from `createdBy` parameter)
- Asana user GID (from token)
- Project created/accessed
- Timestamp
- Action performed

**Query audit logs:**
```sql
SELECT
  user_email,
  system_id as project_id,
  action,
  date
FROM revpal_access_log
WHERE system = 'asana'
ORDER BY date DESC;
```

---

## Technical Implementation

### Authentication Flow

```javascript
const AsanaAuthHelper = require('./lib/asana-auth-helper');

// 1. Check authentication
const asanaAuth = new AsanaAuthHelper();
const authStatus = asanaAuth.checkAuthentication();

if (!authStatus.authenticated) {
  // 2. Display setup instructions
  asanaAuth.displaySetupInstructions();

  // 3. Gracefully degrade (skip Asana)
  asanaEnabled = false;
} else {
  // 4. Validate token (optional)
  const testResult = await asanaAuth.testToken();

  if (testResult.valid) {
    asanaEnabled = true;
  }
}

// 5. Use Asana only if enabled
if (asanaEnabled) {
  // Create/connect Asana project
}
```

### Graceful Degradation

Project Connect works even without Asana authentication:

- ✅ GitHub repository created/connected
- ✅ Google Drive folder created/connected
- ✅ Supabase directory updated
- ⏭️ Asana project skipped (with message)

Users can add Asana later:
1. Configure authentication
2. Run Project Connect again
3. Asana project will be created/connected
4. Supabase directory updated with Asana URLs

---

## Migration from Service Account

If you previously used a shared service account:

### Step 1: Identify Service Account Token

```bash
# Check if using service account
echo $ASANA_ACCESS_TOKEN

# If starts with "0/" it's a service account
# If starts with "2/" it's a personal access token
```

### Step 2: Migrate to Personal Tokens

**For each user:**
1. User creates personal access token
2. User sets `ASANA_ACCESS_TOKEN` in their environment
3. Verify with: `node asana-auth-helper.js whoami`

### Step 3: Revoke Service Account (Optional)

Once all users have personal tokens:
1. Go to Asana service account settings
2. Revoke the shared token
3. Update documentation to remove service account references

---

## Future Enhancements

### Planned Features

1. **OAuth Flow** - Interactive browser-based authentication
2. **Token Refresh** - Automatic token rotation
3. **Multi-Workspace** - Support for multiple workspaces
4. **Team Permissions** - Automatic team member addition to projects

### Roadmap

- **Phase 1** (Complete): Per-user token authentication ✅
- **Phase 2** (In Progress): MCP integration for project creation
- **Phase 3** (Planned): OAuth flow for easier setup
- **Phase 4** (Planned): Automated team permissions

---

## Related Documentation

- [Project Connect Implementation](../PROJECT_CONNECT_IMPLEMENTATION_COMPLETE.md)
- [Asana Integration Playbook](../../ASANA_AGENT_PLAYBOOK.md)
- [Asana MCP Server Configuration](../../../.mcp.json)

---

## Support

### Questions?

Use `/reflect` to submit questions or feedback about Asana authentication.

### Issues?

Common issues and solutions available in [Troubleshooting](#troubleshooting) section above.

### Contact

For workspace access or permission issues, contact workspace administrator.

---

**Last Updated**: 2025-10-31
**Version**: 1.0.0
**Author**: RevPal Engineering
