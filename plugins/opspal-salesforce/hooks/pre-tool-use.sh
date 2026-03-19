#!/bin/bash
#
# PreToolUse Hook - Enforce disallowedTools for Task tool invocations
#
# This hook enforces the disallowedTools field in agent YAML frontmatter
# since Claude Code doesn't natively support this yet (feature request #6005)
#
# Intercepts Task tool calls and validates the target agent has permission
# to use the tools it's requesting.
#
# Input: JSON with tool name and parameters
# Output: JSON with systemMessage if tools are blocked
#
# Exit codes:
#   0 - Allow tool execution
#   2 - Block tool execution (restriction violated)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-tool-use"
fi

if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ASSET_RESOLVER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/resolve-encrypted-asset.sh"
else
    ASSET_RESOLVER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/resolve-encrypted-asset.sh"
fi

if [[ -f "$ASSET_RESOLVER" ]]; then
    source "$ASSET_RESOLVER"
fi

set -euo pipefail

# Get plugin root
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

# Read JSON input from stdin
HOOK_INPUT=$(cat)

# Extract tool name
TOOL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool // ""')

# Only enforce for Task tool (subagent invocations)
if [ "$TOOL_NAME" != "Task" ]; then
  # Not a Task tool, allow (no agent restrictions apply)
  exit 0
fi

# Extract subagent name from Task parameters
# Task tool has a "subagent_type" parameter
AGENT_NAME=$(echo "$HOOK_INPUT" | jq -r '.parameters.subagent_type // ""')

if [ -z "$AGENT_NAME" ] || [ "$AGENT_NAME" = "null" ]; then
  # No agent specified, allow (shouldn't happen but be safe)
  exit 0
fi

# Find agent file (try current plugin first, then check other plugins)
AGENT_FILE=""

# Check current plugin
if [ -f "$PLUGIN_ROOT/agents/${AGENT_NAME}.md" ]; then
  AGENT_FILE="$PLUGIN_ROOT/agents/${AGENT_NAME}.md"
else
  # Check sibling plugins
  PLUGINS_DIR="$(dirname "$PLUGIN_ROOT")"
  for plugin_dir in "$PLUGINS_DIR"/*-plugin; do
    if [ -f "$plugin_dir/agents/${AGENT_NAME}.md" ]; then
      AGENT_FILE="$plugin_dir/agents/${AGENT_NAME}.md"
      break
    fi
  done
fi

if [ -z "$AGENT_FILE" ] || [ ! -f "$AGENT_FILE" ]; then
  # Agent file not found, allow (might be built-in agent)
  exit 0
fi

# Extract YAML frontmatter
FRONTMATTER=$(sed -n '/^---$/,/^---$/p' "$AGENT_FILE" | sed '1d;$d')

# Check if disallowedTools field exists
if ! echo "$FRONTMATTER" | grep -q "disallowedTools:"; then
  # No disallowedTools defined, allow
  exit 0
fi

# Extract disallowedTools list
DISALLOWED_TOOLS=$(echo "$FRONTMATTER" | awk '
  /disallowedTools:/ {
    in_array = 1
    # Check for inline array [...]
    if (match($0, /\[.*\]/)) {
      print $0
      exit
    }
    next
  }
  in_array && /^[[:space:]]*-/ {
    gsub(/^[[:space:]]*-[[:space:]]*/, "")
    print
  }
  in_array && /^[[:alpha:]]/ {
    in_array = 0
  }
')

if [ -z "$DISALLOWED_TOOLS" ]; then
  # No disallowed tools found, allow
  exit 0
fi

# Convert disallowed tools to array
DISALLOWED_ARRAY=()
while IFS= read -r tool; do
  [ -z "$tool" ] && continue

  # Handle inline array format [tool1, tool2]
  if [[ "$tool" =~ ^\[.*\]$ ]]; then
    tool="${tool#[}"
    tool="${tool%]}"
    IFS=',' read -ra INLINE_TOOLS <<< "$tool"
    for t in "${INLINE_TOOLS[@]}"; do
      t=$(echo "$t" | xargs)
      DISALLOWED_ARRAY+=("$t")
    done
  else
    DISALLOWED_ARRAY+=("$tool")
  fi
done <<< "$DISALLOWED_TOOLS"

# Extract agent's allowed tools from frontmatter
AGENT_TOOLS=$(echo "$FRONTMATTER" | grep "^tools:" | sed 's/^tools:[[:space:]]*//')

# Build list of violations (tools the agent would use that are disallowed)
VIOLATIONS=()

# Check common tool patterns that might be used
# This is a heuristic - we can't know exactly what tools the agent will use
# until it runs, so we check against its declared tool list

if [ -n "$AGENT_TOOLS" ]; then
  IFS=',' read -ra TOOLS <<< "$AGENT_TOOLS"
  for tool in "${TOOLS[@]}"; do
    tool=$(echo "$tool" | xargs)

    # Check each disallowed pattern
    for disallowed in "${DISALLOWED_ARRAY[@]}"; do
      # Handle wildcard patterns
      if [[ "$disallowed" == *"*"* ]]; then
        pattern="${disallowed//\*/.*}"
        pattern="${pattern//(/\\(}"
        pattern="${pattern//)/\\)}"

        if [[ "$tool" =~ $pattern ]]; then
          VIOLATIONS+=("Tool '$tool' matches blocked pattern '$disallowed'")
        fi
      else
        # Exact match
        if [ "$tool" = "$disallowed" ]; then
          VIOLATIONS+=("Tool '$tool' is explicitly blocked")
        fi
      fi
    done
  done
fi

# If no violations found, allow
if [ ${#VIOLATIONS[@]} -eq 0 ]; then
  exit 0
fi

# Get agent tier info
MATRIX_FILE="$PLUGIN_ROOT/config/agent-permission-matrix.json"
if declare -F resolve_enc_asset >/dev/null 2>&1; then
  MATRIX_FILE=$(resolve_enc_asset "$PLUGIN_ROOT" "opspal-salesforce" "config/agent-permission-matrix.json")
fi
TIER="Unknown"
TIER_NAME="Unknown"

if [ -f "$MATRIX_FILE" ]; then
  TIER=$(jq -r --arg agent "$AGENT_NAME" '.agents[$agent].tier // "Unknown"' "$MATRIX_FILE" 2>/dev/null || echo "Unknown")

  case $TIER in
    1) TIER_NAME="Read-Only" ;;
    2) TIER_NAME="Standard Operations" ;;
    3) TIER_NAME="Metadata Management" ;;
    4) TIER_NAME="Security Operations" ;;
    5) TIER_NAME="Destructive Operations" ;;
  esac
fi

# Build violation message
VIOLATION_LIST=""
for violation in "${VIOLATIONS[@]}"; do
  VIOLATION_LIST="${VIOLATION_LIST}\n    • $violation"
done

# Generate alternative agent suggestions
ALTERNATIVES=""
case $TIER in
  1)
    ALTERNATIVES="  • Try \`sfdc-orchestrator\` (Tier 3) for metadata operations
  • Try \`sfdc-data-operations\` (Tier 2) for data modifications"
    ;;
  2)
    ALTERNATIVES="  • Try \`sfdc-metadata-manager\` (Tier 3) for deployments
  • Try \`sfdc-deployment-manager\` (Tier 3) for production deploys"
    ;;
  3)
    ALTERNATIVES="  • Use \`--validate-only\` flag for production deployments
  • Deploy to sandbox first for testing"
    ;;
esac

# Create JSON output with systemMessage and stopPrompt
jq -n \
  --arg agent "$AGENT_NAME" \
  --arg tier "$TIER" \
  --arg tierName "$TIER_NAME" \
  --arg violations "$VIOLATION_LIST" \
  --arg alternatives "$ALTERNATIVES" \
  --argjson violationCount ${#VIOLATIONS[@]} \
  '{
    systemMessage: "🚫 **Agent Tool Restriction Violation**\n\n**Agent**: `\($agent)` (Tier \($tier): \($tierName))\n\n**Blocked Operations**:\n\($violations)\n\n**Reason**: This agent has tier-based tool restrictions to prevent dangerous operations.\n\n**Alternative Approaches**:\n\($alternatives)\n\n**Tier Capabilities**:\n  • **Tier 1** (Read-Only): Discovery and analysis only\n  • **Tier 2** (Standard Ops): Data operations, no deploys\n  • **Tier 3** (Metadata Mgmt): Metadata deploys, no production\n  • **Tier 4** (Security Ops): Security-specific operations\n  • **Tier 5** (Destructive Ops): All operations with approval\n\n**Documentation**: `SAFETY_GUARDRAILS_COMPLETE.md`",
    stopPrompt: {
      title: "🛡️ Safety Guardrails: Agent Restrictions",
      message: "The agent **\($agent)** (Tier \($tier)) is blocked from using certain tools.\n\n**Blocked tools**: \($violationCount) violation(s)\n\n**What this means**: This agent is restricted to prevent accidental destructive operations or unauthorized changes.\n\n**What you should do**:\n1. Review the blocked operations above\n2. Choose a different agent with appropriate permissions\n3. If this operation is necessary, use an agent from Tier \($tier) or higher\n\n**Need help?**\n  • Review: `.claude-plugins/opspal-salesforce/SAFETY_GUARDRAILS_COMPLETE.md`\n  • Check agent tiers: `.claude-plugins/opspal-salesforce/config/agent-permission-matrix.json`",
      options: [
        {
          label: "📖 View Documentation",
          description: "Open SAFETY_GUARDRAILS_COMPLETE.md to understand restrictions",
          value: "view_docs"
        },
        {
          label: "🔍 Show Alternative Agents",
          description: "Suggest agents with appropriate permissions for this task",
          value: "show_alternatives"
        },
        {
          label: "✋ Cancel Operation",
          description: "Stop and reconsider approach",
          value: "cancel"
        }
      ]
    },
    blocked: true,
    agent: $agent,
    tier: $tier,
    violationCount: $violationCount
  }'

exit 2
