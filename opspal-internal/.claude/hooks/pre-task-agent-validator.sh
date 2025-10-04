#!/bin/bash

##
# Pre-Task Agent Validator Hook
#
# Validates that the selected agent matches the task domain requirements
# before agent invocation. Prevents wrong agent selection errors.
#
# INPUTS (environment variables):
#   AGENT_NAME - The agent being invoked
#   TASK_DESCRIPTION - The task description
#
# OUTPUTS:
#   exit 0 - Agent is valid for task domain
#   exit 1 - Agent is invalid, error message printed to stderr
#
# USAGE:
#   Called automatically before agent invocation via Claude Code hooks
##

set -e

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if required environment variables are set
if [[ -z "$AGENT_NAME" ]]; then
  echo -e "${RED}❌ ERROR: AGENT_NAME environment variable not set${NC}" >&2
  exit 1
fi

if [[ -z "$TASK_DESCRIPTION" ]]; then
  echo -e "${YELLOW}⚠️  WARNING: TASK_DESCRIPTION not set, skipping validation${NC}" >&2
  exit 0
fi

# Find the task-domain-detector script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DETECTOR_SCRIPT="$PROJECT_ROOT/SFDC/scripts/lib/task-domain-detector.js"

if [[ ! -f "$DETECTOR_SCRIPT" ]]; then
  echo -e "${YELLOW}⚠️  WARNING: task-domain-detector.js not found, skipping validation${NC}" >&2
  exit 0
fi

# Run domain detection with agent validation
RESULT=$(node "$DETECTOR_SCRIPT" --agent "$AGENT_NAME" --task "$TASK_DESCRIPTION" 2>&1) || {
  EXIT_CODE=$?

  # Parse the JSON result
  if echo "$RESULT" | jq -e . >/dev/null 2>&1; then
    DOMAIN=$(echo "$RESULT" | jq -r '.domain')
    CONFIDENCE=$(echo "$RESULT" | jq -r '.confidence // "unknown"')

    # Check if domain is ambiguous
    if [[ "$DOMAIN" == "AMBIGUOUS" ]]; then
      echo -e "${YELLOW}⚠️  DOMAIN DETECTION UNCLEAR${NC}" >&2
      echo "$RESULT" | jq -r '.message' >&2
      echo "" >&2
      echo -e "${BLUE}💡 Please clarify the task domain or use more specific keywords.${NC}" >&2
      exit 1
    fi

    # Check agent validation
    AGENT_VALID=$(echo "$RESULT" | jq -r '.agent_validation.valid // false')

    if [[ "$AGENT_VALID" == "false" ]]; then
      echo -e "${RED}❌ AGENT ROUTING ERROR${NC}" >&2
      echo "" >&2
      echo -e "${BLUE}Task Domain:${NC} $DOMAIN" >&2
      echo -e "${BLUE}Selected Agent:${NC} $AGENT_NAME" >&2
      echo "" >&2
      echo -e "${RED}Reason:${NC}" >&2
      echo "$RESULT" | jq -r '.agent_validation.reason' | sed 's/^/  /' >&2
      echo "" >&2

      # Show required patterns if available
      REQUIRED_PATTERNS=$(echo "$RESULT" | jq -r '.required_agent_patterns[]? // empty' 2>/dev/null)
      if [[ -n "$REQUIRED_PATTERNS" ]]; then
        echo -e "${BLUE}Required Agent Patterns:${NC}" >&2
        echo "$REQUIRED_PATTERNS" | sed 's/^/  - /' >&2
        echo "" >&2
      fi

      # Show suggested agents
      SUGGESTED=$(echo "$RESULT" | jq -r '.suggested_agents[]? // empty' 2>/dev/null)
      if [[ -n "$SUGGESTED" ]]; then
        echo -e "${GREEN}💡 SUGGESTED AGENTS:${NC}" >&2
        echo "$SUGGESTED" | sed 's/^/  ✓ /' >&2
        echo "" >&2
      fi

      echo -e "${YELLOW}🔧 ACTION REQUIRED:${NC}" >&2
      echo "  Use a specialized agent for this domain instead of '$AGENT_NAME'" >&2
      echo "" >&2

      exit 1
    fi

    # Agent is valid
    echo -e "${GREEN}✅ Agent validation passed:${NC} $AGENT_NAME matches domain '$DOMAIN' requirements" >&2
    exit 0
  else
    # Could not parse JSON, show raw output
    echo -e "${RED}❌ ERROR: Failed to parse domain detection result${NC}" >&2
    echo "$RESULT" >&2
    exit 1
  fi
}

# If we got here with exit code 0, validation passed
DOMAIN=$(echo "$RESULT" | jq -r '.domain')
echo -e "${GREEN}✅ Agent validation passed:${NC} $AGENT_NAME matches domain '$DOMAIN' requirements" >&2
exit 0
