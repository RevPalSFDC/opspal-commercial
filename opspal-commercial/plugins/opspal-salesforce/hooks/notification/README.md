# Notification Hooks with Matchers

**NEW in Claude Code v2.0.41**: Enhanced notification hooks with matcher values for selective triggering.

## Overview

Notification hooks trigger when Claude sends notifications to the user, typically after long-running operations or significant events. With v2.0.41, you can now use **matchers** to filter which notifications trigger hooks, enabling selective and context-aware notification handling.

## Key Features

**Matcher Values** (v2.0.41):
- Filter notifications by content, status, duration, or custom criteria
- Reduce notification fatigue by only showing relevant notifications
- Provide context-specific actions based on notification type

**Enhanced Notifications**:
- Custom titles and messages
- Action buttons for quick follow-up
- Priority levels (low, normal, high, urgent)
- Variable substitution from notification context

## Available Notification Hooks

### 1. Deployment Completion Notifier

**File**: `deployment-completion-notifier.json`
**Purpose**: Enhanced notifications for Salesforce deployment completions
**Triggers**: Deployment-related notifications that complete successfully and take 60+ seconds

**Matcher Configuration**:
```json
{
  "matcher": {
    "messageContains": ["deployment", "deploy", "metadata"],
    "statusIn": ["success", "completed"],
    "durationMinimum": 60
  }
}
```

**Actions Provided**:
- View deployment logs
- Open org to verify
- Run post-deployment tests

**Example Notification**:
```
✅ Salesforce Deployment Complete

Deployment to myorg completed successfully!

Duration: 2m 15s
Components: 12 custom objects, 45 fields
Status: Deployed successfully

Next Steps:
- Verify deployment in org
- Run post-deployment tests
- Update documentation

[View Logs] [Verify in Org] [Run Tests]
```

## Configuration

### Enable Notification Hooks in Settings

Add to `.claude/settings.json` or `settings.local.json`:

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": {
          "messageContains": ["deployment", "deploy"],
          "statusIn": ["success", "completed"],
          "durationMinimum": 60
        },
        "hooks": [
          {
            "type": "notification-matcher",
            "configPath": "${CLAUDE_PLUGIN_ROOT}/.claude-plugins/opspal-salesforce/hooks/notification/deployment-completion-notifier.json"
          }
        ]
      }
    ]
  }
}
```

### Matcher Patterns

**Content Matching**:
```json
{
  "messageContains": ["keyword1", "keyword2"],  // ANY keyword matches
  "messageExcludes": ["keyword3", "keyword4"],  // NONE of these keywords
  "messageRegex": "^Deployment.*complete$"      // Regex pattern
}
```

**Status Matching**:
```json
{
  "statusIn": ["success", "completed", "warning"],  // ANY status matches
  "statusNotIn": ["error", "failed"]                 // NONE of these statuses
}
```

**Duration Matching**:
```json
{
  "durationMinimum": 60,    // At least 60 seconds
  "durationMaximum": 600,   // At most 600 seconds (10 minutes)
  "durationRange": [60, 300] // Between 1-5 minutes
}
```

**Custom Field Matching**:
```json
{
  "customFields": {
    "operationType": "deployment",
    "environment": ["production", "staging"],
    "componentCount": {
      "minimum": 5
    }
  }
}
```

**Combined Matchers** (ALL must match):
```json
{
  "messageContains": ["deployment"],
  "statusIn": ["success"],
  "durationMinimum": 120,
  "customFields": {
    "environment": "production"
  }
}
```

### Notification Configuration

**Basic Notification**:
```json
{
  "notification": {
    "title": "Operation Complete",
    "priority": "normal",
    "sound": "default",
    "messageTemplate": "Operation completed successfully!"
  }
}
```

**Notification with Actions**:
```json
{
  "notification": {
    "title": "✅ Task Complete",
    "priority": "high",
    "actions": [
      {
        "label": "View Results",
        "command": "cat /path/to/results.txt"
      },
      {
        "label": "Open Dashboard",
        "url": "https://dashboard.example.com"
      }
    ],
    "messageTemplate": "Task completed in {duration}"
  }
}
```

**Variable Substitution**:

Available variables depend on notification context:
- `{duration}` - Operation duration
- `{status}` - Operation status
- `{orgAlias}` - Salesforce org alias
- `{componentCount}` - Number of components
- `{jobId}` - Deployment/operation job ID
- `{timestamp}` - Notification timestamp
- `{userName}` - Current user

## Priority Levels

| Priority | Use When | Sound | Notification Behavior |
|----------|----------|-------|----------------------|
| **low** | Informational updates | Silent | Minimal, can be batched |
| **normal** | Standard completions | Default | Standard notification |
| **high** | Important completions | Attention | Prominent, stays visible |
| **urgent** | Critical issues | Alarm | Interrupts, requires action |

## Use Cases

### 1. Long-Running Deployment Tracking

```json
{
  "matcher": {
    "messageContains": ["deployment"],
    "durationMinimum": 300
  },
  "notification": {
    "title": "⏱️ Long Deployment Complete",
    "priority": "high",
    "messageTemplate": "Deployment took {duration} - longer than expected.\n\nConsider reviewing deployment logs for optimization opportunities."
  }
}
```

### 2. Production Deployment Alerts

```json
{
  "matcher": {
    "messageContains": ["production", "prod"],
    "statusIn": ["success", "completed"]
  },
  "notification": {
    "title": "🚀 Production Deployment Success",
    "priority": "high",
    "sound": "success",
    "messageTemplate": "Production deployment to {orgAlias} completed.\n\nVerify functionality and monitor error logs."
  }
}
```

### 3. Error Notifications

```json
{
  "matcher": {
    "statusIn": ["error", "failed"],
    "messageContains": ["deployment", "validation"]
  },
  "notification": {
    "title": "❌ Deployment Failed",
    "priority": "urgent",
    "sound": "error",
    "messageTemplate": "Deployment failed: {errorMessage}\n\nReview logs and retry.",
    "actions": [
      {
        "label": "View Error Logs",
        "command": "sf project deploy report --job-id {jobId}"
      }
    ]
  }
}
```

### 4. Test Completion

```json
{
  "matcher": {
    "messageContains": ["test", "apex test"],
    "durationMinimum": 30
  },
  "notification": {
    "title": "🧪 Tests Complete",
    "priority": "normal",
    "messageTemplate": "Test run completed in {duration}\n\nPassed: {passedCount}\nFailed: {failedCount}\nCoverage: {coverage}%"
  }
}
```

## Benefits

### 1. Selective Notifications
- Only notify for relevant events
- Reduce notification fatigue
- Focus on important completions

### 2. Context-Aware Actions
- Quick access to follow-up tasks
- Environment-specific actions
- Role-based action suggestions

### 3. Enhanced Visibility
- Custom priority levels
- Rich message templates
- Status-specific formatting

### 4. Productivity
- Faster follow-up workflows
- One-click access to common tasks
- Reduced context switching

## Troubleshooting

### Notifications Not Appearing

**Check**:
1. Verify matcher criteria match notification content
2. Ensure `enabled: true` in configuration
3. Check hook logs for matcher evaluation
4. Verify notification priority is not set to silent

**Debug**:
```bash
# Enable debug logging
claude --debug

# Monitor notification hooks
tail -f ~/.claude/logs/debug.log | grep "notification-hook"
```

### Too Many Notifications

**Fix**:
- Increase `durationMinimum` threshold
- Add `messageExcludes` patterns
- Use more specific `messageContains` keywords
- Set priority to `low` for less important notifications

### Actions Not Working

**Check**:
1. Verify command syntax in `actions` array
2. Ensure variables like `{jobId}` are available in context
3. Check user permissions for command execution
4. Verify URLs are valid for URL-based actions

## Examples

### Deployment Success with Verification

**Notification**:
```
✅ Salesforce Deployment Complete

Deployment to production completed successfully!

Duration: 3m 45s
Components: 25 custom fields, 8 validation rules
Status: Deployed successfully

Next Steps:
- Verify deployment in org
- Run smoke tests
- Update release notes

[View Logs] [Open Org] [Run Tests] [Update Docs]
```

**User Experience**:
1. User receives notification after 3m45s deployment
2. Clicks "Open Org" button
3. Org opens in browser for verification
4. Returns to Claude, clicks "Run Tests"
5. Tests execute automatically

### Production Deployment Alert

**Notification**:
```
🚀 PRODUCTION Deployment Complete

Critical: Production deployment finished

Environment: production-org
Duration: 2m 15s
Components: 12 objects, 45 fields, 3 flows

⚠️ Required Actions:
1. Verify functionality
2. Monitor error logs for 24h
3. Notify stakeholders

[View Logs] [Open Monitoring] [Send Notification]
```

**User Experience**:
1. High-priority notification interrupts work
2. User acknowledges and clicks "View Logs"
3. Reviews deployment details
4. Clicks "Send Notification" to alert stakeholders
5. Returns to monitoring

## Related Documentation

- **Hooks Guide**: https://docs.claude.com/en/docs/claude-code/hooks
- **Notification Hooks**: https://docs.claude.com/en/docs/claude-code/hooks#notification-hooks
- **Matcher Values**: Release notes v2.0.41

## Version History

- **v3.45.0** (2025-11-14): Initial release with matcher values
  - Deployment completion notifier
  - Enhanced notification templates
  - Action button support
  - Variable substitution

---

**Last Updated**: 2025-11-14
**Plugin Version**: 3.45.0
