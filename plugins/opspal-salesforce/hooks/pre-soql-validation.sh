#!/usr/bin/env bash
set -euo pipefail
# Pre-SOQL Validation Hook
if ! command -v jq &>/dev/null; then
    echo "[pre-soql-validation] jq not found, skipping" >&2
    exit 0
fi

# Validates SOQL queries for reserved keyword conflicts and optimization
#
# Related reflections: a8d12f3c
# ROI: $3,000/yr
#
# Triggers: PreToolUse for sf data query commands

SCRIPT_DIR="$(dirname "$0")"
LIB_DIR="$SCRIPT_DIR/../scripts/lib"

# Get the tool input from stdin
INPUT=$(cat)

# Extract SOQL query from common patterns
QUERY=""

# Check for --query flag
if echo "$INPUT" | grep -q '"--query"'; then
  QUERY=$(echo "$INPUT" | grep -oP '(?<="--query",\s*")[^"]+' | head -1)
fi

# Check for -q flag
if [ -z "$QUERY" ] && echo "$INPUT" | grep -q '"-q"'; then
  QUERY=$(echo "$INPUT" | grep -oP '(?<="-q",\s*")[^"]+' | head -1)
fi

# If no query found, allow the operation
if [ -z "$QUERY" ]; then
  echo '{"status": "approve", "message": "No SOQL query detected"}'
  exit 0
fi

# Validate the SOQL query
if [ -f "$LIB_DIR/soql-alias-validator.js" ]; then
  VALIDATION=$(echo "$QUERY" | node "$LIB_DIR/soql-alias-validator.js" validate 2>/dev/null)
  EXIT_CODE=$?

  if [ $EXIT_CODE -ne 0 ]; then
    # Extract issues from validation result
    ISSUES=$(echo "$VALIDATION" | jq -r '.issues[]?.message // empty' 2>/dev/null | head -3 | tr '\n' '; ')

    if [ -n "$ISSUES" ]; then
      # Try to get fixed query
      FIXED_QUERY=$(echo "$QUERY" | node "$LIB_DIR/soql-alias-validator.js" fix 2>/dev/null | jq -r '.fixedQuery // empty')

      if [ -n "$FIXED_QUERY" ] && [ "$FIXED_QUERY" != "$QUERY" ]; then
        echo "{\"status\": \"modify\", \"message\": \"SOQL issues detected: $ISSUES\", \"suggestion\": \"$FIXED_QUERY\"}"
        exit 0
      fi

      echo "{\"status\": \"reject\", \"message\": \"SOQL validation failed: $ISSUES\"}"
      exit 1
    fi
  fi

  # Check for optimization suggestions
  SUGGESTIONS=$(echo "$VALIDATION" | jq -r '.suggestions[]?.message // empty' 2>/dev/null | head -2 | tr '\n' '; ')
  if [ -n "$SUGGESTIONS" ]; then
    echo "{\"status\": \"approve\", \"message\": \"SOQL valid. Suggestions: $SUGGESTIONS\"}"
    exit 0
  fi
fi

echo '{"status": "approve", "message": "SOQL validation passed"}'
exit 0
