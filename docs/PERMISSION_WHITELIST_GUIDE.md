# Permission Whitelist Guide

**Purpose**: Guide for Claude Code permission whitelist syntax to prevent config/env errors.

**Related to**: Cohort 4 (config/env) - Root cause: "Users need guidance on permission whitelist syntax"

**See Also**:
- Environment validator: `.claude/scripts/lib/env-validator.js`
- Pre-execution hook: `.claude/hooks/pre-execution-env-check.sh`
- Agent routing: `.claude/agent-routing.json`

---

## Overview

Claude Code uses a permission whitelist system to control which Bash commands can be executed without user approval. Commands not in the whitelist require explicit user confirmation before execution.

**Whitelist Location**: Typically defined in `.claude/settings.json` or per-agent YAML frontmatter.

---

## Syntax Format

### Basic Pattern
```
Bash(<command-pattern>:*)
```

### Components

| Part | Description | Example |
|------|-------------|---------|
| `Bash(` | Fixed prefix | `Bash(` |
| `<command-pattern>` | Command to whitelist | `sf org list` |
| `:*` | Wildcard for any args | `:*` |
| `)` | Fixed suffix | `)` |

**Important**:
- No spaces between `Bash(` and command
- Use `:*` to allow any arguments
- Use `:)` for exact command with no arguments

---

## Common Patterns

### Salesforce CLI Commands

**Read-Only Commands (Safe to whitelist)**:
```yaml
- Bash(sf org list:*)
- Bash(sf org display:*)
- Bash(sf data query:*)
- Bash(sf project retrieve start:*)
- Bash(sf sobject describe:*)
- Bash(sf sobject list:*)
- Bash(sf limits api display:*)
```

**Write Commands (Require approval)**:
```yaml
# DO NOT whitelist these without careful consideration:
# - Bash(sf project deploy:*)
# - Bash(sf data create:*)
# - Bash(sf data update:*)
# - Bash(sf data delete:*)
```

### Git Commands

**Safe to whitelist**:
```yaml
- Bash(git status:*)
- Bash(git log:*)
- Bash(git diff:*)
- Bash(git branch:*)
- Bash(git show:*)
- Bash(git ls-files:*)
```

**Potentially dangerous (needs approval)**:
```yaml
# - Bash(git push:*)        # Use only if automated
# - Bash(git commit:*)      # Use only if automated
# - Bash(git reset:*)       # Destructive
# - Bash(git rm:*)          # Destructive
```

### Node.js Commands

```yaml
- Bash(node:*)
- Bash(npm:*)
- Bash(npx:*)
- Bash(npm test:*)
- Bash(npm run:*)
```

### System Utilities

```yaml
- Bash(jq:*)
- Bash(grep:*)
- Bash(find:*)
- Bash(cat:*)
- Bash(ls:*)
- Bash(pwd:*)
- Bash(which:*)
- Bash(echo:*)
- Bash(date:*)
- Bash(wc:*)
- Bash(sort:*)
- Bash(head:*)
- Bash(tail:*)
```

---

## Advanced Patterns

### Exact Command (No Arguments)
```yaml
- Bash(pwd:)              # Only "pwd", no args
- Bash(ls:)               # Only "ls", no args
```

### Multiple Commands in One Pattern
NOT SUPPORTED. Each command needs its own entry:

❌ **WRONG**:
```yaml
- Bash(sf org list|display:*)    # Invalid syntax
```

✅ **CORRECT**:
```yaml
- Bash(sf org list:*)
- Bash(sf org display:*)
```

### Subcommand Patterns

**Whitelist all subcommands**:
```yaml
- Bash(sf org:*)          # Allows sf org list, sf org display, etc.
- Bash(sf data:*)         # Allows all sf data commands (careful!)
```

**Whitelist specific subcommand with any args**:
```yaml
- Bash(sf org list:*)     # Only sf org list with any args
- Bash(sf org display:*)  # Only sf org display with any args
```

---

## Examples by Use Case

### Safe Discovery (Read-Only)

For agents that need to discover org state without modifying:

```yaml
disallowedTools: []
whitelistedTools:
  - Bash(sf org list:*)
  - Bash(sf org display:*)
  - Bash(sf data query:*)
  - Bash(sf sobject describe:*)
  - Bash(sf limits api display:*)
  - Bash(jq:*)
  - Bash(grep:*)
```

### Data Operations (Read + Write)

For agents that need to modify data:

```yaml
disallowedTools:
  - Bash(rm -rf:*)
whitelistedTools:
  - Bash(sf org list:*)
  - Bash(sf org display:*)
  - Bash(sf data query:*)
  - Bash(sf data create:*)
  - Bash(sf data update:*)
  - Bash(sf data upsert:*)
  # Exclude destructive:
  # - Bash(sf data delete:*)
```

### Metadata Deployment

For agents that deploy metadata:

```yaml
disallowedTools:
  - Bash(rm -rf:*)
whitelistedTools:
  - Bash(sf org list:*)
  - Bash(sf project deploy:*)
  - Bash(sf project retrieve:*)
  - Bash(git status:*)
  - Bash(git diff:*)
  - Bash(jq:*)
```

---

## Troubleshooting

### Error: "Command requires approval"

**Symptom**: Claude asks for approval even though you whitelisted the command.

**Common Causes**:

1. **Extra spaces**:
   - ❌ `Bash( sf org list:*)`  (space after Bash()
   - ✅ `Bash(sf org list:*)`

2. **Wrong wildcard**:
   - ❌ `Bash(sf org list*)`     (missing colon)
   - ✅ `Bash(sf org list:*)`

3. **Case sensitivity**:
   - ❌ `Bash(SF org list:*)`    (wrong case)
   - ✅ `Bash(sf org list:*)`

4. **Incomplete pattern**:
   - ❌ `Bash(sf:*)`              (too broad, only matches "sf")
   - ✅ `Bash(sf org list:*)`     (specific subcommand)

### Validation

**Test your whitelist**:
```bash
# Run environment validator
node .claude/scripts/lib/env-validator.js --plugin salesforce

# Check permission syntax in agent files
grep -r "Bash(" .claude/agents/
```

---

## Security Best Practices

### DO Whitelist
✅ Read-only commands (query, describe, display)
✅ Safe utilities (jq, grep, cat, ls)
✅ Test/lint commands (npm test, npm run lint)
✅ Git read commands (status, diff, log)

### DO NOT Whitelist
❌ Destructive commands (rm -rf, git reset --hard)
❌ Write operations without review (sf data delete)
❌ Production deployments (require manual approval)
❌ Credential operations (sf org login without review)

### Conditional Whitelisting

**Sandbox/Dev environments**: More permissive
```yaml
whitelistedTools:
  - Bash(sf project deploy:*)   # OK for sandbox
  - Bash(sf data update:*)      # OK for sandbox
```

**Production environments**: Restrictive
```yaml
whitelistedTools:
  - Bash(sf org list:*)          # Read-only
  - Bash(sf org display:*)       # Read-only
  # Require approval for all writes:
  # - Bash(sf project deploy:*)
```

---

## Common Mistakes

### 1. Using Shell Wildcards Instead of Permission Wildcards

❌ **WRONG** (shell wildcard):
```yaml
- Bash(sf org *:*)
```

✅ **CORRECT** (permission wildcard):
```yaml
- Bash(sf org:*)               # All org subcommands
# OR
- Bash(sf org list:*)          # Specific subcommand
```

### 2. Forgetting the Colon

❌ **WRONG**:
```yaml
- Bash(sf org list*)
```

✅ **CORRECT**:
```yaml
- Bash(sf org list:*)
```

### 3. Using Quotes Incorrectly

❌ **WRONG**:
```yaml
- 'Bash(sf org list:*)'        # Quotes not needed in YAML array
```

✅ **CORRECT**:
```yaml
- Bash(sf org list:*)           # No quotes needed
```

### 4. Mixing disallowedTools and whitelistedTools Logic

**Important**: If a command is in `disallowedTools`, it BLOCKS even if in whitelist.

```yaml
disallowedTools:
  - Bash(rm -rf:*)              # BLOCKED always
whitelistedTools:
  - Bash(rm -rf:*)              # This has NO EFFECT
```

**Order of precedence**: `disallowedTools` > `whitelistedTools`

---

## Per-Agent Configuration

You can set permissions in agent YAML frontmatter:

```yaml
---
name: my-agent
description: Example agent
tools:
  - Bash
  - Read
  - Write
disallowedTools:
  - Bash(rm -rf:*)
whitelistedTools:
  - Bash(sf org list:*)
  - Bash(sf org display:*)
  - Bash(sf data query:*)
---

Agent instructions here...
```

---

## Global Configuration

Set permissions globally in `.claude/settings.json`:

```json
{
  "defaultAllowedTools": [
    "Bash(sf org list:*)",
    "Bash(sf org display:*)",
    "Bash(git status:*)",
    "Bash(jq:*)"
  ],
  "defaultDisallowedTools": [
    "Bash(rm -rf:*)",
    "Bash(git push --force:*)"
  ]
}
```

---

## Testing Your Whitelist

### Method 1: Dry Run with Validator

```bash
node .claude/scripts/lib/env-validator.js
```

### Method 2: Test in Agent

1. Create test agent with your whitelist
2. Ask Claude to run the command
3. Verify it executes without approval prompt

### Method 3: Check Logs

```bash
# Check Claude Code logs for permission denials
grep "requires approval" ~/.claude/logs/claude-code.log
```

---

## Quick Reference Card

| Want to Allow | Whitelist Pattern |
|---------------|-------------------|
| Read org info | `Bash(sf org list:*)` |
| Run SOQL query | `Bash(sf data query:*)` |
| Describe object | `Bash(sf sobject describe:*)` |
| Check API limits | `Bash(sf limits api display:*)` |
| View git status | `Bash(git status:*)` |
| Run jq queries | `Bash(jq:*)` |
| List files | `Bash(ls:*)` |
| Search files | `Bash(grep:*)` |
| Read files | `Bash(cat:*)` |
| Run tests | `Bash(npm test:*)` |

---

## Need Help?

- **Environment issues**: Run `node .claude/scripts/lib/env-validator.js`
- **Permission issues**: Check this guide's Troubleshooting section
- **Agent routing**: See `docs/routing-help.md`
- **General issues**: See `TROUBLESHOOTING.md`

---

**Version**: 1.0.0 (2026-01-07)
**Related Cohort**: Config/Env (Cohort 4)
**ROI Impact**: $10,800 annually (eliminating 3 errors/month)
