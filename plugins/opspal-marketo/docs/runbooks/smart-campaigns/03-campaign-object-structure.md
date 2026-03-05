# Smart Campaign Object Structure

## Overview

A Smart Campaign in Marketo is a workflow consisting of:
1. **Smart List** (Who) - Defines qualifying leads via triggers and filters
2. **Flow** (What) - Defines actions to take on qualifying leads
3. **Schedule** (When) - Defines execution timing

## Campaign Properties

### Core Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | integer | Unique campaign identifier |
| `name` | string | Campaign name (unique within folder/program) |
| `description` | string | Optional text description (max 2000 chars) |
| `createdAt` | datetime | ISO 8601 creation timestamp |
| `updatedAt` | datetime | ISO 8601 last update timestamp |

### Container Properties

| Property | Type | Description |
|----------|------|-------------|
| `folder` | object | Parent container `{ id: number, type: "Program" \| "Folder" }` |
| `workspace` | string | Workspace name (default: "Default") |

### Status Properties

| Property | Type | Description |
|----------|------|-------------|
| `status` | string | "Never Run", "Inactive", "Active", "Finished" |
| `type` | string | "trigger" or "batch" |
| `isActive` | boolean | True if trigger campaign is listening |
| `isRequestable` | boolean | True if has "Campaign is Requested" trigger |
| `isSystem` | boolean | True for system campaigns (read-only) |

### Configuration Properties

| Property | Type | Description |
|----------|------|-------------|
| `isCommunicationLimitEnabled` | boolean | Honors communication limits |
| `qualificationRuleType` | string | "once", "every time", or "X times" |
| `recurrence` | object | `{ weekdayOnly: boolean }` |

### Internal References

| Property | Type | Description |
|----------|------|-------------|
| `smartListId` | integer | ID of associated Smart List object |
| `flowId` | integer | ID of associated Flow object |
| `computedUrl` | string | Direct URL to campaign in Marketo UI |

## Example Campaign Object

```json
{
  "id": 1076,
  "name": "Welcome Drip Campaign",
  "description": "Initial welcome email drip campaign.",
  "createdAt": "2025-08-14T17:42:04Z+0000",
  "updatedAt": "2025-08-14T17:42:04Z+0000",
  "folder": {
    "id": 1234,
    "type": "Program"
  },
  "status": "Never Run",
  "type": "batch",
  "isActive": false,
  "isRequestable": false,
  "isCommunicationLimitEnabled": true,
  "recurrence": {
    "weekdayOnly": false
  },
  "qualificationRuleType": "once",
  "workspace": "Default",
  "smartListId": 5132,
  "flowId": 1095,
  "computedUrl": "https://app-ab12.marketo.com/#SC1076A1"
}
```

## Campaign Types

### Trigger Campaign

- Has at least one trigger in Smart List
- `type: "trigger"`
- Must be activated to listen for events
- Runs immediately when trigger conditions met
- `isActive` indicates listening state

### Batch Campaign

- Has only filters in Smart List (no triggers)
- `type: "batch"`
- Must be scheduled or run manually
- Processes all qualifying leads at once
- `status` shows last run time

### Requestable Campaign

- Has "Campaign is Requested" trigger with "Web Service API" source
- `isRequestable: true`
- Can be triggered via API for specific leads
- Must also be activated

## Smart List Structure

The Smart List can be retrieved via:
```
GET /rest/asset/v1/smartCampaign/{id}/smartList.json?includeRules=true
```

### Smart List Object

```json
{
  "id": 5132,
  "name": "Smart List for SC 1076",
  "folder": { "id": 1076, "type": "SmartCampaign" },
  "rules": {
    "filterMatchType": "all",
    "triggers": [ ... ],
    "filters": [ ... ]
  }
}
```

### Trigger Structure

```json
{
  "id": 42,
  "name": "Fills Out Form",
  "ruleType": "Trigger",
  "operator": "IS",
  "triggerFields": [
    {
      "id": "formId",
      "value": 123,
      "displayValue": "Contact Form"
    }
  ],
  "constraints": {
    "webPageId": 456
  }
}
```

### Filter Structure

```json
{
  "id": 459,
  "name": "Email Address",
  "ruleType": "Filter",
  "operator": "contains",
  "conditions": [
    {
      "value": "@company.com",
      "operator": "contains"
    }
  ]
}
```

### filterMatchType

| Value | Behavior |
|-------|----------|
| `all` | Lead must match ALL filters (AND) |
| `any` | Lead must match ANY filter (OR) |

## Flow Structure (Limitations)

> **Critical Limitation**: The Flow is NOT exposed via REST API.

The `flowId` property references the Flow object, but there is no documented endpoint to:
- Retrieve flow steps
- Add flow steps
- Modify flow steps
- Delete flow steps

### Implications

1. **New campaigns via API have empty flows** - Must configure in UI
2. **Cloning preserves flows** - Primary method for programmatic creation
3. **Tokens can modify flow behavior** - Use My Tokens for dynamic values

## Qualification Rules

Controls how often the same lead can run through a trigger campaign:

| qualificationRuleType | Behavior |
|-----------------------|----------|
| `once` | Each lead runs through only one time (default) |
| `every time` | Lead can re-trigger unlimited times |
| Custom | "Each lead can run through X time(s)" |

> **Note**: Qualification rules cannot be changed via API - configure in UI.

## Communication Limits

The `isCommunicationLimitEnabled` flag indicates if the campaign respects Marketo's communication limit settings (typically configured at the workspace level).

| Campaign Type | Default |
|---------------|---------|
| Trigger | `false` (doesn't honor limits) |
| Batch | `true` (honors limits) |

## Status States

### Trigger Campaigns

| Status | isActive | Description |
|--------|----------|-------------|
| Inactive | false | Created but not listening |
| Active | true | Listening for trigger events |
| Paused | false | Was active, now stopped |

### Batch Campaigns

| Status | Description |
|--------|-------------|
| Never Run | Created but never executed |
| Scheduled | Scheduled for future run |
| Running | Currently processing |
| Finished | Completed last run |

## Related Runbooks

- [04-create-operations](./04-create-operations.md) - Creating campaigns
- [05-read-operations](./05-read-operations.md) - Reading campaign details
- [09-activation-execution](./09-activation-execution.md) - Status transitions
