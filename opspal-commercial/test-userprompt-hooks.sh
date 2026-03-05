#!/bin/bash

#
# UserPromptSubmit Hook Test Suite
#
# Tests UserPromptSubmit hooks across plugins to ensure they:
# 1. Execute without errors
# 2. Handle JSON input correctly
# 3. Output properly (stdout/stderr)
# 4. Exit with correct codes (0 for success)
# 5. Work in both development and marketplace installations
#
# Usage:
#   ./test-userprompt-hooks.sh              # Test all plugins
#   ./test-userprompt-hooks.sh salesforce   # Test specific plugin
#   ./test-userprompt-hooks.sh --verbose    # Detailed output
#   ./test-userprompt-hooks.sh --debug      # Debug mode with full logs
#

set -euo pipefail

# Configuration
VERBOSE=0
DEBUG=0
TEST_PLUGIN=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
WARNINGS=0

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --verbose|-v)
      VERBOSE=1
      shift
      ;;
    --debug|-d)
      DEBUG=1
      VERBOSE=1
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS] [PLUGIN_NAME]"
      echo ""
      echo "Options:"
      echo "  -v, --verbose    Detailed output"
      echo "  -d, --debug      Debug mode with full logs"
      echo "  -h, --help       Show this help"
      echo ""
      echo "Examples:"
      echo "  $0                       # Test all plugins"
      echo "  $0 salesforce            # Test salesforce-plugin only"
      echo "  $0 cross-platform -v     # Verbose test of opspal-core"
      exit 0
      ;;
    *)
      TEST_PLUGIN="$1"
      shift
      ;;
  esac
done

# Helper functions
log_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
  echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
  ((WARNINGS+=1))
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

log_debug() {
  if [ "$DEBUG" = "1" ]; then
    echo -e "${BLUE}[DEBUG]${NC} $1" >&2
  fi
}

log_verbose() {
  if [ "$VERBOSE" = "1" ]; then
    echo -e "  ${NC}$1"
  fi
}

# Test hook execution
test_hook() {
  local hook_path="$1"
  local hook_name=$(basename "$hook_path")
  local plugin_name=$(basename "$(dirname "$(dirname "$hook_path")")")

  log_info "Testing: ${plugin_name}/${hook_name}"

  # Test 1: File exists and is executable
  ((TOTAL_TESTS+=1))
  if [ ! -f "$hook_path" ]; then
    log_error "Hook file not found: $hook_path"
    ((FAILED_TESTS+=1))
    return 1
  fi
  log_success "File exists"
  ((PASSED_TESTS+=1))

  ((TOTAL_TESTS+=1))
  if [ ! -x "$hook_path" ]; then
    log_error "Hook is not executable. Run: chmod +x $hook_path"
    ((FAILED_TESTS+=1))
    return 1
  fi
  log_success "File is executable"
  ((PASSED_TESTS+=1))

  # Test 2: Hook syntax check
  ((TOTAL_TESTS+=1))
  if bash -n "$hook_path" 2>/dev/null; then
    log_success "Syntax is valid"
    ((PASSED_TESTS+=1))
  else
    log_error "Syntax error in hook"
    bash -n "$hook_path" 2>&1 | sed 's/^/  /' >&2
    ((FAILED_TESTS+=1))
    return 1
  fi

  # Test 3: Run hook with valid JSON input
  local test_json='{"user_message":"Deploy validation rules to production","cwd":"'"$SCRIPT_DIR"'","hook_event_name":"UserPromptSubmit"}'

  log_verbose "Test input: $test_json"

  ((TOTAL_TESTS+=1))
  local output=""
  local exit_code=0
  local stderr_output=""

  # Create temp files for output
  local stdout_file=$(mktemp)
  local stderr_file=$(mktemp)

  log_debug "Executing hook with test input..."

  # Run hook with timeout (5 seconds)
  if timeout 5s bash "$hook_path" < <(echo "$test_json") > "$stdout_file" 2> "$stderr_file"; then
    exit_code=$?
  else
    exit_code=$?
  fi

  output=$(cat "$stdout_file")
  stderr_output=$(cat "$stderr_file")

  log_debug "Exit code: $exit_code"
  log_debug "Stdout length: ${#output}"
  log_debug "Stderr length: ${#stderr_output}"

  if [ "$DEBUG" = "1" ]; then
    echo "=== STDOUT ===" >&2
    cat "$stdout_file" >&2
    echo "=== STDERR ===" >&2
    cat "$stderr_file" >&2
    echo "=== END ===" >&2
  fi

  # Check exit code (hooks can return 0 even if they don't modify the prompt)
  if [ "$exit_code" = "0" ]; then
    log_success "Hook executed successfully (exit code: $exit_code)"
    ((PASSED_TESTS+=1))
  elif [ "$exit_code" = "124" ]; then
    log_error "Hook timed out (exit code: $exit_code)"
    ((FAILED_TESTS+=1))
    rm -f "$stdout_file" "$stderr_file"
    return 1
  else
    log_error "Hook failed with exit code: $exit_code"
    if [ -n "$stderr_output" ]; then
      log_verbose "Error output:"
      echo "$stderr_output" | sed 's/^/    /' >&2
    fi
    ((FAILED_TESTS+=1))
    rm -f "$stdout_file" "$stderr_file"
    return 1
  fi

  # Test 4: Check for common errors in stderr
  ((TOTAL_TESTS+=1))
  if [ -n "$stderr_output" ]; then
    if echo "$stderr_output" | grep -qiE "(error|failed|exception|command not found|invalid|grep:)"; then
      log_warning "Potential errors detected in stderr:"
      echo "$stderr_output" | grep -iE "(error|failed|exception|command not found|invalid|grep:)" | sed 's/^/    /' >&2
      ((FAILED_TESTS+=1))
    elif echo "$stderr_output" | grep -qivE "(debug|info|warning)"; then
      log_warning "Unexpected stderr output detected:"
      echo "$stderr_output" | head -5 | sed 's/^/    /' >&2
      ((FAILED_TESTS+=1))
    else
      log_success "No errors in stderr"
      ((PASSED_TESTS+=1))
    fi
  else
    log_success "No errors in stderr"
    ((PASSED_TESTS+=1))
  fi

  # Test 5: Check if hook modifies the prompt or passes it through
  ((TOTAL_TESTS+=1))
  if [ -n "$output" ]; then
    log_success "Hook produced output (${#output} bytes)"
    ((PASSED_TESTS+=1))

    log_verbose "Output preview:"
    echo "$output" | head -3 | sed 's/^/    /'
  else
    log_warning "Hook produced no output (may be intentional)"
    ((PASSED_TESTS+=1))
  fi

  # Test 6: Check for required dependencies
  ((TOTAL_TESTS+=1))
  local missing_deps=0

  # Check for jq if hook uses it
  if grep -q "jq" "$hook_path"; then
    if ! command -v jq &> /dev/null; then
      log_warning "Hook requires 'jq' but it's not installed"
      log_verbose "Install: brew install jq (macOS) or apt-get install jq (Linux)"
      missing_deps=1
    fi
  fi

  # Check for node if hook uses it
  if grep -q "node" "$hook_path"; then
    if ! command -v node &> /dev/null; then
      log_warning "Hook requires 'node' but it's not installed"
      missing_deps=1
    fi
  fi

  # Check for bc if hook uses it
  if grep -q "bc" "$hook_path"; then
    if ! command -v bc &> /dev/null; then
      log_warning "Hook requires 'bc' but it's not installed"
      missing_deps=1
    fi
  fi

  if [ "$missing_deps" = "0" ]; then
    log_success "All dependencies available"
    ((PASSED_TESTS+=1))
  else
    log_warning "Some dependencies missing"
    ((PASSED_TESTS+=1))
  fi

  # Test 7: Test with various inputs
  log_verbose "Testing with various inputs..."

  local test_cases=(
    '{"user_message":"[DIRECT] simple command","cwd":"'"$SCRIPT_DIR"'","hook_event_name":"UserPromptSubmit"}'
    '{"user_message":"Using sfdc-cpq-assessor agent. Run assessment","cwd":"'"$SCRIPT_DIR"'","hook_event_name":"UserPromptSubmit"}'
    '{"user_message":"Complex task with multiple steps","cwd":"'"$SCRIPT_DIR"'","hook_event_name":"UserPromptSubmit"}'
  )

  for test_case in "${test_cases[@]}"; do
    ((TOTAL_TESTS+=1))
    if timeout 5s bash "$hook_path" < <(echo "$test_case") > /dev/null 2>&1; then
      log_verbose "✓ Test case passed: $(echo "$test_case" | jq -r '.user_message' 2>/dev/null | cut -c1-50)..."
      ((PASSED_TESTS+=1))
    else
      log_verbose "✗ Test case failed: $(echo "$test_case" | jq -r '.user_message' 2>/dev/null | cut -c1-50)..."
      ((FAILED_TESTS+=1))
    fi
  done

  # Cleanup
  rm -f "$stdout_file" "$stderr_file"

  echo ""
}

# Find all UserPromptSubmit hooks
find_hooks() {
  local plugin_pattern="$1"

  if [ -z "$plugin_pattern" ]; then
    # Find all hooks
    find "$SCRIPT_DIR/.claude-plugins" -type f -name "*user-prompt*.sh" 2>/dev/null | sort
  else
    # Find hooks for specific plugin
    find "$SCRIPT_DIR/.claude-plugins/${plugin_pattern}-plugin" -type f -name "*user-prompt*.sh" 2>/dev/null | sort
  fi
}

# Main test execution
main() {
  echo "========================================"
  echo "UserPromptSubmit Hook Test Suite"
  echo "========================================"
  echo ""

  if [ -n "$TEST_PLUGIN" ]; then
    log_info "Testing plugin: $TEST_PLUGIN"
  else
    log_info "Testing all plugins"
  fi
  echo ""

  # Find hooks
  local hooks
  hooks=$(find_hooks "$TEST_PLUGIN")

  if [ -z "$hooks" ]; then
    log_error "No UserPromptSubmit hooks found"
    if [ -n "$TEST_PLUGIN" ]; then
      log_info "Plugin '$TEST_PLUGIN' may not have UserPromptSubmit hooks"
    fi
    exit 1
  fi

  local hook_count
  hook_count=$(echo "$hooks" | wc -l)
  log_info "Found $hook_count hook(s)"
  echo ""

  # Test each hook
  while IFS= read -r hook; do
    test_hook "$hook"
  done <<< "$hooks"

  # Print summary
  echo "========================================"
  echo "Test Summary"
  echo "========================================"
  echo ""
  echo "Total Tests:   $TOTAL_TESTS"
  echo -e "Passed:        ${GREEN}$PASSED_TESTS${NC}"
  echo -e "Failed:        ${RED}$FAILED_TESTS${NC}"
  echo -e "Warnings:      ${YELLOW}$WARNINGS${NC}"
  echo ""

  local success_rate=0
  if [ "$TOTAL_TESTS" -gt 0 ]; then
    success_rate=$(echo "scale=1; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)
  fi

  echo "Success Rate:  ${success_rate}%"
  echo ""

  if [ "$FAILED_TESTS" -gt 0 ]; then
    echo -e "${RED}Some tests failed. Review the output above for details.${NC}"
    exit 1
  elif [ "$WARNINGS" -gt 0 ]; then
    echo -e "${YELLOW}All tests passed, but there are warnings.${NC}"
    exit 0
  else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
  fi
}

# System information
if [ "$DEBUG" = "1" ]; then
  echo "========================================"
  echo "System Information"
  echo "========================================"
  echo "OS: $(uname -s)"
  echo "Shell: $SHELL"
  echo "Bash version: $BASH_VERSION"
  echo "Working directory: $SCRIPT_DIR"
  echo ""

  # Check for required tools
  echo "Available tools:"
  for tool in jq node bc timeout; do
    if command -v "$tool" &> /dev/null; then
      echo "  ✓ $tool: $(command -v "$tool")"
    else
      echo "  ✗ $tool: not found"
    fi
  done
  echo ""
fi

# Run main function
main
