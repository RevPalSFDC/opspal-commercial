#!/bin/bash

# Quick installation script for MCP Manager (Salesforce only)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/env.sh
[[ -f "${SCRIPT_DIR}/lib/env.sh" ]] && source "${SCRIPT_DIR}/lib/env.sh"

echo "Installing MCP Manager Service (user-scoped by default)..."

# Clean up any existing MCP processes
echo "Cleaning up existing processes..."
"${SCRIPT_DIR}/cleanup-mcp.sh" --all || true

# Install dependencies
echo "Installing dependencies..."
cd "${SCRIPT_DIR}/../mcp-manager" && npm install && cd - >/dev/null

# Ensure user-scoped dirs
mkdir -p "${LOG_DIR}" "${TMP_DIR}/mcp-locks" "${RUNTIME_DIR}" 2>/dev/null || true

# Optional system install
if [[ "${ALLOW_SYSTEM_LOGS:-0}" == "1" ]]; then
  echo "System log mode enabled (ALLOW_SYSTEM_LOGS=1): /var/log may be used by other tools."
fi

# Start the manager
echo "Starting MCP Manager..."
cd "${SCRIPT_DIR}/../mcp-manager" && nohup node index.js > "${LOG_DIR}/mcp-manager.log" 2>&1 &

echo "MCP Manager installed and started!"
echo "Logs: ${LOG_DIR}/mcp-manager.log"
echo "Check status at: http://localhost:3001/health"
