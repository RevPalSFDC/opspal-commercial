#!/bin/bash
#
# PDF Generator Wrapper
#
# Purpose: Ensures node_modules are in the search path when invoking pdf-generator.js
# This wrapper resolves the NODE_PATH issue where direct node invocation fails to
# find dependencies (md-to-pdf, pdf-lib) installed in the plugin's node_modules.
#
# Usage:
#   ./generate-pdf.sh report.md report.pdf
#   ./generate-pdf.sh --input report.md --output report.pdf
#   ./generate-pdf.sh --help
#
# Alternative methods:
#   npm run pdf --prefix plugins/opspal-core -- report.md report.pdf
#   npm run pdf --prefix plugins/opspal-core -- --input report.md --output report.pdf
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

# Set NODE_PATH to include plugin's node_modules
export NODE_PATH="$PLUGIN_ROOT/node_modules${NODE_PATH:+:$NODE_PATH}"

# Verify critical dependencies before running
declare -a MISSING_DEPS=()

verify_dependencies() {
    MISSING_DEPS=()

    for pkg in md-to-pdf pdf-lib; do
        if ! node -e "require.resolve('$pkg')" 2>/dev/null; then
            MISSING_DEPS+=("$pkg")
        fi
    done

    [ ${#MISSING_DEPS[@]} -eq 0 ]
}

attempt_dependency_recovery() {
    if ! command -v npm >/dev/null 2>&1; then
        echo "" >&2
        echo "ERROR: npm not found while trying to auto-install missing dependencies: ${MISSING_DEPS[*]}" >&2
        echo "" >&2
        return 1
    fi

    echo "" >&2
    echo "WARN: Missing npm dependencies detected: ${MISSING_DEPS[*]}" >&2
    echo "Attempting automatic recovery with npm install --omit=dev ..." >&2
    echo "" >&2

    if (cd "$PLUGIN_ROOT" && npm install --omit=dev); then
        echo "Dependency recovery completed." >&2
        return 0
    fi

    echo "" >&2
    echo "ERROR: Automatic dependency recovery failed." >&2
    echo "" >&2
    echo "Manual recovery options:" >&2
    echo "  cd $PLUGIN_ROOT && npm install --omit=dev" >&2
    echo "  /checkdependencies --fix" >&2
    echo "" >&2
    return 1
}

if ! verify_dependencies; then
    attempt_dependency_recovery || exit 1
    if ! verify_dependencies; then
        echo "" >&2
        echo "ERROR: Missing npm dependencies after auto-recovery attempt: ${MISSING_DEPS[*]}" >&2
        echo "" >&2
        echo "Manual recovery options:" >&2
        echo "  cd $PLUGIN_ROOT && npm install --omit=dev" >&2
        echo "  /checkdependencies --fix" >&2
        echo "" >&2
        exit 1
    fi
fi

# Run the generator
exec node "$PLUGIN_ROOT/scripts/lib/pdf-generator.js" "$@"
