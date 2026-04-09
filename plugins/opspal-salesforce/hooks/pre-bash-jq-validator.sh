#!/usr/bin/env bash
#
# Pre-Bash jq Validator Hook
# Validates jq expressions for syntax errors and incomplete pipes
#
# Triggered: Before bash commands containing 'jq'
# Exit Codes:
#   0 = Continue execution with optional structured guidance
#   1 = Block execution (severe issue)

set -e

if ! command -v jq &>/dev/null; then
    echo "[pre-bash-jq-validator] jq not found, skipping" >&2
    exit 0
fi

# Standalone guard — this hook is invoked by pre-bash-dispatcher.sh via
# run_child_hook() which sets DISPATCHER_CONTEXT=1 and pipes HOOK_INPUT.
# When run standalone (no dispatcher context and stdin is a terminal),
# exit 0 cleanly rather than failing on missing context.
if [[ "${DISPATCHER_CONTEXT:-0}" != "1" ]] && [[ -t 0 ]]; then
  echo "[$(basename "$0")] INFO: standalone invocation — no dispatcher context, skipping" >&2
  exit 0
fi


emit_pretool_context() {
    local context="$1"
    jq -nc \
      --arg context "$context" \
      '{
        suppressOutput: true,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          permissionDecisionReason: $context
        }
      }'
}

# Read input from stdin
INPUT=$(cat)

# Extract the command from tool_input
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // .tool_input // empty' 2>/dev/null)

# If no command or doesn't contain jq, pass through
if [ -z "$COMMAND" ] || ! echo "$COMMAND" | grep -q "jq"; then
    exit 0
fi

ISSUES=()

# Extract jq expressions from the command
# Look for patterns like: jq 'expression', jq "expression", jq -r 'expression', etc.
JQ_EXPRESSIONS=$(echo "$COMMAND" | grep -oP "jq\s+(?:-[a-zA-Z]+\s+)*['\"].*?['\"]" 2>/dev/null || true)

# Check for common jq issues
for EXPR in $JQ_EXPRESSIONS; do
    # Check for incomplete pipe (ends with |)
    if echo "$EXPR" | grep -qE '\|\s*["\047]$'; then
        ISSUES+=("jq expression ends with incomplete pipe (|)")
    fi

    # Strip quoted strings before counting brackets (avoids false positives on chars in strings)
    STRIPPED_EXPR=$(echo "$EXPR" | sed "s/'[^']*'//g; s/\"[^\"]*\"//g")

    # Check for unbalanced brackets
    OPEN_BRACKETS=$(echo "$STRIPPED_EXPR" | tr -cd '[' | wc -c)
    CLOSE_BRACKETS=$(echo "$STRIPPED_EXPR" | tr -cd ']' | wc -c)
    if [ "$OPEN_BRACKETS" -ne "$CLOSE_BRACKETS" ]; then
        ISSUES+=("jq expression has unbalanced brackets: $OPEN_BRACKETS [ vs $CLOSE_BRACKETS ]")
    fi

    # Check for unbalanced braces
    OPEN_BRACES=$(echo "$STRIPPED_EXPR" | tr -cd '{' | wc -c)
    CLOSE_BRACES=$(echo "$STRIPPED_EXPR" | tr -cd '}' | wc -c)
    if [ "$OPEN_BRACES" -ne "$CLOSE_BRACES" ]; then
        ISSUES+=("jq expression has unbalanced braces: $OPEN_BRACES { vs $CLOSE_BRACES }")
    fi

    # Check for unbalanced parentheses
    OPEN_PARENS=$(echo "$STRIPPED_EXPR" | tr -cd '(' | wc -c)
    CLOSE_PARENS=$(echo "$STRIPPED_EXPR" | tr -cd ')' | wc -c)
    if [ "$OPEN_PARENS" -ne "$CLOSE_PARENS" ]; then
        ISSUES+=("jq expression has unbalanced parentheses: $OPEN_PARENS ( vs $CLOSE_PARENS )")
    fi
done

# Check for piped jq without proper handling
if echo "$COMMAND" | grep -qE '\|\s*jq\s+["\047]\s*["\047]'; then
    ISSUES+=("Empty jq expression detected - likely syntax error")
fi

# Check for common mistakes
if echo "$COMMAND" | grep -qE 'jq\s+\.[a-zA-Z]'; then
    # jq .field without quotes - might be intentional but flagging
    :  # Pass through, this is often valid
fi

# If issues found, output warning
if [ ${#ISSUES[@]} -gt 0 ]; then
    WARNING_MSG=$(printf '%s\n' "${ISSUES[@]}")
    emit_pretool_context "[jq Validator] Potential issues detected:\n$WARNING_MSG"
    exit 0
fi

# No issues found
exit 0
