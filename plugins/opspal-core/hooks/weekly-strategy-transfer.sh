#!/usr/bin/env bash
# STATUS: STAGED — not registered by design (experimental or non-hook-event script)

# =============================================================================
# Weekly Skill Transfer Hook
# ACE Framework - Cross-Agent Knowledge Transfer Engine
#
# Purpose: Automatically identify and transfer high-performing skills between
#          similar agents on a weekly schedule.
#
# Scheduling: Add to crontab for weekly execution
#   0 2 * * 0 /path/to/weekly-skill-transfer.sh
#
# Manual execution:
#   bash weekly-skill-transfer.sh
#   bash weekly-skill-transfer.sh --dry-run
#   bash weekly-skill-transfer.sh --force
#
# Version: 1.0.0
# =============================================================================

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$SCRIPT_DIR")}"

# Source error handler
if [[ -f "$PLUGIN_ROOT/hooks/lib/error-handler.sh" ]]; then
  source "$PLUGIN_ROOT/hooks/lib/error-handler.sh"
  HOOK_NAME="weekly-skill-transfer"
fi

# Configuration
VERBOSE="${ROUTING_VERBOSE:-0}"
DRY_RUN=0
FORCE=0
TRANSFER_ENGINE="$PLUGIN_ROOT/scripts/lib/strategy-transfer-engine.js"
REPORT_DIR="${HOME}/.claude/reports/skill-transfers"
LOG_FILE="${HOME}/.claude/logs/skill-transfers.jsonl"

# Slack notification settings
SLACK_ENABLED="${ENABLE_SKILL_TRANSFER_SLACK:-1}"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"

# Transfer thresholds (override defaults if needed)
MIN_SUCCESS_RATE="${SKILL_TRANSFER_MIN_SUCCESS_RATE:-0.85}"
MIN_USAGE="${SKILL_TRANSFER_MIN_USAGE:-30}"
VALIDATION_THRESHOLD="${SKILL_TRANSFER_VALIDATION_THRESHOLD:-20}"

# ============================================================================
# Logging Functions
# ============================================================================

log() {
  local level="$1"
  shift
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  if [[ "$VERBOSE" == "1" ]] || [[ "$level" == "ERROR" ]] || [[ "$level" == "INFO" ]]; then
    echo "[$timestamp] [WeeklySkillTransfer] [$level] $*" >&2
  fi
}

log_json() {
  local event="$1"
  local data="$2"
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  mkdir -p "$(dirname "$LOG_FILE")"
  echo "{\"timestamp\":\"$timestamp\",\"event\":\"$event\",\"data\":$data}" >> "$LOG_FILE"
}

# ============================================================================
# Helper Functions
# ============================================================================

show_help() {
  cat << EOF
Weekly Skill Transfer - ACE Framework v1.0.0

Usage: $(basename "$0") [OPTIONS]

Options:
  --dry-run     Simulate transfers without executing them
  --force       Run transfers regardless of last execution time
  --verbose     Enable verbose output
  --help        Show this help message

Configuration (Environment Variables):
  SKILL_TRANSFER_MIN_SUCCESS_RATE   Minimum success rate for transfer (default: 0.85)
  SKILL_TRANSFER_MIN_USAGE          Minimum usage count (default: 30)
  SKILL_TRANSFER_VALIDATION_THRESHOLD  Validation uses before acceptance (default: 20)
  ENABLE_SKILL_TRANSFER_SLACK       Enable Slack notifications (default: 1)
  SLACK_WEBHOOK_URL                 Slack webhook for notifications

Examples:
  # Run weekly transfer
  $(basename "$0")

  # Dry run to see what would be transferred
  $(basename "$0") --dry-run

  # Force run (ignore weekly schedule)
  $(basename "$0") --force

Schedule with cron (every Sunday at 2:00 AM):
  0 2 * * 0 /path/to/$(basename "$0")

EOF
}

check_prerequisites() {
  log "INFO" "Checking prerequisites..."

  # Check Node.js
  if ! command -v node &> /dev/null; then
    log "ERROR" "Node.js is required but not installed"
    return 1
  fi

  # Check transfer engine exists
  if [[ ! -f "$TRANSFER_ENGINE" ]]; then
    log "ERROR" "Transfer engine not found: $TRANSFER_ENGINE"
    return 1
  fi

  # Check Supabase configuration
  if [[ -z "${SUPABASE_URL:-}" ]] || [[ -z "${SUPABASE_ANON_KEY:-}" ]]; then
    log "WARN" "Supabase credentials not configured - some features may not work"
  fi

  log "INFO" "Prerequisites check passed"
  return 0
}

should_run() {
  # Always run if forced
  if [[ "$FORCE" == "1" ]]; then
    log "INFO" "Force flag set - running regardless of schedule"
    return 0
  fi

  # Check last execution time
  local last_run_file="${HOME}/.claude/state/last-skill-transfer.timestamp"

  if [[ ! -f "$last_run_file" ]]; then
    log "INFO" "No previous run recorded - proceeding"
    return 0
  fi

  local last_run
  last_run=$(cat "$last_run_file" 2>/dev/null || echo "0")
  local now
  now=$(date +%s)
  local diff=$((now - last_run))
  local week_seconds=$((7 * 24 * 60 * 60))

  if [[ $diff -lt $week_seconds ]]; then
    local days_ago=$((diff / 86400))
    log "INFO" "Last run was $days_ago days ago - skipping (use --force to override)"
    return 1
  fi

  return 0
}

record_execution() {
  local state_dir="${HOME}/.claude/state"
  mkdir -p "$state_dir"
  date +%s > "$state_dir/last-skill-transfer.timestamp"
}

send_slack_notification() {
  local status="$1"
  local summary="$2"
  local details="${3:-}"

  if [[ "$SLACK_ENABLED" != "1" ]] || [[ -z "$SLACK_WEBHOOK_URL" ]]; then
    log "DEBUG" "Slack notifications disabled or webhook not configured"
    return 0
  fi

  local color
  local icon
  case "$status" in
    "success")
      color="good"
      icon=":brain:"
      ;;
    "warning")
      color="warning"
      icon=":warning:"
      ;;
    "error")
      color="danger"
      icon=":x:"
      ;;
    *)
      color="#808080"
      icon=":gear:"
      ;;
  esac

  local payload
  payload=$(cat << EOF
{
  "attachments": [
    {
      "color": "$color",
      "fallback": "$summary",
      "title": "$icon ACE Framework - Weekly Skill Transfer",
      "text": "$summary",
      "fields": [
        {
          "title": "Details",
          "value": "$details",
          "short": false
        },
        {
          "title": "Timestamp",
          "value": "$(date -u +"%Y-%m-%d %H:%M:%S UTC")",
          "short": true
        },
        {
          "title": "Mode",
          "value": "$( [[ "$DRY_RUN" == "1" ]] && echo "Dry Run" || echo "Live" )",
          "short": true
        }
      ],
      "footer": "ACE Framework v1.0.0 | OpsPal Plugin System"
    }
  ]
}
EOF
)

  curl -s -X POST -H 'Content-type: application/json' \
    --data "$payload" \
    "$SLACK_WEBHOOK_URL" > /dev/null 2>&1 || {
    log "WARN" "Failed to send Slack notification"
  }
}

generate_report() {
  local stats_json="$1"
  local report_file="$REPORT_DIR/transfer-report-$(date +%Y-%m-%d).md"

  mkdir -p "$REPORT_DIR"

  cat << EOF > "$report_file"
# Weekly Skill Transfer Report

**Date**: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
**Mode**: $( [[ "$DRY_RUN" == "1" ]] && echo "Dry Run" || echo "Live Execution" )

## Configuration

| Parameter | Value |
|-----------|-------|
| Minimum Success Rate | ${MIN_SUCCESS_RATE} |
| Minimum Usage Count | ${MIN_USAGE} |
| Validation Threshold | ${VALIDATION_THRESHOLD} |

## Transfer Statistics

\`\`\`json
$stats_json
\`\`\`

## Actions Taken

$(echo "$stats_json" | node -e "
const stats = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
if (stats.transfers && stats.transfers.length > 0) {
  stats.transfers.forEach(t => {
    console.log('- **' + t.skillId + '**: ' + t.sourceAgent + ' → ' + t.targetAgent);
  });
} else {
  console.log('_No transfers executed this week._');
}
" 2>/dev/null || echo "_Unable to parse transfer details._")

---
*Generated by ACE Framework v1.0.0*
EOF

  log "INFO" "Report generated: $report_file"
  echo "$report_file"
}

# ============================================================================
# Main Transfer Logic
# ============================================================================

run_transfers() {
  log "INFO" "Starting skill transfer analysis..."

  local cmd_args="auto"

  # Add dry run flag if set
  if [[ "$DRY_RUN" == "1" ]]; then
    cmd_args="$cmd_args --dry-run"
  fi

  # Add threshold overrides
  cmd_args="$cmd_args --min-success ${MIN_SUCCESS_RATE}"
  cmd_args="$cmd_args --min-usage ${MIN_USAGE}"
  cmd_args="$cmd_args --validation-threshold ${VALIDATION_THRESHOLD}"

  log "INFO" "Executing: node $TRANSFER_ENGINE $cmd_args"

  # Run the transfer engine
  local result
  result=$(node "$TRANSFER_ENGINE" $cmd_args 2>&1) || {
    local exit_code=$?
    log "ERROR" "Transfer engine failed with exit code $exit_code"
    log "ERROR" "Output: $result"

    log_json "transfer_failed" "{\"exit_code\":$exit_code,\"error\":\"$(echo "$result" | head -1 | sed 's/"/\\"/g')\"}"
    send_slack_notification "error" "Skill transfer failed" "Exit code: $exit_code"

    return $exit_code
  }

  log "INFO" "Transfer engine completed successfully"

  # Parse results
  local stats_json
  stats_json=$(echo "$result" | grep -E '^\{' | tail -1) || stats_json="{}"

  # Log results
  log_json "transfer_completed" "$stats_json"

  # Generate report
  local report_file
  report_file=$(generate_report "$stats_json")

  # Extract summary for Slack
  local transfers_executed
  local candidates_found
  transfers_executed=$(echo "$stats_json" | node -e "
    const s = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
    console.log(s.transfersExecuted || 0);
  " 2>/dev/null || echo "0")
  candidates_found=$(echo "$stats_json" | node -e "
    const s = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
    console.log(s.candidatesFound || 0);
  " 2>/dev/null || echo "0")

  local summary="$transfers_executed skill transfer(s) executed from $candidates_found candidate(s)."
  local details="Report: $report_file"

  if [[ "$transfers_executed" -gt 0 ]]; then
    send_slack_notification "success" "$summary" "$details"
  else
    log "INFO" "No transfers needed this week"
    send_slack_notification "info" "No skill transfers needed this week" "All agents are performing optimally"
  fi

  return 0
}

# ============================================================================
# Main Entry Point
# ============================================================================

main() {
  # Parse command line arguments
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run)
        DRY_RUN=1
        log "INFO" "Dry run mode enabled"
        shift
        ;;
      --force)
        FORCE=1
        shift
        ;;
      --verbose)
        VERBOSE=1
        shift
        ;;
      --help|-h)
        show_help
        exit 0
        ;;
      *)
        log "ERROR" "Unknown option: $1"
        show_help
        exit 1
        ;;
    esac
  done

  log "INFO" "=========================================="
  log "INFO" "ACE Framework - Weekly Skill Transfer"
  log "INFO" "=========================================="

  # Check prerequisites
  if ! check_prerequisites; then
    log "ERROR" "Prerequisites check failed"
    exit 1
  fi

  # Check if we should run
  if ! should_run; then
    exit 0
  fi

  # Run transfers
  if run_transfers; then
    # Record successful execution
    if [[ "$DRY_RUN" != "1" ]]; then
      record_execution
    fi

    log "INFO" "Weekly skill transfer completed successfully"
    exit 0
  else
    log "ERROR" "Weekly skill transfer failed"
    exit 1
  fi
}

# Run main function
main "$@"
