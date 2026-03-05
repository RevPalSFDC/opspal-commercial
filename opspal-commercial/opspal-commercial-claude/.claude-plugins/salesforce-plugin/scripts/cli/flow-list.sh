#!/usr/bin/env bash
# flow-list.sh — List active flows with correct fields (Salesforce only)
# Usage: scripts/cli/flow-list.sh [--org <alias>] [--json] [--like <substr>]

set -euo pipefail

ORG="${SF_TARGET_ORG:-}"
JSON="0"
LIKE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--org) ORG="$2"; shift 2 ;;
    --json) JSON="1"; shift ;;
    --like) LIKE="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

FILTER="Status = 'Active'"
if [[ -n "$LIKE" ]]; then
  # Match either MasterLabel or Definition.DeveloperName
  FILTER+=" AND (MasterLabel LIKE '%${LIKE//"/}"%' OR Definition.DeveloperName LIKE '%${LIKE//"/}"%')"
fi

QUERY="SELECT Id, MasterLabel, ProcessType, TriggerType, Status, VersionNumber, Definition.DeveloperName FROM Flow WHERE ${FILTER} ORDER BY MasterLabel"

if [[ -n "$ORG" ]]; then ORG_ARG=(--target-org "$ORG"); else ORG_ARG=(); fi

RAW=$(sf data query --use-tooling-api --json --query "$QUERY" "${ORG_ARG[@]}")

if [[ "$JSON" == "1" ]]; then
  echo "$RAW" | jq '{records: .result.records}'
else
  echo "$RAW" | jq -r '.result.records[] | "- " + .MasterLabel + " [" + (.Definition.DeveloperName // "-") + "]  type=" + .ProcessType + ", trig=" + (.TriggerType // "-") + ", v=" + (.VersionNumber|tostring)'
fi

