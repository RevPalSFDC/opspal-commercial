#!/usr/bin/env bash
# Hook: deprecation-warning.sh
# Event: UserPromptSubmit
# Purpose: Warn users that opspal-data-hygiene is deprecated and redirect to opspal-core
#
# The data hygiene functionality has been consolidated into opspal-core's
# survivorship engine and cross-platform dedup capabilities.

set -euo pipefail

# Read hook input
HOOK_INPUT=""
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
if echo "$PROMPT_LOWER" | grep -qE "(dedup|deduplicate|duplicate|merge.*(company|account|contact)|data.*(hygiene|clean|quality)|company.*(hygiene|clean))"; then
  cat >&2 <<'EOF'

┌──────────────────────────────────────────────────────────────────────────┐
│  DEPRECATION NOTICE: opspal-data-hygiene                                │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  The opspal-data-hygiene plugin is DEPRECATED.                          │
│                                                                          │
│  Data deduplication capabilities have been consolidated into:            │
│                                                                          │
│    opspal-core:                                                          │
│      - survivorship-engine.js (canonical selection)                      │
│      - sfdc-dedup-safety-copilot (Salesforce dedup)                     │
│      - data-migration-orchestrator (cross-platform)                      │
│                                                                          │
│    opspal-hubspot:                                                       │
│      - hubspot-data-hygiene-specialist                                   │
│                                                                          │
│    opspal-salesforce:                                                    │
│      - sfdc-dedup-safety-copilot                                        │
│      - sfdc-merge-orchestrator                                          │
│                                                                          │
│  Use these agents instead for improved results.                          │
│                                                                          │
│  To uninstall: /plugin uninstall opspal-data-hygiene                    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

EOF
fi

# Always pass through — this is a warning, not a blocker
printf '{}\n'
exit 0
