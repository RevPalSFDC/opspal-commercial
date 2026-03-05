#!/bin/bash

# Claude Code Debug Setup Script
# This script configures environment variables and settings to debug BashTool pre-flight check issues

echo "=========================================="
echo "Claude Code Debug Configuration Setup"
echo "=========================================="

# Set debug environment variable
export ANTHROPIC_LOG=debug
echo "✓ Set ANTHROPIC_LOG=debug"

# Add to bashrc for persistence
if ! grep -q "ANTHROPIC_LOG=debug" ~/.bashrc 2>/dev/null; then
    echo "export ANTHROPIC_LOG=debug" >> ~/.bashrc
    echo "✓ Added ANTHROPIC_LOG to ~/.bashrc for persistence"
fi

# Check for multiple Claude instances
echo ""
echo "Checking for concurrent Claude Code instances..."
CLAUDE_PROCESSES=$(ps aux | grep -E '[c]laude' | wc -l)
echo "Found $CLAUDE_PROCESSES Claude Code instances running"

if [ "$CLAUDE_PROCESSES" -gt 1 ]; then
    echo ""
    echo "⚠️  WARNING: Multiple Claude Code instances detected!"
    echo "This can cause API rate limiting and slow pre-flight checks."
    echo ""
    echo "Current Claude processes:"
    ps aux | grep -E '[c]laude' | awk '{print $2, $11, $12}'
    echo ""
    echo "Consider terminating unnecessary instances with: kill <PID>"
fi

# Check network latency
echo ""
echo "Testing network connectivity to Anthropic API..."
if ping -c 1 api.anthropic.com > /dev/null 2>&1; then
    LATENCY=$(ping -c 3 api.anthropic.com 2>/dev/null | grep -E 'avg' | awk -F '/' '{print $5}')
    echo "✓ API is reachable. Average latency: ${LATENCY}ms"
    
    if [ "${LATENCY%.*}" -gt 100 ]; then
        echo "⚠️  High latency detected (>100ms). This may contribute to slow pre-flight checks."
    fi
else
    echo "✗ Cannot reach api.anthropic.com - check network connection"
fi

# Create debug log directory
DEBUG_LOG_DIR="${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}"
mkdir -p "$DEBUG_LOG_DIR"
echo ""
echo "✓ Created debug log directory: $DEBUG_LOG_DIR"

# Set up log rotation
cat > "$DEBUG_LOG_DIR/logrotate.conf" << EOF
$DEBUG_LOG_DIR/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 $(whoami) $(whoami)
}
EOF

echo ""
echo "=========================================="
echo "Debug configuration complete!"
echo ""
echo "To apply changes to current shell:"
echo "  source ~/.bashrc"
echo ""
echo "Debug logs will be available when you run Claude Code with:"
echo "  ANTHROPIC_LOG=debug claude"
echo "=========================================="