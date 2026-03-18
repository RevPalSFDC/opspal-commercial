# Example: Webinar Program Setup

Complete example of autonomous webinar campaign deployment.

## Configuration

```javascript
const webinarConfig = {
  templateProgramId: 1001,
  campaignName: 'Q1 2026 Webinar - AI in Marketing',
  targetFolderId: 5000,
  webinarDetails: {
    title: 'Leveraging AI for Modern Marketing',
    date: '2026-02-20',
    time: '2:00 PM EST',
    speaker: {
      name: 'Dr. Jane Smith',
      title: 'VP of Marketing Innovation',
      bio: '<p>15 years in marketing technology...</p>'
    },
    registrationUrl: 'https://company.com/webinars/ai-marketing'
  },
  scheduleInvite: '2026-02-10T09:00:00Z'
};
```

## Execution Flow

### Step 1: Clone Program
```javascript
const program = await mcp__marketo__program_clone({
  programId: webinarConfig.templateProgramId,
  name: webinarConfig.campaignName,
  folder: { id: webinarConfig.targetFolderId, type: 'Folder' }
});
const programId = program.result[0].id;
// Result: Program ID 2045
```

### Step 2: Configure Tokens
```javascript
await mcp__marketo__program_tokens_update({
  folderId: programId,
  folderType: 'Program',
  tokens: [
    { name: 'my.WebinarTitle', type: 'text', value: webinarConfig.webinarDetails.title },
    { name: 'my.WebinarDate', type: 'date', value: webinarConfig.webinarDetails.date },
    { name: 'my.WebinarTime', type: 'text', value: webinarConfig.webinarDetails.time },
    { name: 'my.SpeakerName', type: 'text', value: webinarConfig.webinarDetails.speaker.name },
    { name: 'my.SpeakerTitle', type: 'text', value: webinarConfig.webinarDetails.speaker.title },
    { name: 'my.SpeakerBio', type: 'rich text', value: webinarConfig.webinarDetails.speaker.bio },
    { name: 'my.RegistrationURL', type: 'text', value: webinarConfig.webinarDetails.registrationUrl }
  ]
});
```

### Step 3: Discover Assets
```javascript
const details = await mcp__marketo__program_get({ programId });
// Result: 3 emails, 2 forms, 1 LP, 4 campaigns
```

### Step 4: Approve Assets
```javascript
// Forms first
for (const form of details.result[0].forms) {
  await mcp__marketo__form_approve({ formId: form.id });
  await sleep(200);  // Rate limit
}

// Emails second
for (const email of details.result[0].emails) {
  await mcp__marketo__email_approve({ emailId: email.id });
  await sleep(200);
}

// Landing pages third
for (const lp of details.result[0].landingPages) {
  await mcp__marketo__landing_page_approve({ landingPageId: lp.id });
  await sleep(200);
}
```

### Step 5: Activate Campaigns
```javascript
for (const campaign of details.result[0].smartCampaigns) {
  if (campaign.type === 'trigger') {
    await mcp__marketo__campaign_activate({ campaignId: campaign.id });
  } else if (campaign.type === 'batch') {
    await mcp__marketo__campaign_schedule({
      campaignId: campaign.id,
      runAt: webinarConfig.scheduleInvite
    });
  }
  await sleep(200);
}
```

## Expected Output

```
✓ Program cloned: ID 2045
✓ 7 tokens configured
✓ Assets discovered: 3 emails, 2 forms, 1 LP, 4 campaigns
✓ Forms approved: 2/2
✓ Emails approved: 3/3
✓ Landing pages approved: 1/1
✓ Triggers activated: 2/2
✓ Batch scheduled: 2/2 (Feb 10, 2026)

Program Ready: https://app.marketo.com/program/2045
Registration Page: https://pages.company.com/ai-marketing-2026
```

## Typical Timeline

| Phase | Duration |
|-------|----------|
| Clone | 1-2s |
| Tokens | 1s |
| Discovery | 1s |
| Approval (6 assets) | 2-3s |
| Activation (4 campaigns) | 1-2s |
| **Total** | **~10 seconds** |

## Error Handling

```javascript
try {
  // Execution steps...
} catch (error) {
  if (error.message.includes('[606]')) {
    // Rate limit - wait and retry
    await sleep(20000);
    // Retry operation
  } else if (error.message.includes('[1003]')) {
    // Duplicate name
    // Append timestamp to name
  }
}
```
