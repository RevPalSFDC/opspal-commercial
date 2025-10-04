#!/bin/bash

##
# Pre-Task Context Loader Hook
#
# Automatically loads org context before task execution if org is detected
# in the task description, providing agents with historical context.
#
# INPUTS (environment variables):
#   TASK_DESCRIPTION - The task being executed
#
# OUTPUTS:
#   Exports ORG_CONTEXT environment variable with JSON context
#
# USAGE:
#   Called automatically before task execution via Claude Code hooks
##

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if TASK_DESCRIPTION is set
if [[ -z "$TASK_DESCRIPTION" ]]; then
  exit 0
fi

# Find the org-context-manager script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONTEXT_SCRIPT="$PROJECT_ROOT/SFDC/scripts/lib/org-context-manager.js"

if [[ ! -f "$CONTEXT_SCRIPT" ]]; then
  exit 0
fi

# Extract org alias from task description
# Common patterns: "for hivemq", "hivemq org", "in hivemq", etc.
ORG_ALIAS=""

# Try to extract org name from common patterns
if echo "$TASK_DESCRIPTION" | grep -qiE "\bfor [a-z0-9-]+\b"; then
  ORG_ALIAS=$(echo "$TASK_DESCRIPTION" | grep -oiE "\bfor ([a-z0-9-]+)\b" | head -1 | awk '{print $2}' | tr '[:upper:]' '[:lower:]')
elif echo "$TASK_DESCRIPTION" | grep -qiE "\b[a-z0-9-]+ org\b"; then
  ORG_ALIAS=$(echo "$TASK_DESCRIPTION" | grep -oiE "\b([a-z0-9-]+) org\b" | head -1 | awk '{print $1}' | tr '[:upper:]' '[:lower:]')
elif echo "$TASK_DESCRIPTION" | grep -qiE "\bin [a-z0-9-]+\b"; then
  ORG_ALIAS=$(echo "$TASK_DESCRIPTION" | grep -oiE "\bin ([a-z0-9-]+)\b" | head -1 | awk '{print $2}' | tr '[:upper:]' '[:lower:]')
fi

if [[ -z "$ORG_ALIAS" ]]; then
  # No org detected in task description
  exit 0
fi

# Check if context exists for this org
CONTEXT_FILE="$PROJECT_ROOT/SFDC/instances/$ORG_ALIAS/ORG_CONTEXT.json"

if [[ ! -f "$CONTEXT_FILE" ]]; then
  # No context file exists
  exit 0
fi

# Load context
CONTEXT=$(node "$CONTEXT_SCRIPT" load "$ORG_ALIAS" 2>/dev/null)

if [[ -n "$CONTEXT" ]]; then
  # Export context as environment variable
  export ORG_CONTEXT="$CONTEXT"

  # Extract key info for logging
  ASSESSMENT_COUNT=$(echo "$CONTEXT" | jq -r '.assessments | length' 2>/dev/null || echo "0")

  echo -e "${GREEN}✅ Loaded org context:${NC} $ORG_ALIAS ($ASSESSMENT_COUNT previous assessments)" >&2
fi

exit 0
