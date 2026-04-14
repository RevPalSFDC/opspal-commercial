#!/usr/bin/env bash
# =============================================================================
# check-hook-registration.sh — CI gate for hook-to-settings.json alignment
# =============================================================================
#
# Compares hooks/*.sh files on disk against registered commands in
# .claude/settings.json. Fails if any hook is on disk but not registered
# AND lacks a "# STATUS:" header comment marking it as intentionally
# unregistered (STAGED, SUPERSEDED, or DISABLED).
#
# Excluded from scan:
#   - lib/ directories (shared utilities, not standalone hooks)
#   - archive/ directories (retired hooks)
#   - *.disabled files
#   - Files with "# STATUS: STAGED", "# STATUS: SUPERSEDED", or
#     "# STATUS: DISABLED" in the first 10 lines
#
# Usage:
#   bash scripts/check-hook-registration.sh          # CI mode (exit 1 on failure)
#   bash scripts/check-hook-registration.sh --report  # Report mode (always exit 0)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SETTINGS_FILE="$REPO_ROOT/.claude/settings.json"
PLUGINS_DIR="$REPO_ROOT/plugins"

REPORT_MODE=false
if [[ "${1:-}" == "--report" ]]; then
  REPORT_MODE=true
fi

if [ ! -f "$SETTINGS_FILE" ]; then
  echo "ERROR: settings.json not found at $SETTINGS_FILE"
  exit 1
fi

SETTINGS_CONTENT="$(cat "$SETTINGS_FILE")"

orphan_count=0
total_count=0
registered_count=0
status_marked_count=0
orphan_list=""

while IFS= read -r hook_file; do
  # Skip lib/ directories, archive/ directories, disabled files
  case "$hook_file" in
    */lib/*|*/archive/*|*.disabled) continue ;;
  esac

  total_count=$((total_count + 1))
  basename="$(basename "$hook_file")"

  # Check if registered in settings.json (search by basename)
  if echo "$SETTINGS_CONTENT" | grep -q "$basename"; then
    registered_count=$((registered_count + 1))
    continue
  fi

  # Check for STATUS header in first 10 lines
  if head -10 "$hook_file" | grep -qE '^#\s*STATUS:\s*(STAGED|SUPERSEDED|DISABLED)'; then
    status_marked_count=$((status_marked_count + 1))
    continue
  fi

  # This is an unmarked orphan
  orphan_count=$((orphan_count + 1))
  rel_path="${hook_file#$REPO_ROOT/}"
  orphan_list="${orphan_list}\n  ${rel_path}"
done < <(find "$PLUGINS_DIR" -name "*.sh" -path "*/hooks/*" -type f | sort)

echo "Hook Registration Check"
echo "======================="
echo "  Total hook files:    $total_count"
echo "  Registered:          $registered_count"
echo "  Status-marked:       $status_marked_count"
echo "  Unmarked orphans:    $orphan_count"
echo ""

if [ "$orphan_count" -gt 0 ]; then
  echo "UNMARKED ORPHANS (not in settings.json and missing # STATUS: header):"
  echo -e "$orphan_list"
  echo ""
  echo "Fix by either:"
  echo "  1. Register the hook in .claude/settings.json"
  echo "  2. Add '# STATUS: STAGED' to the file header (intentionally not registered)"
  echo "  3. Add '# STATUS: SUPERSEDED' to the file header (absorbed by a dispatcher)"
  echo "  4. Move to hooks/archive/ (retired)"
  echo ""

  if [ "$REPORT_MODE" = true ]; then
    echo "[REPORT] $orphan_count unmarked orphan(s) found (report mode — not failing)"
    exit 0
  else
    echo "[FAIL] $orphan_count unmarked orphan(s) found"
    exit 1
  fi
else
  echo "[PASS] All hooks are either registered or status-marked"
  exit 0
fi
