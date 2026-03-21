#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# Pre-Fireflies API Call Hook
#
# Purpose: Validates Fireflies credentials and checks daily rate limit budget
#          before any mcp__fireflies* tool call.
#
# Triggers: PreToolUse for mcp__fireflies* matcher
#
# Checks:
#   1. FIREFLIES_API_KEY is set
#   2. Daily budget: warn at 80%, hard-block at 95%
#   3. Plan-based daily limits:
#      - free/pro:           50 calls/day
#      - business/enterprise: unlimited (86400)
#
# Configuration: Set FIREFLIES_VALIDATION_ENABLED=0 to disable
###############################################################################

# Check if validation is enabled
if [ "${FIREFLIES_VALIDATION_ENABLED:-1}" = "0" ]; then
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAILY_FILE="${HOME}/.claude/api-limits/fireflies-daily.json"

###############################################################################
# Credential Validation
###############################################################################

if [ -z "${FIREFLIES_API_KEY}" ]; then
  cat <<'EOF'
⚠️ **Fireflies API key not configured**

Set the following environment variable:
```bash
export FIREFLIES_API_KEY=your_api_key
```

Get your API key from: Fireflies.ai > Integrations > API

Run `/fireflies-auth check` to verify.
EOF
  exit 2
fi

###############################################################################
# Daily Budget Check
###############################################################################

if [ -f "$DAILY_FILE" ] && command -v node >/dev/null 2>&1; then
  # Determine daily limit based on plan tier
  FIREFLIES_PLAN="${FIREFLIES_PLAN:-free}"
  BUDGET_CHECK=$(node -e "
    try {
      const fs = require('fs');
      const data = JSON.parse(fs.readFileSync('${DAILY_FILE}', 'utf8'));
      const today = new Date().toISOString().slice(0, 10);
      if (data.date !== today) { console.log('OK'); process.exit(0); }
      const plan = '${FIREFLIES_PLAN}';
      const limit = (plan === 'business' || plan === 'enterprise') ? 86400 : 50;
      const pct = Math.round((data.used / (data.limit || limit)) * 100);
      if (pct >= 95) { console.log('BLOCK:' + pct + ':' + data.used + ':' + (data.limit || limit)); }
      else if (pct >= 80) { console.log('WARN:' + pct + ':' + data.used + ':' + (data.limit || limit)); }
      else { console.log('OK'); }
    } catch(e) { console.log('OK'); }
  " 2>/dev/null)

  if [[ "$BUDGET_CHECK" == BLOCK:* ]]; then
    IFS=':' read -r _ PCT USED LIMIT <<< "$BUDGET_CHECK"
    cat <<EOF
🛑 **Fireflies daily API budget nearly exhausted** (${PCT}% used: ${USED}/${LIMIT})

The daily API limit resets at midnight UTC. Options:
1. Wait until tomorrow for the budget to reset
2. Use \`--period\` with shorter time windows to reduce API calls
3. Upgrade to a higher Fireflies plan (business/enterprise) for higher limits

Check status: \`/fireflies-auth status\`
EOF
    exit 2
  fi

  if [[ "$BUDGET_CHECK" == WARN:* ]]; then
    IFS=':' read -r _ PCT USED LIMIT <<< "$BUDGET_CHECK"
    cat <<EOF
⚠️ Fireflies daily API budget at ${PCT}% (${USED}/${LIMIT}). Use \`--period\` to limit scope.
EOF
    # Warning only - don't block
    exit 0
  fi
fi

exit 0
