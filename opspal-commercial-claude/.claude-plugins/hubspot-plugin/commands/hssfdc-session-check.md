---
description: Test HubSpot session health and integrations page access
---

Test HubSpot browser session health for a portal. Validates both file age and actual integrations page access.

**Usage:**
```bash
/hssfdc-session-check [portal-name] [--deep]
```

**What it checks:**
1. **Basic validation**: Session file age (<24 hours)
2. **Deep validation** (with --deep flag):
   - Launches headless browser with saved session
   - Tests actual integrations page access
   - Verifies authentication status
   - Checks for permission issues

**Arguments:**
- `portal-name` - Portal to check (e.g., `example-company`, `demo-company`, `acme-corp`)
  - If omitted, uses `$HUBSPOT_ACTIVE_PORTAL`
- `--deep` - Perform deep validation (test actual page access)

**Examples:**
```bash
/hssfdc-session-check example-company
/hssfdc-session-check example-company --deep
/hssfdc-session-check --deep  # uses active portal
```

**Output statuses:**

**✅ Session valid**
- File age < 20 hours
- (Deep mode) Integrations page accessible

**⚠️  Session expiring soon**
- File age 20-24 hours
- Still functional but may expire soon

**❌ Session expired**
- File age > 24 hours
- (Deep mode) Redirected to login page
- (Deep mode) Access denied (HTTP 403/401)

**Use cases:**
- Debug scraper authentication issues
- Verify session before long-running scrapes
- Check if re-authentication is needed
- Troubleshoot "connector not found" errors

**Performance:**
- Basic check: <100ms
- Deep check: ~5-10 seconds (launches browser)

**Requirements:**
- Session file exists: `instances/{portal}/.hubspot-session.json`
- (Deep mode) Playwright installed with browsers
- (Deep mode) Portal configured in `portals/config.json`
