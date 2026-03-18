#!/bin/bash
#
# Pre-Bash SOQL Validator Hook
# Validates SOQL field names before query execution to prevent INVALID_FIELD errors
#
# Triggered: Before `sf data query` commands
# Exit Codes:
#   0 = Continue execution
#   1 = Block execution (severe issue)
#   2 = Warning, continue

set -e

# Read input from stdin
INPUT=$(cat)

# Extract the command from tool_input
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // .tool_input // empty' 2>/dev/null)

# If no command or not a SOQL query, pass through
if [ -z "$COMMAND" ]; then
    exit 0
fi

# Extract SOQL query from the command
QUERY=""
if [[ "$COMMAND" =~ --query[[:space:]]+[\"\']([^\"\']+)[\"\'] ]]; then
    QUERY="${BASH_REMATCH[1]}"
elif [[ "$COMMAND" =~ --query[[:space:]]+([^[:space:]-]+) ]]; then
    QUERY="${BASH_REMATCH[1]}"
fi

# If no query found, pass through
if [ -z "$QUERY" ]; then
    exit 0
fi

# Known problematic patterns in SOQL
ISSUES=()

# Check for ApiName on FlowVersionView (should be DeveloperName)
if echo "$QUERY" | grep -qi "FlowVersionView" && echo "$QUERY" | grep -q "ApiName"; then
    ISSUES+=("FlowVersionView uses DeveloperName, not ApiName. Auto-correcting...")
fi

# Check for missing --use-tooling-api on Tooling API objects
TOOLING_OBJECTS="FlowDefinitionView|FlowVersionView|ApexClass|ApexTrigger|CustomField|CustomObject|ValidationRule|WorkflowRule"
if echo "$QUERY" | grep -qiE "$TOOLING_OBJECTS" && ! echo "$COMMAND" | grep -q "\-\-use-tooling-api"; then
    ISSUES+=("Query uses Tooling API object but missing --use-tooling-api flag")
fi

# Check for != operator (bash escapes != to \!= which breaks SOQL)
if echo "$QUERY" | grep -qE '[^<>!]!='; then
    ISSUES+=("SOQL uses != operator which bash may escape to \\!=. Use <> instead (SOQL-equivalent and shell-safe). See: agents/shared/soql-cli-escaping-guide.md")
fi

# Check for common field name mistakes
if echo "$QUERY" | grep -q "Owner\.Name" && ! echo "$QUERY" | grep -qi "TYPEOF"; then
    ISSUES+=("Owner.Name may fail on polymorphic lookup - consider using OwnerId instead")
fi

# If issues found, output warning with auto-fix suggestion for != operator
if [ ${#ISSUES[@]} -gt 0 ]; then
    WARNING_MSG=$(printf '%s\n' "${ISSUES[@]}")

    # If the only issue is !=, suggest auto-corrected command
    if echo "$QUERY" | grep -qE '[^<>!]!=' && [ ${#ISSUES[@]} -eq 1 ]; then
        FIXED_QUERY=$(echo "$QUERY" | sed 's/\([^<>!]\)!=/\1<>/g')
        FIXED_COMMAND=$(echo "$COMMAND" | sed "s|$QUERY|$FIXED_QUERY|")
        jq -n \
          --arg message "[SOQL Validator] != operator detected. Auto-replacing with <> (shell-safe equivalent)." \
          --arg suggestion "$FIXED_COMMAND" \
          '{systemMessage: $message, suggestion: $suggestion}'
        exit 0
    fi

    jq -n --arg message "[SOQL Validator] Potential issues detected:\n$WARNING_MSG" \
      '{systemMessage: $message}'
    # Exit 0 to allow execution (let auto-correction handle it)
    exit 0
fi

# No issues found
exit 0
