# Claude Code Hooks Development Guide

**Last Updated**: 2026-02-10
**Version**: 1.0.0

## 1. Introduction

The Claude Code hook system allows developers to intercept and modify the agent's lifecycle events. This capability is critical for enforcing safety checks, injecting context, routing tasks to specialized agents, and managing session state.

This guide consolidates architectural patterns, configuration details, known issues (specifically the output injection bug), and best practices for developing robust hooks within the OpsPal ecosystem.

---

## 2. Architecture & Patterns

### The "Master Orchestrator" Pattern

To maintain modularity and prevent conflicts, we use a **Master Orchestrator** pattern. Instead of registering dozens of individual hooks directly with Claude Code, we register a single "Master Hook" for each event type (e.g., `UserPromptSubmit`) which then chains execution to specialized sub-hooks.

**Flow:**
```
Claude Code
  ↓
Master Hook (e.g., master-prompt-handler.sh)
  ↓
  ├── Phase 1: Prevention System (Safety & Validation)
  │     ├── pre-task-routing-clarity.sh
  │     ├── pre-operation-env-validator.sh
  │     └── ...
  │
  └── Phase 2: Context Enhancement (Routing & Logic)
        ├── subagent-utilization-booster.sh
        └── ...
```

**Benefits:**
- **Centralized Control:** Single point of entry for enabling/disabling subsystems.
- **Ordered Execution:** Ensures safety checks run before context enhancement.
- **Graceful Degradation:** Master hooks can handle missing sub-hooks without crashing.

---

## 3. Hook Types & Events

| Event | Trigger | Typical Use Case |
|-------|---------|------------------|
| **UserPromptSubmit** | Immediately after user sends a message. | Context injection, task routing, intent classification. |
| **SessionStart** | When a new session initializes. | Environment setup, temp dir creation, context loading. |
| **PreToolUse** | Before a tool (Bash, Write, Task) executes. | Validation, policy enforcement, "circuit breaking". |
| **PostToolUse** | After a tool execution completes. | Logging, verification, artifact processing (e.g., PDF validation). |
| **Stop** | Before the agent session ends. | Cleanup, state saving. |

---

## 4. Configuration & Registration

Hooks can be registered in two primary locations:

### A. Plugin-Level (`plugin.json`)
Used for distributable plugins. Paths are relative to the plugin root.

```json
// plugins/my-plugin/.claude-plugin/plugin.json
{
  "hooks": [
    {
      "event": "PreToolUse",
      "matcher": { "tool_name": "Task" },
      "command": "./hooks/pre-task-validator.sh"
    },
    {
      "event": "SessionStart",
      "command": "./hooks/session-init.sh"
    }
  ]
}
```

### B. User-Level (`~/.claude/settings.json`)
Used for global overrides and **critical workarounds** (see Section 5).

```json
// ~/.claude/settings.json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/script.sh"
          }
        ]
      }
    ]
  }
}
```

---

## 5. The "Output Injection" Bug (CRITICAL)

**Issue:** As of late 2025/early 2026, there is a known bug in Claude Code where **stdout from project-level hooks is silently discarded**. This means any context, routing instructions, or system messages you try to inject via `echo` will NOT reach the agent.

**Symptoms:**
- Hook executes successfully (exit code 0).
- Logs show "Callback hook success".
- **But:** Claude ignores your instructions/context.

### Workarounds

#### 1. User-Level Registration (Recommended for Local Dev)
Register your hook in `~/.claude/settings.json` (User Level). The bug specifically affects project-level configuration.
*See Section 4B for format.*

#### 2. Enhanced `CLAUDE.md` (Reliable Fallback)
Since we cannot rely on dynamic injection, we use **static instructions** in `CLAUDE.md`.
- Define **BLOCKED** operations that require specific handling.
- specific routing tables.
- Mandatory pre-response checklists.

*Example:*
```markdown
# CLAUDE.md
## Routing Rules
- IF task involves "CPQ" OR "Q2C" -> MUST use `opspal-salesforce`
- IF task involves "Audit" -> MUST use `opspal-compliance`
```

#### 3. Stderr for User Visibility
While `stdout` is hidden from the user and (due to the bug) ignored by the agent, `stderr` is **visible to the user**. Use this to display routing banners or warnings directly to the human.

```bash
# In your hook script
echo "[ROUTING] recommending specialized agent..." >&2
```

---

## 6. Development Guidelines

### Script Structure
Always use strict mode and handle signals.

```bash
#!/bin/bash
set -euo pipefail

# 1. Configuration & Defaults
ENABLED="${MY_HOOK_ENABLED:-1}"
[ "$ENABLED" != "1" ] && exit 0

# 2. Path Resolution (Crucial for plugins)
# Always implement fallback logic if CLAUDE_PLUGIN_ROOT is missing
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

# 3. Logic
# ... do work ...

# 4. Output (JSON for Claude, Text for User)
# >&2 echo "User message"
# echo '{"systemMessage": "..."}'
```

### Exit Codes
- **0 (Success):** Hook passed. Execution continues.
- **1 (Block):** Critical failure. Operation is blocked.
- **2 (Warning):** Non-critical issue. Warn user but proceed.

### Environment Variables
- `CLAUDE_PLUGIN_ROOT`: Root of the plugin (if registered as plugin).
- `USER_PROMPT`: The user's input (available in `UserPromptSubmit`).
- `PWD`: Current working directory.

---

## 7. Testing & Debugging

### Manual Testing
Test your scripts independently of Claude Code to ensure logic is correct.

```bash
# Test UserPromptSubmit hook
echo "Run a CPQ audit" | ./hooks/my-hook.sh

# Test with environment variables
MASTER_HOOK_ENABLED=1 ./hooks/master-prompt-handler.sh
```

### Debugging
Enable verbose logging if your hooks support it (common pattern in OpsPal hooks).

```bash
export HOOK_DEBUG=true
claude code
```

### "Health Check"
If hooks aren't firing:
1. Check `settings.json` syntax.
2. Verify script executable permissions (`chmod +x`).
3. Ensure `jq` is installed (common dependency).
4. Run validation scripts if available (`./scripts/validate-hooks.sh`).

---

## 8. Best Practices Checklist

- [ ] **Modularity:** Use the "Master Orchestrator" pattern; don't put all logic in one massive script.
- [ ] **Resilience:** Check for dependencies (`jq`, `node`) and fail gracefully or degrade functionality.
- [ ] **Visibility:** Use `stderr` to communicate *to the user*.
- [ ] **Context:** Use `stdout` (JSON) to communicate *to the agent* (but remember the Injection Bug!).
- [ ] **Performance:** Keep hooks fast (<200ms). Slow hooks degrade the chat experience.
- [ ] **Safety:** Use `set -euo pipefail` to catch errors early.
