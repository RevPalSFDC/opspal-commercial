---
description: Check n8n connection status and display workflow summary
argument-hint: "[--workflows] [--executions] [--health]"
---

# n8n Status Command

Check n8n connection status and display workflow summary.

## Usage

```
/n8n-status [options]
```

## Options

- `--workflows` - List all workflows with status
- `--executions` - Show recent execution summary
- `--health` - Run connectivity health check

## Default Behavior

Without options, displays:
- Connection status to n8n Cloud
- Total workflow count
- Active vs inactive workflows
- Recent execution statistics

## Examples

```bash
# Basic status check
/n8n-status

# List all workflows
/n8n-status --workflows

# Show recent executions
/n8n-status --executions

# Full health check
/n8n-status --health
```

## Output Format

### Basic Status
```
n8n Status Report
==================

Connection: Connected
Instance: your-instance.n8n.cloud
API Version: v1

Workflows: 15 total (12 active, 3 inactive)
Executions (24h): 142 (138 success, 4 error)
Success Rate: 97.2%
```

### Workflow List (--workflows)
```
Workflows
=========

| ID | Name | Status | Last Run |
|----|------|--------|----------|
| 1  | SF Lead Sync | Active | 2m ago |
| 2  | HS Contact Update | Active | 5m ago |
| 3  | Error Handler | Active | 1h ago |
```

### Executions (--executions)
```
Recent Executions
=================

Last 10 executions:
[SUCCESS] SF Lead Sync - 2m ago (1.2s)
[SUCCESS] HS Contact Update - 5m ago (0.8s)
[ERROR] Batch Sync - 1h ago - Rate limit exceeded
...
```

### Health Check (--health)
```
Health Check Results
====================

[PASS] API Connectivity - 200ms response
[PASS] Authentication - Valid
[PASS] Workflows - 15 accessible
[WARN] Credentials - 2 expiring soon
[PASS] Execution Queue - Empty
```

## Implementation

This command delegates to the n8n MCP tools to:

1. **Test Connection**: Verify API connectivity
2. **Get Workflow Count**: List all workflows and count by status
3. **Get Execution Stats**: Query recent executions for metrics
4. **Check Credentials**: Verify credential status (if available)

## Troubleshooting

### Connection Failed
- Verify `N8N_API_URL` environment variable
- Verify `N8N_API_KEY` environment variable
- Check n8n Cloud is accessible

### Authentication Error
- Regenerate API key in n8n Cloud
- Update `.env` file
- Restart Claude Code

### No Workflows Found
- Verify API key has workflow access
- Check if workflows are in the correct workspace

## Environment Variables

Required:
```bash
N8N_API_URL=https://your-instance.n8n.cloud/api/v1
N8N_API_KEY=your-api-key
```

## Related Commands

- `/agents` - List available agents including n8n agents
- `/mcp` - Check MCP server status

## Related Agents

- `n8n-workflow-builder` - Create and modify workflows
- `n8n-execution-monitor` - Debug execution issues
- `n8n-integration-orchestrator` - Design multi-platform integrations
