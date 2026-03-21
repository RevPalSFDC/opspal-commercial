#!/usr/bin/env bash
#
# Shared helpers for OpsPal update workflow scripts.
#

opspal_update_timestamp_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

opspal_update_session_id() {
  date -u +"%Y%m%dT%H%M%SZ-$$"
}

opspal_update_init_paths() {
  OPSPAL_UPDATE_LOG_DIR="${OPSPAL_UPDATE_LOG_DIR:-$HOME/.claude/logs}"
  OPSPAL_UPDATE_STATE_DIR="${OPSPAL_UPDATE_STATE_DIR:-$HOME/.claude/session-context}"
  OPSPAL_UPDATE_LOCK_DIR="${OPSPAL_UPDATE_LOCK_DIR:-$HOME/.claude/locks}"
  OPSPAL_UPDATE_BACKUP_DIR="${OPSPAL_UPDATE_BACKUP_DIR:-$HOME/.claude/backups/opspal-update}"

  mkdir -p "$OPSPAL_UPDATE_LOG_DIR" "$OPSPAL_UPDATE_STATE_DIR" "$OPSPAL_UPDATE_LOCK_DIR" "$OPSPAL_UPDATE_BACKUP_DIR"
}

opspal_update_merge_json() {
  local file_path="$1"
  local payload_json="$2"

  node - "$file_path" "$payload_json" <<'EOF'
'use strict';

const fs = require('fs');
const path = require('path');

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(target, source) {
  if (!isObject(target) || !isObject(source)) {
    return source;
  }

  const merged = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (isObject(value) && isObject(merged[key])) {
      merged[key] = deepMerge(merged[key], value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

const filePath = process.argv[2];
const payload = JSON.parse(process.argv[3] || '{}');
let current = {};

try {
  current = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch (_error) {
  current = {};
}

const merged = deepMerge(current, payload);
fs.mkdirSync(path.dirname(filePath), { recursive: true });
fs.writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
EOF
}

opspal_update_write_json() {
  local file_path="$1"
  local payload_json="$2"

  node - "$file_path" "$payload_json" <<'EOF'
'use strict';

const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];
const payload = JSON.parse(process.argv[3] || '{}');
fs.mkdirSync(path.dirname(filePath), { recursive: true });
fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
EOF
}

opspal_update_read_json_field() {
  local file_path="$1"
  local field_path="$2"

  node - "$file_path" "$field_path" <<'EOF'
'use strict';

const fs = require('fs');

const filePath = process.argv[2];
const fieldPath = process.argv[3];

let data = {};
try {
  data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch (_error) {
  process.exit(0);
}

let value = data;
for (const segment of fieldPath.split('.')) {
  if (!segment) continue;
  if (value === null || value === undefined || !Object.prototype.hasOwnProperty.call(value, segment)) {
    process.exit(0);
  }
  value = value[segment];
}

if (value === undefined) {
  process.exit(0);
}

if (value === null) {
  process.exit(0);
}

if (typeof value === 'string') {
  process.stdout.write(value);
} else {
  process.stdout.write(JSON.stringify(value));
}
EOF
}

opspal_update_backup_file() {
  local file_path="$1"
  local label="${2:-backup}"

  [ -f "$file_path" ] || return 1

  local timestamp
  local backup_path
  timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
  backup_path="$OPSPAL_UPDATE_BACKUP_DIR/$(basename "$file_path").${label}.${timestamp}.bak"
  cp "$file_path" "$backup_path"
  echo "$backup_path"
}

opspal_update_acquire_lock() {
  local lock_name="${1:-opspal-update}"
  local lock_path="$OPSPAL_UPDATE_LOCK_DIR/${lock_name}.lock"
  local pid_file="$lock_path/pid"
  local meta_file="$lock_path/meta.json"
  local stale_pid=""

  if mkdir "$lock_path" 2>/dev/null; then
    printf '%s\n' "$$" > "$pid_file"
    cat > "$meta_file" <<EOF
{"pid":$$,"createdAt":"$(opspal_update_timestamp_utc)","command":"$0","cwd":"$(pwd)"}
EOF
    OPSPAL_UPDATE_ACTIVE_LOCK="$lock_path"
    return 0
  fi

  if [ -f "$pid_file" ]; then
    stale_pid="$(cat "$pid_file" 2>/dev/null || true)"
  fi

  if [ -n "$stale_pid" ] && ! kill -0 "$stale_pid" 2>/dev/null; then
    rm -rf "$lock_path" 2>/dev/null || true
    if mkdir "$lock_path" 2>/dev/null; then
      printf '%s\n' "$$" > "$pid_file"
      cat > "$meta_file" <<EOF
{"pid":$$,"createdAt":"$(opspal_update_timestamp_utc)","command":"$0","cwd":"$(pwd)","recoveredStalePid":"$stale_pid"}
EOF
      OPSPAL_UPDATE_ACTIVE_LOCK="$lock_path"
      return 0
    fi
  fi

  echo "Another OpsPal update process appears to be running." >&2
  echo "Lock path: $lock_path" >&2
  if [ -n "$stale_pid" ]; then
    echo "Holding PID: $stale_pid" >&2
  fi
  return 1
}

opspal_update_release_lock() {
  if [ -n "${OPSPAL_UPDATE_ACTIVE_LOCK:-}" ] && [ -d "${OPSPAL_UPDATE_ACTIVE_LOCK:-}" ]; then
    rm -rf "$OPSPAL_UPDATE_ACTIVE_LOCK" 2>/dev/null || true
  fi
  OPSPAL_UPDATE_ACTIVE_LOCK=""
}
