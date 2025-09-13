# HubSpot CLI MCP Setup Guide

## Yes, `hs mcp setup` Works! ✅

The HubSpot CLI v7.6.1 is now installed and the `hs mcp setup` command is available. However, it requires authentication first.

## Complete Setup Process

### Step 1: Authenticate HubSpot CLI

You need to authenticate the CLI with your HubSpot account first:

```bash
cd ClaudeHubSpot
hs init
```

When prompted:
1. Choose "Enter existing personal access key" 
2. Enter your Filmhub Personal Access Token
3. Give it a name like "filmhub-production"

**To get a Personal Access Token:**
1. Log into Filmhub HubSpot (Portal ID: 39560118)
2. Go to Settings → Integrations → Private Apps
3. Create a new private app (or use existing)
4. Copy the Personal Access Token

### Step 2: Run MCP Setup

Once authenticated, run the MCP setup:

```bash
hs mcp setup --client claude
```

This will:
- Install the HubSpot MCP server
- Configure it for Claude Code
- Set up the necessary connections

### Step 3: Restart Claude Code

After setup completes, restart Claude Code to load the new MCP server.

## Alternative: Manual MCP Configuration

If you prefer not to use `hs mcp setup`, the configuration I created earlier will also work:

1. Add credentials to `.env`:
   ```bash
   HUBSPOT_ACCESS_TOKEN_FILMHUB=your-pat-token
   HUBSPOT_PORTAL_ID_FILMHUB=39560118
   ```

2. The `.mcp.json` is already configured with:
   - `hubspot` - Main MCP server
   - `hubspot-filmhub` - Dedicated Filmhub server

3. Restart Claude Code

## Comparison: Official vs Manual Setup

### Official `hs mcp setup`:
✅ Pros:
- Officially supported by HubSpot
- Automatic updates
- Integrated with HubSpot CLI
- Better error handling

❌ Cons:
- Requires HubSpot CLI authentication
- Single account at a time
- Less flexibility for multiple environments

### Manual Configuration (what we created):
✅ Pros:
- Multiple environment support
- Easy switching between portals
- Environment variable based
- No CLI authentication needed

❌ Cons:
- Manual maintenance
- Custom scripts needed

## Recommended Approach

For Filmhub specifically:

1. **Use the official `hs mcp setup`** for primary development:
   ```bash
   cd ClaudeHubSpot
   hs init  # Authenticate with Filmhub PAT
   hs mcp setup --client claude
   ```

2. **Keep the manual configuration** for multi-environment support:
   - Use environment variables for quick switching
   - Keep the helper scripts for testing

## Quick Commands Reference

```bash
# Check HubSpot CLI version
hs --version  # Should be 7.6.0 or higher

# Authenticate CLI
hs init

# Setup MCP for Claude
hs mcp setup --client claude

# List authenticated accounts
hs accounts list

# Switch accounts (if multiple)
hs accounts use <accountName>

# Test connection
hs project list
```

## Troubleshooting

### "Account not found" error
- Run `hs init` first to authenticate

### "Permission denied" errors
- Ensure your PAT has necessary scopes
- Check token hasn't expired

### MCP tools still not working
- Verify authentication: `hs accounts list`
- Restart Claude Code after setup
- Check `.mcp.json` has the HubSpot server enabled

## Next Steps

1. Authenticate HubSpot CLI with `hs init`
2. Run `hs mcp setup --client claude`
3. Restart Claude Code
4. Test with MCP tools

The official `hs mcp setup` is the recommended approach by HubSpot for setting up their MCP server with Claude Code.