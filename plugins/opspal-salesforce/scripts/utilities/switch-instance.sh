#!/bin/bash

# Wrapper to keep backwards compatibility with older entry points.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_SWITCH="${SCRIPT_DIR}/../switch-instance.sh"

exec "$MAIN_SWITCH" "$@"
