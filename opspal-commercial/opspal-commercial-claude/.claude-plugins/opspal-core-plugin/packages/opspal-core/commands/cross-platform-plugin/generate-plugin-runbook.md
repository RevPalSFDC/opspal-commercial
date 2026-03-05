---
description: Generate comprehensive runbook documentation for a Claude Code plugin
argument-hint: "[--plugin <path>] [--output <path>]"
---

# Generate Plugin Runbook

Generate comprehensive runbook documentation for a Claude Code plugin.

## Usage

```bash
/generate-plugin-runbook [--plugin <path>] [--output <path>]
```

## Options

- `--plugin <path>` - Path to the plugin directory (default: current directory)
- `--output <path>` - Output directory for generated docs (default: `<plugin>/docs/runbooks`)

## Examples

```bash
# Generate runbook for salesforce-plugin
/generate-plugin-runbook --plugin .claude-plugins/opspal-core-plugin/packages/domains/salesforce

# Generate with custom output
/generate-plugin-runbook --plugin .claude-plugins/opspal-core-plugin/packages/domains/hubspot --output ./docs
```

## What It Generates

### PLUGIN_RUNBOOK.md
Main runbook with:
- Plugin overview and statistics
- Quick start guide
- Agent selection table
- Available commands
- Best practices summary

### AGENT_WORKFLOWS.md
Detailed agent documentation:
- Decision tree for agent selection
- Agents grouped by category
- Agents grouped by task type
- Comprehensive agent reference

### BEST_PRACTICES.md
Operational guidance:
- General practices
- When to use the plugin
- Troubleshooting guide

## Implementation

```bash
# The command runs the plugin runbook generator
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/runbook-framework/plugin-runbook-generator.js \
  --plugin "${PLUGIN_PATH:-$(pwd)}" \
  --output "${OUTPUT_PATH:-}"
```

## Analysis Performed

1. **Plugin Structure** - Analyzes agents, commands, scripts, hooks
2. **Agent Categorization** - Groups agents by function (Orchestration, Assessment, Creation, etc.)
3. **Task Mapping** - Maps agents to common task types
4. **Decision Tree** - Generates agent selection guidance
5. **Best Practices** - Derives practices from plugin structure

## Output Example

```
📚 Generating runbook for plugin: salesforce-plugin

🔍 Analyzing plugin structure...
   Agents: 74
   Commands: 16
   Scripts: 102
   Hooks: 5

🎯 Generating agent selection guidance...
   Categories: 6
   Task mappings: 7

✅ Generating best practices...
   Practices: 8

📝 Writing PLUGIN_RUNBOOK.md...
📝 Writing AGENT_WORKFLOWS.md...
📝 Writing BEST_PRACTICES.md...

✅ Plugin runbook generated successfully!
   Output: .claude-plugins/opspal-core-plugin/packages/domains/salesforce/docs/runbooks
```

## Related

- `/generate-runbook` - Generate instance runbooks (Salesforce org, HubSpot portal)
- `/view-runbook` - View existing runbooks
- `/diff-runbook` - Compare runbook versions
