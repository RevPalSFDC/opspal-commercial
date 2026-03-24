#!/usr/bin/env bash
##
## Pre-Tool Execution Validation Hook
##
## Validates tool invocations against contracts before execution.
## Prevents tool-contract errors through parameter validation.
##
## Addresses Reflection Cohort: tool-contract (42 reflections)
## Target ROI: $7,875 annually (75% reduction)
##
## Pattern: Validation + blocking like pre-reflection-submit.sh
##
## Exit Codes:
##   0 - Validation passed (allow execution)
##   1 - CRITICAL errors (block execution)
##   2 - Warnings only (allow with message)
##
## Validation Stages:
##   1. Tool contract exists
##   2. Required parameters present
##   3. Parameter types valid
##   4. Enum values valid
##   5. Conditional requirements met
##
## @version 1.0.0
## @created 2026-01-06
##

set -euo pipefail

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

TOOL_CONTRACT_VALIDATOR="$PLUGIN_DIR/scripts/lib/tool-contract-validator.js"

# Statistics
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNINGS=0

# Collect errors and warnings
declare -a ERRORS
declare -a WARNINGS_ARRAY

##
## Helper Functions
##

log_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
  echo -e "${GREEN}✅${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}⚠️${NC} $1"
  WARNINGS=$((WARNINGS + 1))
  WARNINGS_ARRAY+=("$1")
}

log_error() {
  echo -e "${RED}❌${NC} $1"
  FAILED_CHECKS=$((FAILED_CHECKS + 1))
  ERRORS+=("$1")
}

check_dependencies() {
  # Check for required scripts
  if [[ ! -f "$TOOL_CONTRACT_VALIDATOR" ]]; then
    log_error "Tool contract validator not found: $TOOL_CONTRACT_VALIDATOR"
    return 1
  fi

  # Check for node
  if ! command -v node &> /dev/null; then
    log_error "node not found in PATH"
    return 1
  fi

  # Check for jq
  if ! command -v jq &> /dev/null; then
    log_warning "jq not found - JSON parsing will be limited"
  fi

  return 0
}

parse_tool_name() {
  local tool_invocation="$1"

  # Extract tool name from invocation
  # Handles: sf data query, mcp_salesforce, sf project deploy, etc.
  if [[ "$tool_invocation" =~ ^(sf|sfdx)[[:space:]]+([a-z]+)[[:space:]]+([a-z]+) ]]; then
    # sf/sfdx CLI command: sf data query -> sf_data_query
    echo "sf_${BASH_REMATCH[2]}_${BASH_REMATCH[3]}"
  elif [[ "$tool_invocation" =~ ^mcp_([a-z_]+) ]]; then
    # MCP tool: mcp_salesforce -> mcp_salesforce
    echo "${BASH_REMATCH[0]}"
  else
    # Unknown format
    echo ""
  fi
}

parse_tool_params() {
  local tool_invocation="$1"
  local params_json=""

  # Parse common parameter patterns
  # This is a simplified parser - real implementation would be more robust

  # Extract --param value pairs
  params_json="{"

  # Query parameter
  if [[ "$tool_invocation" =~ --query[[:space:]]+\"([^\"]+)\" ]]; then
    params_json+="\"query\":\"${BASH_REMATCH[1]}\","
  fi

  # Target org parameter
  if [[ "$tool_invocation" =~ --target-org[[:space:]]+([^[:space:]]+) ]]; then
    params_json+="\"target-org\":\"${BASH_REMATCH[1]}\","
  fi

  # Use tooling API flag
  if [[ "$tool_invocation" =~ --use-tooling-api ]]; then
    params_json+="\"use-tooling-api\":true,"
  fi

  # Source dir parameter
  if [[ "$tool_invocation" =~ --source-dir[[:space:]]+([^[:space:]]+) ]]; then
    params_json+="\"source-dir\":\"${BASH_REMATCH[1]}\","
  fi

  # Test level parameter
  if [[ "$tool_invocation" =~ --test-level[[:space:]]+([^[:space:]]+) ]]; then
    params_json+="\"test-level\":\"${BASH_REMATCH[1]}\","
  fi

  # SObject parameter
  if [[ "$tool_invocation" =~ --sobject[[:space:]]+([^[:space:]]+) ]]; then
    params_json+="\"sobject\":\"${BASH_REMATCH[1]}\","
  fi

  # File parameter
  if [[ "$tool_invocation" =~ --file[[:space:]]+([^[:space:]]+) ]]; then
    params_json+="\"file\":\"${BASH_REMATCH[1]}\","
  fi

  # Remove trailing comma and close JSON
  params_json="${params_json%,}"
  params_json+="}"

  echo "$params_json"
}

validate_tool_invocation() {
  local tool_invocation="$1"
  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

  log_info "Validating tool invocation..."

  # Stage 1: Parse tool name
  local tool_name
  tool_name=$(parse_tool_name "$tool_invocation")

  if [[ -z "$tool_name" ]]; then
    log_warning "Could not parse tool name from: $tool_invocation"
    log_warning "Skipping contract validation for unknown tool format"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    return 0
  fi

  log_info "Tool name: $tool_name"

  # Stage 2: Parse parameters
  local params_json
  params_json=$(parse_tool_params "$tool_invocation")

  log_info "Parsed parameters: $params_json"

  # Stage 3: Validate against contract
  local validation_result
  local validation_exit_code

  # Create temp file for params
  local temp_params
  temp_params=$(mktemp)
  echo "$params_json" > "$temp_params"

  # Run validation
  if validation_result=$(node "$TOOL_CONTRACT_VALIDATOR" validate "$tool_name" --params-file "$temp_params" 2>&1); then
    validation_exit_code=0
  else
    validation_exit_code=$?
  fi

  # Clean up temp file
  rm -f "$temp_params"

  # Process validation result
  if [[ $validation_exit_code -eq 0 ]]; then
    log_success "Tool contract validation passed"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))

    # Check for warnings in output
    if echo "$validation_result" | grep -q "WARNING"; then
      log_warning "Validation passed with warnings"
      echo "$validation_result" | grep "WARNING"
    fi

    return 0
  else
    log_error "Tool contract validation failed"
    echo "$validation_result"
    return 1
  fi
}

should_validate_tool() {
  local tool_invocation="$1"

  # Only validate sf CLI and MCP tools
  if [[ "$tool_invocation" =~ ^(sf|sfdx)[[:space:]] ]] || [[ "$tool_invocation" =~ ^mcp_ ]]; then
    return 0
  fi

  return 1
}

print_summary() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "${BLUE}📊 Validation Summary${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Total Checks: $TOTAL_CHECKS"
  echo "  Passed: $PASSED_CHECKS"
  echo "  Failed: $FAILED_CHECKS"
  echo "  Warnings: $WARNINGS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [[ $FAILED_CHECKS -gt 0 ]]; then
    echo ""
    echo -e "${RED}❌ CRITICAL Errors (blocking):${NC}"
    for error in "${ERRORS[@]}"; do
      echo "  • $error"
    done
  fi

  if [[ $WARNINGS -gt 0 ]]; then
    echo ""
    echo -e "${YELLOW}⚠️  Warnings (non-blocking):${NC}"
    for warning in "${WARNINGS_ARRAY[@]}"; do
      echo "  • $warning"
    done
  fi

  echo ""
}

##
## Main Validation
##

main() {
  local tool_invocation="${1:-}"

  # Check if validation is disabled
  if [[ "${SKIP_TOOL_VALIDATION:-0}" == "1" ]]; then
    log_info "Tool validation disabled via SKIP_TOOL_VALIDATION=1"
    exit 0
  fi

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "${BLUE}🔍 Pre-Tool Execution Validation${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  # Check if tool invocation provided
  if [[ -z "$tool_invocation" ]]; then
    log_info "No tool invocation provided - skipping validation"
    exit 0
  fi

  # Check if we should validate this tool
  if ! should_validate_tool "$tool_invocation"; then
    log_info "Tool type not in validation scope - skipping validation"
    exit 0
  fi

  # Check dependencies
  if ! check_dependencies; then
    log_error "Dependency check failed"
    exit 1
  fi

  # Run validation
  local validation_failed=0

  if ! validate_tool_invocation "$tool_invocation"; then
    validation_failed=1
  fi

  # Print summary
  print_summary

  # Exit with appropriate code
  if [[ $validation_failed -eq 1 ]]; then
    echo -e "${RED}❌ Validation FAILED - Tool execution blocked${NC}"
    echo ""
    echo -e "${YELLOW}💡 To skip validation: export SKIP_TOOL_VALIDATION=1${NC}"
    echo ""
    exit 1
  elif [[ $WARNINGS -gt 0 ]]; then
    echo -e "${YELLOW}⚠️  Validation passed with warnings - Tool will execute${NC}"
    echo ""
    exit 2
  else
    echo -e "${GREEN}✅ Validation PASSED - Tool will execute${NC}"
    echo ""
    exit 0
  fi
}

# Run main function
main "$@"
