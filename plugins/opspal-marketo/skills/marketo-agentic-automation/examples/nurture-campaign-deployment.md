# Example: Nurture Campaign Deployment

Complete example of deploying a multi-touch nurture program with bulk lead import.

## Configuration

```javascript
const nurtureConfig = {
  templateProgramId: 2001,  // 6-touch nurture template
  campaignName: 'Q1 2026 Product Nurture - Enterprise',
  targetFolderId: 5001,
  nurtureDetails: {
    audienceSegment: 'Enterprise Prospects',
    contentTheme: 'Digital Transformation',
    cadence: 'Weekly',
    touches: 6
  },
  initialLeads: {
    file: '/path/to/enterprise-leads.csv',
    count: 5000
  }
};
```

## Execution Flow

### Phase 1: Program Deployment

#### Step 1.1: Clone Nurture Template
```javascript
const program = await mcp__marketo__program_clone({
  programId: nurtureConfig.templateProgramId,
  name: nurtureConfig.campaignName,
  folder: { id: nurtureConfig.targetFolderId, type: 'Folder' }
});
const programId = program.result[0].id;
```

#### Step 1.2: Configure Tokens
```javascript
await mcp__marketo__program_tokens_update({
  folderId: programId,
  folderType: 'Program',
  tokens: [
    { name: 'my.NurtureName', type: 'text', value: nurtureConfig.campaignName },
    { name: 'my.AudienceSegment', type: 'text', value: nurtureConfig.nurtureDetails.audienceSegment },
    { name: 'my.ContentTheme', type: 'text', value: nurtureConfig.nurtureDetails.contentTheme },
    { name: 'my.Touch1Subject', type: 'text', value: 'Start Your Digital Journey' },
    { name: 'my.Touch2Subject', type: 'text', value: 'Key Success Factors' },
    { name: 'my.Touch3Subject', type: 'text', value: 'Customer Stories' },
    { name: 'my.Touch4Subject', type: 'text', value: 'ROI Calculator' },
    { name: 'my.Touch5Subject', type: 'text', value: 'Expert Consultation' },
    { name: 'my.Touch6Subject', type: 'text', value: 'Special Offer' }
  ]
});
```

#### Step 1.3: Approve All Assets
```javascript
const details = await mcp__marketo__program_get({ programId });

// Approve all emails (6 touch emails + operational)
for (const email of details.result[0].emails) {
  await mcp__marketo__email_approve({ emailId: email.id });
  await sleep(200);
}
console.log(`✓ ${details.result[0].emails.length} emails approved`);
```

### Phase 2: Lead Import

#### Step 2.1: Import Initial Leads
```javascript
const importResult = await mcp__marketo__bulk_lead_import_create({
  file: nurtureConfig.initialLeads.file,
  format: 'csv',
  lookupField: 'email',
  listId: programId  // Add directly to program static list
});

console.log(`Import started: Batch ${importResult.result[0].batchId}`);
```

#### Step 2.2: Monitor Import
```javascript
let importStatus = 'Queued';
while (importStatus !== 'Complete') {
  await sleep(10000);
  const status = await mcp__marketo__bulk_import_status({
    batchId: importResult.result[0].batchId
  });
  importStatus = status.result[0].status;
  console.log(`Import status: ${importStatus} (${status.result[0].numOfLeadsProcessed} processed)`);
}
```

#### Step 2.3: Handle Failures
```javascript
const statusFinal = await mcp__marketo__bulk_import_status({
  batchId: importResult.result[0].batchId
});

if (statusFinal.result[0].numOfRowsFailed > 0) {
  const failures = await mcp__marketo__bulk_import_failures({
    batchId: importResult.result[0].batchId
  });
  console.log(`⚠️ ${statusFinal.result[0].numOfRowsFailed} rows failed`);
  // Save failures for review
}
```

### Phase 3: Campaign Activation

#### Step 3.1: Activate Trigger Campaigns
```javascript
for (const campaign of details.result[0].smartCampaigns) {
  if (campaign.type === 'trigger') {
    await mcp__marketo__campaign_activate({ campaignId: campaign.id });
    console.log(`✓ Trigger activated: ${campaign.name}`);
  }
  await sleep(200);
}
```

#### Step 3.2: Request Initial Send (Optional)
```javascript
// Trigger first touch for imported leads
const firstTouchCampaign = details.result[0].smartCampaigns
  .find(c => c.name.includes('Touch 1'));

if (firstTouchCampaign) {
  // Get lead IDs from import
  const leads = await mcp__marketo__lead_query({
    filterType: 'listId',
    filterValues: [programId.toString()],
    fields: ['id']
  });

  // Request campaign in batches of 100
  for (let i = 0; i < leads.result.length; i += 100) {
    const batch = leads.result.slice(i, i + 100);
    await mcp__marketo__campaign_request({
      campaignId: firstTouchCampaign.id,
      leads: batch.map(l => ({ id: l.id }))
    });
    await sleep(200);
  }
}
```

## Expected Output

```
Phase 1: Program Deployment
✓ Program cloned: ID 3001
✓ 9 tokens configured
✓ 8 emails approved
✓ 2 forms approved
✓ 2 landing pages approved

Phase 2: Lead Import
✓ Import started: Batch import-abc123
✓ Status: Importing (2500 processed)
✓ Status: Complete (5000 processed)
⚠️ 23 rows failed (saved to failures.csv)

Phase 3: Campaign Activation
✓ Trigger activated: 01 - Add to Nurture
✓ Trigger activated: 02 - Touch 1 Send
✓ Trigger activated: 03 - Touch 2 Send
✓ Trigger activated: 04 - Touch 3 Send
✓ Trigger activated: 05 - Touch 4 Send
✓ Trigger activated: 06 - Touch 5 Send
✓ Trigger activated: 07 - Touch 6 Send
✓ Trigger activated: 08 - Conversion Handler

Summary:
- Program: Q1 2026 Product Nurture - Enterprise (ID: 3001)
- Leads imported: 4,977
- Failed imports: 23
- Campaigns active: 8
- First touch: Scheduled for immediate send
```

## Timeline

| Phase | Duration |
|-------|----------|
| Clone + Tokens | ~3s |
| Asset Approval (12 assets) | ~5s |
| Lead Import (5,000) | ~2-5 min |
| Campaign Activation | ~3s |
| **Total** | **~5-6 minutes** |

## Monitoring After Launch

```javascript
// Daily activity export to track nurture progress
const activityExport = await mcp__marketo__bulk_activity_export_create({
  activityTypeIds: [6, 7, 10, 11],  // Email activities
  filter: {
    createdAt: {
      startAt: yesterday.toISOString(),
      endAt: today.toISOString()
    }
  }
});
```
