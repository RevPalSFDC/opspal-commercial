---
name: hs-action-list
description: List all custom workflow actions for a HubSpot app
argument-hint: "[--app <id>] [--format json|detailed]"
arguments:
  - name: app
    description: HubSpot App ID (optional - will prompt if not provided)
    required: false
  - name: format
    description: Output format (table, json, detailed)
    required: false
---

# /hs-action-list - List Custom Workflow Actions

List all custom workflow actions configured for a HubSpot app.

## Usage

```bash
/hs-action-list                           # Interactive mode
/hs-action-list --app 12345               # For specific app
/hs-action-list --format json             # JSON output
/hs-action-list --format detailed         # Full action details
```

## Prerequisites

### Authentication

```bash
# Verify access token is set
echo $HUBSPOT_ACCESS_TOKEN
```

### Required Scopes

Your app must have the `automation` scope.

## Workflow

### Step 1: Get App ID

If not provided, ask user for App ID:

```markdown
Enter your HubSpot App ID:

To find your App ID:
1. Go to https://developers.hubspot.com/
2. Click on your app
3. The App ID is in the URL or app settings
```

### Step 2: List Actions

```javascript
const AutomationActionsV4Wrapper = require('./scripts/lib/automation-actions-v4-wrapper');

const wrapper = new AutomationActionsV4Wrapper(
  process.env.HUBSPOT_ACCESS_TOKEN,
  '{appId}'
);

const actions = await wrapper.getAllActions();
```

### Step 3: Display Results

**Table Format (default):**

```
+----------------+-------------------------+---------------+-------------+
| Action ID      | Name                    | Object Types  | Status      |
+----------------+-------------------------+---------------+-------------+
| abc123         | Enrich Contact          | CONTACT       | Published   |
| def456         | Send Slack Notification | DEAL, TICKET  | Draft       |
| ghi789         | Verify Email            | CONTACT       | Published   |
+----------------+-------------------------+---------------+-------------+

Total: 3 actions (2 published, 1 draft)
```

**JSON Format:**

```json
{
  "total": 3,
  "published": 2,
  "draft": 1,
  "actions": [
    {
      "id": "abc123",
      "name": "Enrich Contact",
      "objectTypes": ["CONTACT"],
      "published": true,
      "actionUrl": "https://example.com/enrich",
      "inputFields": 2,
      "outputFields": 3
    }
  ]
}
```

**Detailed Format:**

```markdown
## Action: Enrich Contact (abc123)

**Status:** Published
**Action URL:** https://example.com/enrich
**Object Types:** CONTACT

### Input Fields
| Name | Type | Required |
|------|------|----------|
| email | string | Yes |
| level | enumeration | No |

### Output Fields
| Name | Type |
|------|------|
| company | string |
| industry | string |
| enriched | bool |

### Functions
- PRE_ACTION_EXECUTION: Configured

---
```

### Step 4: Provide Management Options

```markdown
## Actions Available

Found {total} custom actions.

### Commands

- **View details**: `/hs-action-list --format detailed`
- **Create new**: `/hs-action-create`
- **Add function**: `/hs-action-add-function --action {actionId}`

### Quick Actions

Would you like to:
1. View detailed info for a specific action
2. Create a new action
3. Export action definitions
```

## Output Fields

| Field | Description |
|-------|-------------|
| `id` | Action definition ID |
| `name` | Action display name |
| `objectTypes` | Supported CRM objects |
| `published` | Whether action is available in workflow editor |
| `actionUrl` | Webhook endpoint |
| `inputFields` | Number of input fields |
| `outputFields` | Number of output fields |
| `functions` | Configured function types |

## Filter Options

```bash
# Published only
/hs-action-list --published

# Draft only
/hs-action-list --draft

# By object type
/hs-action-list --object contact
```

## Implementation Notes

1. Use pagination to get all actions (default limit is 10)
2. Include function information if --format detailed
3. Show action URL (useful for debugging)
4. Indicate publish status clearly

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| No actions found | No actions created | Use `/hs-action-create` |
| Invalid App ID | App not found | Verify app ID |
| Auth failed | Token invalid | Refresh access token |

## Related Commands

- `/hs-action-create` - Create new action
- `/hs-action-add-function` - Add function to action
