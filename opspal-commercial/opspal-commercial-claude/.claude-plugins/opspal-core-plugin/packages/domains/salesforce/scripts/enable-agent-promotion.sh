#!/bin/bash

# Enable Agent Promotion System
# Quick setup script to activate all agent adoption features

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${CYAN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       ${BOLD}🚀 AGENT PROMOTION SYSTEM ACTIVATION 🚀${NC}${CYAN}          ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Create shell aliases
echo -e "${YELLOW}Step 1: Setting up command interception...${NC}"

SHELL_CONFIG=""
if [ -f ~/.zshrc ]; then
    SHELL_CONFIG=~/.zshrc
elif [ -f ~/.bashrc ]; then
    SHELL_CONFIG=~/.bashrc
else
    echo -e "${YELLOW}Creating .bashrc...${NC}"
    touch ~/.bashrc
    SHELL_CONFIG=~/.bashrc
fi

# Check if aliases already exist
if grep -q "agent-interceptor" "$SHELL_CONFIG" 2>/dev/null; then
    echo -e "${GREEN}✓ Command interception already configured${NC}"
else
    echo "" >> "$SHELL_CONFIG"
    echo "# Salesforce Agent Promotion System" >> "$SHELL_CONFIG"
    echo "export PATH=\"$SCRIPT_DIR:\$PATH\"" >> "$SHELL_CONFIG"
    echo "alias sf='$SCRIPT_DIR/agent-interceptor.sh sf'" >> "$SHELL_CONFIG"
    echo "alias agent='$SCRIPT_DIR/agent-suggest'" >> "$SHELL_CONFIG"
    echo "alias agent-dashboard='open $PROJECT_ROOT/.claude/agent-dashboard.html'" >> "$SHELL_CONFIG"
    echo -e "${GREEN}✓ Added command aliases to $SHELL_CONFIG${NC}"
fi

# Step 2: Verify git hooks
echo ""
echo -e "${YELLOW}Step 2: Checking git hooks...${NC}"

GIT_HOOKS_DIR="$PROJECT_ROOT/.git/hooks"
if [ -d "$GIT_HOOKS_DIR" ]; then
    if [ -f "$GIT_HOOKS_DIR/pre-commit" ] && [ -f "$GIT_HOOKS_DIR/post-merge" ] && [ -f "$GIT_HOOKS_DIR/pre-push" ]; then
        echo -e "${GREEN}✓ Git hooks installed and active${NC}"
    else
        echo -e "${YELLOW}⚠ Some git hooks missing - run setup again${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Not in a git repository${NC}"
fi

# Step 3: Initialize analytics
echo ""
echo -e "${YELLOW}Step 3: Initializing analytics...${NC}"

ANALYTICS_FILE="$PROJECT_ROOT/.claude/agent-usage-data.json"
if [ ! -f "$ANALYTICS_FILE" ]; then
    cat > "$ANALYTICS_FILE" <<EOF
{
  "sessions": [],
  "agentUsage": {},
  "missedOpportunities": [],
  "recommendations": [],
  "lastAnalysis": null,
  "autoInvocations": []
}
EOF
    echo -e "${GREEN}✓ Analytics system initialized${NC}"
else
    echo -e "${GREEN}✓ Analytics already configured${NC}"
fi

# Step 4: Test components
echo ""
echo -e "${YELLOW}Step 4: Testing components...${NC}"

# Test agent-suggest
if [ -x "$SCRIPT_DIR/agent-suggest" ]; then
    echo -e "${GREEN}✓ agent-suggest is executable${NC}"
else
    echo -e "${YELLOW}⚠ Making agent-suggest executable...${NC}"
    chmod +x "$SCRIPT_DIR/agent-suggest"
fi

# Test auto-router
if [ -f "$SCRIPT_DIR/auto-agent-router.js" ]; then
    echo -e "${GREEN}✓ auto-agent-router.js exists${NC}"
else
    echo -e "${YELLOW}⚠ auto-agent-router.js missing${NC}"
fi

# Test dashboard
if [ -f "$PROJECT_ROOT/.claude/agent-dashboard.html" ]; then
    echo -e "${GREEN}✓ Agent dashboard exists${NC}"
else
    echo -e "${YELLOW}⚠ Agent dashboard missing${NC}"
fi

# Step 5: Display quick start guide
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}✅ AGENT PROMOTION SYSTEM ACTIVATED!${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}Quick Start Commands:${NC}"
echo ""
echo -e "  ${GREEN}agent${NC}                    - Quick agent suggestions"
echo -e "  ${GREEN}agent interactive${NC}        - Interactive discovery mode"
echo -e "  ${GREEN}agent-dashboard${NC}          - Open visual dashboard"
echo -e "  ${GREEN}/agent <task>${NC}            - Get agent in Claude Code"
echo ""

echo -e "${YELLOW}Test the system:${NC}"
echo -e "  ${CYAN}agent suggest \"deploy to production\"${NC}"
echo ""

echo -e "${YELLOW}View analytics:${NC}"
echo -e "  ${CYAN}node $PROJECT_ROOT/.claude/agent-analytics.js report${NC}"
echo ""

echo -e "${BOLD}${BLUE}Next steps:${NC}"
echo -e "  1. ${GREEN}source $SHELL_CONFIG${NC} (or restart terminal)"
echo -e "  2. Try: ${CYAN}agent interactive${NC}"
echo -e "  3. Open dashboard: ${CYAN}agent-dashboard${NC}"
echo ""

echo -e "${GREEN}${BOLD}Happy agent-powered development! 🤖${NC}"
