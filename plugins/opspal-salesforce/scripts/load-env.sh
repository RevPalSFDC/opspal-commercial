#!/bin/bash
# Load environment variables from .env file for Claude Code MCP servers

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Load .env file if it exists
if [ -f "$SCRIPT_DIR/.env" ]; then
    echo "Loading environment variables from .env file..."
    export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
    echo "Environment variables loaded successfully!"
else
    echo "Warning: .env file not found at $SCRIPT_DIR/.env"
fi

# Verify Asana variables are loaded
if [ -n "$ASANA_ACCESS_TOKEN" ] && [ -n "$ASANA_WORKSPACE_ID" ]; then
    echo "✓ Asana configuration loaded"
else
    echo "⚠ Asana environment variables not set"
fi

# Verify Salesforce variables are loaded
if [ -n "$SF_TARGET_ORG" ] && [ -n "$SF_TARGET_ORG" ]; then
    echo "✓ Salesforce configuration loaded"
else
    echo "⚠ Salesforce environment variables not set"
fi