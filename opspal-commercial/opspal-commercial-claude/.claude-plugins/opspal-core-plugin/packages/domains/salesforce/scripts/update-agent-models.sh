#!/bin/bash

# Update Agent Models Script
# Updates agent configurations to use appropriate Claude models based on complexity

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$PROJECT_ROOT/config/agent-model-assignments.json"
AGENTS_DIR="$PROJECT_ROOT/agents"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Agent Model Assignment Updater ===${NC}"
echo

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}Error: Configuration file not found at $CONFIG_FILE${NC}"
    exit 1
fi

# Function to update agent configuration
update_agent_config() {
    local agent_name=$1
    local model=$2
    local agent_file="$AGENTS_DIR/${agent_name}.yaml"
    
    # Check if agent file exists
    if [ -f "$agent_file" ]; then
        echo -e "${YELLOW}Updating ${agent_name} to use ${model}...${NC}"
        
        # Check if model field already exists
        if grep -q "^model:" "$agent_file"; then
            # Update existing model field
            sed -i "s/^model:.*/model: ${model}/" "$agent_file"
        else
            # Add model field after description
            sed -i "/^description:/a model: ${model}" "$agent_file"
        fi
        
        echo -e "${GREEN}✓ Updated ${agent_name}${NC}"
    else
        echo -e "${YELLOW}⚠ Agent file not found: ${agent_name}.yaml${NC}"
    fi
}

# Parse JSON and get agent lists
echo -e "${BLUE}Reading model assignments...${NC}"

# Get Opus agents
opus_agents=$(jq -r '.model_assignments.opus.agents[]' "$CONFIG_FILE")
sonnet_agents=$(jq -r '.model_assignments.sonnet.agents[]' "$CONFIG_FILE")

# Update Opus agents
echo
echo -e "${BLUE}Configuring Opus agents (high complexity)...${NC}"
while IFS= read -r agent; do
    update_agent_config "$agent" "claude-3-opus"
done <<< "$opus_agents"

# Update Sonnet agents
echo
echo -e "${BLUE}Configuring Sonnet agents (routine tasks)...${NC}"
while IFS= read -r agent; do
    update_agent_config "$agent" "claude-3-sonnet"
done <<< "$sonnet_agents"

# Create agent invocation helper
echo
echo -e "${BLUE}Creating agent invocation helper...${NC}"

cat > "$PROJECT_ROOT/scripts/invoke-agent.sh" << 'EOF'
#!/bin/bash

# Agent Invocation Helper
# Automatically uses the correct model based on agent configuration

AGENT_NAME=$1
TASK=$2

if [ -z "$AGENT_NAME" ] || [ -z "$TASK" ]; then
    echo "Usage: $0 <agent-name> <task-description>"
    exit 1
fi

# Get model from configuration
MODEL=$(jq -r --arg agent "$AGENT_NAME" '
    if .model_assignments.opus.agents | contains([$agent]) then
        "claude-3-opus"
    elif .model_assignments.sonnet.agents | contains([$agent]) then
        "claude-3-sonnet"
    else
        .default_model
    end
' "$PROJECT_ROOT/config/agent-model-assignments.json")

echo "Invoking $AGENT_NAME with $MODEL model..."
echo "Task: $TASK"

# Here you would add the actual invocation logic
# This is a placeholder for the actual Task tool invocation
EOF

chmod +x "$PROJECT_ROOT/scripts/invoke-agent.sh"

echo -e "${GREEN}✓ Agent invocation helper created${NC}"

# Summary
echo
echo -e "${BLUE}=== Summary ===${NC}"
echo -e "Opus agents (${GREEN}$(echo "$opus_agents" | wc -l)${NC}): Advanced reasoning & compliance"
echo -e "Sonnet agents (${GREEN}$(echo "$sonnet_agents" | wc -l)${NC}): Routine operations"
echo
echo -e "${GREEN}✓ Model assignments configured successfully!${NC}"
echo
echo -e "${YELLOW}Note: Agents will now use their assigned models automatically.${NC}"
echo -e "${YELLOW}Monitor performance using: ./scripts/monitor-agent-performance.sh${NC}"