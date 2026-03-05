#!/bin/bash
##
## Pre-Agent-Load Hook (Week 4: Agent-Scoped MCP Loading)
##
## Called by Claude Code before loading an agent to determine which
## MCP servers should be loaded based on agent requirements.
##
## Usage: pre-agent-load.sh <agent-name> <agent-file-path>
##
## Exports:
##   LOAD_MCP_SERVERS - Space-separated list of MCP servers to load
##
## Example:
##   $ ./pre-agent-load.sh sfdc-cpq-assessor /path/to/sfdc-cpq-assessor.md
##   🔧 Loading MCP servers: playwright
##   export LOAD_MCP_SERVERS="playwright"
##

set -euo pipefail

AGENT_NAME="${1:-}"
AGENT_FILE="${2:-}"

# Validate inputs
if [ -z "$AGENT_NAME" ] || [ -z "$AGENT_FILE" ]; then
  echo "Usage: pre-agent-load.sh <agent-name> <agent-file-path>" >&2
  exit 1
fi

if [ ! -f "$AGENT_FILE" ]; then
  echo "Error: Agent file not found: $AGENT_FILE" >&2
  exit 1
fi

##
## Extract requiresMcp from agent frontmatter
##
## Frontmatter format:
##   ---
##   name: sfdc-cpq-assessor
##   requiresMcp: ["playwright"]
##   ---
##
extract_required_mcps() {
  local agent_file="$1"

  # Extract frontmatter (between first two ---)
  local frontmatter
  frontmatter=$(awk '/^---$/{flag=!flag; next} flag' "$agent_file" | head -20)

  # Find requiresMcp line
  local requires_mcp_line
  requires_mcp_line=$(echo "$frontmatter" | grep "requiresMcp:" || echo "")

  if [ -z "$requires_mcp_line" ]; then
    # No requiresMcp field found
    echo ""
    return
  fi

  # Parse the array: requiresMcp: ["playwright", "other"]
  # Remove prefix, brackets, quotes, and split by comma
  local mcps
  mcps=$(echo "$requires_mcp_line" | sed 's/.*requiresMcp: *//;s/\[//;s/\]//;s/"//g;s/,/ /g')

  echo "$mcps"
}

# Extract required MCP servers
REQUIRED_MCPS=$(extract_required_mcps "$AGENT_FILE")

# Export for Claude Code to consume
if [ -n "$REQUIRED_MCPS" ]; then
  export LOAD_MCP_SERVERS="$REQUIRED_MCPS"
  echo "🔧 Agent '$AGENT_NAME' requires MCP servers: $REQUIRED_MCPS" >&2
else
  export LOAD_MCP_SERVERS=""
  echo "✓ Agent '$AGENT_NAME' requires no MCP servers" >&2
fi

# Output for shell eval (if needed)
echo "export LOAD_MCP_SERVERS=\"$LOAD_MCP_SERVERS\""
