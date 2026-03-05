# {PLUGIN_NAME} Usage Guide

**Version**: {VERSION}
**Last Updated**: {DATE}

## Overview

{Brief description of what this plugin does and who should use it}

## Quick Start

### Installation
```bash
/plugin install {plugin-name}@revpal-internal-plugins
```

### First Steps
1. {Step 1}
2. {Step 2}
3. {Step 3}

### Verify Installation
```bash
# Check agents are available
/agents

# Check commands are available
/{command-name} --help
```

## When to Use This Plugin

Use {PLUGIN_NAME} when you need to:
- {Use case 1}
- {Use case 2}
- {Use case 3}

**Do NOT use this plugin for**:
- {Anti-pattern 1}
- {Anti-pattern 2}

## Agent Reference

### {Agent Name 1}
**Purpose**: {One-line description}

**When to Use**: {Specific scenarios}

**Example**:
```bash
# Invoke via Task tool
{Example invocation}
```

**Common Patterns**:
- {Pattern 1}
- {Pattern 2}

### {Agent Name 2}
{Repeat structure above}

## Command Reference

### /{command-name}
**Purpose**: {One-line description}

**Usage**:
```bash
/{command-name} [options]
```

**Options**:
- `--option1` - {Description}
- `--option2` - {Description}

**Examples**:
```bash
# Example 1: {Description}
/{command-name} --option1 value

# Example 2: {Description}
/{command-name} --option2 value
```

**Output**: {What to expect}

## Configuration

### Environment Variables
```bash
# Required
{VAR_NAME}={description}

# Optional
{VAR_NAME}={description}
```

### Plugin Settings
Configure in `.claude-plugins/{plugin-name}/.claude-plugin/settings.json`:
```json
{
  "setting1": "value",
  "setting2": "value"
}
```

## Common Workflows

### Workflow 1: {Name}
**Goal**: {What this accomplishes}

**Steps**:
1. {Step with command/agent}
2. {Step with command/agent}
3. {Step with command/agent}

**Example**:
```bash
{Full example with output}
```

### Workflow 2: {Name}
{Repeat structure above}

## Best Practices

### ✅ DO
- {Best practice 1}
- {Best practice 2}
- {Best practice 3}

### 🚫 DON'T
- {Anti-pattern 1}
- {Anti-pattern 2}
- {Anti-pattern 3}

## Common Pitfalls

### Pitfall 1: {Name}
**Symptom**: {What user sees}

**Cause**: {Why it happens}

**Solution**:
```bash
{How to fix}
```

**Prevention**: {How to avoid}

### Pitfall 2: {Name}
{Repeat structure above}

## Troubleshooting

### Issue: {Problem description}
**Error Message**:
```
{Exact error message}
```

**Diagnosis**:
1. Check {thing 1}
2. Verify {thing 2}
3. Confirm {thing 3}

**Solution**:
```bash
{Commands to fix}
```

**Verification**:
```bash
{Commands to verify fix}
```

### Issue: {Problem description}
{Repeat structure above}

## Integration with Other Plugins

### Works With
- **{plugin-name}**: {How they work together}
- **{plugin-name}**: {How they work together}

### Conflicts With
- **{plugin-name}**: {Known conflicts and workarounds}

## Performance Considerations

- {Consideration 1}
- {Consideration 2}
- {Consideration 3}

## Security Considerations

- {Security note 1}
- {Security note 2}
- {Security note 3}

## Updates and Versioning

### Recent Changes
See [CHANGELOG.md](./CHANGELOG.md) for full history.

### Breaking Changes from Previous Versions
- **{version}**: {What broke and how to migrate}

### Deprecation Notices
- **{feature}**: Will be removed in {version}. Use {alternative} instead.

## Additional Resources

- **README**: [README.md](./README.md) - Plugin overview
- **CHANGELOG**: [CHANGELOG.md](./CHANGELOG.md) - Version history
- **Examples**: `.claude-plugins/{plugin-name}/examples/`
- **Support**: File issues at {repository-url}

## Feedback

Help us improve! Use the `/reflect` command after your session to provide feedback:
```bash
/reflect
```

Your feedback is automatically submitted to our improvement system and helps us prioritize fixes and enhancements.

---

**Need Help?**
- Check [Troubleshooting](#troubleshooting) section above
- Review [Common Pitfalls](#common-pitfalls)
- Run `/agents` to see available agents
- Use `/reflect` to report issues
