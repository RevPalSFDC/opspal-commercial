#!/bin/bash

# Session Start Agent Reminder Hook
# Displays agent usage reminder at session start
# Ensures required directories exist

# Get script directory and calculate project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$PLUGIN_DIR/../.." && pwd)"

# Use CLAUDE_PLUGIN_ROOT if available, otherwise use calculated path
if [ -n "$CLAUDE_PLUGIN_ROOT" ]; then
  PROJECT_DIR="$CLAUDE_PLUGIN_ROOT"
fi

AGENT_REMINDER_FILE="$PROJECT_DIR/.claude/AGENT_REMINDER.md"

# Ensure required temp directories exist for monitoring/reporting/caching
mkdir -p /tmp/salesforce-reports 2>/dev/null
mkdir -p /tmp/sf-cache 2>/dev/null
mkdir -p /tmp/sf-data 2>/dev/null
mkdir -p /tmp/salesforce-sync 2>/dev/null
touch /tmp/salesforce-reports-metrics.json 2>/dev/null

# Silent check - the reminder is in CLAUDE.md and system context
# No user-visible output needed
if [ ! -f "$AGENT_REMINDER_FILE" ]; then
    # Only output if there's an actual problem
    echo "⚠️  Agent reminder file not found at: $AGENT_REMINDER_FILE" >&2
fi

exit 0
