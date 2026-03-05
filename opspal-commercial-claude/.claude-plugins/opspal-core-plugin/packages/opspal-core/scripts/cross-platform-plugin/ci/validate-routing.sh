#!/bin/bash

#
# CI Routing Validation Script
#
# Validates routing system integrity before commits/deployments.
# Checks agent keywords, routing index, complexity scoring, and validator rules.
#
# Usage:
#   ./validate-routing.sh [--strict] [--verbose]
#
# Exit codes:
#   0 - All checks passed
#   1 - Critical failures detected
#   2 - Warnings detected (only in strict mode)
#

set -e

# Configuration
STRICT_MODE=0
VERBOSE=0
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PLUGINS_ROOT="$(cd "$PLUGIN_ROOT/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

# Parse arguments
for arg in "$@"; do
    case $arg in
        --strict)
            STRICT_MODE=1
            ;;
        --verbose|-v)
            VERBOSE=1
            ;;
        --help|-h)
            echo "Usage: $0 [--strict] [--verbose]"
            echo ""
            echo "Options:"
            echo "  --strict      Fail on warnings"
            echo "  --verbose     Show detailed output"
            echo "  --help        Show this help message"
            exit 0
            ;;
    esac
done

# Logging functions
log_info() {
    if [ "$VERBOSE" = "1" ]; then
        echo -e "${BLUE}[INFO]${NC} $1"
    fi
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED_CHECKS+=1))
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNING_CHECKS+=1))
}

log_error() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED_CHECKS+=1))
}

log_section() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "$1"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Check 1: Verify routing index exists and is valid
check_routing_index() {
    ((TOTAL_CHECKS+=1))
    log_section "1. Routing Index Validation"

    local index_file="$PLUGIN_ROOT/routing-index.json"

    if [ ! -f "$index_file" ]; then
        log_error "Routing index not found: $index_file"
        log_info "Run: node scripts/lib/routing-index-builder.js"
        return 1
    fi

    # Validate JSON structure
    if ! jq empty "$index_file" 2>/dev/null; then
        log_error "Routing index has invalid JSON"
        return 1
    fi

    # Check required fields
    local has_version=$(jq -r '.version' "$index_file")
    local has_agents=$(jq -r '.agents' "$index_file")
    local has_keywords=$(jq -r '.byKeyword' "$index_file")

    if [ "$has_version" = "null" ] || [ "$has_agents" = "null" ] || [ "$has_keywords" = "null" ]; then
        log_error "Routing index missing required fields"
        return 1
    fi

    local agent_count=$(jq '.agents | length' "$index_file")
    local keyword_count=$(jq '.byKeyword | length' "$index_file")

    log_success "Routing index valid ($agent_count agents, $keyword_count keywords)"

    # Warning: Check if index is stale (older than agent files)
    if [ -n "$(find "$PLUGINS_ROOT" -name "*.md" -path "*/agents/*" -newer "$index_file" 2>/dev/null)" ]; then
        log_warning "Routing index may be stale (agent files modified after index)"
        log_info "Consider rebuilding: node scripts/lib/routing-index-builder.js"
    fi
}

# Check 2: Verify all agents have trigger keywords
check_agent_keywords() {
    ((TOTAL_CHECKS+=1))
    log_section "2. Agent Trigger Keywords"

    local agents_without_keywords=0
    local total_agents=0

    # Find all agent files
    while IFS= read -r -d '' agent_file; do
        ((total_agents+=1))

        # Check if agent has triggerKeywords in frontmatter
        if ! grep -q "^triggerKeywords:" "$agent_file"; then
            ((agents_without_keywords+=1))
            if [ "$VERBOSE" = "1" ]; then
                log_warning "Missing keywords: $(basename "$agent_file")"
            fi
        fi
    done < <(find "$PLUGINS_ROOT" -name "*.md" -path "*/agents/*" -type f -print0)

    if [ "$agents_without_keywords" -eq 0 ]; then
        log_success "All $total_agents agents have trigger keywords"
    else
        log_warning "$agents_without_keywords/$total_agents agents missing trigger keywords"
        log_info "Run: node scripts/lib/keyword-applier.js"
    fi
}

# Check 3: Verify critical scripts exist and are executable
check_scripts() {
    ((TOTAL_CHECKS+=1))
    log_section "3. Routing Scripts"

    local scripts=(
        "scripts/lib/task-router.js"
        "scripts/lib/complexity-scorer.js"
        "scripts/lib/pre-execution-validator.js"
        "scripts/lib/routing-index-builder.js"
        "scripts/lib/routing-metrics-tracker.js"
        "hooks/user-prompt-router.sh"
    )

    local missing=0

    for script in "${scripts[@]}"; do
        local script_path="$PLUGIN_ROOT/$script"

        if [ ! -f "$script_path" ]; then
            log_error "Missing: $script"
            ((missing+=1))
        elif [ ! -x "$script_path" ]; then
            log_warning "Not executable: $script"
            log_info "Run: chmod +x $script_path"
        fi
    done

    if [ "$missing" -eq 0 ]; then
        log_success "All routing scripts present"
    fi
}

# Check 4: Test task router functionality
check_task_router() {
    ((TOTAL_CHECKS+=1))
    log_section "4. Task Router Functionality"

    local router="$PLUGIN_ROOT/scripts/lib/task-router.js"

    if [ ! -f "$router" ]; then
        log_error "Task router not found"
        return 1
    fi

    # Test with sample input
    local test_output=$(node "$router" "Deploy to production" 2>&1 || true)

    if echo "$test_output" | grep -q "RECOMMENDED AGENT:"; then
        log_success "Task router functional"
    else
        log_error "Task router not working properly"
        if [ "$VERBOSE" = "1" ]; then
            echo "$test_output"
        fi
        return 1
    fi
}

# Check 5: Test complexity scorer
check_complexity_scorer() {
    ((TOTAL_CHECKS+=1))
    log_section "5. Complexity Scorer"

    local scorer="$PLUGIN_ROOT/scripts/lib/complexity-scorer.js"

    if [ ! -f "$scorer" ]; then
        log_error "Complexity scorer not found"
        return 1
    fi

    # Test with high complexity task
    local test_output=$(node "$scorer" "Bulk merge 50 accounts in production" 2>&1 || true)

    if echo "$test_output" | grep -q "Complexity Score:"; then
        log_success "Complexity scorer functional"

        # Verify high-risk operations score appropriately
        if echo "$test_output" | grep -qE "Complexity Score: (0\.[789]|1\.0)"; then
            log_success "High-risk detection working"
        else
            log_warning "High-risk detection may need tuning"
        fi
    else
        log_error "Complexity scorer not working properly"
        return 1
    fi
}

# Check 6: Test pre-execution validator
check_validator() {
    ((TOTAL_CHECKS+=1))
    log_section "6. Pre-Execution Validator"

    local validator="$PLUGIN_ROOT/scripts/lib/pre-execution-validator.js"

    if [ ! -f "$validator" ]; then
        log_error "Pre-execution validator not found"
        return 1
    fi

    # Test blocking rule
    if node "$validator" "Delete all accounts in production" >/dev/null 2>&1; then
        log_error "Validator failed to block dangerous operation"
        return 1
    else
        log_success "Validator blocks dangerous operations"
    fi

    # Test required agent rule
    if node "$validator" "Deploy to production" >/dev/null 2>&1; then
        log_warning "Validator should require agent for production deploy"
    else
        log_success "Validator enforces required agents"
    fi
}

# Check 7: Verify routing index coverage
check_index_coverage() {
    ((TOTAL_CHECKS+=1))
    log_section "7. Routing Index Coverage"

    local index_file="$PLUGIN_ROOT/routing-index.json"

    if [ ! -f "$index_file" ]; then
        log_error "Cannot check coverage: routing index missing"
        return 1
    fi

    # Count agents in index vs actual agent files
    local index_agent_count=$(jq '.agents | length' "$index_file")
    local actual_agent_count=$(find "$PLUGINS_ROOT" -name "*.md" -path "*/agents/*" -type f | wc -l)

    local coverage=$(echo "scale=1; $index_agent_count * 100 / $actual_agent_count" | bc 2>/dev/null || echo "0")

    if (( $(echo "$coverage >= 90" | bc -l) )); then
        log_success "Index coverage: ${coverage}% ($index_agent_count/$actual_agent_count agents)"
    elif (( $(echo "$coverage >= 70" | bc -l) )); then
        log_warning "Index coverage: ${coverage}% ($index_agent_count/$actual_agent_count agents)"
        log_info "Consider rebuilding index"
    else
        log_error "Low index coverage: ${coverage}% ($index_agent_count/$actual_agent_count agents)"
        log_info "Rebuild index: node scripts/lib/routing-index-builder.js"
        return 1
    fi
}

# Check 8: Validate keyword quality
check_keyword_quality() {
    ((TOTAL_CHECKS+=1))
    log_section "8. Keyword Quality"

    local index_file="$PLUGIN_ROOT/routing-index.json"

    if [ ! -f "$index_file" ]; then
        log_warning "Cannot check keywords: routing index missing"
        return 0
    fi

    # Check average keywords per agent
    local total_agents=$(jq '.agents | length' "$index_file")
    local total_keywords=0

    for agent in $(jq -r '.agents | keys[]' "$index_file"); do
        local keywords=$(jq -r ".agents[\"$agent\"].triggerKeywords | length" "$index_file" 2>/dev/null || echo "0")
        total_keywords=$((total_keywords + keywords))
    done

    if [ "$total_agents" -gt 0 ]; then
        local avg_keywords=$(echo "scale=1; $total_keywords / $total_agents" | bc)

        if (( $(echo "$avg_keywords >= 5" | bc -l) )); then
            log_success "Keyword density: ${avg_keywords} avg keywords/agent"
        else
            log_warning "Low keyword density: ${avg_keywords} avg keywords/agent"
            log_info "Run keyword-suggester.js to improve coverage"
        fi
    fi
}

# Main execution
main() {
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║        CI Routing Validation                           ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo ""

    if [ "$STRICT_MODE" = "1" ]; then
        log_info "Running in STRICT mode (warnings will fail)"
    fi

    # Run all checks
    check_routing_index
    check_agent_keywords
    check_scripts
    check_task_router
    check_complexity_scorer
    check_validator
    check_index_coverage
    check_keyword_quality

    # Summary
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Summary"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "Total checks:    $TOTAL_CHECKS"
    echo -e "${GREEN}Passed:${NC}          $PASSED_CHECKS"
    echo -e "${YELLOW}Warnings:${NC}        $WARNING_CHECKS"
    echo -e "${RED}Failed:${NC}          $FAILED_CHECKS"

    # Determine exit code
    if [ "$FAILED_CHECKS" -gt 0 ]; then
        echo ""
        echo -e "${RED}VALIDATION FAILED${NC}"
        exit 1
    elif [ "$STRICT_MODE" = "1" ] && [ "$WARNING_CHECKS" -gt 0 ]; then
        echo ""
        echo -e "${YELLOW}VALIDATION FAILED (strict mode)${NC}"
        exit 2
    else
        echo ""
        echo -e "${GREEN}VALIDATION PASSED${NC}"
        exit 0
    fi
}

# Run main function
main
