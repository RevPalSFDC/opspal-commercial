#!/bin/bash

# Enable Model Proxy Feature for ClaudeSalesforce
# This script enables the optional model proxy feature

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
CONFIG_DIR="$PROJECT_DIR/config"
MODEL_PROXY_DIR="$PROJECT_DIR/model-proxy"
FEATURES_FILE="$CONFIG_DIR/features.yaml"

echo "================================================"
echo "  Salesforce Model Proxy - Enable Script"
echo "================================================"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to create features config if it doesn't exist
create_features_config() {
    if [ ! -f "$FEATURES_FILE" ]; then
        echo "Creating features configuration file..."
        mkdir -p "$CONFIG_DIR"
        cat > "$FEATURES_FILE" << 'EOF'
# Feature flags for ClaudeSalesforce
features:
  model_proxy:
    enabled: false
    mode: "standalone"  # standalone, sibling, or shared
    default_model: "claude-opus-4-1"
    
    # Environment-specific settings
    environments:
      development:
        enabled: false
      staging:
        enabled: false
      production:
        enabled: false
    
    # Cost optimization
    cost_tracking:
      enabled: true
      daily_limit: 50.00
      monthly_limit: 1000.00
    
    # Performance settings
    performance:
      cache_enabled: true
      cache_ttl: 3600
      max_concurrent_requests: 10
EOF
        echo "✓ Features configuration created"
    fi
}

# Function to enable the feature
enable_feature() {
    echo "Enabling model proxy feature..."
    
    # Use Python to safely modify YAML
    python3 << EOF
import yaml
import sys

try:
    with open('$FEATURES_FILE', 'r') as f:
        config = yaml.safe_load(f)
    
    config['features']['model_proxy']['enabled'] = True
    
    with open('$FEATURES_FILE', 'w') as f:
        yaml.dump(config, f, default_flow_style=False, sort_keys=False)
    
    print("✓ Feature enabled in configuration")
except Exception as e:
    print(f"Error updating configuration: {e}")
    sys.exit(1)
EOF
}

# Function to check Python dependencies
check_python_deps() {
    echo "Checking Python dependencies..."
    
    if ! command_exists python3; then
        echo "❌ Python 3 is not installed"
        echo "Please install Python 3.8 or later"
        exit 1
    fi
    
    # Check Python version
    PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    if [ $(echo "$PYTHON_VERSION < 3.8" | bc) -eq 1 ]; then
        echo "❌ Python $PYTHON_VERSION detected. Python 3.8+ required."
        exit 1
    fi
    echo "✓ Python $PYTHON_VERSION detected"
    
    # Check if LiteLLM is installed
    if ! python3 -c "import litellm" 2>/dev/null; then
        echo "LiteLLM not installed. Installing dependencies..."
        pip3 install "litellm[proxy]" pyyaml uvicorn
        echo "✓ Dependencies installed"
    else
        echo "✓ LiteLLM already installed"
    fi
}

# Function to check Node.js dependencies
check_node_deps() {
    echo "Checking Node.js dependencies..."
    
    if ! command_exists node; then
        echo "❌ Node.js is not installed"
        echo "Please install Node.js 14 or later"
        exit 1
    fi
    
    # Install js-yaml if not present
    if [ ! -d "$PROJECT_DIR/node_modules/js-yaml" ]; then
        echo "Installing Node.js dependencies..."
        cd "$PROJECT_DIR"
        npm install js-yaml
        echo "✓ Node.js dependencies installed"
    else
        echo "✓ Node.js dependencies already installed"
    fi
}

# Function to validate configuration
validate_config() {
    echo "Validating model proxy configuration..."
    
    cd "$MODEL_PROXY_DIR"
    if python3 server.py --test > /dev/null 2>&1; then
        echo "✓ Configuration validated successfully"
    else
        echo "⚠️  Configuration validation failed - please check config.yaml"
        echo "Run: python3 $MODEL_PROXY_DIR/server.py --test"
    fi
}

# Function to check environment variables
check_env_vars() {
    echo "Checking environment variables..."
    
    MISSING_VARS=()
    
    # Check for API keys (at least one should be present)
    if [ -z "$OPENAI_API_KEY" ] && [ -z "$ANTHROPIC_API_KEY" ]; then
        echo "⚠️  No API keys found in environment"
        echo ""
        echo "Please set at least one of the following:"
        echo "  export OPENAI_API_KEY='your-openai-key'"
        echo "  export ANTHROPIC_API_KEY='your-anthropic-key'"
        echo ""
        echo "You can add these to your shell profile or .env file"
    else
        [ ! -z "$OPENAI_API_KEY" ] && echo "✓ OpenAI API key found"
        [ ! -z "$ANTHROPIC_API_KEY" ] && echo "✓ Anthropic API key found"
    fi
}

# Function to detect infrastructure mode
detect_mode() {
    echo "Detecting infrastructure mode..."
    
    SHARED_DIR="$PROJECT_DIR/../../shared-infrastructure/model-proxy"
    SIBLING_DIR="$PROJECT_DIR/../../ClaudeSFDC"
    
    if [ -d "$SHARED_DIR" ]; then
        echo "✓ Shared infrastructure detected"
        MODE="shared"
    elif [ -d "$SIBLING_DIR" ]; then
        echo "✓ Sibling project detected"
        MODE="sibling"
    else
        echo "✓ Standalone mode"
        MODE="standalone"
    fi
    
    # Update mode in configuration
    python3 << EOF
import yaml
with open('$FEATURES_FILE', 'r') as f:
    config = yaml.safe_load(f)
config['features']['model_proxy']['mode'] = '$MODE'
with open('$FEATURES_FILE', 'w') as f:
    yaml.dump(config, f, default_flow_style=False, sort_keys=False)
EOF
}

# Function to show next steps
show_next_steps() {
    echo ""
    echo "================================================"
    echo "  ✅ Model Proxy Successfully Enabled!"
    echo "================================================"
    echo ""
    echo "Next steps:"
    echo ""
    echo "1. Test the configuration:"
    echo "   node $MODEL_PROXY_DIR/wrapper.js --test"
    echo ""
    echo "2. Start the proxy server manually:"
    echo "   node $MODEL_PROXY_DIR/wrapper.js"
    echo ""
    echo "3. Or restart Claude Code to use with MCP:"
    echo "   The proxy will start automatically if enabled"
    echo ""
    echo "To disable the feature later:"
    echo "   $SCRIPT_DIR/disable-model-proxy.sh"
    echo ""
    echo "Configuration files:"
    echo "   Features: $FEATURES_FILE"
    echo "   Models: $MODEL_PROXY_DIR/config.yaml"
}

# Main execution
main() {
    # Parse arguments
    ENV=""
    for arg in "$@"; do
        case $arg in
            --env=*)
                ENV="${arg#*=}"
                shift
                ;;
            --help)
                echo "Usage: $0 [--env=development|staging|production]"
                echo ""
                echo "Enable the optional model proxy feature for ClaudeSalesforce"
                echo ""
                echo "Options:"
                echo "  --env=ENV    Enable for specific environment only"
                echo "  --help       Show this help message"
                exit 0
                ;;
        esac
    done
    
    echo "Starting enablement process..."
    echo ""
    
    # Step 1: Create configuration if needed
    create_features_config
    
    # Step 2: Check dependencies
    check_python_deps
    check_node_deps
    
    # Step 3: Enable the feature
    enable_feature
    
    # Step 4: Detect mode
    detect_mode
    
    # Step 5: Validate configuration
    validate_config
    
    # Step 6: Check environment
    check_env_vars
    
    # Step 7: Show next steps
    show_next_steps
}

# Run main function
main "$@"