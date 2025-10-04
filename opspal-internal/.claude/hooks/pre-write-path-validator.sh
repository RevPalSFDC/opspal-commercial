#!/bin/bash

##
# Pre-Write Path Validator Hook
#
# Validates that write operations target correct domain-specific paths
# before file creation. Prevents wrong directory placement errors.
#
# INPUTS (environment variables):
#   TARGET_PATH - The path where files will be written
#   TASK_DOMAIN - (optional) The detected task domain
#   TASK_DESCRIPTION - (optional) For domain detection if TASK_DOMAIN not set
#
# OUTPUTS:
#   exit 0 - Path is valid for domain
#   exit 1 - Path is invalid, error message printed to stderr
#
# USAGE:
#   Called automatically before write operations via Claude Code hooks
##

set -e

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if TARGET_PATH is set
if [[ -z "$TARGET_PATH" ]]; then
  echo -e "${YELLOW}⚠️  WARNING: TARGET_PATH not set, skipping path validation${NC}" >&2
  exit 0
fi

# Find configuration files
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PATH_CONFIG="$PROJECT_ROOT/.claude/domain-path-requirements.json"
DETECTOR_SCRIPT="$PROJECT_ROOT/SFDC/scripts/lib/task-domain-detector.js"

if [[ ! -f "$PATH_CONFIG" ]]; then
  echo -e "${YELLOW}⚠️  WARNING: domain-path-requirements.json not found, skipping validation${NC}" >&2
  exit 0
fi

# Detect domain if not provided
if [[ -z "$TASK_DOMAIN" ]]; then
  if [[ -n "$TASK_DESCRIPTION" ]] && [[ -f "$DETECTOR_SCRIPT" ]]; then
    DETECTION_RESULT=$(node "$DETECTOR_SCRIPT" "$TASK_DESCRIPTION" 2>/dev/null) || {
      echo -e "${YELLOW}⚠️  WARNING: Could not detect task domain, skipping path validation${NC}" >&2
      exit 0
    }
    TASK_DOMAIN=$(echo "$DETECTION_RESULT" | jq -r '.domain')
  else
    echo -e "${YELLOW}⚠️  WARNING: TASK_DOMAIN not set and cannot detect, skipping validation${NC}" >&2
    exit 0
  fi
fi

# Skip validation for ambiguous domains
if [[ "$TASK_DOMAIN" == "AMBIGUOUS" ]]; then
  exit 0
fi

# Get required base path for domain
REQUIRED_BASE=$(jq -r ".domains.${TASK_DOMAIN}.base_path // empty" "$PATH_CONFIG" 2>/dev/null)

if [[ -z "$REQUIRED_BASE" ]]; then
  echo -e "${YELLOW}⚠️  WARNING: No path requirements defined for domain '$TASK_DOMAIN'${NC}" >&2
  exit 0
fi

# Normalize paths for comparison
NORMALIZED_TARGET=$(echo "$TARGET_PATH" | sed 's|^./||' | sed 's|/$||')
NORMALIZED_BASE=$(echo "$REQUIRED_BASE" | sed 's/{org}/[^/]*/' | sed 's|/$||')

# Check if target path matches required base pattern
if echo "$NORMALIZED_TARGET" | grep -qE "^$NORMALIZED_BASE"; then
  echo -e "${GREEN}✅ Path validation passed:${NC} '$TARGET_PATH' matches domain '$TASK_DOMAIN' requirements" >&2
  exit 0
fi

# Path doesn't match - generate error and suggestion
EXAMPLES=$(jq -r ".domains.${TASK_DOMAIN}.examples.valid_paths[]" "$PATH_CONFIG" 2>/dev/null | head -3)

# Try to generate suggested path
SUGGESTED_PATH=""
if [[ -n "$EXAMPLES" ]]; then
  # Use first example as template
  FIRST_EXAMPLE=$(echo "$EXAMPLES" | head -1)
  # Extract org name from target path if possible
  if echo "$TARGET_PATH" | grep -q "instances/[^/]*"; then
    ORG_NAME=$(echo "$TARGET_PATH" | sed -n 's|.*instances/\([^/]*\).*|\1|p')
    if [[ -n "$ORG_NAME" ]]; then
      SUGGESTED_PATH=$(echo "$FIRST_EXAMPLE" | sed "s|{org}|$ORG_NAME|")
    fi
  fi
fi

# If we couldn't generate a suggestion, use the required base
if [[ -z "$SUGGESTED_PATH" ]]; then
  SUGGESTED_PATH="$REQUIRED_BASE{project-name}-$(date +%Y-%m-%d)/"
fi

echo -e "${RED}❌ PATH VALIDATION ERROR${NC}" >&2
echo "" >&2
echo -e "${BLUE}Task Domain:${NC} $TASK_DOMAIN" >&2
echo -e "${BLUE}Required Base Path:${NC} $REQUIRED_BASE" >&2
echo -e "${BLUE}Actual Path:${NC} $TARGET_PATH" >&2
echo "" >&2
echo -e "${GREEN}💡 SUGGESTED PATH:${NC}" >&2
echo "  $SUGGESTED_PATH" >&2
echo "" >&2
echo -e "${BLUE}Valid path examples for '$TASK_DOMAIN':${NC}" >&2
if [[ -n "$EXAMPLES" ]]; then
  echo "$EXAMPLES" | sed 's/^/  ✓ /'  >&2
fi
echo "" >&2
echo -e "${YELLOW}📚 REASON:${NC}" >&2
echo "  Consistency in project organization is critical for:" >&2
echo "    - Agent discovery and context loading" >&2
echo "    - Automated tooling and scripts" >&2
echo "    - Team collaboration and handoffs" >&2
echo "    - Historical project tracking" >&2
echo "" >&2

exit 1
