# Clone Operations

## Endpoint

```
POST /rest/asset/v1/smartCampaign/{id}/clone.json
```

## Description

Creates a new Smart Campaign by copying an existing one. **This is the primary method for programmatically creating campaigns with triggers and flows**, since those cannot be set via the Create API.

### What Gets Cloned

| Component | Cloned? | Notes |
|-----------|---------|-------|
| Smart List (triggers/filters) | ✅ Yes | Full copy of all rules |
| Flow steps | ✅ Yes | All steps and choices |
| Name | ❌ No | Must provide new name |
| Description | ✅ Optional | Can override |
| Qualification rules | ✅ Yes | Same as source |
| Communication limits | ✅ Yes | Same as source |
| Status | ❌ No | Always starts Inactive |

## Request

### Content-Type

```
application/x-www-form-urlencoded
```

### Path Parameter

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | Source campaign ID to clone |

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Name for the new campaign |
| `folder` | JSON object | Yes | Destination: `{"id": X, "type": "Program"\|"Folder"}` |
| `description` | string | No | New description (or copies from source) |

## Examples

### Basic Clone

```bash
curl -X POST "https://123-ABC-456.mktorest.com/rest/asset/v1/smartCampaign/1000/clone.json" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'name=New Webinar Followup' \
  -d 'folder={"id":2000,"type":"Program"}'
```

### Clone with New Description

```bash
curl -X POST "https://123-ABC-456.mktorest.com/rest/asset/v1/smartCampaign/1000/clone.json" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'name=New Webinar Followup' \
  -d 'folder={"id":2000,"type":"Program"}' \
  -d 'description=Follow-up campaign cloned from master template'
```

### MCP Tool Usage

```javascript
mcp__marketo__campaign_clone({
  campaignId: 1000,
  name: "New Webinar Followup",
  folder: { id: 2000, type: "Program" },
  description: "Follow-up campaign cloned from master template"
})
```

## Response

### Success

```json
{
  "success": true,
  "result": [
    {
      "id": 2045,
      "name": "New Webinar Followup",
      "description": "Follow-up campaign cloned from master template",
      "createdAt": "2026-01-12T22:01:41Z+0000",
      "updatedAt": "2026-01-12T22:01:41Z+0000",
      "folder": { "id": 2000, "type": "Program" },
      "status": "Inactive",
      "type": "trigger",
      "isSystem": false,
      "isActive": false,
      "isRequestable": true,
      "isCommunicationLimitEnabled": false,
      "recurrence": { "weekdayOnly": false },
      "qualificationRuleType": "once",
      "workspace": "Default",
      "smartListId": 6001,
      "flowId": 6101
    }
  ]
}
```

Note:
- New `id` is assigned
- `status` is always `Inactive` (even if source was Active)
- `isActive` is `false`
- New `smartListId` and `flowId` are created
- `isRequestable` reflects whether source had API trigger

### Error Responses

#### Source Not Found (610)

```json
{
  "success": false,
  "errors": [{ "code": "610", "message": "Requested resource not found" }]
}
```

#### Name Already Exists (711)

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

## Template-Based Workflow

### 1. Create Master Templates

Maintain a library of template campaigns in a dedicated folder:

```
Marketing Programs/
└── _Templates/
    ├── Template - Welcome Series
    ├── Template - Webinar Followup
    ├── Template - Newsletter
    └── Template - Scoring Campaign
```

### 2. Clone for New Campaigns

```javascript
const TEMPLATES = {
  welcome: 1001,
  webinar: 1002,
  newsletter: 1003,
  scoring: 1004
};

async function createFromTemplate(templateType, targetProgram, name) {
  const templateId = TEMPLATES[templateType];

  if (!templateId) {
    throw new Error(`Unknown template: ${templateType}`);
  }

  return await mcp__marketo__campaign_clone({
    campaignId: templateId,
    name: name,
    folder: { id: targetProgram, type: "Program" },
    description: `Created from ${templateType} template`
  });
}

// Usage
const campaign = await createFromTemplate('webinar', 2000, '2026 Q1 Webinar Followup');
```

### 3. Customize with Tokens

After cloning, update program tokens to customize behavior:

```javascript
// Clone the campaign
const campaign = await createFromTemplate('webinar', 2000, '2026 Q1 Webinar Followup');

// Update program tokens (using Programs API)
await updateProgramTokens(2000, {
  'my.WebinarDate': '2026-02-15',
  'my.WebinarTitle': 'Q1 Product Launch',
  'my.FollowupEmail': 'product-launch-followup'
});

// Activate when ready
await mcp__marketo__campaign_activate({ campaignId: campaign.id });
```

## Cross-Program Cloning

### Asset References

When cloning to a different program, be aware of asset references:

| Asset Type | Behavior |
|------------|----------|
| Emails in same program | References remain to source program |
| Landing pages | References remain to source program |
| Lists | References remain to source |
| My Tokens | New program's tokens are used |
| Score fields | Work across programs |

### Best Practice

For cross-program cloning:
1. Use **My Tokens** for asset references (email IDs, list IDs)
2. Update tokens in target program before activating
3. Or clone emails/assets separately to target program first

## Error Handling

```javascript
async function cloneCampaignSafely(sourceId, name, targetFolder) {
  // Verify source exists
  const source = await mcp__marketo__campaign_get({ campaignId: sourceId });

  if (!source.success || !source.campaign) {
    throw new Error(`Source campaign ${sourceId} not found`);
  }

  // Check for name conflict in target folder
  const existing = await mcp__marketo__campaign_list({
    folder: JSON.stringify(targetFolder),
    name: name
  });

  if (existing.campaigns.some(c => c.name === name)) {
    throw new Error(`Campaign "${name}" already exists in target folder`);
  }

  // Perform clone
  const result = await mcp__marketo__campaign_clone({
    campaignId: sourceId,
    name,
    folder: targetFolder
  });

  if (!result.success) {
    throw new Error(`Clone failed: ${result.errors?.[0]?.message}`);
  }

  return result.campaign;
}
```

## Use Cases

### 1. Program Duplication

Clone all campaigns from one program to another:

```javascript
async function duplicateProgramCampaigns(sourceProgramId, targetProgramId) {
  const campaigns = await mcp__marketo__campaign_list({
    folder: JSON.stringify({ id: sourceProgramId, type: "Program" })
  });

  const cloned = [];

  for (const campaign of campaigns.campaigns) {
    const newCampaign = await mcp__marketo__campaign_clone({
      campaignId: campaign.id,
      name: campaign.name,  // Same name in new program
      folder: { id: targetProgramId, type: "Program" }
    });
    cloned.push(newCampaign);
  }

  return cloned;
}
```

### 2. Batch Campaign Generation

Create multiple campaigns from one template:

```javascript
async function generateCampaignsForRegions(templateId, programId, regions) {
  const campaigns = [];

  for (const region of regions) {
    const campaign = await mcp__marketo__campaign_clone({
      campaignId: templateId,
      name: `${region} - Welcome Campaign`,
      folder: { id: programId, type: "Program" },
      description: `Welcome campaign for ${region} region`
    });
    campaigns.push(campaign);
  }

  return campaigns;
}

// Usage
await generateCampaignsForRegions(1001, 2000, ['EMEA', 'APAC', 'Americas']);
```

## Workspace Considerations

- Both source and destination must be accessible by API user
- Clone across workspaces requires permissions in both
- Leads partition is determined by target workspace

## Post-Clone Checklist

- [ ] Verify campaign appears in Marketo UI
- [ ] Check Smart List rules were copied correctly
- [ ] Verify Flow steps are present
- [ ] Update program tokens if using token-based customization
- [ ] Review asset references (emails, landing pages)
- [ ] Activate when ready for trigger campaigns

## Related Operations

- [04-create-operations](./04-create-operations.md) - Create empty campaigns
- [06-update-operations](./06-update-operations.md) - Update name/description
- [09-activation-execution](./09-activation-execution.md) - Activate cloned campaigns
- [10-smart-list-flow-limitations](./10-smart-list-flow-limitations.md) - Token workarounds
