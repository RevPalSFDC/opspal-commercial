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
LEGACY_ROUTER_BASENAME="user-prompt""-router.sh"

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

asset_exists() {
    local asset_path="$1"
    [ -f "$asset_path" ] || [ -f "${asset_path}.enc" ]
}

asset_is_encrypted_only() {
    local asset_path="$1"
    [ ! -f "$asset_path" ] && [ -f "${asset_path}.enc" ]
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

    local index_file="$PLUGIN_ROOT/routing-index.json"

    if [ ! -f "$index_file" ]; then
        log_warning "Cannot check keywords: routing index missing"
        return 0
    fi

    # Use canonical routing-index output (supports triggerKeywords + keywords + triggers + derived fallbacks)
    local has_full_index=$(jq -r 'has("agentsByFull")' "$index_file")
    local agent_query='.agents'
    if [ "$has_full_index" = "true" ]; then
        agent_query='.agentsByFull'
    fi

    local total_agents=$(jq "$agent_query | length" "$index_file")
    local agents_without_keywords=$(jq "[$agent_query | to_entries[] | select((.value.triggerKeywords | type != \"array\") or (.value.triggerKeywords | length == 0))] | length" "$index_file")

    if [ "$agents_without_keywords" -eq 0 ]; then
        log_success "All $total_agents indexed agents have routing keywords"
    else
        if [ "$VERBOSE" = "1" ]; then
            while IFS= read -r missing_agent; do
                log_warning "Missing keywords: $missing_agent"
            done < <(jq -r "$agent_query | to_entries[] | select((.value.triggerKeywords | type != \"array\") or (.value.triggerKeywords | length == 0)) | \"\\(.key).md (\\(.value.path // \\\"unknown\\\"))\"" "$index_file")
        fi
        log_warning "$agents_without_keywords/$total_agents indexed agents missing routing keywords"
        log_info "Rebuild/check parser: node scripts/lib/routing-index-builder.js"
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
        "scripts/lib/validate-routing-integrity.js"
        "scripts/lib/validate-routing-state-semantics.js"
        "scripts/lib/routing-index-builder.js"
        "scripts/lib/routing-routability-audit.js"
        "scripts/lib/routing-metrics-tracker.js"
        "hooks/unified-router.sh"
    )

    local missing=0

    for script in "${scripts[@]}"; do
        local script_path="$PLUGIN_ROOT/$script"

        if ! asset_exists "$script_path"; then
            log_error "Missing: $script"
            ((missing+=1))
        elif asset_is_encrypted_only "$script_path"; then
            log_info "Encrypted runtime asset packaged: $script"
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

    if [ -f "$scorer" ]; then
        # Test with high complexity task
        local test_output=$(node "$scorer" "Bulk merge 50 accounts in production" 2>&1 || true)

        if echo "$test_output" | grep -q "Complexity Score:"; then
            log_success "Complexity scorer functional"

            # Verify high-risk operations score appropriately
            local score
            score=$(echo "$test_output" | sed -n 's/.*Complexity Score: \([0-9.]\+\).*/\1/p' | head -1)

            if [ -n "$score" ] && (( $(echo "$score >= 0.7" | bc -l) )); then
                log_success "High-risk detection working"
            else
                log_warning "High-risk detection may need tuning"
            fi
        else
            log_error "Complexity scorer not working properly"
            return 1
        fi
    elif [ -f "${scorer}.enc" ]; then
        log_success "Complexity scorer packaged as encrypted runtime asset; local execution check intentionally skipped"
    else
        log_error "Complexity scorer not found"
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

# Check 7: Validate end-to-end routing integrity
check_routing_integrity() {
    ((TOTAL_CHECKS+=1))
    log_section "7. Routing Integrity"

    local validator="$PLUGIN_ROOT/scripts/lib/validate-routing-integrity.js"

    if [ ! -f "$validator" ]; then
        log_error "Routing integrity validator not found"
        return 1
    fi

    if node "$validator" >/dev/null 2>&1; then
        log_success "Routing integrity validator passed"
    else
        log_error "Routing integrity validator failed"
        if [ "$VERBOSE" = "1" ]; then
            node "$validator" || true
        fi
        return 1
    fi
}

# Check 8: Validate routing-state semantics and legacy guardrails
check_routing_state_semantics() {
    ((TOTAL_CHECKS+=1))
    log_section "8. Routing State Semantics"

    local validator="$PLUGIN_ROOT/scripts/lib/validate-routing-state-semantics.js"

    if [ ! -f "$validator" ]; then
        log_error "Routing state semantics validator not found"
        return 1
    fi

    if node "$validator" >/dev/null 2>&1; then
        log_success "Routing state semantics validator passed"
    else
        log_error "Routing state semantics validator failed"
        if [ "$VERBOSE" = "1" ]; then
            node "$validator" || true
        fi
        return 1
    fi

    local legacy_router_refs
    legacy_router_refs=$(rg -n "user-prompt""-router\\.sh" \
        "$PLUGIN_ROOT/AUTO_ROUTING_SETUP.md" \
        "$PLUGIN_ROOT/commands" \
        "$PLUGIN_ROOT/hooks/README.md" \
        "$PLUGIN_ROOT/scripts/setup-auto-routing.sh" \
        "$PLUGIN_ROOT/routing-index.json" 2>/dev/null || true)
    if [ -z "$legacy_router_refs" ]; then
        log_success "Legacy prompt router references removed"
    else
        log_error "Legacy prompt router references detected"
        if [ "$VERBOSE" = "1" ]; then
            echo "$legacy_router_refs"
        fi
        return 1
    fi

    local prompt_router_artifacts
    prompt_router_artifacts=$(find "$PLUGIN_ROOT/hooks" -maxdepth 1 -type f \( -name "$LEGACY_ROUTER_BASENAME" -o -name '*prompt-router*.sh' \) ! -name 'unified-router.sh' -printf '%P\n' 2>/dev/null || true)
    if [ -z "$prompt_router_artifacts" ]; then
        log_success "No legacy prompt router artifacts present"
    else
        log_error "Legacy prompt router artifact detected in hooks/"
        if [ "$VERBOSE" = "1" ]; then
            echo "$prompt_router_artifacts"
        fi
        return 1
    fi
}

# Check 9: Verify routing index coverage
check_index_coverage() {
    ((TOTAL_CHECKS+=1))
    log_section "9. Routing Index Coverage"

    local index_file="$PLUGIN_ROOT/routing-index.json"

    if [ ! -f "$index_file" ]; then
        log_error "Cannot check coverage: routing index missing"
        return 1
    fi

    # Prefer fully-qualified coverage when available (collision-safe index format),
    # otherwise fall back to unique short names for backward compatibility.
    local has_full_index=$(jq -r 'has("agentsByFull")' "$index_file")
    local index_agent_count=0
    local actual_agent_count=0

    if [ "$has_full_index" = "true" ]; then
        index_agent_count=$(jq '.agentsByFull | length' "$index_file")
        actual_agent_count=$(find "$PLUGINS_ROOT" -name "*.md" -path "*/agents/*" -type f ! -path "*/agents/shared/*" | wc -l)
    else
        index_agent_count=$(jq '.agents | length' "$index_file")
        actual_agent_count=$(find "$PLUGINS_ROOT" -name "*.md" -path "*/agents/*" -type f ! -path "*/agents/shared/*" -printf '%f\n' | sed 's/\.md$//' | sort -u | wc -l)
    fi

    local duplicate_short_names=$(find "$PLUGINS_ROOT" -name "*.md" -path "*/agents/*" -type f ! -path "*/agents/shared/*" -printf '%f\n' | sed 's/\.md$//' | sort | uniq -d | wc -l)

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

    if [ "$duplicate_short_names" -gt 0 ] && [ "$has_full_index" != "true" ]; then
        log_warning "Detected $duplicate_short_names duplicate short agent names across plugins"
    elif [ "$duplicate_short_names" -gt 0 ] && [ "$has_full_index" = "true" ]; then
        log_success "Duplicate short names are namespaced in fully-qualified index"
    fi
}

# Check 10: Validate keyword quality
check_keyword_quality() {
    ((TOTAL_CHECKS+=1))
    log_section "10. Keyword Quality"

    local index_file="$PLUGIN_ROOT/routing-index.json"

    if [ ! -f "$index_file" ]; then
        log_warning "Cannot check keywords: routing index missing"
        return 0
    fi

    # Check average keywords per agent
    local has_full_index=$(jq -r 'has("agentsByFull")' "$index_file")
    local agent_query='.agents'
    if [ "$has_full_index" = "true" ]; then
        agent_query='.agentsByFull'
    fi

    local total_agents=$(jq "$agent_query | length" "$index_file")
    local total_keywords=0

    for agent in $(jq -r "$agent_query | keys[]" "$index_file"); do
        local keywords=$(jq -r "$agent_query[\"$agent\"].triggerKeywords | length" "$index_file" 2>/dev/null || echo "0")
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

# Check 11: Guardrail against semver-prefixed agent leaks
check_semver_guardrail() {
    ((TOTAL_CHECKS+=1))
    log_section "11. Semver Prefix Guardrail"

    local index_file="$PLUGIN_ROOT/routing-index.json"
    local patterns_file="$PLUGIN_ROOT/config/routing-patterns.json"
    local router="$PLUGIN_ROOT/scripts/lib/task-router.js"
    local semver_agent_regex='^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?:'

    local index_semver=0
    local patterns_semver=0
    local output_semver=0

    if [ -f "$index_file" ]; then
        index_semver=$(jq -r \
            '[((.agentsByFull // .agents) | keys[]?) | select(test("^[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?:"))] | length' \
            "$index_file" 2>/dev/null || echo "0")
    fi

    if [ -f "$patterns_file" ]; then
        patterns_semver=$(jq -r \
            '[.platformPatterns[]?.patterns[]?.agent, .mandatoryPatterns.patterns[]?.agent]
             | map(select(type == "string"))
             | map(select(test("^[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?:")))
             | length' \
            "$patterns_file" 2>/dev/null || echo "0")
    fi

    if [ -f "$router" ]; then
        local router_output
        router_output=$(node "$router" "generate a revops report on pipeline health" 2>&1 || true)
        if echo "$router_output" | grep -Eq "$semver_agent_regex"; then
            output_semver=1
            if [ "$VERBOSE" = "1" ]; then
                log_info "Router output with semver leak:"
                echo "$router_output"
            fi
        fi
    fi

    if [ "$index_semver" -eq 0 ] && [ "$patterns_semver" -eq 0 ] && [ "$output_semver" -eq 0 ]; then
        log_success "No semver-prefixed plugin aliases detected in routing artifacts or output"
    else
        log_error "Semver guardrail violation (index=$index_semver, patterns=$patterns_semver, output=$output_semver)"
        log_info "Rebuild caches/index and inspect alias resolver pollution"
        return 1
    fi
}

# Check 12: Verify per-agent routability (not just index presence)
check_agent_routability() {
    ((TOTAL_CHECKS+=1))
    log_section "12. Agent Routability Audit"

    local audit_script="$PLUGIN_ROOT/scripts/lib/routing-routability-audit.js"

    if [ ! -f "$audit_script" ]; then
        log_error "Routability audit script not found: $audit_script"
        return 1
    fi

    local audit_output
    audit_output=$(node "$audit_script" --json --max-no-match 0 --min-top3 100 --min-top1 95 2>/dev/null || true)

    if [ -z "$audit_output" ]; then
        log_error "Routability audit produced no output"
        return 1
    fi

    local no_match top1 top3 pass
    no_match=$(echo "$audit_output" | jq -r '.summary.noMatch // -1' 2>/dev/null || echo "-1")
    top1=$(echo "$audit_output" | jq -r '.summary.top1Coverage // 0' 2>/dev/null || echo "0")
    top3=$(echo "$audit_output" | jq -r '.summary.top3Coverage // 0' 2>/dev/null || echo "0")
    pass=$(echo "$audit_output" | jq -r '.pass // false' 2>/dev/null || echo "false")

    if [ "$pass" = "true" ]; then
        log_success "Routability audit passed (top1=${top1}%, top3=${top3}%, noMatch=${no_match})"
    else
        log_error "Routability audit failed (top1=${top1}%, top3=${top3}%, noMatch=${no_match})"
        if [ "$VERBOSE" = "1" ]; then
            local sample_failures
            sample_failures=$(echo "$audit_output" | jq -r '.failures[]? | "- [\(.type)] \(.agent) => \(.recommended // "none")"' 2>/dev/null || true)
            if [ -n "$sample_failures" ]; then
                log_info "Sample failures:"
                echo "$sample_failures"
            fi
        fi
        return 1
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
    check_routing_integrity
    check_routing_state_semantics
    check_index_coverage
    check_keyword_quality
    check_semver_guardrail
    check_agent_routability

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
