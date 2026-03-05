#!/bin/bash
#
# PreCompact Hook - Transcript Backup
#
# Purpose: Backs up conversation transcripts before Claude compacts them
#          to prevent data loss when token limits are reached.
#
# Pattern: Adopted from claude-code-hooks-mastery repository
#          https://github.com/disler/claude-code-hooks-mastery
#
# Configuration:
#   ENABLE_TRANSCRIPT_BACKUP=1      # Enable (default)
#   ENABLE_TRANSCRIPT_BACKUP=0      # Disable
#   TRANSCRIPT_BACKUP_DIR=path      # Custom backup location
#   TRANSCRIPT_RETENTION_DAYS=30    # Days to keep backups (default 30)
#
# Output: JSON response with backup status
#
# Exit Codes:
#   0 = Success
#   2 = Warning (backup failed but allow compaction to continue)
#

set -euo pipefail

# Configuration
ENABLE_BACKUP="${ENABLE_TRANSCRIPT_BACKUP:-1}"
BACKUP_DIR="${TRANSCRIPT_BACKUP_DIR:-$HOME/.claude/transcript-backups}"
RETENTION_DAYS="${TRANSCRIPT_RETENTION_DAYS:-30}"

# OutputFormatter and HookLogger
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FORMATTER="$SCRIPT_DIR/../scripts/lib/output-formatter.js"
HOOK_LOGGER="$SCRIPT_DIR/../scripts/lib/hook-logger.js"
HOOK_NAME="pre-compact"

# Transcript location
TRANSCRIPT_FILE="${CLAUDE_TRANSCRIPT_FILE:-$HOME/.claude/transcript.jsonl}"

# Log file
LOG_FILE="${BACKUP_DIR}/backup.log"

# Initialize logging
log() {
  local level="$1"
  shift
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $*" >> "$LOG_FILE" 2>/dev/null || true
}

# If disabled, pass through
if [ "$ENABLE_BACKUP" != "1" ]; then
  echo '{}'
  exit 0
fi

# Ensure backup directory exists
if ! mkdir -p "$BACKUP_DIR" 2>/dev/null; then
  # Cannot create backup dir - warn but continue
  ERROR_MSG="Cannot create backup directory: $BACKUP_DIR"

  # Log backup directory creation failure
  [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" warning "$HOOK_NAME" "Cannot create backup directory" \
    "{\"backupDir\":\"$BACKUP_DIR\"}"

  # Exit 2 pattern: Automatic feedback without blocking
  if [ -f "$OUTPUT_FORMATTER" ]; then
    node "$OUTPUT_FORMATTER" warning \
      "Transcript Backup Skipped" \
      "Cannot create backup directory but allowing compaction to continue" \
      "Backup Directory:$BACKUP_DIR" \
      "Check directory permissions,Verify disk space available,Set TRANSCRIPT_BACKUP_DIR to writable location,Set ENABLE_TRANSCRIPT_BACKUP=0 to disable backups" \
      ""
  fi

  echo "{\"systemMessage\": \"⚠️ Transcript backup skipped: $ERROR_MSG\"}" >&2
  log "ERROR" "$ERROR_MSG"
  exit 2  # Exit 2 = warning, don't block compaction
fi

# Initialize log file if needed
if [ ! -f "$LOG_FILE" ]; then
  touch "$LOG_FILE" 2>/dev/null || true
fi

# Check if transcript exists
if [ ! -f "$TRANSCRIPT_FILE" ]; then
  # No transcript to backup - this is normal for new sessions
  log "INFO" "No transcript file found at $TRANSCRIPT_FILE (new session?)"
  echo '{}'
  exit 0
fi

# Generate backup filename with timestamp
TIMESTAMP=$(date '+%Y%m%d-%H%M%S')
BACKUP_FILE="$BACKUP_DIR/transcript-$TIMESTAMP.jsonl"

# Attempt backup
log "INFO" "Starting transcript backup to $BACKUP_FILE"

if cp "$TRANSCRIPT_FILE" "$BACKUP_FILE" 2>/dev/null; then
  # Get file sizes for confirmation
  ORIGINAL_SIZE=$(wc -c < "$TRANSCRIPT_FILE" 2>/dev/null || echo "0")
  BACKUP_SIZE=$(wc -c < "$BACKUP_FILE" 2>/dev/null || echo "0")

  # Verify backup size matches
  if [ "$ORIGINAL_SIZE" -eq "$BACKUP_SIZE" ]; then
    log "INFO" "Backup successful: $BACKUP_FILE ($BACKUP_SIZE bytes)"

    # Cleanup old backups (older than retention period)
    if command -v find >/dev/null 2>&1; then
      DELETED_COUNT=$(find "$BACKUP_DIR" -name "transcript-*.jsonl" -type f -mtime +${RETENTION_DAYS} -delete -print 2>/dev/null | wc -l)
      if [ "$DELETED_COUNT" -gt 0 ]; then
        log "INFO" "Cleaned up $DELETED_COUNT old backups (>$RETENTION_DAYS days)"
      fi
    fi

    # Success - return status message
    echo "{\"systemMessage\": \"✅ Transcript backed up to: ${BACKUP_FILE##*/}\"}"
    exit 0
  else
    # Size mismatch - backup may be incomplete
    ERROR_MSG="Backup size mismatch: original=$ORIGINAL_SIZE, backup=$BACKUP_SIZE"

    # Log backup size mismatch
    [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" warning "$HOOK_NAME" "Backup size mismatch - backup may be incomplete" \
      "{\"originalSize\":$ORIGINAL_SIZE,\"backupSize\":$BACKUP_SIZE,\"backupFile\":\"$BACKUP_FILE\"}"

    # Exit 2 pattern: Automatic feedback without blocking
    if [ -f "$OUTPUT_FORMATTER" ]; then
      node "$OUTPUT_FORMATTER" warning \
        "Transcript Backup Size Mismatch" \
        "Backup file size does not match original - backup may be incomplete but allowing compaction to continue" \
        "Original Size:$ORIGINAL_SIZE bytes,Backup Size:$BACKUP_SIZE bytes,Backup File:${BACKUP_FILE##*/}" \
        "Check disk space during backup,Verify backup directory is writable,Review backup logs for issues,Consider manual backup before compaction" \
        ""
    fi

    log "ERROR" "$ERROR_MSG"
    rm -f "$BACKUP_FILE" 2>/dev/null || true
    echo "{\"systemMessage\": \"⚠️ Backup failed: $ERROR_MSG\"}" >&2
    exit 2  # Warning - don't block compaction
  fi
else
  # Backup failed
  ERROR_MSG="Failed to copy transcript to $BACKUP_FILE"

  # Log backup copy failure
  [ -f "$HOOK_LOGGER" ] && node "$HOOK_LOGGER" warning "$HOOK_NAME" "Failed to copy transcript" \
    "{\"transcriptFile\":\"$TRANSCRIPT_FILE\",\"backupFile\":\"$BACKUP_FILE\"}"

  # Exit 2 pattern: Automatic feedback without blocking
  if [ -f "$OUTPUT_FORMATTER" ]; then
    node "$OUTPUT_FORMATTER" warning \
      "Transcript Backup Failed" \
      "Failed to copy transcript file to backup location but allowing compaction to continue" \
      "Transcript File:$TRANSCRIPT_FILE,Backup File:$BACKUP_FILE" \
      "Check file permissions,Verify disk space available,Ensure backup directory is writable,Review backup logs for details,Consider manual backup before compaction" \
      ""
  fi

  log "ERROR" "$ERROR_MSG"
  echo "{\"systemMessage\": \"⚠️ Backup failed: $ERROR_MSG\"}" >&2
  exit 2  # Warning - don't block compaction
fi
