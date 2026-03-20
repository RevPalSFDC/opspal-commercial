---
name: hubspot-sfdc-sync-scraper
description: "Use PROACTIVELY for SF sync analysis."
color: orange
tools:
  - Bash
  - Read
  - Write
  - Task
  - mcp__playwright__browser_navigate
  - mcp__playwright__browser_snapshot
  - mcp__playwright__browser_click
  - mcp__playwright__browser_fill
  - mcp__playwright__browser_take_screenshot
  - mcp__playwright__browser_save_as_pdf
  - mcp__playwright__browser_wait
  - mcp__playwright__browser_tab_list
  - mcp__playwright__browser_tab_new
  - mcp__playwright__browser_tab_select
  - mcp__playwright__browser_console_messages
triggerKeywords:
  - sync
  - sf
  - hubspot
  - sfdc
  - automation
  - salesforce
  - scraper
  - api
  - connect
model: haiku
---

# Shared Script Libraries
@import agents/shared/library-reference.yaml


# HubSpot SFDC Sync Scraper Agent

Automates extraction of HubSpot ↔ Salesforce sync configuration that is **not exposed via HubSpot API**.

## Core Capabilities

### Browser Automation Scraping
- **sync_settings_extraction**: Bidirectional sync direction, Conflict resolution rules, Create/delete permissions, Campaign sync toggles, Object-level sync configuration
- **inclusion_list_discovery**: Active inclusion list name, Filter logic and criteria, List membership rules, Contact qualification rules
- **field_mapping_export**: Complete field mappings CSV, Custom property mappings, Object relationship mappings, Data type conversions, Calculated fields
- **sync_health_monitoring**: Last sync timestamp, Error counts and types, Failed record details, Sync performance metrics

### Authentication & Session Management
- **initial_auth**: One-time headed browser setup, Manual login with MFA/SSO, Session state persistence, 24-hour token validity
- **session_reuse**: Headless automated scraping, Storage state restoration, Automatic re-auth on expiry

### Data Output
- **structured_json**: Complete sync configuration, Timestamped snapshots, Portal-specific settings, Machine-readable format
- **csv_export**: Official HubSpot field mappings, All sync mappings preserved, Import-ready format

## Usage Patterns

### One-Time Authentication Setup
```bash
# Run headed browser for manual login
HEAD=1 PORTAL=example-company node scripts/scrape-sfdc-sync-settings.js
```

**Process:**
1. Browser opens to HubSpot login
2. User logs in manually
3. Completes MFA/SSO
4. Presses Enter when ready
5. Session saved to `instances/{portal}/.hubspot-session.json`

### Automated Scraping (Headless)
```bash
# Use saved session
PORTAL=example-company node scripts/scrape-sfdc-sync-settings.js
```

**Process:**
1. Loads session from storage state
2. Navigates to Salesforce connector
3. Extracts all sync settings
4. Exports field mappings CSV
5. Saves snapshot JSON

### Integration with Bridge Agent
The scraped data feeds directly into `sfdc-hubspot-bridge` agent:

```bash
# 1. Scrape settings
Task: hubspot-sfdc-sync-scraper
Prompt: "Scrape Salesforce sync settings for example-company"

# 2. Configure bridge
Task: sfdc-hubspot-bridge
Prompt: "Configure sync using scraped example-company settings"
```

## Outputs

### Snapshot JSON (`instances/{portal}/sfdc-sync-snapshot.json`)
```json
{
  "scrapedAt": "2025-10-05T14:23:15.000Z",
  "portalId": "12345678",
  "portalName": "example-company Production",
  "syncSettings": {
    "contactDirection": "bidirectional",
    "companyDirection": "hubspot-to-salesforce",
    "dealDirection": "bidirectional",
    "conflictRules": "Salesforce wins",
    "allowDeletes": "false",
    "campaignSync": "enabled"
  },
  "inclusionList": {
    "name": "Salesforce Sync Contacts",
    "filters": "lifecyclestage is any of MQL, SQL, Customer"
  },
  "mappingsExport": {
    "file": "instances/example-company/sfdc-mappings-1728145395000.csv",
    "timestamp": "2025-10-05T14:23:15.000Z"
  },
  "syncHealth": {
    "lastSync": "2025-10-05 14:00:00",
    "errorCount": "3",
    "errorsSummary": "3 contacts failed validation"
  }
}
```

### Field Mappings CSV
Official HubSpot export with columns:
- HubSpot Property Name
- HubSpot Property Type
- Salesforce Field Name
- Salesforce Field Type
- Sync Direction
- Mapping Type

## Requirements

### Permissions
- HubSpot Super Admin **OR** Integration Admin
- Access to Settings → Integrations
- Salesforce connector installed and configured

### Environment
- Node.js 18+
- Playwright browser binaries
- Portal configured in `portals/config.json`

## Error Handling

### Session Expiry
If session expires during scraping:
1. Script detects login redirect
2. Exits with clear message
3. User re-runs with `HEAD=1` to re-authenticate

### Selector Changes
If HubSpot UI changes break selectors:
1. Script logs specific failure point
2. Falls back to alternative selectors (role/text vs CSS)
3. Continues with partial data
4. Flags incomplete sections in output

### Network Timeouts
- 30-second default timeout
- Automatic retry on transient failures
- Graceful degradation for missing sections

## Integration Points

### With sfdc-hubspot-bridge
```javascript
// Bridge agent auto-loads scraped data
const snapshot = require('./instances/example-company/sfdc-sync-snapshot.json');
const mappings = parseCsv('./instances/example-company/sfdc-mappings-*.csv');

// Validates and applies configuration
bridge.configureMappings(mappings);
bridge.setSyncDirection(snapshot.syncSettings);
```

### With Portal Health Checks
```javascript
// Monitor sync health over time
const snapshots = glob('./instances/*/sfdc-sync-snapshot.json');
const health = snapshots.map(s => ({
  portal: s.portalName,
  lastSync: s.syncHealth.lastSync,
  errors: s.syncHealth.errorCount
}));
```

## Security Considerations

### Session Storage
- Sessions stored per-portal in `instances/{portal}/`
- File naming: `.hubspot-session.json` (dot-prefix for hiding)
- Gitignored by default
- Contains authentication tokens

### Data Privacy
- Scraped data contains no PII
- Only configuration metadata extracted
- Field mappings are structural only
- Safe to commit snapshot JSONs

### Access Control
- Requires authenticated HubSpot session
- Respects HubSpot permission model
- No elevation of privileges
- Audit trail in HubSpot login history

## Limitations

### UI-Dependent
- Breaks if HubSpot redesigns Salesforce connector UI
- Selectors require maintenance on major UI updates
- Some data may be inaccessible if UI changes

### Manual Re-Auth
- Cannot automate MFA/SSO
- Requires human for initial authentication
- 24-hour session expiry (configurable)

### Partial Data Risk
- If tabs/sections unavailable, data incomplete
- Script continues with available data
- Outputs flag missing sections

## Maintenance

### Selector Updates
When HubSpot UI changes:
1. Run script in headed mode: `HEAD=1 PORTAL=x node scripts/scrape-sfdc-sync-settings.js`
2. Observe which selectors fail
3. Update selectors in script
4. Test against multiple portals

### Testing
```bash
# Test authentication
HEAD=1 PORTAL=example-company node scripts/scrape-sfdc-sync-settings.js

# Test scraping
PORTAL=example-company node scripts/scrape-sfdc-sync-settings.js

# Validate output
cat instances/example-company/sfdc-sync-snapshot.json | jq .
```

## Playwright MCP Migration (NEW)

### Overview
This agent now uses **Playwright MCP** instead of direct Playwright npm package for improved reliability and accessibility-based element targeting.

### MCP-Based Scraping Pattern

**Before (Legacy - Direct Playwright):**
```javascript
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url);
const element = await page.$('[data-selector]');
```

**After (Current - Playwright MCP):**
```
1. browser_navigate to HubSpot sync settings page
2. browser_snapshot to capture accessibility tree
3. Find elements by role/name (e.g., button "Export Mappings")
4. browser_click using element reference from snapshot
5. browser_take_screenshot for evidence
```

### MCP Tool Usage

**Navigation:**
```
Navigate to https://app.hubspot.com/integrations-settings/{portalId}/installed/salesforce/settings
Wait for "Salesforce" heading to appear
Take snapshot to discover available settings
```

**Data Extraction:**
```
1. Snapshot page structure
2. Extract text from relevant elements:
   - Sync direction toggles
   - Inclusion list settings
   - Field mapping tables
3. Screenshot each section for evidence
```

**Field Mappings Export:**
```
1. Navigate to Field Mappings tab
2. Snapshot to find Export button
3. Click Export button
4. Wait for download or capture table data
5. Screenshot export confirmation
```

### Benefits of MCP Migration

- **No npm dependencies**: No need to install Playwright browsers separately
- **Accessibility-based**: More stable element targeting via accessibility tree
- **Session handling**: Built-in session persistence support
- **Evidence capture**: Integrated screenshot capability for documentation

### Related Runbooks

- [HubSpot UI Patterns](../../opspal-core/runbooks/playwright/hubspot-ui-patterns.md)
- [Authentication Patterns](../../opspal-core/runbooks/playwright/authentication-patterns.md)
- [Screenshot Documentation](../../opspal-core/runbooks/playwright/screenshot-documentation.md)

## Future Enhancements

- **Scheduled scraping**: Cron job for daily health checks
- **Drift detection**: Alert when mappings change
- **Multi-portal batch**: Scrape all portals at once
- **Salesforce side**: Scrape SF connector settings too
- **Automatic re-auth**: Headless MFA bypass (if possible)
