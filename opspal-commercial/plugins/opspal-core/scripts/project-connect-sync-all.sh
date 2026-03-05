#!/usr/bin/env bash
#
# project-connect-sync-all.sh - Batch sync for all project-connected orgs
#
# Scans orgs/*/ for .sync-manifest.json, runs git fetch + pull --ff-only
# in each .repo/, and outputs a JSON summary.
#
# Usage:
#   ./project-connect-sync-all.sh [--pull] [--quiet] [--workspace /path]
#
# Options:
#   --pull         Pull changes (default: fetch only)
#   --quiet        Suppress per-org output (summary only)
#   --workspace    Explicit workspace root (default: $PWD)
#
# Environment:
#   ENABLE_GIT_SYNC=0   Skip sync entirely (for opt-out)
#

set -euo pipefail

# Opt-out check
if [ "${ENABLE_GIT_SYNC:-1}" = "0" ]; then
  echo '{"skipped":true,"reason":"ENABLE_GIT_SYNC=0"}' >&2
  exit 0
fi

# Parse args
DO_PULL=false
QUIET=false
WORKSPACE_ROOT=""
for arg in "$@"; do
  case "$arg" in
    --pull) DO_PULL=true ;;
    --quiet) QUIET=true ;;
    --workspace) WORKSPACE_ROOT="next" ;;
    *)
      if [ "$WORKSPACE_ROOT" = "next" ]; then
        WORKSPACE_ROOT="$arg"
      fi
      ;;
  esac
done

# Resolve workspace root
if [ -z "$WORKSPACE_ROOT" ] || [ "$WORKSPACE_ROOT" = "next" ]; then
  if [ -d "$PWD/orgs" ]; then
    WORKSPACE_ROOT="$PWD"
  else
    # Try git toplevel
    TOPLEVEL="$(git rev-parse --show-toplevel 2>/dev/null || true)"
    if [ -n "$TOPLEVEL" ] && [ -d "$TOPLEVEL/orgs" ]; then
      WORKSPACE_ROOT="$TOPLEVEL"
    else
      echo '{"synced":0,"skipped":0,"errors":["Could not find workspace root"]}' >&2
      exit 1
    fi
  fi
fi

ORGS_DIR="$WORKSPACE_ROOT/orgs"

LOG_DIR="$HOME/.claude/logs"
LOG_FILE="$LOG_DIR/project-connect-sync.jsonl"
mkdir -p "$LOG_DIR"

SYNCED=0
SKIPPED=0
ERRORS=""
RESULTS=""
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [ ! -d "$ORGS_DIR" ]; then
  echo '{"synced":0,"skipped":0,"errors":["orgs/ directory not found"]}' >&2
  exit 1
fi

for manifest in "$ORGS_DIR"/*/.sync-manifest.json; do
  [ -f "$manifest" ] || continue

  ORG_DIR="$(dirname "$manifest")"
  ORG_SLUG="$(basename "$ORG_DIR")"
  REPO_DIR="$ORG_DIR/.repo"

  if [ ! -d "$REPO_DIR/.git" ]; then
    [ "$QUIET" = false ] && echo "  SKIP $ORG_SLUG: .repo/.git not found" >&2
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Fetch
  FETCH_OUT=""
  if ! FETCH_OUT=$(cd "$REPO_DIR" && git fetch origin 2>&1); then
    ERR_MSG="$ORG_SLUG: fetch failed: $FETCH_OUT"
    [ "$QUIET" = false ] && echo "  ERR  $ERR_MSG" >&2
    ERRORS="${ERRORS:+$ERRORS,}\"$ERR_MSG\""
    continue
  fi

  # Check if behind
  BRANCH=$(cd "$REPO_DIR" && git rev-parse --abbrev-ref HEAD 2>/dev/null)
  BEHIND=$(cd "$REPO_DIR" && git rev-list --count HEAD..origin/"$BRANCH" 2>/dev/null || echo "0")

  if [ "$BEHIND" = "0" ]; then
    [ "$QUIET" = false ] && echo "  OK   $ORG_SLUG: up to date" >&2
    SYNCED=$((SYNCED + 1))
    RESULT="{\"org\":\"$ORG_SLUG\",\"action\":\"fetch\",\"behind\":0,\"pulled\":false}"
    RESULTS="${RESULTS:+$RESULTS,}$RESULT"
    continue
  fi

  if [ "$DO_PULL" = true ]; then
    # Check for dirty working tree
    if [ -n "$(cd "$REPO_DIR" && git status --porcelain)" ]; then
      ERR_MSG="$ORG_SLUG: dirty working tree, skipping pull ($BEHIND commits behind)"
      [ "$QUIET" = false ] && echo "  WARN $ERR_MSG" >&2
      ERRORS="${ERRORS:+$ERRORS,}\"$ERR_MSG\""
      continue
    fi

    # Fast-forward only pull
    PULL_OUT=""
    if PULL_OUT=$(cd "$REPO_DIR" && git pull --ff-only origin "$BRANCH" 2>&1); then
      [ "$QUIET" = false ] && echo "  PULL $ORG_SLUG: pulled $BEHIND commit(s)" >&2
      SYNCED=$((SYNCED + 1))
      RESULT="{\"org\":\"$ORG_SLUG\",\"action\":\"pull\",\"behind\":$BEHIND,\"pulled\":true}"
      RESULTS="${RESULTS:+$RESULTS,}$RESULT"
    else
      ERR_MSG="$ORG_SLUG: pull --ff-only failed (diverged?): $PULL_OUT"
      [ "$QUIET" = false ] && echo "  ERR  $ERR_MSG" >&2
      ERRORS="${ERRORS:+$ERRORS,}\"$ERR_MSG\""
    fi
  else
    [ "$QUIET" = false ] && echo "  NEED $ORG_SLUG: $BEHIND commit(s) behind (fetch only)" >&2
    SYNCED=$((SYNCED + 1))
    RESULT="{\"org\":\"$ORG_SLUG\",\"action\":\"fetch\",\"behind\":$BEHIND,\"pulled\":false}"
    RESULTS="${RESULTS:+$RESULTS,}$RESULT"
  fi
done

# Build summary
SUMMARY="{\"synced\":$SYNCED,\"skipped\":$SKIPPED,\"errors\":[${ERRORS}],\"results\":[${RESULTS}],\"timestamp\":\"$TIMESTAMP\"}"

# Log to file
echo "$SUMMARY" >> "$LOG_FILE"

# Output summary
echo "$SUMMARY"
