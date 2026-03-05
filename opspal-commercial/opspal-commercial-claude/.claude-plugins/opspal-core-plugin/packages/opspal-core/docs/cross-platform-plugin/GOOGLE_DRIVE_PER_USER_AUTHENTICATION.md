# Google Drive Per-User OAuth Authentication for Project Connect

**Version**: 1.0.0
**Date**: 2025-10-31
**Status**: ✅ Implemented

---

## Overview

Project Connect uses **individual user OAuth authentication** for Google Drive operations rather than service accounts. This approach provides:

- ✅ **Better security** - OAuth with automatic token refresh vs long-lived service account keys
- ✅ **Individual permissions** - Each user operates within their own Google Drive
- ✅ **Audit trails** - Actions attributed to actual users
- ✅ **Minimal scope** - Only files/folders created by this app (drive.file scope)
- ✅ **Revocable access** - Users can revoke anytime via Google Account settings

---

## Authentication Methods

### Option 1: OAuth Flow (Recommended)

Uses Google OAuth 2.0 with browser-based authentication:
- Tokens automatically refresh
- Expires after ~7 days, auto-renewed
- Most secure approach
- Best user experience

### Option 2: Manual Mode (Fallback)

No authentication required:
- User creates folders manually in Drive
- Provides folder ID/URL when prompted
- Workflow continues without API access
- Good for users without OAuth setup

---

## First-Time Setup (OAuth)

### Step 1: Create Google Cloud Project

1. Go to **Google Cloud Console**:
   ```
   https://console.cloud.google.com/
   ```

2. Create a new project (if needed):
   - Click "Select a project" dropdown
   - Click "NEW PROJECT"
   - Name: "RevPal Project Connect" (or similar)
   - Click "CREATE"

### Step 2: Enable Google Drive API

1. Go to **API Library**:
   ```
   https://console.cloud.google.com/apis/library/drive.googleapis.com
   ```

2. Select your project

3. Click **"ENABLE"**

### Step 3: Configure OAuth Consent Screen

1. Go to **OAuth consent screen**:
   ```
   https://console.cloud.google.com/apis/credentials/consent
   ```

2. Select **"External"** user type

3. Click **"CREATE"**

4. Fill in required fields:
   - **App name**: "RevPal Project Connect"
   - **User support email**: Your email
   - **Developer contact**: Your email

5. Click **"SAVE AND CONTINUE"** through all steps

6. Skip "Scopes" (we'll request them in the app)

7. Skip "Test users" (not needed for External)

8. Click **"BACK TO DASHBOARD"**

### Step 4: Create OAuth Client ID

1. Go to **Credentials**:
   ```
   https://console.cloud.google.com/apis/credentials
   ```

2. Click **"CREATE CREDENTIALS"** → **"OAuth client ID"**

3. Application type: **"Desktop app"**

4. Name: "RevPal Project Connect"

5. Click **"CREATE"**

6. Click **"DOWNLOAD JSON"** (download icon ⬇)

### Step 5: Install OAuth Client Credentials

**Default location** (recommended):
```bash
mkdir -p ~/.credentials
mv ~/Downloads/client_secret_*.json ~/.credentials/google-drive-credentials.json
```

**Custom location** (optional):
```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/credentials.json
```

### Step 6: Install Dependencies

```bash
cd /home/chris/Desktop/RevPal/Agents/opspal-internal-plugins
npm install googleapis @google-cloud/local-auth
```

### Step 7: Run OAuth Flow

```bash
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/google-drive-auth-helper.js authenticate
```

**What happens:**
1. A browser window opens
2. Select your Google account
3. Click "Allow" to grant Drive access
4. Token saved automatically to `~/.credentials/google-drive-token.json`
5. You can close the browser

### Step 8: Verify Authentication

```bash
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/google-drive-auth-helper.js test
```

**Success output:**
```json
{
  "valid": true,
  "message": "Drive access verified successfully",
  "user": {
    "email": "user@example.com",
    "name": "Your Name"
  },
  "storage": {
    "limit": "15 GB",
    "usage": "2.3 GB"
  }
}

✅ Drive access is valid!
```

---

## Using Project Connect

### With OAuth Authentication

If you have OAuth configured:

```bash
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/project-connect.js \
  --customer "Acme Robotics" \
  --created-by "user@example.com" \
  --mode execute
```

**Output:**
```
🔐 Checking Google Drive authentication...
✅ Google Drive authentication found
   Testing Drive access...
   ✅ Drive access verified (user@example.com)

[Workflow executes, creates folders via API]

✅ Drive folder created: RevPal • Acme Robotics • RP-ACM123456
```

---

### Without OAuth Authentication (Manual Mode)

If you don't have OAuth configured:

```bash
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/project-connect.js \
  --customer "Acme Robotics" \
  --created-by "user@example.com" \
  --drive-mode manual \
  --mode execute
```

**Output:**
```
🔐 Checking Google Drive authentication...
⚠️  Google Drive OAuth not configured for your user.
   Falling back to manual mode for Drive folder creation.
   You will need to create folders manually and provide folder IDs.

[Workflow provides manual creation instructions]

📝 Manual Google Drive Folder Creation:
1. Go to: https://drive.google.com
2. Create a new folder
3. Name: "RevPal • Acme Robotics • RP-ACM123456"
4. Copy the folder ID from the URL
5. Provide the folder ID when prompted

✅ GitHub created, Drive manual instructions provided
```

---

## Helper Commands

### Check Authentication Status

```bash
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/google-drive-auth-helper.js check
```

**Output if configured:**
```json
{
  "authenticated": true,
  "credentialsFound": true,
  "tokenFound": true,
  "expiresAt": "2025-11-07T12:34:56.789Z",
  "credentialsPath": "~/.credentials/google-drive-credentials.json",
  "tokenPath": "~/.credentials/google-drive-token.json"
}

✅ Google Drive authentication is configured
```

**Output if missing:**
```json
{
  "authenticated": false,
  "credentialsFound": false,
  "tokenFound": false,
  "message": "Google Drive OAuth credentials not found"
}
```

---

### Display Setup Instructions

```bash
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/google-drive-auth-helper.js setup
```

Displays complete setup instructions (same as above).

---

### Test Drive Access

```bash
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/google-drive-auth-helper.js test
```

Verifies OAuth token and Drive API access.

---

### Get User Info

```bash
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/google-drive-auth-helper.js whoami
```

**Output:**
```
Authenticated as:
  Name: Chris Acevedo
  Email: cnacevedo@gmail.com
  Photo: https://lh3.googleusercontent.com/...
```

---

### Revoke Access

```bash
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/google-drive-auth-helper.js revoke
```

Displays instructions to revoke access via Google Account settings.

---

## Security Best Practices

### DO ✅

- ✅ Use OAuth client credentials (client_secret_*.json)
- ✅ Store credentials in `~/.credentials/` directory
- ✅ Never commit credentials or tokens to git
- ✅ Use minimal scope: `drive.file` (only files created by this app)
- ✅ Revoke access when no longer needed
- ✅ Review granted permissions periodically

### DON'T ❌

- ❌ Use service account keys for personal use
- ❌ Share OAuth client credentials
- ❌ Commit credentials.json or token.json to repositories
- ❌ Request broader scopes than needed
- ❌ Leave old tokens active after project ends

---

## Token Management

### Automatic Refresh

OAuth tokens automatically refresh:
- Access tokens expire in ~1 hour
- Refresh tokens valid for ~7 days
- Automatically renewed when you use Project Connect
- No manual intervention needed

### Token Location

```bash
# OAuth client credentials (from Google Cloud Console)
~/.credentials/google-drive-credentials.json

# OAuth tokens (auto-generated after authentication)
~/.credentials/google-drive-token.json
```

### Manual Token Deletion

```bash
# Delete token to force re-authentication
rm ~/.credentials/google-drive-token.json

# Re-authenticate
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/google-drive-auth-helper.js authenticate
```

---

## Troubleshooting

### Credentials Not Found

**Problem**: `Google Drive OAuth credentials not found`

**Solution**:
```bash
# Check if credentials exist
ls -la ~/.credentials/google-drive-credentials.json

# If missing, download from Google Cloud Console
# (See "Step 4: Create OAuth Client ID" above)

# Move to correct location
mv ~/Downloads/client_secret_*.json ~/.credentials/google-drive-credentials.json
```

---

### OAuth Flow Not Completing

**Problem**: Browser opens but doesn't complete

**Solution**:
1. Check if popup blockers are enabled
2. Try a different browser
3. Verify OAuth consent screen is configured
4. Check application type is "Desktop app" not "Web application"

---

### Token Expired

**Problem**: `OAuth token expired. Please re-authenticate.`

**Solution**:
```bash
# Delete expired token
rm ~/.credentials/google-drive-token.json

# Re-authenticate
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/google-drive-auth-helper.js authenticate
```

---

### Permission Denied

**Problem**: `Access not configured` or permission errors

**Solution**:
1. Verify Google Drive API is enabled
2. Check OAuth consent screen is configured
3. Ensure you granted access during OAuth flow
4. Try revoking and re-authenticating

---

### Dependencies Missing

**Problem**: `Cannot find module 'googleapis'`

**Solution**:
```bash
cd /home/chris/Desktop/RevPal/Agents/opspal-internal-plugins
npm install googleapis @google-cloud/local-auth
```

---

## OAuth Scopes

### drive.file (Recommended - Used by Project Connect)

**Access**: Only files/folders created by this application

**Permissions**:
- ✅ Create folders
- ✅ Read/write files created by this app
- ❌ Cannot access other Drive files
- ❌ Cannot delete other user's files

**Best for**: Application-specific file storage (most secure)

### drive (Full Access - NOT Used)

**Access**: All files in user's Drive

**Permissions**:
- ✅ Read/write/delete any file
- ✅ Access shared files
- ❌ Too broad for Project Connect needs

**Note**: Project Connect intentionally uses `drive.file` for minimal access

---

## Migration from Service Accounts

If you previously used service accounts:

### Step 1: Identify Service Account Usage

```bash
# Check for service account key file
ls -la ~/.credentials/*service-account*.json

# Check environment variable
echo $GOOGLE_APPLICATION_CREDENTIALS
```

### Step 2: Switch to OAuth

**For each user:**
1. User creates OAuth client (see "First-Time Setup")
2. User runs authentication flow
3. Verify with: `node google-drive-auth-helper.js whoami`

### Step 3: Decommission Service Account (Optional)

Once all users have OAuth:
1. Go to Google Cloud Console → IAM & Admin → Service Accounts
2. Find the service account
3. Click "Delete"
4. Remove service account key files from local machines

---

## Comparison: OAuth vs Service Account

| Feature | OAuth (Project Connect) | Service Account |
|---------|-------------------------|-----------------|
| **Authentication** | Per-user, browser-based | Shared key file |
| **Audit Trail** | User's Google account | Service account email |
| **Token Expiry** | Auto-refresh (7 days) | Never expires |
| **Security** | Short-lived access tokens | Long-lived key file |
| **Revocation** | Per-user via Google Account | Delete shared key |
| **Setup** | One-time per user | One-time org-wide |
| **Scope** | User's Drive only | Depends on configuration |
| **Compliance** | Better (individual accountability) | Shared credentials risk |

---

## For Workspace Administrators

### Adding New Users

1. Share OAuth client setup instructions
2. Users create their own OAuth clients (recommended)
   - OR: Share organization OAuth client credentials
3. Users run authentication flow
4. Verify access: `node google-drive-auth-helper.js test`

### Organization OAuth Client (Optional)

**Option A**: Each user creates their own OAuth client
- ✅ Better isolation
- ✅ Independent token management
- ❌ More setup per user

**Option B**: Share organization OAuth client
- ✅ Easier setup
- ✅ Centralized management
- ❌ Shared client credentials

**Recommendation**: Option A (individual OAuth clients) for better security

### Audit Trails

All Drive operations logged in Supabase `revpal_access_log` table:

```sql
SELECT
  user_email,
  system_id as folder_id,
  action,
  date
FROM revpal_access_log
WHERE system = 'drive'
ORDER BY date DESC;
```

---

## Technical Implementation

### Authentication Flow

```javascript
const GoogleDriveAuthHelper = require('./lib/google-drive-auth-helper');

// 1. Check authentication
const driveAuth = new GoogleDriveAuthHelper();
const authStatus = driveAuth.checkAuthentication();

if (!authStatus.authenticated) {
  // 2. Display setup instructions
  driveAuth.displaySetupInstructions();

  // 3. Gracefully degrade (use manual mode)
  driveEnabled = false;
} else {
  // 4. Validate token (optional)
  const testResult = await driveAuth.testAccess();

  if (testResult.valid) {
    driveEnabled = true;
  }
}

// 5. Use Drive API only if enabled
if (driveEnabled) {
  // Create/connect Drive folders
}
```

---

### Graceful Degradation

Project Connect works even without OAuth:

- ✅ GitHub repository created/connected
- ✅ Supabase directory updated
- ✅ Asana project created/connected (if Asana auth configured)
- ⏭️ Drive folder skipped OR manual creation instructions

Users can add OAuth later:
1. Configure OAuth authentication
2. Run Project Connect again
3. Drive folder will be created/connected
4. Supabase directory updated with Drive URLs

---

## Future Enhancements

### Planned Features

1. **Service Account Support** - Optional service account mode for automation
2. **Shared Drive Support** - Create folders in Google Shared Drives
3. **Permission Management** - Automatically share folders with team
4. **Folder Templates** - Pre-defined folder structures

### Roadmap

- **Phase 1** (Complete): Per-user OAuth authentication ✅
- **Phase 2** (In Progress): Manual mode fallback
- **Phase 3** (Planned): Service account option for CI/CD
- **Phase 4** (Planned): Shared Drive integration

---

## Related Documentation

- [Project Connect Implementation](../PROJECT_CONNECT_IMPLEMENTATION_COMPLETE.md)
- [Asana Per-User Authentication](./ASANA_PER_USER_AUTHENTICATION.md)
- [Google Drive Manager](../scripts/lib/google-drive-manager.js)

---

## Support

### Questions?

Use `/reflect` to submit questions or feedback about Google Drive authentication.

### Issues?

Common issues and solutions available in [Troubleshooting](#troubleshooting) section above.

### Google OAuth Documentation

- Official docs: https://developers.google.com/drive/api/quickstart/nodejs
- OAuth consent screen: https://support.google.com/cloud/answer/10311615
- Scopes: https://developers.google.com/drive/api/guides/api-specific-auth

---

**Last Updated**: 2025-10-31
**Version**: 1.0.0
**Author**: RevPal Engineering
