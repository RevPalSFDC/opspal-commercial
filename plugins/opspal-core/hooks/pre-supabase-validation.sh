#!/bin/bash
# Pre-Supabase Validation Hook
# Validates Supabase credentials before operations
#
# Related reflections: db09cc94
# ROI: $2,250/yr
#
# Triggers: PreToolUse for mcp__supabase__* tools

SCRIPT_DIR="$(dirname "$0")"
LIB_DIR="$SCRIPT_DIR/../scripts/lib"

# Get the tool input from stdin
INPUT=$(cat)

# Check if this is a Supabase tool call
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool // empty' 2>/dev/null)

if [[ "$TOOL_NAME" != mcp__supabase__* ]]; then
  echo '{"status": "approve", "message": "Not a Supabase operation"}'
  exit 0
fi

# Validate credentials
if [ -f "$LIB_DIR/supabase-credential-validator.js" ]; then
  # Quick environment check without connection test (faster)
  VALIDATION=$(node "$LIB_DIR/supabase-credential-validator.js" check 2>/dev/null)
  EXIT_CODE=$?

  if [ $EXIT_CODE -ne 0 ]; then
    # Extract missing variables
    MISSING=$(echo "$VALIDATION" | jq -r '.missing[]? // empty' | tr '\n' ', ' | sed 's/,$//')

    if [ -n "$MISSING" ]; then
      echo "{\"status\": \"reject\", \"message\": \"Missing Supabase credentials: $MISSING. Set them in .env or export them.\"}"
      exit 1
    fi

    # Check for warnings
    WARNINGS=$(echo "$VALIDATION" | jq -r '.warnings[]? // empty' | head -1)
    if [ -n "$WARNINGS" ]; then
      echo "{\"status\": \"approve\", \"message\": \"Warning: $WARNINGS\"}"
      exit 0
    fi
  fi
fi

echo '{"status": "approve", "message": "Supabase credentials validated"}'
exit 0
