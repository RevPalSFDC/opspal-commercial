---
name: hubspot-automation-actions
description: HubSpot Automation Actions V4 API patterns for creating custom workflow actions, action functions, and callback handling.
---

# HubSpot Automation Actions V4 Skill

Comprehensive knowledge base for creating custom workflow actions via HubSpot's Automation Actions V4 API.

## Skill Documents

| Document | Purpose |
|----------|---------|
| `action-patterns.md` | Common action patterns and templates |
| `function-reference.md` | Action function types and examples |
| `callback-handling.md` | Callback completion and state management |

## Quick Decision Matrix

### When to Use Which Agent

| Task | Route To |
|------|----------|
| Create custom workflow action | `hubspot-custom-action-builder` |
| Build workflows using actions | `hubspot-workflow-builder` |
| Complete workflow callbacks | `hubspot-callback-orchestrator` |
| Create HubSpot apps | `hubspot-app-developer` |
| Deploy serverless functions | `hubspot-cms-theme-manager` |

### When to Use Custom Actions vs Built-in Actions

| Scenario | Use Custom Action | Use Built-in Action |
|----------|-------------------|---------------------|
| External API integration | Yes | No |
| Third-party service calls | Yes | No |
| Complex business logic | Yes | Maybe |
| Simple property updates | No | Yes |
| Email sending | No | Yes (native) |
| Internal HubSpot operations | No | Yes |

## API Overview

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/automation/v4/actions/{appId}` | POST | Create action |
| `/automation/v4/actions/{appId}` | GET | List actions |
| `/automation/v4/actions/{appId}/{definitionId}` | GET | Get action |
| `/automation/v4/actions/{appId}/{definitionId}` | PATCH | Update action |
| `/automation/v4/actions/{appId}/{definitionId}` | DELETE | Delete action |
| `/automation/v4/actions/{appId}/{definitionId}/functions/{functionType}` | PUT | Add function |
| `/automation/v4/actions/{appId}/{definitionId}/functions/{functionType}` | DELETE | Remove function |
| `/automation/v4/actions/callbacks/{callbackId}/complete` | POST | Complete callback |

### Required Scopes

- `automation` - Required for all action operations

## Core Concepts

### 1. Action Definition

A custom action definition includes:

```json
{
  "actionUrl": "https://your-service.com/webhook",
  "objectTypes": ["CONTACT", "DEAL"],
  "inputFields": [...],
  "outputFields": [...],
  "labels": {...},
  "executionRules": [...],
  "published": false
}
```

### 2. Input Fields

Configure what data workflow users can provide:

```json
{
  "typeDefinition": {
    "name": "email_address",
    "type": "string",
    "fieldType": "text"
  },
  "isRequired": true,
  "supportedValueTypes": ["STATIC_VALUE", "OBJECT_PROPERTY"]
}
```

**Field Types:**

| Type | Description | Use For |
|------|-------------|---------|
| `string` | Text | Emails, names, messages |
| `number` | Numeric | Scores, amounts, counts |
| `bool` | Boolean | Flags, toggles |
| `date` | Date only | Due dates, birthdates |
| `datetime` | Date + time | Scheduled times |
| `enumeration` | Dropdown | Status, priority, type |
| `phone_number` | Phone | Contact numbers |
| `object_coordinates` | HubSpot record | Record references |

**Supported Value Types:**

| Type | Description |
|------|-------------|
| `STATIC_VALUE` | User enters fixed value |
| `OBJECT_PROPERTY` | Value from CRM property |
| `TOKEN` | Dynamic token |

### 3. Output Fields

Define what data your action returns for workflow branching:

```json
{
  "typeDefinition": {
    "name": "status",
    "type": "enumeration",
    "options": [
      { "value": "success", "label": "Success" },
      { "value": "failed", "label": "Failed" }
    ]
  }
}
```

### 4. Action Functions

Serverless functions that run at specific points:

| Function Type | When It Runs | Purpose |
|--------------|--------------|---------|
| `PRE_ACTION_EXECUTION` | Before calling actionUrl | Modify request payload |
| `PRE_FETCH_OPTIONS` | Before fetching external options | Customize option request |
| `POST_FETCH_OPTIONS` | After fetching external options | Transform response |

**PRE_ACTION_EXECUTION Example:**

```javascript
exports.main = async (event) => {
  const { email, priority } = event.fields;

  return {
    email: email.toLowerCase(),
    priority,
    timestamp: new Date().toISOString(),
    source: 'hubspot-workflow'
  };
};
```

**POST_FETCH_OPTIONS Example:**

```javascript
exports.main = async (event) => {
  // Transform external API response to HubSpot format
  return event.options.map(item => ({
    label: item.name,
    value: item.id,
    description: item.description
  }));
};
```

### 5. Execution Rules

Custom error messages based on output:

```json
{
  "conditions": [
    {
      "propertyName": "status",
      "operator": "EQ",
      "value": "invalid_email"
    }
  ],
  "effect": {
    "type": "ERROR",
    "message": "The email address provided is invalid"
  }
}
```

### 6. Labels

Multi-language support (14 languages):

```json
{
  "en": {
    "actionName": "Enrich Contact",
    "actionDescription": "Enriches contact with company data",
    "actionCardContent": "Enriches {{inputFields.email}}",
    "inputFieldLabels": {
      "email": "Email Address",
      "level": "Enrichment Level"
    }
  },
  "es": {
    "actionName": "Enriquecer Contacto",
    "actionDescription": "Enriquece contacto con datos de empresa"
  }
}
```

**Supported Languages:**
`en`, `fr`, `de`, `es`, `pt-br`, `ja`, `nl`, `it`, `pl`, `fi`, `sv`, `zh-cn`, `zh-tw`, `ko`

## Webhook Request Format

Your action URL receives POST requests:

```json
{
  "callbackId": "callback-abc123",
  "origin": {
    "portalId": 12345,
    "actionDefinitionId": "def456"
  },
  "object": {
    "objectType": "CONTACT",
    "objectId": "789",
    "properties": {
      "email": "user@example.com",
      "firstname": "John",
      "lastname": "Doe"
    }
  },
  "inputFields": {
    "email_address": "user@example.com",
    "priority": "high"
  }
}
```

## Response Formats

### Synchronous Response

```json
{
  "outputFields": {
    "status": "success",
    "company_name": "Acme Corp",
    "industry": "Technology"
  }
}
```

### Asynchronous (BLOCK) Response

```json
{
  "hs_execution_state": "BLOCK",
  "hs_expiration_duration": "P1D"
}
```

Then complete later:

```json
POST /automation/v4/actions/callbacks/{callbackId}/complete
{
  "outputFields": {
    "status": "success"
  }
}
```

## Common Patterns

### 1. Email Verification Action

```javascript
{
  actionUrl: 'https://verify.example.com/email',
  objectTypes: ['CONTACT'],
  inputFields: [
    { name: 'email', type: 'string', required: true }
  ],
  outputFields: [
    { name: 'valid', type: 'bool' },
    { name: 'deliverable', type: 'enumeration', options: ['yes', 'no', 'unknown'] },
    { name: 'risk_score', type: 'number' }
  ]
}
```

### 2. Data Enrichment Action

```javascript
{
  actionUrl: 'https://enrich.example.com/company',
  objectTypes: ['CONTACT', 'COMPANY'],
  inputFields: [
    { name: 'domain', type: 'string' },
    { name: 'enrichment_level', type: 'enumeration', options: ['basic', 'full', 'premium'] }
  ],
  outputFields: [
    { name: 'company_name', type: 'string' },
    { name: 'employee_count', type: 'number' },
    { name: 'industry', type: 'string' },
    { name: 'revenue_range', type: 'string' }
  ]
}
```

### 3. Notification Action

```javascript
{
  actionUrl: 'https://notify.example.com/send',
  objectTypes: ['DEAL', 'TICKET'],
  inputFields: [
    { name: 'channel', type: 'string', required: true },
    { name: 'message', type: 'string', format: 'textarea' },
    { name: 'priority', type: 'enumeration', options: ['normal', 'urgent', 'critical'] }
  ],
  outputFields: [
    { name: 'sent', type: 'bool' },
    { name: 'message_id', type: 'string' },
    { name: 'timestamp', type: 'datetime' }
  ]
}
```

### 4. External Lookup Action

```javascript
{
  actionUrl: 'https://lookup.example.com/data',
  objectTypes: ['CONTACT'],
  inputFields: [
    {
      name: 'data_source',
      type: 'enumeration',
      optionsUrl: 'https://lookup.example.com/sources',
      optionsReferenceType: 'OPTION'
    },
    { name: 'lookup_key', type: 'string', required: true }
  ],
  outputFields: [
    { name: 'found', type: 'bool' },
    { name: 'result_data', type: 'string' }
  ]
}
```

## Best Practices

### 1. Action URL

- Always use HTTPS
- Implement proper error handling
- Return responses within 30 seconds
- Use async (BLOCK) for long operations

### 2. Input Fields

- Use descriptive names (snake_case)
- Mark truly required fields only
- Provide sensible defaults for enumerations
- Use appropriate field types

### 3. Output Fields

- Include status/success indicator
- Return useful data for branching
- Use enumeration for categorical outcomes
- Keep field names consistent

### 4. Error Handling

- Use execution rules for user-friendly errors
- Return clear error messages
- Log errors for debugging
- Handle timeouts gracefully

### 5. Security

- Validate incoming requests
- Verify callback IDs
- Sanitize input data
- Use secrets for sensitive data

## Related Skills

- `skills/hubspot-workflow-patterns/` - Workflow automation patterns
- `skills/hubspot-agent-standards/` - API patterns and rate limits
- `skills/hubspot-developer-platform/` - App development
