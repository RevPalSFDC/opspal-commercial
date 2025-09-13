#!/bin/bash

# Validate Agent Path Configuration
# Ensures all agents use correct paths and respect instance boundaries
# Created: 2025-09-11

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Base paths
PROJECT_ROOT="/home/chris/Desktop/RevPal/Agents"
ERRORS_FOUND=0
WARNINGS_FOUND=0

echo "========================================="
echo "Agent Path Configuration Validator"
echo "========================================="
echo ""

# Function to check file for hardcoded paths
check_file_for_paths() {
    local file=$1
    local filename=$(basename "$file")
    
    # Check for old hardcoded paths
    if grep -q "~/SalesforceProjects" "$file" 2>/dev/null; then
        echo -e "${RED}✗ $filename contains hardcoded ~/SalesforceProjects path${NC}"
        grep -n "~/SalesforceProjects" "$file" | head -3
        ((ERRORS_FOUND++))
    fi
    
    if grep -q "~/ClaudeHubSpot" "$file" 2>/dev/null; then
        echo -e "${RED}✗ $filename contains hardcoded ~/ClaudeHubSpot path${NC}"
        grep -n "~/ClaudeHubSpot" "$file" | head -3
        ((ERRORS_FOUND++))
    fi
    
    # Check for old ClaudeSFDC references (excluding symlinks and docs)
    if ! echo "$file" | grep -q "\.md$"; then
        if grep -q "/ClaudeSFDC/" "$file" 2>/dev/null; then
            echo -e "${YELLOW}⚠ $filename contains /ClaudeSFDC/ reference${NC}"
            grep -n "/ClaudeSFDC/" "$file" | head -3
            ((WARNINGS_FOUND++))
        fi
    fi
}

echo "Checking Agent Files..."
echo "------------------------"

# Check all agent files
for agent_file in $(find "$PROJECT_ROOT" -path "*/.claude/agents/*.md" -type f); do
    check_file_for_paths "$agent_file"
done

echo ""
echo "Checking Script Files..."
echo "------------------------"

# Check script files
for script_file in $(find "$PROJECT_ROOT/platforms" -name "*.sh" -o -name "*.js" -o -name "*.py" | grep -v node_modules | grep -v .git); do
    check_file_for_paths "$script_file"
done

echo ""
echo "Verifying Path Resolution..."
echo "-----------------------------"

# Test path resolution script
if [ -f "$PROJECT_ROOT/platforms/SFDC/scripts/resolve-paths.sh" ]; then
    source "$PROJECT_ROOT/platforms/SFDC/scripts/resolve-paths.sh"
    
    # Test functions
    echo "Current Instance: $(getCurrentInstance)"
    
    if [ -z "$(getCurrentInstance)" ]; then
        echo -e "${YELLOW}⚠ No current instance set${NC}"
        ((WARNINGS_FOUND++))
    else
        echo -e "${GREEN}✓ Current instance is set${NC}"
    fi
    
    # List instances
    echo ""
    echo "Available Instances:"
    listInstances
else
    echo -e "${RED}✗ Path resolution script not found${NC}"
    ((ERRORS_FOUND++))
fi

echo ""
echo "Checking Instance Directories..."
echo "---------------------------------"

# Check instance structure
SFDC_INSTANCES="$PROJECT_ROOT/platforms/SFDC/instances"
if [ -d "$SFDC_INSTANCES" ]; then
    instance_count=$(ls -1 "$SFDC_INSTANCES" | wc -l)
    echo -e "${GREEN}✓ Found $instance_count SFDC instances${NC}"
    
    # Check each instance has required structure
    for instance in $(ls -1 "$SFDC_INSTANCES"); do
        instance_path="$SFDC_INSTANCES/$instance"
        
        if [ ! -d "$instance_path/force-app" ]; then
            echo -e "${YELLOW}⚠ Instance '$instance' missing force-app directory${NC}"
            ((WARNINGS_FOUND++))
        fi
        
        if [ ! -f "$instance_path/sfdx-project.json" ]; then
            echo -e "${YELLOW}⚠ Instance '$instance' missing sfdx-project.json${NC}"
            ((WARNINGS_FOUND++))
        fi
    done
else
    echo -e "${RED}✗ SFDC instances directory not found${NC}"
    ((ERRORS_FOUND++))
fi

# Check HubSpot structure
HS_BASE="$PROJECT_ROOT/platforms/HS"
if [ -d "$HS_BASE" ]; then
    echo -e "${GREEN}✓ HubSpot platform directory exists${NC}"
else
    echo -e "${YELLOW}⚠ HubSpot platform directory not found${NC}"
    ((WARNINGS_FOUND++))
fi

echo ""
echo "Checking for Cross-Instance References..."
echo "------------------------------------------"

# Look for potential cross-instance file references
for agent_file in $(find "$PROJECT_ROOT/.claude/agents" -name "*.md" -type f); do
    agent_name=$(basename "$agent_file" .md)
    
    # Check if agent uses Write or Edit tools
    if grep -q "tools:.*Write\|tools:.*Edit" "$agent_file" 2>/dev/null; then
        # Check if it specifies working directory or instance context
        if ! grep -q "working_directory\|getCurrentInstance\|getInstancePath" "$agent_file" 2>/dev/null; then
            echo -e "${YELLOW}⚠ Agent '$agent_name' writes files but doesn't specify instance context${NC}"
            ((WARNINGS_FOUND++))
        fi
    fi
done

echo ""
echo "========================================="
echo "Validation Summary"
echo "========================================="

if [ $ERRORS_FOUND -eq 0 ] && [ $WARNINGS_FOUND -eq 0 ]; then
    echo -e "${GREEN}✓ All path configurations are correct!${NC}"
    exit 0
else
    echo -e "${RED}Errors found: $ERRORS_FOUND${NC}"
    echo -e "${YELLOW}Warnings found: $WARNINGS_FOUND${NC}"
    
    if [ $ERRORS_FOUND -gt 0 ]; then
        echo ""
        echo "To fix errors, run:"
        echo "  ./scripts/fix-hardcoded-paths.sh"
        exit 1
    else
        exit 0
    fi
fi