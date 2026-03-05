---
description: Quick reference for Smart Campaign REST API endpoints and usage
argument-hint: "[--operation=create|read|update|clone|delete|activate] [--examples]"
---

# Smart Campaign API Reference

Quick reference for Marketo Smart Campaign REST API operations.

## Usage

```
/smart-campaign-api [--operation=create|read|update|clone|delete|activate] [--examples]
```

## Parameters

- `--operation` - Filter to specific operation type
- `--examples` - Show code examples for each operation

## API Endpoints

### Create Campaign
```
POST /rest/asset/v1/smartCampaigns.json
```
Creates an **empty** campaign. Use clone for functional campaigns with triggers/flows.

**MCP Tool:**
```javascript
mcp__marketo__campaign_create({
  name: 'Campaign Name',
  folder: { id: 1000, type: 'Program' },
  description: 'Optional description'
})
```

### Read Campaign
```
GET /rest/asset/v1/smartCampaign/{id}.json
```
Get campaign details by ID.

**MCP Tool:**
```javascript
mcp__marketo__campaign_get({ campaignId: 2045 })
```

### Update Campaign
```
POST /rest/asset/v1/smartCampaign/{id}.json
```
Update name and/or description only. Triggers and flows cannot be modified via API.

**MCP Tool:**
```javascript
mcp__marketo__campaign_update({
  campaignId: 2045,
  name: 'New Name',
  description: 'New description'
})
```

### Clone Campaign
```
POST /rest/asset/v1/smartCampaign/{id}/clone.json
```
**Primary method** for creating functional campaigns. Copies Smart List and Flow.

**MCP Tool:**
```javascript
mcp__marketo__campaign_clone({
  campaignId: 1000,  // Template ID
  name: 'New Campaign',
  folder: { id: 2000, type: 'Program' },
  description: 'Cloned campaign'
})
```

### Delete Campaign
```
POST /rest/asset/v1/smartCampaign/{id}/delete.json
```
Permanently deletes campaign. Must deactivate first if active.

**MCP Tool:**
```javascript
mcp__marketo__campaign_delete({ campaignId: 2045 })
```

### Get Smart List
```
GET /rest/asset/v1/smartCampaign/{id}/smartList.json
```
Get triggers and filters for a campaign.

**MCP Tool:**
```javascript
mcp__marketo__campaign_get_smart_list({
  campaignId: 2045,
  includeRules: true
})
```

### Activate/Deactivate
```
POST /rest/asset/v1/smartCampaign/{id}/activate.json
POST /rest/asset/v1/smartCampaign/{id}/deactivate.json
```
Control trigger campaign listening.

**MCP Tools:**
```javascript
mcp__marketo__campaign_activate({ campaignId: 2045 })
mcp__marketo__campaign_deactivate({ campaignId: 2045 })
```

### Schedule Batch Campaign
```
POST /rest/v1/campaigns/{id}/schedule.json
```
Schedule batch campaign to run at specific time.

**MCP Tool:**
```javascript
mcp__marketo__campaign_schedule({
  campaignId: 3001,
  runAt: '2026-01-20T14:00:00Z',
  tokens: [
    { name: '{{my.TokenName}}', value: 'Custom Value' }
  ]
})
```

### Request Campaign
```
POST /rest/v1/campaigns/{id}/trigger.json
```
Trigger campaign for specific leads. Requires "Campaign is Requested" trigger.

**MCP Tool:**
```javascript
mcp__marketo__campaign_request({
  campaignId: 2045,
  leads: [{ id: 12345 }, { id: 67890 }],
  tokens: [
    { name: '{{my.WebinarDate}}', value: '2026-02-01' }
  ]
})
```

## API Limitations

| Component | Can Read? | Can Modify? |
|-----------|-----------|-------------|
| Campaign name/description | Yes | Yes |
| Smart List triggers | Yes | **No** |
| Smart List filters | Yes | **No** |
| Flow steps | **No** | **No** |
| Qualification rules | Yes | **No** |

## Smart List Assets (Related)

Smart Lists are separate assets. You can read/clone/delete them, but not modify rules.

```javascript
mcp__marketo__smart_list_list({ name: 'Scoring' })
mcp__marketo__smart_list_get({ smartListId: 4321, includeRules: true })
mcp__marketo__smart_list_clone({ smartListId: 4321, name: 'Clone', folder: { id: 100, type: 'Folder' } })
mcp__marketo__smart_list_delete({ smartListId: 4321 })
```

## Error Codes

| Code | Meaning | Recovery |
|------|---------|----------|
| 601/602 | Token invalid/expired | Auto-refresh and retry |
| 606 | Rate limit | Wait 20s, retry |
| 607 | Daily quota | Stop until tomorrow |
| 610 | Not found | Verify ID exists |
| 709 | Asset blocked | Deactivate first |
| 711 | Name exists | Use unique name |

## Rate Limits

- **Rate**: 100 calls / 20 seconds
- **Concurrent**: 10 simultaneous requests
- **Daily**: 50,000 calls

## Common Patterns

### Template-Based Creation
```javascript
// 1. Clone from template
const result = await mcp__marketo__campaign_clone({
  campaignId: TEMPLATE_ID,
  name: '2026 Q1 Welcome',
  folder: { id: programId, type: 'Program' }
});

// 2. Activate when ready
await mcp__marketo__campaign_activate({
  campaignId: result.campaign.id
});
```

### Safe Delete
```javascript
// 1. Deactivate if active
await mcp__marketo__campaign_deactivate({ campaignId: 2045 });

// 2. Delete
await mcp__marketo__campaign_delete({ campaignId: 2045 });
```

### Pre-Activation Validation
```javascript
// Check Smart List has triggers
const smartList = await mcp__marketo__campaign_get_smart_list({
  campaignId: 2045,
  includeRules: true
});

if (smartList.triggers.length === 0) {
  throw new Error('No triggers defined');
}

// Activate
await mcp__marketo__campaign_activate({ campaignId: 2045 });
```

## Related Agent

This command references: `marketo-smart-campaign-api-specialist`

## Related Commands

- `/create-smart-campaign` - Interactive campaign creation wizard
- `/clone-campaign-wizard` - Interactive cloning workflow
- `/marketo-preflight campaign-activate` - Pre-activation validation

## Runbook Reference

For detailed API documentation, see:
- `docs/runbooks/smart-campaigns/README.md`
- `docs/runbooks/smart-campaigns/10-smart-list-flow-limitations.md`
