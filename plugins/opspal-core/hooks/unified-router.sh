#!/usr/bin/env bash
# =============================================================================
# Unified Router Hook
# =============================================================================
#
# Purpose: Single routing hook that replaces the previous 5-script chain:
#          - subagent-utilization-booster.sh
#          - user-prompt-hybrid.sh
#          - user-prompt-submit-enhanced.sh
#          - auto-router-adapter.sh
#          - task-router.js (fallback)
#
# Version: 2.0.0
# Created: 2026-01-09
#
# Goals:
#   1. Maximize sub-agent utilization (>=75% target)
#   2. Route complex tasks to specialist agents
#   3. Block destructive operations without agent
#   4. Provide clear routing feedback
#
# Configuration:
#   ENABLE_UNIFIED_ROUTING=1     # Enable routing (default)
#   ENABLE_AGENT_BLOCKING=1      # Block high-complexity tasks (default)
#   ENABLE_HARD_BLOCKING=1       # Legacy broad hard-block toggle (retained for compatibility)
#   USER_PROMPT_MANDATORY_HARD_BLOCKING=0 # Deprecated at UserPromptSubmit; retained for telemetry/back-compat only
#   ENABLE_COMPLEXITY_HARD_BLOCKING=0  # Deprecated at UserPromptSubmit; retained for telemetry/back-compat only
#   ACTIVE_INTAKE_MODE=recommend # Intake gate mode: suggest|recommend|require (default recommend)
#   ENABLE_INTAKE_HARD_BLOCKING=0 # Deprecated at UserPromptSubmit; retained for telemetry/back-compat only
#   ACTIVE_INTAKE_PROJECT_SIGNAL_MIN=3  # Min project signal to evaluate intake completeness
#   ACTIVE_INTAKE_COMPLETENESS_MAX=0.5  # Max completeness score treated as vague
#   ACTIVE_INTAKE_VERBOSE=0      # Debug intake gate scoring
#   ROUTING_ADAPTIVE_CONTINUE=0  # Soft-block continue/resume prompts under noisy context (default off)
#   ROUTING_CONTINUE_LOW_SIGNAL_THRESHOLD=0.65 # Confidence threshold for adaptive low-signal fallback
#   ROUTING_TRANSCRIPT_NOISE_THRESHOLD=0.35    # Noise threshold for transcript-contaminated prompts
#   ROUTING_VERBOSE=1            # Debug logging
#   SKIP_AGENT_BLOCKING=1        # Override blocking (escape hatch)
#   ROUTING_OVERRIDE_TOKEN=[ROUTING_OVERRIDE] # Prompt token to bypass hard block
#
# Complexity Tiers:
#   < 0.5  -> AVAILABLE: Agent available if needed
#   0.5-0.7 -> RECOMMENDED: Agent suggested
#   >= 0.7  -> BLOCKED: Agent strongly required (instruction by default, hard block only when explicitly enabled)
#   Destructive -> MANDATORY: Prompt continues with mandatory routing state; downstream tools enforce the specialist path
#
# =============================================================================

set -euo pipefail

if [[ "${HOOK_DEBUG:-}" == "true" ]]; then
    set -x
    echo "DEBUG: [unified-router] starting" >&2
fi

# Source standardized error handler
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# PLUGIN_ROOT is parent of hooks dir (i.e., opspal-core directory)
# Always calculate from SCRIPT_DIR - CLAUDE_PLUGIN_ROOT may point to workspace root
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

ERROR_HANDLER="$PLUGIN_ROOT/hooks/lib/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="unified-router"
    set_lenient_mode 2>/dev/null || true
fi

# Configuration
ENABLE_ROUTING="${ENABLE_UNIFIED_ROUTING:-1}"
ENABLE_BLOCKING="${ENABLE_AGENT_BLOCKING:-1}"
ENABLE_HARD_BLOCKING="${ENABLE_HARD_BLOCKING:-1}"
USER_PROMPT_MANDATORY_HARD_BLOCKING="${USER_PROMPT_MANDATORY_HARD_BLOCKING:-0}"
ENABLE_COMPLEXITY_HARD_BLOCKING="${ENABLE_COMPLEXITY_HARD_BLOCKING:-0}"
ROUTING_ADAPTIVE_CONTINUE="${ROUTING_ADAPTIVE_CONTINUE:-0}"
ROUTING_CONTINUE_LOW_SIGNAL_THRESHOLD="${ROUTING_CONTINUE_LOW_SIGNAL_THRESHOLD:-0.65}"
ROUTING_TRANSCRIPT_NOISE_THRESHOLD="${ROUTING_TRANSCRIPT_NOISE_THRESHOLD:-0.35}"
ACTIVE_INTAKE_MODE="${ACTIVE_INTAKE_MODE:-recommend}"
ENABLE_INTAKE_HARD_BLOCKING="${ENABLE_INTAKE_HARD_BLOCKING:-0}"
ACTIVE_INTAKE_PROJECT_SIGNAL_MIN="${ACTIVE_INTAKE_PROJECT_SIGNAL_MIN:-3}"
ACTIVE_INTAKE_COMPLETENESS_MAX="${ACTIVE_INTAKE_COMPLETENESS_MAX:-0.5}"
ACTIVE_INTAKE_VERBOSE="${ACTIVE_INTAKE_VERBOSE:-0}"
ROUTING_OVERRIDE_TOKEN="${ROUTING_OVERRIDE_TOKEN:-[ROUTING_OVERRIDE]}"
ROUTING_AUTO_DELEGATION_ENABLED="${ROUTING_AUTO_DELEGATION_ENABLED:-1}"
ROUTING_AUTO_DELEGATION_MIN_CONFIDENCE="${ROUTING_AUTO_DELEGATION_MIN_CONFIDENCE:-0.95}"
VERBOSE="${ROUTING_VERBOSE:-0}"
LOW_CONFIDENCE_THRESHOLD="${ROUTING_LOW_CONFIDENCE_THRESHOLD:-0.60}"
FALLBACK_MIN_CONFIDENCE="${ROUTING_FALLBACK_MIN_CONFIDENCE:-0.55}"
PATTERNS_FILE="$PLUGIN_ROOT/config/routing-patterns.json"
TASK_ROUTER_SCRIPT="$PLUGIN_ROOT/scripts/lib/task-router.js"
ROUTING_METRICS_SCRIPT="$PLUGIN_ROOT/scripts/lib/routing-metrics.js"
ROUTING_STATE_MANAGER="$PLUGIN_ROOT/scripts/lib/routing-state-manager.js"
INTAKE_COMPLETENESS_SCORER="$PLUGIN_ROOT/scripts/lib/intake/intake-completeness-scorer.js"
START_TIME_MS=$(date +%s%3N 2>/dev/null || echo "0")

# Prevent duplicate execution
LOCK_FILE="${TMPDIR:-/tmp}/unified-router-$$"
if [[ -f "$LOCK_FILE" ]]; then
    echo '{}'
    exit 0
fi
touch "$LOCK_FILE"
trap "rm -f $LOCK_FILE" EXIT

# Check dependencies
if ! command -v jq &> /dev/null; then
    [[ "$VERBOSE" = "1" ]] && echo "[ROUTER] jq not installed - routing disabled" >&2
    echo '{}'
    exit 0
fi

extract_primary_user_message() {
    local hook_payload="$1"

    echo "$hook_payload" | jq -r '.user_message // .userPrompt // .prompt // .userMessage // .message // ""' 2>/dev/null || echo ""
}

strip_transcript_noise_lines() {
    local msg="$1"

    printf '%s\n' "$msg" | awk '
        function ltrim(s) {
            sub(/^[[:space:]]+/, "", s);
            return s;
        }

        {
            line = $0;
            trimmed = ltrim(line);
            lower = tolower(trimmed);

            if (lower == "") {
                next;
            }

            if (lower ~ /^userpromptsubmit operation blocked by hook:/ ||
                lower ~ /^original prompt:/ ||
                lower ~ /^@[^[:space:]]+/ ||
                lower ~ /blocked by #[0-9]+/ ||
                lower ~ /standing by for task #?[0-9]+/ ||
                lower ~ /waiting on .*task #?[0-9]+/) {
                next;
            }

            if (trimmed ~ /^[^[:alnum:]]/ && lower ~ /(task|blocked|running|deploy|acknowledged|standing by)/) {
                next;
            }

            print trimmed;
        }
    '
}

extract_latest_user_intent_segment() {
    local msg="$1"
    local original_prompt
    local first_clean_line

    original_prompt=$(printf '%s\n' "$msg" | sed -nE 's/^[[:space:]]*[Oo]riginal [Pp]rompt:[[:space:]]*(.+)[[:space:]]*$/\1/p' | head -n 1)
    if [[ -n "${original_prompt// }" ]]; then
        printf '%s' "$original_prompt"
        return 0
    fi

    first_clean_line=$(strip_transcript_noise_lines "$msg" | head -n 1)
    if [[ -n "${first_clean_line// }" ]]; then
        printf '%s' "$first_clean_line"
        return 0
    fi

    printf '%s' "$msg" | awk '
        {
            line = $0;
            sub(/^[[:space:]]+/, "", line);
            sub(/[[:space:]]+$/, "", line);
            if (line != "") {
                print line;
                exit 0;
            }
        }
    '
}

normalize_user_message() {
    local msg="$1"
    local normalized

    normalized=$(extract_latest_user_intent_segment "$msg")
    normalized=$(printf '%s' "$normalized" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')

    if [[ -z "${normalized// }" ]]; then
        normalized=$(strip_transcript_noise_lines "$msg" | paste -sd' ' - | sed -E 's/[[:space:]]+/ /g; s/^[[:space:]]+//; s/[[:space:]]+$//')
    fi

    printf '%s' "$normalized"
}

compute_transcript_noise_score() {
    local msg="$1"
    local counts
    local noisy_lines
    local total_lines

    counts=$(printf '%s\n' "$msg" | awk '
        function ltrim(s) {
            sub(/^[[:space:]]+/, "", s);
            return s;
        }

        {
            line = ltrim($0);
            lower = tolower(line);

            if (lower == "") {
                next;
            }

            total++;

            if (lower ~ /^userpromptsubmit operation blocked by hook:/ ||
                lower ~ /^original prompt:/ ||
                lower ~ /^@[^[:space:]]+/ ||
                lower ~ /blocked by #[0-9]+/ ||
                lower ~ /standing by for task #?[0-9]+/ ||
                lower ~ /waiting on .*task #?[0-9]+/) {
                noisy++;
                next;
            }

            if (line ~ /^[^[:alnum:]]/ && lower ~ /(task|blocked|running|deploy|acknowledged|standing by)/) {
                noisy++;
            }
        }

        END {
            if (total == 0) {
                print "0 0";
            } else {
                print noisy " " total;
            }
        }
    ')

    noisy_lines=$(echo "$counts" | awk '{print $1}')
    total_lines=$(echo "$counts" | awk '{print $2}')
    [[ -z "$noisy_lines" ]] && noisy_lines=0
    [[ -z "$total_lines" ]] && total_lines=0

    awk -v noisy="$noisy_lines" -v total="$total_lines" 'BEGIN {
        if (total <= 0) {
            printf "%.3f", 0;
        } else {
            printf "%.3f", noisy / total;
        }
    }'
}

detect_continue_intent() {
    local msg="$1"
    local msg_lower
    local has_continue="false"
    local has_high_risk_action="false"

    msg_lower=$(echo "$msg" | tr '[:upper:]' '[:lower:]')

    if echo "$msg_lower" | grep -qE '\b(continue|resume|pick up|go ahead|proceed|carry on|last session (hung|hanged|stalled))\b'; then
        has_continue="true"
    fi

    if echo "$msg_lower" | grep -qE '(deploy.*prod|production.*deploy|push.*production|delete.*bulk|bulk.*delete|mass.*delete|delete.*all|drop.*field|remove.*object|delete.*object|truncate|merge.*duplicate.*(account|contact|lead)|dedup(e|lication)?.*(account|contact|lead)|consolidate.*(account|contact|lead)|reparent.*(contact|account)|duplicate.*(account|contact).*delete|count.*contact.*csv|bulk.*update.*contact|naming.*issue.*account.*contact)'; then
        has_high_risk_action="true"
    fi

    if [[ "$has_continue" == "true" ]] && [[ "$has_high_risk_action" != "true" ]]; then
        echo "true"
    else
        echo "false"
    fi
}

extract_routing_session_key() {
    local hook_payload="$1"
    local session_key=""

    session_key=$(echo "$hook_payload" | jq -r '
        .session_key
        // .sessionKey
        // .session_id
        // .sessionId
        // .context.session_key
        // .context.sessionKey
        // .context.session_id
        // .context.sessionId
        // ""
    ' 2>/dev/null || echo "")

    if [[ -n "${session_key// }" ]] && [[ "$session_key" != "null" ]]; then
        printf '%s' "$session_key"
        return 0
    fi

    if [[ -n "${CLAUDE_SESSION_ID:-}" ]]; then
        printf '%s' "$CLAUDE_SESSION_ID"
        return 0
    fi

    printf '%s' "default-session"
}

# Read hook input
HOOK_INPUT=$(cat)
ROUTING_SESSION_KEY=$(extract_routing_session_key "$HOOK_INPUT")
RAW_USER_MESSAGE=$(extract_primary_user_message "$HOOK_INPUT")
NORMALIZED_MESSAGE=$(normalize_user_message "$RAW_USER_MESSAGE")

if [[ -z "${NORMALIZED_MESSAGE// }" ]]; then
    NORMALIZED_MESSAGE="$RAW_USER_MESSAGE"
fi

USER_MESSAGE="$NORMALIZED_MESSAGE"
NORMALIZATION_CHANGED="false"
if [[ "$USER_MESSAGE" != "$RAW_USER_MESSAGE" ]]; then
    NORMALIZATION_CHANGED="true"
fi

TRANSCRIPT_NOISE_SCORE=$(compute_transcript_noise_score "$RAW_USER_MESSAGE")
CONTINUE_INTENT=$(detect_continue_intent "$USER_MESSAGE")
# Override token detection.
# IMPORTANT: The override token (default: [ROUTING_OVERRIDE]) must appear in the
# actual user message text visible to this hook. It is extracted from the hook's
# stdin JSON payload (the user_message field). Tokens injected via system-reminder
# tags, additional context, or other non-message fields are NOT visible here and
# will NOT trigger a bypass.
#
# Supported bypass paths:
#   1. Include [ROUTING_OVERRIDE] in the user message text (bypasses pending state)
#   2. Set SKIP_AGENT_BLOCKING=1 environment variable (prevents blocking)
#   3. Programmatic: node routing-state-manager.js mark-bypassed <session-key>
#   4. Programmatic: node routing-state-manager.js clear <session-key>
HAS_OVERRIDE="false"
if [[ -n "$RAW_USER_MESSAGE$USER_MESSAGE" ]] && printf '%s\n%s' "$RAW_USER_MESSAGE" "$USER_MESSAGE" | grep -Fqi "$ROUTING_OVERRIDE_TOKEN"; then
    HAS_OVERRIDE="true"
fi

# Skip if routing disabled or empty message
if [[ "$ENABLE_ROUTING" != "1" ]] || [[ -z "$USER_MESSAGE" ]]; then
    echo '{}'
    exit 0
fi

[[ "$VERBOSE" = "1" ]] && echo "[ROUTER] Processing: ${USER_MESSAGE:0:100}..." >&2
if [[ "$VERBOSE" = "1" ]] && [[ "$NORMALIZATION_CHANGED" == "true" ]]; then
    echo "[ROUTER] Normalized message from raw payload (noise score: $TRANSCRIPT_NOISE_SCORE)." >&2
fi

# =============================================================================
# MANDATORY BLOCKING CHECK (Destructive Operations)
# =============================================================================

strip_path_like_tokens() {
    local msg="$1"

    # Remove path-like tokens before mandatory intent matching.
    # This prevents false positives from paths such as:
    # C:\...\production\deploy-attribution-ocr
    awk '{
        out = "";
        for (i = 1; i <= NF; i++) {
            token = $i;
            if (token ~ /[\/\\]/) {
                continue;
            }
            out = out (out == "" ? token : " " token);
        }
        print out;
    }' <<< "$msg"
}

check_mandatory_patterns() {
    local msg="$1"
    local msg_without_paths
    local msg_lower

    msg_without_paths=$(strip_path_like_tokens "$msg")
    msg_lower=$(echo "$msg_without_paths" | tr '[:upper:]' '[:lower:]')

    # If patterns file exists, use it
    if [[ -f "$PATTERNS_FILE" ]]; then
        local mandatory_patterns
        mandatory_patterns=$(jq -c '.mandatoryPatterns.patterns[]?' "$PATTERNS_FILE" 2>/dev/null || echo "")

        while IFS= read -r pattern_json; do
            local keywords
            local agent
            local route_id
            local clearance_agents

            keywords=$(echo "$pattern_json" | jq -r '.keywords | join("|")' 2>/dev/null || echo "")
            agent=$(echo "$pattern_json" | jq -r '.agent // ""' 2>/dev/null || echo "")
            route_id=$(echo "$pattern_json" | jq -r '.id // ""' 2>/dev/null || echo "")
            clearance_agents=$(echo "$pattern_json" | jq -c '.clearanceAgents // []' 2>/dev/null || echo "[]")

            if [[ -n "$keywords" ]] && echo "$msg_lower" | grep -qE "$keywords"; then
                jq -nc \
                  --arg route_id "$route_id" \
                  --arg agent "$agent" \
                  --argjson clearance_agents "$clearance_agents" \
                  '{routeId: $route_id, agent: $agent, clearanceAgents: $clearance_agents}'
                return 0
            fi
        done <<< "$mandatory_patterns"
    fi

    # Fallback: built-in patterns
    if echo "$msg_lower" | grep -qE "(deploy.*prod|production.*deploy|push.*production)"; then
        jq -nc \
          --arg route_id "prod-deploy" \
          --arg agent "opspal-core:release-coordinator" \
          '{
            routeId: $route_id,
            agent: $agent,
            clearanceAgents: [
              "opspal-core:release-coordinator",
              "opspal-salesforce:sfdc-deployment-manager"
            ]
          }'
        return 0
    fi

    if echo "$msg_lower" | grep -qE "(delete.*bulk|bulk.*delete|mass.*delete|delete.*all)"; then
        jq -nc \
          --arg route_id "bulk-delete" \
          --arg agent "opspal-salesforce:sfdc-data-operations" \
          '{
            routeId: $route_id,
            agent: $agent,
            clearanceAgents: [
              "opspal-salesforce:sfdc-data-operations",
              "opspal-salesforce:sfdc-query-specialist",
              "opspal-salesforce:sfdc-bulkops-orchestrator",
              "opspal-salesforce:sfdc-upsert-orchestrator",
              "opspal-salesforce:sfdc-data-export-manager"
            ]
          }'
        return 0
    fi

    if echo "$msg_lower" | grep -qE "(drop.*field|remove.*object|delete.*object|truncate)"; then
        jq -nc \
          --arg route_id "destructive-metadata" \
          --arg agent "opspal-salesforce:sfdc-metadata-manager" \
          '{routeId: $route_id, agent: $agent, clearanceAgents: [$agent]}'
        return 0
    fi

    if echo "$msg_lower" | grep -qE "(merge.*duplicate.*(account|contact|lead)|dedup(e|lication)?.*(account|contact|lead)|consolidate.*(account|contact|lead))"; then
        jq -nc \
          --arg route_id "record-dedup-merge" \
          --arg agent "opspal-salesforce:sfdc-merge-orchestrator" \
          '{routeId: $route_id, agent: $agent, clearanceAgents: [$agent]}'
        return 0
    fi

    echo '{}'
    return 1
}

check_destructive_automation_prefilter() {
    local msg="$1"
    local msg_without_paths
    local msg_lower

    msg_without_paths=$(strip_path_like_tokens "$msg")
    msg_lower=$(echo "$msg_without_paths" | tr '[:upper:]' '[:lower:]')

    # Require a primary imperative/request verb near the start so informational
    # prompts like "review how to delete a flow" do not route as destructive.
    if echo "$msg_lower" | grep -qE '^[[:space:]]*((please|can you|could you|help me|we need to|i need to|i want to|let'"'"'s)[[:space:]]+)?(delete|remove|deactivate|disable)\b.{0,50}\b(flow|automation|trigger|validation[[:space:]]+rule)\b'; then
        jq -nc \
          '{
            routeId: "automation-destructive",
            agent: "opspal-salesforce:sfdc-automation-builder",
            clearanceAgents: [
              "opspal-salesforce:sfdc-automation-builder",
              "opspal-salesforce:sfdc-deployment-manager",
              "opspal-salesforce:sfdc-metadata-manager"
            ]
          }'
        return 0
    fi

    echo '{}'
    return 1
}

# =============================================================================
# GUARDRAIL HELPERS
# =============================================================================

is_semver_prefixed_agent() {
    local agent="$1"

    [[ "$agent" == *:* ]] || return 1

    local plugin="${agent%%:*}"
    [[ "$plugin" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z-]+)?(\+[0-9A-Za-z.-]+)?$ ]]
}

append_log_with_fallback() {
    local line="$1"
    local target_file="$2"
    if printf '%s\n' "$line" | tee -a "$target_file" >/dev/null 2>/dev/null; then
        return 0
    fi

    local fallback_dir="/tmp/.claude/logs"
    local fallback_file="$fallback_dir/$(basename "$target_file")"

    mkdir -p "$fallback_dir" 2>/dev/null || true
    printf '%s\n' "$line" | tee -a "$fallback_file" >/dev/null 2>/dev/null || true
}

clamp_decimal() {
    local value="$1"
    local min="$2"
    local max="$3"
    awk -v v="$value" -v lo="$min" -v hi="$max" 'BEGIN {
        if (v < lo) v = lo;
        if (v > hi) v = hi;
        printf "%.3f", v;
    }'
}

float_ge() {
    awk -v a="$1" -v b="$2" 'BEGIN { exit !(a >= b) }'
}

float_gt() {
    awk -v a="$1" -v b="$2" 'BEGIN { exit !(a > b) }'
}

sanitize_intake_mode() {
    local mode="$1"
    local normalized

    normalized=$(echo "${mode:-}" | tr '[:upper:]' '[:lower:]')
    case "$normalized" in
        suggest|recommend|require)
            echo "$normalized"
            ;;
        *)
            echo "recommend"
            ;;
    esac
}

ACTIVE_INTAKE_MODE=$(sanitize_intake_mode "$ACTIVE_INTAKE_MODE")

# =============================================================================
# ACTIVE INTAKE GATE HELPERS
# =============================================================================

is_procedural_request() {
    local msg="$1"
    local msg_lower

    [[ -z "$msg" ]] && return 1

    msg_lower=$(echo "$msg" | tr '[:upper:]' '[:lower:]')

    if echo "$msg_lower" | grep -qE '\b(step[- ]by[- ]step|how[- ]to)\b'; then
        return 0
    fi

    if echo "$msg_lower" | grep -qE '\b(runbook|procedure|procedures|playbook|sop|checklist|guide)\b'; then
        return 0
    fi

    if echo "$msg_lower" | grep -qE '\b(outline|draft|write|document|generate|create|develop|prepare|explain|describe|show)\b.{0,40}\b(plan|steps?)\b'; then
        return 0
    fi

    if echo "$msg_lower" | grep -qE '\b(what|how|show|explain|describe)\b.{0,40}\b(plan|steps?)\b'; then
        return 0
    fi

    return 1
}

should_skip_intake_gate() {
    local msg="$1"
    local msg_lower

    [[ -z "$msg" ]] && return 0
    [[ ${#msg} -lt 20 ]] && return 0

    msg_lower=$(echo "$msg" | tr '[:upper:]' '[:lower:]')

    if echo "$msg_lower" | grep -qE '^\s*/intake|run.*intake|use.*intake|\[direct\]|\[skip'; then
        return 0
    fi

    if echo "$msg_lower" | grep -qE '^(what|how|why|where|when|show|list|check|status|help|explain|describe)\b'; then
        return 0
    fi

    if is_procedural_request "$msg"; then
        return 0
    fi

    # Continuation prompts should keep existing routing/adaptive behavior.
    if echo "$msg_lower" | grep -qE '\b(continue|resume|pick up|go ahead|proceed|carry on|last session (hung|hanged|stalled))\b'; then
        return 0
    fi

    if echo "$msg_lower" | grep -qE '^\s*/'; then
        return 0
    fi

    return 1
}

calculate_project_signal() {
    local msg="$1"
    local msg_lower
    local signal=0

    msg_lower=$(echo "$msg" | tr '[:upper:]' '[:lower:]')

    # Strong project signals (+2 each)
    echo "$msg_lower" | grep -qE '\b(redesign|overhaul|rebuild|restructure|revamp)\b' && signal=$((signal + 2))
    echo "$msg_lower" | grep -qE '\b(implement|build out|set up|stand up|create a new)\b.{10,}' && signal=$((signal + 2))
    echo "$msg_lower" | grep -qE '\b(migrate|migration)\b' && signal=$((signal + 2))
    echo "$msg_lower" | grep -qE '\b(cpq|quote.to.cash|billing|renewal|subscription)\b' && signal=$((signal + 2))
    echo "$msg_lower" | grep -qE '\bwe need to\b.{15,}' && signal=$((signal + 2))
    echo "$msg_lower" | grep -qE '\bi want to\b.{15,}' && signal=$((signal + 2))

    # Medium project signals (+1 each)
    echo "$msg_lower" | grep -qE '\b(with|including|that supports|along with)\b' && signal=$((signal + 1))
    echo "$msg_lower" | grep -qE '\b(across|all|every|multiple|several)\b.*(object|team|record type|department)' && signal=$((signal + 1))
    echo "$msg_lower" | grep -qE '\b(approval|workflow|routing|scoring|assignment)\b.*\b(chain|rule|logic|model)\b' && signal=$((signal + 1))
    echo "$msg_lower" | grep -qE '\b(territory|lead routing|opportunity stage|pipeline)\b' && signal=$((signal + 1))
    echo "$msg_lower" | grep -qE '\b(phase|rollout|rollback|uat|testing plan)\b' && signal=$((signal + 1))

    # Length signal
    if [[ ${#msg} -gt 150 ]]; then
        signal=$((signal + 1))
    fi
    if [[ ${#msg} -gt 300 ]]; then
        signal=$((signal + 1))
    fi

    echo "$signal"
}

score_intake_completeness() {
    local msg="$1"
    local fallback_score="1.0"

    if [[ ! -f "$INTAKE_COMPLETENESS_SCORER" ]] || ! command -v node &>/dev/null; then
        echo "$fallback_score"
        return 0
    fi

    local scorer_output
    scorer_output=$(timeout 3 node "$INTAKE_COMPLETENESS_SCORER" --json "$msg" 2>/dev/null || echo "")
    if [[ -z "$scorer_output" ]] || ! echo "$scorer_output" | jq -e . >/dev/null 2>&1; then
        echo "$fallback_score"
        return 0
    fi

    local score
    score=$(echo "$scorer_output" | jq -r '.score // 1' 2>/dev/null)
    [[ -z "$score" || "$score" == "null" ]] && score="$fallback_score"

    clamp_decimal "$score" "0" "1"
}

evaluate_active_intake_gate() {
    local msg="$1"
    local mode="$2"
    local signal_min="$3"
    local completeness_max="$4"

    if should_skip_intake_gate "$msg"; then
        echo "false|0|1|skip_conditions"
        return 0
    fi

    local project_signal
    project_signal=$(calculate_project_signal "$msg")
    if [[ -z "$project_signal" ]]; then
        project_signal=0
    fi

    if (( project_signal < signal_min )); then
        echo "false|$project_signal|1|low_project_signal"
        return 0
    fi

    local completeness_score
    completeness_score=$(score_intake_completeness "$msg")

    if ! float_gt "$completeness_max" "$completeness_score"; then
        echo "false|$project_signal|$completeness_score|sufficient_detail"
        return 0
    fi

    if [[ "$mode" == "suggest" ]]; then
        echo "true|$project_signal|$completeness_score|suggest_mode"
    elif [[ "$mode" == "require" ]]; then
        echo "true|$project_signal|$completeness_score|require_mode"
    else
        echo "true|$project_signal|$completeness_score|recommend_mode"
    fi
}

# =============================================================================
# PLATFORM PATTERN MATCHING
# =============================================================================

message_matches_keyword() {
    local msg="$1"
    local keyword="$2"

    [[ -z "$keyword" ]] && return 1

    if [[ "$keyword" =~ ^[[:alnum:]]{2,4}$ ]]; then
        printf '%s' "$msg" | grep -qE "(^|[^[:alnum:]_])${keyword}([^[:alnum:]_]|$)"
    else
        printf '%s' "$msg" | grep -qE "$keyword"
    fi
}

pattern_json_matches_message() {
    local msg="$1"
    local pattern_json="$2"
    local keyword=""

    while IFS= read -r keyword; do
        [[ -z "$keyword" ]] && continue
        if message_matches_keyword "$msg" "$keyword"; then
            return 0
        fi
    done < <(echo "$pattern_json" | jq -r '.keywords[]?' 2>/dev/null)

    return 1
}

match_platform_pattern() {
    local msg="$1"
    local msg_without_paths
    local msg_lower
    msg_without_paths=$(strip_path_like_tokens "$msg")
    if [[ -z "${msg_without_paths// }" ]]; then
        msg_without_paths="$msg"
    fi
    msg_lower=$(echo "$msg_without_paths" | tr '[:upper:]' '[:lower:]')

    local suggested_agent=""
    local complexity="0"
    local blocking="false"
    local route_id=""
    local clearance_agents="[]"

    # If patterns file exists, use it
    if [[ -f "$PATTERNS_FILE" ]]; then
        # Check all platform patterns using tab delimiter to avoid colon issues in agent names
        for platform in salesforce hubspot marketo okrs crossPlatform gtmPlanning; do
            local patterns
            patterns=$(jq -c ".platformPatterns.${platform}.patterns[]?" "$PATTERNS_FILE" 2>/dev/null || echo "")

            while IFS= read -r pattern_json; do
                local agent
                local comp
                local block
                local matched_route_id
                local matched_clearance_agents

                agent=$(echo "$pattern_json" | jq -r '.agent // ""' 2>/dev/null || echo "")
                comp=$(echo "$pattern_json" | jq -r '.complexity // 0' 2>/dev/null || echo "0")
                block=$(echo "$pattern_json" | jq -r '.blocking // false' 2>/dev/null || echo "false")
                matched_route_id=$(echo "$pattern_json" | jq -r '.id // ""' 2>/dev/null || echo "")
                matched_clearance_agents=$(echo "$pattern_json" | jq -c '.clearanceAgents // []' 2>/dev/null || echo "[]")

                if pattern_json_matches_message "$msg_lower" "$pattern_json"; then
                    suggested_agent="$agent"
                    complexity="${comp:-0.5}"
                    blocking="${block:-false}"
                    route_id="$matched_route_id"
                    clearance_agents="$matched_clearance_agents"
                    break 2
                fi
            done <<< "$patterns"
        done
    fi

    # Fallback: Use shared match_routing_pattern function
    if [[ -z "$suggested_agent" ]] && type match_routing_pattern &>/dev/null; then
        suggested_agent=$(match_routing_pattern "$msg_without_paths" "$PATTERNS_FILE")
    fi

    # Calculate complexity if not set
    if [[ "$complexity" == "0" ]] && [[ -n "$suggested_agent" ]]; then
        if type calculate_complexity &>/dev/null; then
            complexity=$(calculate_complexity "$msg_without_paths")
        else
            complexity="0.5"
        fi
    fi

    jq -nc \
      --arg route_id "$route_id" \
      --arg agent "${suggested_agent:-}" \
      --argjson complexity "${complexity:-0}" \
      --argjson blocking "${blocking:-false}" \
      --argjson clearance_agents "$clearance_agents" \
      '{
        routeId: $route_id,
        agent: $agent,
        complexity: $complexity,
        blocking: $blocking,
        clearanceAgents: $clearance_agents
      }'
}

persist_routing_state() {
    local status="$1"
    local reason="$2"

    if [[ -z "${ROUTING_SESSION_KEY:-}" ]] || [[ ! -f "$ROUTING_STATE_MANAGER" ]]; then
        return 0
    fi

    if ! command -v node &>/dev/null; then
        return 0
    fi

    local payload
    payload=$(jq -nc \
      --arg session_key "$ROUTING_SESSION_KEY" \
      --arg route_id "${ROUTE_ID:-}" \
      --arg route_kind "${ROUTE_KIND:-}" \
      --arg guidance_action "${GUIDANCE_ACTION:-}" \
      --arg routing_reason "$reason" \
      --arg agent "${SUGGESTED_AGENT:-}" \
      --argjson clearance_agents "${CLEARANCE_AGENTS_JSON:-[]}" \
      --arg status "$status" \
      --arg handoff_prompt "$USER_MESSAGE" \
      --arg user_message_preview "${USER_MESSAGE:0:200}" \
      --argjson requires_specialist "${REQUIRES_SPECIALIST:-false}" \
      --argjson prompt_guidance_only "${PROMPT_GUIDANCE_ONLY:-true}" \
      --argjson prompt_blocked "${PROMPT_BLOCKED:-false}" \
      --argjson execution_block_until_cleared "${EXECUTION_BLOCK_UNTIL_CLEARED:-false}" \
      --argjson route_pending_clearance "${ROUTE_PENDING_CLEARANCE:-false}" \
      --argjson route_cleared "${ROUTE_CLEARED:-false}" \
      --argjson routing_confidence "${ROUTING_CONFIDENCE:-0}" \
      --argjson override_applied "${OVERRIDE_APPLIED:-false}" \
      --argjson auto_delegation_eligible "${AUTO_DELEGATION_ELIGIBLE:-false}" \
      --arg auto_delegation_mode "${AUTO_DELEGATION_MODE:-disabled}" \
      '{
        session_key: $session_key,
        route_id: (if $route_id != "" then $route_id else null end),
        route_kind: (if $route_kind != "" then $route_kind else null end),
        guidance_action: (if $guidance_action != "" then $guidance_action else null end),
        routing_reason: (if $routing_reason != "" then $routing_reason else null end),
        required_agent: (if $agent != "" then $agent else null end),
        clearance_agents: $clearance_agents,
        requires_specialist: $requires_specialist,
        prompt_guidance_only: $prompt_guidance_only,
        prompt_blocked: $prompt_blocked,
        execution_block_until_cleared: $execution_block_until_cleared,
        route_pending_clearance: $route_pending_clearance,
        route_cleared: $route_cleared,
        routing_confidence: $routing_confidence,
        override_applied: $override_applied,
        clearance_status: $status,
        user_message_preview: $user_message_preview,
        handoff_prompt: $handoff_prompt,
        auto_delegation: {
          eligible: $auto_delegation_eligible,
          active: ($auto_delegation_eligible and $route_pending_clearance and ($override_applied | not)),
          mode: $auto_delegation_mode,
          agent: (if $agent != "" then $agent else null end),
          confidence: $routing_confidence,
          handoff_prompt: $handoff_prompt
        }
      }' 2>/dev/null || echo "")

    if [[ -n "$payload" ]]; then
        printf '%s' "$payload" | node "$ROUTING_STATE_MANAGER" save "$ROUTING_SESSION_KEY" >/dev/null 2>&1 || true
    fi
}

routing_state_has_pending_requirement() {
    if [[ -z "${ROUTING_SESSION_KEY:-}" ]] || [[ ! -f "$ROUTING_STATE_MANAGER" ]]; then
        return 1
    fi

    if ! command -v node &>/dev/null; then
        return 1
    fi

    node "$ROUTING_STATE_MANAGER" check "$ROUTING_SESSION_KEY" 2>/dev/null | jq -e '.routePendingClearance == true and .executionBlockActive == true' >/dev/null 2>&1
}

mark_routing_state_bypassed() {
    if [[ -z "${ROUTING_SESSION_KEY:-}" ]] || [[ ! -f "$ROUTING_STATE_MANAGER" ]]; then
        return 0
    fi

    if ! command -v node &>/dev/null; then
        return 0
    fi

    node "$ROUTING_STATE_MANAGER" mark-bypassed "$ROUTING_SESSION_KEY" "${SUGGESTED_AGENT:-}" >/dev/null 2>&1 || true
}

# Extract platform family from a fully-qualified agent name.
# e.g., opspal-salesforce:sfdc-discovery -> salesforce
extract_suggested_agent_family() {
    local agent_name="$1"

    [[ -z "$agent_name" ]] && echo "" && return 0
    [[ "$agent_name" != *:* ]] && echo "" && return 0

    if [[ -f "$ROUTING_STATE_MANAGER" ]] && command -v node &>/dev/null; then
        local family
        family=$(node -e "
const { extractAgentFamily } = require('$ROUTING_STATE_MANAGER');
process.stdout.write(extractAgentFamily('$agent_name') || '');
" 2>/dev/null) && echo "$family" && return 0
    fi

    # Pure-bash fallback: extract prefix and strip opspal- to get family
    local prefix="${agent_name%%:*}"
    echo "${prefix#opspal-}"
}

# Attempt to clear stale cross-family routing state.
# When a new prompt targets a different platform family than the pending route
# and the pending state is old enough, clear it to prevent false blocks.
clear_stale_cross_family_state() {
    local suggested_family="$1"

    CROSS_FAMILY_CLEARED="false"

    [[ -z "${ROUTING_SESSION_KEY:-}" ]] && return 0
    [[ -z "$suggested_family" ]] && return 0
    [[ ! -f "$ROUTING_STATE_MANAGER" ]] && return 0
    ! command -v node &>/dev/null && return 0

    local result
    result=$(node "$ROUTING_STATE_MANAGER" clear-stale "$ROUTING_SESSION_KEY" "$suggested_family" 2>/dev/null || echo '{"cleared":false}')

    local was_cleared
    was_cleared=$(echo "$result" | jq -r '.cleared // false' 2>/dev/null || echo "false")

    if [[ "$was_cleared" == "true" ]]; then
        CROSS_FAMILY_CLEARED="true"
        local pending_family
        local requested_family
        pending_family=$(echo "$result" | jq -r '.pendingFamily // "unknown"' 2>/dev/null || echo "unknown")
        requested_family=$(echo "$result" | jq -r '.requestedFamily // "unknown"' 2>/dev/null || echo "unknown")
        [[ "$VERBOSE" = "1" ]] && echo "[ROUTER] Cross-family stale state cleared: pending=$pending_family, requested=$requested_family" >&2
    fi
}

# =============================================================================
# COMPOUND CLEANUP SHAPE DETECTION
# Catches multi-step Salesforce cleanup workflows when individual mandatory
# patterns do not fire (e.g., vague opener with rich embedded body).
# Looks for >= 3 of 6 signal groups to trigger orchestrator routing.
# =============================================================================

detect_compound_cleanup_shape() {
    local msg="$1"
    local msg_lower
    local signal_count=0

    [[ -z "$msg" ]] && echo '{}' && return 1
    msg_lower=$(echo "$msg" | tr '[:upper:]' '[:lower:]')

    # Signal group 1: account naming/verification
    echo "$msg_lower" | grep -qE '(account.*nam(e|ing)|nam(e|ing).*issue.*account|fix.*account.*name|rename.*account)' && signal_count=$((signal_count + 1))

    # Signal group 2: contact count/CSV
    echo "$msg_lower" | grep -qE '(count.*contact|contact.*count|csv.*contact|contact.*csv|generate.*csv)' && signal_count=$((signal_count + 1))

    # Signal group 3: reparent/transfer/reassign contacts
    echo "$msg_lower" | grep -qE '(reparent|transfer.*contact|reassign.*contact|move.*contact)' && signal_count=$((signal_count + 1))

    # Signal group 4: delete duplicate/cleanup
    echo "$msg_lower" | grep -qE '(delete.*duplicate|duplicate.*delete|duplicate.*account.*clean|clean.*duplicate|remove.*duplicate)' && signal_count=$((signal_count + 1))

    # Signal group 5: bulk update / 100+ records
    echo "$msg_lower" | grep -qE '(bulk.*update|[0-9]{3,}.*contact|[0-9]{3,}.*record|mass.*updat|update.*all.*contact)' && signal_count=$((signal_count + 1))

    # Signal group 6: verify account
    echo "$msg_lower" | grep -qE '(verify.*account|account.*verif|account.*audit|confirm.*account)' && signal_count=$((signal_count + 1))

    # Signal group 7: find/identify duplicates (vague opener pattern)
    echo "$msg_lower" | grep -qE '(find.*duplicate|identify.*duplicate|locate.*duplicate|duplicate.*we.*created|check.*for.*duplicate|detect.*duplicate)' && signal_count=$((signal_count + 1))

    # Signal group 8: query + validate pattern (discovery-cleanup compound)
    echo "$msg_lower" | grep -qE '(query.*account.*validate|validate.*duplicate|check.*account.*date|account.*website.*match|compare.*account)' && signal_count=$((signal_count + 1))

    # Signal group 9: cleanup/merge intent combined with discovery
    echo "$msg_lower" | grep -qE '(clean.*up.*account|merge.*record|consolidate.*record|fix.*data.*quality|data.*cleanup|account.*cleanup)' && signal_count=$((signal_count + 1))

    if [[ $signal_count -ge 3 ]]; then
        [[ "$VERBOSE" = "1" ]] && echo "[ROUTER] Compound cleanup shape detected: ${signal_count}/9 signal groups matched" >&2
        jq -nc \
          --arg route_id "compound-salesforce-cleanup" \
          --arg agent "opspal-salesforce:sfdc-orchestrator" \
          '{
            routeId: $route_id,
            agent: $agent,
            clearanceAgents: [
              "opspal-salesforce:sfdc-orchestrator",
              "opspal-salesforce:sfdc-query-specialist",
              "opspal-salesforce:sfdc-data-export-manager",
              "opspal-salesforce:sfdc-csv-enrichment",
              "opspal-salesforce:sfdc-bulkops-orchestrator",
              "opspal-salesforce:sfdc-merge-orchestrator",
              "opspal-salesforce:sfdc-dedup-safety-copilot"
            ]
          }'
        return 0
    fi

    echo '{}'
    return 1
}

# =============================================================================
# MAIN ROUTING LOGIC
# =============================================================================

PROCEDURAL_REQUEST="false"
if is_procedural_request "$USER_MESSAGE"; then
    PROCEDURAL_REQUEST="true"
fi

# Check for mandatory blocking first
MANDATORY_MATCH=$(check_destructive_automation_prefilter "$USER_MESSAGE")
MANDATORY_AGENT=$(echo "$MANDATORY_MATCH" | jq -r '.agent // ""' 2>/dev/null || echo "")

if [[ -z "$MANDATORY_AGENT" ]]; then
    MANDATORY_MATCH=$(check_mandatory_patterns "$USER_MESSAGE")
    MANDATORY_AGENT=$(echo "$MANDATORY_MATCH" | jq -r '.agent // ""' 2>/dev/null || echo "")
fi

# If the normalized opener missed a mandatory match, scan the full body.
# Critical for continuation prompts with rich embedded instructions.
if [[ -z "$MANDATORY_AGENT" ]] && [[ ${#RAW_USER_MESSAGE} -gt ${#USER_MESSAGE} ]]; then
    MANDATORY_MATCH_BODY=$(check_destructive_automation_prefilter "$RAW_USER_MESSAGE")
    MANDATORY_AGENT_BODY=$(echo "$MANDATORY_MATCH_BODY" | jq -r '.agent // ""' 2>/dev/null || echo "")
    if [[ -z "$MANDATORY_AGENT_BODY" ]]; then
        MANDATORY_MATCH_BODY=$(check_mandatory_patterns "$RAW_USER_MESSAGE")
        MANDATORY_AGENT_BODY=$(echo "$MANDATORY_MATCH_BODY" | jq -r '.agent // ""' 2>/dev/null || echo "")
    fi
    if [[ -n "$MANDATORY_AGENT_BODY" ]]; then
        MANDATORY_MATCH="$MANDATORY_MATCH_BODY"
        MANDATORY_AGENT="$MANDATORY_AGENT_BODY"
        [[ "$VERBOSE" = "1" ]] && echo "[ROUTER] Mandatory pattern matched via full-body scan: $MANDATORY_AGENT" >&2
    fi
fi

MANDATORY_ROUTE_ID=$(echo "$MANDATORY_MATCH" | jq -r '.routeId // ""' 2>/dev/null || echo "")
MANDATORY_CLEARANCE_AGENTS=$(echo "$MANDATORY_MATCH" | jq -c '.clearanceAgents // []' 2>/dev/null || echo "[]")
IS_MANDATORY="false"
PATTERN_BLOCKING="false"
ROUTING_SOURCE="pattern"
FALLBACK_USED="false"
ROUTING_CONFIDENCE="0"
INTAKE_ELIGIBLE="false"
INTAKE_REQUIRED="false"
INTAKE_GATE_APPLIED="false"
INTAKE_REASON="not_evaluated"
INTAKE_PROJECT_SIGNAL="0"
INTAKE_COMPLETENESS_SCORE="1"
INTAKE_GATE_COMPLEXITY="0.6"
ROUTE_ID=""
CLEARANCE_AGENTS_JSON="[]"

# If no mandatory pattern matched, try compound cleanup shape detection on full body
if [[ -z "$MANDATORY_AGENT" ]]; then
    COMPOUND_MATCH=$(detect_compound_cleanup_shape "$RAW_USER_MESSAGE")
    COMPOUND_AGENT=$(echo "$COMPOUND_MATCH" | jq -r '.agent // ""' 2>/dev/null || echo "")
    if [[ -n "$COMPOUND_AGENT" ]]; then
        MANDATORY_AGENT="$COMPOUND_AGENT"
        MANDATORY_MATCH="$COMPOUND_MATCH"
        MANDATORY_ROUTE_ID=$(echo "$COMPOUND_MATCH" | jq -r '.routeId // ""' 2>/dev/null || echo "")
        MANDATORY_CLEARANCE_AGENTS=$(echo "$COMPOUND_MATCH" | jq -c '.clearanceAgents // []' 2>/dev/null || echo "[]")
        ROUTING_SOURCE="compound-shape-detection"
        [[ "$VERBOSE" = "1" ]] && echo "[ROUTER] Compound cleanup shape matched: $COMPOUND_AGENT" >&2
    fi
fi

if [[ -n "$MANDATORY_AGENT" ]]; then
    IS_MANDATORY="true"
    SUGGESTED_AGENT="$MANDATORY_AGENT"
    COMPLEXITY="1.0"
    ROUTE_ID="$MANDATORY_ROUTE_ID"
    CLEARANCE_AGENTS_JSON="$MANDATORY_CLEARANCE_AGENTS"
    [[ "$VERBOSE" = "1" ]] && echo "[ROUTER] Mandatory pattern matched: $MANDATORY_AGENT" >&2
else
    INTAKE_GATE_RESULT=$(evaluate_active_intake_gate "$USER_MESSAGE" "$ACTIVE_INTAKE_MODE" "$ACTIVE_INTAKE_PROJECT_SIGNAL_MIN" "$ACTIVE_INTAKE_COMPLETENESS_MAX")
    INTAKE_ELIGIBLE=$(echo "$INTAKE_GATE_RESULT" | cut -d'|' -f1)
    INTAKE_PROJECT_SIGNAL=$(echo "$INTAKE_GATE_RESULT" | cut -d'|' -f2)
    INTAKE_COMPLETENESS_SCORE=$(echo "$INTAKE_GATE_RESULT" | cut -d'|' -f3)
    INTAKE_REASON=$(echo "$INTAKE_GATE_RESULT" | cut -d'|' -f4)
    INTAKE_COMPLETENESS_SCORE=$(clamp_decimal "$INTAKE_COMPLETENESS_SCORE" "0" "1")

    if [[ "$ACTIVE_INTAKE_VERBOSE" == "1" ]] || [[ "$VERBOSE" == "1" ]]; then
        echo "[ROUTER] Intake gate mode=$ACTIVE_INTAKE_MODE eligible=$INTAKE_ELIGIBLE signal=$INTAKE_PROJECT_SIGNAL completeness=$INTAKE_COMPLETENESS_SCORE reason=$INTAKE_REASON" >&2
    fi

    if [[ "$INTAKE_ELIGIBLE" == "true" ]] && [[ "$ACTIVE_INTAKE_MODE" != "suggest" ]]; then
        SUGGESTED_AGENT="opspal-core:intelligent-intake-orchestrator"
        COMPLEXITY="$INTAKE_GATE_COMPLEXITY"
        ROUTING_SOURCE="intake-gate"
        INTAKE_GATE_APPLIED="true"
        ROUTE_ID="intake-required"
        CLEARANCE_AGENTS_JSON='["opspal-core:intelligent-intake-orchestrator"]'

        if [[ "$ACTIVE_INTAKE_MODE" == "require" ]]; then
            INTAKE_REQUIRED="true"
        fi
    else
        # Match platform patterns
        MATCH_RESULT=$(match_platform_pattern "$USER_MESSAGE")
        SUGGESTED_AGENT=$(echo "$MATCH_RESULT" | jq -r '.agent // ""' 2>/dev/null || echo "")
        COMPLEXITY=$(echo "$MATCH_RESULT" | jq -r '.complexity // 0' 2>/dev/null || echo "0")
        PATTERN_BLOCKING=$(echo "$MATCH_RESULT" | jq -r '.blocking // false' 2>/dev/null || echo "false")
        ROUTE_ID=$(echo "$MATCH_RESULT" | jq -r '.routeId // ""' 2>/dev/null || echo "")
        CLEARANCE_AGENTS_JSON=$(echo "$MATCH_RESULT" | jq -c '.clearanceAgents // []' 2>/dev/null || echo "[]")
    fi
fi

# Normalize empty values
[[ "$SUGGESTED_AGENT" == "null" ]] && SUGGESTED_AGENT=""
[[ -z "$COMPLEXITY" ]] && COMPLEXITY="0"
COMPLEXITY=$(clamp_decimal "$COMPLEXITY" "0" "1")

if [[ "$IS_MANDATORY" == "true" ]]; then
    ROUTING_CONFIDENCE="1.0"
elif [[ -n "$SUGGESTED_AGENT" ]]; then
    ROUTING_CONFIDENCE="$COMPLEXITY"
else
    ROUTING_CONFIDENCE="0"
fi

try_task_router_fallback() {
    if [[ "$IS_MANDATORY" == "true" ]]; then
        return 0
    fi
    if [[ "$INTAKE_GATE_APPLIED" == "true" ]]; then
        return 0
    fi
    if [[ ! -f "$TASK_ROUTER_SCRIPT" ]] || ! command -v node &>/dev/null; then
        return 0
    fi

    local should_try="false"
    if [[ -z "$SUGGESTED_AGENT" ]]; then
        should_try="true"
    elif ! float_ge "$ROUTING_CONFIDENCE" "$LOW_CONFIDENCE_THRESHOLD"; then
        should_try="true"
    fi

    if [[ "$should_try" != "true" ]]; then
        return 0
    fi

    local fallback_input fallback_json
    fallback_input=$(strip_path_like_tokens "$USER_MESSAGE")
    if [[ -z "${fallback_input// }" ]]; then
        fallback_input="$USER_MESSAGE"
    fi
    fallback_json=$(node "$TASK_ROUTER_SCRIPT" --json "$fallback_input" 2>/dev/null || echo "")
    if [[ -z "$fallback_json" ]] || ! echo "$fallback_json" | jq -e . >/dev/null 2>&1; then
        return 0
    fi

    local fallback_agent fallback_confidence fallback_complexity fallback_recommendation
    fallback_agent=$(echo "$fallback_json" | jq -r '.agent // empty' 2>/dev/null)
    fallback_confidence=$(echo "$fallback_json" | jq -r '.confidence // 0' 2>/dev/null)
    fallback_complexity=$(echo "$fallback_json" | jq -r '.complexity.score // 0' 2>/dev/null)
    fallback_recommendation=$(echo "$fallback_json" | jq -r '.recommendation // ""' 2>/dev/null)

    [[ "$fallback_agent" == "null" ]] && fallback_agent=""
    [[ -z "$fallback_agent" ]] && return 0

    fallback_confidence=$(clamp_decimal "$fallback_confidence" "0" "1")
    fallback_complexity=$(clamp_decimal "$fallback_complexity" "0" "1")

    if ! float_ge "$fallback_confidence" "$FALLBACK_MIN_CONFIDENCE"; then
        return 0
    fi

    if [[ -n "$SUGGESTED_AGENT" ]] && ! float_gt "$fallback_confidence" "$ROUTING_CONFIDENCE"; then
        return 0
    fi

    SUGGESTED_AGENT="$fallback_agent"
    COMPLEXITY="$fallback_complexity"
    ROUTING_CONFIDENCE="$fallback_confidence"
    ROUTING_SOURCE="task-router-fallback"
    FALLBACK_USED="true"
    ROUTE_ID="task-router-fallback"
    CLEARANCE_AGENTS_JSON=$(jq -nc --arg agent "$fallback_agent" '[$agent]' 2>/dev/null || echo "[]")

    if [[ "$fallback_recommendation" == "REQUIRED" ]]; then
        PATTERN_BLOCKING="true"
    fi

    [[ "$VERBOSE" = "1" ]] && echo "[ROUTER] Task router fallback selected $SUGGESTED_AGENT (confidence $ROUTING_CONFIDENCE)" >&2
}

try_task_router_fallback

if [[ "$CLEARANCE_AGENTS_JSON" == "[]" ]] && [[ -n "$SUGGESTED_AGENT" ]]; then
    CLEARANCE_AGENTS_JSON=$(jq -nc --arg agent "$SUGGESTED_AGENT" '[$agent]' 2>/dev/null || echo "[]")
fi

[[ "$VERBOSE" = "1" ]] && echo "[ROUTER] Agent: $SUGGESTED_AGENT, Complexity: $COMPLEXITY" >&2

# Guardrail: block semver-prefixed pseudo-plugin agent names from routing output
GUARDRAIL_ALERT=""
GUARDRAIL_LEAKED_AGENT=""
if [[ -n "$SUGGESTED_AGENT" ]] && is_semver_prefixed_agent "$SUGGESTED_AGENT"; then
    GUARDRAIL_LEAKED_AGENT="$SUGGESTED_AGENT"
    GUARDRAIL_ALERT="Semver-prefixed agent recommendation blocked: $SUGGESTED_AGENT"
    SUGGESTED_AGENT=""
    echo "[ROUTING ALERT] $GUARDRAIL_ALERT" >&2
fi

# =============================================================================
# DETERMINE ACTION TYPE
# =============================================================================

ACTION_TYPE="DIRECT_OK"
SHOULD_BLOCK="false"
SHOULD_PERSIST_ROUTE="false"

if [[ -n "$GUARDRAIL_ALERT" ]] && [[ "$IS_MANDATORY" == "true" ]]; then
    ACTION_TYPE="MANDATORY_ALERT"
    SHOULD_BLOCK="true"
elif [[ -n "$GUARDRAIL_ALERT" ]]; then
    ACTION_TYPE="ALERT_INVALID_AGENT"
    SHOULD_BLOCK="false"
elif [[ "$INTAKE_REQUIRED" == "true" ]] && [[ -n "$SUGGESTED_AGENT" ]]; then
    ACTION_TYPE="INTAKE_REQUIRED"
    SHOULD_BLOCK="true"
elif [[ "$IS_MANDATORY" == "true" ]] && [[ -n "$SUGGESTED_AGENT" ]]; then
    ACTION_TYPE="MANDATORY_BLOCKED"
    SHOULD_BLOCK="true"
elif [[ -n "$SUGGESTED_AGENT" ]]; then
    # Use bc for floating point comparison
    if command -v bc &> /dev/null; then
        IS_HIGH=$(echo "$COMPLEXITY >= 0.7" | bc -l 2>/dev/null || echo "0")
        IS_MEDIUM=$(echo "$COMPLEXITY >= 0.5" | bc -l 2>/dev/null || echo "0")

        if [[ "$IS_HIGH" == "1" ]]; then
            ACTION_TYPE="BLOCKED"
            [[ "$ENABLE_BLOCKING" == "1" ]] && SHOULD_BLOCK="true"
        elif [[ "$IS_MEDIUM" == "1" ]]; then
            ACTION_TYPE="RECOMMENDED"
        else
            ACTION_TYPE="AVAILABLE"
        fi
    else
        # No bc - use pattern blocking flag
        if [[ "$PATTERN_BLOCKING" == "true" ]]; then
            ACTION_TYPE="BLOCKED"
            [[ "$ENABLE_BLOCKING" == "1" ]] && SHOULD_BLOCK="true"
        else
            ACTION_TYPE="RECOMMENDED"
        fi
    fi
fi

if [[ "$PROCEDURAL_REQUEST" == "true" ]] &&
   [[ "$IS_MANDATORY" != "true" ]] &&
   [[ "$ACTION_TYPE" == "BLOCKED" ]]; then
    ACTION_TYPE="RECOMMENDED"
    SHOULD_BLOCK="false"
fi

# Persist only enforceable routes for the PreToolUse gate. Recommendation-only
# routes stay advisory and should not activate pending-route enforcement.
SHOULD_PERSIST_ROUTE="$SHOULD_BLOCK"

BLOCK_REASON=""
if [[ "$IS_MANDATORY" == "true" ]] && [[ "$SHOULD_BLOCK" == "true" ]]; then
    BLOCK_REASON="mandatory_destructive"
elif [[ "$ACTION_TYPE" == "INTAKE_REQUIRED" ]] && [[ "$SHOULD_BLOCK" == "true" ]]; then
    BLOCK_REASON="intake_required"
elif [[ "$ACTION_TYPE" == "BLOCKED" ]] && [[ "$SHOULD_BLOCK" == "true" ]]; then
    BLOCK_REASON="high_complexity"
elif [[ -n "$GUARDRAIL_ALERT" ]] && [[ "$SHOULD_BLOCK" == "true" ]]; then
    BLOCK_REASON="guardrail_alert"
fi

ENFORCED_BLOCK="false"
OVERRIDE_APPLIED="false"
BLOCK_OVERRIDE_REASON=""
LOW_SIGNAL_ROUTING="false"
ADAPTIVE_FALLBACK_APPLIED="false"
PROMPT_BLOCK_REQUESTED="false"
PROMPT_BLOCK_SUPPRESSED="false"

if [[ -n "$SUGGESTED_AGENT" ]] && ! float_ge "$ROUTING_CONFIDENCE" "$ROUTING_CONTINUE_LOW_SIGNAL_THRESHOLD"; then
    LOW_SIGNAL_ROUTING="true"
fi

if [[ "$SHOULD_BLOCK" == "true" ]]; then
    if [[ "${SKIP_AGENT_BLOCKING:-0}" == "1" ]]; then
        BLOCK_OVERRIDE_REASON="env_skip_agent_blocking"
    elif [[ "$HAS_OVERRIDE" == "true" ]]; then
        OVERRIDE_APPLIED="true"
        BLOCK_OVERRIDE_REASON="prompt_override_token"
    elif [[ "$ACTION_TYPE" == "INTAKE_REQUIRED" ]] && [[ "$ENABLE_INTAKE_HARD_BLOCKING" == "1" ]]; then
        PROMPT_BLOCK_REQUESTED="true"
    elif [[ "$IS_MANDATORY" == "true" ]] &&
         [[ "$USER_PROMPT_MANDATORY_HARD_BLOCKING" == "1" ]]; then
        PROMPT_BLOCK_REQUESTED="true"
    elif [[ "$ACTION_TYPE" == "BLOCKED" ]] && [[ "$ENABLE_COMPLEXITY_HARD_BLOCKING" == "1" ]]; then
        PROMPT_BLOCK_REQUESTED="true"
    fi
fi

if [[ "$PROMPT_BLOCK_REQUESTED" == "true" ]]; then
    PROMPT_BLOCK_SUPPRESSED="true"
    ENFORCED_BLOCK="false"
fi

if [[ "$ROUTING_ADAPTIVE_CONTINUE" == "1" ]] &&
   [[ "$SHOULD_BLOCK" == "true" ]] &&
   [[ "$ACTION_TYPE" == "BLOCKED" ]] &&
   [[ "$IS_MANDATORY" != "true" ]] &&
   [[ "$OVERRIDE_APPLIED" != "true" ]] &&
   [[ "${SKIP_AGENT_BLOCKING:-0}" != "1" ]]; then
    SHOULD_APPLY_ADAPTIVE="false"

    if [[ "$CONTINUE_INTENT" == "true" ]]; then
        SHOULD_APPLY_ADAPTIVE="true"
    elif [[ "$LOW_SIGNAL_ROUTING" == "true" ]] && float_ge "$TRANSCRIPT_NOISE_SCORE" "$ROUTING_TRANSCRIPT_NOISE_THRESHOLD"; then
        SHOULD_APPLY_ADAPTIVE="true"
    fi

    if [[ "$SHOULD_APPLY_ADAPTIVE" == "true" ]]; then
        ENFORCED_BLOCK="false"
        ADAPTIVE_FALLBACK_APPLIED="true"
        BLOCK_OVERRIDE_REASON="adaptive_continue_fallback"
    fi
fi

ROUTE_KIND="direct"
GUIDANCE_ACTION="direct_ok"
ROUTING_REASON="${BLOCK_REASON:-advisory}"
PROMPT_GUIDANCE_ONLY="true"
PROMPT_BLOCKED="false"
REQUIRES_SPECIALIST="$SHOULD_PERSIST_ROUTE"
EXECUTION_BLOCK_UNTIL_CLEARED="$SHOULD_PERSIST_ROUTE"
ROUTE_PENDING_CLEARANCE="$SHOULD_PERSIST_ROUTE"
ROUTE_CLEARED="false"
AUTO_DELEGATION_ELIGIBLE="false"
AUTO_DELEGATION_MODE="disabled"

if [[ -n "$GUARDRAIL_ALERT" ]] && [[ "$IS_MANDATORY" == "true" ]]; then
    ROUTE_KIND="routing_alert"
    GUIDANCE_ACTION="require_specialist"
    ROUTING_REASON="${BLOCK_REASON:-guardrail_alert}"
elif [[ -n "$GUARDRAIL_ALERT" ]]; then
    ROUTE_KIND="routing_alert"
    GUIDANCE_ACTION="alert"
    ROUTING_REASON="${BLOCK_REASON:-guardrail_alert}"
elif [[ "$ACTION_TYPE" == "INTAKE_REQUIRED" ]]; then
    ROUTE_KIND="intake_specialist"
    GUIDANCE_ACTION="require_intake"
    ROUTING_REASON="${BLOCK_REASON:-intake_required}"
elif [[ "$IS_MANDATORY" == "true" ]] && [[ -n "$SUGGESTED_AGENT" ]]; then
    ROUTE_KIND="mandatory_specialist"
    GUIDANCE_ACTION="require_specialist"
    ROUTING_REASON="${BLOCK_REASON:-mandatory_destructive}"
elif [[ "$ACTION_TYPE" == "BLOCKED" ]] && [[ -n "$SUGGESTED_AGENT" ]]; then
    ROUTE_KIND="complexity_specialist"
    GUIDANCE_ACTION="require_specialist"
    ROUTING_REASON="${BLOCK_REASON:-high_complexity}"
elif [[ "$ACTION_TYPE" == "RECOMMENDED" ]] && [[ -n "$SUGGESTED_AGENT" ]]; then
    ROUTE_KIND="advisory_specialist"
    GUIDANCE_ACTION="recommend_specialist"
    ROUTING_REASON="advisory_specialist"
elif [[ "$ACTION_TYPE" == "AVAILABLE" ]] && [[ -n "$SUGGESTED_AGENT" ]]; then
    ROUTE_KIND="advisory_specialist"
    GUIDANCE_ACTION="recommend_specialist"
    ROUTING_REASON="available_specialist"
fi

if [[ "$OVERRIDE_APPLIED" == "true" ]]; then
    EXECUTION_BLOCK_UNTIL_CLEARED="false"
    ROUTE_PENDING_CLEARANCE="false"
fi

if [[ "$ROUTING_AUTO_DELEGATION_ENABLED" == "1" ]] &&
   [[ "$ROUTE_KIND" == "mandatory_specialist" ]] &&
   [[ "$REQUIRES_SPECIALIST" == "true" ]] &&
   [[ -n "$SUGGESTED_AGENT" ]] &&
   [[ "$SUGGESTED_AGENT" == *:* ]] &&
   [[ "$OVERRIDE_APPLIED" != "true" ]] &&
   [[ -z "$GUARDRAIL_ALERT" ]] &&
   float_ge "$ROUTING_CONFIDENCE" "$ROUTING_AUTO_DELEGATION_MIN_CONFIDENCE"; then
    AUTO_DELEGATION_ELIGIBLE="true"
    AUTO_DELEGATION_MODE="agent_rewrite_bridge"
fi

[[ "$VERBOSE" = "1" ]] && echo "[ROUTER] RouteKind: $ROUTE_KIND, Guidance: $GUIDANCE_ACTION, RequiresSpecialist: $REQUIRES_SPECIALIST, ExecutionGate: $EXECUTION_BLOCK_UNTIL_CLEARED, RequestedPromptBlock: $PROMPT_BLOCK_REQUESTED, SuppressedPromptBlock: $PROMPT_BLOCK_SUPPRESSED, Override: $OVERRIDE_APPLIED, Adaptive: $ADAPTIVE_FALLBACK_APPLIED, AutoDelegation: $AUTO_DELEGATION_ELIGIBLE" >&2

# Determine the family of the newly suggested agent (may be empty for no-agent routes)
SUGGESTED_AGENT_FAMILY=""
if [[ -n "${SUGGESTED_AGENT:-}" ]]; then
    SUGGESTED_AGENT_FAMILY=$(extract_suggested_agent_family "$SUGGESTED_AGENT")
fi

if [[ "$SHOULD_PERSIST_ROUTE" == "true" ]] && [[ -n "$SUGGESTED_AGENT" ]]; then
    if [[ "$OVERRIDE_APPLIED" == "true" ]]; then
        persist_routing_state "bypassed" "${BLOCK_OVERRIDE_REASON:-prompt_override_token}"
    else
        persist_routing_state "pending_clearance" "${ROUTING_REASON:-routing_required}"
    fi
elif [[ "$HAS_OVERRIDE" == "true" ]] && routing_state_has_pending_requirement; then
    OVERRIDE_APPLIED="true"
    BLOCK_OVERRIDE_REASON="${BLOCK_OVERRIDE_REASON:-prompt_override_token}"
    mark_routing_state_bypassed
elif [[ "$SHOULD_PERSIST_ROUTE" != "true" ]] && [[ -n "$SUGGESTED_AGENT_FAMILY" ]]; then
    # Cross-family stale route detection:
    # The new prompt scored AVAILABLE/RECOMMENDED (no enforcement needed), but a
    # pending enforcement block from a different platform family may still be alive.
    # If the pending state is old enough AND from a different family, clear it now
    # so it does not bleed into the new prompt's agent invocation.
    clear_stale_cross_family_state "$SUGGESTED_AGENT_FAMILY"
fi

# =============================================================================
# OUTPUT ROUTING BANNER (to stderr for user visibility)
# =============================================================================

COMPLEXITY_PCT=$(echo "$COMPLEXITY * 100" | bc -l 2>/dev/null | cut -d. -f1 || echo "0")
COMPLEXITY_PCT="${COMPLEXITY_PCT:-0}"

if [[ -n "$SUGGESTED_AGENT" ]] && [[ "$SUGGESTED_AGENT" != "null" ]]; then
    echo "" >&2
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
    echo "[ROUTING] Agent: $SUGGESTED_AGENT | Complexity: ${COMPLEXITY_PCT}% | RouteKind: $ROUTE_KIND | Guidance: $GUIDANCE_ACTION" >&2
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
    # Namespace reminder - agent names MUST include plugin prefix
    echo "⚠️  Use fully-qualified name: Agent(subagent_type='$SUGGESTED_AGENT', ...)" >&2
    echo "    Short names (without prefix) will fail with 'Agent not found'" >&2
fi

if [[ "$OVERRIDE_APPLIED" == "true" ]]; then
    echo "[ROUTING] Override token '$ROUTING_OVERRIDE_TOKEN' detected. Proceeding without hard block." >&2
fi

# =============================================================================
# LOG ROUTING DECISION
# =============================================================================

LOG_DIR="$HOME/.claude/logs"
LOG_FILE="$LOG_DIR/routing.jsonl"
mkdir -p "$LOG_DIR" 2>/dev/null || true

LOG_ENTRY=$(jq -n \
    --arg ts "$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S')" \
    --arg route_id "${ROUTE_ID:-}" \
    --arg agent "${SUGGESTED_AGENT:-}" \
    --arg route_kind "${ROUTE_KIND:-}" \
    --arg guidance_action "${GUIDANCE_ACTION:-}" \
    --arg leaked_agent "${GUARDRAIL_LEAKED_AGENT:-}" \
    --arg guardrail_alert "${GUARDRAIL_ALERT:-}" \
    --arg routing_reason "${ROUTING_REASON:-}" \
    --arg block_override_reason "${BLOCK_OVERRIDE_REASON:-}" \
    --arg routing_source "$ROUTING_SOURCE" \
    --arg intake_mode "$ACTIVE_INTAKE_MODE" \
    --arg intake_reason "${INTAKE_REASON:-}" \
    --argjson complexity "${COMPLEXITY:-0}" \
    --argjson routing_confidence "${ROUTING_CONFIDENCE:-0}" \
    --argjson transcript_noise_score "${TRANSCRIPT_NOISE_SCORE:-0}" \
    --argjson requires_specialist "$REQUIRES_SPECIALIST" \
    --argjson prompt_guidance_only "$PROMPT_GUIDANCE_ONLY" \
    --argjson prompt_blocked "$PROMPT_BLOCKED" \
    --argjson execution_block_until_cleared "$EXECUTION_BLOCK_UNTIL_CLEARED" \
    --argjson route_pending_clearance "$ROUTE_PENDING_CLEARANCE" \
    --argjson route_cleared "$ROUTE_CLEARED" \
    --argjson legacy_prompt_block_requested "$PROMPT_BLOCK_REQUESTED" \
    --argjson legacy_prompt_block_suppressed "$PROMPT_BLOCK_SUPPRESSED" \
    --argjson override_applied "$OVERRIDE_APPLIED" \
    --argjson continue_intent "$CONTINUE_INTENT" \
    --argjson adaptive_fallback_applied "$ADAPTIVE_FALLBACK_APPLIED" \
    --argjson low_signal_routing "$LOW_SIGNAL_ROUTING" \
    --argjson auto_delegation_eligible "$AUTO_DELEGATION_ELIGIBLE" \
    --arg auto_delegation_mode "${AUTO_DELEGATION_MODE:-disabled}" \
    --argjson fallback_used "$FALLBACK_USED" \
    --argjson intake_eligible "$INTAKE_ELIGIBLE" \
    --argjson intake_required "$INTAKE_REQUIRED" \
    --argjson intake_gate_applied "$INTAKE_GATE_APPLIED" \
    --argjson intake_project_signal "${INTAKE_PROJECT_SIGNAL:-0}" \
    --argjson intake_completeness_score "${INTAKE_COMPLETENESS_SCORE:-1}" \
    --arg raw_msg_preview "${RAW_USER_MESSAGE:0:100}" \
    --arg normalized_msg_preview "${USER_MESSAGE:0:100}" \
    --arg msg_preview "${USER_MESSAGE:0:100}" \
    '{
        timestamp: $ts,
        route_id: (if $route_id != "" then $route_id else null end),
        suggested_agent: (if $agent != "" then $agent else null end),
        required_agent: (if $requires_specialist and $agent != "" then $agent else null end),
        route_kind: (if $route_kind != "" then $route_kind else null end),
        guidance_action: (if $guidance_action != "" then $guidance_action else null end),
        guardrail_leaked_agent: (if $leaked_agent != "" then $leaked_agent else null end),
        guardrail_alert: (if $guardrail_alert != "" then $guardrail_alert else null end),
        routing_reason: (if $routing_reason != "" then $routing_reason else null end),
        block_override_reason: (if $block_override_reason != "" then $block_override_reason else null end),
        complexity: $complexity,
        routing_confidence: $routing_confidence,
        transcript_noise_score: $transcript_noise_score,
        continue_intent: $continue_intent,
        requires_specialist: $requires_specialist,
        prompt_guidance_only: $prompt_guidance_only,
        prompt_blocked: $prompt_blocked,
        execution_block_until_cleared: $execution_block_until_cleared,
        route_pending_clearance: $route_pending_clearance,
        route_cleared: $route_cleared,
        legacy_prompt_block_requested: $legacy_prompt_block_requested,
        legacy_prompt_block_suppressed: $legacy_prompt_block_suppressed,
        override_applied: $override_applied,
        adaptive_fallback_applied: $adaptive_fallback_applied,
        low_signal_routing: $low_signal_routing,
        auto_delegation_eligible: $auto_delegation_eligible,
        auto_delegation_mode: $auto_delegation_mode,
        routing_source: $routing_source,
        fallback_used: $fallback_used,
        intake_mode: $intake_mode,
        intake_reason: (if $intake_reason != "" then $intake_reason else null end),
        intake_eligible: $intake_eligible,
        intake_required: $intake_required,
        intake_gate_applied: $intake_gate_applied,
        intake_project_signal: $intake_project_signal,
        intake_completeness_score: $intake_completeness_score,
        raw_message_preview: $raw_msg_preview,
        normalized_message_preview: $normalized_msg_preview,
        message_preview: $msg_preview
    }' 2>/dev/null || echo '{}')

append_log_with_fallback "$LOG_ENTRY" "$LOG_FILE"

if [[ -n "$GUARDRAIL_ALERT" ]]; then
    ALERT_FILE="$LOG_DIR/routing-alerts.jsonl"
    ALERT_ENTRY=$(jq -n \
        --arg ts "$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S')" \
        --arg alert "$GUARDRAIL_ALERT" \
        --arg leaked "${GUARDRAIL_LEAKED_AGENT:-}" \
        --arg msg_preview "${USER_MESSAGE:0:100}" \
        '{
            timestamp: $ts,
            source: "unified-router",
            type: "semver_plugin_prefix_detected",
            alert: $alert,
            leaked_agent: (if $leaked != "" then $leaked else null end),
            message_preview: $msg_preview
        }' 2>/dev/null || echo '{}')
    append_log_with_fallback "$ALERT_ENTRY" "$ALERT_FILE"
fi

if [[ "$SHOULD_PERSIST_ROUTE" == "true" ]] || [[ "$OVERRIDE_APPLIED" == "true" ]] || [[ "$ENFORCED_BLOCK" == "true" ]]; then
    ENFORCEMENT_FILE="$LOG_DIR/routing-enforcement.jsonl"
    ENFORCEMENT_ENTRY=$(jq -n \
        --arg ts "$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S')" \
        --arg route_id "${ROUTE_ID:-}" \
        --arg agent "${SUGGESTED_AGENT:-}" \
        --arg route_kind "${ROUTE_KIND:-}" \
        --arg guidance_action "${GUIDANCE_ACTION:-}" \
        --arg routing_reason "${ROUTING_REASON:-}" \
        --arg override_reason "${BLOCK_OVERRIDE_REASON:-}" \
        --arg override_token "$ROUTING_OVERRIDE_TOKEN" \
        --arg intake_mode "$ACTIVE_INTAKE_MODE" \
        --arg intake_reason "${INTAKE_REASON:-}" \
        --argjson transcript_noise_score "${TRANSCRIPT_NOISE_SCORE:-0}" \
        --argjson requires_specialist "$REQUIRES_SPECIALIST" \
        --argjson prompt_guidance_only "$PROMPT_GUIDANCE_ONLY" \
        --argjson prompt_blocked "$PROMPT_BLOCKED" \
        --argjson execution_block_until_cleared "$EXECUTION_BLOCK_UNTIL_CLEARED" \
        --argjson route_pending_clearance "$ROUTE_PENDING_CLEARANCE" \
        --argjson route_cleared "$ROUTE_CLEARED" \
        --argjson legacy_prompt_block_requested "$PROMPT_BLOCK_REQUESTED" \
        --argjson legacy_prompt_block_suppressed "$PROMPT_BLOCK_SUPPRESSED" \
        --argjson override_applied "$OVERRIDE_APPLIED" \
        --argjson continue_intent "$CONTINUE_INTENT" \
        --argjson adaptive_fallback_applied "$ADAPTIVE_FALLBACK_APPLIED" \
        --argjson auto_delegation_eligible "$AUTO_DELEGATION_ELIGIBLE" \
        --arg auto_delegation_mode "${AUTO_DELEGATION_MODE:-disabled}" \
        --argjson intake_eligible "$INTAKE_ELIGIBLE" \
        --argjson intake_required "$INTAKE_REQUIRED" \
        --argjson intake_project_signal "${INTAKE_PROJECT_SIGNAL:-0}" \
        --argjson intake_completeness_score "${INTAKE_COMPLETENESS_SCORE:-1}" \
        --arg normalized_msg_preview "${USER_MESSAGE:0:100}" \
        --arg msg_preview "${USER_MESSAGE:0:100}" \
        '{
            timestamp: $ts,
            source: "unified-router",
            route_id: (if $route_id != "" then $route_id else null end),
            suggested_agent: (if $agent != "" then $agent else null end),
            required_agent: (if $requires_specialist and $agent != "" then $agent else null end),
            route_kind: (if $route_kind != "" then $route_kind else null end),
            guidance_action: (if $guidance_action != "" then $guidance_action else null end),
            routing_reason: (if $routing_reason != "" then $routing_reason else null end),
            override_reason: (if $override_reason != "" then $override_reason else null end),
            override_token: (if $override_applied then $override_token else null end),
            transcript_noise_score: $transcript_noise_score,
            continue_intent: $continue_intent,
            requires_specialist: $requires_specialist,
            prompt_guidance_only: $prompt_guidance_only,
            prompt_blocked: $prompt_blocked,
            execution_block_until_cleared: $execution_block_until_cleared,
            route_pending_clearance: $route_pending_clearance,
            route_cleared: $route_cleared,
            legacy_prompt_block_requested: $legacy_prompt_block_requested,
            legacy_prompt_block_suppressed: $legacy_prompt_block_suppressed,
            override_applied: $override_applied,
            adaptive_fallback_applied: $adaptive_fallback_applied,
            auto_delegation_eligible: $auto_delegation_eligible,
            auto_delegation_mode: $auto_delegation_mode,
            intake_mode: $intake_mode,
            intake_reason: (if $intake_reason != "" then $intake_reason else null end),
            intake_eligible: $intake_eligible,
            intake_required: $intake_required,
            intake_project_signal: $intake_project_signal,
            intake_completeness_score: $intake_completeness_score,
            normalized_message_preview: $normalized_msg_preview,
            message_preview: $msg_preview
        }' 2>/dev/null || echo '{}')
    append_log_with_fallback "$ENFORCEMENT_ENTRY" "$ENFORCEMENT_FILE"
fi

if [[ -f "$ROUTING_METRICS_SCRIPT" ]] && command -v node &>/dev/null; then
    END_TIME_MS=$(date +%s%3N 2>/dev/null || echo "0")
    DURATION_MS=$((END_TIME_MS - START_TIME_MS))
    [[ "$DURATION_MS" -lt 0 ]] && DURATION_MS=0

    METRICS_EVENT=$(jq -n \
        --arg route_id "${ROUTE_ID:-}" \
        --arg agent "${SUGGESTED_AGENT:-}" \
        --arg route_kind "${ROUTE_KIND:-}" \
        --arg guidance_action "${GUIDANCE_ACTION:-}" \
        --arg routing_reason "${ROUTING_REASON:-}" \
        --arg intake_mode "$ACTIVE_INTAKE_MODE" \
        --arg intake_reason "${INTAKE_REASON:-}" \
        --arg routing_source "$ROUTING_SOURCE" \
        --arg auto_delegation_mode "${AUTO_DELEGATION_MODE:-disabled}" \
        --arg msg_preview "${USER_MESSAGE:0:200}" \
        --argjson complexity "${COMPLEXITY:-0}" \
        --argjson routing_confidence "${ROUTING_CONFIDENCE:-0}" \
        --argjson transcript_noise_score "${TRANSCRIPT_NOISE_SCORE:-0}" \
        --argjson requires_specialist "$REQUIRES_SPECIALIST" \
        --argjson prompt_guidance_only "$PROMPT_GUIDANCE_ONLY" \
        --argjson prompt_blocked "$PROMPT_BLOCKED" \
        --argjson execution_block_until_cleared "$EXECUTION_BLOCK_UNTIL_CLEARED" \
        --argjson route_pending_clearance "$ROUTE_PENDING_CLEARANCE" \
        --argjson route_cleared "$ROUTE_CLEARED" \
        --argjson legacy_prompt_block_requested "$PROMPT_BLOCK_REQUESTED" \
        --argjson legacy_prompt_block_suppressed "$PROMPT_BLOCK_SUPPRESSED" \
        --argjson continue_intent "$CONTINUE_INTENT" \
        --argjson adaptive_fallback_applied "$ADAPTIVE_FALLBACK_APPLIED" \
        --argjson fallback_used "$FALLBACK_USED" \
        --argjson auto_delegation_eligible "$AUTO_DELEGATION_ELIGIBLE" \
        --argjson intake_eligible "$INTAKE_ELIGIBLE" \
        --argjson intake_required "$INTAKE_REQUIRED" \
        --argjson intake_project_signal "${INTAKE_PROJECT_SIGNAL:-0}" \
        --argjson intake_completeness_score "${INTAKE_COMPLETENESS_SCORE:-1}" \
        --argjson duration_ms "$DURATION_MS" \
        '{
            type: "routing_decision",
            input: {
                messagePreview: $msg_preview
            },
            output: {
                suggestedAgent: (if $agent != "" then $agent else null end),
                requiredAgent: (if $requires_specialist and $agent != "" then $agent else null end),
                routeKind: (if $route_kind != "" then $route_kind else null end),
                guidanceAction: (if $guidance_action != "" then $guidance_action else null end),
                routingReason: (if $routing_reason != "" then $routing_reason else null end),
                requiresSpecialist: $requires_specialist,
                promptGuidanceOnly: $prompt_guidance_only,
                promptBlocked: $prompt_blocked,
                executionBlockUntilCleared: $execution_block_until_cleared,
                routePendingClearance: $route_pending_clearance,
                routeCleared: $route_cleared,
                legacyPromptBlockRequested: $legacy_prompt_block_requested,
                legacyPromptBlockSuppressed: $legacy_prompt_block_suppressed,
                autoDelegationEligible: $auto_delegation_eligible,
                autoDelegationMode: $auto_delegation_mode
            },
            metrics: {
                complexity: $complexity,
                confidence: $routing_confidence,
                transcriptNoiseScore: $transcript_noise_score,
                intakeProjectSignal: $intake_project_signal,
                intakeCompletenessScore: $intake_completeness_score,
                durationMs: $duration_ms
            },
            routingSource: $routing_source,
            routeId: (if $route_id != "" then $route_id else null end),
            fallbackUsed: $fallback_used,
            continueIntent: $continue_intent,
            adaptiveFallbackApplied: $adaptive_fallback_applied,
            routeKind: (if $route_kind != "" then $route_kind else null end),
            guidanceAction: (if $guidance_action != "" then $guidance_action else null end),
            requiresSpecialist: $requires_specialist,
            executionBlockUntilCleared: $execution_block_until_cleared,
            routePendingClearance: $route_pending_clearance,
            routeCleared: $route_cleared,
            promptGuidanceOnly: $prompt_guidance_only,
            promptBlocked: $prompt_blocked,
            autoDelegationEligible: $auto_delegation_eligible,
            autoDelegationMode: $auto_delegation_mode,
            legacyPromptBlockRequested: $legacy_prompt_block_requested,
            legacyPromptBlockSuppressed: $legacy_prompt_block_suppressed,
            intakeMode: $intake_mode,
            intakeReason: (if $intake_reason != "" then $intake_reason else null end),
            intakeEligible: $intake_eligible,
            intakeRequired: $intake_required,
            autoRouted: ($agent != "")
        }' 2>/dev/null || echo '{}')

    (node "$ROUTING_METRICS_SCRIPT" log "$METRICS_EVENT" >/dev/null 2>&1 &)
fi

# =============================================================================
# BUILD CONTEXT INJECTION MESSAGE
# =============================================================================

CONTEXT_MESSAGE=""
AUTO_DELEGATION_CONTEXT=""

if [[ "$AUTO_DELEGATION_ELIGIBLE" == "true" ]] && [[ -n "$SUGGESTED_AGENT" ]]; then
    AUTO_DELEGATION_CONTEXT="AUTO-DELEGATION BRIDGE: Mandatory specialist handoff is staged for '$SUGGESTED_AGENT'. If the next internal step uses the Agent tool with any non-approved helper or placeholder, runtime validation will rewrite it to this required specialist automatically until route clearance is recorded."
fi

# CRITICAL: All agent names must be fully-qualified (plugin-name:agent-name)
# Short names like 'sfdc-territory-discovery' will fail with "Agent not found"

if [[ -n "$GUARDRAIL_ALERT" ]] && [[ "$IS_MANDATORY" == "true" ]]; then
    CONTEXT_MESSAGE="ROUTING GUARDRAIL ALERT: Mandatory specialist routing matched a stale semver-prefixed agent alias ('$GUARDRAIL_LEAKED_AGENT').
Re-run routing with a valid fully-qualified specialist agent from the current registry before any direct operational execution."

elif [[ -n "$GUARDRAIL_ALERT" ]]; then
    CONTEXT_MESSAGE="ROUTING GUARDRAIL ALERT: '$GUARDRAIL_LEAKED_AGENT' was blocked because it looks like a stale semver-prefixed plugin alias.
Do not use this agent name. Re-run routing or resolve a valid fully-qualified agent from current plugin registry."

elif [[ "$IS_MANDATORY" == "true" ]] && [[ "$OVERRIDE_APPLIED" == "true" ]]; then
    CONTEXT_MESSAGE="ROUTING OVERRIDE APPLIED: Mandatory specialist routing matched this request, but override token '$ROUTING_OVERRIDE_TOKEN' was detected.
Required specialist: Agent(subagent_type='$SUGGESTED_AGENT', prompt=<original request>).
Prompt submission continues and execution-time specialist enforcement is bypassed for this request only. Treat this as an audited exception."

elif [[ "$IS_MANDATORY" == "true" ]]; then
    CONTEXT_MESSAGE="MANDATORY SPECIALIST ROUTE: This request requires Agent(subagent_type='$SUGGESTED_AGENT', prompt=<original request>).
Do not continue direct operational execution in the parent path.
CRITICAL: Use the EXACT fully-qualified agent name shown above. Short names will fail.
${AUTO_DELEGATION_CONTEXT}
Prompt submission continues; execution-time validators remain active until the specialist route is cleared."

elif [[ "$ACTION_TYPE" == "INTAKE_REQUIRED" ]] && [[ "$OVERRIDE_APPLIED" == "true" ]]; then
    CONTEXT_MESSAGE="ROUTING OVERRIDE APPLIED: Request looks project-level and under-specified.
Recommended specialist: Agent(subagent_type='opspal-core:intelligent-intake-orchestrator', prompt=<original request>).
Override token detected; execution-time specialist enforcement is bypassed for this request only."

elif [[ "$ACTION_TYPE" == "INTAKE_REQUIRED" ]]; then
    CONTEXT_MESSAGE="ROUTING REQUIRED: Request appears project-level but under-specified.
Start with Agent(subagent_type='opspal-core:intelligent-intake-orchestrator', prompt=<original request>) to gather specifics and produce a structured plan.
Reason: project_signal=$INTAKE_PROJECT_SIGNAL, completeness=$INTAKE_COMPLETENESS_SCORE (< $ACTIVE_INTAKE_COMPLETENESS_MAX).
Prompt submission continues; execution-time validators gate direct operational work until this specialist route is cleared or explicitly bypassed."

elif [[ "$ACTION_TYPE" == "BLOCKED" ]] && [[ "$ADAPTIVE_FALLBACK_APPLIED" == "true" ]]; then
    CONTEXT_MESSAGE="ROUTING ADAPTIVE FALLBACK: High-complexity signal detected (${COMPLEXITY_PCT}%), but this prompt appears to be continuation/noisy context.
Recommended specialist: Agent(subagent_type='$SUGGESTED_AGENT', prompt=<original request>).
Prompt submission continues without user-visible blocking for this turn, but execution-time specialist enforcement remains active."

elif [[ "$ACTION_TYPE" == "BLOCKED" ]] && [[ "$OVERRIDE_APPLIED" == "true" ]]; then
    CONTEXT_MESSAGE="ROUTING OVERRIDE APPLIED: High-complexity task (${COMPLEXITY_PCT}%) matched specialist routing, but override token '$ROUTING_OVERRIDE_TOKEN' was detected.
Recommended specialist: Agent(subagent_type='$SUGGESTED_AGENT', prompt=<original request>).
Prompt submission continues and execution-time specialist enforcement is bypassed for this request only. Treat this as an audited exception."

elif [[ "$ACTION_TYPE" == "BLOCKED" ]]; then
    CONTEXT_MESSAGE="ROUTING REQUIRED: High complexity (${COMPLEXITY_PCT}%). You MUST use Agent(subagent_type='$SUGGESTED_AGENT', prompt=<original request>).
Do NOT execute this directly - route through the specialist agent.
CRITICAL: Use the EXACT agent name shown above (fully-qualified with plugin prefix).
Prompt submission continues; execution-time validators remain active until the specialist clears the route.
If bypass is intentional, add '$ROUTING_OVERRIDE_TOKEN' to the prompt."

elif [[ "$ACTION_TYPE" == "RECOMMENDED" ]]; then
    if [[ "$SUGGESTED_AGENT" == "opspal-core:intelligent-intake-orchestrator" ]] && [[ "$INTAKE_GATE_APPLIED" == "true" ]]; then
        CONTEXT_MESSAGE="This looks like a project-level request with missing implementation specifics.
Start with Agent(subagent_type='opspal-core:intelligent-intake-orchestrator', prompt=<original request>) to run intake questions and generate a structured plan.
Signal: project_signal=$INTAKE_PROJECT_SIGNAL, completeness=$INTAKE_COMPLETENESS_SCORE.
This is prompt-time guidance only; direct execution is not blocked by routing state for this advisory route."
    else
        CONTEXT_MESSAGE="ROUTING: Use Agent(subagent_type='$SUGGESTED_AGENT', prompt=<original request>) for this task. Complexity: ${COMPLEXITY_PCT}%.
REMINDER: Use the EXACT fully-qualified agent name shown above.
This is prompt-time guidance only; direct execution is not blocked by routing state for this advisory route."
    fi
fi

# =============================================================================
# OUTPUT JSON RESPONSE
# =============================================================================

# Only inject context for routing and guidance actions
if [[ -n "$CONTEXT_MESSAGE" ]]; then
    DECISION_VALUE=""
    DECISION_REASON=""

    jq -n \
        --arg context "$CONTEXT_MESSAGE" \
        --arg agent "${SUGGESTED_AGENT:-}" \
        --arg route_kind "${ROUTE_KIND:-}" \
        --arg guidance_action "${GUIDANCE_ACTION:-}" \
        --arg guardrail_alert "${GUARDRAIL_ALERT:-}" \
        --arg route_id "${ROUTE_ID:-}" \
        --arg routing_reason "${ROUTING_REASON:-}" \
        --arg block_override_reason "${BLOCK_OVERRIDE_REASON:-}" \
        --arg intake_mode "$ACTIVE_INTAKE_MODE" \
        --arg intake_reason "${INTAKE_REASON:-}" \
        --arg decision "$DECISION_VALUE" \
        --arg decision_reason "$DECISION_REASON" \
        --arg routing_source "$ROUTING_SOURCE" \
        --arg auto_delegation_mode "${AUTO_DELEGATION_MODE:-disabled}" \
        --argjson complexity "${COMPLEXITY:-0}" \
        --argjson routing_confidence "${ROUTING_CONFIDENCE:-0}" \
        --argjson transcript_noise_score "${TRANSCRIPT_NOISE_SCORE:-0}" \
        --argjson requires_specialist "$REQUIRES_SPECIALIST" \
        --argjson prompt_guidance_only "$PROMPT_GUIDANCE_ONLY" \
        --argjson prompt_blocked "$PROMPT_BLOCKED" \
        --argjson execution_block_until_cleared "$EXECUTION_BLOCK_UNTIL_CLEARED" \
        --argjson route_pending_clearance "$ROUTE_PENDING_CLEARANCE" \
        --argjson route_cleared "$ROUTE_CLEARED" \
        --argjson legacy_prompt_block_requested "$PROMPT_BLOCK_REQUESTED" \
        --argjson legacy_prompt_block_suppressed "$PROMPT_BLOCK_SUPPRESSED" \
        --argjson override_applied "$OVERRIDE_APPLIED" \
        --argjson continue_intent "$CONTINUE_INTENT" \
        --argjson adaptive_fallback_applied "$ADAPTIVE_FALLBACK_APPLIED" \
        --argjson fallback_used "$FALLBACK_USED" \
        --argjson auto_delegation_eligible "$AUTO_DELEGATION_ELIGIBLE" \
        --argjson procedural_request "$PROCEDURAL_REQUEST" \
        --argjson intake_eligible "$INTAKE_ELIGIBLE" \
        --argjson intake_required "$INTAKE_REQUIRED" \
        --argjson intake_gate_applied "$INTAKE_GATE_APPLIED" \
        --argjson intake_project_signal "${INTAKE_PROJECT_SIGNAL:-0}" \
        --argjson intake_completeness_score "${INTAKE_COMPLETENESS_SCORE:-1}" \
        --arg normalized_message_preview "${USER_MESSAGE:0:100}" \
        '{
            suppressOutput: true,
            hookSpecificOutput: {
                hookEventName: "UserPromptSubmit",
                additionalContext: $context
            },
            metadata: {
                suggestedAgent: (if $agent != "" then $agent else null end),
                requiredAgent: (if $requires_specialist and $agent != "" then $agent else null end),
                routeId: (if $route_id != "" then $route_id else null end),
                routeKind: (if $route_kind != "" then $route_kind else null end),
                guidanceAction: (if $guidance_action != "" then $guidance_action else null end),
                guardrailAlert: (if $guardrail_alert != "" then $guardrail_alert else null end),
                routingReason: (if $routing_reason != "" then $routing_reason else null end),
                blockOverrideReason: (if $block_override_reason != "" then $block_override_reason else null end),
                complexity: $complexity,
                routingConfidence: $routing_confidence,
                transcriptNoiseScore: $transcript_noise_score,
                requiresSpecialist: $requires_specialist,
                promptGuidanceOnly: $prompt_guidance_only,
                promptBlocked: $prompt_blocked,
                executionBlockUntilCleared: $execution_block_until_cleared,
                routePendingClearance: $route_pending_clearance,
                routeCleared: $route_cleared,
                legacyPromptBlockRequested: $legacy_prompt_block_requested,
                legacyPromptBlockSuppressed: $legacy_prompt_block_suppressed,
                overrideApplied: $override_applied,
                continueIntent: $continue_intent,
                adaptiveFallbackApplied: $adaptive_fallback_applied,
                fallbackUsed: $fallback_used,
                autoDelegationEligible: $auto_delegation_eligible,
                autoDelegationMode: $auto_delegation_mode,
                proceduralRequest: $procedural_request,
                intakeMode: $intake_mode,
                intakeReason: (if $intake_reason != "" then $intake_reason else null end),
                intakeEligible: $intake_eligible,
                intakeRequired: $intake_required,
                intakeGateApplied: $intake_gate_applied,
                projectSignal: $intake_project_signal,
                completenessScore: $intake_completeness_score,
                routingSource: $routing_source,
                normalizedMessagePreview: $normalized_message_preview
            }
        }
        + (if $decision != "" then { decision: $decision } else {} end)
        + (if $decision_reason != "" then { reason: $decision_reason } else {} end)'
else
    echo '{}'
fi

# =============================================================================
# EXIT CODE
# =============================================================================

# UserPromptSubmit routing is guidance-only. Specialist enforcement happens via
# persisted routing state plus downstream Agent/PreToolUse validation.
exit 0
