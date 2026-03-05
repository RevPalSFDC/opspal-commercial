# Activation and Execution

## Overview

This runbook covers executing Smart Campaigns:
- **Activate/Deactivate** - Control trigger campaign listening
- **Request Campaign** - Trigger for specific leads via API
- **Schedule Campaign** - Run batch campaigns

## Activate Trigger Campaign

### Endpoint

```
POST /rest/asset/v1/smartCampaign/{id}/activate.json
```

### Requirements

The campaign must have:
- ✅ At least one trigger in Smart List
- ✅ At least one flow step
- ✅ No configuration errors
- ✅ `type: "trigger"` (not batch)

### Example

```bash
curl -X POST "https://123-ABC-456.mktorest.com/rest/asset/v1/smartCampaign/2045/activate.json" \
  -H "Authorization: Bearer {ACCESS_TOKEN}"
```

### MCP Tool

```javascript
mcp__marketo__campaign_activate({ campaignId: 2045 })
```

### Response

```json
{
  "success": true,
  "errors": [],
  "requestId": "a33a#161d9c0dcf3",
  "result": [
    { "id": 2045 }
  ]
}
```

After activation:
- `isActive` becomes `true`
- `status` becomes `Active`
- Campaign starts listening for trigger events

### Activation Errors

| Scenario | Error |
|----------|-------|
| Already active | May succeed with no change |
| No triggers | "Smart List must have at least one trigger" |
| No flow steps | "Flow must have at least one step" |
| Batch campaign | "Cannot activate batch campaign" |
| Invalid config | Details about configuration error |

## Deactivate Trigger Campaign

### Endpoint

```
POST /rest/asset/v1/smartCampaign/{id}/deactivate.json
```

### Example

```bash
curl -X POST "https://123-ABC-456.mktorest.com/rest/asset/v1/smartCampaign/2045/deactivate.json" \
  -H "Authorization: Bearer {ACCESS_TOKEN}"
```

### MCP Tool

```javascript
mcp__marketo__campaign_deactivate({ campaignId: 2045 })
```

### Response

```json
{
  "success": true,
  "result": [
    { "id": 2045 }
  ]
}
```

After deactivation:
- `isActive` becomes `false`
- `status` becomes `Inactive`
- Campaign stops listening for events
- Leads currently in flow may complete (depending on settings)

## Request Campaign (Trigger for Leads)

### Endpoint

```
POST /rest/v1/campaigns/{id}/trigger.json
```

> Note: This is under `/rest/v1/` (Lead Database API), not `/asset/`.

### Requirements

- Campaign must have `"Campaign is Requested"` trigger with `Source: Web Service API`
- `isRequestable` must be `true`
- Campaign should be active (or leads queue until activated)

### Request Body

```json
{
  "input": {
    "leads": [
      { "id": 12345 },
      { "id": 67890 }
    ],
    "tokens": [
      { "name": "{{my.TokenName}}", "value": "Custom Value" }
    ]
  }
}
```

### Parameters

| Field | Type | Required | Limit | Description |
|-------|------|----------|-------|-------------|
| `leads` | array | Yes | 100 max | Lead objects with `id` |
| `tokens` | array | No | 100 max | Token overrides for this run |

### Example

```bash
curl -X POST "https://123-ABC-456.mktorest.com/rest/v1/campaigns/2045/trigger.json" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "leads": [
        { "id": 12345 },
        { "id": 67890 }
      ],
      "tokens": [
        { "name": "{{my.WebinarDate}}", "value": "2026-02-01" },
        { "name": "{{my.CustomMessage}}", "value": "Thank you for attending!" }
      ]
    }
  }'
```

### MCP Tool

```javascript
mcp__marketo__campaign_request({
  campaignId: 2045,
  leads: [
    { id: 12345 },
    { id: 67890 }
  ],
  tokens: [
    { name: "{{my.WebinarDate}}", value: "2026-02-01" }
  ]
})
```

### Response

```json
{
  "requestId": "9e01#161d922f1aa",
  "result": [
    { "id": 2045 }
  ],
  "success": true
}
```

### Important Notes

1. **Asynchronous Processing**: API returns immediately; leads are queued and processed asynchronously
2. **Lead Validation**: Invalid lead IDs may be skipped or cause warnings
3. **Duplicate Processing**: If retried, leads may go through campaign again (unless qualification rule prevents it)
4. **Token Scope**: Token overrides apply only to this request batch

### Request Campaign Pattern

```javascript
async function requestCampaignForLeads(campaignId, leadIds, tokens = []) {
  // Verify campaign is requestable
  const campaign = await mcp__marketo__campaign_get({ campaignId });

  if (!campaign.campaign.isRequestable) {
    throw new Error('Campaign does not have "Campaign is Requested" trigger');
  }

  if (!campaign.campaign.isActive) {
    console.warn('Campaign is inactive - leads will queue until activated');
  }

  // Batch leads (max 100 per request)
  const batches = [];
  for (let i = 0; i < leadIds.length; i += 100) {
    batches.push(leadIds.slice(i, i + 100));
  }

  const results = [];
  for (const batch of batches) {
    const result = await mcp__marketo__campaign_request({
      campaignId,
      leads: batch.map(id => ({ id })),
      tokens
    });
    results.push(result);
  }

  return {
    campaignId,
    totalLeads: leadIds.length,
    batches: results.length
  };
}
```

## Schedule Batch Campaign

### Endpoint

```
POST /rest/v1/campaigns/{id}/schedule.json
```

### Request Body

```json
{
  "input": {
    "runAt": "2026-01-20T14:00:00Z",
    "tokens": [
      { "name": "{{my.OfferDate}}", "value": "January 20, 2026" }
    ],
    "cloneToProgramName": "Optional - Clone Program Name"
  }
}
```

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `runAt` | datetime | No | ISO 8601 datetime to run. If omitted or past, runs immediately |
| `tokens` | array | No | Token overrides for this run |
| `cloneToProgramName` | string | No | Clone program before running (advanced) |

### Example: Schedule for Future

```bash
curl -X POST "https://123-ABC-456.mktorest.com/rest/v1/campaigns/3001/schedule.json" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "runAt": "2026-01-20T14:00:00Z",
      "tokens": [
        { "name": "{{my.OfferDate}}", "value": "January 20, 2026" }
      ]
    }
  }'
```

### Example: Run Immediately

```bash
curl -X POST "https://123-ABC-456.mktorest.com/rest/v1/campaigns/3001/schedule.json" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {}
  }'
```

### MCP Tool

```javascript
mcp__marketo__campaign_schedule({
  campaignId: 3001,
  runAt: "2026-01-20T14:00:00Z",
  tokens: [
    { name: "{{my.OfferDate}}", value: "January 20, 2026" }
  ]
})
```

### Response

```json
{
  "success": true,
  "result": [
    { "id": 3001 }
  ]
}
```

### Schedule Considerations

1. **Time Zone**: All times are UTC (ISO 8601 format)
2. **Minimum Lead Time**: Schedule at least 5 minutes in future for reliability
3. **No Unschedule API**: Cannot cancel via API (use UI or schedule to past time)
4. **Clone Option**: `cloneToProgramName` copies entire program before running

## Activation Workflow

### Pre-Activation Checklist

```javascript
async function preActivationCheck(campaignId) {
  const campaign = await mcp__marketo__campaign_get({ campaignId });
  const smartList = await mcp__marketo__campaign_get_smart_list({
    campaignId,
    includeRules: true
  });

  const checks = {
    campaignId,
    name: campaign.campaign.name,
    type: campaign.campaign.type,
    hasTriggers: smartList.rules?.triggers?.length > 0,
    hasFilters: smartList.rules?.filters?.length > 0,
    isAlreadyActive: campaign.campaign.isActive,
    isRequestable: campaign.campaign.isRequestable,
    errors: []
  };

  if (campaign.campaign.type !== 'trigger') {
    checks.errors.push('Campaign is not a trigger campaign');
  }

  if (!checks.hasTriggers) {
    checks.errors.push('No triggers defined in Smart List');
  }

  // Would need UI check for flow steps (not available via API)
  checks.warnings = ['Cannot verify flow steps via API - check in UI'];

  return checks;
}
```

### Safe Activation

```javascript
async function safeActivate(campaignId) {
  const checks = await preActivationCheck(campaignId);

  if (checks.errors.length > 0) {
    throw new Error(`Cannot activate: ${checks.errors.join(', ')}`);
  }

  if (checks.isAlreadyActive) {
    return { success: true, message: 'Campaign already active' };
  }

  const result = await mcp__marketo__campaign_activate({ campaignId });

  // Verify activation
  const updated = await mcp__marketo__campaign_get({ campaignId });

  return {
    success: updated.campaign.isActive,
    campaignId,
    name: checks.name,
    wasActive: checks.isAlreadyActive,
    isNowActive: updated.campaign.isActive
  };
}
```

## Communication Limits

### Default Behavior

| Campaign Type | Honors Communication Limits |
|---------------|----------------------------|
| Trigger | No (`isCommunicationLimitEnabled: false`) |
| Batch | Yes (`isCommunicationLimitEnabled: true`) |

### Impact on Execution

- If limits enabled and lead has hit daily limit, email send steps are skipped
- Other flow steps still execute
- Cannot change this setting via API

## Qualification Rules

### Behavior by Rule

| qualificationRuleType | Lead Behavior |
|-----------------------|---------------|
| `once` | Can only trigger/run through one time ever |
| `every time` | Can re-trigger unlimited times |
| Custom | Can trigger up to X times |

### API Impact

- For "Request Campaign": Leads who already qualified may be skipped
- Marketo silently skips leads who don't meet qualification rules
- Check Activity Log for actual processing

## Execution Monitoring

### Check Campaign Status

```javascript
async function monitorCampaignExecution(campaignId) {
  const campaign = await mcp__marketo__campaign_get({ campaignId });

  return {
    campaignId,
    name: campaign.campaign.name,
    type: campaign.campaign.type,
    status: campaign.campaign.status,
    isActive: campaign.campaign.isActive,
    updatedAt: campaign.campaign.updatedAt
  };
}
```

### Activity Tracking

Campaign execution creates activities:
- "Added to Campaign"
- "Campaign is Triggered"
- Flow step activities (Send Email, Change Data, etc.)

Query via Activities API to track processing.

## Error Recovery

### If Activation Fails

1. Check error message for specific issue
2. Common fixes:
   - Add missing trigger
   - Add missing flow step
   - Resolve configuration errors in UI
3. Retry activation after fixing

### If Request Fails

1. Verify `isRequestable: true`
2. Verify lead IDs exist
3. Check rate limits (100 leads max per request)
4. Ensure campaign has "Campaign is Requested" trigger

### If Schedule Fails

1. Verify campaign is batch type
2. Check `runAt` format (ISO 8601)
3. Verify campaign has valid Smart List and Flow

## Related Operations

- [03-campaign-object-structure](./03-campaign-object-structure.md) - Understanding status/type
- [05-read-operations](./05-read-operations.md) - Check campaign state
- [10-smart-list-flow-limitations](./10-smart-list-flow-limitations.md) - API limitations
