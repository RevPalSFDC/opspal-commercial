#!/usr/bin/env bash
# Hook: deprecation-warning.sh
# Event: UserPromptSubmit
# Purpose: Warn users that opspal-data-hygiene is deprecated and redirect to opspal-core
#
# The data hygiene functionality has been consolidated into opspal-core's
# survivorship engine and cross-platform dedup capabilities.

set -euo pipefail

HOOK_INPUT="{}"
if [ ! -t 0 ]; then
  HOOK_INPUT=$(cat)
fi

# Check if the prompt mentions data hygiene keywords
PROMPT=""
if [ -n "$HOOK_INPUT" ] && command -v jq &>/dev/null; then
  PROMPT=$(echo "$HOOK_INPUT" | jq -r '.prompt // ""' 2>/dev/null || echo "")
fi

if [ -z "$PROMPT" ]; then
  PROMPT="$HOOK_INPUT"
fi

PROMPT_LOWER=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]')

# Match dedup/hygiene related keywords
if ! echo "$PROMPT_LOWER" | grep -qE "(dedup|deduplicate|duplicate|merge.*(company|account|contact)|data.*(hygiene|clean|quality)|company.*(hygiene|clean))"; then
  echo '{}'
  exit 0
fi

NOTICE="DEPRECATION: opspal-data-hygiene is deprecated. Use opspal-core survivorship and migration tooling, opspal-hubspot:hubspot-data-hygiene-specialist, or opspal-salesforce:sfdc-dedup-safety-copilot / sfdc-merge-orchestrator. To uninstall, run /plugin uninstall opspal-data-hygiene."

if ! command -v jq &>/dev/null; then
  echo '{}'
  exit 0
fi

jq -nc \
  --arg context "$NOTICE" \
  '{
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: $context
    }
  }'

exit 0
