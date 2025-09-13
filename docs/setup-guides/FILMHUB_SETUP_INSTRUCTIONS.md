# Filmhub HubSpot Instance Setup Instructions

## Issue Resolution

The MCP server wasn't working because it lacked the proper API credentials for the Filmhub instance (Portal ID: 39560118).

## Configuration Complete ✅

I've configured the system to support the Filmhub HubSpot instance. Here's what was set up:

### 1. Portal Configuration
- Added Filmhub to `ClaudeHubSpot/portals/config.json`
- Portal ID: 39560118
- Environment name: `filmhub`

### 2. MCP Server Configuration
- Updated `.mcp.json` with Filmhub-specific MCP server
- Created `hubspot-filmhub` server instance
- Configured environment variable fallbacks

### 3. Helper Scripts Created
- `scripts/switch-to-filmhub.sh` - Quick switch to Filmhub instance
- `scripts/test-filmhub-connection.js` - Test API connectivity
- `scripts/configure-filmhub-instance.js` - Full configuration script

## 🚨 Required Action: Add API Credentials

The MCP server **requires API credentials** to function. You need to add one of the following to your `.env` file:

### Option A: API Key (Quick Setup)
```bash
HUBSPOT_API_KEY_FILMHUB=your-filmhub-api-key-here
HUBSPOT_PORTAL_ID_FILMHUB=39560118
```

### Option B: Personal Access Token (Recommended)
```bash
HUBSPOT_ACCESS_TOKEN_FILMHUB=pat-na1-xxxxx-xxxxx
HUBSPOT_PORTAL_ID_FILMHUB=39560118
```

## How to Get API Credentials

### For API Key:
1. Log into Filmhub HubSpot account
2. Go to Settings → Integrations → API Key
3. Copy the API key

### For Personal Access Token (Better):
1. Log into Filmhub HubSpot account
2. Go to Settings → Integrations → Private Apps
3. Create a new private app or use existing
4. Copy the Personal Access Token

## Activation Steps

1. **Add credentials to `.env`:**
   ```bash
   echo "HUBSPOT_API_KEY_FILMHUB=your-api-key" >> .env
   echo "HUBSPOT_PORTAL_ID_FILMHUB=39560118" >> .env
   ```

2. **Load environment variables:**
   ```bash
   source .env
   ```

3. **Switch to Filmhub:**
   ```bash
   ./scripts/switch-to-filmhub.sh
   ```

4. **Test the connection:**
   ```bash
   node scripts/test-filmhub-connection.js
   ```

5. **Restart Claude Code** to apply MCP changes

## Quick Commands

| Command | Purpose |
|---------|---------|
| `./scripts/switch-to-filmhub.sh` | Activate Filmhub instance |
| `node scripts/test-filmhub-connection.js` | Test API connection |
| `node scripts/hubspot-environment-manager.js status` | View all environments |

## Troubleshooting

### "Client initialization error"
- **Cause**: Missing API credentials
- **Fix**: Add `HUBSPOT_API_KEY_FILMHUB` to `.env`

### "Authentication failed"
- **Cause**: Invalid API key or token
- **Fix**: Verify credentials in HubSpot portal settings

### MCP tools not working
- **Cause**: Claude Code needs restart after configuration
- **Fix**: Restart Claude Code application

## Environment Variables Reference

The system now recognizes these Filmhub-specific variables:
- `HUBSPOT_API_KEY_FILMHUB` - API key for Filmhub portal
- `HUBSPOT_ACCESS_TOKEN_FILMHUB` - Personal Access Token (if using PAT)
- `HUBSPOT_PORTAL_ID_FILMHUB` - Portal ID (39560118)

## Next Steps

1. **Add your API credentials** (most important!)
2. Test the connection
3. The MCP server will then be able to:
   - Access Filmhub contacts, companies, deals
   - Create and manage workflows
   - Pull analytics and reports
   - Perform all HubSpot API operations

---

**Note**: Without valid API credentials, the MCP server cannot connect to HubSpot. This is why you're seeing initialization errors. Once you add the credentials and restart Claude Code, the MCP tools will work properly.