---
description: Manage n8n workflow lifecycle (activate, deactivate, status, execute)
argument-hint: "<action> [workflow-id] [options]"
---

# n8n Workflow Lifecycle Management

Quick workflow lifecycle operations for n8n Cloud.

## Usage

```
/n8n-lifecycle <action> [workflow-id] [options]
```

## Actions

### activate
Activate a workflow to enable its triggers.
```
/n8n-lifecycle activate <workflow-id>
```

### deactivate
Deactivate a workflow to stop its triggers.
```
/n8n-lifecycle deactivate <workflow-id>
```

### status
Get the current status of a workflow.
```
/n8n-lifecycle status <workflow-id>
```

### list-active
List all active workflows.
```
/n8n-lifecycle list-active
```

### list-inactive
List all inactive workflows.
```
/n8n-lifecycle list-inactive
```

### bulk-activate
Activate multiple workflows by tag or prefix.
```
/n8n-lifecycle bulk-activate --tag production
/n8n-lifecycle bulk-activate --prefix "Client-"
```

### bulk-deactivate
Deactivate multiple workflows by tag or prefix.
```
/n8n-lifecycle bulk-deactivate --tag staging
/n8n-lifecycle bulk-deactivate --prefix "Test-"
```

### history
View state change history for a workflow.
```
/n8n-lifecycle history <workflow-id>
```

### rollback
Rollback workflow to its previous state.
```
/n8n-lifecycle rollback <workflow-id>
```

## Environment Setup

Before using this command, ensure these environment variables are set:

```bash
export N8N_API_KEY=your-api-key
export N8N_BASE_URL=https://your-instance.n8n.cloud
```

## Examples

### Activate a Specific Workflow
```
/n8n-lifecycle activate abc123
```
Output:
```
Workflow activated successfully
  workflowId: abc123
  workflowName: Daily Sync
  state: active
  timestamp: 2025-12-03T10:30:00Z
```

### Deactivate for Maintenance
```
/n8n-lifecycle deactivate abc123
```

### Check Workflow Status
```
/n8n-lifecycle status abc123
```
Output:
```
  workflowId: abc123
  name: Daily Sync
  state: active
  createdAt: 2025-11-01T08:00:00Z
  updatedAt: 2025-12-03T10:30:00Z
  tags: ["production", "sync"]
  nodeCount: 8
```

### List Active Workflows
```
/n8n-lifecycle list-active
```
Output:
```
┌─────────┬──────────────┬────────┬───────────────────┐
│ id      │ name         │ state  │ tags              │
├─────────┼──────────────┼────────┼───────────────────┤
│ abc123  │ Daily Sync   │ active │ production, sync  │
│ def456  │ Hourly Check │ active │ production        │
└─────────┴──────────────┴────────┴───────────────────┘
```

### Bulk Activate Production Workflows
```
/n8n-lifecycle bulk-activate --tag production
```
Output:
```
Bulk Operation Complete
Total: 5
Success: 5
Failed: 0

Details:
┌─────────┬──────────────┬───────────┐
│ id      │ name         │ status    │
├─────────┼──────────────┼───────────┤
│ abc123  │ Daily Sync   │ activated │
│ def456  │ Hourly Check │ activated │
│ ghi789  │ Alert Flow   │ activated │
└─────────┴──────────────┴───────────┘
```

### View History
```
/n8n-lifecycle history abc123
```
Output:
```
┌─────────────────────────┬───────────────┬──────────┬────────────┐
│ timestamp               │ previousState │ newState │ action     │
├─────────────────────────┼───────────────┼──────────┼────────────┤
│ 2025-12-03T10:30:00Z   │ inactive      │ active   │ activate   │
│ 2025-12-02T18:00:00Z   │ active        │ inactive │ deactivate │
│ 2025-12-02T08:00:00Z   │ inactive      │ active   │ activate   │
└─────────────────────────┴───────────────┴──────────┴────────────┘
```

### Rollback After Accidental Change
```
/n8n-lifecycle rollback abc123
```
Output:
```
Workflow rolled back successfully
  workflowId: abc123
  rollbackFrom: active
  rollbackTo: inactive
  originalAction: activate
```

## Related

- **Agent**: `n8n-lifecycle-manager` - For complex lifecycle operations
- **Runbook**: `runbooks/n8n/workflow-lifecycle.md` - Comprehensive procedures
- **Script**: `scripts/lib/n8n-lifecycle-controller.js` - Underlying implementation

## Troubleshooting

### "N8N_API_KEY required"
Set the environment variable:
```bash
export N8N_API_KEY=your-api-key
```

### "404 Not Found"
The workflow ID doesn't exist. List workflows to find the correct ID:
```
/n8n-lifecycle list-active
```

### "401 Unauthorized"
Your API key is invalid or expired. Generate a new one in n8n Settings > API.

### Bulk operation slow
Operations are rate-limited (500ms delay) to prevent API throttling. For large batches, this is expected.
