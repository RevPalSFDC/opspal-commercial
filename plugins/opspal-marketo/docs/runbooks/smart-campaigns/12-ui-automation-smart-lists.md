# UI Automation (Playwright) for Smart Lists

## Purpose

Use UI automation **only when no API option exists** (e.g., bulk Smart List edits).
This is a last-resort technique and must be run with safeguards.

## Risks

- Marketo UI changes can break selectors
- Timing issues can cause partial updates
- MFA flows may require manual interaction

## Safeguards

- Use **sandbox** or low-risk programs first
- Require explicit `--confirm`
- Run **headful** by default for operator visibility
- Capture screenshots for audit
- Verify results via Smart List API reads

## Playwright Helper

Script: `scripts/ui/smart-list-ui-automation.js`

### Example Config

```json
{
  "baseUrl": "https://app-xyz.marketo.com",
  "campaignUrl": "https://app-xyz.marketo.com/#SC1234A1",
  "login": {
    "url": "https://app-xyz.marketo.com",
    "mfaPause": true,
    "selectors": {
      "email": "input[type=\"email\"]",
      "password": "input[type=\"password\"]",
      "submit": "button[type=\"submit\"]"
    }
  },
  "actions": [
    { "type": "click", "selector": "text=Smart List" },
    { "type": "click", "selector": "[data-test=add-filter]" },
    { "type": "fill", "selector": "[data-test=filter-search]", "value": "GDPR Opt-in" },
    { "type": "click", "selector": "text=GDPR Opt-in" },
    { "type": "click", "selector": "text=Save" }
  ],
  "captureScreenshot": true,
  "outputDir": "tmp/marketo-ui-automation",
  "headless": false,
  "slowMoMs": 200
}
```

### Run

```bash
node scripts/ui/smart-list-ui-automation.js --config ./smart-list-ui-config.json --confirm
```

## Verification

After the run, verify by reading the Smart List rules:

```javascript
mcp__marketo__campaign_get_smart_list({
  campaignId: 1234,
  includeRules: true
});
```

## Related

- [Smart List & Flow Limitations](./10-smart-list-flow-limitations.md)
- [Smart List Snapshot & Diff](./11-smart-list-snapshots.md)
