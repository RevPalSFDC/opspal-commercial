# HubSpot Multi-Environment Access Solution

## Problem Summary
You were struggling to connect to new HubSpot instances because:
1. The MCP server was using outdated API key authentication
2. No easy way to switch between different HubSpot environments
3. The Personal Access Token (PAT) wasn't being utilized properly

## Solution Overview

### 1. Modern Authentication with HubSpot MCP Server
The official HubSpot MCP server (v7.6.0+) supports Personal Access Tokens (PATs) which are the recommended authentication method.

### 2. Enhanced Environment Manager
Created `scripts/hubspot-environment-manager.js` that provides:
- Easy switching between HubSpot environments
- Automatic MCP server configuration
- Environment variable management
- Support for multiple authentication methods

## Quick Start Guide

### Step 1: Initial Setup
```bash
# Install/update HubSpot CLI to latest version
npm install -g @hubspot/cli@latest

# Setup HubSpot MCP server
hs mcp setup
# Select your client (Claude Code)
# Restart Claude Code after setup
```

### Step 2: Configure Your Environments

#### Option A: Interactive Wizard
```bash
node scripts/hubspot-environment-manager.js wizard
```

#### Option B: Manual Configuration
1. Edit `ClaudeHubSpot/portals/config.json`
2. Add your Personal Access Token for each environment
3. Run configuration update:
```bash
node scripts/hubspot-environment-manager.js configure
```

### Step 3: Switch Between Environments
```bash
# View current status
node scripts/hubspot-environment-manager.js status

# Switch to production
node scripts/hubspot-environment-manager.js switch production

# Switch to sandbox
node scripts/hubspot-environment-manager.js switch sandbox

# Switch to staging  
node scripts/hubspot-environment-manager.js switch staging
```

## Authentication Methods

### Personal Access Token (Recommended)
1. Go to HubSpot > Settings > Integrations > Private Apps
2. Create a new private app or use existing
3. Copy the Personal Access Token
4. Add to your portal configuration:
```json
{
  "accessToken": "pat-na1-xxxxx-xxxxx",
  "authType": "private_app"
}
```

### OAuth 2.0 (For Production Apps)
For apps that need user authorization:
1. Register your app in HubSpot
2. Implement OAuth flow
3. Store refresh tokens securely

## Environment Configuration Structure

Each environment in `portals/config.json` should have:
```json
{
  "name": "Friendly Environment Name",
  "portalId": "12345678",
  "accessToken": "pat-na1-xxxxx",
  "authType": "private_app",
  "environment": "production|sandbox|staging",
  "features": {
    "marketing": true,
    "sales": true,
    "service": true,
    "cms": false,
    "operations": true
  },
  "settings": {
    "rateLimitRetry": true,
    "maxRetries": 3,
    "logLevel": "info"
  }
}
```

## MCP Server Configuration

The MCP server configuration is automatically updated when you switch environments. It creates:
- A main `hubspot` server for the active environment
- Additional `hubspot-{env}` servers for quick switching
- Proper environment variable references

## Environment Variables

The following variables are automatically managed:
- `HUBSPOT_ACCESS_TOKEN` - Active environment's token
- `HUBSPOT_PORTAL_ID` - Active environment's portal ID
- `HUBSPOT_ACTIVE_ENVIRONMENT` - Current environment name
- `HUBSPOT_ACCESS_TOKEN_{ENV}` - Token for each environment
- `HUBSPOT_PORTAL_ID_{ENV}` - Portal ID for each environment

## Best Practices

### 1. Security
- Never commit access tokens to git
- Use `.env` files (gitignored) for credentials
- Rotate tokens regularly
- Use least-privilege scopes

### 2. Environment Isolation
- Always test in sandbox first
- Use descriptive environment names
- Document environment-specific configurations
- Maintain separate rate limits per environment

### 3. Development Workflow
```bash
# 1. Start with sandbox
node scripts/hubspot-environment-manager.js switch sandbox

# 2. Develop and test your changes
# ... development work ...

# 3. Switch to staging for validation
node scripts/hubspot-environment-manager.js switch staging

# 4. Finally deploy to production
node scripts/hubspot-environment-manager.js switch production
```

## Troubleshooting

### MCP Server Not Responding
1. Restart Claude Code
2. Check MCP server status: `claude mcp list`
3. Verify credentials: `node scripts/hubspot-environment-manager.js status`

### Authentication Failures
1. Verify Personal Access Token is valid
2. Check token has required scopes
3. Ensure portal ID matches the token's portal

### Rate Limiting Issues
1. Check current limits in portal settings
2. Implement exponential backoff
3. Use batch APIs where available

## Advanced Features

### Custom MCP Commands
The HubSpot MCP server provides commands like:
- Search documentation
- Create projects
- Add app features
- Validate configurations
- Deploy to HubSpot

### Integration with CI/CD
```yaml
# Example GitHub Actions workflow
- name: Setup HubSpot Environment
  run: |
    npm install
    node scripts/hubspot-environment-manager.js switch ${{ env.ENVIRONMENT }}
    npm run deploy:hubspot
```

## Next Steps

1. **Configure all environments** with proper credentials
2. **Test the setup** with a simple API call
3. **Document** environment-specific settings
4. **Train team** on environment switching
5. **Set up monitoring** for each environment

## Support Resources

- [HubSpot MCP Server Docs](https://developers.hubspot.com/docs/developer-tooling/local-development/mcp-server)
- [HubSpot CLI Documentation](https://developers.hubspot.com/docs/developer-tooling/local-development/hubspot-cli)
- [Personal Access Tokens Guide](https://developers.hubspot.com/docs/api/private-apps)
- [HubSpot API Reference](https://developers.hubspot.com/docs/api/overview)

---

*This solution enables seamless switching between HubSpot environments while maintaining security and isolation.*