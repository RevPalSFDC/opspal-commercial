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

emit_pretool_context() {
    local context="$1"
    jq -nc \
      --arg context "$context" \
      '{
        suppressOutput: true,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          additionalContext: $context
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

    # Check for unbalanced brackets
    OPEN_BRACKETS=$(echo "$EXPR" | tr -cd '[' | wc -c)
    CLOSE_BRACKETS=$(echo "$EXPR" | tr -cd ']' | wc -c)
    if [ "$OPEN_BRACKETS" -ne "$CLOSE_BRACKETS" ]; then
        ISSUES+=("jq expression has unbalanced brackets: $OPEN_BRACKETS [ vs $CLOSE_BRACKETS ]")
    fi

    # Check for unbalanced braces
    OPEN_BRACES=$(echo "$EXPR" | tr -cd '{' | wc -c)
    CLOSE_BRACES=$(echo "$EXPR" | tr -cd '}' | wc -c)
    if [ "$OPEN_BRACES" -ne "$CLOSE_BRACES" ]; then
        ISSUES+=("jq expression has unbalanced braces: $OPEN_BRACES { vs $CLOSE_BRACES }")
    fi

    # Check for unbalanced parentheses
    OPEN_PARENS=$(echo "$EXPR" | tr -cd '(' | wc -c)
    CLOSE_PARENS=$(echo "$EXPR" | tr -cd ')' | wc -c)
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
