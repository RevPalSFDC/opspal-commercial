#!/bin/bash

# Disable Model Proxy Feature for ClaudeSalesforce
# This script disables the optional model proxy feature

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
CONFIG_DIR="$PROJECT_DIR/config"
MODEL_PROXY_DIR="$PROJECT_DIR/model-proxy"
FEATURES_FILE="$CONFIG_DIR/features.yaml"

echo "================================================"
echo "  Salesforce Model Proxy - Disable Script"
echo "================================================"
echo ""

# Function to check if feature is currently enabled
check_current_status() {
    if [ ! -f "$FEATURES_FILE" ]; then
        echo "Model proxy is not configured (features.yaml not found)"
        exit 0
    fi
    
    # Check if enabled using Node.js wrapper
    STATUS=$(node "$MODEL_PROXY_DIR/wrapper.js" --check 2>/dev/null || echo "disabled")
    
    if [ "$STATUS" = "disabled" ]; then
        echo "Model proxy is already disabled"
        exit 0
    fi
    
    echo "Model proxy is currently enabled"
}

# Function to stop running proxy server
stop_proxy_server() {
    echo "Checking for running proxy server..."
    
    # Find processes on default ports
    for PORT in 8003 8004 8005; do
        PID=$(lsof -t -i:$PORT 2>/dev/null || true)
        if [ ! -z "$PID" ]; then
            echo "Found proxy server on port $PORT (PID: $PID)"
            echo "Stopping server..."
            kill $PID 2>/dev/null || true
            sleep 2
            # Force kill if still running
            kill -9 $PID 2>/dev/null || true
            echo "✓ Server stopped"
        fi
    done
    
    # Also check for python processes running server.py
    PIDS=$(pgrep -f "model-proxy/server.py" || true)
    if [ ! -z "$PIDS" ]; then
        echo "Stopping model proxy Python processes..."
        kill $PIDS 2>/dev/null || true
        echo "✓ Python processes stopped"
    fi
}

# Function to disable the feature
disable_feature() {
    echo "Disabling model proxy feature..."
    
    # Use Python to safely modify YAML
    python3 << EOF
import yaml
import sys

try:
    with open('$FEATURES_FILE', 'r') as f:
        config = yaml.safe_load(f)
    
    config['features']['model_proxy']['enabled'] = False
    
    with open('$FEATURES_FILE', 'w') as f:
        yaml.dump(config, f, default_flow_style=False, sort_keys=False)
    
    print("✓ Feature disabled in configuration")
except Exception as e:
    print(f"Error updating configuration: {e}")
    sys.exit(1)
EOF
}

# Function to create disabled marker
create_disabled_marker() {
    echo "Creating disabled marker..."
    touch "$MODEL_PROXY_DIR/DISABLED"
    echo "✓ Disabled marker created"
}

# Function to show status
show_status() {
    echo ""
    echo "================================================"
    echo "  ✅ Model Proxy Successfully Disabled!"
    echo "================================================"
    echo ""
    echo "The model proxy feature has been disabled."
    echo "Claude Code will now use the default Claude models."
    echo ""
    echo "What was changed:"
    echo "  - Feature flag set to disabled in features.yaml"
    echo "  - Any running proxy servers stopped"
    echo "  - Disabled marker file created"
    echo ""
    echo "No other files or configurations were modified."
    echo "Your agents and workflows remain unchanged."
    echo ""
    echo "To re-enable the feature later:"
    echo "   $SCRIPT_DIR/enable-model-proxy.sh"
    echo ""
    echo "To test current status:"
    echo "   node $MODEL_PROXY_DIR/wrapper.js --check"
}

# Function to prompt for confirmation
confirm_disable() {
    echo "This will disable the model proxy feature."
    echo "Claude Code will revert to using default Claude models."
    echo ""
    read -p "Continue? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled"
        exit 0
    fi
}

# Main execution
main() {
    # Parse arguments
    FORCE=false
    for arg in "$@"; do
        case $arg in
            --force)
                FORCE=true
                shift
                ;;
            --help)
                echo "Usage: $0 [--force]"
                echo ""
                echo "Disable the optional model proxy feature for ClaudeSalesforce"
                echo ""
                echo "Options:"
                echo "  --force    Disable without confirmation"
                echo "  --help     Show this help message"
                exit 0
                ;;
        esac
    done
    
    echo "Starting disable process..."
    echo ""
    
    # Step 1: Check current status
    check_current_status
    
    # Step 2: Confirm if not forced
    if [ "$FORCE" = false ]; then
        confirm_disable
    fi
    
    # Step 3: Stop any running servers
    stop_proxy_server
    
    # Step 4: Disable the feature
    disable_feature
    
    # Step 5: Create disabled marker
    create_disabled_marker
    
    # Step 6: Show final status
    show_status
}

# Run main function
main "$@"