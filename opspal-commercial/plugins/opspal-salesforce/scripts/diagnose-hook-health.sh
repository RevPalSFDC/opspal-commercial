#!/bin/bash

#
# UserPromptSubmit Hook Health Diagnostic
#
# Quick diagnostic tool for end users to check if their UserPromptSubmit hooks
# are working correctly. This script checks:
# - Hook file presence and permissions
# - Basic execution capability
# - Common failure scenarios
# - Required dependencies
#
# Usage:
#   bash diagnose-hook-health.sh              # Run all checks
#   bash diagnose-hook-health.sh --quick      # Quick check only
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
QUICK_MODE=0
if [ "${1:-}" = "--quick" ]; then
  QUICK_MODE=1
fi

# Get script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"

echo "================================================"
echo "UserPromptSubmit Hook Health Diagnostic"
echo "================================================"
echo ""
echo "Plugin: $(basename "$PLUGIN_ROOT")"
echo "Location: $PLUGIN_ROOT"
echo ""

# Check 1: Find UserPromptSubmit hooks
echo -e "${BLUE}[1/6]${NC} Searching for UserPromptSubmit hooks..."

HOOKS_DIR="$PLUGIN_ROOT/hooks"
USER_PROMPT_HOOKS=()

if [ -d "$HOOKS_DIR" ]; then
  while IFS= read -r hook; do
    if [ -f "$hook" ]; then
      USER_PROMPT_HOOKS+=("$hook")
    fi
  done < <(find "$HOOKS_DIR" -type f -name "*user-prompt*.sh" 2>/dev/null)
fi

if [ ${#USER_PROMPT_HOOKS[@]} -eq 0 ]; then
  echo -e "${YELLOW}⚠ No UserPromptSubmit hooks found${NC}"
  echo "  Expected location: $HOOKS_DIR/*user-prompt*.sh"
  echo ""
  echo "This plugin may not have UserPromptSubmit hooks configured."
  exit 0
else
  echo -e "${GREEN}✓ Found ${#USER_PROMPT_HOOKS[@]} hook(s)${NC}"
  for hook in "${USER_PROMPT_HOOKS[@]}"; do
    echo "  - $(basename "$hook")"
  done
fi
echo ""

# Check 2: Permissions
echo -e "${BLUE}[2/6]${NC} Checking permissions..."

ALL_EXECUTABLE=1
for hook in "${USER_PROMPT_HOOKS[@]}"; do
  if [ ! -x "$hook" ]; then
    echo -e "${RED}✗ Not executable: $(basename "$hook")${NC}"
    echo "  Fix: chmod +x $hook"
    ALL_EXECUTABLE=0
  fi
done

if [ "$ALL_EXECUTABLE" = "1" ]; then
  echo -e "${GREEN}✓ All hooks are executable${NC}"
fi
echo ""

# Check 3: Syntax validation
echo -e "${BLUE}[3/6]${NC} Validating syntax..."

ALL_VALID=1
for hook in "${USER_PROMPT_HOOKS[@]}"; do
  if ! bash -n "$hook" 2>/dev/null; then
    echo -e "${RED}✗ Syntax error: $(basename "$hook")${NC}"
    bash -n "$hook" 2>&1 | head -5 | sed 's/^/  /'
    ALL_VALID=0
  fi
done

if [ "$ALL_VALID" = "1" ]; then
  echo -e "${GREEN}✓ All hooks have valid syntax${NC}"
fi
echo ""

# Check 4: Dependencies
echo -e "${BLUE}[4/6]${NC} Checking dependencies..."

MISSING_DEPS=()

for hook in "${USER_PROMPT_HOOKS[@]}"; do
  # Check for jq
  if grep -q "jq" "$hook" && ! command -v jq &> /dev/null; then
    MISSING_DEPS+=("jq")
  fi

  # Check for node
  if grep -q "node" "$hook" && ! command -v node &> /dev/null; then
    MISSING_DEPS+=("node")
  fi

  # Check for bc
  if grep -q "bc" "$hook" && ! command -v bc &> /dev/null; then
    MISSING_DEPS+=("bc")
  fi
done

# Remove duplicates
MISSING_DEPS=($(echo "${MISSING_DEPS[@]}" | tr ' ' '\n' | sort -u | tr '\n' ' '))

if [ ${#MISSING_DEPS[@]} -eq 0 ]; then
  echo -e "${GREEN}✓ All required dependencies are installed${NC}"
else
  echo -e "${YELLOW}⚠ Missing dependencies: ${MISSING_DEPS[*]}${NC}"
  echo ""
  echo "Installation commands:"
  for dep in "${MISSING_DEPS[@]}"; do
    case "$dep" in
      jq)
        echo "  macOS: brew install jq"
        echo "  Linux: sudo apt-get install jq"
        ;;
      node)
        echo "  Install Node.js from: https://nodejs.org/"
        ;;
      bc)
        echo "  macOS: (pre-installed)"
        echo "  Linux: sudo apt-get install bc"
        ;;
    esac
  done
fi
echo ""

# Check 5: Quick execution test
echo -e "${BLUE}[5/6]${NC} Testing hook execution..."

if [ "$QUICK_MODE" = "0" ]; then
  TEST_JSON='{"user_message":"test message","cwd":"'"$(pwd)"'","hook_event_name":"UserPromptSubmit"}'

  ALL_EXECUTED=1
  for hook in "${USER_PROMPT_HOOKS[@]}"; do
    HOOK_NAME=$(basename "$hook")

    # Run with 3-second timeout
    if timeout 3s bash "$hook" < <(echo "$TEST_JSON") > /dev/null 2>&1; then
      echo -e "${GREEN}✓ Executed successfully: $HOOK_NAME${NC}"
    else
      EXIT_CODE=$?
      if [ "$EXIT_CODE" = "124" ]; then
        echo -e "${YELLOW}⚠ Timeout (3s): $HOOK_NAME${NC}"
        echo "  Hook may be slow or hanging"
      else
        echo -e "${RED}✗ Failed (exit $EXIT_CODE): $HOOK_NAME${NC}"
        ALL_EXECUTED=0
      fi
    fi
  done

  if [ "$ALL_EXECUTED" = "0" ]; then
    echo ""
    echo "Some hooks failed execution. Run with --debug for details:"
    echo "  bash $0 --debug"
  fi
else
  echo "Skipped (use without --quick for full test)"
fi
echo ""

# Check 6: Environment variables
echo -e "${BLUE}[6/6]${NC} Checking environment..."

# Check for common environment variables that might affect hooks
ENV_VARS=(
  "CLAUDE_PROJECT_DIR"
  "CLAUDE_PLUGIN_ROOT"
  "ENABLE_AUTO_ROUTING"
  "ENABLE_SUBAGENT_BOOST"
  "CLAUDE_DEBUG"
)

VARS_SET=0
for var in "${ENV_VARS[@]}"; do
  if [ -n "${!var:-}" ]; then
    echo "  ✓ $var=${!var}"
    ((VARS_SET++))
  fi
done

if [ "$VARS_SET" -eq 0 ]; then
  echo "  No relevant environment variables set (this is OK)"
else
  echo ""
  echo "  ${VARS_SET} environment variable(s) configured"
fi
echo ""

# Summary
echo "================================================"
echo "Diagnostic Summary"
echo "================================================"
echo ""

if [ ${#USER_PROMPT_HOOKS[@]} -eq 0 ]; then
  echo -e "${YELLOW}Status: No hooks to test${NC}"
elif [ "$ALL_EXECUTABLE" = "0" ] || [ "$ALL_VALID" = "0" ]; then
  echo -e "${RED}Status: Issues found - review output above${NC}"
  echo ""
  echo "Common fixes:"
  echo "  1. Make hooks executable: chmod +x $HOOKS_DIR/*.sh"
  echo "  2. Fix syntax errors (check bash -n output)"
  echo "  3. Install missing dependencies"
elif [ ${#MISSING_DEPS[@]} -gt 0 ]; then
  echo -e "${YELLOW}Status: Functional but missing dependencies${NC}"
  echo ""
  echo "Hooks will work for basic operations but may fail for advanced features."
else
  echo -e "${GREEN}Status: All checks passed!${NC}"
  echo ""
  echo "Your UserPromptSubmit hooks appear to be working correctly."
fi
echo ""

# Additional resources
echo "================================================"
echo "Additional Resources"
echo "================================================"
echo ""
echo "For detailed testing:"
echo "  Run: bash $(dirname "$PLUGIN_ROOT")/$(basename "$PLUGIN_ROOT")/../../test-userprompt-hooks.sh --verbose"
echo ""
echo "To enable debug logging:"
echo "  export CLAUDE_DEBUG=1"
echo ""
echo "To check if hooks are being called by Claude Code:"
echo "  1. Add 'echo \"Hook called: \$(date)\" >&2' to top of hook"
echo "  2. Run a command in Claude Code"
echo "  3. Check if message appears in stderr"
echo ""
