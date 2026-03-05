---
name: plugin-scaffolding
description: Templates for creating Claude Code plugin components. Use when creating new agents, hooks, commands, or scripts. Provides standardized file structures and required fields for consistent plugin development.
allowed-tools: Read, Write, Grep, Glob
---

# Plugin Scaffolding Templates

## When to Use This Skill

Activate this skill when the user:
- Creates a new agent
- Adds a hook to a plugin
- Writes a new slash command
- Creates a library script
- Asks about plugin structure or file formats
- Needs templates for plugin components

## Plugin Structure Overview

```
.claude-plugins/{plugin-name}/
├── .claude-plugin/
│   └── plugin.json           # Plugin metadata
├── agents/
│   ├── {agent-name}.md       # Agent definitions
│   └── shared/               # Shared agent resources
├── hooks/
│   ├── {hook-name}.sh        # Hook scripts
│   └── lib/                  # Shared hook utilities
├── commands/
│   └── {command-name}.md     # Slash commands
├── scripts/
│   └── lib/                  # Library scripts
├── skills/                   # Native Skills (NEW)
│   └── {skill-name}/
│       └── SKILL.md
├── docs/                     # Documentation
├── templates/                # Template files
├── CLAUDE.md                 # Plugin user guide
├── README.md                 # Plugin overview
└── CHANGELOG.md              # Version history
```

## Component Types

### Agents (.md files in agents/)
- Define specialized sub-agents with specific capabilities
- Use YAML frontmatter for metadata
- Include tools, trigger keywords, and instructions

### Hooks (.sh files in hooks/)
- Execute on Claude Code events
- Types: UserPromptSubmit, PreToolUse, PostToolUse, etc.
- Return JSON responses with optional blocking

### Commands (.md files in commands/)
- User-invoked slash commands
- YAML frontmatter with name, description, argument-hint
- Markdown body expands as prompt

### Scripts (.js files in scripts/lib/)
- Reusable JavaScript libraries
- Called by agents and hooks
- Include JSDoc documentation

### Skills (SKILL.md in skills/{name}/)
- Model-invoked modular capabilities
- Claude autonomously decides when to use
- Include allowed-tools restrictions

## Quick Reference

For detailed templates, see:
- `templates/agent-template.md`
- `templates/hook-template.sh`
- `templates/command-template.md`
- `templates/script-template.js`
- `templates/skill-template.md`

## Required Fields

### Agent Frontmatter
```yaml
name: (required)
description: (required)
tools: (required)
version: (optional)
triggerKeywords: (optional)
```

### Hook Output
```json
{
  "systemMessage": "Message prepended to prompt",
  "blockExecution": false,
  "blockMessage": "Reason for blocking"
}
```

### Command Frontmatter
```yaml
name: (required)
description: (required)
argument-hint: (optional)
```

### Skill Frontmatter
```yaml
name: (required, lowercase-hyphen)
description: (required, critical for discovery)
allowed-tools: (optional)
```
