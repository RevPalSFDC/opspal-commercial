#!/bin/bash

# Instance Switcher - resolves instance paths without hardcoded directories.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENSURE_SCRIPT="${SCRIPT_DIR}/ensure-instance-ready.js"

usage() {
    echo "Usage: $0 <org-alias> [options]"
    echo ""
    echo "Options (passed through to ensure-instance-ready.js):"
    echo "  --create              Create instance directory if missing"
    echo "  --instances-root PATH Override instances root"
    echo "  --environment NAME    production|sandbox|uat|dev"
    echo "  --login-url URL       Override sfdx login URL"
    echo ""
    echo "Available instances:"
    node "$ENSURE_SCRIPT" --discover 2>/dev/null | awk '{print "  - " $1}' || true
}

if [ $# -eq 0 ] || [[ "${1:-}" == --* ]]; then
    usage
    exit 1
fi

ORG_ALIAS="$1"
shift

HAS_CREATE=0
for arg in "$@"; do
    if [[ "$arg" == "--create" ]] || [[ "$arg" == "--no-create" ]]; then
        HAS_CREATE=1
        break
    fi
done

EXTRA_ARGS=("$@")
if [ "$HAS_CREATE" -eq 0 ]; then
    EXTRA_ARGS+=("--no-create")
fi

INSTANCE_DIR=""
if ! INSTANCE_DIR=$(node "$ENSURE_SCRIPT" --org "$ORG_ALIAS" --print-dir --set-current "${EXTRA_ARGS[@]}" 2>/dev/null); then
    status=$?
    if [ "$status" -eq 2 ] && [ "$HAS_CREATE" -eq 0 ] && [ -t 0 ]; then
        read -p "Instance '$ORG_ALIAS' not found. Create it? (y/N): " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            filtered_args=()
            for arg in "${EXTRA_ARGS[@]}"; do
                if [[ "$arg" != "--no-create" ]]; then
                    filtered_args+=("$arg")
                fi
            done
            INSTANCE_DIR=$(node "$ENSURE_SCRIPT" --org "$ORG_ALIAS" --print-dir --set-current --create "${filtered_args[@]}")
        else
            exit 1
        fi
    else
        exit 1
    fi
fi

if [ -z "$INSTANCE_DIR" ]; then
    echo "Error: Instance directory could not be resolved." >&2
    exit 1
fi

export SF_TARGET_ORG="$ORG_ALIAS"
export SFDC_INSTANCE="$ORG_ALIAS"
export INSTANCE_DIR="$INSTANCE_DIR"
export SF_CONFIG_DIR="$INSTANCE_DIR/.sf"
export SFDX_CONFIG_DIR="$INSTANCE_DIR/.sf"

if [ -f "$INSTANCE_DIR/.instance-env" ]; then
    # shellcheck disable=SC1090
    source "$INSTANCE_DIR/.instance-env"
fi

echo "Instance ready:"
echo "  Org:       $ORG_ALIAS"
echo "  Directory: $INSTANCE_DIR"

if command -v sf >/dev/null 2>&1; then
    if ! sf org display --target-org "$ORG_ALIAS" >/dev/null 2>&1; then
        login_url=$(node -e "const fs=require('fs');const p='${INSTANCE_DIR}/sfdx-project.json';if(fs.existsSync(p)){const c=JSON.parse(fs.readFileSync(p,'utf8'));if(c.sfdcLoginUrl)process.stdout.write(c.sfdcLoginUrl);}" 2>/dev/null)
        if [ -z "$login_url" ]; then
            login_url="https://login.salesforce.com"
        fi
        echo ""
        echo "WARNING: Not authenticated for $ORG_ALIAS."
        echo "   Run: sf org login web --alias $ORG_ALIAS --instance-url $login_url"
        exit 1
    fi

    echo ""
    sf org display --target-org "$ORG_ALIAS" 2>/dev/null | grep -E "Username|Instance Url|Alias" || true
fi

echo ""
echo "To persist in this shell:"
echo "  export SF_TARGET_ORG=\"$ORG_ALIAS\""
echo "  export INSTANCE_DIR=\"$INSTANCE_DIR\""
