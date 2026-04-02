#!/usr/bin/env bash
# gws-auth-check.sh — Non-blocking Google Workspace CLI credential and token health check.
#
# Returns: 0 = healthy, 1 = needs re-auth, 2 = not installed
# Output: JSON status to stdout
#
# Usage:
#   bash scripts/lib/gws-auth-check.sh          # Full check including live API test
#   bash scripts/lib/gws-auth-check.sh --quick   # Skip live API test (env + file only)

set +e

QUICK_MODE=0
if [ "${1:-}" = "--quick" ]; then
  QUICK_MODE=1
fi

# Check 1: gws binary exists
if ! command -v gws &>/dev/null; then
  printf '{"status":"not_installed","healthy":false,"message":"gws CLI not found. Install: pip install google-workspace-cli"}\n'
  exit 2
fi

# Check 2: credentials file exists
CREDS_FILE="${HOME}/.config/gws/credentials.enc"
if [ ! -f "$CREDS_FILE" ]; then
  printf '{"status":"no_credentials","healthy":false,"message":"No GWS credentials found. Run: /googlelogin"}\n'
  exit 1
fi

# Check 3: required env vars
if [ -z "${GOOGLE_WORKSPACE_CLI_CLIENT_ID:-}" ] || [ -z "${GOOGLE_WORKSPACE_CLI_CLIENT_SECRET:-}" ]; then
  printf '{"status":"missing_env","healthy":false,"message":"GOOGLE_WORKSPACE_CLI_CLIENT_ID and/or GOOGLE_WORKSPACE_CLI_CLIENT_SECRET not set. Export them in your shell profile or .env file."}\n'
  exit 1
fi

# Quick mode stops here — env and file checks passed
if [ "$QUICK_MODE" = "1" ]; then
  printf '{"status":"env_ok","healthy":true,"message":"GWS env and credentials present (live API not tested)"}\n'
  exit 0
fi

# Check 4: live API test (3s timeout to stay within hook budget)
if timeout 3 gws drive files list --params '{"pageSize":1}' &>/dev/null; then
  printf '{"status":"healthy","healthy":true,"message":"GWS auth is valid and API is reachable"}\n'
  exit 0
else
  printf '{"status":"token_expired","healthy":false,"message":"GWS token expired or invalid (invalid_grant). Run: /googlelogin to re-authenticate."}\n'
  exit 1
fi
