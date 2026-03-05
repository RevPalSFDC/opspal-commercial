#!/bin/bash

# Setup script for Claude Code management tools
# This script adds convenient aliases and functions to your shell

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo "Claude Code Tools Setup"
echo "=========================================="
echo

# Function to add aliases to shell config
add_to_shell_config() {
    local shell_config="$HOME/.bashrc"
    
    # Detect shell
    if [ -n "$ZSH_VERSION" ]; then
        shell_config="$HOME/.zshrc"
    elif [ -n "$BASH_VERSION" ]; then
        shell_config="$HOME/.bashrc"
    fi
    
    echo "Adding Claude tools to $shell_config..."
    
    # Check if already added
    if grep -q "Claude Code Management Tools" "$shell_config" 2>/dev/null; then
        echo "✓ Tools already configured in $shell_config"
        return
    fi
    
    # Add aliases and functions
    cat >> "$shell_config" << 'EOF'

# Claude Code Management Tools
export CLAUDE_TOOLS_DIR="${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}"

# Quick status check
alias claude-status='$CLAUDE_TOOLS_DIR/claude-monitor.sh compact'

# Full monitor view
alias claude-monitor='$CLAUDE_TOOLS_DIR/claude-monitor.sh'

# Interactive dashboard (full TUI)
alias claude-dashboard='$CLAUDE_TOOLS_DIR/claude-dashboard.sh'

# Watch mode (continuous monitoring)
alias claude-watch='$CLAUDE_TOOLS_DIR/claude-monitor.sh watch'

# Instance management
alias claude-clean='$CLAUDE_TOOLS_DIR/claude-instance-manager.sh clean'
alias claude-list='$CLAUDE_TOOLS_DIR/claude-instance-manager.sh list'

# Performance monitoring
alias claude-perf='$CLAUDE_TOOLS_DIR/claude-performance-monitor.sh analyze'

# Debug setup
alias claude-debug='export ANTHROPIC_LOG=debug && echo "✓ Debug mode enabled"'
alias claude-debug-off='unset ANTHROPIC_LOG && echo "✓ Debug mode disabled"'

# Claude with retry wrapper
alias claude-safe='$CLAUDE_TOOLS_DIR/claude-with-retry.sh run'

# Quick function to check and clean if needed
claude-check() {
    local instances=$(ps aux | grep -c '[c]laude')
    if [ "$instances" -gt 1 ]; then
        echo "⚠️  Multiple Claude instances detected ($instances)"
        echo "Run 'claude-clean' to fix"
    else
        echo "✓ Claude status OK ($instances instance)"
    fi
}

# Function to show all Claude tools
claude-help() {
    echo "Claude Code Management Tools:"
    echo "  claude-status    - Quick one-line status check"
    echo "  claude-monitor   - Full status with recommendations"
    echo "  claude-dashboard - Interactive visual dashboard"
    echo "  claude-watch     - Continuous monitoring mode"
    echo "  claude-clean     - Clean up extra instances"
    echo "  claude-list      - List all instances"
    echo "  claude-perf      - Show performance analysis"
    echo "  claude-debug     - Enable debug logging"
    echo "  claude-safe      - Run Claude with retry logic"
    echo "  claude-check     - Quick health check"
    echo "  claude-help      - Show this help"
}

# Auto-check on new terminal
if [ -t 1 ]; then
    # Only run if terminal is interactive
    claude-check
fi

EOF
    
    echo "✓ Added Claude tools to $shell_config"
}

# Create symbolic links for system-wide access (optional)
create_symlinks() {
    echo
    echo "Would you like to create system-wide commands? (requires sudo)"
    echo "This will create symlinks in /usr/local/bin"
    read -p "Create symlinks? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo ln -sf "$SCRIPT_DIR/claude-monitor.sh" /usr/local/bin/claude-monitor
        sudo ln -sf "$SCRIPT_DIR/claude-dashboard.sh" /usr/local/bin/claude-dashboard
        sudo ln -sf "$SCRIPT_DIR/claude-instance-manager.sh" /usr/local/bin/claude-manager
        echo "✓ Created system-wide commands"
        echo "  You can now use: claude-monitor, claude-dashboard, claude-manager"
    fi
}

# Test the tools
test_tools() {
    echo
    echo "Testing tools..."
    echo
    
    # Test monitor
    if [ -x "$SCRIPT_DIR/claude-monitor.sh" ]; then
        echo "1. Claude Monitor:"
        "$SCRIPT_DIR/claude-monitor.sh" compact
        echo
    fi
    
    # Check for issues
    local instances=$(ps aux | grep -c '[c]laude')
    if [ "$instances" -gt 1 ]; then
        echo "⚠️  Multiple instances detected!"
        echo "   Run: $SCRIPT_DIR/claude-instance-manager.sh clean"
    fi
    
    echo "✓ Tools are working"
}

# Main setup
main() {
    # Check if scripts exist
    if [ ! -f "$SCRIPT_DIR/claude-monitor.sh" ]; then
        echo "Error: Claude tools not found in $SCRIPT_DIR"
        echo "Please ensure you're running this from the correct directory"
        exit 1
    fi
    
    # Make all scripts executable
    echo "Making scripts executable..."
    chmod +x "$SCRIPT_DIR"/*.sh 2>/dev/null
    echo "✓ Scripts are executable"
    
    # Add to shell config
    add_to_shell_config
    
    # Optional: create symlinks
    create_symlinks
    
    # Test the tools
    test_tools
    
    echo
    echo "=========================================="
    echo "Setup Complete!"
    echo "=========================================="
    echo
    echo "To start using the tools:"
    echo "  1. Reload your shell: source ~/.bashrc"
    echo "  2. Run: claude-help"
    echo
    echo "Quick commands:"
    echo "  claude-status  - Quick status check"
    echo "  claude-monitor - Full monitoring view"
    echo "  claude-clean   - Clean up instances"
    echo
    echo "For the full interactive dashboard:"
    echo "  claude-dashboard"
    echo
}

# Run main
main