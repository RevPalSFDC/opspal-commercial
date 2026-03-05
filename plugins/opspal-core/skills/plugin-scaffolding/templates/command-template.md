# Command Template

## File Location
`commands/{command-name}.md`

## Template

```markdown
---
name: {command-name}
description: {Brief description shown in command listings}
argument-hint: "[options]"
---

# {Command Name}

{Detailed description of what this command does and when to use it.}

## Usage

```bash
/{command-name} [options]
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--option1` | {Description} | {default} |
| `--option2` | {Description} | {default} |

## Examples

### Basic Usage
```bash
/{command-name}
```

### With Options
```bash
/{command-name} --option1 value
```

## Expected Output

{Describe what the command produces}

## Requirements

- {Requirement 1}
- {Requirement 2}

## Related Commands

- `/{related-command-1}` - {Description}
- `/{related-command-2}` - {Description}
```

## Required Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Command name (lowercase-hyphen, no leading /) |
| `description` | Yes | Brief description for listings |
| `argument-hint` | No | Hint for expected arguments |

## Naming Conventions

### Command Names
- Use lowercase with hyphens: `my-command`
- Be descriptive: `generate-report` not `gen-rpt`
- Use verb-noun format: `create-task`, `list-agents`, `run-audit`

### Argument Hints
- Use brackets for optional: `[options]`
- Use angle brackets for required: `<org-alias>`
- Combine as needed: `<org-alias> [--verbose]`

## Content Guidelines

### Header Section
The command description should:
- Start with a verb (Generate, Create, Run, List)
- Explain what the command does
- Mention when to use it

### Usage Section
Show the full command syntax with:
- Command name with leading /
- All arguments in proper notation
- Multiple usage patterns if applicable

### Options Section
For each option include:
- Flag name with double-dash
- Clear description
- Default value or "required"

### Examples Section
Include:
- Basic usage (simplest case)
- Common use cases
- Complex scenarios with multiple options

## Best Practices

1. **Clear descriptions**: Users should understand the command from the description
2. **Complete examples**: Show real-world usage patterns
3. **Related commands**: Help users discover related functionality
4. **Requirements**: List prerequisites (env vars, tools, permissions)
5. **Error guidance**: Mention common errors and fixes

## Command Body

The markdown body becomes the prompt when the command is invoked.
Write it as instructions for Claude:

```markdown
You are executing the /{command-name} command.

## Context
{Explain what the user wants to accomplish}

## Steps
1. {First step}
2. {Second step}
3. {Third step}

## Output Requirements
- {Output requirement 1}
- {Output requirement 2}

## Validation
Before completing:
- [ ] {Validation check 1}
- [ ] {Validation check 2}
```
