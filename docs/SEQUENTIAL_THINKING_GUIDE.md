# Sequential Thinking MCP Integration Guide

## Executive Summary

The Sequential Thinking MCP server has been integrated into the RevPal Agent System to enhance handling of complex, multi-step operations. It provides dynamic problem-solving capabilities with revision and branching features, automatically triggered based on task complexity.

## What is Sequential Thinking MCP?

Sequential Thinking is a Model Context Protocol server that enables:
- **Step-by-step problem decomposition** - Break complex problems into manageable thoughts
- **Dynamic revision** - Correct course mid-execution when better approaches are discovered
- **Branching paths** - Explore alternative solutions when obstacles are encountered
- **Adaptive planning** - Adjust the number of steps based on problem complexity

## When is it Used?

### Automatic Triggering

Sequential Thinking is automatically engaged for:

#### High Complexity Operations (Score > 0.7)
- Cross-platform releases
- Salesforce object merges with 10+ dependencies
- Circular dependency resolution
- Production deployments with breaking changes
- Full org metadata analysis
- Multi-stage data migrations

#### Medium Complexity Operations (Score 0.3-0.7)
Optional engagement based on:
- Presence of unknown requirements
- Need for rollback capability
- Production environment impact

#### Simple Operations (Score < 0.3)
Direct execution without sequential thinking:
- Single field updates
- Basic queries
- Documentation changes
- Simple configuration updates

## How to Use It

### 1. Automatic Usage

Most agents will automatically assess complexity and use Sequential Thinking when appropriate:

```yaml
Task: sfdc-merge-orchestrator
Prompt: "Merge Account and Lead objects in production with all dependent fields and relationships"
# Automatically uses Sequential Thinking due to high complexity
```

### 2. Force Sequential Thinking

Add flags to force Sequential Thinking for any operation:

```yaml
Task: release-coordinator
Prompt: "Deploy hotfix to production [PLAN_CAREFULLY]"
# Forces Sequential Thinking regardless of complexity score
```

Supported flags:
- `[PLAN_CAREFULLY]`
- `[SEQUENTIAL]`

### 3. Skip Sequential Thinking

Force direct execution for known simple tasks:

```yaml
Task: sfdc-dependency-analyzer
Prompt: "Check dependencies for Account.Name field [QUICK_MODE]"
# Skips Sequential Thinking even if complexity score is high
```

Supported flags:
- `[QUICK_MODE]`
- `[DIRECT]`

## Agent Support

### Fully Integrated Agents

These agents have full complexity assessment and Sequential Thinking support:

| Agent | Primary Use Cases |
|-------|------------------|
| sfdc-merge-orchestrator | Complex object/field merges |
| sfdc-dependency-analyzer | Circular dependency resolution |
| project-orchestrator | Multi-repo coordination |
| release-coordinator | Cross-platform releases |
| sfdc-state-discovery | Full org analysis |
| sfdc-conflict-resolver | Complex conflict resolution |
| hubspot-orchestrator | Multi-stage workflows |
| quality-control-analyzer | Pattern discovery |

### Integration Examples

#### Example 1: Complex Salesforce Merge

```markdown
User: Merge the Lead and Contact objects, consolidating all custom fields, maintaining data integrity, and updating all dependent workflows and processes.

Agent (sfdc-merge-orchestrator):
[Complexity Assessment: HIGH (0.85)]
[Using Sequential Thinking]

Thought 1: Analyzing merge scope - identifying Lead and Contact objects with dependencies...
Thought 2: Discovered 47 custom fields, 12 workflows, 8 processes, and 23 validation rules...
Thought 3: Creating field mapping strategy to prevent data loss...
Thought 4: [REVISION] Reconsidering approach due to circular dependency found...
Thought 5: Implementing phased merge with dependency resolution...
[Continues with systematic execution]
```

#### Example 2: Multi-Platform Release

```markdown
User: Coordinate a release across Salesforce, HubSpot, and the main application with database migrations.

Agent (release-coordinator):
[Complexity Assessment: HIGH (0.92)]
[Using Sequential Thinking]

Thought 1: Identifying all components for multi-platform release...
Thought 2: Creating deployment sequence with rollback points...
Thought 3: [BRANCH] Creating alternative path for HubSpot API limitations...
[Continues with coordinated deployment]
```

## Benefits

### 1. Improved Success Rates
- Complex operations broken into manageable steps
- Ability to revise approach when issues discovered
- Alternative paths when obstacles encountered

### 2. Better Error Recovery
- Checkpoints throughout execution
- Clear rollback points
- Detailed execution history for debugging

### 3. Enhanced Planning
- Systematic approach to complex problems
- Consideration of edge cases
- Adaptive strategy based on discoveries

### 4. Maintained Efficiency
- Simple tasks still execute directly
- No overhead for straightforward operations
- User control over engagement

## Configuration

### MCP Server Configuration

The Sequential Thinking server is configured in `.mcp.json`:

```json
{
  "mcpServers": {
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
      "env": {
        "DISABLE_THOUGHT_LOGGING": "${SEQUENTIAL_THINKING_LOGGING:-false}"
      },
      "disabled": false
    }
  }
}
```

### Environment Variables

- `SEQUENTIAL_THINKING_LOGGING` - Set to `true` to disable thought logging
- `LOG_COMPLEXITY` - Set to `true` to log complexity assessments

### Agent Configuration

Agents can customize their complexity assessment in `complexity-profiles.json`:

```json
{
  "your-agent": {
    "factors": {
      "stepCount": { "weight": 0.3, "thresholds": {...} },
      "dependencies": { "weight": 0.4, "thresholds": {...} }
    },
    "complexityTriggers": {
      "high": ["Your high complexity scenarios"],
      "medium": ["Medium complexity scenarios"],
      "simple": ["Simple scenarios"]
    }
  }
}
```

## Best Practices

### 1. Trust the Assessment
- The complexity analyzer is tuned for each agent's specific needs
- Override only when you have specific knowledge about the task

### 2. Use Appropriate Flags
- Use `[PLAN_CAREFULLY]` for critical operations where extra planning is valuable
- Use `[QUICK_MODE]` only for well-understood, simple tasks

### 3. Monitor Performance
- Check agent metrics to understand Sequential Thinking usage patterns
- Adjust complexity profiles based on actual results

### 4. Document Complex Operations
- When Sequential Thinking is used, review the thought sequence
- Use insights to improve future operations

## Troubleshooting

### Sequential Thinking Not Engaging

1. Check complexity score:
   ```bash
   export LOG_COMPLEXITY=true
   # Re-run your operation
   ```

2. Verify MCP server is running:
   ```bash
   # Check MCP status in Claude Code
   ```

3. Force engagement:
   ```
   Add [PLAN_CAREFULLY] to your prompt
   ```

### Too Many Sequential Thoughts

1. Check if operation is genuinely complex
2. Consider breaking into smaller sub-tasks
3. Use `[QUICK_MODE]` if appropriate

### Performance Issues

1. Disable thought logging:
   ```bash
   export DISABLE_THOUGHT_LOGGING=true
   ```

2. Adjust complexity thresholds in agent profile

3. Use direct execution for known simple tasks

## Examples by Complexity

### Simple (Direct Execution)
```yaml
# Creating a single field
Task: sfdc-metadata-manager
Prompt: "Add Email field to Contact object"
# Executes directly without Sequential Thinking
```

### Medium (Optional Sequential)
```yaml
# Multi-field operation
Task: sfdc-merge-orchestrator  
Prompt: "Merge 5 duplicate fields on Account object"
# May use Sequential Thinking if uncertainty detected
```

### High (Sequential Thinking)
```yaml
# Complex cross-object operation
Task: sfdc-merge-orchestrator
Prompt: "Consolidate Lead, Contact, and Person Account objects with all relationships"
# Automatically uses Sequential Thinking for systematic approach
```

## Monitoring & Metrics

### View Agent Metrics

```javascript
// Check Sequential Thinking usage
const agent = agents.get('sfdc-merge-orchestrator');
console.log(agent.getMetrics());
// Output: {
//   tasksAnalyzed: 45,
//   sequentialUsed: 12,
//   directUsed: 33,
//   sequentialRatio: 0.27
// }
```

### Complexity Distribution

Monitor how tasks are distributed across complexity levels to tune thresholds.

## Future Enhancements

1. **Learning from History** - Adjust complexity assessment based on past success/failure
2. **Parallel Thoughts** - Execute independent thought branches simultaneously  
3. **Cross-Agent Coordination** - Share Sequential Thinking context between agents
4. **Complexity Prediction** - ML model to predict complexity before full analysis

## Summary

Sequential Thinking MCP provides intelligent, adaptive problem-solving for complex operations while maintaining efficiency for simple tasks. The complexity assessment framework ensures it's used when valuable without adding unnecessary overhead.

For questions or issues, consult the Complexity Assessment Framework documentation at:
`/shared-infrastructure/complexity-assessment/README.md`