#!/usr/bin/env python3
"""
Check CRM connection status for Salesloft users and instance
"""

import os
import sys
import json
import requests
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
import time

# Configuration
BASE_URL = "https://api.salesloft.com/v2"
TOKEN = os.getenv("SALESLOFT_TOKEN")
if not TOKEN:
    print("Error: SALESLOFT_TOKEN environment variable not set")
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json",
    "User-Agent": "salesloft-crm-checker/1.0"
}

def api_request(endpoint: str, params: Optional[Dict] = None) -> Dict[str, Any]:
    """Make API request with retry logic"""
    url = f"{BASE_URL}{endpoint}" if not endpoint.startswith("http") else endpoint
    
    for attempt in range(3):
        try:
            response = requests.get(url, headers=HEADERS, params=params, timeout=30)
            
            if response.status_code == 429:
                retry_after = int(response.headers.get("Retry-After", 2))
                print(f"Rate limited, waiting {retry_after} seconds...")
                time.sleep(retry_after)
                continue
                
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            if attempt == 2:
                return {"error": str(e)}
            time.sleep(2 ** attempt)
    
    return {}

def main():
    print("\n" + "="*80)
    print("CRM CONNECTION STATUS CHECK")
    print("="*80)
    
    # Check current user (API token owner)
    print("\n=== Checking Current User ===")
    
    me_result = api_request("/me")
    if "error" in me_result:
        print(f"❌ Error fetching user info: {me_result['error']}")
        return
    
    me_data = me_result.get("data", {})
    print(f"User: {me_data.get('name', 'Unknown')}")
    print(f"Email: {me_data.get('email', 'Unknown')}")
    print(f"Role: {me_data.get('role', 'Unknown')}")
    print(f"Active: {me_data.get('active', False)}")
    
    # Check team/tenant info
    print("\n=== Checking Team Configuration ===")
    
    team_result = api_request("/team")
    if "error" not in team_result:
        team_data = team_result.get("data", {})
        print(f"Team: {team_data.get('name', 'Unknown')}")
        print(f"Created: {team_data.get('created_at', 'Unknown')}")
        print(f"CRM Connected: {team_data.get('crm_connected', False)}")
        print(f"CRM Type: {team_data.get('crm_type', 'Not configured')}")
    
    # Check CRM connections
    print("\n=== Checking CRM Integration Status ===")
    
    # Try to get CRM configuration
    crm_result = api_request("/crm")
    if "error" not in crm_result:
        crm_data = crm_result.get("data", {})
        print(f"CRM Provider: {crm_data.get('provider', 'Unknown')}")
        print(f"Connected: {crm_data.get('connected', False)}")
        print(f"Last Sync: {crm_data.get('last_sync_at', 'Never')}")
        print(f"Sync Enabled: {crm_data.get('sync_enabled', False)}")
    
    # Check integrations
    print("\n=== Checking Integrations ===")
    
    integrations_result = api_request("/integrations")
    if "error" not in integrations_result:
        integrations = integrations_result.get("data", [])
        for integration in integrations:
            if "salesforce" in integration.get("name", "").lower() or "crm" in integration.get("name", "").lower():
                print(f"\nIntegration: {integration.get('name')}")
                print(f"  Status: {integration.get('status', 'Unknown')}")
                print(f"  Connected: {integration.get('connected', False)}")
                print(f"  Last Activity: {integration.get('last_activity_at', 'Never')}")
    
    # Check webhook configurations
    print("\n=== Checking Webhook Configurations ===")
    
    webhooks_result = api_request("/webhooks")
    if "error" not in webhooks_result:
        webhooks = webhooks_result.get("data", [])
        print(f"Total webhooks configured: {len(webhooks)}")
        for webhook in webhooks:
            if webhook.get("active"):
                print(f"  Active webhook: {webhook.get('url', 'Unknown URL')}")
                print(f"    Events: {', '.join(webhook.get('events', []))}")
    
    # Check specific users with recent activity errors
    print("\n=== Checking Users with Recent Activity ===")
    
    users_result = api_request("/users", {"per_page": 10})
    if "error" not in users_result:
        users = users_result.get("data", [])
        for user in users[:5]:
            print(f"\nUser: {user.get('name')}")
            print(f"  CRM ID: {user.get('crm_user_id', 'Not linked')}")
            print(f"  Active: {user.get('active')}")
            
            # Check if user has CRM connection
            if not user.get("crm_user_id"):
                print(f"  ⚠️  WARNING: User not linked to CRM")
    
    # Check API permissions
    print("\n=== Checking API Permissions ===")
    
    # Try to access various endpoints to check permissions
    test_endpoints = [
        ("/people", "Contacts/Leads"),
        ("/accounts", "Accounts"),
        ("/opportunities", "Opportunities"),
        ("/activities/calls", "Call Activities"),
        ("/activities/emails", "Email Activities"),
        ("/cadences", "Cadences"),
        ("/crm_activities", "CRM Activities")
    ]
    
    for endpoint, name in test_endpoints:
        result = api_request(endpoint, {"per_page": 1})
        if "error" in result:
            print(f"  ❌ {name}: Access denied or error")
        else:
            print(f"  ✅ {name}: Accessible")
    
    # Summary and diagnosis
    print("\n" + "="*80)
    print("DIAGNOSIS AND RECOMMENDATIONS")
    print("="*80)
    
    print("\n🔍 ROOT CAUSE ANALYSIS:")
    print("\nThe error 'Not connected to your CRM' indicates that:")
    print("1. The Salesloft instance is not connected to Salesforce")
    print("2. The connection was previously established but has been disconnected")
    print("3. Authentication tokens may have expired")
    print("4. User permissions may have changed")
    
    print("\n🛠️ IMMEDIATE ACTIONS REQUIRED:")
    print("\n1. RE-ESTABLISH CRM CONNECTION:")
    print("   a. Log into Salesloft web interface as an admin")
    print("   b. Navigate to Settings > Integrations > Salesforce")
    print("   c. Click 'Connect to Salesforce' or 'Reconnect'")
    print("   d. Authorize the OAuth connection")
    print("   e. Map the required fields between systems")
    
    print("\n2. VERIFY SALESFORCE PERMISSIONS:")
    print("   a. Ensure Salesloft Connected App is installed in Salesforce")
    print("   b. Check that API access is enabled")
    print("   c. Verify user has 'Modify All Data' permission for sync")
    print("   d. Check IP restrictions aren't blocking Salesloft")
    
    print("\n3. CHECK FIELD MAPPINGS:")
    print("   a. Review field mapping configuration")
    print("   b. Ensure all required fields are mapped")
    print("   c. Check for any custom field conflicts")
    
    print("\n4. MONITOR AFTER RECONNECTION:")
    print("   a. Test with a single manual activity sync")
    print("   b. Monitor error logs for 24 hours")
    print("   c. Set up webhook notifications for sync failures")
    
    print("\n⚠️  CRITICAL: All email activities from 9/11 onwards are NOT syncing to Salesforce!")
    print("Once reconnected, you may need to manually trigger a retroactive sync.")
    
    # Save diagnostic report
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "diagnosis": {
            "primary_issue": "CRM connection lost",
            "affected_activities": "All email, call, and other activities",
            "error_message": "Not connected to your CRM",
            "first_detected": "2025-09-11T14:51:58"
        },
        "user_info": me_data,
        "recommended_actions": [
            "Reconnect Salesforce integration immediately",
            "Verify OAuth tokens and permissions",
            "Check field mappings",
            "Run retroactive sync for missed activities",
            "Set up monitoring alerts"
        ]
    }
    
    output_file = "/home/chris/Desktop/RevPal/Agents/crm_connection_diagnosis.json"
    with open(output_file, "w") as f:
        json.dump(report, f, indent=2)
    
    print(f"\n📄 Diagnostic report saved to: {output_file}")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)