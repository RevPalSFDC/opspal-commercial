#!/bin/bash
# Enhanced Runbook Generator - End-to-End Pipeline
#
# Purpose: Generate intelligent runbook from observations and reflections
# Usage: bash generate-enhanced-runbook.sh <org-alias>
#
# Pipeline:
#   1. Query reflections from Supabase (optional)
#   2. Synthesize observations with LLM intelligence
#   3. Merge synthesis with reflection sections
#   4. Render final runbook
#
# Exit Codes:
#   0 - Success
#   1 - Error

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}📚 Enhanced Runbook Generator${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check arguments
if [ $# -eq 0 ]; then
    echo -e "${RED}❌ Missing required argument: org-alias${NC}"
    echo ""
    echo "Usage: $0 <org-alias>"
    echo ""
    echo "Example:"
    echo "  $0 rentable-sandbox"
    exit 1
fi

ORG="$1"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

resolve_domain_root() {
  local dir="$1"
  while [[ "$dir" != "/" ]]; do
    if [[ -d "$dir/scripts" ]]; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  echo "$1"
}

PLUGIN_ROOT=""
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
  DOMAIN_NAME="$(basename "$(resolve_domain_root "$SCRIPT_DIR")")"
  case "$CLAUDE_PLUGIN_ROOT" in
    *"/packages/domains/$DOMAIN_NAME"|*/"$DOMAIN_NAME"-plugin) PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT" ;;
  esac
fi

# Use Node.js path-conventions for robust resolution
if [ -z "$PLUGIN_ROOT" ] && [ -f "$SCRIPT_DIR/path-conventions.js" ]; then
  PLUGIN_ROOT=$(node -e "
    const pc = require('$SCRIPT_DIR/path-conventions.js');
    console.log(pc.resolvePluginRoot('$SCRIPT_DIR'));
  " 2>/dev/null)
fi

# Final fallback: walk up from script location
if [ -z "$PLUGIN_ROOT" ] || [ ! -d "$PLUGIN_ROOT" ]; then
  PLUGIN_ROOT="$(resolve_domain_root "$SCRIPT_DIR")"
fi

# Validate plugin root exists and contains expected markers
if [ ! -f "$PLUGIN_ROOT/plugin.json" ] && [ ! -f "$PLUGIN_ROOT/.claude-plugin/plugin.json" ] \
  && [ ! -f "$PLUGIN_ROOT/scripts/lib/runbook-synthesizer.js" ]; then
  echo -e "${RED}❌ Could not determine plugin root directory${NC}" >&2
  echo "   Tried: $PLUGIN_ROOT" >&2
  echo "" >&2
  echo "   Please set CLAUDE_PLUGIN_ROOT environment variable:" >&2
  echo "   export CLAUDE_PLUGIN_ROOT=/path/to/opspal-core-plugin/packages/domains/salesforce" >&2
  echo "" >&2
  echo "   Example:" >&2
  echo "   export CLAUDE_PLUGIN_ROOT=$(pwd)/.claude-plugins/opspal-core-plugin/packages/domains/salesforce" >&2
  echo "   # Legacy layout: export CLAUDE_PLUGIN_ROOT=$(pwd)/.claude-plugins/salesforce-plugin" >&2
  exit 1
fi

INSTANCES_DIR="$PLUGIN_ROOT/instances/salesforce/$ORG"

echo -e "${YELLOW}📍 Configuration:${NC}"
echo "   Org: $ORG"
echo "   Plugin Root: $PLUGIN_ROOT"
echo "   Instances Dir: $INSTANCES_DIR"
echo ""

# Create instances directory if needed
mkdir -p "$INSTANCES_DIR"

# Step 1: Query reflections (optional - may not exist)
echo -e "${YELLOW}Step 1/4: Querying reflections from Supabase...${NC}"
REFLECTION_SECTIONS="$INSTANCES_DIR/reflection-sections.json"

set +e  # Don't fail if no reflections found
node "$PLUGIN_ROOT/scripts/lib/runbook-reflection-bridge.js" \
  --org "$ORG" \
  --limit 50 \
  --output "$REFLECTION_SECTIONS" 2>/dev/null

if [ -f "$REFLECTION_SECTIONS" ]; then
    echo -e "${GREEN}✅ Reflection sections saved${NC}"
else
    echo -e "${YELLOW}⚠️  No reflections found (this is normal for new instances)${NC}"
    REFLECTION_SECTIONS=""
fi
set -e
echo ""

# Step 2: Synthesize observations
echo -e "${YELLOW}Step 2/4: Synthesizing observations with LLM intelligence...${NC}"
SYNTHESIS="$INSTANCES_DIR/synthesis.json"

SYNTHESIS_CMD=(node "$PLUGIN_ROOT/scripts/lib/runbook-synthesizer.js" \
  --org "$ORG" \
  --output "$SYNTHESIS")

if [ -n "$REFLECTION_SECTIONS" ] && [ -f "$REFLECTION_SECTIONS" ]; then
    SYNTHESIS_CMD+=(--reflection-sections "$REFLECTION_SECTIONS")
fi

"${SYNTHESIS_CMD[@]}"
echo ""

# Step 3: Render runbook
echo -e "${YELLOW}Step 3/4: Rendering runbook template...${NC}"
RUNBOOK="$INSTANCES_DIR/RUNBOOK.md"

RENDER_CMD=(node "$PLUGIN_ROOT/scripts/lib/runbook-renderer.js" \
  --org "$ORG" \
  --output "$RUNBOOK")

if [ -f "$SYNTHESIS" ]; then
    RENDER_CMD+=(--reflection-sections "$SYNTHESIS")
fi

"${RENDER_CMD[@]}"
echo ""

# Step 4: Display summary
echo -e "${GREEN}✅ Runbook generation complete!${NC}"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}📄 Generated Files:${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ -f "$REFLECTION_SECTIONS" ]; then
    echo -e "${GREEN}✓${NC} Reflection Sections: $REFLECTION_SECTIONS"
fi
echo -e "${GREEN}✓${NC} Synthesis Output:     $SYNTHESIS"
echo -e "${GREEN}✓${NC} Final Runbook:        $RUNBOOK"
echo ""

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}📊 Runbook Contents:${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Extract key metrics from synthesis
if [ -f "$SYNTHESIS" ]; then
    TOTAL_OPS=$(jq -r '.basic_patterns.total_operations // 0' "$SYNTHESIS")
    SUCCESS_RATE=$(jq -r '.basic_patterns.success_rate // 0' "$SYNTHESIS")
    OBJECTS_COUNT=$(jq -r '.basic_patterns.objects_touched | length' "$SYNTHESIS")
    AGENTS_COUNT=$(jq -r '.basic_patterns.agents_used | length' "$SYNTHESIS")
    RECOMMENDATIONS=$(jq -r '.operational_recommendations | length' "$SYNTHESIS")

    echo "   Operations Observed: $TOTAL_OPS"
    echo "   Success Rate: ${SUCCESS_RATE}%"
    echo "   Objects: $OBJECTS_COUNT"
    echo "   Agents Used: $AGENTS_COUNT"
    echo "   Recommendations: $RECOMMENDATIONS"
fi
echo ""

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 Ready to view!${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "View runbook:"
echo -e "  ${YELLOW}cat $RUNBOOK${NC}"
echo ""
echo "View synthesis data:"
echo -e "  ${YELLOW}cat $SYNTHESIS | jq .${NC}"
echo ""
