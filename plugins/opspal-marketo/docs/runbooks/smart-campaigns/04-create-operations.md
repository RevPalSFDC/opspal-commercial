# Create Operations

## Endpoint

```
POST /rest/asset/v1/smartCampaigns.json
```

## Description

Creates a new Smart Campaign asset with a name, folder location, and optional description. The new campaign will have:
- Empty Smart List (no triggers/filters)
- Empty Flow (no actions)
- Inactive status
- `type: "batch"` (until triggers are added)

## Request

### Content-Type

```
application/x-www-form-urlencoded
```

### Required Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string | Campaign name (must be unique within folder/program) |
| `folder` | JSON object | Destination container: `{"id": number, "type": "Program" \| "Folder"}` |

### Optional Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `description` | string | Campaign description (max 2000 characters) |

## Examples

### Basic Create

```bash
curl -X POST "https://123-ABC-456.mktorest.com/rest/asset/v1/smartCampaigns.json" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'name=Welcome Drip Campaign' \
  -d 'folder={"id":1234,"type":"Program"}'
```

### Create with Description

```bash
curl -X POST "https://123-ABC-456.mktorest.com/rest/asset/v1/smartCampaigns.json" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'name=Welcome Drip Campaign' \
  -d 'folder={"id":1234,"type":"Program"}' \
  -d 'description=Initial welcome email drip campaign for new form submissions'
```

### MCP Tool Usage

```javascript
mcp__marketo__campaign_create({
  name: "Welcome Drip Campaign",
  folder: { id: 1234, type: "Program" },
  description: "Initial welcome email drip campaign"
})
```

## Response

### Success

```json
{
  "success": true,
  "errors": [],
  "requestId": "25bc#16c9138f148",
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

### Error Responses

#### Missing Name (701)

```json
{
  "success": false,
  "errors": [{ "code": "701", "message": "'name' cannot be blank" }]
}
```

#### Duplicate Name (711)

```json
{
  "success": false,
  "errors": [{ "code": "711", "message": "Asset name already in use" }]
}
```

#### Invalid Folder (710)

```json
{
  "success": false,
  "errors": [{ "code": "710", "message": "Invalid folder" }]
}
```

## Error Handling

| Error | Code | Solution |
|-------|------|----------|
| Name blank | 701 | Provide a name |
| Name in use | 711 | Use unique name or different folder |
| Invalid folder | 710 | Verify folder ID and type exist |
| Access denied | 603 | Check API user permissions |

## Folder Types

### Program (Recommended)

Create campaign inside a program:

```json
{ "id": 1234, "type": "Program" }
```

- Campaign inherits program tokens
- Shows under program in Marketing Activities
- Required for Email Programs

### Folder

Create standalone campaign:

```json
{ "id": 5678, "type": "Folder" }
```

- For operational campaigns
- Higher in folder hierarchy
- No token inheritance

> **Note**: Cannot create campaigns inside Email Programs (they have their own single campaign).

## Post-Creation Steps

Since the API creates campaigns with empty logic:

1. **Option A: Manual Configuration**
   - Open campaign in Marketo UI
   - Add triggers/filters to Smart List
   - Add flow steps

2. **Option B: Clone Instead**
   - Use clone operation from template
   - See [07-clone-operations](./07-clone-operations.md)

3. **Option C: Token-Based Design**
   - Design flows that reference My Tokens
   - Update tokens via Program Tokens API
   - See [10-smart-list-flow-limitations](./10-smart-list-flow-limitations.md)

## Validation Checklist

Before creating:
- [ ] Name is unique in target folder/program
- [ ] Folder ID exists and is accessible
- [ ] Folder type matches ID (Program vs Folder)
- [ ] Description is under 2000 characters
- [ ] API user has create permission in workspace

After creating:
- [ ] Verify campaign appears in Marketo UI
- [ ] Note campaign ID for future operations
- [ ] Configure Smart List and Flow (manually or clone)

## Best Practices

### Naming Convention

Use consistent naming:
```
[YYYY-MM] [Type] - [Description]

Examples:
- 2025-12 Welcome - New Form Submission
- 2025-12 Nurture - Monthly Newsletter
- 2025-12 Scoring - Website Activity
```

### Program vs Folder

| Use Program When | Use Folder When |
|-----------------|-----------------|
| Campaign is part of a campaign effort | Operational/utility campaign |
| Need token inheritance | Shared across programs |
| Tracking program-level metrics | Template storage |

### Error Prevention

```javascript
// Pre-check for unique name
async function createCampaignSafely(name, folder, description) {
  // Check if name exists
  const existing = await mcp__marketo__campaign_list({
    folder: JSON.stringify(folder),
    name: name
  });

  if (existing.campaigns.length > 0) {
    throw new Error(`Campaign "${name}" already exists in folder`);
  }

  // Create campaign
  return await mcp__marketo__campaign_create({
    name,
    folder,
    description
  });
}
```

## Related Operations

- [05-read-operations](./05-read-operations.md) - Verify creation
- [06-update-operations](./06-update-operations.md) - Update name/description
- [07-clone-operations](./07-clone-operations.md) - Clone with logic
- [09-activation-execution](./09-activation-execution.md) - Activate campaign
