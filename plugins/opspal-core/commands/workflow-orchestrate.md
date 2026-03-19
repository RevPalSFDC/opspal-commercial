---
name: workflow-orchestrate
description: Orchestrate complex workflows spanning multiple platforms with sequencing and error recovery
argument-hint: "<create|execute|status|rollback> [--workflow <id>] [--input <json>]"
arguments:
  - name: action
    description: Action to perform (create, execute, status, rollback)
    required: false
  - name: workflow
    description: Workflow ID or definition file path
    required: false
  - name: input
    description: JSON input data for workflow execution
    required: false
---

# Workflow Orchestration Command

Orchestrate complex multi-platform workflows with dependency management, error recovery, state checkpoints, and rollback capabilities.

## Usage

```bash
/workflow-orchestrate create                # Create new workflow
/workflow-orchestrate execute --workflow WF-001 --input '{"account_id":"001XXX"}'
/workflow-orchestrate status --workflow WF-001
/workflow-orchestrate rollback --workflow WF-001
```

## What This Does

1. **Workflow Definition**: Define multi-step, multi-platform workflows
2. **Dependency Management**: Handle step sequencing and dependencies
3. **Error Recovery**: Implement retry logic and graceful failure
4. **State Management**: Create checkpoints for recovery
5. **Rollback**: Execute rollback procedures when needed

## Execution

Use the multi-platform-workflow-orchestrator agent:

```javascript
Agent({
  subagent_type: 'opspal-core:multi-platform-workflow-orchestrator',
  prompt: `Workflow orchestration: ${action || 'status'}. Workflow: ${workflow || 'none'}. Input: ${input || '{}'}`
});
```

## Output

Depending on action:
- **Create**: Workflow definition with steps and dependencies
- **Execute**: Execution progress, step results, final state
- **Status**: Current state, completed steps, any errors
- **Rollback**: Rollback results, restored state

## Workflow Features

- **Platform Support**: Salesforce, HubSpot, Marketo, internal systems
- **Error Handling**: Retry strategies (immediate, linear, exponential)
- **Circuit Breaker**: Automatic failure protection
- **Checkpointing**: Resume from last successful step

## Related Commands

- `/data-migrate` - Data migration workflows
- `/campaign-orchestrate` - Campaign-specific workflows
