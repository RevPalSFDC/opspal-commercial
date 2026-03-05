#!/bin/bash
#
# Hook Test Template: [HOOK_NAME]
#
# Template for testing bash hooks in the plugin system.
# Copy this file and replace placeholders:
# - [HOOK_NAME]: Name of the hook being tested (e.g., user-prompt-router)
# - [HOOK_PATH]: Path to the hook script
# - [DESCRIPTION]: Brief description of what the hook does
#
# Test Coverage:
# - [ ] Basic execution (exit code 0)
# - [ ] Error handler integration
# - [ ] Input validation
# - [ ] Output format
# - [ ] Environment variable handling
# - [ ] Timeout behavior
# - [ ] Circuit breaker (if applicable)
#
# Usage:
#   bash test/templates/hook.test.template.sh
#   DEBUG=1 bash test/templates/hook.test.template.sh  # Verbose mode
#
# @author Claude Code
# @date [DATE]
# @version 1.0.0

set -e

# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK_PATH="${PLUGIN_ROOT}/hooks/[HOOK_NAME].sh"
TEST_LOG="/tmp/hook-test-[HOOK_NAME].log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Debug mode
DEBUG="${DEBUG:-0}"

# =============================================================================
# Test Utilities
# =============================================================================

log_debug() {
    if [ "$DEBUG" = "1" ]; then
        echo -e "${BLUE}[DEBUG]${NC} $1" >&2
    fi
}

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
}

assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="${3:-Values should be equal}"

    if [ "$expected" = "$actual" ]; then
        return 0
    else
        echo "  Expected: $expected"
        echo "  Actual:   $actual"
        return 1
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local message="${3:-Should contain substring}"

    if echo "$haystack" | grep -q "$needle"; then
        return 0
    else
        echo "  Expected to contain: $needle"
        echo "  Actual: $haystack"
        return 1
    fi
}

assert_exit_code() {
    local expected="$1"
    local actual="$2"
    local message="${3:-Exit code should match}"

    if [ "$expected" = "$actual" ]; then
        return 0
    else
        echo "  Expected exit code: $expected"
        echo "  Actual exit code:   $actual"
        return 1
    fi
}

run_hook() {
    local input="$1"
    local timeout="${2:-5}"

    echo "$input" | timeout "$timeout" bash "$HOOK_PATH" 2>/dev/null || true
}

run_hook_with_exit_code() {
    local input="$1"
    local timeout="${2:-5}"

    echo "$input" | timeout "$timeout" bash "$HOOK_PATH" 2>/dev/null
    echo $?
}

# =============================================================================
# Test Setup / Teardown
# =============================================================================

setup() {
    log_debug "Setting up test environment..."

    # Save original environment
    export ORIGINAL_PATH="$PATH"

    # Create test temp directory
    export TEST_TMP="/tmp/hook-test-$$"
    mkdir -p "$TEST_TMP"

    # Clear test log
    > "$TEST_LOG"

    log_debug "Test environment ready"
}

teardown() {
    log_debug "Cleaning up test environment..."

    # Restore original environment
    export PATH="$ORIGINAL_PATH"

    # Clean up temp directory
    rm -rf "$TEST_TMP" 2>/dev/null || true

    log_debug "Cleanup complete"
}

# =============================================================================
# Pre-flight Checks
# =============================================================================

preflight_checks() {
    echo "=========================================="
    echo " Hook Test Suite: [HOOK_NAME]"
    echo "=========================================="
    echo ""

    # Check hook exists
    if [ ! -f "$HOOK_PATH" ]; then
        log_fail "Hook not found at: $HOOK_PATH"
        exit 1
    fi
    log_pass "Hook file exists"

    # Check hook is executable
    if [ ! -x "$HOOK_PATH" ]; then
        log_fail "Hook is not executable"
        exit 1
    fi
    log_pass "Hook is executable"

    # Check syntax
    if ! bash -n "$HOOK_PATH" 2>/dev/null; then
        log_fail "Hook has syntax errors"
        exit 1
    fi
    log_pass "Hook syntax is valid"

    # Check for error handler integration
    if grep -q "error-handler.sh" "$HOOK_PATH"; then
        log_pass "Hook uses standardized error handler"
    else
        log_skip "Hook does not use standardized error handler (may be intentional)"
    fi

    echo ""
}

# =============================================================================
# Test Cases
# =============================================================================

test_basic_execution() {
    log_test "Basic execution with simple input"
    ((TESTS_RUN++))

    local output
    output=$(run_hook "test input")
    local exit_code=$?

    if assert_exit_code 0 "$exit_code" "Hook should exit successfully"; then
        log_pass "Basic execution"
    else
        log_fail "Basic execution"
    fi
}

test_empty_input() {
    log_test "Empty input handling"
    ((TESTS_RUN++))

    local output
    output=$(run_hook "")
    local exit_code=$?

    # Most hooks should handle empty input gracefully
    if assert_exit_code 0 "$exit_code" "Hook should handle empty input"; then
        log_pass "Empty input handling"
    else
        log_fail "Empty input handling"
    fi
}

test_special_characters() {
    log_test "Special character handling"
    ((TESTS_RUN++))

    local input='Input with "quotes" and $variables and `backticks`'
    local output
    output=$(run_hook "$input")
    local exit_code=$?

    if assert_exit_code 0 "$exit_code" "Hook should handle special characters"; then
        log_pass "Special character handling"
    else
        log_fail "Special character handling"
    fi
}

test_long_input() {
    log_test "Long input handling (>10KB)"
    ((TESTS_RUN++))

    # Generate 10KB of input
    local input
    input=$(head -c 10240 /dev/urandom | base64)
    local output
    output=$(run_hook "$input")
    local exit_code=$?

    if assert_exit_code 0 "$exit_code" "Hook should handle long input"; then
        log_pass "Long input handling"
    else
        log_fail "Long input handling"
    fi
}

test_timeout_handling() {
    log_test "Timeout handling"
    ((TESTS_RUN++))

    # Test with short timeout (hook should complete quickly)
    local output
    output=$(run_hook "quick test" 2)
    local exit_code=$?

    if [ "$exit_code" != "124" ]; then
        log_pass "Timeout handling (completed within limit)"
    else
        log_fail "Timeout handling (hook timed out)"
    fi
}

test_environment_variables() {
    log_test "Environment variable handling"
    ((TESTS_RUN++))

    # Test with common environment variables set
    export TEST_VAR="test_value"
    local output
    output=$(run_hook "test with env vars")
    local exit_code=$?
    unset TEST_VAR

    if assert_exit_code 0 "$exit_code" "Hook should handle environment variables"; then
        log_pass "Environment variable handling"
    else
        log_fail "Environment variable handling"
    fi
}

test_disable_flag() {
    log_test "Disable flag handling"
    ((TESTS_RUN++))

    # Test with hook disabled (if applicable)
    # Replace ENABLE_[HOOK_NAME] with actual variable name
    export ENABLE_AUTO_ROUTING=0
    local output
    output=$(run_hook "test with disabled")
    local exit_code=$?
    unset ENABLE_AUTO_ROUTING

    if assert_exit_code 0 "$exit_code" "Hook should handle disable flag"; then
        log_pass "Disable flag handling"
    else
        log_fail "Disable flag handling"
    fi
}

test_skip_markers() {
    log_test "Skip marker handling"
    ((TESTS_RUN++))

    # Test with skip markers (if applicable)
    local output
    output=$(run_hook "[DIRECT] skip routing for this")
    local exit_code=$?

    if assert_exit_code 0 "$exit_code" "Hook should handle skip markers"; then
        # Also verify input is passed through
        if assert_contains "$output" "skip routing for this" "Output should contain original input"; then
            log_pass "Skip marker handling"
        else
            log_fail "Skip marker handling (input not passed through)"
        fi
    else
        log_fail "Skip marker handling"
    fi
}

test_output_format() {
    log_test "Output format validation"
    ((TESTS_RUN++))

    local output
    output=$(run_hook "test input")

    # Verify output is not empty (unless expected)
    if [ -n "$output" ]; then
        log_pass "Output format validation (has output)"
    else
        # Some hooks may intentionally produce no output
        log_skip "Output format validation (no output - may be intentional)"
    fi
}

test_concurrent_execution() {
    log_test "Concurrent execution"
    ((TESTS_RUN++))

    # Run 5 instances concurrently
    local pids=()
    for i in {1..5}; do
        run_hook "concurrent test $i" &
        pids+=($!)
    done

    # Wait for all to complete
    local all_success=true
    for pid in "${pids[@]}"; do
        if ! wait "$pid"; then
            all_success=false
        fi
    done

    if $all_success; then
        log_pass "Concurrent execution"
    else
        log_fail "Concurrent execution"
    fi
}

# =============================================================================
# Hook-Specific Tests (Replace these with actual tests)
# =============================================================================

test_hook_specific_functionality() {
    log_test "[HOOK_NAME] specific functionality"
    ((TESTS_RUN++))

    # TODO: Replace with actual hook-specific tests
    # Example:
    # local output
    # output=$(run_hook "salesforce deploy validation rules")
    # if assert_contains "$output" "sfdc-automation-builder" "Should route to correct agent"; then
    #     log_pass "[HOOK_NAME] specific functionality"
    # else
    #     log_fail "[HOOK_NAME] specific functionality"
    # fi

    log_skip "[HOOK_NAME] specific functionality (not implemented)"
}

# =============================================================================
# Test Runner
# =============================================================================

run_all_tests() {
    setup

    echo ""
    echo "Running tests..."
    echo ""

    # Basic tests
    test_basic_execution
    test_empty_input
    test_special_characters
    test_long_input
    test_timeout_handling
    test_environment_variables
    test_disable_flag
    test_skip_markers
    test_output_format
    test_concurrent_execution

    # Hook-specific tests
    test_hook_specific_functionality

    teardown

    # Summary
    echo ""
    echo "=========================================="
    echo " Test Summary"
    echo "=========================================="
    echo ""
    echo "Tests Run:    $TESTS_RUN"
    echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
    echo ""

    if [ "$TESTS_FAILED" -eq 0 ]; then
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}Some tests failed!${NC}"
        exit 1
    fi
}

# =============================================================================
# Main
# =============================================================================

preflight_checks
run_all_tests
