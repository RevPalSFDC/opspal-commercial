#!/usr/bin/env bash
# fields-search.sh — Find fields on an object using best available method (Salesforce only)
# Usage: scripts/cli/fields-search.sh <SOBJECT> <substring> [-o org] [--json]

set -euo pipefail

ORG="${SF_TARGET_ORG:-}"
JSON="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--org) ORG="$2"; shift 2 ;;
    --json) JSON="1"; shift ;;
    *) break ;;
  esac
done

SOBJ="${1:-}"; NEEDLE="${2:-}"
[[ -z "$SOBJ" || -z "$NEEDLE" ]] && { echo "Usage: $0 <SOBJECT> <substring> [-o org] [--json]"; exit 1; }

# Prefer sf sobject describe
if command -v sf >/dev/null 2>&1; then
  if [[ -n "$ORG" ]]; then
    OUT=$(sf sobject describe --sobject "$SOBJ" --target-org "$ORG" --json)
  else
    OUT=$(sf sobject describe --sobject "$SOBJ" --json)
  fi
  if [[ "$JSON" == "1" ]]; then
    echo "$OUT" | jq --arg n "$NEEDLE" '.result.fields[] | select(.name | test($n; "i") or .label | test($n; "i"))'
  else
    echo "$OUT" | jq -r --arg n "$NEEDLE" '.result.fields[] | select(.name | test($n; "i") or .label | test($n; "i")) | "- " + .name + " (" + .label + ") : " + .type'
  fi
  exit 0
fi

# Fallback: Tooling API FieldDefinition
QUERY="SELECT QualifiedApiName, Label, DataType FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${SOBJ}'"
if [[ -n "$ORG" ]]; then ORG_ARG=(--target-org "$ORG"); else ORG_ARG=(); fi

RAW=$(sf data query --use-tooling-api --json --query "$QUERY" "${ORG_ARG[@]}")
if [[ "$JSON" == "1" ]]; then
  echo "$RAW" | jq --arg n "$NEEDLE" '.result.records[] | select(.QualifiedApiName | test($n; "i") or (.Label // "") | test($n; "i"))'
else
  echo "$RAW" | jq -r --arg n "$NEEDLE" '.result.records[] | select(.QualifiedApiName | test($n; "i") or (.Label // "") | test($n; "i")) | "- " + .QualifiedApiName + " (" + (.Label // "") + ") : " + .DataType'
fi
