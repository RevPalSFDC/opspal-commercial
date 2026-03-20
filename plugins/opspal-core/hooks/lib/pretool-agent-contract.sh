#!/bin/bash
#
# Shared helpers for Agent PreToolUse hooks.
#

PRETOOL_AGENT_CONTRACT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRETOOL_AGENT_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$PRETOOL_AGENT_CONTRACT_DIR/../.." && pwd)}"
PRETOOL_AGENT_NORMALIZER="${PRETOOL_AGENT_PLUGIN_ROOT}/scripts/lib/hook-event-normalizer.js"

normalize_pretool_agent_event() {
    local raw_input="${1:-}"
    local normalized='{}'

    PRETOOL_RAW_HOOK_INPUT="$raw_input"
    PRETOOL_NORMALIZED_INPUT='{}'
    PRETOOL_TOOL_INPUT='{}'
    PRETOOL_TOOL_NAME=''
    PRETOOL_SUBAGENT_TYPE=''
    PRETOOL_PROMPT=''

    if [ -z "$raw_input" ]; then
        return 0
    fi

    if command -v node >/dev/null 2>&1 && [ -f "$PRETOOL_AGENT_NORMALIZER" ]; then
        normalized=$(printf '%s' "$raw_input" | node "$PRETOOL_AGENT_NORMALIZER" 2>/dev/null || echo '{}')
    elif command -v jq >/dev/null 2>&1 && printf '%s' "$raw_input" | jq -e . >/dev/null 2>&1; then
        normalized=$(printf '%s' "$raw_input" | jq -c '
          if (.tool_name // "") == "Agent" then
            .
          elif ((.subagent_type // "") != "" or (.prompt // .description // .task // .message // "") != "") then
            {
              hook_event_name: "PreToolUse",
              tool_name: "Agent",
              tool_input: {
                subagent_type: (.subagent_type // .agent_type // .agent // ""),
                prompt: (.prompt // .description // .task // .message // "")
              }
            }
          else
            {}
          end
        ' 2>/dev/null || echo '{}')
    fi

    if ! command -v jq >/dev/null 2>&1; then
        PRETOOL_NORMALIZED_INPUT="$normalized"
        return 0
    fi

    if [ -z "$normalized" ] || ! printf '%s' "$normalized" | jq -e . >/dev/null 2>&1; then
        normalized='{}'
    fi

    PRETOOL_NORMALIZED_INPUT="$normalized"
    PRETOOL_TOOL_NAME=$(printf '%s' "$normalized" | jq -r '.tool_name // empty' 2>/dev/null || echo '')
    PRETOOL_TOOL_INPUT=$(printf '%s' "$normalized" | jq -c '.tool_input // {}' 2>/dev/null || echo '{}')
    [ "$PRETOOL_TOOL_INPUT" != "null" ] || PRETOOL_TOOL_INPUT='{}'
    PRETOOL_SUBAGENT_TYPE=$(printf '%s' "$PRETOOL_TOOL_INPUT" | jq -r '.subagent_type // empty' 2>/dev/null || echo '')
    PRETOOL_PROMPT=$(printf '%s' "$PRETOOL_TOOL_INPUT" | jq -r '.prompt // ""' 2>/dev/null || echo '')
}

pretool_agent_event_is_agent() {
    [ "${PRETOOL_TOOL_NAME:-}" = "Agent" ] && [ "${PRETOOL_TOOL_INPUT:-{}}" != "{}" ]
}

emit_pretool_agent_noop() {
    printf '{}\n'
}

emit_pretool_agent_update() {
    local updated_input_json="$1"
    local reason="${2:-Agent hook updated input}"
    local additional_context="${3:-}"
    local code="${4:-AGENT_HOOK_UPDATE}"
    local level="${5:-INFO}"

    if [ -z "$updated_input_json" ] || [ "$updated_input_json" = "null" ]; then
        emit_pretool_agent_noop
        return 0
    fi

    jq -n \
      --arg reason "$reason" \
      --arg context "$additional_context" \
      --arg code "$code" \
      --arg level "$level" \
      --argjson updated "$updated_input_json" \
      '{
        suppressOutput: true,
        hookSpecificOutput: (
          {
            hookEventName: "PreToolUse",
            updatedInput: $updated,
            permissionDecision: "allow"
          }
          + (if $reason != "" then { permissionDecisionReason: $reason } else {} end)
          + (if $context != "" then { additionalContext: $context } else {} end)
        ),
        metadata: {
          agentHook: {
            code: $code,
            level: $level,
            status: "updated"
          }
        }
      }'
}

emit_pretool_agent_deny() {
    local reason="$1"
    local additional_context="${2:-}"
    local code="${3:-AGENT_HOOK_BLOCK}"
    local level="${4:-ERROR}"

    jq -n \
      --arg reason "$reason" \
      --arg context "$additional_context" \
      --arg code "$code" \
      --arg level "$level" \
      '{
        suppressOutput: true,
        hookSpecificOutput: (
          {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: $reason
          }
          + (if $context != "" then { additionalContext: $context } else {} end)
        ),
        metadata: {
          agentHook: {
            code: $code,
            level: $level,
            status: "blocked"
          }
        }
      }'
}

prepend_pretool_agent_prompt() {
    local input_json="$1"
    local marker="$2"
    local prefix="$3"

    printf '%s' "$input_json" | jq -c \
      --arg marker "$marker" \
      --arg prefix "$prefix" \
      'if ((.prompt // "") | contains($marker)) then
         .
       else
         .prompt = ($prefix + (.prompt // ""))
       end' 2>/dev/null || printf '%s' "$input_json"
}
