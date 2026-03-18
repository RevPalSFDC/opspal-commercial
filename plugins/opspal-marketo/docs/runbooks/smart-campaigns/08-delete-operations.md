# Delete Operations

## Endpoint

```
POST /rest/asset/v1/smartCampaign/{id}/delete.json
```

## Description

Permanently removes a Smart Campaign and its associated Smart List and Flow objects. This operation is **irreversible**.

## Request

### Path Parameter

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | Campaign ID to delete |

### Body

No body parameters required.

## Example

```bash
curl -X POST "https://123-ABC-456.mktorest.com/rest/asset/v1/smartCampaign/2045/delete.json" \
  -H "Authorization: Bearer {ACCESS_TOKEN}"
```

### MCP Tool Usage

```javascript
mcp__marketo__campaign_delete({ campaignId: 2045 })
```

## Response

### Success

```json
{
  "success": true,
  "errors": [],
  "requestId": "d757#16c934216ac",
  "warnings": [],
  "result": [
    { "id": 2045 }
  ]
}
```

The `result` contains the ID of the deleted campaign.

### Error Responses

#### Campaign Not Found (610)

```json
{
  "success": false,
  "errors": [{ "code": "610", "message": "Requested resource not found" }]
}
```

#### System Campaign (Cannot Delete)

```json
{
  "success": false,
  "errors": [{ "code": "709", "message": "System asset cannot be modified" }]
}
```

#### Active Campaign (May Be Blocked)

```json
{
  "success": false,
  "errors": [{ "code": "709", "message": "Campaign is active" }]
}
```

## Pre-Delete Requirements

### 1. Deactivate First (Trigger Campaigns)

Before deleting an active trigger campaign:

```javascript
// Check if active
const campaign = await mcp__marketo__campaign_get({ campaignId: 2045 });

if (campaign.campaign.isActive) {
  // Deactivate first
  await mcp__marketo__campaign_deactivate({ campaignId: 2045 });
}

// Now delete
await mcp__marketo__campaign_delete({ campaignId: 2045 });
```

### 2. Check for Dependencies

Other campaigns may reference this campaign via "Request Campaign" flow steps:

```javascript
// Not directly available via API - document known dependencies
// or maintain a dependency map externally
```

### 3. Verify No Running Batches

For batch campaigns, ensure no scheduled runs:

```javascript
const campaign = await mcp__marketo__campaign_get({ campaignId: 2045 });

if (campaign.campaign.status === 'Scheduled') {
  console.warn('Campaign is scheduled - consider unscheduling first');
}
```

## Safe Delete Pattern

```javascript
async function safeDeleteCampaign(campaignId, options = {}) {
  const { force = false, dryRun = false } = options;

  // 1. Verify campaign exists
  const campaign = await mcp__marketo__campaign_get({ campaignId });

  if (!campaign.success || !campaign.campaign) {
    throw new Error(`Campaign ${campaignId} not found`);
  }

  const { name, isActive, isSystem, status } = campaign.campaign;

  // 2. Block system campaigns
  if (isSystem) {
    throw new Error(`Cannot delete system campaign: ${name}`);
  }

  // 3. Check if active
  if (isActive && !force) {
    throw new Error(`Campaign "${name}" is active. Deactivate first or use force=true`);
  }

  // 4. Warn about scheduled campaigns
  if (status === 'Scheduled' && !force) {
    throw new Error(`Campaign "${name}" is scheduled. Cancel schedule first or use force=true`);
  }

  // 5. Dry run - return what would be deleted
  if (dryRun) {
    return {
      wouldDelete: true,
      campaign: { id: campaignId, name, status, isActive }
    };
  }

  // 6. Deactivate if active and force=true
  if (isActive) {
    await mcp__marketo__campaign_deactivate({ campaignId });
  }

  // 7. Delete
  const result = await mcp__marketo__campaign_delete({ campaignId });

  if (!result.success) {
    throw new Error(`Delete failed: ${result.errors?.[0]?.message}`);
  }

  return {
    deleted: true,
    campaign: { id: campaignId, name }
  };
}
```

## Batch Delete

Delete multiple campaigns with safety checks:

```javascript
async function batchDeleteCampaigns(campaignIds, options = {}) {
  const { dryRun = false, stopOnError = true } = options;
  const results = { deleted: [], failed: [], skipped: [] };

  for (const campaignId of campaignIds) {
    try {
      const result = await safeDeleteCampaign(campaignId, {
        force: true,
        dryRun
      });

      if (dryRun) {
        results.skipped.push(result);
      } else {
        results.deleted.push(result);
      }
    } catch (error) {
      results.failed.push({
        campaignId,
        error: error.message
      });

      if (stopOnError) {
        break;
      }
    }
  }

  return results;
}
```

## Use Cases

### 1. Cleanup Obsolete Campaigns

```javascript
async function cleanupOldCampaigns(programId, olderThanDays = 365) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const campaigns = await mcp__marketo__campaign_list({
    folder: JSON.stringify({ id: programId, type: "Program" }),
    latestUpdatedAt: cutoffDate.toISOString()
  });

  // Filter for Never Run or Inactive campaigns
  const candidates = campaigns.campaigns.filter(
    c => c.status === 'Never Run' || !c.isActive
  );

  console.log(`Found ${candidates.length} cleanup candidates`);

  // Delete with confirmation
  for (const campaign of candidates) {
    await safeDeleteCampaign(campaign.id, { force: true });
  }
}
```

### 2. Delete Failed Clone Attempts

```javascript
async function cleanupFailedClones(prefix = 'Clone_') {
  const campaigns = await mcp__marketo__campaign_list({
    name: prefix
  });

  const failedClones = campaigns.campaigns.filter(
    c => c.name.startsWith(prefix) && c.status === 'Never Run'
  );

  for (const campaign of failedClones) {
    await safeDeleteCampaign(campaign.id);
  }
}
```

### 3. Delete Campaign by Name

```javascript
async function deleteCampaignByName(name, folderId, folderType) {
  // Find campaign
  const campaigns = await mcp__marketo__campaign_list({
    folder: JSON.stringify({ id: folderId, type: folderType }),
    name: name
  });

  const campaign = campaigns.campaigns.find(c => c.name === name);

  if (!campaign) {
    throw new Error(`Campaign "${name}" not found in folder`);
  }

  return await safeDeleteCampaign(campaign.id);
}
```

## Important Considerations

### No Undo

- Deletion is permanent
- No recycle bin or recovery option
- Only way to restore is recreating or cloning from backup

### Orphaned References

- Other campaigns with "Request Campaign" steps will have broken references
- Marketo doesn't prevent deletion even with dependencies
- Audit references before deleting

### Historical Data

- Deleting a campaign **does not delete** activity history
- Lead activities that reference the campaign remain
- Campaign membership records may be affected

### Workspace Permissions

- API user must have delete permission in the workspace
- System campaigns cannot be deleted regardless of permissions

## Pre-Delete Checklist

- [ ] Campaign is not active (or will be deactivated)
- [ ] Campaign is not currently scheduled
- [ ] No other campaigns depend on this via "Request Campaign"
- [ ] Historical data retention requirements are met
- [ ] Confirm campaign ID is correct
- [ ] Consider archiving (rename/move) instead of delete

## Post-Delete Verification

```javascript
async function verifyDeleted(campaignId) {
  try {
    const result = await mcp__marketo__campaign_get({ campaignId });

    if (result.success && result.campaign) {
      return { deleted: false, campaign: result.campaign };
    }
  } catch (error) {
    // Expected - campaign should not be found
  }

  return { deleted: true };
}
```

## Related Operations

- [05-read-operations](./05-read-operations.md) - Verify campaign exists
- [09-activation-execution](./09-activation-execution.md) - Deactivate before delete
- [07-clone-operations](./07-clone-operations.md) - Consider cloning for backup
