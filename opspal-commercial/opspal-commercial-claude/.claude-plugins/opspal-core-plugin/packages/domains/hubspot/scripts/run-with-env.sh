#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${HUBSPOT_ENV_FILE:-.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  . "$ENV_FILE"
  set +a
fi

exec "$@"
