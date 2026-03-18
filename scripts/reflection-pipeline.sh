#!/usr/bin/env bash
# reflection-pipeline.sh - Headless reflection processing pipeline
#
# Runs the full reflection workflow non-interactively:
#   1. Analyze open reflections and detect cohorts
#   2. Generate fix plans for each cohort
#   3. Implement fixes
#   4. Run tests
#   5. Bump versions and push
#
# Usage:
#   ./scripts/reflection-pipeline.sh              # Full pipeline
#   ./scripts/reflection-pipeline.sh --analyze     # Analysis only (no fixes)
#   ./scripts/reflection-pipeline.sh --dry-run     # Show what would happen
#
# Requirements:
#   - claude CLI available on PATH
#   - Authenticated to Supabase (for reflection queries)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$HOME/.claude/logs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/reflection-pipeline-${TIMESTAMP}.log"

mkdir -p "$LOG_DIR"

# Parse flags
ANALYZE_ONLY=false
DRY_RUN=false
for arg in "$@"; do
  case $arg in
    --analyze) ANALYZE_ONLY=true ;;
    --dry-run) DRY_RUN=true; ANALYZE_ONLY=true ;;
    --help|-h)
      echo "Usage: $0 [--analyze] [--dry-run] [--help]"
      echo ""
      echo "  --analyze   Analysis only, no fixes applied"
      echo "  --dry-run   Show what would happen without executing"
      echo "  --help      Show this help"
      exit 0
      ;;
  esac
done

log() {
  echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "=== Reflection Pipeline Started ==="
log "Mode: $(if $DRY_RUN; then echo 'DRY RUN'; elif $ANALYZE_ONLY; then echo 'ANALYZE ONLY'; else echo 'FULL PIPELINE'; fi)"
log "Log: $LOG_FILE"

# Step 1: Analyze reflections
log "Step 1: Analyzing open reflections..."
COHORTS_FILE="/tmp/reflection-cohorts-${TIMESTAMP}.json"

claude -p "Run the reflection analysis workflow. Execute immediately, do not write a plan.

1. Query Supabase for open reflections (status = 'open' or 'new')
2. Run cohort detection to group related reflections
3. For each cohort, identify the root cause pattern
4. Output a JSON summary to stdout with this structure:
   {\"cohorts\": [{\"id\": \"...\", \"title\": \"...\", \"reflection_count\": N, \"severity\": \"high|medium|low\", \"root_cause\": \"...\", \"suggested_fix\": \"...\"}], \"total_open\": N}

Output ONLY the JSON, no other text." \
  --allowedTools "Bash,Read,Grep,Glob" \
  2>>"$LOG_FILE" > "$COHORTS_FILE" || {
    log "ERROR: Reflection analysis failed"
    exit 1
  }

log "Cohorts saved to: $COHORTS_FILE"

# Validate output
if ! jq empty "$COHORTS_FILE" 2>/dev/null; then
  log "WARNING: Output is not valid JSON. Check $COHORTS_FILE"
  log "Raw output:"
  cat "$COHORTS_FILE" >> "$LOG_FILE"
  exit 1
fi

COHORT_COUNT=$(jq '.cohorts | length' "$COHORTS_FILE" 2>/dev/null || echo "0")
TOTAL_OPEN=$(jq '.total_open // 0' "$COHORTS_FILE" 2>/dev/null || echo "0")
log "Found $COHORT_COUNT cohorts from $TOTAL_OPEN open reflections"

if [ "$COHORT_COUNT" = "0" ]; then
  log "No cohorts to process. Pipeline complete."
  exit 0
fi

# Print summary
jq -r '.cohorts[] | "  [\(.severity)] \(.title) (\(.reflection_count) reflections)"' "$COHORTS_FILE" 2>/dev/null | tee -a "$LOG_FILE"

if $ANALYZE_ONLY; then
  log "=== Analysis Complete (no fixes applied) ==="
  log "Review cohorts: cat $COHORTS_FILE | jq ."
  exit 0
fi

# Step 2: Implement fixes
log "Step 2: Implementing fixes..."

claude -p "Implement fixes for the reflection cohorts in $COHORTS_FILE.

Execute immediately. Do not write a plan document.

For each cohort:
1. Read the cohort details from $COHORTS_FILE
2. Identify the files that need changes
3. Implement the fix
4. Run relevant tests after each fix
5. If a test fails, revert that fix and note it as 'needs-human'

After all fixes:
1. Run the full test suite: cd $ROOT && npm test
2. For each modified plugin under plugins/, bump the PATCH version in .claude-plugin/plugin.json
3. Stage all changes: git add -A
4. Commit with message: 'fix(multi): Reflection-driven fixes — <brief summary> (vX.Y.Z, ...)'
5. Push to main: git push origin main
6. Report a summary table: | Cohort | Files Changed | Tests | Status |

NEVER skip version bumps. NEVER declare fixed without running tests." \
  --allowedTools "Bash,Read,Write,Edit,Grep,Glob,TodoWrite" \
  2>>"$LOG_FILE" | tee -a "$LOG_FILE" || {
    log "ERROR: Fix implementation failed"
    exit 1
  }

log "=== Reflection Pipeline Complete ==="
log "Full log: $LOG_FILE"
