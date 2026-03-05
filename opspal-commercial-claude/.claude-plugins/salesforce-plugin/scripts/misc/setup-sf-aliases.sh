#!/bin/bash

# Setup script to add Salesforce command aliases to your shell

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SF_COMMANDS="$SCRIPT_DIR/scripts/sf-commands.sh"

# Detect shell config file
if [ -n "$ZSH_VERSION" ]; then
    SHELL_CONFIG="$HOME/.zshrc"
    SHELL_NAME="zsh"
elif [ -n "$BASH_VERSION" ]; then
    SHELL_CONFIG="$HOME/.bashrc"
    SHELL_NAME="bash"
else
    echo "Unsupported shell. Please add aliases manually."
    exit 1
fi

echo "Setting up Salesforce command aliases for $SHELL_NAME..."

# Create aliases
cat >> "$SHELL_CONFIG" << 'EOF'

# Salesforce Instance Management Aliases (added by setup-sf-aliases.sh)
alias sfnew="$HOME/Desktop/RevPal/Agents/platforms/SFDC/scripts/sf-commands.sh new"
alias sfswitch="$HOME/Desktop/RevPal/Agents/platforms/SFDC/scripts/sf-commands.sh switch"
alias sflist="$HOME/Desktop/RevPal/Agents/platforms/SFDC/scripts/sf-commands.sh list"
alias sfcurrent="$HOME/Desktop/RevPal/Agents/platforms/SFDC/scripts/sf-commands.sh current"
alias sfauth="$HOME/Desktop/RevPal/Agents/platforms/SFDC/scripts/sf-commands.sh auth"
alias sfopen="$HOME/Desktop/RevPal/Agents/platforms/SFDC/scripts/sf-commands.sh open"
alias sfquick="$HOME/Desktop/RevPal/Agents/platforms/SFDC/scripts/sf-commands.sh quick"
alias sfinfo="$HOME/Desktop/RevPal/Agents/platforms/SFDC/scripts/sf-commands.sh info"
alias sfsync="$HOME/Desktop/RevPal/Agents/platforms/SFDC/scripts/sf-commands.sh sync"
alias sfhelp="$HOME/Desktop/RevPal/Agents/platforms/SFDC/scripts/sf-commands.sh help"

# Quick switch function for even faster access
sf() {
    if [ -z "$1" ]; then
        $HOME/Desktop/RevPal/Agents/platforms/SFDC/scripts/sf-commands.sh help
    else
        $HOME/Desktop/RevPal/Agents/platforms/SFDC/scripts/sf-commands.sh quick "$1"
    fi
}

EOF

echo "✅ Aliases added to $SHELL_CONFIG"
echo ""
echo "Available commands:"
echo "  sfnew      - Create a new Salesforce instance"
echo "  sfswitch   - Switch to an existing instance"
echo "  sflist     - List all configured instances"
echo "  sfcurrent  - Show current active instance"
echo "  sfauth     - Authenticate with Salesforce org"
echo "  sfopen     - Open instance directory"
echo "  sfquick    - Quick switch (load + cd)"
echo "  sfinfo     - Show instance details"
echo "  sfsync     - Sync all configurations"
echo "  sf <name>  - Shortcut for quick switch"
echo ""
echo "To activate these aliases, run:"
echo "  source $SHELL_CONFIG"
echo ""
echo "Or restart your terminal."