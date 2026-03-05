# Playwright MCP Setup and Configuration

## Purpose

Set up and configure the Playwright MCP server for browser automation with AI agents. This runbook covers installation, verification, browser setup, and troubleshooting.

## Prerequisites

- [ ] Node.js 18+ installed
- [ ] npm or npx available
- [ ] Claude Code with MCP support
- [ ] Network access to download browsers

## Procedure

### 1. Verify MCP Server Registration

**Check `.mcp.json` configuration:**

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-playwright@latest"],
      "env": {
        "PLAYWRIGHT_BROWSERS_PATH": "${PLAYWRIGHT_BROWSERS_PATH}"
      }
    }
  }
}
```

**Expected Result:** Playwright server appears in MCP server list.

### 2. Install Browser Dependencies

**Run browser installation:**

```bash
# Using Playwright MCP's install tool
# The agent will call: mcp__playwright__browser_install

# Or manually via npx:
npx playwright install chromium
```

**Expected Result:** Chromium browser downloaded to `~/.cache/ms-playwright/` or `$PLAYWRIGHT_BROWSERS_PATH`.

### 3. Verify MCP Tools Available

**Check available tools in Claude Code:**

The following tools should be available:
- `mcp__playwright__browser_navigate` - Navigate to URLs
- `mcp__playwright__browser_snapshot` - Take accessibility snapshots
- `mcp__playwright__browser_click` - Click elements
- `mcp__playwright__browser_fill` - Fill form fields
- `mcp__playwright__browser_type` - Type text
- `mcp__playwright__browser_take_screenshot` - Capture screenshots
- `mcp__playwright__browser_save_as_pdf` - Generate PDFs
- `mcp__playwright__browser_wait` - Wait for conditions
- `mcp__playwright__browser_tab_*` - Tab management
- `mcp__playwright__browser_console_messages` - Get console logs

### 4. Test Basic Navigation

**Simple test:**

```
Navigate to https://example.com and take a snapshot
```

**Expected Result:**
- Browser opens (headless by default)
- Navigation completes
- Accessibility snapshot returned with page structure

### 5. Configure Environment Variables

**Optional environment variables:**

```bash
# Custom browser storage location
export PLAYWRIGHT_BROWSERS_PATH=/custom/path/browsers

# Enable headed mode for debugging
export PLAYWRIGHT_HEADLESS=false

# Set default timeout (ms)
export PLAYWRIGHT_TIMEOUT=30000
```

### 6. Session Persistence Setup

**For authenticated sessions (Salesforce/HubSpot):**

1. First authentication must be headed (manual login)
2. Session state saved to `instances/{name}/.browser-session.json`
3. Subsequent runs use saved state (headless)

**Directory structure:**
```
instances/
├── my-salesforce-org/
│   ├── .salesforce-session.json
│   └── screenshots/
└── my-hubspot-portal/
    ├── .hubspot-session.json
    └── screenshots/
```

## Validation

### Successful Setup Indicators

- [ ] MCP server starts without errors
- [ ] Browser installation completes
- [ ] Navigation test returns snapshot
- [ ] Screenshots save successfully
- [ ] Console logs accessible

### Test Commands

```bash
# Check helper library
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/playwright-mcp-helper.js help

# Verify session status
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/playwright-mcp-helper.js check-session myorg salesforce
```

## Troubleshooting

### Issue: MCP Server Not Starting

**Symptoms:**
- "MCP server not found" error
- Tools not available

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Package not installed | Run `npx @anthropic-ai/mcp-playwright@latest` manually |
| Network blocked | Check firewall/proxy settings |
| Wrong Node version | Upgrade to Node.js 18+ |
| Cache corrupted | Clear npm cache: `npm cache clean --force` |

### Issue: Browser Not Found

**Symptoms:**
- "Executable doesn't exist" error
- Browser launch fails

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Browsers not installed | Run `npx playwright install chromium` |
| Wrong path | Set `PLAYWRIGHT_BROWSERS_PATH` correctly |
| Permissions | Check directory permissions |
| Disk space | Free up disk space (browsers need ~300MB) |

### Issue: Screenshot Fails

**Symptoms:**
- Screenshot command returns error
- Empty or corrupted images

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| No page loaded | Navigate first, then screenshot |
| Directory doesn't exist | Use `ScreenshotManager.ensureDir()` |
| Permissions | Check write permissions |
| Page still loading | Add wait before screenshot |

### Issue: Session Expires

**Symptoms:**
- "Session invalid" or "Login required"
- Authentication prompts mid-workflow

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Session file too old | Re-authenticate (headed mode) |
| Token expired | Clear session, re-login |
| Platform changes | Update session management |

### Issue: Timeout Errors

**Symptoms:**
- "Timeout waiting for..." errors
- Operations hang

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Slow network | Increase timeout via `PLAYWRIGHT_TIMEOUT` |
| Wrong selector | Use accessibility snapshot to find correct element |
| Page not loading | Check network connectivity |
| Infinite loading | Add explicit waits for specific elements |

## Rollback

### Disable Playwright MCP

1. Remove playwright entry from `.mcp.json`
2. Restart Claude Code
3. Fallback to direct Playwright scripts if needed

### Revert to Direct Playwright

```bash
# Use existing scraper scripts
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/scrape-sf-connected-apps.js
```

## Related Resources

- [Page Navigation and Snapshots](./page-navigation-and-snapshots.md)
- [Authentication Patterns](./authentication-patterns.md)
- [Playwright MCP Helper Library](../../scripts/lib/playwright-mcp-helper.js)
- [Playwright MCP Documentation](https://github.com/anthropics/mcp-playwright)

---

**Version**: 1.0.0
**Created**: 2025-12-03
**Author**: RevPal Engineering
