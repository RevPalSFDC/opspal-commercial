# Read Operations

## Overview

Three methods to read Smart Campaign data:
1. **By ID** - Direct lookup when ID is known
2. **By Name** - Lookup when exact name is known
3. **Browse** - List campaigns with filtering

## Get Campaign by ID

### Endpoint

```
GET /rest/asset/v1/smartCampaign/{id}.json
```

### Example

```bash
curl -X GET "https://123-ABC-456.mktorest.com/rest/asset/v1/smartCampaign/1076.json" \
  -H "Authorization: Bearer {ACCESS_TOKEN}"
```

### MCP Tool

```javascript
mcp__marketo__campaign_get({ campaignId: 1076 })
```

### Response

```json
{
  "success": true,
  "errors": [],
  "requestId": "7883#169838a32f0",
  "warnings": [],
  "result": [
    {
      "id": 1076,
      "name": "Welcome Drip Campaign",
      "description": "Initial welcome email drip campaign.",
      "createdAt": "2025-08-14T17:42:04Z+0000",
      "updatedAt": "2025-08-14T17:42:04Z+0000",
      "folder": { "id": 1234, "type": "Program" },
      "status": "Never Run",
      "type": "batch",
      "isActive": false,
      "isRequestable": false,
      "isCommunicationLimitEnabled": true,
      "recurrence": { "weekdayOnly": false },
      "qualificationRuleType": "once",
      "workspace": "Default",
      "smartListId": 5132,
      "flowId": 1095,
      "computedUrl": "https://app-ab12.marketo.com/#SC1076A1"
    }
  ]
}
```

### Error Handling

| Scenario | Response |
|----------|----------|
| Campaign exists | `success: true`, result with campaign object |
| Campaign not found | `success: true`, empty result or 610 error |
| Invalid ID format | `success: false`, error message |

## Get Campaign by Name

### Endpoint

```
GET /rest/asset/v1/smartCampaign/byName.json?name={campaignName}
```

### Example

```bash
curl -X GET "https://123-ABC-456.mktorest.com/rest/asset/v1/smartCampaign/byName.json?name=Welcome%20Drip%20Campaign" \
  -H "Authorization: Bearer {ACCESS_TOKEN}"
```

### Response

Same structure as by-ID response.

### Important Notes

- **Exact match required** - Name must match exactly (case-sensitive)
- **URL encoding** - Encode spaces and special characters
- **Ambiguity risk** - If multiple campaigns share name (different folders), may return first match

## Browse/List Campaigns

### Endpoint

```
GET /rest/asset/v1/smartCampaigns.json
```

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `folder` | JSON | Filter by folder: `{"id": X, "type": "Folder"\|"Program"}` |
| `earliestUpdatedAt` | datetime | Filter by earliest update (ISO 8601) |
| `latestUpdatedAt` | datetime | Filter by latest update (ISO 8601) |
| `isActive` | boolean | Filter for active trigger campaigns only |
| `maxReturn` | integer | Page size (max 200, default 20) |
| `offset` | integer | Pagination offset |
| `name` | string | Filter by name (partial match) |

### MCP Tool

```javascript
mcp__marketo__campaign_list({
  name: "Welcome",
  batchSize: 50,
  isTriggerable: true,
  earliestUpdatedAt: "2025-01-01T00:00:00Z"
})
```

### Example: List by Folder

```bash
curl -X GET "https://123-ABC-456.mktorest.com/rest/asset/v1/smartCampaigns.json?folder=%7B%22id%22%3A1234%2C%22type%22%3A%22Program%22%7D&maxReturn=50" \
  -H "Authorization: Bearer {ACCESS_TOKEN}"
```

### Example: List by Date Range

```bash
curl -X GET "https://123-ABC-456.mktorest.com/rest/asset/v1/smartCampaigns.json?earliestUpdatedAt=2025-10-01T00:00:00Z&latestUpdatedAt=2025-10-31T23:59:59Z&maxReturn=50" \
  -H "Authorization: Bearer {ACCESS_TOKEN}"
```

### Response

```json
{
  "success": true,
  "result": [
    {
      "id": 1076,
      "name": "Welcome Drip Campaign",
      "folder": { "id": 1234, "type": "Program" },
      "status": "Inactive",
      "type": "trigger",
      "isActive": false
      // ... other fields
    },
    {
      "id": 1077,
      "name": "Monthly Newsletter",
      "folder": { "id": 1234, "type": "Program" },
      "status": "Never Run",
      "type": "batch",
      "isActive": false
      // ... other fields
    }
  ],
  "moreResult": false
}
```

### Pagination

```javascript
async function getAllCampaigns(folder) {
  const campaigns = [];
  let offset = 0;
  const batchSize = 200;

  while (true) {
    const result = await mcp__marketo__campaign_list({
      folder: JSON.stringify(folder),
      batchSize,
      nextPageToken: offset.toString()
    });

    campaigns.push(...result.campaigns);

    if (!result.nextPageToken || result.campaigns.length < batchSize) {
      break;
    }

    offset = parseInt(result.nextPageToken);
  }

  return campaigns;
}
```

## Get Smart List Rules

### Endpoint

```
GET /rest/asset/v1/smartCampaign/{id}/smartList.json
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `includeRules` | boolean | false | Include trigger/filter rules |

### Example

```bash
curl -X GET "https://123-ABC-456.mktorest.com/rest/asset/v1/smartCampaign/1076/smartList.json?includeRules=true" \
  -H "Authorization: Bearer {ACCESS_TOKEN}"
```

### MCP Tool

```javascript
mcp__marketo__campaign_get_smart_list({
  campaignId: 1076,
  includeRules: true
})
```

### Response with Rules

```json
{
  "success": true,
  "result": [
    {
      "id": 5132,
      "name": "Smart List for SC 1076",
      "folder": { "id": 1076, "type": "SmartCampaign" },
      "rules": {
        "filterMatchType": "all",
        "triggers": [
          {
            "id": 42,
            "name": "Fills Out Form",
            "ruleType": "Trigger",
            "operator": "IS",
            "triggerFields": [
              { "id": "formId", "value": 123 }
            ]
          }
        ],
        "filters": [
          {
            "id": 459,
            "name": "Email Address",
            "ruleType": "Filter",
            "operator": "contains",
            "conditions": [
              { "value": "@company.com" }
            ]
          }
        ]
      }
    }
  ]
}
```

### Use Cases

1. **Verify Campaign is Requestable**
   ```javascript
   const smartList = await mcp__marketo__campaign_get_smart_list({
     campaignId: 1076,
     includeRules: true
   });

   const hasApiTrigger = smartList.rules?.triggers?.some(
     t => t.name === "Campaign is Requested"
   );
   ```

2. **Audit Trigger Conflicts**
   ```javascript
   // Check if trigger overlaps with other campaigns
   const allCampaigns = await mcp__marketo__campaign_list({ isActive: true });

   for (const campaign of allCampaigns) {
     const rules = await mcp__marketo__campaign_get_smart_list({
       campaignId: campaign.id,
       includeRules: true
     });
     // Compare triggers
   }
   ```

## Common Patterns

### Find Campaign by Name in Folder

```javascript
async function findCampaignByName(name, folderId, folderType) {
  const result = await mcp__marketo__campaign_list({
    folder: JSON.stringify({ id: folderId, type: folderType }),
    name: name
  });

  const exactMatch = result.campaigns.find(c => c.name === name);
  return exactMatch || null;
}
```

### Check Campaign Exists

```javascript
async function campaignExists(campaignId) {
  try {
    const result = await mcp__marketo__campaign_get({ campaignId });
    return result.success && result.campaign !== null;
  } catch (error) {
    return false;
  }
}
```

### Get Campaign Status

```javascript
async function getCampaignStatus(campaignId) {
  const result = await mcp__marketo__campaign_get({ campaignId });

  if (!result.success) {
    throw new Error('Failed to get campaign');
  }

  const campaign = result.campaign;
  return {
    id: campaign.id,
    name: campaign.name,
    type: campaign.type,
    status: campaign.status,
    isActive: campaign.isActive,
    isRequestable: campaign.isRequestable
  };
}
```

## Error Reference

| Code | Message | Cause |
|------|---------|-------|
| 610 | Requested resource not found | Invalid campaign ID |
| 702 | No data found | Name doesn't match any campaign |
| 603 | Access denied | No permission to view campaign |

## Related Operations

- [04-create-operations](./04-create-operations.md) - Create campaigns
- [06-update-operations](./06-update-operations.md) - Update campaigns
- [09-activation-execution](./09-activation-execution.md) - Check before activating
