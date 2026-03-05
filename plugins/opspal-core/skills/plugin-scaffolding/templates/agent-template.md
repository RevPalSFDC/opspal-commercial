# Agent Template

## File Location
`agents/{agent-name}.md`

## Template

```markdown
---
name: {agent-name}
description: {Brief description of what this agent does. This appears in agent listings and routing decisions.}
tools: {Comma-separated list of allowed tools}
disallowedTools:
  - {Tool patterns to block}
version: 1.0.0
created: {YYYY-MM-DD}
model: haiku
triggerKeywords:
  - {keyword1}
  - {keyword2}
  - {keyword3}
---

# {Agent Name} Agent

## Purpose

{Detailed description of what this agent does and when to use it.}

## Core Responsibilities

1. **{Responsibility 1}** - {Description}
2. **{Responsibility 2}** - {Description}
3. **{Responsibility 3}** - {Description}

## Capability Boundaries

### What This Agent CAN Do
- {Capability 1}
- {Capability 2}
- {Capability 3}

### What This Agent CANNOT Do

| Limitation | Reason | Alternative |
|------------|--------|-------------|
| {Limitation 1} | {Why} | Use `{other-agent}` |
| {Limitation 2} | {Why} | Use `{other-agent}` |

### When to Use a Different Agent

| If You Need... | Use Instead | Why |
|----------------|-------------|-----|
| {Need 1} | `{agent-name}` | {Reason} |
| {Need 2} | `{agent-name}` | {Reason} |

## Required Tools

- **{Tool 1}** - {Purpose}
- **{Tool 2}** - {Purpose}

## Workflow

### Step 1: {Step Name}
{Step description}

### Step 2: {Step Name}
{Step description}

## Output Format

{Describe expected output format}

## Error Handling

{Describe how errors should be handled}

## Examples

### Example 1: {Use Case}
{Example description and expected behavior}
```

## Required Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Agent identifier (lowercase-hyphen) |
| `description` | Yes | Brief description for routing |
| `tools` | Yes | Allowed tools list |
| `version` | No | Semantic version |
| `created` | No | Creation date |
| `model` | No | Default model (haiku/sonnet/opus) |
| `triggerKeywords` | No | Keywords that route to this agent |
| `disallowedTools` | No | Tools to explicitly block |

## Routing Keywords

Include keywords that should route tasks to this agent:
- Domain-specific terms (e.g., "cpq", "revops", "hubspot")
- Action words (e.g., "assess", "audit", "deploy")
- Object names (e.g., "permission set", "flow", "validation rule")

## Best Practices

1. **Clear boundaries**: Define what the agent can and cannot do
2. **Routing guidance**: Include "When to Use a Different Agent" section
3. **Tool restrictions**: Only allow tools the agent needs
4. **Version tracking**: Update version when changing behavior
5. **Examples**: Include real-world usage examples
