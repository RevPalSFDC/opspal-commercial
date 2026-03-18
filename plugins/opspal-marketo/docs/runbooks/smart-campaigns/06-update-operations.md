# Update Operations

## Endpoint

```
POST /rest/asset/v1/smartCampaign/{id}.json
```

## Description

Updates a Smart Campaign's **name** and/or **description** only. This endpoint cannot modify:
- Smart List (triggers/filters)
- Flow steps
- Qualification rules
- Communication limit settings
- Folder location
- Campaign type

## Request

### Content-Type

```
application/x-www-form-urlencoded
```

### Path Parameter

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | Campaign ID to update |

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | No | New campaign name |
| `description` | string | No | New description (max 2000 chars) |

> **Note**: At least one parameter must be provided.

## Examples

### Update Name Only

```bash
curl -X POST "https://123-ABC-456.mktorest.com/rest/asset/v1/smartCampaign/1076.json" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'name=Welcome Drip Campaign v2'
```

### Update Description Only

```bash
curl -X POST "https://123-ABC-456.mktorest.com/rest/asset/v1/smartCampaign/1076.json" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'description=Updated description after Q4 review'
```

### Update Both

```bash
curl -X POST "https://123-ABC-456.mktorest.com/rest/asset/v1/smartCampaign/1076.json" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'name=Welcome Drip Campaign v2' \
  -d 'description=Updated for Q1 2026 campaign'
```

### MCP Tool Usage

```javascript
mcp__marketo__campaign_update({
  campaignId: 1076,
  name: "Welcome Drip Campaign v2",
  description: "Updated for Q1 2026 campaign"
})
```

## Response

### Success

```json
{
  "success": true,
  "errors": [],
  "requestId": "14b6a#16c924b992f",
  "warnings": [],
  "result": [
    {
      "id": 1076,
      "name": "Welcome Drip Campaign v2",
      "description": "Updated for Q1 2026 campaign",
      "createdAt": "2025-08-14T17:42:04Z+0000",
      "updatedAt": "2025-12-01T22:42:04Z+0000",
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
      "flowId": 1095
    }
  ]
}
```

Note the `updatedAt` timestamp is refreshed.

### Error Responses

#### Campaign Not Found (610)

```json
{
  "success": false,
  "errors": [{ "code": "610", "message": "Requested resource not found" }]
}
```

#### Duplicate Name (711)

```json
{
  "success": false,
  "errors": [{ "code": "711", "message": "Asset name already in use" }]
}
```

## Limitations

### What Cannot Be Updated

| Property | Alternative |
|----------|-------------|
| Smart List (triggers/filters) | Configure in Marketo UI |
| Flow steps | Configure in Marketo UI |
| Folder location | Create new campaign in target folder |
| Campaign type | Determined by triggers (add/remove in UI) |
| Qualification rules | Configure in Marketo UI |
| Communication limits | Configure in Marketo UI |
| Recurrence settings | Configure in Marketo UI |

### Name Uniqueness

- Name must be unique within the folder/program
- Changing name to one that exists in same folder fails with 711
- Different folders can have same campaign name

### Active Campaign Updates

- Can update name/description of active campaigns
- No need to deactivate first
- Updates are immediate

## Error Handling

```javascript
async function updateCampaignSafely(campaignId, updates) {
  // Verify campaign exists
  const existing = await mcp__marketo__campaign_get({ campaignId });

  if (!existing.success || !existing.campaign) {
    throw new Error(`Campaign ${campaignId} not found`);
  }

  // Check for name conflict if updating name
  if (updates.name && updates.name !== existing.campaign.name) {
    const folder = existing.campaign.folder;
    const conflicts = await mcp__marketo__campaign_list({
      folder: JSON.stringify(folder),
      name: updates.name
    });

    const exactMatch = conflicts.campaigns.find(c => c.name === updates.name);
    if (exactMatch) {
      throw new Error(`Campaign name "${updates.name}" already exists in folder`);
    }
  }

  // Perform update
  return await mcp__marketo__campaign_update({
    campaignId,
    ...updates
  });
}
```

## Use Cases

### Rename for Versioning

```javascript
// Add version number to campaign name
const campaign = await mcp__marketo__campaign_get({ campaignId: 1076 });
const currentName = campaign.campaign.name;
const newName = currentName.replace(/ v\d+$/, '') + ' v2';

await mcp__marketo__campaign_update({
  campaignId: 1076,
  name: newName
});
```

### Update Description with Timestamp

```javascript
const now = new Date().toISOString().split('T')[0];
await mcp__marketo__campaign_update({
  campaignId: 1076,
  description: `Updated ${now}: Modified email sequence for Q1 campaign`
});
```

### Clear Description

```javascript
await mcp__marketo__campaign_update({
  campaignId: 1076,
  description: ""  // Empty string clears description
});
```

## Best Practices

1. **Document Changes** - Update description with change reason and date
2. **Version in Name** - Use `v1`, `v2` suffixes for major changes
3. **Verify Before Update** - Check campaign exists and current values
4. **Check Name Conflicts** - Ensure new name is unique in folder
5. **Keep Description Current** - Include purpose, owner, last review date

## Related Operations

- [04-create-operations](./04-create-operations.md) - For creating new campaigns
- [05-read-operations](./05-read-operations.md) - Verify current state
- [07-clone-operations](./07-clone-operations.md) - For structural changes
- [08-delete-operations](./08-delete-operations.md) - For removing obsolete campaigns
