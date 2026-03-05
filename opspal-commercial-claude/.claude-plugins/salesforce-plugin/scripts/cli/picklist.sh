#!/usr/bin/env bash
# picklist.sh — Thin CLI shim around Node picklist validator (Salesforce only)
# Usage:
#   scripts/cli/picklist.sh validate <csv> <object> [-o org] [--json]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"
NODE_TOOL="${PROJECT_ROOT}/mcp-tools/picklist-validator.js"

if [[ ! -f "$NODE_TOOL" ]]; then
  echo "picklist-cli: validator not found at $NODE_TOOL" >&2
  exit 2
fi

cmd="${1:-}"
shift || true

ORG="${SF_TARGET_ORG:-}";
JSON_FLAG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--org)
      ORG="$2"; shift 2 ;;
    --json)
      JSON_FLAG="--json"; shift ;;
    *)
      break ;;
  esac
done

case "$cmd" in
  validate)
    CSV="${1:-}"; OBJ="${2:-}"; [[ -z "$CSV" || -z "$OBJ" ]] && {
      echo "Usage: picklist.sh validate <csv> <object> [-o org] [--json]"; exit 1; }
    if [[ -n "$ORG" ]]; then
      node "$NODE_TOOL" $JSON_FLAG --quiet "$CSV" "$OBJ" "$ORG"
    else
      node "$NODE_TOOL" $JSON_FLAG --quiet "$CSV" "$OBJ"
    fi
    ;;
  *)
    echo "Usage: picklist.sh validate <csv> <object> [-o org] [--json]"; exit 1 ;;
esac

