#!/bin/bash
# =============================================================================
# Intake Suggestion Hook
# =============================================================================
#
# Purpose: Emit non-blocking intake guidance for project-level prompts.
#          Active intake gating is implemented in unified-router.sh.
#          This hook remains for compatibility and telemetry.
#
# Approach: Combines complexity scoring with project-level language detection.
#           If both signals fire, injects a suggestive (non-blocking) reminder.
#
# Version: 1.0.0
# Created: 2026-02-08
#
# Configuration:
#   ENABLE_INTAKE_SUGGESTION=1   # Enable (default)
#   INTAKE_SUGGEST_THRESHOLD=0.5 # Complexity threshold (default 0.5)
#   ROUTING_VERBOSE=1            # Debug logging
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
ENABLED="${ENABLE_INTAKE_SUGGESTION:-1}"
THRESHOLD="${INTAKE_SUGGEST_THRESHOLD:-0.5}"
VERBOSE="${ROUTING_VERBOSE:-0}"
COMPLEXITY_SCORER="$PLUGIN_ROOT/scripts/lib/complexity-scorer.js"

# Exit early if disabled
if [[ "$ENABLED" != "1" ]]; then
    echo '{}'
    exit 0
fi

# Read hook input
HOOK_INPUT=$(cat)
USER_MESSAGE=$(echo "$HOOK_INPUT" | jq -r '.user_message // .userPrompt // .prompt // .userMessage // .message // ""' 2>/dev/null || echo "")

# Skip empty messages
if [[ -z "$USER_MESSAGE" || ${#USER_MESSAGE} -lt 20 ]]; then
    echo '{}'
    exit 0
fi

MSG_LOWER=$(echo "$USER_MESSAGE" | tr '[:upper:]' '[:lower:]')

# =============================================================================
# SKIP CONDITIONS — Don't suggest intake when it's clearly not appropriate
# =============================================================================

# Already using /intake or referencing it
if echo "$MSG_LOWER" | grep -qE '^\s*/intake|run.*intake|use.*intake|\[DIRECT\]|\[SKIP'; then
    echo '{}'
    exit 0
fi

# Simple questions, status checks, single-object operations
if echo "$MSG_LOWER" | grep -qE '^(what|how|why|where|when|show|list|check|status|help|explain|describe)\b'; then
    echo '{}'
    exit 0
fi

# Already a slash command
if echo "$MSG_LOWER" | grep -qE '^\s*/'; then
    echo '{}'
    exit 0
fi

# =============================================================================
# SIGNAL 1: Project-level language detection
# =============================================================================
#
# These patterns indicate the user is describing a project, not a quick task.
# Each match adds to a "project signal" score.
#

PROJECT_SIGNAL=0

# Strong project signals (+2 each)
echo "$MSG_LOWER" | grep -qE '\b(redesign|overhaul|rebuild|restructure|revamp)\b' && PROJECT_SIGNAL=$((PROJECT_SIGNAL + 2))
echo "$MSG_LOWER" | grep -qE '\b(implement|build out|set up|stand up|create a new)\b.{10,}' && PROJECT_SIGNAL=$((PROJECT_SIGNAL + 2))
echo "$MSG_LOWER" | grep -qE '\b(migrate|migration)\b' && PROJECT_SIGNAL=$((PROJECT_SIGNAL + 2))
echo "$MSG_LOWER" | grep -qE '\b(cpq|quote.to.cash|billing|renewal|subscription)\b' && PROJECT_SIGNAL=$((PROJECT_SIGNAL + 2))
echo "$MSG_LOWER" | grep -qE '\bwe need to\b.{15,}' && PROJECT_SIGNAL=$((PROJECT_SIGNAL + 2))
echo "$MSG_LOWER" | grep -qE '\bi want to\b.{15,}' && PROJECT_SIGNAL=$((PROJECT_SIGNAL + 2))

# Medium project signals (+1 each)
echo "$MSG_LOWER" | grep -qE '\b(with|including|that supports|along with)\b' && PROJECT_SIGNAL=$((PROJECT_SIGNAL + 1))
echo "$MSG_LOWER" | grep -qE '\b(across|all|every|multiple|several)\b.*(object|team|record type|department)' && PROJECT_SIGNAL=$((PROJECT_SIGNAL + 1))
echo "$MSG_LOWER" | grep -qE '\b(approval|workflow|routing|scoring|assignment)\b.*\b(chain|rule|logic|model)\b' && PROJECT_SIGNAL=$((PROJECT_SIGNAL + 1))
echo "$MSG_LOWER" | grep -qE '\b(territory|lead routing|opportunity stage|pipeline)\b' && PROJECT_SIGNAL=$((PROJECT_SIGNAL + 1))
echo "$MSG_LOWER" | grep -qE '\b(phase|rollout|rollback|uat|testing plan)\b' && PROJECT_SIGNAL=$((PROJECT_SIGNAL + 1))

# Message length signal — long requests are often project-level
if [[ ${#USER_MESSAGE} -gt 150 ]]; then
    PROJECT_SIGNAL=$((PROJECT_SIGNAL + 1))
fi
if [[ ${#USER_MESSAGE} -gt 300 ]]; then
    PROJECT_SIGNAL=$((PROJECT_SIGNAL + 1))
fi

[[ "$VERBOSE" = "1" ]] && echo "[INTAKE-SUGGEST] Project signal: $PROJECT_SIGNAL" >&2

# Need at least 3 project signal points to proceed
if [[ $PROJECT_SIGNAL -lt 3 ]]; then
    echo '{}'
    exit 0
fi

# =============================================================================
# SIGNAL 2: Complexity scoring
# =============================================================================

COMPLEXITY_SCORE="0"
if [[ -f "$COMPLEXITY_SCORER" ]] && command -v node &> /dev/null; then
    SCORER_OUTPUT=$(timeout 3 node "$COMPLEXITY_SCORER" "$USER_MESSAGE" 2>/dev/null || echo "")
    if [[ -n "$SCORER_OUTPUT" ]]; then
        COMPLEXITY_SCORE=$(echo "$SCORER_OUTPUT" | grep -oP 'Complexity Score: \K[0-9.]+' || echo "0")
    fi
fi

[[ "$VERBOSE" = "1" ]] && echo "[INTAKE-SUGGEST] Complexity score: $COMPLEXITY_SCORE" >&2

# Check if complexity meets threshold
MEETS_THRESHOLD="0"
if command -v bc &> /dev/null; then
    MEETS_THRESHOLD=$(echo "$COMPLEXITY_SCORE >= $THRESHOLD" | bc -l 2>/dev/null || echo "0")
fi

# =============================================================================
# DECISION: Suggest intake if both signals fire
# =============================================================================

# Need: project signal >= 3 AND (complexity >= threshold OR project signal >= 5)
SHOULD_SUGGEST="false"
if [[ "$MEETS_THRESHOLD" == "1" ]]; then
    SHOULD_SUGGEST="true"
elif [[ $PROJECT_SIGNAL -ge 5 ]]; then
    # Very strong project language can override complexity threshold
    SHOULD_SUGGEST="true"
fi

if [[ "$SHOULD_SUGGEST" != "true" ]]; then
    echo '{}'
    exit 0
fi

[[ "$VERBOSE" = "1" ]] && echo "[INTAKE-SUGGEST] Suggesting /intake (signal=$PROJECT_SIGNAL, complexity=$COMPLEXITY_SCORE)" >&2

# =============================================================================
# LOG SUGGESTION
# =============================================================================

LOG_DIR="$HOME/.claude/logs"
mkdir -p "$LOG_DIR" 2>/dev/null || true
echo "{\"timestamp\":\"$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S')\",\"event\":\"intake_suggested\",\"project_signal\":$PROJECT_SIGNAL,\"complexity\":$COMPLEXITY_SCORE,\"message_preview\":\"${USER_MESSAGE:0:80}\"}" >> "$LOG_DIR/intake-suggestions.jsonl" 2>/dev/null || true

# =============================================================================
# OUTPUT: Suggestive context injection (non-blocking)
# =============================================================================

SUGGESTION="TIP: This looks like a project-level request. Consider running /intake to get classification (L1-L5), a structured plan with effort estimates, and automatic Asana task creation. You can continue without it — this is just a suggestion."

jq -n \
    --arg context "$SUGGESTION" \
    '{
        suppressOutput: true,
        hookSpecificOutput: {
            additionalContext: $context
        }
    }'

exit 0
