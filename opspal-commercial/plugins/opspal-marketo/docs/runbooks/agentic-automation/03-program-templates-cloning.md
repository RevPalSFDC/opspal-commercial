# 03 - Program Templates & Clone Strategies

## Overview

Program cloning enables rapid campaign deployment by duplicating pre-configured program templates. The clone operation copies all local assets (emails, forms, landing pages) and smart campaigns while preserving the program structure.

## MCP Tools

### Clone Program
```javascript
mcp__marketo__program_clone({
  programId: 1234,                    // Source program ID
  name: 'Q1 2026 Webinar - AI Marketing',
  folder: { id: 5678, type: 'Folder' }, // Destination folder (NOT Program)
  description: 'Cloned for Q1 AI webinar campaign'
})
```

**Response:**
```json
{
  "success": true,
  "result": [{
    "id": 2001,
    "name": "Q1 2026 Webinar - AI Marketing",
    "description": "Cloned for Q1 AI webinar campaign",
    "type": "Default",
    "channel": "Webinar",
    "status": "unlocked",
    "workspace": "Default",
    "folder": {
      "type": "Folder",
      "value": 5678,
      "folderName": "Q1 Campaigns"
    },
    "createdAt": "2026-01-15T10:30:00Z",
    "updatedAt": "2026-01-15T10:30:00Z"
  }]
}
```

### Get Program Details
```javascript
mcp__marketo__program_get({ programId: 2001 })
```

### List Programs
```javascript
mcp__marketo__program_list({
  workspace: 'Default',
  maxReturn: 200,
  offset: 0,
  filterType: 'name',    // Optional: 'id', 'name', 'type'
  filterValues: 'Webinar'
})
```

## REST API Endpoints

### Clone Program
```
POST /rest/asset/v1/program/{id}/clone.json
Content-Type: application/x-www-form-urlencoded

name=Q1%202026%20Webinar&folder={"id":5678,"type":"Folder"}&description=Cloned%20for%20Q1
```

### Get Program
```
GET /rest/asset/v1/program/{id}.json
```

### Browse Programs
```
GET /rest/asset/v1/programs.json?maxReturn=200&offset=0
```

## What Gets Cloned

### Included in Clone
| Asset Type | Behavior |
|------------|----------|
| Emails | Duplicated as local assets |
| Landing Pages | Duplicated with new URLs |
| Forms | Duplicated as local assets |
| Smart Campaigns | Duplicated (inactive by default) |
| My Tokens | Copied with current values |
| Reports | Duplicated as local assets |
| Smart Lists | Duplicated as local assets |
| Tags | Copied to new program |

### NOT Included in Clone
| Item | Reason |
|------|--------|
| Members | Only structure is cloned |
| Campaign history | Fresh start |
| Activity logs | Only forward tracking |
| Approval status | All assets return to draft |
| Scheduled runs | Must be re-scheduled |

## Clone Restrictions

### Cannot Clone
- **Across workspaces**: Source and destination must be same workspace
- **To Program type folder**: Destination must be `type: 'Folder'`, not `type: 'Program'`
- **Email Programs with A/B tests**: Complex internal dependencies
- **Programs with mobile push**: Platform restrictions
- **Programs with social assets**: Deprecated feature

### Special Handling Required
```javascript
// ❌ WRONG - Cannot clone to a Program
folder: { id: 1234, type: 'Program' }

// ✅ CORRECT - Clone to a Folder
folder: { id: 5678, type: 'Folder' }
```

## Template Design Best Practices

### Naming Conventions
```
[Type] Template - [Description]
Examples:
- Webinar Template - Standard 3-Email
- Event Template - Regional Roadshow
- Nurture Template - 6-Touch Product
```

### Token Placeholders
Include placeholder tokens that will be updated after cloning:
```javascript
// Template tokens (to be replaced)
{{my.EventName}}     → "Your Event Name Here"
{{my.EventDate}}     → "YYYY-MM-DD"
{{my.SpeakerName}}   → "Speaker Full Name"
{{my.RegistrationURL}} → "https://your-url.com"
```

### Asset Naming in Templates
Use consistent naming that indicates purpose:
```
[Program Token Reference] - [Asset Type] - [Purpose]
Examples:
- {{my.EventName}} - Email - Invite 1
- {{my.EventName}} - LP - Registration
- {{my.EventName}} - Form - Signup
```

## Agentic Workflow Pattern

### Complete Clone + Setup Workflow
```javascript
// 1. Identify source template
const templates = await mcp__marketo__program_list({
  filterType: 'name',
  filterValues: 'Webinar Template'
});
const templateId = templates.result[0].id;

// 2. Clone program
const newProgram = await mcp__marketo__program_clone({
  programId: templateId,
  name: 'Q1 2026 Webinar - AI in Marketing',
  folder: { id: targetFolderId, type: 'Folder' },
  description: 'AI Marketing webinar for Q1'
});

// 3. Update tokens with campaign-specific values
await mcp__marketo__program_tokens_update({
  folderId: newProgram.result[0].id,
  folderType: 'Program',
  tokens: [
    { name: 'my.EventName', type: 'text', value: 'AI in Marketing Webinar' },
    { name: 'my.EventDate', type: 'date', value: '2026-02-20' },
    { name: 'my.SpeakerName', type: 'text', value: 'Dr. Jane Smith' },
    { name: 'my.RegistrationURL', type: 'text', value: 'https://company.com/ai-webinar' }
  ]
});

// 4. Get cloned assets to approve
const programDetails = await mcp__marketo__program_get({
  programId: newProgram.result[0].id
});

// 5. Approve assets in order: Forms → Emails → LPs
// (Asset IDs from programDetails)

// 6. Activate trigger campaigns (if applicable)
```

### Bulk Clone Pattern
```javascript
// Clone multiple programs from same template
const campaigns = [
  { name: 'Q1 Webinar - AI Marketing', date: '2026-02-20' },
  { name: 'Q1 Webinar - Sales Tech', date: '2026-02-27' },
  { name: 'Q1 Webinar - Data Analytics', date: '2026-03-06' }
];

for (const campaign of campaigns) {
  // Clone
  const program = await mcp__marketo__program_clone({
    programId: templateId,
    name: campaign.name,
    folder: { id: q1FolderId, type: 'Folder' }
  });

  // Update tokens
  await mcp__marketo__program_tokens_update({
    folderId: program.result[0].id,
    folderType: 'Program',
    tokens: [
      { name: 'my.EventName', type: 'text', value: campaign.name },
      { name: 'my.EventDate', type: 'date', value: campaign.date }
    ]
  });

  // Rate limit awareness - pause between operations
  await new Promise(resolve => setTimeout(resolve, 200));
}
```

## Template Categories

### Standard Template Types
| Type | Use Case | Typical Assets |
|------|----------|----------------|
| Webinar | Online events | 3 emails, LP, form, trigger campaigns |
| Event | In-person events | 4 emails, LP, form, scoring |
| Nurture | Drip campaigns | 6+ emails, engagement program |
| Content | Asset downloads | Email, LP, form, scoring |
| Newsletter | Regular sends | Email template only |
| Operational | System emails | Transactional emails |

### Template Folder Structure
```
Marketing Programs/
├── Templates/
│   ├── Webinar Template - Standard
│   ├── Event Template - Regional
│   ├── Nurture Template - 6-Touch
│   └── Content Template - Gated Asset
├── Q1 2026/
│   ├── Webinars/
│   └── Events/
└── Q2 2026/
    ├── Webinars/
    └── Events/
```

## Agent Routing

| Task | Agent |
|------|-------|
| Program cloning | `marketo-program-architect` |
| Template design | `marketo-program-architect` |
| Multi-program workflows | `marketo-automation-orchestrator` |
| Asset configuration | `marketo-email-specialist`, `marketo-form-builder`, `marketo-landing-page-manager` |

## Common Clone Errors

| Error | Cause | Solution |
|-------|-------|----------|
| 611 | System error | Retry after delay |
| 702 | Asset not found | Verify template exists |
| 709 | Folder type invalid | Use `type: 'Folder'` not `'Program'` |
| 710 | Cross-workspace clone | Use same workspace |
| 1003 | Name already exists | Use unique program name |

## Limitations

- Cannot modify smart campaign flow steps via API after clone
- A/B test configurations must be set manually
- Engagement programs require additional setup for streams
- Cannot clone across workspaces
- Some asset approvals may require manual intervention

