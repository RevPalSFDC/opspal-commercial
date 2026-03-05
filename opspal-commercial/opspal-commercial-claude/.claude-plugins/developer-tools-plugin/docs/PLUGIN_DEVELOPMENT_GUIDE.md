# Plugin Development Guide

**Version:** 1.0.0
**Created:** 2025-10-13  
**Purpose:** Guide for developing and testing OpsPal plugins

---

## Overview

This guide covers the complete plugin development lifecycle, with special focus on testing hooks and agents during development.

## Plugin Structure

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json                  # Plugin manifest
├── agents/
│   └── my-agent.md                  # Agent definitions
├── commands/
│   └── my-command.md                # Slash command definitions
├── hooks/
│   ├── SessionStart.sh              # Session startup hooks
│   ├── post-task.sh                 # Post-task hooks
│   └── user-prompt-submit.sh        # User prompt hooks
├── scripts/lib/
│   └── my-script.js                 # Utility scripts
├── templates/
│   └── my-template.md               # Output templates
└── README.md                        # Plugin documentation
```

## Testing Hooks in Development

### The SessionStart Hook Problem

**Problem:** SessionStart hooks only trigger when a plugin is **installed** in a user's environment, not when working directly in the plugin source repository.

**Why:** Claude Code distinguishes between:
- **Development context**: Working in `.claude-plugins/my-plugin/` directory  
- **Installed context**: Plugin installed via `/plugin install my-plugin@marketplace`

**Impact:** Developers testing SessionStart hooks in the source repo won't see them execute.

### Testing SessionStart Hooks

#### ❌ WRONG: Testing in Source Repo

```bash
# Working in source directory
cd .claude-plugins/my-plugin/

# Start Claude Code  
claude

# ❌ SessionStart hook does NOT run
# This is expected - you're in development context
```

#### ✅ CORRECT: Testing via Local Installation

**Option 1: Install from Local Path**
```bash
/plugin marketplace add file:///path/to/marketplace  
/plugin install my-plugin@local
```

**Option 2: Manual Hook Execution**
```bash
# Manually run the hook to test it
bash .claude-plugins/my-plugin/hooks/SessionStart.sh
```

**Option 3: Symlink Plugin (Advanced)**
```bash
# Create symlink in user's plugin directory
ln -s /path/to/.claude-plugins/my-plugin \
      ~/.claude/plugins/my-plugin@local
```

---

## Development Workflow

### 1. Create Plugin Structure

```bash
mkdir -p .claude-plugins/my-plugin/{agents,commands,hooks,scripts/lib}

cat > .claude-plugins/my-plugin/.claude-plugin/plugin.json <<EOF
{
  "name": "my-plugin",
  "description": "My awesome plugin",
  "version": "1.0.0"
}
EOF
```

### 2. Develop Features

**Create an agent:**
```markdown
---
name: my-agent
description: Does something useful
tools: Read, Write, Bash
---

# My Agent

Instructions for the agent...
```

**Create a slash command:**
```markdown
---
name: mycommand
description: My custom command
---

Execute my workflow...
```

### 3. Test Locally

**Quick Testing:**
```bash
# Test scripts
node .claude-plugins/my-plugin/scripts/lib/my-script.js

# Test hooks manually
bash .claude-plugins/my-plugin/hooks/SessionStart.sh
```

**Full Testing:**
```bash
# Install locally
/plugin install my-plugin@local

# Test agents
Task my-agent "Test task"

# Test commands
/mycommand
```

### 4. Publish

```bash
git add .claude-plugins/my-plugin/
git commit -m "feat: Add my-plugin v1.0.0"
git push
```

---

## Hook Development Best Practices

### SessionStart Hooks

**DO:**
- ✅ Keep execution fast (<1 second)
- ✅ Fail silently if dependencies missing
- ✅ Log to stderr, not stdout
- ✅ Use absolute paths or ${CLAUDE_PLUGIN_ROOT}
- ✅ Test via local installation

**DON'T:**
- ❌ Assume source repo context
- ❌ Write to stdout
- ❌ Require user interaction
- ❌ Rely on current working directory

**Example:**
```bash
#!/usr/bin/env bash

# Good: Use CLAUDE_PLUGIN_ROOT
SCRIPT="${CLAUDE_PLUGIN_ROOT}/scripts/check-updates.sh"

# Good: Fail silently
if [ ! -f "$SCRIPT" ]; then
  exit 0
fi

# Good: Run with timeout
timeout 2s bash "$SCRIPT" 2>&1 || true

exit 0
```

---

## Common Pitfalls

### 1. SessionStart Hook Doesn't Run

**Cause:** Working in source repo (not installed)

**Fix:**
```bash
chmod +x .claude-plugins/my-plugin/hooks/SessionStart.sh
/plugin install my-plugin@local
```

### 2. Agents Not Discovered

**Cause:** Missing or invalid frontmatter

**Fix:** Ensure correct format:
```markdown
---
name: my-agent
description: Agent description
tools: Read, Write
---
```

### 3. Commands Don't Work

**Cause:** File not in `commands/` directory or missing `.md` extension

**Fix:**
```bash
ls .claude-plugins/my-plugin/commands/
# Should see: mycommand.md
```

---

## Debugging Tips

```bash
# Run hook with debug output
bash -x .claude-plugins/my-plugin/hooks/SessionStart.sh

# Check exit codes
bash .claude-plugins/my-plugin/hooks/SessionStart.sh
echo "Exit code: $?"

# Validate plugin manifest
jq . .claude-plugins/my-plugin/.claude-plugin/plugin.json
```

---

**Last Updated:** 2025-10-13  
**Maintainer:** OpsPal Engineering
