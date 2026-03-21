#!/usr/bin/env bash
#
# Deprecated inactive pre-tool hook.
#
# This file implemented a Task-era agent restriction model before the
# commercial runtime moved to the shared opspal-core Agent-based
# enforcement path. It is intentionally kept as a no-op stub so stale
# local settings cannot accidentally reactivate legacy Task semantics.
#
# Active enforcement now lives in:
#   - opspal-core/hooks/pre-tool-use-contract-validation.sh
#   - opspal-core/hooks/pre-task-agent-validator.sh
#

set -euo pipefail

exit 0
