#!/bin/bash
# Auto-update script for agent registry maintenance
# Updates counts, discovers new agents, and validates the registry

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLATFORMS_DIR="$(dirname "$SCRIPT_DIR")"
REGISTRY_FILE="$PLATFORMS_DIR/.claude/agents.roster.json"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "🔄 Agent Registry Auto-Update Script"
echo "======================================"
echo "Registry: $REGISTRY_FILE"
echo "Timestamp: $TIMESTAMP"
echo ""

# Function to count agents in a directory
count_agents() {
    local path="$1"
    local pattern="${2:-*.md}"

    if [ ! -d "$path" ]; then
        echo "0"
        return
    fi

    # Count .md files, excluding README and other docs
    find "$path" -maxdepth 1 -name "$pattern" -type f 2>/dev/null | \
        grep -v README | \
        grep -v DATA_SOURCE | \
        grep -v REQUIREMENTS | \
        wc -l
}

# Function to list key agents (first 10 non-doc files)
list_key_agents() {
    local path="$1"
    local pattern="${2:-*.md}"

    if [ ! -d "$path" ]; then
        echo "[]"
        return
    fi

    # Get first 10 agent names as JSON array
    agents=$(find "$path" -maxdepth 1 -name "$pattern" -type f 2>/dev/null | \
        grep -v README | \
        grep -v DATA_SOURCE | \
        grep -v REQUIREMENTS | \
        head -10 | \
        xargs -I {} basename {} .md | \
        jq -R . | jq -s .)

    echo "${agents:-[]}"
}

echo "📊 Counting agents in each category..."
echo ""

# Count agents in each location
# Note: Unified count includes symlinks from parent directory
UNIFIED_COUNT=$(ls -1 "$PLATFORMS_DIR"/.claude/agents/*.md 2>/dev/null | grep -v README | grep -v DATA_SOURCE | wc -l)
SFDC_COUNT=$(count_agents "$PLATFORMS_DIR/SFDC/.claude/agents" "sfdc-*.md")
SFDC_TOTAL=$(ls -1 "$PLATFORMS_DIR"/SFDC/.claude/agents/*.md 2>/dev/null | grep -v README | grep -v DATA_SOURCE | wc -l)
HS_COUNT=$(count_agents "$PLATFORMS_DIR/HS/.claude/agents" "hubspot-*.md")
HS_TOTAL=$(count_agents "$PLATFORMS_DIR/HS/.claude/agents" "*.md")
OPS_COUNT=$(count_agents "$PLATFORMS_DIR/cross-platform-ops/.claude/agents" "*.md")
PARENT_COUNT=$(count_agents "$PLATFORMS_DIR/../.claude/agents" "*.md")

echo "  Unified: $UNIFIED_COUNT agents"
echo "  Salesforce: $SFDC_TOTAL total ($SFDC_COUNT sfdc-* pattern)"
echo "  HubSpot: $HS_TOTAL total ($HS_COUNT hubspot-* pattern)"
echo "  Cross-Platform Ops: $OPS_COUNT agents"
echo "  Parent Project: $PARENT_COUNT agents"
echo ""

TOTAL_COUNT=$((UNIFIED_COUNT + SFDC_TOTAL + HS_TOTAL + OPS_COUNT + PARENT_COUNT))
echo "  📈 Total: $TOTAL_COUNT agents"
echo ""

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo "❌ Error: jq is required but not installed"
    echo "Install with: sudo apt-get install jq"
    exit 1
fi

# Create backup
echo "💾 Creating backup..."
cp "$REGISTRY_FILE" "$REGISTRY_FILE.bak.$(date +%Y%m%d_%H%M%S)"

# Update the registry file with new counts
echo "✏️  Updating registry..."

# Use jq to update the JSON file
jq --arg timestamp "$TIMESTAMP" \
   --argjson unified_count "$UNIFIED_COUNT" \
   --argjson sfdc_count "$SFDC_TOTAL" \
   --argjson hs_count "$HS_TOTAL" \
   --argjson ops_count "$OPS_COUNT" \
   --argjson parent_count "$PARENT_COUNT" \
   --argjson total_count "$TOTAL_COUNT" \
   '.updated = $timestamp |
    .registry.unified.count = $unified_count |
    .registry.salesforce.count = $sfdc_count |
    .registry.hubspot.count = $hs_count |
    .registry.cross_platform_ops.count = $ops_count |
    .registry.parent_project.count = $parent_count |
    .statistics.total_agents = $total_count |
    .statistics.last_validated = $timestamp' \
    "$REGISTRY_FILE" > "$REGISTRY_FILE.tmp"

mv "$REGISTRY_FILE.tmp" "$REGISTRY_FILE"

echo "✅ Registry updated!"
echo ""

# Validate the updated registry
echo "🔍 Validating registry..."
cd "$PLATFORMS_DIR"
python3 scripts/discover-agents.py validate

echo ""
echo "📝 Summary"
echo "=========="
echo "✅ Registry updated with current agent counts"
echo "✅ Backup created with timestamp"
echo "✅ Validation completed"
echo ""
echo "Next steps:"
echo "  1. Review any validation warnings above"
echo "  2. Commit the updated registry file"
echo "  3. Test agent discovery with: python3 scripts/discover-agents.py list"