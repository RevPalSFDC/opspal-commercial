# Deployment Notification Matchers

Primary source: `hooks/notification/deployment-completion-notifier.json`.

## Matcher Fields

The notification JSON schema uses three fields to decide whether to fire:

| Field | Type | Description |
|-------|------|-------------|
| `messageContains` | string[] | Keywords that must appear in the conversation (OR logic) |
| `statusIn` | string[] | Allowed session status values (`success`, `completed`, `failed`) |
| `durationMinimum` | number | Minimum operation duration in seconds before notification fires |

`durationMinimum` prevents noise from fast no-op deployments. Set to 60 seconds — deployments under one minute are usually dry-runs or validations.

## Notification Payload Structure

```json
{
  "name": "deployment-completion-notifier",
  "type": "notification-matcher",
  "enabled": true,
  "matcher": {
    "messageContains": ["deployment", "deploy", "metadata"],
    "statusIn": ["success", "completed"],
    "durationMinimum": 60
  },
  "notification": {
    "title": "Salesforce Deployment Complete",
    "priority": "normal",
    "sound": "default",
    "actions": [
      {
        "label": "View Logs",
        "command": "sf project deploy report --job-id {jobId}"
      },
      {
        "label": "Verify in Org",
        "command": "sf org open"
      },
      {
        "label": "Run Tests",
        "command": "sf apex run test --test-level RunLocalTests"
      }
    ],
    "messageTemplate": "Deployment to {orgAlias} completed.\n\nDuration: {duration}\nComponents: {componentCount}\nJob ID: {jobId}"
  }
}
```

## Action Button Design Rules

- Provide 2–3 action buttons maximum — more causes decision fatigue.
- First action: the most common next step (view logs or verify in org).
- Second action: a verification step (run tests, open org).
- Third action: optional rollback or diff command.
- All `command` values must be runnable with a single click — no placeholders that require user editing.

## Template Variables

| Variable | Source | Example |
|----------|--------|---------|
| `{orgAlias}` | `$SF_TARGET_ORG` | `acme-prod` |
| `{duration}` | End time - start time | `3m 42s` |
| `{componentCount}` | Deployment result JSON | `47` |
| `{jobId}` | `sf project deploy start --json` result | `0Af...` |
| `{status}` | Deployment result status | `Succeeded` |

## Failure Notification Matcher

Add a separate matcher for deployment failures (alert immediately, no duration minimum):

```json
{
  "name": "deployment-failure-notifier",
  "type": "notification-matcher",
  "enabled": true,
  "matcher": {
    "messageContains": ["deployment failed", "deploy error", "Errors were encountered"],
    "statusIn": ["failed", "error"]
  },
  "notification": {
    "title": "Deployment FAILED",
    "priority": "high",
    "sound": "alert",
    "actions": [
      { "label": "View Errors", "command": "sf project deploy report --job-id {jobId}" },
      { "label": "Rollback", "command": "sf project deploy cancel --job-id {jobId}" }
    ],
    "messageTemplate": "Deployment to {orgAlias} FAILED.\n\nError: {errorMessage}\nJob ID: {jobId}"
  }
}
```

## Disabling Specific Notifiers

```bash
# Env-var toggle (checked at hook load time)
export DEPLOYMENT_NOTIFIER_ENABLED=false
```

Or set `"enabled": false` in the JSON file to disable permanently.
