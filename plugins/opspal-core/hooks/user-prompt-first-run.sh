#!/usr/bin/env bash
# STATUS: SUPERSEDED — called as child hook by user-prompt-dispatcher.sh (the registered UserPromptSubmit hook)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"


# Dispatcher guard — this hook is invoked by user-prompt-dispatcher.sh.
# When run standalone (no dispatcher context and stdin is a terminal),
# exit cleanly rather than firing against ambient terminal input.
if [[ "${DISPATCHER_CONTEXT:-0}" != "1" ]] && [[ -t 0 ]]; then
  echo "[$(basename "$0")] INFO: standalone invocation — no dispatcher context, skipping" >&2
  exit 0
fi
node "$PLUGIN_ROOT/scripts/lib/first-run-onboarding.js" hook-user-prompt
