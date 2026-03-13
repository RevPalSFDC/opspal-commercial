#!/usr/bin/env bash

# =============================================================================
# ACE Framework Integration Test Suite
#
# Tests the post-reflection ACE Framework integration across:
# - /reflect command integration
# - /devreflect hook integration
# - Graceful degradation (Supabase offline)
# - Local queue fallback
# - Retry mechanism
#
# Usage:
#   bash test-ace-integration.sh [--verbose]
#
# @version 1.0.0
# =============================================================================

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
VERBOSE="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CROSS_PLATFORM_PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# Repo root is 3 levels up from scripts directory
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
TEST_DIR="$HOME/.claude/test-ace-integration"
TEST_REFLECTION="$TEST_DIR/TEST_REFLECTION_$(date +%Y%m%d_%H%M%S).json"

# Test results
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Logging
log() {
  local level="$1"
  shift
  if [[ "$level" == "ERROR" ]] || [[ "$VERBOSE" == "--verbose" ]]; then
    case "$level" in
      ERROR)   echo -e "${RED}[$level]${NC} $*" >&2 ;;
      WARN)    echo -e "${YELLOW}[$level]${NC} $*" >&2 ;;
      INFO)    echo -e "${BLUE}[$level]${NC} $*" >&2 ;;
      *)       echo -e "[$level] $*" >&2 ;;
    esac
  fi
}

# Test assertions
assert_file_exists() {
  local file="$1"
  local description="$2"

  ((TESTS_RUN++))

  if [[ -f "$file" ]]; then
    echo -e "${GREEN}✓${NC} $description"
    ((TESTS_PASSED++))
    return 0
  else
    echo -e "${RED}✗${NC} $description (file not found: $file)"
    ((TESTS_FAILED++))
    return 1
  fi
}

assert_command_exists() {
  local cmd="$1"
  local description="$2"

  ((TESTS_RUN++))

  if command -v "$cmd" &>/dev/null; then
    echo -e "${GREEN}✓${NC} $description"
    ((TESTS_PASSED++))
    return 0
  else
    echo -e "${RED}✗${NC} $description (command not found: $cmd)"
    ((TESTS_FAILED++))
    return 1
  fi
}

assert_string_in_file() {
  local string="$1"
  local file="$2"
  local description="$3"

  ((TESTS_RUN++))

  if grep -q "$string" "$file" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} $description"
    ((TESTS_PASSED++))
    return 0
  else
    echo -e "${RED}✗${NC} $description (string '$string' not found in $file)"
    ((TESTS_FAILED++))
    return 1
  fi
}

# Setup test environment
setup_test_env() {
  echo ""
  echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  ACE Framework Integration Test Suite${NC}"
  echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
  echo ""

  # Create test directory
  mkdir -p "$TEST_DIR"

  # Create test reflection file
  cat > "$TEST_REFLECTION" <<EOF
{
  "summary": "Test reflection for ACE Framework integration",
  "session_id": "test-$(date +%s)",
  "org": "test-org",
  "focus_area": "cpq assessment",
  "total_issues": 0,
  "priority_issues": 0,
  "session_type": "testing",
  "skills": {
    "skills_used": ["cpq-assessment", "data-validation", "soql-build"]
  },
  "skill_feedback": {
    "cpq-assessment": {"success": true},
    "data-validation": {"success": true},
    "soql-build": {"success": false}
  },
  "outcome": "success",
  "agent": "sfdc-cpq-assessor",
  "plugin_name": "salesforce-plugin",
  "plugin_version": "3.61.0"
}
EOF

  log "INFO" "Test environment created: $TEST_DIR"
  log "INFO" "Test reflection: $TEST_REFLECTION"
}

# Test 1: Verify /reflect command integration
test_reflect_command_integration() {
  echo ""
  echo -e "${YELLOW}Test 1: /reflect Command Integration${NC}"
  echo "────────────────────────────────────────────────────────"

  local reflect_md="$REPO_ROOT/.claude-plugins/opspal-salesforce/commands/reflect.md"

  assert_file_exists "$reflect_md" "reflect.md command file exists"
  assert_string_in_file "Step 3: ACE Framework Skill Tracking" "$reflect_md" "Step 3 section added to /reflect"
  assert_string_in_file "post-reflect-strategy-update.sh" "$reflect_md" "ACE hook script referenced"
  assert_string_in_file "ENABLE_SKILL_TRACKING" "$reflect_md" "Configuration documented"
}

# Test 2: Verify /devreflect hook integration
test_devreflect_hook_integration() {
  echo ""
  echo -e "${YELLOW}Test 2: /devreflect Hook Integration${NC}"
  echo "────────────────────────────────────────────────────────"

  local devreflect_hook="$REPO_ROOT/.claude/hooks/post-devreflect.sh"

  assert_file_exists "$devreflect_hook" "post-devreflect.sh hook exists"
  assert_string_in_file "post-reflect-strategy-update.sh" "$devreflect_hook" "ACE hook script called from devreflect"
}

# Test 3: Verify post-reflect-strategy-update.sh enhancements
test_strategy_update_enhancements() {
  echo ""
  echo -e "${YELLOW}Test 3: Strategy Update Script Enhancements${NC}"
  echo "────────────────────────────────────────────────────────"

  local strategy_script="$CROSS_PLATFORM_PLUGIN_ROOT/hooks/post-reflect-strategy-update.sh"

  assert_file_exists "$strategy_script" "post-reflect-strategy-update.sh exists"
  assert_string_in_file "check_supabase_connectivity" "$strategy_script" "Connectivity check function added"
  assert_string_in_file "save_to_local_queue" "$strategy_script" "Local queue function added"
  assert_string_in_file "skill-execution-queue.jsonl" "$strategy_script" "Queue file path defined"
  assert_string_in_file "supabase_available" "$strategy_script" "Graceful degradation logic implemented"
}

# Test 4: Test graceful degradation (simulate Supabase offline)
test_graceful_degradation() {
  echo ""
  echo -e "${YELLOW}Test 4: Graceful Degradation (Supabase Offline)${NC}"
  echo "────────────────────────────────────────────────────────"

  # Unset Supabase credentials
  local old_url="$SUPABASE_URL"
  local old_key="$SUPABASE_SERVICE_ROLE_KEY"

  export SUPABASE_URL=""
  export SUPABASE_SERVICE_ROLE_KEY=""

  # Run the hook
  log "INFO" "Running hook with Supabase disabled..."

  local queue_file="$HOME/.claude/skill-execution-queue.jsonl"
  rm -f "$queue_file"  # Clean queue before test

  if bash "$CROSS_PLATFORM_PLUGIN_ROOT/hooks/post-reflect-strategy-update.sh" 2>&1 | grep -q "Supabase not configured"; then
    echo -e "${GREEN}✓${NC} Hook detects Supabase unavailable"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} Hook should detect Supabase unavailable"
    ((TESTS_FAILED++))
  fi

  ((TESTS_RUN++))

  # Restore credentials
  export SUPABASE_URL="$old_url"
  export SUPABASE_SERVICE_ROLE_KEY="$old_key"
}

# Test 5: Verify retry mechanism
test_retry_mechanism() {
  echo ""
  echo -e "${YELLOW}Test 5: Retry Mechanism${NC}"
  echo "────────────────────────────────────────────────────────"

  local retry_script="$CROSS_PLATFORM_PLUGIN_ROOT/scripts/lib/retry-skill-queue.js"

  assert_file_exists "$retry_script" "retry-skill-queue.js exists"
  assert_command_exists "node" "Node.js is installed"

  # Test dry-run mode
  log "INFO" "Testing retry script in dry-run mode..."

  # Create a test queue entry
  local queue_file="$HOME/.claude/skill-execution-queue.jsonl"
  mkdir -p "$(dirname "$queue_file")"
  echo '{"skill_id":"test-skill","agent":"test-agent","success":true,"session_id":"test-123","org":"test","timestamp":"2025-01-01T00:00:00Z"}' > "$queue_file"

  if node "$retry_script" --dry-run 2>&1 | grep -q "Would process"; then
    echo -e "${GREEN}✓${NC} Retry script dry-run works"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC} Retry script dry-run failed"
    ((TESTS_FAILED++))
  fi

  ((TESTS_RUN++))

  # Clean up test queue
  rm -f "$queue_file"
}

# Test 6: Verify dependencies
test_dependencies() {
  echo ""
  echo -e "${YELLOW}Test 6: Dependencies${NC}"
  echo "────────────────────────────────────────────────────────"

  assert_command_exists "jq" "jq is installed"
  assert_command_exists "node" "Node.js is installed"
  assert_command_exists "curl" "curl is installed"

  # Check strategy-registry.js exists
  local registry_script="$CROSS_PLATFORM_PLUGIN_ROOT/scripts/lib/strategy-registry.js"
  assert_file_exists "$registry_script" "strategy-registry.js exists"

  # Check ace-execution-recorder.js exists
  local ace_script="$CROSS_PLATFORM_PLUGIN_ROOT/scripts/lib/ace-execution-recorder.js"
  assert_file_exists "$ace_script" "ace-execution-recorder.js exists"
}

# Cleanup
cleanup() {
  echo ""
  echo -e "${BLUE}Cleaning up test environment...${NC}"

  rm -rf "$TEST_DIR"
  rm -f "$HOME/.claude/skill-execution-queue.jsonl"

  log "INFO" "Cleanup complete"
}

# Print summary
print_summary() {
  echo ""
  echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  Test Summary${NC}"
  echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "  Total tests:   $TESTS_RUN"
  echo -e "  ${GREEN}Passed:        $TESTS_PASSED${NC}"
  if [[ $TESTS_FAILED -gt 0 ]]; then
    echo -e "  ${RED}Failed:        $TESTS_FAILED${NC}"
  else
    echo -e "  ${GREEN}Failed:        $TESTS_FAILED${NC}"
  fi
  echo ""

  if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Run /reflect in a real session to test end-to-end"
    echo "  2. Check ~/.claude/logs/debug.log with --debug flag for detailed logs"
    echo "  3. Verify skill executions in Supabase database"
    echo ""
    return 0
  else
    echo -e "${RED}❌ Some tests failed${NC}"
    echo ""
    echo "Please review the failed tests above and fix any issues."
    echo ""
    return 1
  fi
}

# Main
main() {
  setup_test_env

  test_reflect_command_integration
  test_devreflect_hook_integration
  test_strategy_update_enhancements
  test_graceful_degradation
  test_retry_mechanism
  test_dependencies

  cleanup

  print_summary
}

# Run
main "$@"
