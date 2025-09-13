#!/usr/bin/env python3
"""
Identify users with "Not connected to your CRM" errors by checking email/call activities directly
"""

import os
import sys
import json
import requests
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Any, Set
import time
from collections import defaultdict

# Configuration
BASE_URL = "https://api.salesloft.com/v2"
TOKEN = os.getenv("SALESLOFT_TOKEN")
if not TOKEN:
    print("Error: SALESLOFT_TOKEN environment variable not set")
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json",
    "User-Agent": "salesloft-user-analyzer-v2/1.0"
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
    print("USER-SPECIFIC ERROR ANALYSIS V2")
    print("="*80)
    
    # Date range: 9/8/2025 to today
    end_date = datetime.now(timezone.utc)
    start_date = datetime(2025, 9, 8, 0, 0, 0, tzinfo=timezone.utc)
    
    print(f"\nAnalyzing period: {start_date.date()} to {end_date.date()}")
    
    # Track users and their sync status
    user_sync_data = defaultdict(lambda: {
        "name": "",
        "email": "",
        "error_activities": [],
        "success_activities": [],
        "first_error": None,
        "last_error": None,
        "first_success": None,
        "last_success": None
    })
    
    # First, check the actual error data from our previous analysis
    print("\n=== Checking Recent CRM Activities for Errors ===")
    
    # We know from previous analysis there were errors on 9/11
    # Let's specifically look at those
    params = {
        "created_at[gte]": "2025-09-11T00:00:00Z",
        "created_at[lte]": end_date.isoformat(),
        "per_page": 100,
        "page": 1
    }
    
    # Check CRM activities
    page = 1
    crm_errors_found = []
    
    while page <= 10:
        params["page"] = page
        result = api_request("/crm_activities", params)
        activities = result.get("data", [])
        
        if not activities:
            break
        
        print(f"Checking CRM activities page {page}: {len(activities)} activities")
        
        for activity in activities:
            if activity.get("error") == "Not connected to your CRM":
                crm_errors_found.append({
                    "id": activity.get("id"),
                    "type": activity.get("activity_type"),
                    "created_at": activity.get("created_at"),
                    "subject": activity.get("subject", "")[:50],
                    "user_name": activity.get("user", {}).get("name") if isinstance(activity.get("user"), dict) else "",
                    "custom_fields": activity.get("custom_crm_fields", {})
                })
        
        page += 1
        time.sleep(0.1)
    
    print(f"Found {len(crm_errors_found)} CRM activities with errors")
    
    # Now check email activities for user information
    print("\n=== Checking Email Activities ===")
    
    params = {
        "created_at[gte]": start_date.isoformat(),
        "created_at[lte]": end_date.isoformat(),
        "per_page": 100,
        "page": 1
    }
    
    email_users_checked = set()
    
    for page in range(1, 6):  # Check 5 pages
        params["page"] = page
        result = api_request("/activities/emails", params)
        emails = result.get("data", [])
        
        if not emails:
            break
        
        print(f"Processing email page {page}: {len(emails)} emails")
        
        for email in emails:
            user = email.get("user", {})
            user_id = user.get("id") if user else None
            user_name = user.get("name", "Unknown") if user else "Unknown"
            user_email = user.get("email", "") if user else ""
            
            if user_id:
                email_users_checked.add(user_id)
                
                # Check if this email has CRM sync info
                has_crm_id = bool(email.get("crm_id") or email.get("crm_activity_id"))
                created_at = email.get("created_at", "")
                
                if user_id not in user_sync_data:
                    user_sync_data[user_id]["name"] = user_name
                    user_sync_data[user_id]["email"] = user_email
                
                if has_crm_id:
                    user_sync_data[user_id]["success_activities"].append({
                        "type": "email",
                        "created_at": created_at,
                        "crm_id": email.get("crm_id") or email.get("crm_activity_id")
                    })
                    
                    if not user_sync_data[user_id]["first_success"]:
                        user_sync_data[user_id]["first_success"] = created_at
                    user_sync_data[user_id]["last_success"] = created_at
                else:
                    # No CRM ID might indicate sync failure
                    user_sync_data[user_id]["error_activities"].append({
                        "type": "email",
                        "created_at": created_at,
                        "subject": email.get("subject", "")[:50]
                    })
                    
                    if not user_sync_data[user_id]["first_error"]:
                        user_sync_data[user_id]["first_error"] = created_at
                    user_sync_data[user_id]["last_error"] = created_at
        
        time.sleep(0.1)
    
    # Check call activities
    print("\n=== Checking Call Activities ===")
    
    for page in range(1, 6):  # Check 5 pages
        params["page"] = page
        result = api_request("/activities/calls", params)
        calls = result.get("data", [])
        
        if not calls:
            break
        
        print(f"Processing call page {page}: {len(calls)} calls")
        
        for call in calls:
            user = call.get("user", {})
            user_id = user.get("id") if user else None
            user_name = user.get("name", "Unknown") if user else "Unknown"
            user_email = user.get("email", "") if user else ""
            
            if user_id:
                # Check if this call has CRM sync info
                has_crm_id = bool(call.get("crm_id") or call.get("crm_activity_id"))
                created_at = call.get("created_at", "")
                
                if user_id not in user_sync_data:
                    user_sync_data[user_id]["name"] = user_name
                    user_sync_data[user_id]["email"] = user_email
                
                if has_crm_id:
                    user_sync_data[user_id]["success_activities"].append({
                        "type": "call",
                        "created_at": created_at,
                        "crm_id": call.get("crm_id") or call.get("crm_activity_id")
                    })
                    
                    if not user_sync_data[user_id]["first_success"]:
                        user_sync_data[user_id]["first_success"] = created_at
                    user_sync_data[user_id]["last_success"] = created_at
                else:
                    # No CRM ID might indicate sync failure
                    user_sync_data[user_id]["error_activities"].append({
                        "type": "call",
                        "created_at": created_at,
                        "duration": call.get("duration")
                    })
                    
                    if not user_sync_data[user_id]["first_error"]:
                        user_sync_data[user_id]["first_error"] = created_at
                    user_sync_data[user_id]["last_error"] = created_at
        
        time.sleep(0.1)
    
    # Analyze patterns
    print("\n" + "="*80)
    print("ANALYSIS RESULTS")
    print("="*80)
    
    # Users who only have failures (no successes)
    failing_users = []
    reauthenticated_users = []
    mixed_users = []
    
    for user_id, data in user_sync_data.items():
        error_count = len(data["error_activities"])
        success_count = len(data["success_activities"])
        
        if error_count > 0 and success_count == 0:
            # Only failures
            failing_users.append({
                "name": data["name"],
                "email": data["email"],
                "error_count": error_count,
                "first_error": data["first_error"],
                "last_error": data["last_error"],
                "sample_errors": data["error_activities"][:3]
            })
        elif error_count > 0 and success_count > 0:
            # Check if reauthenticated (errors then successes)
            if data["first_error"] and data["first_success"]:
                try:
                    first_error_dt = datetime.fromisoformat(data["first_error"].replace("Z", "+00:00"))
                    last_success_dt = datetime.fromisoformat(data["last_success"].replace("Z", "+00:00"))
                    
                    if last_success_dt > first_error_dt:
                        reauthenticated_users.append({
                            "name": data["name"],
                            "email": data["email"],
                            "error_count": error_count,
                            "success_count": success_count,
                            "first_error": data["first_error"],
                            "reauthenticated_at": data["first_success"]
                        })
                    else:
                        mixed_users.append({
                            "name": data["name"],
                            "email": data["email"],
                            "error_count": error_count,
                            "success_count": success_count,
                            "success_rate": (success_count / (error_count + success_count)) * 100
                        })
                except:
                    pass
    
    # Report results
    print(f"\n📊 Summary:")
    print(f"  Total users analyzed: {len(user_sync_data)}")
    print(f"  Users with only failures: {len(failing_users)}")
    print(f"  Users who reauthenticated: {len(reauthenticated_users)}")
    print(f"  Users with mixed results: {len(mixed_users)}")
    
    if crm_errors_found:
        print(f"\n🔴 Sample CRM Activities with 'Not connected to your CRM' Error:")
        print("-" * 70)
        for error in crm_errors_found[:10]:
            print(f"\nActivity ID: {error['id']}")
            print(f"  Type: {error['type']}")
            print(f"  Created: {error['created_at']}")
            print(f"  Subject: {error['subject']}")
            
            # Try to extract user from custom fields
            if error.get('custom_fields'):
                cf = error['custom_fields']
                if cf.get('salesperson_name'):
                    print(f"  Salesperson: {cf['salesperson_name']}")
                if cf.get('email_from_address'):
                    print(f"  From: {cf['email_from_address']}")
    
    if failing_users:
        print(f"\n❌ USERS WITH NO SUCCESSFUL SYNCS (Likely need to reconnect):")
        print("-" * 70)
        for user in sorted(failing_users, key=lambda x: x["error_count"], reverse=True)[:10]:
            print(f"\n👤 {user['name']}")
            print(f"   Email: {user['email']}")
            print(f"   Activities without CRM ID: {user['error_count']}")
            print(f"   Period: {user['first_error']} to {user['last_error']}")
    
    if reauthenticated_users:
        print(f"\n✅ USERS WHO APPEAR TO HAVE REAUTHENTICATED:")
        print("-" * 70)
        for user in reauthenticated_users[:10]:
            print(f"\n👤 {user['name']}")
            print(f"   Email: {user['email']}")
            print(f"   Had failures starting: {user['first_error']}")
            print(f"   Started syncing successfully: {user['reauthenticated_at']}")
            print(f"   Current status: {user['success_count']} successes after {user['error_count']} failures")
    
    # Extract user names from CRM error custom fields
    print("\n🔍 Attempting to identify users from CRM error metadata...")
    
    users_from_errors = set()
    for error in crm_errors_found:
        cf = error.get('custom_fields', {})
        if cf.get('salesperson_name'):
            users_from_errors.add(cf['salesperson_name'])
    
    if users_from_errors:
        print(f"\nUsers identified from CRM error metadata:")
        for user_name in sorted(users_from_errors):
            print(f"  - {user_name}")
    
    # Save report
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "period": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat()
        },
        "summary": {
            "total_users_analyzed": len(user_sync_data),
            "users_with_only_failures": len(failing_users),
            "users_who_reauthenticated": len(reauthenticated_users),
            "users_with_mixed_results": len(mixed_users),
            "crm_errors_found": len(crm_errors_found)
        },
        "failing_users": failing_users[:20],
        "reauthenticated_users": reauthenticated_users[:20],
        "users_from_error_metadata": list(users_from_errors),
        "sample_crm_errors": crm_errors_found[:20]
    }
    
    output_file = "/home/chris/Desktop/RevPal/Agents/user_error_analysis_v2.json"
    with open(output_file, "w") as f:
        json.dump(report, f, indent=2)
    
    print(f"\n📄 Detailed report saved to: {output_file}")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)