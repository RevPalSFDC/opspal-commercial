#!/bin/bash

###############################################################################
# Pre-Gong API Call Hook
#
# Purpose: Validates Gong credentials and checks daily rate limit budget
#          before any mcp__gong__* tool call.
#
# Triggers: PreToolUse for mcp__gong* matcher
#
# Checks:
#   1. GONG_ACCESS_KEY_ID is set
#   2. GONG_ACCESS_KEY_SECRET is set
#   3. Daily budget: warn at 80%, hard-block at 95%
#
# Configuration: Set GONG_VALIDATION_ENABLED=0 to disable
###############################################################################

# Check if validation is enabled
if [ "${GONG_VALIDATION_ENABLED:-1}" = "0" ]; then
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAILY_FILE="${HOME}/.claude/api-limits/gong-daily.json"

###############################################################################
# Credential Validation
###############################################################################

if [ -z "${GONG_ACCESS_KEY_ID}" ] || [ -z "${GONG_ACCESS_KEY_SECRET}" ]; then
  cat <<'EOF'
⚠️ **Gong API credentials not configured**

Set the following environment variables:
```bash
export GONG_ACCESS_KEY_ID=your_access_key_id
export GONG_ACCESS_KEY_SECRET=your_access_key_secret
```

Get credentials from: Gong Admin > Company Settings > API

Run `/gong-auth check` to verify.
EOF
  exit 2
fi

###############################################################################
# Daily Budget Check
###############################################################################

if [ -f "$DAILY_FILE" ] && command -v node >/dev/null 2>&1; then
  BUDGET_CHECK=$(node -e "
    try {
      const fs = require('fs');
      const data = JSON.parse(fs.readFileSync('${DAILY_FILE}', 'utf8'));
      const today = new Date().toISOString().slice(0, 10);
      if (data.date !== today) { console.log('OK'); process.exit(0); }
      const pct = Math.round((data.used / (data.limit || 10000)) * 100);
      if (pct >= 95) { console.log('BLOCK:' + pct + ':' + data.used + ':' + data.limit); }
      else if (pct >= 80) { console.log('WARN:' + pct + ':' + data.used + ':' + data.limit); }
      else { console.log('OK'); }
    } catch(e) { console.log('OK'); }
  " 2>/dev/null)

  if [[ "$BUDGET_CHECK" == BLOCK:* ]]; then
    IFS=':' read -r _ PCT USED LIMIT <<< "$BUDGET_CHECK"
    cat <<EOF
🛑 **Gong daily API budget nearly exhausted** (${PCT}% used: ${USED}/${LIMIT})

The daily API limit resets at midnight UTC. Options:
1. Wait until tomorrow for the budget to reset
2. Use \`--since\` with shorter time windows to reduce API calls
3. Contact Gong support for limit increases

Check status: \`node scripts/lib/gong-throttle.js --status\`
EOF
    exit 2
  fi

  if [[ "$BUDGET_CHECK" == WARN:* ]]; then
    IFS=':' read -r _ PCT USED LIMIT <<< "$BUDGET_CHECK"
    cat <<EOF
⚠️ Gong daily API budget at ${PCT}% (${USED}/${LIMIT}). Use \`--since\` to limit scope.
EOF
    # Warning only - don't block
    exit 0
  fi
fi

exit 0
