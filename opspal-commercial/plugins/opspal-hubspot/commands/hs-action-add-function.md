---
name: hs-action-add-function
description: Add a serverless function to an existing custom workflow action
argument-hint: "[--action <id>] [--type pre-action|post-action] [--template <name>]"
arguments:
  - name: action
    description: Action definition ID
    required: false
  - name: type
    description: Function type (pre-action, pre-fetch, post-fetch)
    required: false
  - name: template
    description: Template to use (basic, validation, enrichment)
    required: false
---

# /hs-action-add-function - Add Function to Action

Add a serverless function to customize custom workflow action behavior.

## Usage

```bash
/hs-action-add-function                              # Interactive mode
/hs-action-add-function --action abc123              # For specific action
/hs-action-add-function --type pre-action            # Specific function type
/hs-action-add-function --template basic             # Use template
```

## Prerequisites

### Authentication

```bash
echo $HUBSPOT_ACCESS_TOKEN
```

### Existing Action

You must have an existing custom action created via `/hs-action-create`.

## Function Types

| Type | API Name | Purpose |
|------|----------|---------|
| `pre-action` | `PRE_ACTION_EXECUTION` | Modify request before sending to actionUrl |
| `pre-fetch` | `PRE_FETCH_OPTIONS` | Customize external option-fetch requests |
| `post-fetch` | `POST_FETCH_OPTIONS` | Transform API responses to HubSpot format |

## Workflow

### Step 1: Select Action

If not provided, list actions and ask user to select:

```javascript
const wrapper = new AutomationActionsV4Wrapper(accessToken, appId);
const actions = await wrapper.getAllActions();

// Display for selection
actions.forEach(action => {
  console.log(`${action.id}: ${action.labels?.en?.actionName || 'Unnamed'}`);
});
```

### Step 2: Select Function Type

Ask user which function type to add:

```markdown
Select function type:

1. **PRE_ACTION_EXECUTION** - Modify request before sending to webhook
   - Add timestamps, metadata
   - Transform data formats
   - Validate inputs

2. **PRE_FETCH_OPTIONS** - Customize external option requests
   - Add authentication headers
   - Filter options by context
   - Modify request URL/params

3. **POST_FETCH_OPTIONS** - Transform option responses
   - Convert API format to HubSpot format
   - Filter/sort options
   - Add descriptions
```

### Step 3: Select or Write Function

**Using Template:**

```bash
# Copy template
cp templates/automation-actions/pre-action-function.js ./my-function.js

# Edit as needed
# ...

# Read for deployment
const functionSource = fs.readFileSync('./my-function.js', 'utf-8');
```

**Custom Function:**

Provide a text editor or prompt for function code.

### Step 4: Deploy Function

```javascript
const AutomationActionsV4Wrapper = require('./scripts/lib/automation-actions-v4-wrapper');

const wrapper = new AutomationActionsV4Wrapper(accessToken, appId);

await wrapper.addFunction(
  '{actionId}',
  'PRE_ACTION_EXECUTION',
  functionSource
);
```

### Step 5: Verify and Test

```javascript
// Verify function was added
const functions = await wrapper.listFunctions(actionId);
console.log('Functions:', functions);

// Get function details
const func = await wrapper.getFunction(actionId, 'PRE_ACTION_EXECUTION');
console.log('Function source:', func.functionSource);
```

### Step 6: Provide Next Steps

```markdown
## Function Added Successfully

**Action ID:** {actionId}
**Function Type:** {functionType}

### Testing Your Function

1. **Create a test workflow** in HubSpot
2. **Add your custom action** to the workflow
3. **Enroll a test record**
4. **Check your webhook logs** to see the modified payload

### Debugging Tips

- Add `console.log()` statements (visible in HubSpot function logs)
- Test with minimal payload first
- Check for syntax errors before deploying

### Useful Commands

- **Update function**: Run this command again with same action/type
- **Remove function**: Use `hubspot-custom-action-builder` agent
- **View function**: `/hs-action-list --format detailed`

### Templates

Templates are located at:
- `templates/automation-actions/pre-action-function.js`
- `templates/automation-actions/pre-fetch-options.js`
- `templates/automation-actions/post-fetch-options.js`
```

## Templates

### PRE_ACTION_EXECUTION Templates

| Template | Description |
|----------|-------------|
| `basic` | Add metadata and normalize data |
| `validation` | Validate inputs before external call |
| `enrichment` | Fetch additional data |
| `transformation` | Transform to external API format |

### PRE_FETCH_OPTIONS Templates

| Template | Description |
|----------|-------------|
| `basic` | Add query parameters |
| `auth` | Add authentication headers |
| `contextual` | Modify URL based on context |

### POST_FETCH_OPTIONS Templates

| Template | Description |
|----------|-------------|
| `basic` | Simple object transformation |
| `nested` | Handle nested API responses |
| `filtered` | Filter and sort options |
| `grouped` | Group options by category |

## Function Code Requirements

### Structure

```javascript
exports.main = async (event, context) => {
  // event - Contains input data
  // context - Contains secrets and runtime info

  // Your logic here

  return {
    // Output data
  };
};
```

### Available in `event`

**PRE_ACTION_EXECUTION:**
- `event.fields` - Input field values
- `event.object` - CRM record info
- `event.origin` - Portal and action info

**PRE_FETCH_OPTIONS:**
- `event.fieldDefinition` - Field requesting options
- `event.optionsUrl` - Original options URL
- `event.object` - CRM record info

**POST_FETCH_OPTIONS:**
- `event.options` - Raw API response
- `event.fieldDefinition` - Field definition
- `event.object` - CRM record info

### Available in `context`

- `context.secrets` - Secrets configured in HubSpot app settings

## Example Function

### Basic PRE_ACTION_EXECUTION

```javascript
exports.main = async (event) => {
  const { fields, object } = event;

  return {
    ...fields,
    timestamp: new Date().toISOString(),
    record_id: object.objectId,
    record_type: object.objectType,
    email_normalized: fields.email?.toLowerCase(),
  };
};
```

### POST_FETCH_OPTIONS Transformation

```javascript
exports.main = async (event) => {
  const { options } = event;

  return options.map((item, index) => ({
    label: item.name,
    value: String(item.id),
    description: item.description,
    displayOrder: index + 1,
  }));
};
```

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| Action not found | Invalid action ID | Verify action exists |
| Invalid function type | Unsupported type | Use PRE_ACTION_EXECUTION, PRE_FETCH_OPTIONS, or POST_FETCH_OPTIONS |
| Syntax error | Invalid JavaScript | Check code syntax |
| Function too large | Exceeds size limit | Simplify or split logic |

## Related Commands

- `/hs-action-create` - Create new action
- `/hs-action-list` - List actions with functions
