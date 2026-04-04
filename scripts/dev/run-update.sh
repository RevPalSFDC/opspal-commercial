#!/bin/bash

# Load environment variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${OPSPAL_INTERNAL_PLUGINS_ENV:-${SCRIPT_DIR}/../../opspal-internal-plugins/.env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
else
  echo "Warning: .env file not found at $ENV_FILE" >&2
fi

# Execute the update
INTERNAL_ROOT="${OPSPAL_INTERNAL_PLUGINS_ROOT:-${SCRIPT_DIR}/../../opspal-internal-plugins}"
node "${INTERNAL_ROOT}/update-reflection-status.js" \
  068c7cf7-7087-4a29-940e-ba25163505c6 \
  under_review
