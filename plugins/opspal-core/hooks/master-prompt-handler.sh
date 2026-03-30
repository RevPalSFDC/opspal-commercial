#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# Master Prompt Handler
#
# Chains Prevention System + Sub-Agent Utilization Booster.
#
# Execution Order:
# 1. Prevention System Orchestrator - Runs all Phase 1-3 prevention hooks
# 2. Sub-Agent Utilization Booster - Enhances delegation to specialized agents
#
# This master hook ensures:
# - Safety checks run first (prevention system can block bad operations)
# - Agent routing guidance applied after safety validation
# - Seamless integration of all prevention infrastructure
#
# Configuration:
#   MASTER_HOOK_ENABLED=1           # Master enable/disable (default: 1)
#   PREVENTION_SYSTEM_ENABLED=1     # Enable prevention checks (default: 1)
#   SUBAGENT_BOOST_ENABLED=1        # Enable sub-agent boost (default: 1)
#
# Exit Codes:
#   0 - All checks passed
#   1 - Critical check failed (operation blocked)
###############################################################################

# Configuration
ENABLED="${MASTER_HOOK_ENABLED:-1}"
PREVENTION_ENABLED="${PREVENTION_SYSTEM_ENABLED:-1}"
SUBAGENT_ENABLED="${SUBAGENT_BOOST_ENABLED:-1}"

# Only run if enabled
if [ "$ENABLED" != "1" ]; then
  exit 0
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# OutputFormatter and HookLogger
OUTPUT_FORMATTER="$SCRIPT_DIR/../scripts/lib/output-formatter.js"
HOOK_LOGGER="$SCRIPT_DIR/../scripts/lib/hook-logger.js"
HOOK_NAME="master-prompt-handler"

# Get user prompt
USER_PROMPT=""
if [ -t 0 ]; then
  USER_PROMPT="$*"
else
  USER_PROMPT=$(cat)
fi

# Skip if no prompt
if [ -z "$USER_PROMPT" ]; then
  exit 0
fi

# Step 1: Run Prevention System (safety checks first)
if [ "$PREVENTION_ENABLED" == "1" ]; then
  # Note: Don't use 2>&1 - let stderr go to user's terminal, only capture stdout (JSON)
  PREVENTION_OUTPUT=$(echo "$USER_PROMPT" | timeout 8 bash "$SCRIPT_DIR/prevention-system-orchestrator.sh" 2>/dev/null || true)
  PREVENTION_EXIT=$?

  # If prevention system blocks, stop here
  if [ $PREVENTION_EXIT -eq 1 ]; then
    echo "$PREVENTION_OUTPUT"
    exit 1
  fi

  # Show prevention output if there were warnings
  if [ -n "$PREVENTION_OUTPUT" ]; then
    echo "$PREVENTION_OUTPUT"
  fi
fi

# If we get here, all hooks passed
exit 0
