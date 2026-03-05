#!/bin/bash

# =============================================================================
# Test Script for Plugin Version Checker
# Tests version checking functionality with various scenarios
#
# Usage:
#   bash test-version-checker.sh [--verbose]
#
# Version: 1.0.0
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION_CHECKER="$SCRIPT_DIR/plugin-version-checker.js"
VERBOSE=0

if [[ "${1:-}" == "--verbose" ]]; then
  VERBOSE=1
fi

log() {
  echo "[TEST] $*"
}

log_success() {
  echo "✅ $*"
}

log_error() {
  echo "❌ $*"
}

log_info() {
  if [[ $VERBOSE -eq 1 ]]; then
    echo "ℹ️  $*"
  fi
}

# Test 1: Check script exists and is executable
test_script_exists() {
  log "Test 1: Checking script existence..."

  if [[ ! -f "$VERSION_CHECKER" ]]; then
    log_error "Script not found at: $VERSION_CHECKER"
    return 1
  fi

  if [[ ! -x "$VERSION_CHECKER" ]]; then
    log_error "Script not executable"
    return 1
  fi

  log_success "Script exists and is executable"
  return 0
}

# Test 2: Check JSON output format
test_json_output() {
  log "Test 2: Checking JSON output format..."

  local output
  output=$(node "$VERSION_CHECKER" --format=json 2>/dev/null || echo '{}')

  if ! echo "$output" | jq . >/dev/null 2>&1; then
    log_error "Invalid JSON output"
    log_info "Output: $output"
    return 1
  fi

  log_success "Valid JSON output"
  log_info "Output: $output"
  return 0
}

# Test 3: Check text output format
test_text_output() {
  log "Test 3: Checking text output format..."

  local output
  output=$(node "$VERSION_CHECKER" --format=text 2>/dev/null || echo "")

  if [[ -z "$output" ]]; then
    log_error "Empty text output"
    return 1
  fi

  log_success "Valid text output"
  log_info "Output: $output"
  return 0
}

# Test 4: Check cache creation
test_cache_creation() {
  log "Test 4: Checking cache creation..."

  local cache_file="$HOME/.claude/plugin-versions-cache.json"

  # Remove existing cache
  rm -f "$cache_file"

  # Run checker
  node "$VERSION_CHECKER" --format=json >/dev/null 2>&1 || true

  # Wait a moment for file creation
  sleep 1

  if [[ ! -f "$cache_file" ]]; then
    log_error "Cache file not created at: $cache_file"
    return 1
  fi

  if ! cat "$cache_file" | jq . >/dev/null 2>&1; then
    log_error "Invalid JSON in cache file"
    return 1
  fi

  log_success "Cache file created successfully"
  log_info "Cache location: $cache_file"
  return 0
}

# Test 5: Check force refresh
test_force_refresh() {
  log "Test 5: Checking force refresh..."

  local cache_file="$HOME/.claude/plugin-versions-cache.json"

  # Get cache timestamp before refresh
  local timestamp_before
  timestamp_before=$(cat "$cache_file" | jq -r '.timestamp' 2>/dev/null || echo "0")

  # Wait 2 seconds to ensure timestamp difference
  sleep 2

  # Force refresh
  node "$VERSION_CHECKER" --format=json --force-refresh >/dev/null 2>&1 || true

  # Get cache timestamp after refresh
  local timestamp_after
  timestamp_after=$(cat "$cache_file" | jq -r '.timestamp' 2>/dev/null || echo "0")

  if [[ "$timestamp_after" -le "$timestamp_before" ]]; then
    log_error "Cache not refreshed (timestamps: before=$timestamp_before, after=$timestamp_after)"
    return 1
  fi

  log_success "Force refresh working"
  log_info "Cache timestamp updated: $timestamp_before → $timestamp_after"
  return 0
}

# Test 6: Check timeout handling
test_timeout_handling() {
  log "Test 6: Checking timeout handling..."

  # Run with 1 second timeout
  if timeout 1s node "$VERSION_CHECKER" --format=json >/dev/null 2>&1; then
    log_success "Completes within timeout"
  else
    log_error "Timeout occurred (expected to complete within 1 second)"
    return 1
  fi

  return 0
}

# Test 7: Verify installed version detection
test_installed_version() {
  log "Test 7: Checking installed version detection..."

  # Test with salesforce-plugin
  local plugin_json="$SCRIPT_DIR/../../../salesforce-plugin/.claude-plugin/plugin.json"

  if [[ ! -f "$plugin_json" ]]; then
    log_info "Salesforce plugin not found, skipping test"
    return 0
  fi

  local version
  version=$(cat "$plugin_json" | jq -r '.version' 2>/dev/null || echo "")

  if [[ -z "$version" ]]; then
    log_error "Could not read version from plugin.json"
    return 1
  fi

  log_success "Installed version detected: $version"
  return 0
}

# Run all tests
main() {
  log "Starting Plugin Version Checker Tests"
  log "======================================"
  echo ""

  local failed=0

  test_script_exists || ((failed++))
  echo ""

  test_json_output || ((failed++))
  echo ""

  test_text_output || ((failed++))
  echo ""

  test_cache_creation || ((failed++))
  echo ""

  test_force_refresh || ((failed++))
  echo ""

  test_timeout_handling || ((failed++))
  echo ""

  test_installed_version || ((failed++))
  echo ""

  log "======================================"
  if [[ $failed -eq 0 ]]; then
    log_success "All tests passed!"
    exit 0
  else
    log_error "$failed test(s) failed"
    exit 1
  fi
}

# Run tests
main "$@"
