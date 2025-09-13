#!/bin/bash

# Agent Discovery Validation Script
# Validates that all agents are properly configured and discoverable

set -e

echo "🔍 Agent Discovery Validation"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
TOTAL_AGENTS=0
VALID_AGENTS=0
WARNINGS=0
ERRORS=0

# Check if running from correct directory
if [ ! -f "CLAUDE.md" ]; then
    echo -e "${RED}❌ Error: Must run from project root (where CLAUDE.md exists)${NC}"
    exit 1
fi

echo "📁 Checking agent configurations..."
echo ""

# Function to validate agent file
validate_agent() {
    local agent_file=$1
    local agent_name=$(basename "$agent_file" .md)
    local agent_location=$(dirname "$agent_file")
    local has_errors=false

    echo "Validating: $agent_name (in $agent_location)"
    
    # Check if file exists
    if [ ! -f "$agent_file" ]; then
        echo -e "  ${RED}❌ File not found${NC}"
        ((ERRORS++))
        return 1
    fi
    
    # Check for YAML frontmatter
    if ! head -1 "$agent_file" | grep -q "^---$"; then
        echo -e "  ${RED}❌ Missing YAML frontmatter${NC}"
        ((ERRORS++))
        has_errors=true
    fi
    
    # Extract frontmatter
    frontmatter=$(awk '/^---$/{i++}i==1' "$agent_file" | tail -n +2)
    
    # Check required fields
    if ! echo "$frontmatter" | grep -q "^name:"; then
        echo -e "  ${RED}❌ Missing 'name' field${NC}"
        ((ERRORS++))
        has_errors=true
    fi
    
    if ! echo "$frontmatter" | grep -q "^description:"; then
        echo -e "  ${RED}❌ Missing 'description' field${NC}"
        ((ERRORS++))
        has_errors=true
    fi
    
    if ! echo "$frontmatter" | grep -q "^tools:"; then
        echo -e "  ${YELLOW}⚠️  Missing 'tools' field${NC}"
        ((WARNINGS++))
    fi
    
    # Check for trigger keywords (new requirement)
    if ! echo "$frontmatter" | grep -q "TRIGGER KEYWORDS\|trigger"; then
        echo -e "  ${YELLOW}⚠️  No trigger keywords defined${NC}"
        ((WARNINGS++))
    fi
    
    # Check agent name consistency
    name_in_file=$(echo "$frontmatter" | grep "^name:" | cut -d':' -f2 | tr -d ' ')
    if [ "$name_in_file" != "$agent_name" ]; then
        echo -e "  ${RED}❌ Name mismatch: file='$agent_name', yaml='$name_in_file'${NC}"
        ((ERRORS++))
        has_errors=true
    fi
    
    if [ "$has_errors" = false ]; then
        echo -e "  ${GREEN}✅ Valid${NC}"
        ((VALID_AGENTS++))
    fi
    
    ((TOTAL_AGENTS++))
}

# Check project agents
echo "🔍 Project Agents (.claude/agents/):"
echo "-------------------------------------"
for agent in .claude/agents/*.md; do
    if [ -f "$agent" ]; then
        validate_agent "$agent"
    fi
done

# Check platform-specific agents
echo ""
echo "🔍 Platform-Specific Agents:"
echo "-------------------------------------"
for platform_dir in platforms/*/.claude/agents; do
    if [ -d "$platform_dir" ]; then
        platform_name=$(basename $(dirname $(dirname "$platform_dir")))
        echo "Platform: $platform_name"
        for agent in "$platform_dir"/*.md; do
            if [ -f "$agent" ]; then
                validate_agent "$agent"
            fi
        done
    fi
done

echo ""

# Check for YAML agent configs
echo "🔍 YAML Agent Configurations (agents/):"
echo "----------------------------------------"
YAML_COUNT=0
for yaml_file in agents/**/*.yaml; do
    if [ -f "$yaml_file" ]; then
        agent_name=$(basename "$yaml_file" .yaml)
        echo "Found: $agent_name"
        
        # Check if corresponding .md file exists
        md_file=".claude/agents/${agent_name}.md"
        if [ ! -f "$md_file" ]; then
            echo -e "  ${YELLOW}⚠️  No corresponding .md file in .claude/agents/${NC}"
            ((WARNINGS++))
        else
            echo -e "  ${GREEN}✅ Has .md configuration${NC}"
        fi
        ((YAML_COUNT++))
    fi
done

echo ""

# Check MCP configuration
echo "🔧 MCP Server Configuration:"
echo "----------------------------"
if [ -f ".mcp.json" ]; then
    echo -e "${GREEN}✅ .mcp.json found${NC}"
    
    # List MCP servers
    echo "Configured servers:"
    grep '"[^"]*":' .mcp.json | grep -v "mcpServers" | sed 's/.*"\([^"]*\)".*/  - \1/' | head -10
else
    echo -e "${RED}❌ .mcp.json not found${NC}"
    ((ERRORS++))
fi

echo ""

# Check for naming conflicts
echo "🔍 Checking for naming conflicts:"
echo "----------------------------------"
# Collect all project agents (main + platform-specific)
PROJECT_AGENTS=$(find .claude/agents platforms/*/.claude/agents -maxdepth 1 -name "*.md" 2>/dev/null | xargs -n1 basename 2>/dev/null | sed 's/.md$//' | sort | uniq)
USER_AGENTS=$(ls ~/.claude/agents/*.md 2>/dev/null | xargs -n1 basename | sed 's/.md$//' | sort)

CONFLICTS=$(comm -12 <(echo "$PROJECT_AGENTS") <(echo "$USER_AGENTS") 2>/dev/null)

if [ -n "$CONFLICTS" ]; then
    echo -e "${YELLOW}⚠️  Found naming conflicts with user agents:${NC}"
    echo "$CONFLICTS" | while read agent; do
        echo "  - $agent"
        ((WARNINGS++))
    done
else
    echo -e "${GREEN}✅ No naming conflicts detected${NC}"
fi

echo ""

# Check agent references in CLAUDE.md
echo "📄 CLAUDE.md Agent References:"
echo "------------------------------"
REFERENCED_AGENTS=$(grep -o '\*\*[a-z-]*\*\*' CLAUDE.md | sed 's/\*//g' | sort -u)
echo "Agents referenced in CLAUDE.md:"
echo "$REFERENCED_AGENTS" | while read agent; do
    if [ -f ".claude/agents/${agent}.md" ]; then
        echo -e "  ${GREEN}✅ $agent${NC}"
    else
        # Check if it's a category pattern
        if ls .claude/agents/${agent}*.md >/dev/null 2>&1; then
            echo -e "  ${GREEN}✅ $agent (pattern match)${NC}"
        else
            echo -e "  ${YELLOW}⚠️  $agent (not found)${NC}"
            ((WARNINGS++))
        fi
    fi
done

echo ""

# Summary
echo "======================================"
echo "📊 Validation Summary"
echo "======================================"
echo "Total Agents Found: $TOTAL_AGENTS"
echo "Valid Agents: $VALID_AGENTS"
echo "YAML Configs: $YAML_COUNT"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"
echo -e "Errors: ${RED}$ERRORS${NC}"

if [ $ERRORS -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "\n${GREEN}✅ All agents are properly configured!${NC}"
    else
        echo -e "\n${YELLOW}⚠️  Validation passed with warnings${NC}"
    fi
    exit 0
else
    echo -e "\n${RED}❌ Validation failed with errors${NC}"
    exit 1
fi