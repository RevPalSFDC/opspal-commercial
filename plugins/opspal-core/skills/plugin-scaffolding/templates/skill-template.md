# Skill Template

## File Location
`skills/{skill-name}/SKILL.md`

## Template

```markdown
---
name: {skill-name}
description: {10-300 chars. Specific and action-oriented. Names exact use cases and trigger conditions.}
allowed-tools:
  - Read
  - Grep
  - Glob
agent: {plugin-name}:{agent-name}  # Optional: link to a specific subagent
---

# {Skill Name}

## When to Use This Skill

Use this skill when:
- {Specific trigger condition 1}
- {Specific trigger condition 2}
- {Specific trigger condition 3}

**Not for**: {Describe what this skill does NOT cover and where to look instead}

## Quick Reference

| {Column 1} | {Column 2} | {Column 3} |
|-------------|-------------|-------------|
| {Value}     | {Value}     | {Value}     |

## Workflow

### Step 1: {Step Name}
{Concrete guidance with commands, queries, or decision logic}

### Step 2: {Step Name}
{Concrete guidance with commands, queries, or decision logic}

### Step 3: {Step Name}
{Concrete guidance with commands, queries, or decision logic}

## Routing Boundaries

Use this skill for {specific scope}.
Use `{other-skill}` for {adjacent scope}.

## References

- [{Supporting doc title}](./{supporting-doc}.md)
```

## Required Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Skill identifier (lowercase-hyphen, 3+ chars, `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`) |
| `description` | Yes | 10-300 chars, specific and action-oriented |
| `allowed-tools` | No | Scoped tool list (only tools the skill actually needs) |
| `agent` | No | Link to a specific subagent (`plugin:agent-name`) |
| `context` | No | Execution context (`fork: true` for isolated execution) |
| `version` | No | Semantic version |

## Naming Conventions

### Skill Names
- Use lowercase with hyphens: `my-skill-name`
- Be descriptive: `automation-audit-framework` not `auto-aud`
- Use noun-phrase format: `flow-segmentation-guide`, `territory-management`
- For framework skills: append `-framework`, `-patterns`, or `-guide`

### Directory Structure
```
skills/{skill-name}/
  SKILL.md              # Main entry point (MUST be named SKILL.md)
  {supporting-doc-1}.md # Optional: detailed reference
  {supporting-doc-2}.md # Optional: detailed reference
```

The file MUST be named `SKILL.md` -- any other name will not be discovered by the harness.

## Content Guidelines

### Description Field
The description should:
- Start with a domain noun or action verb
- Name specific operations, objects, or workflows
- Include trigger keywords that help the model match the skill to tasks
- Avoid generic phrases like "Use when the task matches the pattern"

Good: `Salesforce automation audit methodology. Use when auditing Flows, Process Builders, Workflow Rules, or Apex Triggers.`
Bad: `Use when the task matches the pattern described in the description.`

### When to Use Section
List specific, enumerable trigger conditions:
- Name concrete objects, operations, or scenarios
- Include "Not for" to prevent false matches
- Reference alternative skills for adjacent domains

### Workflow Section
Each step should include:
- Concrete commands, queries, or decision logic
- API calls or CLI examples where applicable
- Decision criteria (not just "analyze" or "review")

### Supporting Files
Use supporting files for:
- Detailed reference tables (API specs, field mappings)
- Classification matrices
- Decision trees
- Code examples

Each supporting file should be self-contained and focused on a single concept.

## Skill Architecture Patterns

### Self-Contained (Single File)
For reference skills with 100+ lines of domain knowledge.
All content lives in SKILL.md. No supporting files needed.

```
skills/attio-api-reference/
  SKILL.md  (271 lines)
```

### Hub-and-Spoke (Multi-File)
For framework skills with multiple concern areas.
SKILL.md is the index; supporting files hold the detail.

```
skills/automation-audit-framework/
  SKILL.md                     (96 lines - overview + workflow)
  classification-matrix.md     (detailed automation classification)
  conflict-detection.md        (conflict detection methodology)
  cascade-mapping.md           (cascade analysis patterns)
  migration-rationale.md       (migration decision framework)
```

### Minimal (Index Only)
For simple routing or governance skills.
SKILL.md is brief but has specific triggers and boundaries.

```
skills/hooks-health/
  SKILL.md  (78 lines - complete in itself)
```

## Best Practices

1. **Specific triggers**: Name exact objects, APIs, or operations
2. **Concrete workflows**: Include commands and queries, not just verbs
3. **Routing boundaries**: Always define what this skill is NOT for
4. **Scoped tools**: Only list tools the skill actually uses
5. **Agent linkage**: Add `agent:` when the skill maps to a single specialist
6. **Supporting files**: Use for detailed reference; keep SKILL.md as the scannable overview
7. **No boilerplate**: Every line should add domain value
