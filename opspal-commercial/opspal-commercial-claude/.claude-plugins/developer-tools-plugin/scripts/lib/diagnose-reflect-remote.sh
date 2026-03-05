#!/bin/bash
# Remote System Diagnostic for /reflect Command Failures
#
# Purpose: Comprehensive troubleshooting script for /reflect issues on remote systems
# Usage: ./scripts/lib/diagnose-reflect-remote.sh [plugin-name]
#
# Examples:
#   ./scripts/lib/diagnose-reflect-remote.sh hubspot-plugin
#   ./scripts/lib/diagnose-reflect-remote.sh salesforce-plugin

set +e  # Don't exit on errors - we want to capture all failures

PLUGIN_NAME="${1:-hubspot-plugin}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BOLD}🔍 Diagnosing /reflect Command Issues${NC}"
echo -e "${BOLD}Plugin: $PLUGIN_NAME${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

ISSUES_FOUND=0

# =============================================================================
# CHECK 1: Plugin Installation
# =============================================================================

echo -e "${BLUE}[1/10] Checking plugin installation...${NC}"

if [ -d ".claude-plugins/$PLUGIN_NAME" ]; then
    echo -e "  ${GREEN}✓${NC} Plugin directory exists"

    # Check for plugin.json
    if [ -f ".claude-plugins/$PLUGIN_NAME/.claude-plugin/plugin.json" ]; then
        echo -e "  ${GREEN}✓${NC} Plugin manifest found"
        PLUGIN_VERSION=$(jq -r '.version' ".claude-plugins/$PLUGIN_NAME/.claude-plugin/plugin.json" 2>/dev/null || echo "unknown")
        echo -e "    Version: $PLUGIN_VERSION"
    else
        echo -e "  ${RED}✗${NC} Plugin manifest not found"
        echo -e "    Expected: .claude-plugins/$PLUGIN_NAME/.claude-plugin/plugin.json"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
else
    echo -e "  ${RED}✗${NC} Plugin not found"
    echo -e "    Expected directory: .claude-plugins/$PLUGIN_NAME"
    echo -e "    Run: /plugin install $PLUGIN_NAME@revpal-internal-plugins"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

echo ""

# =============================================================================
# CHECK 2: /reflect Command File
# =============================================================================

echo -e "${BLUE}[2/10] Checking /reflect command file...${NC}"

REFLECT_COMMAND=".claude-plugins/$PLUGIN_NAME/commands/reflect.md"

if [ -f "$REFLECT_COMMAND" ]; then
    echo -e "  ${GREEN}✓${NC} Command file exists"

    # Check for EXECUTION STEPS (auto-submit feature)
    if grep -q "EXECUTION STEPS" "$REFLECT_COMMAND"; then
        echo -e "  ${GREEN}✓${NC} Auto-submit feature present"
    else
        echo -e "  ${YELLOW}⚠${NC}  Auto-submit feature missing"
        echo -e "    Plugin may need update: git pull"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi

    # Check model specification
    MODEL=$(grep "^model:" "$REFLECT_COMMAND" | head -1 | awk '{print $2}')
    if [ -n "$MODEL" ]; then
        echo -e "  ${GREEN}✓${NC} Model configured: $MODEL"
    else
        echo -e "  ${YELLOW}⚠${NC}  No model specified in frontmatter"
    fi
else
    echo -e "  ${RED}✗${NC} Command file not found"
    echo -e "    Expected: $REFLECT_COMMAND"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

echo ""

# =============================================================================
# CHECK 3: Recent Reflection Files
# =============================================================================

echo -e "${BLUE}[3/10] Checking for recent reflection files...${NC}"

if [ -d ".claude" ]; then
    REFLECTION_COUNT=$(find .claude -maxdepth 1 -name "SESSION_REFLECTION_*.json" -type f 2>/dev/null | wc -l)

    if [ "$REFLECTION_COUNT" -gt 0 ]; then
        echo -e "  ${GREEN}✓${NC} Found $REFLECTION_COUNT reflection file(s)"

        # Show most recent
        LATEST=$(find .claude -maxdepth 1 -name "SESSION_REFLECTION_*.json" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -f2- -d" ")
        if [ -n "$LATEST" ]; then
            echo -e "    Latest: $(basename "$LATEST")"
            echo -e "    Modified: $(stat -c '%y' "$LATEST" 2>/dev/null | cut -d'.' -f1)"

            # Validate JSON
            if jq empty "$LATEST" 2>/dev/null; then
                echo -e "    ${GREEN}✓${NC} Valid JSON"
            else
                echo -e "    ${RED}✗${NC} Invalid JSON format"
                ISSUES_FOUND=$((ISSUES_FOUND + 1))
            fi
        fi
    else
        echo -e "  ${YELLOW}⚠${NC}  No reflection files found"
        echo -e "    This is expected if /reflect hasn't been run yet"
    fi
else
    echo -e "  ${YELLOW}⚠${NC}  .claude directory does not exist"
    echo -e "    Will be created when /reflect runs"
fi

echo ""

# =============================================================================
# CHECK 4: Submission Script
# =============================================================================

echo -e "${BLUE}[4/10] Checking submission script...${NC}"

SUBMIT_SCRIPT=".claude-plugins/$PLUGIN_NAME/scripts/lib/submit-reflection.js"

if [ -f "$SUBMIT_SCRIPT" ]; then
    echo -e "  ${GREEN}✓${NC} Submission script exists"

    # Check for hardcoded anon key (should be present for read-only users)
    if grep -q "sb_publishable_" "$SUBMIT_SCRIPT"; then
        echo -e "  ${GREEN}✓${NC} Default Supabase credentials present"
    else
        echo -e "  ${YELLOW}⚠${NC}  No default credentials (requires env vars)"
    fi

    # Check if executable
    if [ -x "$SUBMIT_SCRIPT" ]; then
        echo -e "  ${GREEN}✓${NC} Script is executable"
    else
        echo -e "  ${YELLOW}⚠${NC}  Script not executable (may still work with node)"
    fi
else
    echo -e "  ${RED}✗${NC} Submission script not found"
    echo -e "    Expected: $SUBMIT_SCRIPT"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

echo ""

# =============================================================================
# CHECK 5: Post-Reflect Hook
# =============================================================================

echo -e "${BLUE}[5/10] Checking post-reflect hook...${NC}"

POST_HOOK=".claude-plugins/$PLUGIN_NAME/hooks/post-reflect.sh"

if [ -f "$POST_HOOK" ]; then
    echo -e "  ${GREEN}✓${NC} Post-reflect hook exists"

    # Check if executable
    if [ -x "$POST_HOOK" ]; then
        echo -e "  ${GREEN}✓${NC} Hook is executable"
    else
        echo -e "  ${RED}✗${NC} Hook not executable"
        echo -e "    Run: chmod +x $POST_HOOK"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
else
    echo -e "  ${YELLOW}⚠${NC}  Post-reflect hook not found"
    echo -e "    Auto-submission may not work"
    echo -e "    Expected: $POST_HOOK"
fi

echo ""

# =============================================================================
# CHECK 6: Node.js Availability
# =============================================================================

echo -e "${BLUE}[6/10] Checking Node.js...${NC}"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "  ${GREEN}✓${NC} Node.js installed: $NODE_VERSION"

    # Check version (need >= 18.0.0)
    MAJOR_VERSION=$(node --version | cut -d'.' -f1 | tr -d 'v')
    if [ "$MAJOR_VERSION" -ge 18 ]; then
        echo -e "  ${GREEN}✓${NC} Version compatible (>= v18.0.0)"
    else
        echo -e "  ${YELLOW}⚠${NC}  Version may be incompatible (< v18.0.0)"
        echo -e "    Recommended: Upgrade to Node.js v18+"
    fi
else
    echo -e "  ${RED}✗${NC} Node.js not found"
    echo -e "    Required for reflection submission"
    echo -e "    Install: https://nodejs.org/"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

echo ""

# =============================================================================
# CHECK 7: Environment Variables
# =============================================================================

echo -e "${BLUE}[7/10] Checking environment variables...${NC}"

if [ -n "$SUPABASE_URL" ]; then
    echo -e "  ${GREEN}✓${NC} SUPABASE_URL: $SUPABASE_URL"
else
    echo -e "  ${YELLOW}⚠${NC}  SUPABASE_URL not set (will use default)"
fi

if [ -n "$SUPABASE_ANON_KEY" ]; then
    echo -e "  ${GREEN}✓${NC} SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY:0:20}..."
else
    echo -e "  ${YELLOW}⚠${NC}  SUPABASE_ANON_KEY not set (will use default)"
fi

if [ -n "$USER_EMAIL" ]; then
    echo -e "  ${GREEN}✓${NC} USER_EMAIL: $USER_EMAIL"
else
    echo -e "  ${YELLOW}⚠${NC}  USER_EMAIL not set (submissions will be anonymous)"
fi

echo ""

# =============================================================================
# CHECK 8: Supabase Connectivity
# =============================================================================

echo -e "${BLUE}[8/10] Testing Supabase connectivity...${NC}"

SUPABASE_URL_TEST="${SUPABASE_URL:-https://REDACTED_SUPABASE_PROJECT.supabase.co}"
SUPABASE_KEY_TEST="${SUPABASE_ANON_KEY:-REDACTED_SUPABASE_ANON_KEY}"

if command -v curl &> /dev/null; then
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
        -X GET "$SUPABASE_URL_TEST/rest/v1/reflections?limit=1" \
        -H "apikey: $SUPABASE_KEY_TEST" \
        -H "Authorization: Bearer $SUPABASE_KEY_TEST" \
        --connect-timeout 5 2>&1)

    if [ "$RESPONSE" = "200" ] || [ "$RESPONSE" = "206" ]; then
        echo -e "  ${GREEN}✓${NC} Supabase connection successful (HTTP $RESPONSE)"
    else
        echo -e "  ${RED}✗${NC} Supabase connection failed (HTTP $RESPONSE)"
        echo -e "    Check your internet connection"
        echo -e "    Verify Supabase URL and API key"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
else
    echo -e "  ${YELLOW}⚠${NC}  curl not available, skipping connectivity test"
fi

echo ""

# =============================================================================
# CHECK 9: Git Repository Status
# =============================================================================

echo -e "${BLUE}[9/10] Checking git repository...${NC}"

if [ -d ".git" ]; then
    echo -e "  ${GREEN}✓${NC} Git repository detected"

    # Check if on correct branch
    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)
    echo -e "    Branch: $CURRENT_BRANCH"

    # Check for uncommitted changes that might affect plugin
    PLUGIN_CHANGES=$(git status --porcelain ".claude-plugins/$PLUGIN_NAME" 2>/dev/null | wc -l)
    if [ "$PLUGIN_CHANGES" -gt 0 ]; then
        echo -e "  ${YELLOW}⚠${NC}  $PLUGIN_CHANGES uncommitted change(s) in plugin directory"
    else
        echo -e "  ${GREEN}✓${NC} Plugin directory is clean"
    fi

    # Check if behind remote
    git fetch --quiet 2>/dev/null
    BEHIND=$(git rev-list HEAD..@{u} --count 2>/dev/null || echo "0")
    if [ "$BEHIND" -gt 0 ]; then
        echo -e "  ${YELLOW}⚠${NC}  Repository is $BEHIND commit(s) behind remote"
        echo -e "    Run: git pull"
    else
        echo -e "  ${GREEN}✓${NC} Repository is up to date"
    fi
else
    echo -e "  ${YELLOW}⚠${NC}  Not a git repository"
    echo -e "    Plugin updates may need manual installation"
fi

echo ""

# =============================================================================
# CHECK 10: Claude Code Version
# =============================================================================

echo -e "${BLUE}[10/10] Checking Claude Code version...${NC}"

if command -v claude &> /dev/null; then
    CLAUDE_VERSION=$(claude --version 2>&1 | head -1 || echo "unknown")
    echo -e "  ${GREEN}✓${NC} Claude Code installed: $CLAUDE_VERSION"
else
    echo -e "  ${RED}✗${NC} Claude Code not found in PATH"
    echo -e "    Verify installation"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# =============================================================================
# SUMMARY & RECOMMENDATIONS
# =============================================================================

echo -e "${BOLD}📊 DIAGNOSTIC SUMMARY${NC}"
echo ""

if [ $ISSUES_FOUND -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed!${NC}"
    echo ""
    echo "Configuration looks good. If /reflect is still failing:"
    echo "1. Try running /reflect again"
    echo "2. Check Claude Code output for specific error messages"
    echo "3. Look for .claude/SESSION_REFLECTION_*.json files after running"
    echo "4. Run the submission script manually to test:"
    echo "   node $SUBMIT_SCRIPT .claude/SESSION_REFLECTION_<timestamp>.json"
else
    echo -e "${RED}❌ Found $ISSUES_FOUND issue(s)${NC}"
    echo ""
    echo "Recommended actions:"
    echo ""

    # Provide specific recommendations based on findings
    if [ ! -d ".claude-plugins/$PLUGIN_NAME" ]; then
        echo "1. Install plugin:"
        echo "   /plugin install $PLUGIN_NAME@revpal-internal-plugins"
        echo ""
    fi

    if [ ! -f "$SUBMIT_SCRIPT" ] || [ ! -f "$REFLECT_COMMAND" ]; then
        echo "2. Update plugin to latest version:"
        echo "   cd .claude-plugins/$PLUGIN_NAME && git pull"
        echo ""
    fi

    if ! command -v node &> /dev/null; then
        echo "3. Install Node.js (required for submission):"
        echo "   https://nodejs.org/"
        echo ""
    fi

    if [ ! -x "$POST_HOOK" ] && [ -f "$POST_HOOK" ]; then
        echo "4. Make post-reflect hook executable:"
        echo "   chmod +x $POST_HOOK"
        echo ""
    fi
fi

# =============================================================================
# MANUAL TEST INSTRUCTIONS
# =============================================================================

echo ""
echo -e "${BOLD}🧪 MANUAL TEST${NC}"
echo ""
echo "To manually test /reflect submission:"
echo ""
echo "1. Run /reflect command"
echo "2. Check if reflection file was created:"
echo "   ls -la .claude/SESSION_REFLECTION_*.json"
echo "3. If file exists, test submission manually:"
echo "   node $SUBMIT_SCRIPT .claude/SESSION_REFLECTION_<timestamp>.json"
echo ""
echo "For verbose debugging, add set -x to post-reflect hook:"
echo "   sed -i '2i set -x' $POST_HOOK"
echo ""

# =============================================================================
# ADDITIONAL RESOURCES
# =============================================================================

echo -e "${BOLD}📚 RESOURCES${NC}"
echo ""
echo "Documentation:"
echo "  - Troubleshooting: docs/TROUBLESHOOTING_PLUGIN_LOADING.md"
echo "  - Plugin README: .claude-plugins/$PLUGIN_NAME/README.md"
echo ""
echo "Diagnostic tools:"
echo "  - Validate plugin: claude plugin validate .claude-plugins/$PLUGIN_NAME/.claude-plugin/plugin.json"
echo "  - Query reflections: node .claude-plugins/$PLUGIN_NAME/scripts/lib/query-reflections.js recent"
echo ""

exit $ISSUES_FOUND
