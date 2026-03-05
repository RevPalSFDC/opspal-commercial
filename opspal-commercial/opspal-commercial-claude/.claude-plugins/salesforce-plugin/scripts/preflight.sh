#!/usr/bin/env bash
# Preflight check - always read-only
# Shows org info and current configuration

source scripts/lib/guard.sh

echo "
═══════════════════════════════════════════════════════════════
PREFLIGHT CHECK
═══════════════════════════════════════════════════════════════"

# Display org details (never sets as default)
echo "
Org Details:"
sf org display -o "$ORG" --json | jq '{
  username: .result.username,
  instanceUrl: .result.instanceUrl,
  apiVersion: .result.apiVersion,
  connectedStatus: .result.connectedStatus
}'

# Check if this org is default (warn if production)
echo "
Default Check:"
sf org list --json | jq '.result.nonScratchOrgs[] | select(.alias=="'"$ORG"'") | {
  alias: .alias,
  isDefaultUsername: .isDefaultUsername,
  isProd: (.instanceUrl | contains("login.salesforce.com"))
}'

# Show current mode
echo "
Current Configuration:
• Target Org: $ORG
• API Version: $API_VERSION
• Write Mode: $([ "$ENABLE_WRITE" = "1" ] && echo "ENABLED ⚠️" || echo "DISABLED ✓")
• Org Allowlist: ${ORG_ALLOWLIST:-"(none)"}

Safety Status:
$([ "$ENABLE_WRITE" = "0" ] && echo "✓ Read-only mode active (safe)" || echo "⚠️  Write mode enabled - be careful!")
"

# Quick permissions check
echo "Checking Report Permissions..."
sf data query -o "$ORG" -q "SELECT PermissionsCreateCustomizeReports, PermissionsRunReports FROM Profile WHERE Id IN (SELECT ProfileId FROM User WHERE Username = USERNAME())" --json 2>/dev/null | jq '.result.records[0]' || echo "Could not check permissions"

echo "
═══════════════════════════════════════════════════════════════
"