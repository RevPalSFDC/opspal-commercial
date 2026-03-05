#!/usr/bin/env bash
# Safety guardrails for Salesforce operations
# Source this in all scripts that interact with Salesforce

set -euo pipefail

# Required: Org must be explicitly set
: "${ORG:?ERROR: Set ORG env var (e.g., export ORG=my-sandbox)}"

# API Version - centralized control
: "${API_VERSION:=v64.0}"

# Write protection - default to read-only
: "${ENABLE_WRITE:=0}"

# Org allowlist - only these orgs can have writes
: "${ORG_ALLOWLIST:=}"

# Check if org is in allowlist for writes
if [[ -n "$ORG_ALLOWLIST" ]]; then
    case " $ORG_ALLOWLIST " in
        *" $ORG "*)
            # Org is in allowlist
            : 
            ;;
        *)
            echo "⚠️  Writes blocked: $ORG not in ORG_ALLOWLIST"
            ENABLE_WRITE=0
            ;;
    esac
fi

# Never allow production as default
if sf config get target-org --json 2>/dev/null | jq -r '.result[0].value' | grep -q "production\|prod"; then
    echo "⚠️  WARNING: Production org detected as default. Unsetting..."
    sf config unset target-org
fi

# Display current mode
if [[ "$ENABLE_WRITE" == "1" ]]; then
    echo "🔓 Write mode enabled for: $ORG (API: $API_VERSION)"
else
    echo "🔒 Read-only mode for: $ORG (API: $API_VERSION)"
fi

# Export for child processes
export ORG API_VERSION ENABLE_WRITE