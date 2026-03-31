---
name: clear-route
description: Clear a stuck pending routing state for the current session
argument-hint: "[--all]"
stage: stable
---

# Clear Pending Routing State

This command clears any pending routing enforcement state for the current session. Use this when routing hooks have created a deadlock condition or when a stale route is blocking operations.

## When to Use

- A routing hook is blocking Bash/Write/Edit operations with `ROUTING_REQUIRED_BEFORE_OPERATION`
- An agent mismatch (`ROUTING_REQUIRED_AGENT_MISMATCH`) is blocking the agent you want to use
- You changed your approach mid-session but the old route is still enforced
- The `[ROUTING_OVERRIDE]` token is not clearing the route

## What It Does

1. Reads the current session's routing state from `~/.claude/routing-state/`
2. If a pending route exists, clears it immediately
3. Logs the manual clearance event to `~/.claude/logs/routing-enforcement.jsonl`

## Usage

```bash
# Clear the current session's pending route
/clear-route

# Clear all expired routing states across all sessions
/clear-route --all
```

## Implementation

Run the following command to clear the routing state:

```bash
# Get the current session key
SESSION_KEY="${CLAUDE_SESSION_ID:-default-session}"

# Clear the routing state
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/routing-state-manager.js" clear "$SESSION_KEY"

# Confirm clearance
echo "Routing state cleared for session: $SESSION_KEY"
```

If `--all` is passed, clear all expired states:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/routing-state-manager.js" clear-expired
```

After clearing, operational tools (Bash, Write, Edit) will be unblocked immediately. The next prompt will re-evaluate routing from scratch.
