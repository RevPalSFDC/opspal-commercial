#!/usr/bin/env bash
# =============================================================================
# Post-Win-Loss Calibration Hook
# =============================================================================
#
# Purpose: After win-loss-analyzer completes, extract deal outcomes and feed
#          them into the deal-score-calibrator for Bayesian weight learning.
#
# Triggers: PostToolUse/Task — when agent matches win-loss patterns
#
# Flow:
#   1. Detect win-loss-analyzer or revops-deal-scorer completion
#   2. Find the most recent win-loss output file
#   3. Extract deal outcomes (won/lost + predicted scores)
#   4. Feed into deal-score-calibrator.js
#   5. If sufficient outcomes accumulated, propose weight adjustments
#   6. Output proposal as systemMessage (requires human approval)
#
# Configuration:
#   WIN_LOSS_CALIBRATION_ENABLED=1  (default: enabled)
#   WIN_LOSS_AUTO_PROPOSE=1         (default: propose after each batch)
#
# =============================================================================

set -euo pipefail

if ! command -v jq &>/dev/null; then
    echo "[post-win-loss-calibration] jq not found, skipping" >&2
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
  PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT"
else
  PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

# Source error handler
ERROR_HANDLER="${SCRIPT_DIR}/lib/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
  source "$ERROR_HANDLER"
  HOOK_NAME="post-win-loss-calibration"
  set_lenient_mode 2>/dev/null || true
fi

# Redirect stdout→stderr, fd 3 for Claude JSON
exec 3>&1 1>&2

# Configuration
ENABLED="${WIN_LOSS_CALIBRATION_ENABLED:-1}"
AUTO_PROPOSE="${WIN_LOSS_AUTO_PROPOSE:-1}"
CALIBRATOR="$PLUGIN_ROOT/scripts/lib/deal-score-calibrator.js"

if [[ "$ENABLED" != "1" ]]; then
  exit 0
fi

# Check agent name
AGENT_NAME="${CLAUDE_AGENT_NAME:-}"
AGENT_LOWER=$(echo "$AGENT_NAME" | tr '[:upper:]' '[:lower:]')

# Only fire for win-loss and deal scoring agents
case "$AGENT_LOWER" in
  *win-loss*|*win_loss*|*deal-scorer*|*deal_scorer*)
    ;;
  *)
    exit 0
    ;;
esac

# Check ORG_SLUG
if [[ -z "${ORG_SLUG:-}" ]]; then
  echo "[win-loss-calibration] No ORG_SLUG set, skipping calibration"
  exit 0
fi

# Check calibrator exists
if [[ ! -f "$CALIBRATOR" ]]; then
  echo "[win-loss-calibration] Calibrator not found: $CALIBRATOR"
  exit 0
fi

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "[win-loss-calibration] Node.js not available"
  exit 0
fi

echo "[win-loss-calibration] Win/loss analysis detected for ${AGENT_NAME}, org=${ORG_SLUG}"

# Find recent win-loss output files
SEARCH_DIRS=(
  "${PWD}/orgs/${ORG_SLUG}/platforms/salesforce"
  "${PWD}/instances"
  "${PWD}/reports"
  "${PWD}"
)

PATTERNS=(
  "*win*loss*.json"
  "*deal*score*.json"
  "*competitive*analysis*.json"
)

LATEST_FILE=""
LATEST_TIME=0

for dir in "${SEARCH_DIRS[@]}"; do
  [[ -d "$dir" ]] || continue
  for pattern in "${PATTERNS[@]}"; do
    while IFS= read -r -d '' file; do
      if [[ -f "$file" ]]; then
        mtime=$(stat -c %Y "$file" 2>/dev/null || stat -f %m "$file" 2>/dev/null || echo 0)
        if [[ "$mtime" -gt "$LATEST_TIME" ]]; then
          LATEST_TIME="$mtime"
          LATEST_FILE="$file"
        fi
      fi
    done < <(find "$dir" -maxdepth 3 -name "$pattern" -print0 2>/dev/null)
  done
done

if [[ -z "$LATEST_FILE" ]]; then
  echo "[win-loss-calibration] No win-loss output file found, skipping"
  exit 0
fi

echo "[win-loss-calibration] Processing: $(basename "$LATEST_FILE")"

# Extract outcomes from the win-loss file and feed to calibrator
# Use Node.js for reliable JSON parsing
RECORD_COUNT=$(node -e "
const fs = require('fs');
const calibrator = require('${CALIBRATOR}');

try {
  const data = JSON.parse(fs.readFileSync('${LATEST_FILE}', 'utf8'));
  let recorded = 0;

  // Handle different output formats
  const deals = data.deals || data.opportunities || data.results || [];

  if (Array.isArray(deals)) {
    for (const deal of deals) {
      const outcome = {
        deal_id: deal.Id || deal.id || deal.deal_id || 'unknown',
        won: deal.IsWon === true || deal.won === true || deal.StageName === 'Closed Won' || deal.stage === 'Closed Won',
        predicted_score: deal.predicted_score || deal.score || deal.deal_score || null,
        factor_scores: deal.factor_scores || null
      };

      try {
        calibrator.recordOutcome('${ORG_SLUG}', outcome);
        recorded++;
      } catch (e) {
        // Skip malformed outcomes
      }
    }
  }

  console.log(recorded);
} catch (e) {
  console.error('Parse error: ' + e.message);
  console.log(0);
}
" 2>/dev/null || echo "0")

if [[ "$RECORD_COUNT" -gt 0 ]]; then
  echo "[win-loss-calibration] Recorded ${RECORD_COUNT} deal outcomes for ${ORG_SLUG}"

  # Auto-propose if enabled
  if [[ "$AUTO_PROPOSE" == "1" ]]; then
    PROPOSAL=$(node "$CALIBRATOR" propose "$ORG_SLUG" 2>/dev/null || echo '{"status":"error"}')
    STATUS=$(echo "$PROPOSAL" | node -e "
      const d = require('fs').readFileSync(0, 'utf8');
      try { console.log(JSON.parse(d).status); } catch { console.log('error'); }
    " 2>/dev/null || echo "error")

    if [[ "$STATUS" == "proposal_ready" ]]; then
      # Send proposal as systemMessage for human review
      ESCAPED=$(printf '%s' "$PROPOSAL" | jq -Rs '.')
      echo "{\"systemMessage\": \"## Deal Score Calibration Proposal\\n\\nBased on accumulated win/loss outcomes, the following weight adjustments are proposed for the deal scoring model.\\n\\n\`\`\`json\\n${PROPOSAL}\\n\`\`\`\\n\\n**This proposal requires human approval.** Review the changes and confirm before applying.\\nTo apply: \`node ${CALIBRATOR} apply ${ORG_SLUG}\`\"}" >&3
      echo "[win-loss-calibration] Weight adjustment proposal generated — awaiting approval"
    elif [[ "$STATUS" == "insufficient_data" ]]; then
      echo "[win-loss-calibration] Not enough outcomes yet for weight proposals"
    fi
  fi
else
  echo "[win-loss-calibration] No deal outcomes extracted from ${LATEST_FILE}"
fi

exit 0
