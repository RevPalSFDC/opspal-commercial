#!/bin/bash

export SALESLOFT_TOKEN="v2_ak_101314_d780f0370f98c58e0d514242b6bde735ca4945a0fc0d667f7727bf411336593f"

echo "Monitoring Salesloft CRM Connection Status..."
echo "Press Ctrl+C to stop"
echo ""

while true; do
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

    # Check connection status
    RESPONSE=$(curl -s -H "Authorization: Bearer $SALESLOFT_TOKEN" \
        "https://api.salesloft.com/v2/team")

    CRM_CONNECTED=$(echo "$RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('crm_connected', False))")
    CRM_URL=$(echo "$RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('crm_url', 'Not set'))")

    if [ "$CRM_CONNECTED" = "True" ]; then
        echo "[$TIMESTAMP] ✅ CRM CONNECTED! URL: $CRM_URL"
        echo ""
        echo "Connection established! Now running fixes..."

        # Run the fixes
        python3 scripts/fix-email-sync-failures.py

        break
    else
        echo "[$TIMESTAMP] ❌ Not connected yet... (checking every 5 seconds)"
    fi

    sleep 5
done