#!/bin/bash
# Test script for verifying agent invocation through registry
# Tests that agents from different directories can be called

set -e

echo "🧪 Agent Invocation Test Suite"
echo "=============================="
echo "Testing agent accessibility from platforms/ directory"
echo ""

# Function to test agent existence
test_agent() {
    local agent_name="$1"
    local category="$2"
    local expected_path="$3"

    echo -n "Testing $agent_name ($category)... "

    # Check if agent can be found
    if python3 scripts/discover-agents.py find --name "$agent_name" | grep -q "✅ Found"; then
        # Verify path is correct
        actual_path=$(python3 scripts/discover-agents.py find --name "$agent_name" | grep "Path:" | awk '{print $2}')

        if [[ "$actual_path" == *"$expected_path"* ]]; then
            echo "✅ Found at correct location"
            return 0
        else
            echo "⚠️  Found but wrong path: $actual_path"
            return 1
        fi
    else
        echo "❌ NOT FOUND"
        return 1
    fi
}

# Track results
PASSED=0
FAILED=0

echo "=== Testing Unified Agents (platforms/.claude/agents/) ==="
test_agent "unified-orchestrator" "unified" ".claude/agents/" && ((PASSED++)) || ((FAILED++))
test_agent "unified-reporting-aggregator" "unified" ".claude/agents/" && ((PASSED++)) || ((FAILED++))
test_agent "platform-instance-manager" "unified" ".claude/agents/" && ((PASSED++)) || ((FAILED++))
echo ""

echo "=== Testing Salesforce Agents (SFDC/.claude/agents/) ==="
test_agent "sfdc-orchestrator" "salesforce" "SFDC/.claude/agents/" && ((PASSED++)) || ((FAILED++))
test_agent "sfdc-metadata-manager" "salesforce" "SFDC/.claude/agents/" && ((PASSED++)) || ((FAILED++))
test_agent "sfdc-conflict-resolver" "salesforce" "SFDC/.claude/agents/" && ((PASSED++)) || ((FAILED++))
echo ""

echo "=== Testing HubSpot Agents (HS/.claude/agents/) ==="
test_agent "hubspot-orchestrator" "hubspot" "HS/.claude/agents/" && ((PASSED++)) || ((FAILED++))
test_agent "hubspot-workflow-builder" "hubspot" "HS/.claude/agents/" && ((PASSED++)) || ((FAILED++))
test_agent "hubspot-contact-manager" "hubspot" "HS/.claude/agents/" && ((PASSED++)) || ((FAILED++))
echo ""

echo "=== Testing Cross-Platform Ops Agents ==="
test_agent "cross-platform-orchestrator" "cross_platform_ops" "cross-platform-ops/.claude/agents/" && ((PASSED++)) || ((FAILED++))
test_agent "field-mapping-specialist" "cross_platform_ops" "cross-platform-ops/.claude/agents/" && ((PASSED++)) || ((FAILED++))
echo ""

echo "=== Testing Parent Project Agents ==="
test_agent "release-coordinator" "parent_project" "../.claude/agents/" && ((PASSED++)) || ((FAILED++))
test_agent "project-orchestrator" "parent_project" "../.claude/agents/" && ((PASSED++)) || ((FAILED++))
echo ""

# Summary
echo "=============================="
echo "📊 Test Results"
echo "=============================="
echo "✅ Passed: $PASSED"
echo "❌ Failed: $FAILED"
echo ""

if [ "$FAILED" -eq 0 ]; then
    echo "🎉 All tests passed! Agent registry is working correctly."
    echo ""
    echo "Claude Code can now invoke any of these agents using:"
    echo "  Task: <agent-name>"
    echo ""
    echo "Example:"
    echo "  Task: sfdc-metadata-manager"
    echo "  Description: 'Deploy Account custom fields'"
    exit 0
else
    echo "⚠️  Some tests failed. Check the registry configuration."
    exit 1
fi