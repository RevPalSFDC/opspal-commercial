---
description: Scrape HubSpot Salesforce connector settings (not available via API)
---

Scrape Salesforce sync settings for the specified portal using browser automation.

**Usage:**
```bash
/hssfdc-scrape [portal-name]
```

**What it does:**
1. Uses saved browser session for the portal
2. Navigates to HubSpot Salesforce connector
3. Extracts sync settings, inclusion list, and field mappings
4. Exports field mappings CSV
5. Saves complete snapshot to `instances/{portal}/sfdc-sync-snapshot.json`

**First-time setup (per portal):**
If you haven't authenticated yet, run:
```bash
HEAD=1 PORTAL={{portal-name}} node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/scrape-sfdc-sync-settings.js
```
This opens a browser for manual login (including MFA/SSO).

**Arguments:**
- `portal-name` - Portal to scrape (e.g., `example-company`, `demo-company`, `acme-corp`)
  - If omitted, uses `$HUBSPOT_ACTIVE_PORTAL`

**Examples:**
```bash
/hssfdc-scrape example-company
/hssfdc-scrape acme-corp
/hssfdc-scrape  # uses active portal
```

**Output files:**
- `instances/{portal}/sfdc-sync-snapshot.json` - Complete settings snapshot
- `instances/{portal}/sfdc-mappings-{timestamp}.csv` - Field mappings export

**Requirements:**
- HubSpot Super Admin or Integration Admin permissions
- Salesforce connector installed in portal
- Portal configured in `portals/config.json`
- Set `OPSPAL_INTERNAL_ROOT` (or `HUBSPOT_SFDC_SCRAPER_PATH`) if the scraper lives outside this repo

**Common issues:**

1. **"No saved session found"**
   - Run authentication setup: `HEAD=1 PORTAL={portal} node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/scrape-sfdc-sync-settings.js`

2. **"Salesforce connector not found"**
   - Ensure Salesforce app is installed in HubSpot portal
   - Check you have Integration permissions

3. **Session expired**
   - Re-run authentication setup to refresh session

**Integration:**
After scraping, use the `sfdc-hubspot-bridge` agent to configure sync:
```bash
Task: sfdc-hubspot-bridge
Prompt: "Configure sync for {portal} using scraped settings"
```
