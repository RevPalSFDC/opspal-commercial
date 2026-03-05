#!/bin/bash
# load_commons.sh
# Convenience script to load shell commons from any location
# Usage: source "$(dirname "$0")/lib/load_commons.sh"
#        OR: source "/path/to/scripts/lib/load_commons.sh"

# Determine the library directory
if [[ -n "${BASH_SOURCE[0]}" ]]; then
    LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
    # Fallback for when sourced in different ways
    LIB_DIR="$(cd "$(dirname "$0")" && pwd)"
fi

# Source the shell commons library
# shellcheck source=shell-commons.sh
source "${LIB_DIR}/shell-commons.sh"

log_debug "Commons library loaded from: ${LIB_DIR}"