# Clone Strategies

Quick reference for program cloning patterns and best practices.

## Clone Command

```javascript
mcp__marketo__program_clone({
  programId: 1234,          // Source template ID
  name: 'New Program Name', // Must be unique
  folder: { id: 5678, type: 'Folder' },  // MUST be 'Folder' type!
  description: 'Optional description'
})
```

## Critical Rules

### ✅ DO
```javascript
// Correct: Clone to a Folder
folder: { id: 5678, type: 'Folder' }
```

### ❌ DON'T
```javascript
// Wrong: Cannot clone to a Program
folder: { id: 1234, type: 'Program' }
```

## What Gets Cloned

| Included | Not Included |
|----------|--------------|
| Emails | Members |
| Landing Pages | Campaign history |
| Forms | Activity logs |
| Smart Campaigns | Approval status |
| My Tokens | Scheduled runs |
| Reports | |
| Smart Lists | |
| Tags | |

## Clone Restrictions

Cannot clone:
- Across workspaces
- Email Programs with A/B tests
- Programs with mobile push assets
- Programs with social assets

## Post-Clone Workflow

```javascript
// 1. Clone program
const program = await mcp__marketo__program_clone({...});
const programId = program.result[0].id;

// 2. Update tokens
await mcp__marketo__program_tokens_update({
  folderId: programId,
  folderType: 'Program',
  tokens: [...]
});

// 3. Approve assets (order matters!)
// Forms first
await mcp__marketo__form_approve({ formId: x });
// Emails second
await mcp__marketo__email_approve({ emailId: y });
// Landing pages third
await mcp__marketo__landing_page_approve({ landingPageId: z });

// 4. Activate campaigns
await mcp__marketo__campaign_activate({ campaignId: c });
```

## Template Organization

```
Marketing Programs/
├── Templates/
│   ├── Webinar Template - Standard
│   ├── Event Template - Regional
│   └── Nurture Template - 6-Touch
└── Q1 2026/
    ├── Webinars/
    └── Events/
```

## Batch Cloning

For multiple campaigns:
```javascript
for (const campaign of campaigns) {
  // Clone
  const program = await mcp__marketo__program_clone({
    programId: templateId,
    name: campaign.name,
    folder: { id: campaign.folderId, type: 'Folder' }
  });

  // Update tokens
  await mcp__marketo__program_tokens_update({
    folderId: program.result[0].id,
    folderType: 'Program',
    tokens: campaign.tokens
  });

  // Pause for rate limits
  await new Promise(r => setTimeout(r, 500));
}
```
