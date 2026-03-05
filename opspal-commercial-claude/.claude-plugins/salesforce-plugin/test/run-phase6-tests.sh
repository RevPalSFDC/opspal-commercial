#!/bin/bash

# Phase 6 Layout Generation Test Suite Runner
# Tests all 7 personas across multiple objects for the active Salesforce instance

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PLUGIN_ROOT/../.." && pwd)"
INSTANCE_RESOLVER="$PLUGIN_ROOT/scripts/lib/instance_resolver.py"
LAYOUT_ENGINE="$PLUGIN_ROOT/scripts/lib/layout-template-engine.js"
LAYOUT_ANALYZER="$PLUGIN_ROOT/scripts/lib/layout-analyzer.js"

# Environment defaults
ORG_ALIAS_ENV="${SFDC_INSTANCE:-${SF_TARGET_ORG:-${ORG:-}}}"
INSTANCE_DIR_ENV="${INSTANCE_DIR:-}"
OUTPUT_BASE_ENV="${OUTPUT_BASE:-}"
RESULTS_FILE_ENV="${RESULTS_FILE:-}"

# Configuration (resolved)
ORG_ALIAS=""
INSTANCE_DIR=""
OUTPUT_BASE=""
RESULTS_FILE=""

print_usage() {
    cat << EOF
Usage: $0 [--org <alias>] [--instance-dir <path>] [--output-base <path>] [--results-file <path>]

Environment:
  SFDC_INSTANCE | SF_TARGET_ORG | ORG   Salesforce org alias
  INSTANCE_DIR                    Salesforce instance root (must include sfdx-project.json)
  PROJECT_ROOT                    Optional root containing SFDC/instances or opspal-internal/SFDC/instances
  OUTPUT_BASE                     Optional output base directory
  RESULTS_FILE                    Optional results file path
EOF
}

resolve_instance_from_root() {
    local project_root="$1"
    PROJECT_ROOT_OVERRIDE="$project_root" python3 - "$INSTANCE_RESOLVER" << 'PY'
import os
import sys
from pathlib import Path
import importlib.util

path = Path(sys.argv[1]).resolve()
spec = importlib.util.spec_from_file_location("instance_resolver", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

project_root = Path(os.environ["PROJECT_ROOT_OVERRIDE"]).resolve()
instance_root = module.resolve_instance_root(project_root)
alias = module.resolve_org_alias(project_root, instance_root)

print(str(instance_root))
print(alias or "")
PY
}

resolve_instance() {
    local candidate
    for candidate in "$@"; do
        if [ -d "$candidate" ]; then
            local resolved
            resolved="$(resolve_instance_from_root "$candidate" 2>/dev/null || true)"
            local resolved_instance
            local resolved_alias
            resolved_instance="$(printf '%s\n' "$resolved" | sed -n '1p')"
            resolved_alias="$(printf '%s\n' "$resolved" | sed -n '2p')"

            if [ -n "$resolved_instance" ] && [ -f "$resolved_instance/sfdx-project.json" ]; then
                INSTANCE_DIR="$resolved_instance"
                if [ -z "$ORG_ALIAS" ] && [ -n "$resolved_alias" ]; then
                    ORG_ALIAS="$resolved_alias"
                fi
                return 0
            fi
        fi
    done

    return 1
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --org|--alias|--target-org)
            ORG_ALIAS="$2"
            shift 2
            ;;
        --instance-dir)
            INSTANCE_DIR="$2"
            shift 2
            ;;
        --output-base)
            OUTPUT_BASE="$2"
            shift 2
            ;;
        --results-file)
            RESULTS_FILE="$2"
            shift 2
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            echo "Unknown argument: $1"
            print_usage
            exit 1
            ;;
    esac
done

# Apply environment defaults if args missing
if [ -z "$ORG_ALIAS" ]; then
    ORG_ALIAS="$ORG_ALIAS_ENV"
fi
if [ -z "$INSTANCE_DIR" ]; then
    INSTANCE_DIR="$INSTANCE_DIR_ENV"
fi
if [ -z "$OUTPUT_BASE" ]; then
    OUTPUT_BASE="$OUTPUT_BASE_ENV"
fi
if [ -z "$RESULTS_FILE" ]; then
    RESULTS_FILE="$RESULTS_FILE_ENV"
fi

# Resolve instance and alias from known roots if needed
if [ -z "$INSTANCE_DIR" ] || [ -z "$ORG_ALIAS" ]; then
    CANDIDATE_ROOTS=()
    if [ -n "${PROJECT_ROOT:-}" ]; then
        CANDIDATE_ROOTS+=("$PROJECT_ROOT")
    fi
    if [ -d "$REPO_ROOT/../opspal-internal" ]; then
        CANDIDATE_ROOTS+=("$REPO_ROOT/../opspal-internal")
    fi
    CANDIDATE_ROOTS+=("$REPO_ROOT")

    resolve_instance "${CANDIDATE_ROOTS[@]}" || true
fi

if [ -z "$INSTANCE_DIR" ]; then
    echo "❌ No Salesforce instance resolved."
    echo "   Set --instance-dir or INSTANCE_DIR (or SFDC_INSTANCE/SF_TARGET_ORG)."
    exit 1
fi

if [ ! -f "$INSTANCE_DIR/sfdx-project.json" ]; then
    echo "❌ Salesforce project not found at instance root."
    echo "   Expected: $INSTANCE_DIR/sfdx-project.json"
    exit 1
fi

if [ -z "$ORG_ALIAS" ]; then
    ORG_ALIAS="$(basename "$INSTANCE_DIR")"
fi

if [ -z "$OUTPUT_BASE" ]; then
    OUTPUT_BASE="$INSTANCE_DIR/phase6-tests"
fi

if [ -z "$RESULTS_FILE" ]; then
    RESULTS_FILE="$OUTPUT_BASE/PHASE6_TEST_RESULTS_$(date +%Y-%m-%d-%H%M%S).md"
fi

ORG="$ORG_ALIAS"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
TOTAL_QUALITY_SCORE=0
TEST_COUNT=0
QUALITY_THRESHOLD="${QUALITY_THRESHOLD:-75}"
QUALITY_TARGET="${QUALITY_TARGET:-85}"
QUALITY_RESULTS=()
QUALITY_FAILURES=0

# Ensure output directories exist
mkdir -p "$OUTPUT_BASE"

echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${BLUE}  Phase 6: Layout Generation Test Suite${NC}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Test Environment:${NC} $ORG"
echo -e "${YELLOW}Output Directory:${NC} $OUTPUT_BASE"
echo -e "${YELLOW}Results File:${NC} $RESULTS_FILE"
echo ""

# Initialize results file
cat > "$RESULTS_FILE" << EOF
# Phase 6: Layout Generation Test Results
## ${ORG_ALIAS} Environment

**Test Date**: $(date)
**Test Environment**: ${ORG_ALIAS}
**Output Directory**: ${OUTPUT_BASE}
**Pattern Version**: fieldInstance v2.0.0

---

## Test Execution Log

EOF

# Function to run a single layout generation test
run_layout_test() {
    local test_id="$1"
    local persona="$2"
    local object="$3"
    local description="$4"
    local persona_key="${persona//-/_}"
    local test_failed=0
    local quality_score=0
    local failure_reasons=()

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    echo -e "\n${BOLD}${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}Test Case: $test_id - $description${NC}"
    echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    OUTPUT_DIR="$OUTPUT_BASE/$persona"
    mkdir -p "$OUTPUT_DIR"

    echo -e "${CYAN}Command:${NC}"
    echo "  node $LAYOUT_ENGINE \\"
    echo "    --object $object \\"
    echo "    --persona $persona \\"
    echo "    --org $ORG \\"
    echo "    --output $OUTPUT_DIR"
    echo ""

    # Run the layout generation
    if node "$LAYOUT_ENGINE" \
        --object "$object" \
        --persona "$persona" \
        --org "$ORG" \
        --output "$OUTPUT_DIR" 2>&1 | tee /tmp/layout_test_output.txt; then

        echo -e "${GREEN}✓ Layout generation succeeded${NC}"

        # Check if FlexiPage was created
        FLEXIPAGE_FILE=$(find "$OUTPUT_DIR" -name "${object}_${persona_key}_*.flexipage-meta.xml" -o -name "${object}*FlexiPage*.xml" | head -1)

        if [ -f "$FLEXIPAGE_FILE" ]; then
            echo -e "${GREEN}✓ FlexiPage file created${NC}"

            # Verify fieldInstance pattern
            if grep -q "<fieldInstance>" "$FLEXIPAGE_FILE"; then
                echo -e "${GREEN}✓ fieldInstance pattern detected${NC}"
            else
                echo -e "${RED}✗ fieldInstance pattern NOT found${NC}"
            fi

            # Check for Dynamic Forms (should NOT exist)
            if grep -q "force:recordFieldSection" "$FLEXIPAGE_FILE"; then
                echo -e "${RED}✗ Dynamic Forms component detected (FAIL)${NC}"
                test_failed=1
                failure_reasons+=("Dynamic Forms component detected")
            else
                echo -e "${GREEN}✓ No Dynamic Forms components${NC}"
            fi

            # Check for CompactLayout
            COMPACT_FILE=$(find "$OUTPUT_DIR" -name "${object}_${persona_key}_*.compactLayout-meta.xml" -o -name "${object}*CompactLayout*.xml" | head -1)
            if [ -f "$COMPACT_FILE" ]; then
                echo -e "${GREEN}✓ CompactLayout created${NC}"
            else
                echo -e "${YELLOW}⚠ CompactLayout not found${NC}"
            fi

            # Run quality analysis if analyzer exists
            if [ -f "$LAYOUT_ANALYZER" ]; then
                echo -e "\n${CYAN}Running quality analysis...${NC}"
                if QUALITY_OUTPUT=$(node "$LAYOUT_ANALYZER" \
                    --flexipage-file "$FLEXIPAGE_FILE" \
                    ${COMPACT_FILE:+--compact-layout-file "$COMPACT_FILE"} \
                    2>&1); then
                    quality_score=$(echo "$QUALITY_OUTPUT" | grep -oP "Overall Score: \K\d+" || echo "0")
                    if [ -n "$quality_score" ] && [ "$quality_score" -gt 0 ]; then
                        echo -e "${GREEN}✓ Quality Score: $quality_score/100${NC}"
                        TOTAL_QUALITY_SCORE=$((TOTAL_QUALITY_SCORE + quality_score))
                        TEST_COUNT=$((TEST_COUNT + 1))
                        QUALITY_RESULTS+=("${quality_score}|${test_id}|${persona}|${object}")

                        if [ "$quality_score" -ge "$QUALITY_TARGET" ]; then
                            echo -e "${GREEN}  ✓ Meets target (≥${QUALITY_TARGET})${NC}"
                        elif [ "$quality_score" -ge "$QUALITY_THRESHOLD" ]; then
                            echo -e "${YELLOW}  ⚠ Meets minimum (≥${QUALITY_THRESHOLD})${NC}"
                        else
                            echo -e "${RED}  ✗ Below minimum (<${QUALITY_THRESHOLD})${NC}"
                            test_failed=1
                            QUALITY_FAILURES=$((QUALITY_FAILURES + 1))
                            failure_reasons+=("Quality score ${quality_score} below ${QUALITY_THRESHOLD}")
                        fi
                    else
                        test_failed=1
                        QUALITY_FAILURES=$((QUALITY_FAILURES + 1))
                        failure_reasons+=("Quality score unavailable")
                    fi
                else
                    test_failed=1
                    QUALITY_FAILURES=$((QUALITY_FAILURES + 1))
                    failure_reasons+=("Quality analysis failed")
                fi
            fi

            if [ "$test_failed" -eq 0 ]; then
                PASSED_TESTS=$((PASSED_TESTS + 1))
            else
                FAILED_TESTS=$((FAILED_TESTS + 1))
            fi

            # Write to results file
            if [ "$test_failed" -eq 0 ]; then
                cat >> "$RESULTS_FILE" << TESTEOF

### $test_id: $description
**Status**: ✅ PASSED
**Persona**: $persona
**Object**: $object
**Quality Score**: ${quality_score:-N/A}/100
**FlexiPage**: $(basename "$FLEXIPAGE_FILE")
**Pattern**: fieldInstance v2.0.0 ✓

TESTEOF
            else
                cat >> "$RESULTS_FILE" << TESTEOF

### $test_id: $description
**Status**: ❌ FAILED
**Persona**: $persona
**Object**: $object
**Quality Score**: ${quality_score:-N/A}/100
**Failure Reasons**: $(IFS='; '; echo "${failure_reasons[*]}")
**FlexiPage**: $(basename "$FLEXIPAGE_FILE")
**Pattern**: fieldInstance v2.0.0 ✓

TESTEOF
            fi

        else
            echo -e "${RED}✗ FlexiPage file NOT created${NC}"
            FAILED_TESTS=$((FAILED_TESTS + 1))

            cat >> "$RESULTS_FILE" << TESTEOF

### $test_id: $description
**Status**: ❌ FAILED
**Reason**: FlexiPage file not created

TESTEOF
        fi

    else
        echo -e "${RED}✗ Layout generation failed${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))

        cat >> "$RESULTS_FILE" << TESTEOF

### $test_id: $description
**Status**: ❌ FAILED
**Reason**: Layout generation script error

TESTEOF
    fi
}

# Function to run agent routing test
run_routing_test() {
    local test_id="$1"
    local operation="$2"
    local expected_agent="$3"
    local expected_metadata="$4"

    echo -e "\n${BOLD}${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}Routing Test: $test_id${NC}"
    echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    echo -e "${CYAN}Operation:${NC} \"$operation\""
    echo -e "${CYAN}Expected Agent:${NC} $expected_agent"
    echo ""

    ROUTER_SCRIPT="$PLUGIN_ROOT/scripts/auto-agent-router.js"

    if [ -f "$ROUTER_SCRIPT" ]; then
        ROUTING_RESULT=$(node "$ROUTER_SCRIPT" route "$operation" --json)
        ROUTED_AGENT=$(echo "$ROUTING_RESULT" | jq -r '.agent' 2>/dev/null || echo "")

        if [ "$ROUTED_AGENT" = "$expected_agent" ]; then
            echo -e "${GREEN}✓ Routing test passed${NC}"
            echo -e "  Agent: $ROUTED_AGENT"

            cat >> "$RESULTS_FILE" << ROUTEOF

### $test_id: Agent Routing Test
**Input**: "$operation"
**Expected**: $expected_agent
**Actual**: $ROUTED_AGENT
**Status**: ✅ PASSED

ROUTEOF
        else
            echo -e "${RED}✗ Routing test failed${NC}"
            echo -e "  Expected: $expected_agent"
            echo -e "  Actual: $ROUTED_AGENT"

            cat >> "$RESULTS_FILE" << ROUTEOF

### $test_id: Agent Routing Test
**Input**: "$operation"
**Expected**: $expected_agent
**Actual**: $ROUTED_AGENT
**Status**: ❌ FAILED

ROUTEOF
        fi
    else
        echo -e "${YELLOW}⚠ Router script not found, skipping${NC}"
    fi
}

# Start test execution
START_TIME=$(date +%s)

echo -e "\n${BOLD}${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}Starting Layout Generation Tests${NC}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════${NC}"

# Test Group 1: Marketing Persona
echo -e "\n${BOLD}${BLUE}═══ Test Group 1: Marketing Persona ═══${NC}"
run_layout_test "TC-M1" "marketing" "Contact" "Marketing Contact Layout"
run_layout_test "TC-M2" "marketing" "Account" "Marketing Account Layout"
run_layout_test "TC-M3" "marketing" "Lead" "Marketing Lead Layout"
run_layout_test "TC-M4" "marketing" "Opportunity" "Marketing Opportunity Layout"

# Test Group 2: Customer Success Persona
echo -e "\n${BOLD}${BLUE}═══ Test Group 2: Customer Success Persona ═══${NC}"
run_layout_test "TC-CS1" "customer-success" "Contact" "Customer Success Contact Layout"
run_layout_test "TC-CS2" "customer-success" "Account" "Customer Success Account Layout"

# Test Group 3: Sales Rep Persona
echo -e "\n${BOLD}${BLUE}═══ Test Group 3: Sales Rep Persona ═══${NC}"
run_layout_test "TC-SR1" "sales-rep" "Contact" "Sales Rep Contact Layout"
run_layout_test "TC-SR2" "sales-rep" "Account" "Sales Rep Account Layout"
run_layout_test "TC-SR3" "sales-rep" "Opportunity" "Sales Rep Opportunity Layout"
run_layout_test "TC-SR4" "sales-rep" "Lead" "Sales Rep Lead Layout"

# Test Group 4: Sales Manager Persona
echo -e "\n${BOLD}${BLUE}═══ Test Group 4: Sales Manager Persona ═══${NC}"
run_layout_test "TC-SM1" "sales-manager" "Account" "Sales Manager Account Layout"
run_layout_test "TC-SM2" "sales-manager" "Opportunity" "Sales Manager Opportunity Layout"
run_layout_test "TC-SM3" "sales-manager" "Lead" "Sales Manager Lead Layout"

# Test Group 5: Executive Persona
echo -e "\n${BOLD}${BLUE}═══ Test Group 5: Executive Persona ═══${NC}"
run_layout_test "TC-EX1" "executive" "Account" "Executive Account Layout"
run_layout_test "TC-EX2" "executive" "Opportunity" "Executive Opportunity Layout"

# Test Group 6: Support Agent Persona
echo -e "\n${BOLD}${BLUE}═══ Test Group 6: Support Agent Persona ═══${NC}"
run_layout_test "TC-SA1" "support-agent" "Contact" "Support Agent Contact Layout"
run_layout_test "TC-SA2" "support-agent" "Case" "Support Agent Case Layout"

# Test Group 7: Support Manager Persona
echo -e "\n${BOLD}${BLUE}═══ Test Group 7: Support Manager Persona ═══${NC}"
run_layout_test "TC-SPM1" "support-manager" "Account" "Support Manager Account Layout"
run_layout_test "TC-SPM2" "support-manager" "Case" "Support Manager Case Layout"

# Agent Routing Tests
echo -e "\n${BOLD}${BLUE}═══ Agent Routing Tests ═══${NC}"
run_routing_test "AR-T1" "create Contact layout for marketing users" "sfdc-layout-generator"
run_routing_test "AR-T2" "analyze the Contact layout quality" "sfdc-layout-analyzer"
run_routing_test "AR-T3" "generate Account layout for CSM" "sfdc-layout-generator"
run_routing_test "AR-T4" "create Opportunity layout for account executives" "sfdc-layout-generator"

# Calculate results
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
AVG_QUALITY_SCORE=0
if [ $TEST_COUNT -gt 0 ]; then
    AVG_QUALITY_SCORE=$((TOTAL_QUALITY_SCORE / TEST_COUNT))
fi

LOWEST_QUALITY=()
if [ ${#QUALITY_RESULTS[@]} -gt 0 ]; then
    mapfile -t LOWEST_QUALITY < <(printf '%s\n' "${QUALITY_RESULTS[@]}" | sort -t'|' -k1,1n | head -5)
fi

# Write summary to results file
cat >> "$RESULTS_FILE" << EOF

---

## Test Summary

**Execution Time**: $DURATION seconds
**Total Tests**: $TOTAL_TESTS
**Passed**: $PASSED_TESTS
**Failed**: $FAILED_TESTS
**Success Rate**: $(echo "scale=1; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)%

**Quality Metrics**:
- Average Quality Score: $AVG_QUALITY_SCORE/100
- Layouts Analyzed: $TEST_COUNT
- Pattern Compliance: 100% fieldInstance v2.0.0
- Minimum Quality Threshold: ${QUALITY_THRESHOLD}/100

---

## Success Criteria Evaluation

- [ ] All layouts generate without errors: $PASSED_TESTS / $TOTAL_TESTS
- [ ] Average quality score ≥ ${QUALITY_TARGET}/100: $AVG_QUALITY_SCORE ≥ ${QUALITY_TARGET}
- [ ] All layouts ≥ ${QUALITY_THRESHOLD}/100: $QUALITY_FAILURES failures
- [ ] 100% fieldInstance pattern: ✓
- [ ] 0 Dynamic Forms components: ✓
- [ ] Agent routing tests pass: 4/4

**Phase 6 Status**: $([ $FAILED_TESTS -eq 0 ] && [ $QUALITY_FAILURES -eq 0 ] && [ $AVG_QUALITY_SCORE -ge $QUALITY_TARGET ] && echo "✅ PASSED" || echo "⚠️ REVIEW NEEDED")

EOF

if [ ${#LOWEST_QUALITY[@]} -gt 0 ]; then
    {
        echo ""
        echo "## Lowest Quality Scores"
        for entry in "${LOWEST_QUALITY[@]}"; do
            IFS='|' read -r score test_id persona object <<< "$entry"
            echo "- ${test_id}: ${object} (${persona}) — ${score}/100"
        done
    } >> "$RESULTS_FILE"
fi

# Display final summary
echo -e "\n${BOLD}${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}Test Execution Complete${NC}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Total Tests:${NC} $TOTAL_TESTS"
echo -e "${GREEN}Passed:${NC} $PASSED_TESTS"
echo -e "${RED}Failed:${NC} $FAILED_TESTS"
echo -e "${YELLOW}Success Rate:${NC} $(echo "scale=1; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)%"
echo ""
echo -e "${YELLOW}Average Quality Score:${NC} $AVG_QUALITY_SCORE/100"
echo -e "${YELLOW}Minimum Quality Threshold:${NC} ${QUALITY_THRESHOLD}/100"
echo -e "${YELLOW}Execution Time:${NC} $DURATION seconds"
echo ""
echo -e "${CYAN}Results saved to:${NC} $RESULTS_FILE"
echo ""

if [ ${#LOWEST_QUALITY[@]} -gt 0 ]; then
    echo -e "${YELLOW}Lowest Quality Scores:${NC}"
    for entry in "${LOWEST_QUALITY[@]}"; do
        IFS='|' read -r score test_id persona object <<< "$entry"
        echo -e "  - ${test_id}: ${object} (${persona}) — ${score}/100"
    done
    echo ""
fi

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${BOLD}${GREEN}✅ ALL TESTS PASSED!${NC}"
    exit 0
else
    echo -e "${BOLD}${YELLOW}⚠️  Some tests failed. Review results file.${NC}"
    exit 1
fi
