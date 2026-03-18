# 01 - Dynamic Program Tokens via API

## Overview

Program Tokens ("My Tokens") are reusable variables at the program or folder level. They enable dynamic personalization of emails, landing pages, and flows. The REST Asset API provides full CRUD operations on My Tokens, making them ideal for agent-driven orchestration.

## Key Concepts

- **Token Scope**: Tokens are inherited down the folder hierarchy
- **Token Types**: text, number, date, rich text, score, script
- **Naming**: Max 50 characters, starts with `{{my.`
- **API Note**: Programs are treated as folders in the API

## MCP Tools

### Get Tokens
```javascript
mcp__marketo__program_tokens_get({
  folderId: 1234,           // Program or folder ID
  folderType: 'Program'     // 'Program' or 'Folder'
})
```

**Response:**
```json
{
  "success": true,
  "tokens": [
    { "name": "my.EventName", "type": "text", "value": "February Webinar" },
    { "name": "my.EventDate", "type": "date", "value": "2026-02-15" },
    { "name": "my.RegistrationURL", "type": "text", "value": "https://..." }
  ]
}
```

### Update Tokens
```javascript
mcp__marketo__program_tokens_update({
  folderId: 1234,
  folderType: 'Program',
  tokens: [
    { name: 'my.EventName', type: 'text', value: 'March Summit' },
    { name: 'my.EventDate', type: 'date', value: '2026-03-20' },
    { name: 'my.SpeakerName', type: 'text', value: 'John Smith' }
  ]
})
```

**Notes:**
- Creates token if it doesn't exist
- Updates token if it already exists
- Token names max 50 characters

## REST API Endpoints

### Get Tokens
```
GET /rest/asset/v1/folder/{folderId}/tokens.json?folderType=Program
```

### Create/Update Token
```
POST /rest/asset/v1/folder/{folderId}/tokens.json
Content-Type: application/x-www-form-urlencoded

name=my.EventName&type=text&value=February%20Webinar&folderType=Program
```

### Delete Token
```
POST /rest/asset/v1/folder/{folderId}/tokens/delete.json
Content-Type: application/x-www-form-urlencoded

name=my.EventName&type=text&folderType=Program
```

## Token Types Reference

| Type | Format | Example |
|------|--------|---------|
| text | String | "Welcome to our event" |
| number | Integer/Decimal | 100, 99.99 |
| date | YYYY-MM-DD | "2026-02-15" |
| rich text | HTML | "&lt;p&gt;Welcome&lt;/p&gt;" |
| score | Integer | 50 |

## Agentic Workflow Pattern

### 1. Clone Program with Template Tokens
```javascript
// Clone program from template
const program = await mcp__marketo__program_clone({
  programId: templateId,
  name: 'Q1 2026 Webinar Series',
  folder: { id: targetFolderId, type: 'Folder' }
});

// Get existing tokens from cloned program
const tokens = await mcp__marketo__program_tokens_get({
  folderId: program.id,
  folderType: 'Program'
});
```

### 2. Update Tokens with Dynamic Values
```javascript
// Update tokens based on campaign parameters
await mcp__marketo__program_tokens_update({
  folderId: program.id,
  folderType: 'Program',
  tokens: [
    { name: 'my.WebinarTitle', type: 'text', value: 'AI in Marketing' },
    { name: 'my.WebinarDate', type: 'date', value: '2026-02-20' },
    { name: 'my.WebinarTime', type: 'text', value: '2:00 PM EST' },
    { name: 'my.SpeakerName', type: 'text', value: 'Jane Doe' },
    { name: 'my.SpeakerTitle', type: 'text', value: 'VP Marketing' },
    { name: 'my.RegistrationLink', type: 'text', value: 'https://company.com/webinar-reg' }
  ]
});
```

### 3. Verify Token Application
```javascript
// Verify tokens were set correctly
const updatedTokens = await mcp__marketo__program_tokens_get({
  folderId: program.id,
  folderType: 'Program'
});

// Tokens now apply to all emails/LPs in the program
```

## Best Practices

### Token Naming Conventions
```
{{my.EventName}}        - Event/campaign name
{{my.EventDate}}        - Date in YYYY-MM-DD
{{my.EventTime}}        - Time with timezone
{{my.SpeakerName}}      - Person name
{{my.RegistrationURL}}  - Full URL
{{my.FollowupDelay}}    - Number for wait steps
```

### Template Token Strategy
1. **Create standardized token sets** for each program type
2. **Document required tokens** in program description
3. **Use descriptive names** that indicate purpose
4. **Set sensible defaults** in templates

### Error Prevention
- Verify token names don't exceed 50 characters
- Use correct date format (YYYY-MM-DD)
- Ensure token type matches value format
- Check for inherited tokens before creating duplicates

## Agent Routing

**Use `marketo-program-architect`** for:
- Setting up program structures
- Managing program tokens
- Configuring program settings

**Token operations are often part of larger workflows** - consider using `marketo-automation-orchestrator` for multi-step operations.

## Limitations

- Only "My Tokens" can be modified via API
- System tokens and inherited tokens cannot be deleted
- Token names cannot be changed (must delete and recreate)
- No versioning for token changes - log values before updates
