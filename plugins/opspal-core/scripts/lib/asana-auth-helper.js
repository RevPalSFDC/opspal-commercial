#!/usr/bin/env node

/**
 * Asana Authentication Helper
 *
 * Checks for user's personal Asana access token and provides
 * setup instructions if missing.
 *
 * This enforces individual user authentication rather than
 * shared service accounts for better audit trails and security.
 */

class AsanaAuthHelper {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.workspaceId = options.workspaceId || process.env.ASANA_WORKSPACE_ID || 'REDACTED_ASANA_WORKSPACE';
  }

  /**
   * Check if user has Asana authentication configured
   *
   * @returns {Object} { authenticated: boolean, token?: string, message?: string }
   */
  checkAuthentication() {
    const token = process.env.ASANA_ACCESS_TOKEN;

    if (!token) {
      return {
        authenticated: false,
        message: 'ASANA_ACCESS_TOKEN not found in environment'
      };
    }

    if (token.length < 30) {
      return {
        authenticated: false,
        message: 'ASANA_ACCESS_TOKEN appears invalid (too short)'
      };
    }

    this.log('Asana authentication found', { tokenLength: token.length });

    return {
      authenticated: true,
      token,
      workspaceId: this.workspaceId
    };
  }

  /**
   * Display setup instructions for first-time users
   */
  displaySetupInstructions() {
    const instructions = `
╔════════════════════════════════════════════════════════════════════════════╗
║                   🔑 Asana Authentication Required                         ║
╚════════════════════════════════════════════════════════════════════════════╝

Project Connect needs your personal Asana access token to create and manage
projects on your behalf. This ensures proper audit trails and respects your
individual permissions.

📋 SETUP STEPS:

1. Open Asana Developer Console:
   👉 https://app.asana.com/0/my-apps

2. Click "Create new token"

3. Name your token:
   "RevPal Project Connect"

4. Copy the token (it will only be shown once!)

5. Set the environment variable:

   For current session:
   ┌────────────────────────────────────────────────────────────────┐
   │ export ASANA_ACCESS_TOKEN=your-token-here                      │
   └────────────────────────────────────────────────────────────────┘

   For permanent setup (add to ~/.bashrc or ~/.zshrc):
   ┌────────────────────────────────────────────────────────────────┐
   │ echo 'export ASANA_ACCESS_TOKEN=your-token-here' >> ~/.bashrc │
   │ source ~/.bashrc                                               │
   └────────────────────────────────────────────────────────────────┘

6. Verify the token is set:
   ┌────────────────────────────────────────────────────────────────┐
   │ echo $ASANA_ACCESS_TOKEN                                       │
   └────────────────────────────────────────────────────────────────┘

7. Run Project Connect again:
   ┌────────────────────────────────────────────────────────────────┐
   │ /project-connect                                               │
   └────────────────────────────────────────────────────────────────┘

🔒 SECURITY NOTES:
• Your token is personal - DO NOT share it with others
• DO NOT commit it to git repositories
• Rotate your token every 90 days for security
• Revoke unused tokens at https://app.asana.com/0/my-apps

📊 WORKSPACE:
• You'll be creating projects in workspace: ${this.workspaceId}
• Ensure you have project creation permissions in this workspace

❓ NEED HELP?
• Asana API docs: https://developers.asana.com/docs/personal-access-token
• RevPal support: Use /reflect to submit questions

────────────────────────────────────────────────────────────────────────────
`;

    console.log(instructions);
  }

  /**
   * Check authentication and display instructions if needed
   *
   * @param {boolean} throwOnMissing - Throw error if not authenticated
   * @returns {Object} Authentication status
   */
  requireAuthentication(throwOnMissing = true) {
    const authStatus = this.checkAuthentication();

    if (!authStatus.authenticated) {
      this.displaySetupInstructions();

      if (throwOnMissing) {
        throw new Error('Asana authentication required. Please follow the instructions above.');
      }
    }

    return authStatus;
  }

  /**
   * Test the token by attempting to list workspaces
   *
   * @returns {Promise<Object>} { valid: boolean, message?: string, workspaces?: Array }
   */
  async testToken() {
    const authStatus = this.checkAuthentication();

    if (!authStatus.authenticated) {
      return {
        valid: false,
        message: 'No token configured'
      };
    }

    try {
      // Test via MCP if available, otherwise via REST API
      const { execSync } = require('child_process');

      // Attempt to call Asana API
      const curlCmd = `curl -s -H "Authorization: Bearer ${authStatus.token}" https://app.asana.com/api/1.0/workspaces`;
      const response = execSync(curlCmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
      const data = JSON.parse(response);

      if (data.data && Array.isArray(data.data)) {
        this.log('Token validated successfully', { workspaceCount: data.data.length });

        // Check if the configured workspace ID is accessible
        const hasWorkspace = data.data.some(ws => ws.gid === this.workspaceId);

        if (!hasWorkspace) {
          return {
            valid: true,
            warning: `Token works but you don't have access to workspace ${this.workspaceId}`,
            workspaces: data.data
          };
        }

        return {
          valid: true,
          message: 'Token validated successfully',
          workspaces: data.data
        };
      }

      return {
        valid: false,
        message: 'Unexpected API response format'
      };

    } catch (error) {
      this.log('Token validation failed', error.message);

      return {
        valid: false,
        message: `Token validation failed: ${error.message}`
      };
    }
  }

  /**
   * Get user information from Asana
   *
   * @returns {Promise<Object>} User info
   */
  async getUserInfo() {
    const authStatus = this.checkAuthentication();

    if (!authStatus.authenticated) {
      throw new Error('Not authenticated');
    }

    try {
      const { execSync } = require('child_process');

      const curlCmd = `curl -s -H "Authorization: Bearer ${authStatus.token}" https://app.asana.com/api/1.0/users/me`;
      const response = execSync(curlCmd, { encoding: 'utf-8' });
      const data = JSON.parse(response);

      if (data.data) {
        return {
          gid: data.data.gid,
          name: data.data.name,
          email: data.data.email,
          workspaces: data.data.workspaces || []
        };
      }

      throw new Error('Could not retrieve user info');

    } catch (error) {
      throw new Error(`Failed to get user info: ${error.message}`);
    }
  }

  /**
   * Log message if verbose mode enabled
   *
   * @private
   */
  log(message, data = null) {
    if (this.verbose) {
      console.log(`[AsanaAuthHelper] ${message}`, data !== null ? data : '');
    }
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const helper = new AsanaAuthHelper({ verbose: true });

  (async () => {
    try {
      switch (command) {
        case 'check':
          const authStatus = helper.checkAuthentication();
          console.log(JSON.stringify(authStatus, null, 2));
          if (!authStatus.authenticated) {
            process.exit(1);
          }
          break;

        case 'setup':
          helper.displaySetupInstructions();
          break;

        case 'test':
          console.log('Testing Asana token...\n');
          const testResult = await helper.testToken();
          console.log(JSON.stringify(testResult, null, 2));
          if (!testResult.valid) {
            process.exit(1);
          }
          console.log('\n✅ Token is valid!');
          break;

        case 'whoami':
          console.log('Fetching user information...\n');
          const userInfo = await helper.getUserInfo();
          console.log('Authenticated as:');
          console.log(`  Name: ${userInfo.name}`);
          console.log(`  Email: ${userInfo.email}`);
          console.log(`  Asana GID: ${userInfo.gid}`);
          console.log(`  Workspaces: ${userInfo.workspaces.length}`);
          break;

        default:
          console.log(`
Asana Authentication Helper

Usage: node asana-auth-helper.js <command>

Commands:
  check      Check if ASANA_ACCESS_TOKEN is configured
  setup      Display setup instructions
  test       Test the token by calling Asana API
  whoami     Display current user information

Examples:
  node asana-auth-helper.js check
  node asana-auth-helper.js setup
  node asana-auth-helper.js test
  node asana-auth-helper.js whoami
          `);
          process.exit(0);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = AsanaAuthHelper;
