# Program Token Patterns

Quick reference for dynamic program token management via API.

## Token Types

| Type | Format | Example |
|------|--------|---------|
| text | String | "Welcome Event" |
| number | Integer/Decimal | 100, 99.99 |
| date | YYYY-MM-DD | "2026-02-15" |
| rich text | HTML | "<p>Welcome</p>" |
| score | Integer | 50 |

## MCP Tools

### Get Tokens
```javascript
mcp__marketo__program_tokens_get({
  folderId: 1234,
  folderType: 'Program'
})
```

### Update Tokens
```javascript
mcp__marketo__program_tokens_update({
  folderId: 1234,
  folderType: 'Program',
  tokens: [
    { name: 'my.EventName', type: 'text', value: 'March Summit' },
    { name: 'my.EventDate', type: 'date', value: '2026-03-20' }
  ]
})
```

## Naming Conventions

```
{{my.EventName}}        - Event/campaign name
{{my.EventDate}}        - Date in YYYY-MM-DD
{{my.EventTime}}        - Time with timezone
{{my.SpeakerName}}      - Person name
{{my.RegistrationURL}}  - Full URL
{{my.FollowupDelay}}    - Number for wait steps
```

## Common Token Sets

### Webinar Program
```javascript
tokens: [
  { name: 'my.WebinarTitle', type: 'text', value: '' },
  { name: 'my.WebinarDate', type: 'date', value: '' },
  { name: 'my.WebinarTime', type: 'text', value: '' },
  { name: 'my.SpeakerName', type: 'text', value: '' },
  { name: 'my.SpeakerTitle', type: 'text', value: '' },
  { name: 'my.RegistrationLink', type: 'text', value: '' },
  { name: 'my.JoinLink', type: 'text', value: '' }
]
```

### Content Program
```javascript
tokens: [
  { name: 'my.ContentTitle', type: 'text', value: '' },
  { name: 'my.ContentDescription', type: 'rich text', value: '' },
  { name: 'my.DownloadLink', type: 'text', value: '' },
  { name: 'my.ContentType', type: 'text', value: '' }
]
```

### Event Program
```javascript
tokens: [
  { name: 'my.EventName', type: 'text', value: '' },
  { name: 'my.EventDate', type: 'date', value: '' },
  { name: 'my.EventTime', type: 'text', value: '' },
  { name: 'my.EventLocation', type: 'text', value: '' },
  { name: 'my.EventAddress', type: 'rich text', value: '' },
  { name: 'my.RegistrationDeadline', type: 'date', value: '' }
]
```

## Limitations

- Token names max 50 characters
- Cannot rename tokens (delete and recreate)
- Only "My Tokens" modifiable via API
- System tokens are read-only
