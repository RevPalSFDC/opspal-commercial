# Smart Campaign Batch Operations Examples

## Clone Multiple Campaigns from Template

### Use Case
Create regional campaign variations from a master template.

### Code
```javascript
const TEMPLATE_ID = 1001;
const TARGET_PROGRAM = 2000;
const REGIONS = ['EMEA', 'APAC', 'Americas'];

async function cloneForRegions() {
  const results = { succeeded: [], failed: [] };

  for (const region of REGIONS) {
    try {
      const result = await mcp__marketo__campaign_clone({
        campaignId: TEMPLATE_ID,
        name: `${region} - Welcome Campaign`,
        folder: { id: TARGET_PROGRAM, type: 'Program' },
        description: `Welcome campaign for ${region} region`
      });

      if (result.success) {
        results.succeeded.push({
          region,
          campaignId: result.campaign.id
        });
      }

      // Rate limit protection
      await sleep(200);
    } catch (error) {
      results.failed.push({ region, error: error.message });
    }
  }

  return results;
}
```

### Output
```json
{
  "succeeded": [
    { "region": "EMEA", "campaignId": 3045 },
    { "region": "APAC", "campaignId": 3046 },
    { "region": "Americas", "campaignId": 3047 }
  ],
  "failed": []
}
```

---

## Bulk Activate Campaigns

### Use Case
Activate all campaigns in a program after QA approval.

### Code
```javascript
async function bulkActivate(programId) {
  // 1. List all campaigns in program
  const campaigns = await mcp__marketo__campaign_list({
    folder: JSON.stringify({ id: programId, type: 'Program' })
  });

  // 2. Filter to inactive trigger campaigns
  const toActivate = campaigns.campaigns.filter(
    c => c.type === 'trigger' && !c.isActive
  );

  // 3. Validate each has triggers
  const validated = [];
  for (const campaign of toActivate) {
    const smartList = await mcp__marketo__campaign_get_smart_list({
      campaignId: campaign.id,
      includeRules: true
    });

    if (smartList.triggers?.length > 0) {
      validated.push(campaign);
    } else {
      console.warn(`Skipping ${campaign.name}: No triggers`);
    }
  }

  // 4. Activate validated campaigns
  const results = { activated: [], skipped: [], failed: [] };

  for (const campaign of validated) {
    try {
      await mcp__marketo__campaign_activate({
        campaignId: campaign.id
      });
      results.activated.push(campaign.id);
      await sleep(200);
    } catch (error) {
      results.failed.push({
        campaignId: campaign.id,
        error: error.message
      });
    }
  }

  return results;
}
```

---

## Cleanup Old Campaigns

### Use Case
Delete inactive campaigns that haven't been updated in 365 days.

### Code
```javascript
async function cleanupOldCampaigns(folderId, daysOld = 365) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  // 1. Find old campaigns
  const campaigns = await mcp__marketo__campaign_list({
    folder: JSON.stringify({ id: folderId, type: 'Folder' }),
    latestUpdatedAt: cutoffDate.toISOString()
  });

  // 2. Filter to inactive only
  const candidates = campaigns.campaigns.filter(
    c => !c.isActive && c.status !== 'Scheduled'
  );

  console.log(`Found ${candidates.length} cleanup candidates`);

  // 3. Delete with safety checks
  const results = { deleted: [], skipped: [], failed: [] };

  for (const campaign of candidates) {
    // Safety check: skip system campaigns
    if (campaign.isSystem) {
      results.skipped.push({
        id: campaign.id,
        reason: 'System campaign'
      });
      continue;
    }

    try {
      await mcp__marketo__campaign_delete({
        campaignId: campaign.id
      });
      results.deleted.push(campaign.id);
      await sleep(300);
    } catch (error) {
      results.failed.push({
        id: campaign.id,
        error: error.message
      });
    }
  }

  return results;
}
```

---

## Duplicate Program Campaigns

### Use Case
Copy all campaigns from one program to another for a new quarter.

### Code
```javascript
async function duplicateProgram(sourceProgram, targetProgram) {
  // 1. Get all campaigns from source
  const sourceCampaigns = await mcp__marketo__campaign_list({
    folder: JSON.stringify({ id: sourceProgram, type: 'Program' })
  });

  // 2. Clone each to target
  const results = [];

  for (const campaign of sourceCampaigns.campaigns) {
    try {
      const cloned = await mcp__marketo__campaign_clone({
        campaignId: campaign.id,
        name: campaign.name,  // Same name in new program
        folder: { id: targetProgram, type: 'Program' },
        description: campaign.description
      });

      results.push({
        source: campaign.id,
        target: cloned.campaign?.id,
        name: campaign.name,
        success: true
      });
    } catch (error) {
      results.push({
        source: campaign.id,
        name: campaign.name,
        success: false,
        error: error.message
      });
    }

    await sleep(200);
  }

  return {
    sourceProgram,
    targetProgram,
    total: sourceCampaigns.campaigns.length,
    succeeded: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    campaigns: results
  };
}
```

---

## Rename Campaigns in Bulk

### Use Case
Update campaign names to follow new naming convention.

### Code
```javascript
async function renameCampaigns(campaignIds, prefix) {
  const results = [];

  for (const campaignId of campaignIds) {
    try {
      // Get current name
      const current = await mcp__marketo__campaign_get({
        campaignId
      });

      const oldName = current.campaign.name;
      const newName = `${prefix} - ${oldName}`;

      // Update
      await mcp__marketo__campaign_update({
        campaignId,
        name: newName
      });

      results.push({
        campaignId,
        oldName,
        newName,
        success: true
      });
    } catch (error) {
      results.push({
        campaignId,
        success: false,
        error: error.message
      });
    }

    await sleep(200);
  }

  return results;
}

// Usage
const renamed = await renameCampaigns(
  [3001, 3002, 3003],
  '2026 Q1'
);
```

---

## Deactivate All Active Campaigns

### Use Case
Emergency shutdown of all campaigns in a program.

### Code
```javascript
async function emergencyShutdown(programId) {
  // 1. Find all active campaigns
  const campaigns = await mcp__marketo__campaign_list({
    folder: JSON.stringify({ id: programId, type: 'Program' })
  });

  const active = campaigns.campaigns.filter(c => c.isActive);

  console.log(`⚠️ Deactivating ${active.length} campaigns`);

  // 2. Deactivate all
  const results = { deactivated: [], failed: [] };

  for (const campaign of active) {
    try {
      await mcp__marketo__campaign_deactivate({
        campaignId: campaign.id
      });
      results.deactivated.push({
        id: campaign.id,
        name: campaign.name
      });
      console.log(`✓ Deactivated: ${campaign.name}`);
    } catch (error) {
      results.failed.push({
        id: campaign.id,
        name: campaign.name,
        error: error.message
      });
    }
  }

  return results;
}
```

---

## Template Registry Management

### Use Case
Maintain a registry of campaign templates for easy cloning.

### Code
```javascript
const TEMPLATE_REGISTRY = {
  welcome: {
    id: 1001,
    name: 'Template - Welcome Series',
    tokens: ['my.WelcomeEmail', 'my.FollowupDelay']
  },
  formResponse: {
    id: 1002,
    name: 'Template - Form Response',
    tokens: ['my.FormId', 'my.ResponseEmail']
  },
  apiTriggered: {
    id: 1003,
    name: 'Template - API Triggered',
    tokens: ['my.EmailId', 'my.Subject']
  }
};

async function createFromTemplate(templateKey, programId, campaignName) {
  const template = TEMPLATE_REGISTRY[templateKey];

  if (!template) {
    throw new Error(`Unknown template: ${templateKey}`);
  }

  // Validate template still exists
  const exists = await mcp__marketo__campaign_get({
    campaignId: template.id
  });

  if (!exists.success) {
    throw new Error(`Template ${template.name} not found in Marketo`);
  }

  // Clone
  const result = await mcp__marketo__campaign_clone({
    campaignId: template.id,
    name: campaignName,
    folder: { id: programId, type: 'Program' },
    description: `Created from ${template.name} template`
  });

  return {
    campaign: result.campaign,
    template: templateKey,
    requiredTokens: template.tokens
  };
}

// Usage
const campaign = await createFromTemplate(
  'welcome',
  2000,
  '2026 Q1 Welcome Campaign'
);
console.log(`Created campaign ${campaign.campaign.id}`);
console.log(`Update these tokens: ${campaign.requiredTokens.join(', ')}`);
```

---

## Utility Functions

```javascript
// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Chunk array into batches
function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Process with rate limiting
async function processWithRateLimit(items, operation, options = {}) {
  const { concurrency = 3, delay = 200 } = options;
  const results = [];

  const batches = chunk(items, concurrency);

  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(item => operation(item).catch(e => ({ error: e })))
    );
    results.push(...batchResults);
    await sleep(delay);
  }

  return results;
}
```
