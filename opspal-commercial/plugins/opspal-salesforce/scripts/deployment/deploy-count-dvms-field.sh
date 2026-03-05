#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PROJECT_ROOT="${PROJECT_ROOT:-}"
if [[ -z "$PROJECT_ROOT" ]]; then
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

TARGET_ORG="${TARGET_ORG:-beta-sandbox}"
SF_BIN="${SF_BIN:-sf}"

if ! command -v "$SF_BIN" >/dev/null 2>&1; then
  echo "❌ Salesforce CLI not found: $SF_BIN" >&2
  exit 1
fi

SOURCE_PATH="$PROJECT_ROOT/force-app/main/default/objects/Account/fields/Count_of_DVMs__c.field-meta.xml"
if [[ ! -f "$SOURCE_PATH" ]]; then
  echo "❌ Field metadata not found: $SOURCE_PATH" >&2
  echo "Set PROJECT_ROOT to the Salesforce project root that contains force-app." >&2
  exit 1
fi

echo "🚀 Deploying Count_of_DVMs__c to $TARGET_ORG"
"$SF_BIN" project deploy start \
  --source-dir "$SOURCE_PATH" \
  --target-org "$TARGET_ORG" \
  --wait 10 \
  --verbose
