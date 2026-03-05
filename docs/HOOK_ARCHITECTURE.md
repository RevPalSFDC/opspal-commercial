# Hook Architecture Documentation

**Last Updated**: 2025-11-20
**Version**: 1.0.0

## Overview

The OpsPal Internal Plugin Marketplace uses a sophisticated hook system to enhance Claude Code's functionality through lifecycle event interception. This document describes the architecture, execution flow, and best practices for the hook system.

## Table of Contents

1. [System Overview](#system-overview)
2. [Hook Types & Lifecycle](#hook-types--lifecycle)
3. [Hook Execution Flow](#hook-execution-flow)
4. [Active Hooks Inventory](#active-hooks-inventory)
5. [Configuration](#configuration)
6. [Environment Variables](#environment-variables)
7. [Troubleshooting](#troubleshooting)
8. [Best Practices](#best-practices)

---

## System Overview

### Architecture Philosophy

The hook system follows these principles:

1. **Layered Orchestration**: Master hooks delegate to specialized sub-hooks
2. **Graceful Degradation**: Hooks fail gracefully when dependencies are missing
3. **Zero Configuration**: Hooks work out-of-the-box with sensible defaults
4. **Transparent Operation**: Users can see hook execution through verbose mode

### Key Components

```
Claude Code CLI
    ↓
Hook Configuration (.claude/settings.json)
    ↓
Master Orchestrators (opspal-core)
    ↓
Specialized Hooks (plugin-specific)
    ↓
User Prompt / Session State
```

---

## Hook Types & Lifecycle

### 1. UserPromptSubmit Hook

**When**: Fires immediately after user submits a message, before Claude processes it

**Purpose**:
- Enhance user prompts with context
- Route to appropriate agents
- Validate operations before execution
- Add system messages for agent guidance

**Current Implementation**: `master-prompt-handler.sh`

**Input**: JSON with user message
```json
{
  "message": "Run a CPQ assessment for gamma-corp"
}
```

**Output**: JSON with optional systemMessage
```json
{
  "systemMessage": "Using the appropriate sub-agents, Run a CPQ assessment for gamma-corp"
}
```

### 2. SessionStart Hook

**When**: Fires when a new Claude Code session starts

**Purpose**:
- Initialize environment
- Create temporary directories
- Load session context
- Display reminders

**Current Implementation**: Chained hooks
1. `session-start-agent-reminder.sh` (Salesforce plugin)
2. `session-context-loader.sh` (Cross-platform plugin)

**Input**: None (environment variables only)

**Output**: None (side effects: creates directories, displays messages)

### 3. Pre-Commit Hooks

**When**: Before git commit operations

**Purpose**:
- Validate distribution readiness
- Check for quality issues
- Enforce git separation rules
- Run automated tests

**Implementation**: Multiple hooks in `.claude/hooks/`

---

## Hook Execution Flow

### UserPromptSubmit Flow (Detailed)

```
User Types Message
    ↓
Claude Code invokes: master-prompt-handler.sh
    ↓
┌─────────────────────────────────────────┐
│ master-prompt-handler.sh                │
│ - Checks MASTER_HOOK_ENABLED            │
│ - Logs request                          │
└─────────────────────────────────────────┘
    ↓
    ├─→ Phase 1: Prevention System
    │   ┌─────────────────────────────────────────┐
    │   │ prevention-system-orchestrator.sh       │
    │   │ - Detects request type                  │
    │   │ - Routes to appropriate validators      │
    │   └─────────────────────────────────────────┘
    │       ↓
    │   ┌─────────────────────────────────────────┐
    │   │ Individual Prevention Hooks             │
    │   │ - pre-task-routing-clarity.sh           │
    │   │ - pre-task-agent-recommendation.sh      │
    │   │ - pre-plan-scope-validation.sh          │
    │   │ - pre-operation-env-validator.sh        │
    │   │ - pre-operation-idempotency-check.sh    │
    │   │ - pre-operation-snapshot.sh             │
    │   │ - pre-agent-task-decomposition.sh       │
    │   │ - pre-agent-performance-monitor.sh      │
    │   └─────────────────────────────────────────┘
    │       ↓
    │   Exit Code Check:
    │   - 0 = Success, continue
    │   - 1 = Block execution, return error
    │   - 2 = Warning, continue with message
    │
    └─→ Phase 2: Sub-Agent Utilization
        ┌─────────────────────────────────────────┐
        │ subagent-utilization-booster.sh         │
        │ - Checks jq availability                │
        │ - Prepends "Using appropriate agents"   │
        └─────────────────────────────────────────┘
            ↓
        ┌─────────────────────────────────────────┐
        │ user-prompt-hybrid.sh (SF plugin)       │
        │ - Domain-specific routing               │
        │ - Complexity scoring                    │
        └─────────────────────────────────────────┘
            ↓
        Build Enhanced JSON
        {
          "systemMessage": "...",
          "metadata": { ... }
        }
            ↓
Return to Claude Code
    ↓
Claude Processes Enhanced Message
```

### SessionStart Flow (Detailed)

```
New Session Starts
    ↓
Claude Code invokes: SessionStart Hook Chain
    ↓
┌─────────────────────────────────────────┐
│ session-start-agent-reminder.sh         │
│ (Salesforce Plugin)                     │
│                                         │
│ 1. Create temp directories:             │
│    - /tmp/salesforce-reports            │
│    - /tmp/sf-cache                      │
│    - /tmp/sf-data                       │
│    - /tmp/salesforce-sync               │
│                                         │
│ 2. Check for AGENT_REMINDER.md          │
│    - If missing: Emit warning           │
│    - If present: Silent success         │
│                                         │
│ 3. Always exit 0 (non-blocking)         │
└─────────────────────────────────────────┘
    ↓ (if previous succeeded)
┌─────────────────────────────────────────┐
│ session-context-loader.sh               │
│ (Cross-platform Plugin)                 │
│                                         │
│ 1. Check for session-context-manager.js │
│                                         │
│ 2. Load recent contexts:                │
│    - Last 3 sessions for working dir    │
│    - Extract key decisions/patterns     │
│                                         │
│ 3. Display context preview              │
│                                         │
│ 4. Export environment variables:        │
│    - SESSION_CONTEXT_AVAILABLE=true     │
│    - SESSION_LAST_ORG=...               │
│                                         │
│ 5. Exit 0 (non-blocking)                │
└─────────────────────────────────────────┘
    ↓
Session Initialization Complete
```

---

## Active Hooks Inventory

### Master Orchestrator Hooks (OpsPal Core)

| Hook | Location | Purpose | Status |
|------|----------|---------|--------|
| master-prompt-handler.sh | `.claude-plugins/opspal-core/hooks/` | Main UserPromptSubmit orchestrator | ✅ Active |
| prevention-system-orchestrator.sh | `.claude-plugins/opspal-core/hooks/` | Routes to prevention hooks | ✅ Active |
| subagent-utilization-booster.sh | `.claude-plugins/opspal-core/hooks/` | Enhances agent utilization | ✅ Active |
| session-context-loader.sh | `.claude-plugins/opspal-core/hooks/` | Loads session context | ✅ Active |

### Prevention Hooks (OpsPal Core)

| Hook | Purpose | Exit Codes |
|------|---------|------------|
| pre-task-routing-clarity.sh | Ensures clear task routing | 0 (continue), 1 (block), 2 (warn) |
| pre-task-agent-recommendation.sh | Suggests appropriate agents | 0 or 2 |
| pre-plan-scope-validation.sh | Validates plan scope | 0 or 2 |
| pre-operation-env-validator.sh | Validates environment | 0, 1, or 2 |
| pre-operation-idempotency-check.sh | Checks idempotency | 0 or 2 |
| pre-operation-snapshot.sh | Creates snapshots for risky ops | 0 or 2 |
| pre-agent-task-decomposition.sh | Decomposes complex tasks | 0 or 2 |
| pre-agent-performance-monitor.sh | Monitors agent performance | 0 or 2 |

### Salesforce Plugin Hooks

| Hook | Purpose | Status |
|------|---------|--------|
| session-start-agent-reminder.sh | Creates temp dirs, displays reminders | ✅ Active (SessionStart) |
| user-prompt-hybrid.sh | SF-specific routing | ✅ Active (called by booster) |
| user-prompt-submit.sh | Legacy prompt handler | ⚠️ Not registered (superseded) |
| pre-sf-command-validation.sh | SF CLI command validation | ✅ Active (pre-command) |

### HubSpot Plugin Hooks

| Hook | Purpose | Status |
|------|---------|--------|
| user-prompt-submit.sh | Legacy prompt handler | ⚠️ Not registered (superseded) |

### Project-Level Hooks (.claude/hooks/)

| Hook | Purpose | Status |
|------|---------|--------|
| user-prompt-submit.sh | Simple prompt injector | ⚠️ May conflict with plugins |
| pre-commit | Git pre-commit validation | ✅ Active |
| pre-commit-distribution-check.sh | Distribution readiness | ✅ Active |
| pre-commit-quality-check.sh | Quality validation | ✅ Active |

---

## Configuration

### settings.json Structure

Location: `.claude/settings.json`

```json
{
  "hooks": {
    "UserPromptSubmit": {
      "type": "command",
      "command": "bash ${CLAUDE_PLUGIN_ROOT}/.claude-plugins/opspal-core/hooks/master-prompt-handler.sh",
      "timeout": 10000,
      "description": "Master prompt handler - chains Prevention System with Sub-Agent Utilization Booster"
    },
    "SessionStart": {
      "type": "command",
      "command": "bash -c '${CLAUDE_PLUGIN_ROOT}/.claude-plugins/opspal-salesforce/hooks/session-start-agent-reminder.sh && ${CLAUDE_PLUGIN_ROOT}/.claude-plugins/opspal-core/hooks/session-context-loader.sh'",
      "timeout": 5000,
      "description": "Session initialization - creates temp directories, checks agent reminders, and loads cross-session context"
    }
  }
}
```

### Hook Configuration Options

#### Timeout Values

- **UserPromptSubmit**: 10 seconds (typical: 250ms, max observed: 600ms)
- **SessionStart**: 5 seconds (typical: 100ms)

#### Environment Variables

Hooks can access:
- `CLAUDE_PLUGIN_ROOT` - Project root path (set by Claude Code)
- `USER_PROMPT` - User's message (UserPromptSubmit only)
- `PWD` - Current working directory
- `HOME` - User home directory

---

## Environment Variables

### CLAUDE_PLUGIN_ROOT

**Status**: Set by Claude Code during hook execution
**Expected**: `/home/chris/Desktop/RevPal/Agents/opspal-internal-plugins`

**Fallback Logic** (if not set):
```bash
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
```

**Usage in Hooks**:
```bash
# Always use with fallback
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
```

### Feature Flags

Hooks respect these environment variables:

```bash
# Disable master hook (emergency escape)
MASTER_HOOK_ENABLED=false

# Disable prevention system
PREVENTION_ENABLED=false

# Disable sub-agent booster
SUBAGENT_ENABLED=false

# Enable verbose logging
HOOK_DEBUG=true
```

---

## Troubleshooting

### Common Issues

#### 1. Hook Not Executing

**Symptoms**: No systemMessage added to prompts, no temp directories created

**Diagnosis**:
```bash
# Check hook configuration
cat .claude/settings.json | jq '.hooks'

# Test hook manually
echo '{"message":"test"}' | bash .claude-plugins/opspal-core/hooks/master-prompt-handler.sh
```

**Solutions**:
- Verify `settings.json` has correct hook paths
- Check `CLAUDE_PLUGIN_ROOT` is set correctly
- Ensure hook files are executable: `chmod +x <hook-file>`

#### 2. Missing AGENT_REMINDER.md Warning

**Symptoms**: Warning message on session start

**Solution**:
```bash
# File should exist at:
.claude/AGENT_REMINDER.md

# If missing, hook will emit warning but continue
# Create the file using the template in this repo
```

#### 3. jq Not Installed

**Symptoms**: Sub-agent boosting disabled silently

**Diagnosis**:
```bash
which jq
# If not found, install:
# Ubuntu/Debian: sudo apt-get install jq
# macOS: brew install jq
```

#### 4. Hook Timeout

**Symptoms**: Hook chain takes too long, times out

**Diagnosis**:
```bash
# Time hook execution
time echo '{"message":"test"}' | bash .claude-plugins/opspal-core/hooks/master-prompt-handler.sh
```

**Solutions**:
- Check for slow prevention hooks
- Increase timeout in `settings.json`
- Disable specific prevention hooks if needed

### Health Check Command

Run the comprehensive health check:

```bash
/hooks-health
```

Or run the validation script directly:

```bash
bash .claude/scripts/validate-env.sh
```

---

## Best Practices

### For Hook Developers

1. **Always use fallback paths**
   ```bash
   PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
   ```

2. **Exit codes matter**
   - `0` - Success, continue
   - `1` - Block execution
   - `2` - Warning, continue

3. **Graceful degradation**
   ```bash
   if ! command -v jq &> /dev/null; then
     echo '{}'
     exit 0
   fi
   ```

4. **Test hooks independently**
   ```bash
   # Test with mock input
   echo '{"message":"test"}' | bash your-hook.sh
   ```

5. **Log thoughtfully**
   - Use stderr for warnings/errors
   - Use stdout only for JSON output (UserPromptSubmit)
   - Support `HOOK_DEBUG=true` for verbose logging

### For Users

1. **Check hook health regularly**
   ```bash
   /hooks-health
   ```

2. **Understand escape hatches**
   ```bash
   # Disable all hooks temporarily
   MASTER_HOOK_ENABLED=false claude code
   ```

3. **Report issues with context**
   - Include hook execution output
   - Run validation script
   - Check settings.json configuration

### For Plugin Authors

1. **Don't override master hooks**
   - Use specialized hooks that are called by master hooks
   - Register only if you're providing a completely new lifecycle event

2. **Document hook dependencies**
   - List required executables (jq, node, etc.)
   - Specify minimum versions

3. **Provide installation checks**
   - Include dependency validation in plugin
   - Use `/check-deps` command pattern

---

## Appendix: Hook Dependency Graph

```
UserPromptSubmit Hook Chain:
master-prompt-handler.sh
├── prevention-system-orchestrator.sh
│   ├── pre-task-routing-clarity.sh
│   ├── pre-task-agent-recommendation.sh
│   ├── pre-plan-scope-validation.sh
│   ├── pre-operation-env-validator.sh
│   ├── pre-operation-idempotency-check.sh
│   ├── pre-operation-snapshot.sh
│   ├── pre-agent-task-decomposition.sh
│   └── pre-agent-performance-monitor.sh
└── subagent-utilization-booster.sh
    └── user-prompt-hybrid.sh (salesforce-plugin)

SessionStart Hook Chain:
bash -c '...'
├── session-start-agent-reminder.sh (salesforce-plugin)
└── session-context-loader.sh (opspal-core)
```

---

## Related Documentation

- **Main Project Guide**: `CLAUDE.md`
- **Plugin Development**: `PLUGIN_DEVELOPMENT.md`
- **Agent Routing**: `.claude-plugins/opspal-core/docs/AGENT_ROUTING.md`
- **Troubleshooting**: `docs/TROUBLESHOOTING_PLUGIN_LOADING.md`

---

**Maintained By**: RevPal Engineering
**Contact**: Submit issues to GitHub repository
