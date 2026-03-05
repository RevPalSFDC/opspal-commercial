#!/usr/bin/env node

/**
 * Google Drive Authentication Helper
 *
 * Checks for user's Google Drive OAuth setup and provides
 * setup instructions if missing.
 *
 * This enforces individual user authentication via OAuth
 * rather than service accounts for better security and audit trails.
 */

const fs = require('fs');
const path = require('path');

class GoogleDriveAuthHelper {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.credentialsPath = options.credentialsPath ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      path.join(process.env.HOME || process.env.USERPROFILE, '.credentials', 'google-drive-credentials.json');
    this.tokenPath = path.join(
      path.dirname(this.credentialsPath),
      'google-drive-token.json'
    );
  }

  /**
   * Check if user has Google Drive OAuth configured
   *
   * @returns {Object} { authenticated: boolean, credentialsFound?: boolean, tokenFound?: boolean, message?: string }
   */
  checkAuthentication() {
    const credentialsExist = fs.existsSync(this.credentialsPath);
    const tokenExists = fs.existsSync(this.tokenPath);

    if (!credentialsExist) {
      return {
        authenticated: false,
        credentialsFound: false,
        tokenFound: false,
        message: 'Google Drive OAuth credentials not found'
      };
    }

    if (!tokenExists) {
      return {
        authenticated: false,
        credentialsFound: true,
        tokenFound: false,
        message: 'Credentials found, but OAuth flow not completed. Run authentication.'
      };
    }

    // Check if token is valid (not expired)
    try {
      const tokenData = JSON.parse(fs.readFileSync(this.tokenPath, 'utf-8'));
      const expiryDate = new Date(tokenData.expiry_date);
      const now = new Date();

      if (expiryDate < now) {
        return {
          authenticated: false,
          credentialsFound: true,
          tokenFound: true,
          expired: true,
          message: 'OAuth token expired. Please re-authenticate.'
        };
      }

      this.log('Google Drive authentication found', {
        expiresIn: Math.round((expiryDate - now) / 1000 / 60 / 60) + ' hours'
      });

      return {
        authenticated: true,
        credentialsFound: true,
        tokenFound: true,
        expiresAt: expiryDate.toISOString(),
        credentialsPath: this.credentialsPath,
        tokenPath: this.tokenPath
      };
    } catch (error) {
      return {
        authenticated: false,
        credentialsFound: true,
        tokenFound: true,
        error: error.message,
        message: 'Token file corrupted. Please re-authenticate.'
      };
    }
  }

  /**
   * Display setup instructions for first-time users
   */
  displaySetupInstructions() {
    const instructions = `
╔════════════════════════════════════════════════════════════════════════════╗
║              🔑 Google Drive OAuth Authentication Required                 ║
╚════════════════════════════════════════════════════════════════════════════╝

Project Connect needs your personal Google Drive access to create and manage
folders on your behalf. This uses OAuth for secure, per-user authentication
with automatic token refresh.

📋 SETUP STEPS:

1. Create OAuth Credentials in Google Cloud Console:
   👉 https://console.cloud.google.com/apis/credentials

2. If you don't have a project:
   a. Click "CREATE PROJECT"
   b. Name it "RevPal Project Connect" or similar
   c. Click "CREATE"

3. Enable Google Drive API:
   👉 https://console.cloud.google.com/apis/library/drive.googleapis.com
   a. Select your project
   b. Click "ENABLE"

4. Create OAuth 2.0 Credentials:
   a. Go to: https://console.cloud.google.com/apis/credentials
   b. Click "CREATE CREDENTIALS" → "OAuth client ID"
   c. If prompted, configure consent screen:
      - User Type: External
      - App name: "RevPal Project Connect"
      - User support email: Your email
      - Developer contact: Your email
      - Click "SAVE AND CONTINUE" through all steps
   d. Application type: "Desktop app"
   e. Name: "RevPal Project Connect"
   f. Click "CREATE"

5. Download Credentials:
   a. Click the download icon (⬇) next to your OAuth client
   b. Save the file as: ${this.credentialsPath}

6. Create credentials directory if needed:
   ┌────────────────────────────────────────────────────────────────┐
   │ mkdir -p ${path.dirname(this.credentialsPath)}                 │
   └────────────────────────────────────────────────────────────────┘

7. Install required dependencies:
   ┌────────────────────────────────────────────────────────────────┐
   │ npm install googleapis @google-cloud/local-auth                │
   └────────────────────────────────────────────────────────────────┘

8. Run authentication (will open browser):
   ┌────────────────────────────────────────────────────────────────┐
   │ node .claude-plugins/opspal-core/scripts/lib/\\      │
   │   google-drive-auth-helper.js authenticate                     │
   └────────────────────────────────────────────────────────────────┘

9. In the browser:
   a. Select your Google account
   b. Click "Allow" to grant Drive access
   c. You can close the browser tab after success

10. Verify authentication:
    ┌────────────────────────────────────────────────────────────────┐
    │ node .claude-plugins/opspal-core/scripts/lib/\\      │
    │   google-drive-auth-helper.js check                            │
    └────────────────────────────────────────────────────────────────┘

🔒 SECURITY NOTES:
• Your OAuth token is personal - DO NOT share it with others
• Tokens are stored locally in: ${this.tokenPath}
• Tokens automatically refresh (valid for ~7 days, auto-renewed)
• Revoke access anytime at: https://myaccount.google.com/permissions
• Never commit credentials.json or token.json to git

📊 PERMISSIONS GRANTED:
• Read and create folders in your Google Drive
• Scopes: https://www.googleapis.com/auth/drive.file
• Can only access files/folders created by this app (safest scope)

❓ ALTERNATIVE: Manual Mode
If you prefer not to set up OAuth, you can use manual mode:
• Project Connect will provide folder creation instructions
• You create folders manually in Drive
• You provide the folder ID when prompted
• Workflow continues without API access

To use manual mode: Set --drive-mode=manual when running Project Connect

❓ NEED HELP?
• Google OAuth docs: https://developers.google.com/drive/api/quickstart/nodejs
• RevPal support: Use /reflect to submit questions

────────────────────────────────────────────────────────────────────────────
`;

    console.log(instructions);
  }

  /**
   * Run OAuth authentication flow
   *
   * @returns {Promise<Object>} { success: boolean, message?: string, error?: string }
   */
  async authenticate() {
    try {
      // Check if credentials exist
      if (!fs.existsSync(this.credentialsPath)) {
        return {
          success: false,
          error: 'Credentials file not found',
          message: `Please download OAuth credentials and save to: ${this.credentialsPath}`
        };
      }

      // Load dependencies
      const { google } = require('googleapis');
      const { authenticate } = require('@google-cloud/local-auth');

      console.log('🔐 Starting OAuth authentication flow...');
      console.log('   A browser window will open for you to sign in.\n');

      // Define scopes - drive.file is most restrictive (only files created by this app)
      const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

      // Run OAuth flow (opens browser)
      const auth = await authenticate({
        keyfilePath: this.credentialsPath,
        scopes: SCOPES,
      });

      // Save token for future use
      const credentials = auth.credentials;
      const tokenDir = path.dirname(this.tokenPath);

      // Create directory if it doesn't exist
      if (!fs.existsSync(tokenDir)) {
        fs.mkdirSync(tokenDir, { recursive: true });
      }

      fs.writeFileSync(this.tokenPath, JSON.stringify(credentials, null, 2));

      console.log('\n✅ Authentication successful!');
      console.log(`   Token saved to: ${this.tokenPath}`);
      console.log(`   Expires: ${new Date(credentials.expiry_date).toISOString()}`);
      console.log('\n💡 Token will automatically refresh when needed.');

      return {
        success: true,
        message: 'Authentication successful',
        tokenPath: this.tokenPath,
        expiresAt: new Date(credentials.expiry_date).toISOString()
      };

    } catch (error) {
      console.error('\n❌ Authentication failed:', error.message);

      return {
        success: false,
        error: error.message,
        message: 'Authentication failed - see error above'
      };
    }
  }

  /**
   * Test Google Drive API access
   *
   * @returns {Promise<Object>} { valid: boolean, message?: string, error?: string }
   */
  async testAccess() {
    const authStatus = this.checkAuthentication();

    if (!authStatus.authenticated) {
      return {
        valid: false,
        message: authStatus.message
      };
    }

    try {
      // Load dependencies
      const { google } = require('googleapis');
      const fs = require('fs');

      // Load token
      const tokenData = JSON.parse(fs.readFileSync(this.tokenPath, 'utf-8'));

      // Create auth client
      const credentialsData = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf-8'));
      const { client_id, client_secret } = credentialsData.installed || credentialsData.web;

      const oauth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        'http://localhost'
      );

      oauth2Client.setCredentials(tokenData);

      // Create Drive client
      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      // Test by getting user's Drive info
      const response = await drive.about.get({
        fields: 'user,storageQuota'
      });

      const user = response.data.user;
      const quota = response.data.storageQuota;

      this.log('Drive access test successful', {
        user: user.emailAddress,
        displayName: user.displayName
      });

      return {
        valid: true,
        message: 'Drive access verified successfully',
        user: {
          email: user.emailAddress,
          name: user.displayName,
          photoLink: user.photoLink
        },
        storage: {
          limit: quota.limit ? parseInt(quota.limit) / (1024 * 1024 * 1024) + ' GB' : 'Unlimited',
          usage: quota.usage ? parseInt(quota.usage) / (1024 * 1024 * 1024) + ' GB' : '0 GB'
        }
      };

    } catch (error) {
      this.log('Drive access test failed', error.message);

      return {
        valid: false,
        error: error.message,
        message: `Access test failed: ${error.message}`
      };
    }
  }

  /**
   * Get user information
   *
   * @returns {Promise<Object>} User info
   */
  async getUserInfo() {
    const testResult = await this.testAccess();

    if (!testResult.valid) {
      throw new Error(testResult.message || 'Not authenticated');
    }

    return testResult.user;
  }

  /**
   * Revoke OAuth access (requires manual step)
   */
  displayRevokeInstructions() {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║              Revoke Google Drive Access                        ║
╚════════════════════════════════════════════════════════════════╝

To revoke access for RevPal Project Connect:

1. Go to: https://myaccount.google.com/permissions

2. Find "RevPal Project Connect" in the list

3. Click on it

4. Click "Remove Access"

5. Delete local token (optional):
   ┌────────────────────────────────────────────────────────┐
   │ rm ${this.tokenPath}                                   │
   └────────────────────────────────────────────────────────┘

Access is now revoked. You can re-authenticate anytime by running:
   node google-drive-auth-helper.js authenticate
`);
  }

  /**
   * Log message if verbose mode enabled
   *
   * @private
   */
  log(message, data = null) {
    if (this.verbose) {
      console.log(`[GoogleDriveAuthHelper] ${message}`, data !== null ? data : '');
    }
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const helper = new GoogleDriveAuthHelper({ verbose: true });

  (async () => {
    try {
      switch (command) {
        case 'check':
          const authStatus = helper.checkAuthentication();
          console.log(JSON.stringify(authStatus, null, 2));
          if (!authStatus.authenticated) {
            process.exit(1);
          }
          console.log('\n✅ Google Drive authentication is configured');
          break;

        case 'setup':
          helper.displaySetupInstructions();
          break;

        case 'authenticate':
        case 'auth':
          const authResult = await helper.authenticate();
          if (!authResult.success) {
            process.exit(1);
          }
          break;

        case 'test':
          console.log('Testing Google Drive access...\n');
          const testResult = await helper.testAccess();
          console.log(JSON.stringify(testResult, null, 2));
          if (!testResult.valid) {
            process.exit(1);
          }
          console.log('\n✅ Drive access is valid!');
          break;

        case 'whoami':
          console.log('Fetching user information...\n');
          const userInfo = await helper.getUserInfo();
          console.log('Authenticated as:');
          console.log(`  Name: ${userInfo.name}`);
          console.log(`  Email: ${userInfo.email}`);
          if (userInfo.photoLink) {
            console.log(`  Photo: ${userInfo.photoLink}`);
          }
          break;

        case 'revoke':
          helper.displayRevokeInstructions();
          break;

        default:
          console.log(`
Google Drive Authentication Helper

Usage: node google-drive-auth-helper.js <command>

Commands:
  check         Check if Google Drive OAuth is configured
  setup         Display setup instructions
  authenticate  Run OAuth flow (opens browser)
  test          Test Drive API access
  whoami        Display current user information
  revoke        Display instructions to revoke access

Examples:
  node google-drive-auth-helper.js check
  node google-drive-auth-helper.js setup
  node google-drive-auth-helper.js authenticate
  node google-drive-auth-helper.js test
  node google-drive-auth-helper.js whoami
  node google-drive-auth-helper.js revoke
          `);
          process.exit(0);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = GoogleDriveAuthHelper;
