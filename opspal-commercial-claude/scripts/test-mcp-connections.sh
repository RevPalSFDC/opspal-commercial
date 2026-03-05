#!/bin/bash
set -e

# ============================================
# OpsPal MCP Connection Health Check
# ============================================
#
# Tests connectivity to all MCP servers (Supabase, Asana)
# and verifies environment configuration.
#
# Usage:
#   ./scripts/test-mcp-connections.sh           # Test all servers
#   ./scripts/test-mcp-connections.sh --quiet   # Exit code only (for CI/CD)
#   ./scripts/test-mcp-connections.sh --verbose # Detailed debug output
#   ./scripts/test-mcp-connections.sh --env-file /path/to/.env
#
# Exit Codes:
#   0 - All connections successful
#   1 - One or more connections failed
#

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
QUIET_MODE=false
VERBOSE_MODE=false
ENV_FILE_ARG=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --quiet)
      QUIET_MODE=true
      shift
      ;;
    --verbose)
      VERBOSE_MODE=true
      shift
      ;;
    --env-file)
      ENV_FILE_ARG="$2"
      shift 2
      ;;
    --env-file=*)
      ENV_FILE_ARG="${1#*=}"
      shift
      ;;
    --help)
      echo "Usage: $0 [--quiet] [--verbose] [--env-file <path>] [--help]"
      echo ""
      echo "Options:"
      echo "  --quiet      Exit code only (for CI/CD)"
      echo "  --verbose    Show detailed debug information"
      echo "  --env-file   Load environment variables from a specific file"
      echo "  --help       Show this help message"
      exit 0
      ;;
    *)
      shift
      ;;
  esac
done

# Auto-load .env if required vars are missing
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ENV_FILE_ARG:-${ENV_FILE:-$ROOT_DIR/.env}}"

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ] || [ -z "$ASANA_ACCESS_TOKEN" ]; then
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
fi

# Helper functions
log_info() {
  if [ "$QUIET_MODE" = false ]; then
    echo -e "${BLUE}$1${NC}"
  fi
}

log_success() {
  if [ "$QUIET_MODE" = false ]; then
    echo -e "${GREEN}$1${NC}"
  fi
}

log_warn() {
  if [ "$QUIET_MODE" = false ]; then
    echo -e "${YELLOW}$1${NC}"
  fi
}

log_error() {
  if [ "$QUIET_MODE" = false ]; then
    echo -e "${RED}$1${NC}"
  fi
}

log_verbose() {
  if [ "$VERBOSE_MODE" = true ] && [ "$QUIET_MODE" = false ]; then
    echo -e "  ${BLUE}[DEBUG]${NC} $1"
  fi
}

# Header
if [ "$QUIET_MODE" = false ]; then
  echo ""
  echo "🔍 OpsPal MCP Connection Health Check"
  echo "======================================"
  echo ""
fi

# Check environment variables
log_info "📋 Checking environment variables..."
MISSING_VARS=()
REQUIRED_VARS=("SUPABASE_URL" "SUPABASE_ANON_KEY" "ASANA_ACCESS_TOKEN")

for VAR in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!VAR}" ]; then
    MISSING_VARS+=("$VAR")
    log_verbose "Missing: $VAR"
  else
    log_verbose "Found: $VAR (${!VAR:0:20}...)"
  fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
  log_error "❌ Missing required environment variables:"
  for VAR in "${MISSING_VARS[@]}"; do
    log_error "   - $VAR"
  done
  echo ""
  log_info "💡 Solution:"
  log_info "   1. Create a .env file: cp .env.example .env"
  log_info "   2. Fill in your credentials (see .env.example for details)"
  log_info "   3. Load variables: set -a && source .env && set +a"
  log_info "   4. Or point to a different file: ./scripts/test-mcp-connections.sh --env-file /path/to/.env"
  log_info "   5. See docs/MCP_USAGE_GUIDE.md for setup instructions"
  exit 1
fi

log_success "✅ All required environment variables present"
echo ""

# Test Supabase (Anon Key - read-only)
log_info "1️⃣  Testing Supabase MCP (anon key - read-only)..."
log_verbose "URL: ${SUPABASE_URL}"
log_verbose "Testing: GET /rest/v1/reflections?select=id&limit=1"

SUPABASE_TEST=$(node -e "
const https = require('https');
const url = process.env.SUPABASE_URL + '/rest/v1/reflections?select=id&limit=1';

const req = https.get(url, {
  headers: {
    'apikey': process.env.SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + process.env.SUPABASE_ANON_KEY,
    'Accept': 'application/json'
  }
}, (res) => {
  if (res.statusCode === 200) {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        console.log('OK:' + parsed.length + '_results');
        process.exit(0);
      } catch {
        console.log('OK:0_results');
        process.exit(0);
      }
    });
  } else {
    console.log('FAILED:HTTP_' + res.statusCode);
    process.exit(1);
  }
});

req.setTimeout(10000, () => {
  console.log('TIMEOUT:10s');
  req.destroy();
  process.exit(1);
});

req.on('error', (e) => {
  console.log('ERROR:' + e.message.replace(/\s/g, '_'));
  process.exit(1);
});
" 2>&1)

if echo "$SUPABASE_TEST" | grep -q "^OK:"; then
  RESULT_COUNT=$(echo "$SUPABASE_TEST" | cut -d: -f2 | cut -d_ -f1)
  log_success "   ✅ Supabase: Connected (anon key working, found $RESULT_COUNT reflections)"
else
  log_error "   ❌ Supabase: Connection failed"
  log_verbose "Error: $SUPABASE_TEST"
  log_error ""
  log_error "   Troubleshooting:"
  log_error "   1. Verify SUPABASE_URL is correct"
  log_error "   2. Check SUPABASE_ANON_KEY is valid (get from Supabase dashboard)"
  log_error "   3. Ensure Supabase project is active (https://status.supabase.com)"
  log_error "   4. Check network connectivity: curl -I $SUPABASE_URL"
  log_error "   5. See docs/MCP_USAGE_GUIDE.md#troubleshooting for more help"
  exit 1
fi

# Test Supabase (Service Role - if configured)
if [ ! -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  log_verbose "Testing service role key..."

  SERVICE_TEST=$(node -e "
const https = require('https');
const url = process.env.SUPABASE_URL + '/rest/v1/reflections?select=id&limit=1';

const req = https.get(url, {
  headers: {
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Accept': 'application/json'
  }
}, (res) => {
  if (res.statusCode === 200) {
    console.log('OK');
    process.exit(0);
  } else {
    console.log('FAILED:HTTP_' + res.statusCode);
    process.exit(1);
  }
});

req.setTimeout(10000, () => {
  console.log('TIMEOUT');
  req.destroy();
  process.exit(1);
});

req.on('error', (e) => {
  console.log('ERROR:' + e.message.replace(/\s/g, '_'));
  process.exit(1);
});
" 2>&1)

  if echo "$SERVICE_TEST" | grep -q "OK"; then
    log_success "   ✅ Supabase: Service role key valid (internal operations enabled)"
  else
    log_warn "   ⚠️  Supabase: Service role test failed"
    log_verbose "Error: $SERVICE_TEST"
    log_warn "   (This is optional for user-facing operations)"
  fi
else
  log_verbose "Service role key not configured (optional)"
fi

echo ""

# Test Asana
log_info "2️⃣  Testing Asana MCP..."
log_verbose "Endpoint: https://app.asana.com/api/1.0/users/me"

ASANA_TEST=$(node -e "
const https = require('https');

const req = https.get('https://app.asana.com/api/1.0/users/me', {
  headers: {
    'Authorization': 'Bearer ' + process.env.ASANA_ACCESS_TOKEN,
    'Accept': 'application/json'
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (res.statusCode === 200) {
      try {
        const user = JSON.parse(data).data;
        console.log('OK:' + user.email.replace(/\s/g, '_'));
        process.exit(0);
      } catch {
        console.log('OK:authenticated');
        process.exit(0);
      }
    } else {
      console.log('FAILED:HTTP_' + res.statusCode);
      process.exit(1);
    }
  });
});

req.setTimeout(10000, () => {
  console.log('TIMEOUT:10s');
  req.destroy();
  process.exit(1);
});

req.on('error', (e) => {
  console.log('ERROR:' + e.message.replace(/\s/g, '_'));
  process.exit(1);
});
" 2>&1)

if echo "$ASANA_TEST" | grep -q "^OK:"; then
  USER_EMAIL=$(echo "$ASANA_TEST" | cut -d: -f2 | tr '_' ' ')
  log_success "   ✅ Asana: Connected (authenticated as $USER_EMAIL)"
else
  log_error "   ❌ Asana: Connection failed"
  log_verbose "Error: $ASANA_TEST"
  log_error ""
  log_error "   Troubleshooting:"
  log_error "   1. Verify ASANA_ACCESS_TOKEN is valid"
  log_error "   2. Check token hasn't expired (regenerate at https://app.asana.com/0/my-apps)"
  log_error "   3. Ensure API access is enabled for your account"
  log_error "   4. Check Asana service status: https://status.asana.com"
  log_error "   5. See docs/MCP_USAGE_GUIDE.md#troubleshooting for more help"
  exit 1
fi

echo ""

# Test Slack webhook (if configured - optional)
if [ ! -z "$SLACK_WEBHOOK_URL" ]; then
  log_info "3️⃣  Testing Slack webhook (optional)..."
  log_verbose "URL: ${SLACK_WEBHOOK_URL:0:40}..."

  SLACK_TEST=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$SLACK_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d '{"text":"[MCP Health Check] Connection test successful ✅"}' \
    --connect-timeout 5 2>&1)

  if [ "$SLACK_TEST" = "200" ]; then
    log_success "   ✅ Slack: Webhook functional (notification sent)"
  else
    log_warn "   ⚠️  Slack: Webhook failed (HTTP $SLACK_TEST)"
    log_verbose "Status code: $SLACK_TEST"
    log_warn "   (This is optional for MCP operations)"
  fi
  echo ""
else
  log_verbose "Slack webhook not configured (optional)"
fi

# Summary
if [ "$QUIET_MODE" = false ]; then
  echo "======================================"
  log_success "✅ All MCP servers reachable!"
  echo ""
  echo "Next steps:"
  echo "  • Run: /reflect (to test full reflection workflow)"
  echo "  • Query: node .claude-plugins/salesforce-plugin/scripts/lib/query-reflections.js recent"
  echo "  • Docs: docs/MCP_USAGE_GUIDE.md for usage patterns"
  echo "  • Troubleshooting: docs/MCP_USAGE_GUIDE.md#troubleshooting"
  echo ""
fi

exit 0
