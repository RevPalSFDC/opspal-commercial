---
name: hs-action-create
description: Interactive wizard to create a custom HubSpot workflow action
argument-hint: "[--name <name>] [--url <callback-url>] [--object <type>]"
arguments:
  - name: name
    description: Action name (optional - will prompt if not provided)
    required: false
  - name: url
    description: Action URL endpoint (optional)
    required: false
  - name: object
    description: Object type (contact, company, deal, ticket)
    required: false
---

# /hs-action-create - Custom Workflow Action Creator

Interactive wizard to create a custom HubSpot workflow action via Automation Actions V4 API.

## Usage

```bash
/hs-action-create                                    # Interactive mode
/hs-action-create --name "Enrich Contact"            # With name
/hs-action-create --url https://api.example.com/hook # With URL
/hs-action-create --object contact                   # For contacts only
```

## Prerequisites

### 1. HubSpot Developer Account

You need a HubSpot developer account with an app created:
- Go to: https://developers.hubspot.com/
- Create or select an app
- Note the App ID (needed for action creation)

### 2. Authentication

```bash
# Verify you have access token
echo $HUBSPOT_ACCESS_TOKEN

# Or use private app access token
echo $HUBSPOT_PRIVATE_APP_TOKEN
```

### 3. Required Scopes

Your app must have the `automation` scope.

## Workflow

### Step 1: Gather Action Information

Ask the user for:

1. **Action Name** - Display name in workflow editor
2. **Action Description** - What does this action do?
3. **Action URL** - HTTPS endpoint to receive requests
4. **Object Types** - Which objects can use this action?
5. **App ID** - HubSpot app ID

### Step 2: Configure Input Fields

For each input field, gather:

1. **Field Name** - API name (snake_case)
2. **Display Label** - Human-readable label
3. **Field Type** - string, number, bool, enumeration, etc.
4. **Required** - Is this field required?
5. **Options** - For enumeration fields, list of options

**Common Input Field Templates:**

```
Email Field:
  name: email_address
  type: string
  required: true

Dropdown Field:
  name: priority
  type: enumeration
  options: low, medium, high, urgent

Text Area:
  name: message
  type: string
  format: textarea
```

### Step 3: Configure Output Fields

For each output field:

1. **Field Name** - API name (snake_case)
2. **Display Label** - Human-readable label
3. **Field Type** - What type is returned?

**Common Output Field Templates:**

```
Status Field:
  name: status
  type: enumeration
  options: success, failed, pending

Text Result:
  name: result_message
  type: string
```

### Step 4: Create Action

Use the automation-actions-v4-wrapper:

```javascript
const AutomationActionsV4Wrapper = require('./scripts/lib/automation-actions-v4-wrapper');

const wrapper = new AutomationActionsV4Wrapper(
  process.env.HUBSPOT_ACCESS_TOKEN,
  '{appId}'
);

const action = await wrapper.createAction({
  actionUrl: '{actionUrl}',
  objectTypes: ['{objectType}'],
  inputFields: [
    {
      name: '{fieldName}',
      type: '{fieldType}',
      label: '{fieldLabel}',
      required: {required}
    }
  ],
  outputFields: [
    {
      name: '{outputFieldName}',
      type: '{outputFieldType}'
    }
  ],
  labels: {
    en: {
      actionName: '{actionName}',
      actionDescription: '{actionDescription}'
    }
  }
});

console.log('Action created:', action.id);
```

### Step 5: Publish Action (Optional)

Ask if user wants to publish immediately:

```javascript
// If yes, publish
await wrapper.publishAction(action.id);
console.log('Action published and available in workflow editor');
```

### Step 6: Provide Next Steps

```markdown
## Action Created Successfully

**Action ID:** {actionId}
**Action Name:** {actionName}
**Status:** {published ? 'Published' : 'Draft'}

### Webhook Endpoint

Your action URL will receive POST requests with this format:

\`\`\`json
{
  "callbackId": "callback-123",
  "object": {
    "objectType": "CONTACT",
    "objectId": "12345",
    "properties": { ... }
  },
  "inputFields": {
    "{fieldName}": "{value}"
  }
}
\`\`\`

### Response Format

Your endpoint should return:

\`\`\`json
{
  "outputFields": {
    "{outputFieldName}": "{value}"
  }
}
\`\`\`

### Next Steps

1. **Test the webhook**: Ensure your endpoint handles requests
2. **Add functions** (optional): `/hs-action-add-function --action {actionId}`
3. **Use in workflow**: Go to HubSpot Workflows → Add Action → Custom
4. **Monitor callbacks**: Use `hubspot-callback-orchestrator` for async handling

### Documentation

- `skills/hubspot-automation-actions/SKILL.md`
- `agents/hubspot-custom-action-builder.md`
```

## Input Field Types

| Type | Description | Example |
|------|-------------|---------|
| `string` | Text field | Email, name, message |
| `number` | Numeric | Score, amount |
| `bool` | Checkbox | Enabled, confirmed |
| `date` | Date picker | Due date |
| `datetime` | Date + time | Scheduled time |
| `enumeration` | Dropdown | Status, priority |
| `phone_number` | Phone | Contact phone |

## Object Types

| Type | Description |
|------|-------------|
| `CONTACT` | Contact records |
| `COMPANY` | Company records |
| `DEAL` | Deal records |
| `TICKET` | Support tickets |
| `QUOTE` | Quotes |

## Example Actions

### Email Verification Action

```javascript
{
  actionUrl: 'https://verify.example.com/email',
  objectTypes: ['CONTACT'],
  inputFields: [
    { name: 'email', type: 'string', required: true }
  ],
  outputFields: [
    { name: 'valid', type: 'bool' },
    { name: 'deliverable', type: 'enumeration', options: ['yes', 'no', 'unknown'] }
  ],
  labels: { en: { actionName: 'Verify Email Address' } }
}
```

### Lead Enrichment Action

```javascript
{
  actionUrl: 'https://enrich.example.com/lead',
  objectTypes: ['CONTACT', 'COMPANY'],
  inputFields: [
    { name: 'domain', type: 'string' },
    { name: 'enrichment_type', type: 'enumeration', options: ['basic', 'full'] }
  ],
  outputFields: [
    { name: 'company_name', type: 'string' },
    { name: 'employee_count', type: 'number' },
    { name: 'industry', type: 'string' }
  ],
  labels: { en: { actionName: 'Enrich Lead Data' } }
}
```

### Slack Notification Action

```javascript
{
  actionUrl: 'https://notify.example.com/slack',
  objectTypes: ['DEAL'],
  inputFields: [
    { name: 'channel', type: 'string', required: true },
    { name: 'message', type: 'string', format: 'textarea' },
    { name: 'priority', type: 'enumeration', options: ['normal', 'urgent'] }
  ],
  outputFields: [
    { name: 'sent', type: 'bool' },
    { name: 'message_id', type: 'string' }
  ],
  labels: { en: { actionName: 'Send Slack Notification' } }
}
```

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| Invalid App ID | App not found | Verify app exists in developer account |
| Missing actionUrl | URL not provided | Provide HTTPS endpoint |
| Invalid scope | Missing automation scope | Add automation scope to app |
| Rate limited | Too many requests | Wait and retry |

## Related Commands

- `/hs-action-list` - List existing custom actions
- `/hs-action-add-function` - Add function to action
- `/hs-callback-complete` - Complete workflow callback
