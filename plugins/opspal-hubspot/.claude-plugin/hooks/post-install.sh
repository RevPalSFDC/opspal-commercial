#!/bin/bash
# HubSpot Plugin Post-Install Hook
# Runs after plugin installation to verify dependencies and setup

# Don't exit on error - allow script to complete even if some commands fail
# set -e

PLUGIN_NAME="hubspot-plugin"
PLUGIN_VERSION="2.0.0"

echo "=========================================="
echo "Installing $PLUGIN_NAME v$PLUGIN_VERSION"
echo "=========================================="
echo ""

# Find plugin root directory
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT}"

echo "Plugin installed at: $PLUGIN_ROOT"
echo ""

# Check dependencies (non-blocking)
echo "Checking dependencies..."
if command -v node &> /dev/null; then
    echo "  ✓ Node.js: $(node --version)"
else
    echo "  ⚠ Node.js: Not found (required for scripts)"
fi

if command -v curl &> /dev/null; then
    echo "  ✓ curl: $(curl --version | head -1)"
else
    echo "  ⚠ curl: Not found (required for HubSpot API)"
fi

if command -v jq &> /dev/null; then
    echo "  ✓ jq: $(jq --version)"
else
    echo "  ℹ jq: Not found (optional, enhances JSON parsing)"
fi

echo ""
echo "=========================================="
echo "Installation Summary"
echo "=========================================="
echo ""
echo "✓ Plugin installed successfully!"
echo ""
echo "Available features:"
echo "  • 35 specialized HubSpot agents"
echo "  • 31 automation scripts"
echo "  • 10 slash commands"
echo ""
echo "Next steps:"
echo "  1. Set HubSpot API key: export HUBSPOT_API_KEY=\"your-key\""
echo "  2. Run: /checkdependencies (to verify all tools)"
echo "  3. Run: /initialize (to set up project structure)"
echo "  4. Run: /agents (to see available agents)"
echo ""
echo "Documentation:"
echo "  • Plugin README: $PLUGIN_ROOT/README.md"
echo "  • Commands: $PLUGIN_ROOT/commands/"
echo "  • Agents: $PLUGIN_ROOT/agents/"
echo ""

# ============================================================================
# Set Executable Permissions on Plugin Hooks
# ============================================================================
echo "Setting executable permissions on plugin hooks..."

HOOKS_FIXED=0
for hook in "$PLUGIN_ROOT/hooks"/*.sh; do
    if [ -f "$hook" ]; then
        if [ ! -x "$hook" ]; then
            chmod +x "$hook"
            HOOKS_FIXED=$((HOOKS_FIXED + 1))
            echo "  ✓ Made executable: $(basename "$hook")"
        fi
    fi
done

if [ $HOOKS_FIXED -eq 0 ]; then
    echo "  ✓ All hooks already executable"
else
    echo "  ✓ Fixed permissions on $HOOKS_FIXED hook(s)"
fi

echo ""
echo "=========================================="
