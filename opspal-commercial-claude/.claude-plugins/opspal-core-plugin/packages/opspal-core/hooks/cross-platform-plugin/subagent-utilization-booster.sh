#!/bin/bash
#
# Sub-Agent Utilization Booster Hook (v4.0.0 - Maximized Compliance)
#
# Purpose: Maximize sub-agent utilization through:
#          - Combined outcome-based + coercive messaging
#          - True blocking (exit code 1) for destructive operations
#          - Routing state persistence for compliance tracking
#          - Streamlined action-first message format
#
# Goal: Achieve >=75% sub-agent utilization with FULL VISIBILITY and ENFORCEMENT
#
# Message Format (v4.0.0):
#   [AGENT REQUIRED: sfdc-cpq-assessor]
#
#   This specialist delivers: 3x coverage, 60% faster, standardized output
#   You MUST invoke: Task(subagent_type='sfdc-cpq-assessor', prompt=<request below>)
#
#   ---
#   User Request: <message>
#
# Complexity-Based Tiers:
#   < 0.5  -> AVAILABLE: Advisory only
#   0.5-0.7 -> RECOMMENDED: Outcome-based suggestion
#   >= 0.7  -> BLOCKED: Strong requirement (exit 0)
#   Destructive -> MANDATORY_BLOCKED: True blocking (exit 1)
#
# Configuration:
#   ENABLE_SUBAGENT_BOOST=1     # Enable (default)
#   ENABLE_AGENT_BLOCKING=1     # Enable advisory blocking for high-complexity (default)
#   ENABLE_HARD_BLOCKING=1      # Enable exit code 1 for destructive ops (default)
#   SKIP_AGENT_BLOCKING=1       # Override hard blocking (escape hatch)
#   ROUTING_VERBOSE=1           # Extra debug output
#
# Version: 4.0.0 (Maximized Compliance - Hybrid Enforcement)
# Date: 2025-11-27
#

set -euo pipefail

# Source standardized error handler for centralized logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ERROR_HANDLER="${SCRIPT_DIR}/lib/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="subagent-utilization-booster"
    # Use lenient mode since this hook has its own error handling
    set_lenient_mode 2>/dev/null || true
fi

# Check if node is installed (required for logging features)
NODE_AVAILABLE=0
if command -v node &> /dev/null; then
  NODE_AVAILABLE=1
fi

# OutputFormatter and HookLogger (legacy support)
OUTPUT_FORMATTER="$SCRIPT_DIR/../scripts/lib/output-formatter.js"
HOOK_LOGGER="$SCRIPT_DIR/../scripts/lib/hook-logger.js"
ROUTING_LOGGER="$SCRIPT_DIR/../scripts/lib/routing-logger.js"
HOOK_NAME="subagent-utilization-booster"

# Prevent duplicate execution if multiple hooks registered
LOCK_FILE="/tmp/claude-prompt-hook-$$"
if [ -f "$LOCK_FILE" ]; then
  # Another hook already processed this prompt
  echo '{}'
  exit 0
fi
touch "$LOCK_FILE"
trap "rm -f $LOCK_FILE" EXIT

# Check if jq is installed
if ! command -v jq &> /dev/null; then
  # jq not installed - output warning to stderr and pass through

  # Log jq missing (only if node available)
  if [ "$NODE_AVAILABLE" = "1" ] && [ -f "$HOOK_LOGGER" ]; then
    node "$HOOK_LOGGER" warning "$HOOK_NAME" "jq not installed - feature disabled" "{}"
  fi

  if [ "$NODE_AVAILABLE" = "1" ] && [ -f "$OUTPUT_FORMATTER" ]; then
    node "$OUTPUT_FORMATTER" warning \
      "Sub-Agent Utilization Booster Disabled" \
      "jq is not installed - this feature requires jq for JSON processing and will be disabled" \
      "" \
      "Install jq to enable:macOS: brew install jq,Linux: sudo apt-get install jq,Windows: choco install jq,Or run: /checkdependencies --install" \
      "Feature unavailable until jq installed"
  else
    cat >&2 << 'EOF'
Sub-Agent Utilization Booster: jq is not installed
   This feature requires jq for JSON processing.

   Install jq to enable sub-agent utilization boosting:
   macOS:   brew install jq
   Linux:   sudo apt-get install jq
   Windows: choco install jq

   Or run: /checkdependencies --install

   The hook will be disabled until jq is installed.
EOF
  fi

  # Pass through with empty JSON to not break hook chain
  echo '{}'
  exit 0
fi

# Configuration
ENABLE_BOOST="${ENABLE_SUBAGENT_BOOST:-1}"
ENABLE_BLOCKING="${ENABLE_AGENT_BLOCKING:-1}"
ENABLE_HARD_BLOCKING="${ENABLE_HARD_BLOCKING:-1}"  # Exit code 1 for destructive ops
VERBOSE="${ROUTING_VERBOSE:-0}"

# ============================================================================
# MANDATORY BLOCKING PATTERNS (Exit Code 1 - True Blocking)
# These patterns trigger actual execution blocking for destructive operations
# ============================================================================
declare -a MANDATORY_PATTERNS=(
  "deploy.*prod|production.*deploy|push.*production:release-coordinator"
  "delete.*bulk|bulk.*delete|mass.*delete|delete.*all:sfdc-data-operations"
  "permission.*prod|profile.*change.*prod|update.*permission.*prod:sfdc-security-admin"
  "drop.*field|remove.*object|delete.*object|truncate:sfdc-metadata-manager"
  "merge.*prod|merge.*main|merge.*master:release-coordinator"
)

# Check if message matches any mandatory blocking pattern
is_mandatory_pattern() {
  local msg="$1"
  local msg_lower=$(echo "$msg" | tr '[:upper:]' '[:lower:]')

  for pattern_entry in "${MANDATORY_PATTERNS[@]}"; do
    local pattern="${pattern_entry%%:*}"
    local agent="${pattern_entry##*:}"

    if echo "$msg_lower" | grep -qE "$pattern"; then
      MANDATORY_AGENT_MATCH="$agent"
      return 0  # Match found
    fi
  done

  MANDATORY_AGENT_MATCH=""
  return 1  # No match
}

MANDATORY_AGENT_MATCH=""

# Read hook input
HOOK_INPUT=$(cat)
# Handle both .message and .userMessage formats (Claude Code version compatibility)
USER_MESSAGE=$(echo "$HOOK_INPUT" | jq -r '.message // .userMessage // ""')

# If disabled, pass through
if [ "$ENABLE_BOOST" != "1" ]; then
  echo '{}'
  exit 0
fi

# Skip empty messages
if [ -z "$USER_MESSAGE" ]; then
  echo '{}'
  exit 0
fi

# Get plugin root - use SCRIPT_DIR for reliable path resolution
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"

# ============================================================================
# PATH RESOLUTION: Find routing hook with multiple fallback locations
# ============================================================================
ROUTING_HOOK=""
ROUTING_SOURCE="none"

# Try multiple paths for salesforce-plugin hybrid hook
for CANDIDATE in \
  "$SCRIPT_DIR/../../../domains/salesforce/hooks/user-prompt-hybrid.sh" \
  "${CLAUDE_PLUGIN_ROOT:-/nonexistent}/packages/domains/salesforce/hooks/user-prompt-hybrid.sh" \
  "$SCRIPT_DIR/../../salesforce-plugin/hooks/user-prompt-hybrid.sh" \
  "$PLUGIN_ROOT/../salesforce-plugin/hooks/user-prompt-hybrid.sh" \
  "${CLAUDE_PLUGIN_ROOT:-/nonexistent}/../salesforce-plugin/hooks/user-prompt-hybrid.sh" \
  "$HOME/.claude/plugins/marketplaces/revpal-internal-plugins/.claude-plugins/salesforce-plugin/hooks/user-prompt-hybrid.sh" \
  "/home/chris/Desktop/RevPal/Agents/opspal-internal-plugins/.claude-plugins/salesforce-plugin/hooks/user-prompt-hybrid.sh"
do
  if [ -f "$CANDIDATE" ]; then
    ROUTING_HOOK="$CANDIDATE"
    ROUTING_SOURCE="hybrid"
    [ "$VERBOSE" = "1" ] && echo "[ROUTING] Found hybrid hook: $CANDIDATE" >&2
    break
  fi
done

# ============================================================================
# ROUTING: Get agent recommendation and complexity
# ============================================================================
SUGGESTED_AGENT=""
COMPLEXITY=0
CONFIDENCE=0
ROUTING_OUTPUT='{}'

if [ -n "$ROUTING_HOOK" ] && [ -f "$ROUTING_HOOK" ]; then
  # Use hybrid routing hook
  ROUTING_OUTPUT=$(echo "$HOOK_INPUT" | bash "$ROUTING_HOOK" 2>/dev/null || echo '{}')

  # Extract routing metadata
  SUGGESTED_AGENT=$(echo "$ROUTING_OUTPUT" | jq -r '.suggestedAgent // ""')
  COMPLEXITY=$(echo "$ROUTING_OUTPUT" | jq -r '.complexity // 0')
  CONFIDENCE=$(echo "$ROUTING_OUTPUT" | jq -r '.confidence // 0')
  ROUTING_SOURCE="hybrid"

  [ "$VERBOSE" = "1" ] && echo "[ROUTING] Hybrid result: agent=$SUGGESTED_AGENT complexity=$COMPLEXITY" >&2

  # If hybrid returned no agent, try task-router as fallback
  if [ -z "$SUGGESTED_AGENT" ] || [ "$SUGGESTED_AGENT" = "null" ]; then
    [ "$VERBOSE" = "1" ] && echo "[ROUTING] Hybrid returned no agent, trying task-router fallback..." >&2
    TASK_ROUTER="$SCRIPT_DIR/../scripts/lib/task-router.js"

    if [ -f "$TASK_ROUTER" ] && [ "$NODE_AVAILABLE" = "1" ]; then
      ROUTER_OUTPUT=$(node "$TASK_ROUTER" "$USER_MESSAGE" 2>/dev/null || echo "")

      if echo "$ROUTER_OUTPUT" | grep -q "RECOMMENDED AGENT:"; then
        SUGGESTED_AGENT=$(echo "$ROUTER_OUTPUT" | grep "RECOMMENDED AGENT:" | sed 's/.*RECOMMENDED AGENT: //' | head -1)

        CONFIDENCE_LINE=$(echo "$ROUTER_OUTPUT" | grep "Confidence:" | head -1)
        if [ -n "$CONFIDENCE_LINE" ]; then
          CONFIDENCE=$(echo "$CONFIDENCE_LINE" | sed 's/.*Confidence: \([0-9]*\)%.*/\1/' | head -1)
          CONFIDENCE=${CONFIDENCE:-0}
        fi

        COMPLEXITY_LINE=$(echo "$ROUTER_OUTPUT" | grep "Complexity:" | head -1)
        if [ -n "$COMPLEXITY_LINE" ]; then
          COMPLEXITY=$(echo "$COMPLEXITY_LINE" | sed 's/.*(\([0-9.]*\)).*/\1/' | head -1)
          COMPLEXITY=${COMPLEXITY:-0}
        fi

        ROUTING_SOURCE="task-router-fallback"
        [ "$VERBOSE" = "1" ] && echo "[ROUTING] Task-router fallback result: agent=$SUGGESTED_AGENT complexity=$COMPLEXITY confidence=$CONFIDENCE" >&2
      fi
    fi
  fi
else
  # FALLBACK: Use task-router.js directly (no hybrid hook available)
  TASK_ROUTER="$SCRIPT_DIR/../scripts/lib/task-router.js"

  if [ -f "$TASK_ROUTER" ] && [ "$NODE_AVAILABLE" = "1" ]; then
    [ "$VERBOSE" = "1" ] && echo "[ROUTING] Using task-router.js fallback" >&2

    ROUTER_OUTPUT=$(node "$TASK_ROUTER" "$USER_MESSAGE" 2>/dev/null || echo "")

    # Parse task-router output
    if echo "$ROUTER_OUTPUT" | grep -q "RECOMMENDED AGENT:"; then
      SUGGESTED_AGENT=$(echo "$ROUTER_OUTPUT" | grep "RECOMMENDED AGENT:" | sed 's/.*RECOMMENDED AGENT: //' | head -1)

      # Extract confidence (e.g., "Confidence: 70% (Medium)")
      CONFIDENCE_LINE=$(echo "$ROUTER_OUTPUT" | grep "Confidence:" | head -1)
      if [ -n "$CONFIDENCE_LINE" ]; then
        CONFIDENCE=$(echo "$CONFIDENCE_LINE" | sed 's/.*Confidence: \([0-9]*\)%.*/\1/' | head -1)
        CONFIDENCE=${CONFIDENCE:-0}
      fi

      # Extract complexity (e.g., "Complexity: SIMPLE (0.00)")
      COMPLEXITY_LINE=$(echo "$ROUTER_OUTPUT" | grep "Complexity:" | head -1)
      if [ -n "$COMPLEXITY_LINE" ]; then
        COMPLEXITY=$(echo "$COMPLEXITY_LINE" | sed 's/.*(\([0-9.]*\)).*/\1/' | head -1)
        COMPLEXITY=${COMPLEXITY:-0}
      fi

      ROUTING_SOURCE="task-router"
      [ "$VERBOSE" = "1" ] && echo "[ROUTING] Task-router result: agent=$SUGGESTED_AGENT complexity=$COMPLEXITY confidence=$CONFIDENCE" >&2
    fi
  else
    [ "$VERBOSE" = "1" ] && echo "[ROUTING] No routing available - task-router.js not found at $TASK_ROUTER" >&2
    ROUTING_SOURCE="none"
  fi
fi

# Normalize empty/null agent
if [ "$SUGGESTED_AGENT" = "null" ] || [ "$SUGGESTED_AGENT" = "" ]; then
  SUGGESTED_AGENT=""
fi

# ============================================================================
# ACE FRAMEWORK: Skill-Based Routing Boost
# ============================================================================
SKILL_BOOST="1.0"
SKILL_SUCCESS_RATE="0"
SKILL_CATEGORY_MATCH="false"
SKILL_CATEGORY=""
ACE_APPLIED="false"

if [ "${ENABLE_ACE_ROUTING:-1}" != "0" ] && [ -n "$SUGGESTED_AGENT" ] && [ "$NODE_AVAILABLE" = "1" ]; then
  SKILL_BOOST_SCRIPT="$SCRIPT_DIR/../scripts/lib/skill-routing-boost.js"

  if [ -f "$SKILL_BOOST_SCRIPT" ]; then
    # Detect task category from user message
    SKILL_CATEGORY=""
    if echo "$USER_MESSAGE" | grep -qiE "(audit|assessment|review|analyze)"; then
      SKILL_CATEGORY="assessment"
    elif echo "$USER_MESSAGE" | grep -qiE "(deploy|release|push|production)"; then
      SKILL_CATEGORY="deployment"
    elif echo "$USER_MESSAGE" | grep -qiE "(create|build|new|add)"; then
      SKILL_CATEGORY="creation"
    elif echo "$USER_MESSAGE" | grep -qiE "(fix|resolve|debug|error)"; then
      SKILL_CATEGORY="remediation"
    elif echo "$USER_MESSAGE" | grep -qiE "(query|report|dashboard|metrics)"; then
      SKILL_CATEGORY="analysis"
    fi

    # Get category-weighted skill boost
    BOOST_ARGS="--agent \"$SUGGESTED_AGENT\" --format json"
    [ -n "$SKILL_CATEGORY" ] && BOOST_ARGS="$BOOST_ARGS --category \"$SKILL_CATEGORY\""
    [ "$VERBOSE" = "1" ] && BOOST_ARGS="$BOOST_ARGS --verbose"

    SKILL_BOOST_OUTPUT=$(eval "node \"$SKILL_BOOST_SCRIPT\" $BOOST_ARGS" 2>/dev/null || echo '{"boost":1.0}')

    SKILL_BOOST=$(echo "$SKILL_BOOST_OUTPUT" | jq -r '.boost // 1.0')
    SKILL_SUCCESS_RATE=$(echo "$SKILL_BOOST_OUTPUT" | jq -r '.category_success_rate // .overall_success_rate // 0')
    SKILL_CATEGORY_MATCH=$(echo "$SKILL_BOOST_OUTPUT" | jq -r '.category_match // false')
    SKILL_USAGE_COUNT=$(echo "$SKILL_BOOST_OUTPUT" | jq -r '.usage_count // 0')

    # Apply boost to confidence (multiply)
    if [ -n "$CONFIDENCE" ] && [ "$CONFIDENCE" != "null" ] && [ "$CONFIDENCE" != "0" ]; then
      ORIGINAL_CONFIDENCE="$CONFIDENCE"

      if command -v bc &> /dev/null; then
        # Apply boost factor to confidence
        CONFIDENCE=$(echo "$CONFIDENCE * $SKILL_BOOST" | bc -l 2>/dev/null | head -c 10 || echo "$ORIGINAL_CONFIDENCE")
        # Cap at 100 if it's a percentage
        if [ "$CONFIDENCE" != "$ORIGINAL_CONFIDENCE" ]; then
          IS_OVER_100=$(echo "$CONFIDENCE > 100" | bc -l 2>/dev/null || echo "0")
          [ "$IS_OVER_100" = "1" ] && CONFIDENCE="100"
        fi
      fi

      ACE_APPLIED="true"

      [ "$VERBOSE" = "1" ] && {
        echo "[ACE] Category: $SKILL_CATEGORY (match: $SKILL_CATEGORY_MATCH)" >&2
        echo "[ACE] Skill boost: ${SKILL_BOOST}x (success_rate: $SKILL_SUCCESS_RATE, usage: $SKILL_USAGE_COUNT)" >&2
        echo "[ACE] Confidence: $ORIGINAL_CONFIDENCE → $CONFIDENCE" >&2
      }
    fi
  fi
fi

# ============================================================================
# ACE FRAMEWORK: Skill Context Injection (High Complexity Only)
# ============================================================================
SKILL_CONTEXT=""
SKILL_CONTEXT_ENABLED="${ENABLE_SKILL_CONTEXT_INJECTION:-1}"
ALLOW_SKILL_CONTEXT="false"

if [ "$SKILL_CONTEXT_ENABLED" = "1" ] && [ -n "$SUGGESTED_AGENT" ] && [ "$NODE_AVAILABLE" = "1" ]; then
  if command -v bc &> /dev/null; then
    if (( $(echo "$COMPLEXITY >= 0.7" | bc -l 2>/dev/null || echo 0) )); then
      ALLOW_SKILL_CONTEXT="true"
    fi
  else
    if [ -n "$COMPLEXITY" ] && [ "$COMPLEXITY" != "0" ]; then
      ALLOW_SKILL_CONTEXT="true"
    fi
  fi
fi

if [ "$ALLOW_SKILL_CONTEXT" = "true" ]; then
  SKILL_CONTEXT_SCRIPT="$SCRIPT_DIR/../scripts/lib/skill-context-builder.js"

  if [ -f "$SKILL_CONTEXT_SCRIPT" ]; then
    # Escape the user message for passing as task (limit to 160 chars)
    TASK_PREVIEW=$(echo "$USER_MESSAGE" | head -c 160 | tr '\n' ' ')

    # Execute with timeout protection (2 seconds max for Supabase queries)
    SKILL_CONTEXT_TIMEOUT="${SKILL_CONTEXT_MAX_LATENCY:-2}"

    # Build command with proper argument quoting
    SKILL_CONTEXT_CMD="node \"$SKILL_CONTEXT_SCRIPT\" --agent \"$SUGGESTED_AGENT\" --format text"
    [ -n "$COMPLEXITY" ] && SKILL_CONTEXT_CMD="$SKILL_CONTEXT_CMD --complexity \"$COMPLEXITY\""
    [ -n "$SKILL_CATEGORY" ] && SKILL_CONTEXT_CMD="$SKILL_CONTEXT_CMD --category \"$SKILL_CATEGORY\""
    [ -n "$TASK_PREVIEW" ] && SKILL_CONTEXT_CMD="$SKILL_CONTEXT_CMD --task \"$TASK_PREVIEW\""
    [ "$VERBOSE" = "1" ] && SKILL_CONTEXT_CMD="$SKILL_CONTEXT_CMD --verbose"

    # Execute via eval for proper quote handling and cap size to reduce tokens.
    SKILL_CONTEXT=$(timeout "$SKILL_CONTEXT_TIMEOUT" bash -c "$SKILL_CONTEXT_CMD" 2>/dev/null | head -c 300 || echo "")

    if [ -n "$SKILL_CONTEXT" ]; then
      [ "$VERBOSE" = "1" ] && echo "[ACE] Skill context injected (${#SKILL_CONTEXT} chars)" >&2
    else
      [ "$VERBOSE" = "1" ] && echo "[ACE] Skill context retrieval failed or empty" >&2
    fi
  fi
fi

# ============================================================================
# COMPLEXITY CALCULATION
# ============================================================================
COMPLEXITY_PCT=0
CONFIDENCE_PCT=0

if command -v bc &> /dev/null; then
  if [ "$COMPLEXITY" != "0" ] && [ -n "$COMPLEXITY" ]; then
    COMPLEXITY_PCT=$(echo "$COMPLEXITY * 100" | bc 2>/dev/null | cut -d. -f1 || echo "0")
  fi
  if [ "$CONFIDENCE" != "0" ] && [ -n "$CONFIDENCE" ]; then
    # Confidence might already be a percentage (0-100) or decimal (0-1)
    if echo "$CONFIDENCE" | grep -q "\."; then
      CONFIDENCE_PCT=$(echo "$CONFIDENCE * 100" | bc 2>/dev/null | cut -d. -f1 || echo "0")
    else
      CONFIDENCE_PCT="$CONFIDENCE"
    fi
  fi
else
  # No bc - try basic calculation
  COMPLEXITY_PCT="$COMPLEXITY"
  CONFIDENCE_PCT="$CONFIDENCE"
fi

# Ensure defaults
COMPLEXITY_PCT="${COMPLEXITY_PCT:-0}"
CONFIDENCE_PCT="${CONFIDENCE_PCT:-0}"

# ============================================================================
# DETERMINE TIER AND ACTION
# ============================================================================
BLOCK_EXECUTION="false"
MANDATORY_AGENT="false"
ACTION_TYPE="DIRECT_OK"
ACTION_ICON="check"
ACTION_TEXT="DIRECT EXECUTION OK - No specialized agent needed"

# Use bc for floating point comparison
if command -v bc &> /dev/null; then
  IS_HIGH_COMPLEXITY=$(echo "$COMPLEXITY >= 0.7" | bc -l 2>/dev/null || echo "0")
  IS_MEDIUM_COMPLEXITY=$(echo "$COMPLEXITY >= 0.5" | bc -l 2>/dev/null || echo "0")
else
  IS_HIGH_COMPLEXITY="0"
  IS_MEDIUM_COMPLEXITY="0"
fi

# Determine action based on complexity tier
if [ "$IS_HIGH_COMPLEXITY" = "1" ] && [ -n "$SUGGESTED_AGENT" ]; then
  # TIER 3: HIGH COMPLEXITY (>=0.7) - BLOCKING
  ACTION_TYPE="BLOCKED"
  ACTION_ICON="stop"
  ACTION_TEXT="BLOCKING - You MUST use Task tool with subagent_type='$SUGGESTED_AGENT'"
  if [ "$ENABLE_BLOCKING" = "1" ]; then
    BLOCK_EXECUTION="true"
    MANDATORY_AGENT="true"
  fi

elif [ "$IS_MEDIUM_COMPLEXITY" = "1" ] && [ -n "$SUGGESTED_AGENT" ]; then
  # TIER 2: MEDIUM COMPLEXITY (0.5-0.7) - Strong recommendation
  ACTION_TYPE="RECOMMENDED"
  ACTION_ICON="warning"
  ACTION_TEXT="RECOMMENDED - Consider using Task tool with this agent"

elif [ -n "$SUGGESTED_AGENT" ]; then
  # TIER 1: LOW COMPLEXITY (<0.5) - Advisory
  ACTION_TYPE="AVAILABLE"
  ACTION_ICON="info"
  ACTION_TEXT="AVAILABLE - Specialized agent available if needed"

else
  # No agent match
  ACTION_TYPE="DIRECT_OK"
  ACTION_ICON="check"
  ACTION_TEXT="DIRECT EXECUTION OK - No specialized agent needed"
fi

# ============================================================================
# ACE FRAMEWORK: Tier Override Based on Skill Performance
# ============================================================================
ACE_TIER_OVERRIDE=""
if [ "${ENABLE_ACE_TIER_OVERRIDE:-1}" != "0" ] && [ "$ACE_APPLIED" = "true" ] && [ -n "$SUGGESTED_AGENT" ]; then
  # Need bc for float comparison
  if command -v bc &> /dev/null && [ "$SKILL_SUCCESS_RATE" != "0" ] && [ "$SKILL_SUCCESS_RATE" != "null" ]; then
    # High performer (>=90% success) - allow direct execution even for complex tasks
    IS_HIGH_PERFORMER=$(echo "$SKILL_SUCCESS_RATE >= 0.90" | bc -l 2>/dev/null || echo "0")
    if [ "$IS_HIGH_PERFORMER" = "1" ] && [ "$ACTION_TYPE" = "BLOCKED" ]; then
      ACTION_TYPE="RECOMMENDED"
      ACTION_ICON="warning"
      ACTION_TEXT="RECOMMENDED (ACE: 90%+ success agent) - Consider using Task tool"
      ACE_TIER_OVERRIDE="BLOCKED→RECOMMENDED"
      # Don't actually block for high performers
      BLOCK_EXECUTION="false"
      [ "$VERBOSE" = "1" ] && echo "[ACE] Tier override: BLOCKED → RECOMMENDED (90%+ success agent)" >&2
    fi

    # Low performer (<50% success) - require agent even for simple tasks
    IS_LOW_PERFORMER=$(echo "$SKILL_SUCCESS_RATE < 0.50" | bc -l 2>/dev/null || echo "0")
    SKILL_USAGE_GT_5=$(echo "$SKILL_USAGE_COUNT >= 5" | bc -l 2>/dev/null || echo "0")
    if [ "$IS_LOW_PERFORMER" = "1" ] && [ "$SKILL_USAGE_GT_5" = "1" ] && [ "$ACTION_TYPE" = "AVAILABLE" ]; then
      ACTION_TYPE="RECOMMENDED"
      ACTION_ICON="warning"
      ACTION_TEXT="RECOMMENDED (ACE: <50% success) - Agent needs monitoring"
      ACE_TIER_OVERRIDE="AVAILABLE→RECOMMENDED"
      [ "$VERBOSE" = "1" ] && echo "[ACE] Tier override: AVAILABLE → RECOMMENDED (<50% success agent)" >&2
    fi
  fi
fi

# ============================================================================
# CHECK FOR MANDATORY BLOCKING (Destructive Operations)
# ============================================================================
IS_MANDATORY_BLOCK="false"
if [ "$ENABLE_HARD_BLOCKING" = "1" ] && is_mandatory_pattern "$USER_MESSAGE"; then
  IS_MANDATORY_BLOCK="true"
  # Override suggested agent with mandatory agent
  if [ -n "$MANDATORY_AGENT_MATCH" ]; then
    SUGGESTED_AGENT="$MANDATORY_AGENT_MATCH"
  fi
  ACTION_TYPE="MANDATORY_BLOCKED"
  ACTION_TEXT="HARD BLOCKING - Destructive operation requires agent"
  [ "$VERBOSE" = "1" ] && echo "[ROUTING] Mandatory blocking triggered: $MANDATORY_AGENT_MATCH" >&2
fi

# ============================================================================
# BUILD ROUTING BANNER (Compact format)
# ============================================================================
AGENT_DISPLAY="${SUGGESTED_AGENT:-"(none matched)"}"

# Compact banner for stderr (user visibility)
ROUTING_BANNER="[ROUTING] Agent: $AGENT_DISPLAY | Confidence: ${CONFIDENCE_PCT}% | Complexity: ${COMPLEXITY_PCT}% | Action: $ACTION_TYPE"

# Add ACE info to banner if applied
ACE_BANNER=""
if [ "$ACE_APPLIED" = "true" ]; then
  ACE_SUCCESS_DISPLAY=$(echo "$SKILL_SUCCESS_RATE * 100" | bc -l 2>/dev/null | cut -d. -f1 || echo "?")
  ACE_BANNER="[ACE] Boost: ${SKILL_BOOST}x | Success: ${ACE_SUCCESS_DISPLAY}% | Category: ${SKILL_CATEGORY:-"(general)"}"
  [ -n "$ACE_TIER_OVERRIDE" ] && ACE_BANNER="$ACE_BANNER | Override: $ACE_TIER_OVERRIDE"
fi

# ============================================================================
# OUTPUT BANNER TO STDERR (Visible to user in terminal)
# ============================================================================
echo "" >&2
echo "$ROUTING_BANNER" >&2
[ -n "$ACE_BANNER" ] && echo "$ACE_BANNER" >&2
echo "" >&2

# ============================================================================
# BUILD ENHANCED MESSAGE (Combined: Outcome-Based + Coercive)
# ============================================================================
# Format: Lead with action bracket, outcome metrics, then invocation syntax

SKILL_CONTEXT_LINE=""
if [ -n "$SKILL_CONTEXT" ]; then
  SKILL_CONTEXT_LINE=" Context: $SKILL_CONTEXT"
fi

if [ "$IS_MANDATORY_BLOCK" = "true" ]; then
  # MANDATORY BLOCKING - Destructive operations (exit code 1)
  ENHANCED_MESSAGE="INSTRUCTION: STOP. Destructive operation detected.
Use Task(subagent_type='$SUGGESTED_AGENT', prompt=<original request>).${SKILL_CONTEXT_LINE}"

elif [ "$ACTION_TYPE" = "BLOCKED" ]; then
  # HIGH COMPLEXITY - Forced evaluation pattern
  ENHANCED_MESSAGE="INSTRUCTION: High complexity. Use Task(subagent_type='$SUGGESTED_AGENT', prompt=<original request>).
Confidence: ${CONFIDENCE_PCT}% | Complexity: ${COMPLEXITY_PCT}%.${SKILL_CONTEXT_LINE}"

elif [ "$ACTION_TYPE" = "RECOMMENDED" ]; then
  # MEDIUM COMPLEXITY - Strong recommendation
  ENHANCED_MESSAGE="Consider Task(subagent_type='$SUGGESTED_AGENT', prompt=<original request>).
Confidence: ${CONFIDENCE_PCT}% | Complexity: ${COMPLEXITY_PCT}%."

else
  ENHANCED_MESSAGE=""
fi

# ============================================================================
# LOG ROUTING DECISION
# ============================================================================
LOG_DIR="$HOME/.claude/logs"
LOG_FILE="$LOG_DIR/routing.jsonl"

# Ensure log directory exists
mkdir -p "$LOG_DIR" 2>/dev/null || true

# Determine if this was a blocking decision
WAS_BLOCKED="false"
if [ "$ACTION_TYPE" = "BLOCKED" ] || [ "$IS_MANDATORY_BLOCK" = "true" ]; then
  WAS_BLOCKED="true"
fi

# Create log entry
LOG_ENTRY=$(jq -n \
  --arg ts "$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S')" \
  --arg agent "${SUGGESTED_AGENT:-}" \
  --argjson complexity "${COMPLEXITY:-0}" \
  --argjson confidence "${CONFIDENCE:-0}" \
  --argjson blocked "$WAS_BLOCKED" \
  --argjson hard_blocked "$IS_MANDATORY_BLOCK" \
  --arg action "$ACTION_TYPE" \
  --arg source "$ROUTING_SOURCE" \
  --arg msg_preview "$(echo "$USER_MESSAGE" | head -c 100)" \
  '{
    timestamp: $ts,
    agent: (if $agent != "" then $agent else null end),
    complexity: $complexity,
    confidence: $confidence,
    blocked: $blocked,
    hard_blocked: $hard_blocked,
    action: $action,
    source: $source,
    message_preview: $msg_preview
  }' 2>/dev/null || echo '{}')

# Append to log file (non-blocking, fail silently)
echo "$LOG_ENTRY" >> "$LOG_FILE" 2>/dev/null || true

[ "$VERBOSE" = "1" ] && echo "[ROUTING] Logged: $LOG_ENTRY" >&2

# ============================================================================
# SAVE ROUTING STATE (For PostToolUse Compliance Checking)
# ============================================================================
# Save state so PostToolUse can check if Claude ignored routing recommendation
ROUTING_STATE_FILE="$HOME/.claude/routing-state.json"
if [ "$WAS_BLOCKED" = "true" ] && [ -n "$SUGGESTED_AGENT" ]; then
  jq -n \
    --arg agent "$SUGGESTED_AGENT" \
    --argjson blocked "$WAS_BLOCKED" \
    --argjson hard_blocked "$IS_MANDATORY_BLOCK" \
    --arg action "$ACTION_TYPE" \
    --argjson timestamp "$(date +%s)" \
    '{
      agent: $agent,
      blocked: $blocked,
      hard_blocked: $hard_blocked,
      action: $action,
      timestamp: $timestamp
    }' > "$ROUTING_STATE_FILE" 2>/dev/null || true
  [ "$VERBOSE" = "1" ] && echo "[ROUTING] Saved state for compliance checking" >&2
fi

# ============================================================================
# OUTPUT hookSpecificOutput (Documented Claude Context Injection)
# ============================================================================
# Per https://code.claude.com/docs/en/hooks#hook-output:
# - Plain stdout = shown in transcript (user sees)
# - hookSpecificOutput.additionalContext = added to Claude's reasoning context
#
# This ensures Claude ACTUALLY receives and acts on routing recommendations.

# Show routing info to user via stderr (visible in terminal)
if [ -n "$SUGGESTED_AGENT" ] && [ "$SUGGESTED_AGENT" != "null" ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
  echo "[ROUTING] Agent: $SUGGESTED_AGENT | Confidence: ${CONFIDENCE_PCT:-0}% | Complexity: ${COMPLEXITY_PCT:-0}%" >&2
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
fi

# Output JSON to minimize transcript noise and only inject when needed.
SHOULD_INJECT="false"
if [ "$IS_MANDATORY_BLOCK" = "true" ] || [ "$ACTION_TYPE" = "BLOCKED" ] || [ "$ACTION_TYPE" = "RECOMMENDED" ]; then
  SHOULD_INJECT="true"
fi

if [ "$SHOULD_INJECT" = "true" ] && [ -n "$ENHANCED_MESSAGE" ]; then
  jq -n \
    --arg context "$ENHANCED_MESSAGE" \
    '{
      suppressOutput: true,
      hookSpecificOutput: {
        additionalContext: $context
      }
    }'
else
  echo '{}'
fi

# ============================================================================
# EXIT CODE HANDLING
# ============================================================================
# Exit code 1 = Block execution (for mandatory/destructive patterns)
# Exit code 0 = Continue (advisory for all other cases)

if [ "$IS_MANDATORY_BLOCK" = "true" ] && [ "$ENABLE_HARD_BLOCKING" = "1" ]; then
  # Check for skip override
  if [ "${SKIP_AGENT_BLOCKING:-0}" = "1" ]; then
    [ "$VERBOSE" = "1" ] && echo "[ROUTING] Hard blocking skipped (SKIP_AGENT_BLOCKING=1)" >&2
    exit 0
  fi

  [ "$VERBOSE" = "1" ] && echo "[ROUTING] HARD BLOCKING - Exit code 1" >&2
  exit 1  # Actually block execution for destructive operations
fi

exit 0
