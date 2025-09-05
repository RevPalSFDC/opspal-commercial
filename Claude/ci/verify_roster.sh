#!/usr/bin/env bash
# Verify agent roster matches expectations before running audits
set -euo pipefail

# Check dependencies
if ! command -v jq &> /dev/null; then
  echo "Error: jq is required but not installed"
  echo "Install with: apt-get install jq (or brew install jq on macOS)"
  exit 3
fi

# Colors (disabled in CI)
if [ -t 1 ] && [ "${CI:-}" != "true" ]; then
  RED='\033[0;31m'
  YELLOW='\033[1;33m'
  GREEN='\033[0;32m'
  BLUE='\033[0;34m'
  NC='\033[0m'
else
  RED=''; YELLOW=''; GREEN=''; BLUE=''; NC=''
fi

fail=0
warnings=""

# Function to check a single project
check_project() {
  local proj="$1"
  local path="$2"
  
  echo -e "${BLUE}• Verifying roster for $proj at $path${NC}"
  
  # Check if path exists
  if [ ! -d "$path" ]; then
    echo -e "  ${YELLOW}⚠️ Path not found: $path${NC}"
    return 1
  fi
  
  # Check if .claude/agents exists
  if [ ! -d "$path/.claude/agents" ]; then
    echo -e "  ${YELLOW}⚠️ No .claude/agents directory${NC}"
    return 1
  fi
  
  # Get actual agents
  mapfile -t have < <(ls -1 "$path/.claude/agents/"*.md 2>/dev/null | xargs -n1 -I{} basename {} .md | grep -v README | sort)
  
  # Get expected agents from roster
  local roster_file="agents.roster.json"
  if [ ! -f "$roster_file" ]; then
    echo -e "  ${RED}❌ Roster file not found: $roster_file${NC}"
    return 2
  fi
  
  # Handle both object and string array formats in roster
  mapfile -t want < <(
    jq -r --arg p "$proj" '
      .[$p].expected[]? | 
      if type == "object" then .name 
      else . 
      end
    ' "$roster_file" 2>/dev/null | sort
  )
  
  # Compare
  if [ ${#want[@]} -eq 0 ]; then
    echo -e "  ${YELLOW}⚠️ No expected agents defined in roster${NC}"
    warnings="${warnings}${proj}: No roster expectations defined\n"
    return 0
  fi
  
  # Find differences
  local missing=""
  local extra=""
  
  for agent in "${want[@]}"; do
    if [[ ! " ${have[@]} " =~ " ${agent} " ]]; then
      missing="${missing} ${agent}"
    fi
  done
  
  for agent in "${have[@]}"; do
    if [[ ! " ${want[@]} " =~ " ${agent} " ]]; then
      extra="${extra} ${agent}"
    fi
  done
  
  # Report results
  if [ -z "$missing" ] && [ -z "$extra" ]; then
    echo -e "  ${GREEN}✅ Roster matches (${#have[@]} agents)${NC}"
    return 0
  else
    echo -e "  ${RED}❌ Roster mismatch:${NC}"
    if [ -n "$missing" ]; then
      echo -e "    ${RED}Missing:${NC}$missing"
      fail=2
    fi
    if [ -n "$extra" ]; then
      echo -e "    ${YELLOW}Extra:${NC}$extra"
      [ "$fail" -lt 2 ] && fail=1  # Extra is warning, not failure
    fi
    return 1
  fi
}

# Function to validate tool permissions
check_tools() {
  local proj="$1"
  local path="$2"
  
  echo -e "${BLUE}• Checking tool permissions for $proj${NC}"
  
  # Get forbidden tools from roster
  mapfile -t forbidden < <(
    jq -r '.validation_rules.forbidden_tools[]?' agents.roster.json 2>/dev/null
  )
  
  if [ ${#forbidden[@]} -eq 0 ]; then
    echo "  No forbidden tools defined"
    return 0
  fi
  
  # Check each agent's tools
  local violations=""
  for agent_file in "$path/.claude/agents/"*.md; do
    [ ! -f "$agent_file" ] && continue
    [ "$(basename "$agent_file")" == "README.md" ] && continue
    
    agent=$(basename "$agent_file" .md)
    tools=$(grep "^tools:" "$agent_file" 2>/dev/null | sed 's/tools: //' || echo "")
    
    for forbidden_tool in "${forbidden[@]}"; do
      if [[ "$tools" == *"$forbidden_tool"* ]]; then
        violations="${violations}  $agent uses forbidden tool: $forbidden_tool\n"
        fail=2
      fi
    done
  done
  
  if [ -n "$violations" ]; then
    echo -e "  ${RED}❌ Forbidden tools detected:${NC}"
    echo -e "$violations"
    return 1
  else
    echo -e "  ${GREEN}✅ No forbidden tools${NC}"
    return 0
  fi
}

# Main verification
echo -e "${BLUE}═══ Agent Roster Verification ═══${NC}"
echo ""

# Check parent project (current directory has the refactored agents)
check_project "Agents" ".." || true
check_tools "Agents" ".." || true
echo ""

# Check ClaudeSFDC
check_project "ClaudeSFDC" "../ClaudeSFDC" || true
check_tools "ClaudeSFDC" "../ClaudeSFDC" || true
echo ""

# Check ClaudeHubSpot  
check_project "ClaudeHubSpot" "../ClaudeHubSpot" || true
check_tools "ClaudeHubSpot" "../ClaudeHubSpot" || true
echo ""

# Summary
echo -e "${BLUE}═══ Verification Summary ═══${NC}"

if [ -n "$warnings" ]; then
  echo -e "${YELLOW}Warnings:${NC}"
  echo -e "$warnings"
fi

case "$fail" in
  0)
    echo -e "${GREEN}✅ All rosters match expectations${NC}"
    ;;
  1)
    echo -e "${YELLOW}🟡 Extra agents detected (non-critical)${NC}"
    echo "Consider removing deprecated agents or updating roster"
    ;;
  2)
    echo -e "${RED}🔴 Roster verification FAILED${NC}"
    echo "Missing expected agents or forbidden tools detected"
    echo "Fix issues before proceeding with audit"
    ;;
  3)
    echo -e "${RED}⚠️ Configuration error${NC}"
    echo "Missing dependencies or configuration files"
    ;;
esac

exit "$fail"