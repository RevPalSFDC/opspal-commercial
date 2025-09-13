#!/bin/bash

# Agent Discovery SessionStart Hook
# Lists available agents and their triggers at the start of each session

echo "🤖 RevPal Agent System - Available Agents"
echo "=========================================="
echo ""
echo "📋 Quick Reference (Use Task tool to invoke):"
echo ""

# High-priority proactive agents
echo "🚀 PROACTIVE AGENTS (Use these automatically):"
echo "  • release-coordinator     → After merge to main, before deploy"
echo "  • project-orchestrator    → Multi-repo tasks"
echo "  • quality-control-analyzer → After sprints, recurring issues"
echo ""

# Task-specific agents
echo "🎯 TASK-SPECIFIC AGENTS:"
echo "  Salesforce (in platforms/SFDC/.claude/agents/):"
echo "    • sfdc-conflict-resolver    → Deployment failures"
echo "    • sfdc-merge-orchestrator   → Merge fields/objects"
echo "    • sfdc-state-discovery      → Org analysis"
echo "    • sfdc-dependency-analyzer  → Dependency mapping"
echo ""
echo "  Planning:"
echo "    • sequential-planner → Complex/unknown tasks [SEQUENTIAL]"
echo ""
echo "  Google Drive:"
echo "    • gdrive-document-manager  → Documents/specs"
echo "    • gdrive-template-library  → Templates"
echo "    • gdrive-report-exporter   → Export reports"
echo ""
echo "  System:"
echo "    • router-doctor     → Agent discovery issues"
echo "    • mcp-guardian      → MCP validation"
echo "    • claude-compliance-enforcer → Standards check"
echo ""

# User control flags
echo "🎮 USER CONTROL FLAGS:"
echo "  [SEQUENTIAL] or [PLAN_CAREFULLY] → Force sequential planning"
echo "  [DIRECT] or [QUICK_MODE]         → Skip agents"
echo "  [RELEASE] or [DEPLOY]            → Trigger release-coordinator"
echo ""

# Check for agent configuration issues
AGENT_COUNT=$(ls .claude/agents/*.md 2>/dev/null | wc -l)
SFDC_AGENT_COUNT=$(ls platforms/SFDC/.claude/agents/*.md 2>/dev/null | wc -l)
TOTAL_AGENTS=$((AGENT_COUNT + SFDC_AGENT_COUNT))
if [ "$TOTAL_AGENTS" -gt 0 ]; then
    echo "✅ $TOTAL_AGENTS agents configured and ready ($AGENT_COUNT in .claude/agents/, $SFDC_AGENT_COUNT in platforms/SFDC)"
else
    echo "⚠️  Warning: No agents found"
fi

# Check MCP servers
if [ -f ".mcp.json" ]; then
    MCP_COUNT=$(grep -c '"command"' .mcp.json 2>/dev/null || echo 0)
    echo "✅ $MCP_COUNT MCP servers configured"
else
    echo "⚠️  Warning: .mcp.json not found"
fi

echo ""
echo "💡 Tip: Check 'AGENT_USAGE_EXAMPLES.md' for detailed examples"
echo "📊 Run 'node scripts/test-agent-routing.js' to test routing"
echo ""