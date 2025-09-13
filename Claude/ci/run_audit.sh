#!/usr/bin/env bash
# CI runner for Claude agent audits with proper exit codes
set -euo pipefail

# Colors for output (disabled in CI)
if [ -t 1 ]; then
  RED='\033[0;31m'
  YELLOW='\033[1;33m'
  GREEN='\033[0;32m'
  BLUE='\033[0;34m'
  NC='\033[0m'
else
  RED=''
  YELLOW=''
  GREEN=''
  BLUE=''
  NC=''
fi

echo -e "${BLUE}▶ Running Claude agent audit from $(pwd)${NC}"
echo "  Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
echo "  CI: ${CI:-false}"
echo ""

# Check if specific project requested (via env var)
if [ -n "${AUDIT_PROJECT:-}" ]; then
  echo -e "${BLUE}▶ Auditing specific project: $AUDIT_PROJECT${NC}"
  # Run project-specific audit
  claude /audit/project <<< "$AUDIT_PROJECT" || rc=$?
else
  echo -e "${BLUE}▶ Running batch audit on all projects${NC}"
  # Run full audit - produces CI exit codes:
  # 0=pass, 1=warn, 2=fail, 3=config error
  claude /audit/all || rc=$?
fi

rc=${rc:-0}

echo ""
echo -e "${BLUE}▶ Reports generated:${NC}"
if [ -d "reports" ]; then
  ls -la reports/*.md 2>/dev/null | tail -5 || echo "  No reports found"
else
  echo "  Reports directory not found"
fi

echo ""
echo -e "${BLUE}▶ Audit Result:${NC}"

case "$rc" in
  0)
    echo -e "${GREEN}✅ PASS${NC} - All agents meet quality standards"
    echo "  All heuristic scores < 2"
    ;;
  1)
    echo -e "${YELLOW}🟡 WARNING${NC} - Some agents need improvements"
    echo "  At least one heuristic score = 2"
    echo "  Review reports for recommended fixes"
    ;;
  2)
    echo -e "${RED}🔴 FAIL${NC} - Critical agent issues detected"
    echo "  At least one heuristic score ≥ 3"
    echo "  Must fix before merge"
    ;;
  3)
    echo -e "${RED}⚠️ CONFIGURATION ERROR${NC}"
    echo "  - Path traversal/security issue detected, OR"
    echo "  - MCP server mismatch (tools don't match .mcp.json), OR"
    echo "  - Agent name collision between project/user scope"
    echo "  Check reports for specific issues"
    ;;
  *)
    echo -e "${RED}❓ UNKNOWN EXIT CODE: $rc${NC}"
    echo "  Unexpected result - check logs"
    ;;
esac

# Generate metrics for monitoring
if [ -d "reports" ]; then
  echo ""
  echo -e "${BLUE}▶ Metrics:${NC}"
  
  # Count total agents across projects
  total_agents=$(grep -h "^name:" ../*/.claude/agents/*.md 2>/dev/null | wc -l || echo "0")
  echo "  Total agents across projects: $total_agents"
  
  # Count agents per project
  for dir in ../platforms/SFDC ../platforms/HS ../Agents; do
    if [ -d "$dir/.claude/agents" ]; then
      project=$(basename "$dir")
      count=$(ls -1 "$dir/.claude/agents"/*.md 2>/dev/null | wc -l || echo "0")
      echo "  $project: $count agents"
    fi
  done
  
  # Extract max scores if available
  latest_report=$(ls -t reports/*-audit-*.md 2>/dev/null | head -1)
  if [ -n "$latest_report" ] && [ -f "$latest_report" ]; then
    max_scores=$(grep -o "MAX_SCORES:.*" "$latest_report" 2>/dev/null | head -1 || echo "")
    if [ -n "$max_scores" ]; then
      echo "  $max_scores"
    fi
  fi
fi

# For GitHub Actions - set output
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "exit_code=$rc" >> "$GITHUB_OUTPUT"
  echo "status_emoji=$([ $rc -eq 0 ] && echo '✅' || [ $rc -eq 1 ] && echo '🟡' || echo '🔴')" >> "$GITHUB_OUTPUT"
fi

exit "$rc"