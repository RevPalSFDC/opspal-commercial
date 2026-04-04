#!/bin/bash

# daily-ops.sh - Consolidated daily maintenance via Claude Code headless mode
# Usage: bash scripts/daily-ops.sh [--dry-run] [--verbose]
#
# Runs 5 maintenance tasks sequentially:
#   1. Plugin health check (via claude -p)
#   2. CLAUDE.md sync (via claude -p)
#   3. Runbook update (conditional — only if recent assessments exist)
#   4. Asana health check (direct script)
#   5. SF smoke tests (direct script)
#
# Exit codes:
#   0 = all tasks passed
#   1 = one or more tasks failed

set -euo pipefail

REPO_ROOT="${OPSPAL_INTERNAL_PLUGINS_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)}"
LOG_DIR="${REPO_ROOT}/.claude/logs/daily-ops"
DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%Y-%m-%dT%H:%M:%S)
LOG_FILE="${LOG_DIR}/daily-ops-${DATE}.log"

DRY_RUN=false
VERBOSE=false
FAILED=0
PASSED=0

# Parse arguments
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --verbose) VERBOSE=true ;;
    --help|-h)
      echo "Usage: bash scripts/daily-ops.sh [--dry-run] [--verbose]"
      echo ""
      echo "Options:"
      echo "  --dry-run   Preview tasks without executing"
      echo "  --verbose   Show detailed output"
      echo "  --help      Show this help"
      exit 0
      ;;
  esac
done

# Create log directory
mkdir -p "$LOG_DIR"

log() {
  local msg="[$(date +%H:%M:%S)] $1"
  echo "$msg" | tee -a "$LOG_FILE"
}

log_verbose() {
  if [ "$VERBOSE" = true ]; then
    log "$1"
  else
    echo "$1" >> "$LOG_FILE"
  fi
}

run_task() {
  local task_name="$1"
  local task_cmd="$2"

  log "--- Task: ${task_name} ---"

  if [ "$DRY_RUN" = true ]; then
    log "[DRY RUN] Would execute: ${task_cmd}"
    return 0
  fi

  local start_time=$(date +%s)
  local output
  local exit_code

  output=$(eval "$task_cmd" 2>&1) && exit_code=0 || exit_code=$?

  local end_time=$(date +%s)
  local duration=$((end_time - start_time))

  log_verbose "$output"

  if [ $exit_code -eq 0 ]; then
    log "PASS: ${task_name} (${duration}s)"
    PASSED=$((PASSED + 1))
  else
    log "FAIL: ${task_name} (exit ${exit_code}, ${duration}s)"
    FAILED=$((FAILED + 1))
  fi

  return 0  # Don't abort on individual task failure
}

# --- Begin daily operations ---
log "=========================================="
log "Daily Operations - ${TIMESTAMP}"
log "=========================================="
log "Mode: $([ "$DRY_RUN" = true ] && echo 'DRY RUN' || echo 'LIVE')"
log ""

# Task 1: Plugin Health Check
run_task "Plugin Health Check" \
  "claude -p 'Run /pluginupdate and report plugin versions. Do NOT push any changes.' --allowedTools 'Bash,Read' --max-turns 5 2>&1 | tail -50"

# Task 2: CLAUDE.md Sync
run_task "CLAUDE.md Sync" \
  "claude -p 'Run /sync-claudemd to update CLAUDE.md with latest plugin info. Report what changed.' --allowedTools 'Bash,Read,Write,Edit,Glob,Grep' --max-turns 10 2>&1 | tail -50"

# Task 3: Runbook Update (conditional)
YESTERDAY=$(date -d 'yesterday' +%Y-%m-%d 2>/dev/null || date -v-1d +%Y-%m-%d 2>/dev/null || echo '1970-01-01')
YESTERDAY_LOG="${REPO_ROOT}/.claude/logs/daily-ops/daily-ops-${YESTERDAY}.log"
if [ -f "$YESTERDAY_LOG" ]; then
  RECENT_ASSESSMENTS=$(find "${REPO_ROOT}/orgs" -name "*.json" -newer "$YESTERDAY_LOG" -type f 2>/dev/null | head -5)
else
  # No previous log — check for any assessments modified in last 24 hours
  RECENT_ASSESSMENTS=$(find "${REPO_ROOT}/orgs" -name "*.json" -mtime -1 -type f 2>/dev/null | head -5)
fi

if [ -n "$RECENT_ASSESSMENTS" ]; then
  run_task "Runbook Update" \
    "claude -p 'Check for recent assessment outputs and update operational runbooks if needed. Do NOT push changes.' --allowedTools 'Bash,Read,Write,Edit,Glob,Grep' --max-turns 8 2>&1 | tail -50"
else
  log "--- Task: Runbook Update ---"
  log "SKIP: No recent assessments found, skipping runbook update"
fi

# Task 4: Asana Health Check (direct script — no Claude needed)
ASANA_SCRIPT="${REPO_ROOT}/.claude/scripts/daily-asana-health-check.sh"
if [ -f "$ASANA_SCRIPT" ]; then
  run_task "Asana Health Check" "bash '$ASANA_SCRIPT'"
else
  log "--- Task: Asana Health Check ---"
  log "SKIP: Script not found at ${ASANA_SCRIPT}"
fi

# Task 5: SF Smoke Tests (direct script — no Claude needed)
SF_SMOKE_SCRIPT="${REPO_ROOT}/plugins/opspal-salesforce/scripts/daily-smoke-tests.sh"
if [ -f "$SF_SMOKE_SCRIPT" ]; then
  run_task "SF Smoke Tests" "bash '$SF_SMOKE_SCRIPT'"
else
  log "--- Task: SF Smoke Tests ---"
  log "SKIP: Script not found at ${SF_SMOKE_SCRIPT}"
fi

# --- Summary ---
log ""
log "=========================================="
log "Summary: ${PASSED} passed, ${FAILED} failed"
log "Log: ${LOG_FILE}"
log "=========================================="

if [ "$DRY_RUN" = true ]; then
  log "Dry run complete. No changes made."
  exit 0
fi

if [ $FAILED -gt 0 ]; then
  exit 1
fi

exit 0
