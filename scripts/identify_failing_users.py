#!/usr/bin/env python3
"""
Identify users with "Not connected to your CRM" errors between 9/8/2025 and today
Check for evidence of reauthentication
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
    "User-Agent": "salesloft-user-error-analyzer/1.0"
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

def get_user_details(user_id: int) -> Dict:
    """Get details for a specific user"""
    result = api_request(f"/users/{user_id}")
    if "error" not in result:
        return result.get("data", {})
    return {}

def analyze_user_sync_patterns(start_date: datetime, end_date: datetime):
    """Analyze sync patterns by user between specified dates"""
    
    print(f"\n=== Analyzing User Sync Errors ===")
    print(f"Period: {start_date.date()} to {end_date.date()}")
    
    # Track users with errors and successes
    users_with_errors = defaultdict(lambda: {
        "error_count": 0,
        "success_count": 0,
        "first_error": None,
        "last_error": None,
        "first_success": None,
        "last_success": None,
        "error_dates": set(),
        "success_dates": set(),
        "sample_errors": [],
        "user_details": {}
    })
    
    # Fetch CRM activities
    page = 1
    total_processed = 0
    
    while page <= 20:  # Process up to 20 pages
        params = {
            "created_at[gte]": start_date.isoformat(),
            "created_at[lte]": end_date.isoformat(),
            "per_page": 100,
            "page": page,
            "sort": "created_at",
            "sort_direction": "asc"  # Chronological order to detect reauthentication
        }
        
        result = api_request("/crm_activities", params)
        activities = result.get("data", [])
        
        if not activities:
            break
        
        print(f"Processing page {page}: {len(activities)} activities")
        
        for activity in activities:
            total_processed += 1
            
            # Get user information
            user_id = activity.get("user_id") or activity.get("user", {}).get("id")
            if not user_id:
                continue
            
            created_at = activity.get("created_at", "")
            activity_date = None
            
            try:
                activity_date = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                date_str = activity_date.strftime("%Y-%m-%d %H:%M")
            except:
                date_str = created_at
            
            # Check if this is an error or success
            error_msg = activity.get("error", "")
            
            if error_msg == "Not connected to your CRM":
                # Track error
                users_with_errors[user_id]["error_count"] += 1
                users_with_errors[user_id]["error_dates"].add(activity_date.date() if activity_date else date_str)
                
                if not users_with_errors[user_id]["first_error"]:
                    users_with_errors[user_id]["first_error"] = date_str
                users_with_errors[user_id]["last_error"] = date_str
                
                # Collect sample error
                if len(users_with_errors[user_id]["sample_errors"]) < 3:
                    users_with_errors[user_id]["sample_errors"].append({
                        "activity_id": activity.get("id"),
                        "type": activity.get("activity_type"),
                        "created_at": date_str,
                        "subject": activity.get("subject", "")[:50]
                    })
            
            elif activity.get("crm_id") or activity.get("crm_activity_id"):
                # Track success
                users_with_errors[user_id]["success_count"] += 1
                users_with_errors[user_id]["success_dates"].add(activity_date.date() if activity_date else date_str)
                
                if not users_with_errors[user_id]["first_success"]:
                    users_with_errors[user_id]["first_success"] = date_str
                users_with_errors[user_id]["last_success"] = date_str
        
        page += 1
        time.sleep(0.1)
    
    print(f"Total activities processed: {total_processed}")
    
    # Get user details for each user with errors
    print("\n=== Fetching User Details ===")
    user_id_to_name = {}
    
    for user_id in users_with_errors.keys():
        user_details = get_user_details(user_id)
        if user_details:
            user_id_to_name[user_id] = {
                "name": user_details.get("name", "Unknown"),
                "email": user_details.get("email", ""),
                "active": user_details.get("active", False),
                "crm_user_id": user_details.get("crm_user_id"),
                "team": user_details.get("team", {}).get("name", "")
            }
            users_with_errors[user_id]["user_details"] = user_id_to_name[user_id]
        time.sleep(0.05)
    
    # Analyze for reauthentication patterns
    reauthenticated_users = []
    persistently_failing_users = []
    
    for user_id, data in users_with_errors.items():
        if data["error_count"] == 0:
            continue
        
        # Check if user had errors then successes (indicates reauthentication)
        if data["first_error"] and data["first_success"]:
            # Parse dates for comparison
            try:
                first_error_dt = datetime.fromisoformat(data["first_error"].replace(" ", "T"))
                first_success_dt = datetime.fromisoformat(data["first_success"].replace(" ", "T"))
                
                if first_success_dt > first_error_dt:
                    # User had errors, then successes - likely reauthenticated
                    reauthenticated_users.append({
                        "user_id": user_id,
                        "name": data["user_details"].get("name", "Unknown"),
                        "email": data["user_details"].get("email", ""),
                        "first_error": data["first_error"],
                        "first_success_after_error": data["first_success"],
                        "error_count": data["error_count"],
                        "success_count": data["success_count"]
                    })
                    continue
            except:
                pass
        
        # Check if still failing (no recent successes)
        if data["error_count"] > 0 and data["success_count"] == 0:
            persistently_failing_users.append({
                "user_id": user_id,
                "name": data["user_details"].get("name", "Unknown"),
                "email": data["user_details"].get("email", ""),
                "error_count": data["error_count"],
                "first_error": data["first_error"],
                "last_error": data["last_error"],
                "sample_errors": data["sample_errors"]
            })
    
    return users_with_errors, reauthenticated_users, persistently_failing_users

def main():
    print("\n" + "="*80)
    print("USER-SPECIFIC CRM CONNECTION ERROR ANALYSIS")
    print("="*80)
    
    # Date range: 9/8/2025 to today
    end_date = datetime.now(timezone.utc)
    start_date = datetime(2025, 9, 8, 0, 0, 0, tzinfo=timezone.utc)
    
    # Analyze user sync patterns
    users_with_errors, reauthenticated_users, persistently_failing_users = analyze_user_sync_patterns(start_date, end_date)
    
    # Generate report
    print("\n" + "="*80)
    print("USER ERROR REPORT")
    print("="*80)
    
    print(f"\n📊 Summary:")
    print(f"  Total users with errors: {len([u for u in users_with_errors.values() if u['error_count'] > 0])}")
    print(f"  Users who reauthenticated: {len(reauthenticated_users)}")
    print(f"  Users still failing: {len(persistently_failing_users)}")
    
    if persistently_failing_users:
        print(f"\n❌ USERS WITH PERSISTENT CRM CONNECTION ERRORS (No successful syncs):")
        print("-" * 70)
        
        for user in sorted(persistently_failing_users, key=lambda x: x["error_count"], reverse=True):
            print(f"\n👤 {user['name']}")
            print(f"   Email: {user['email']}")
            print(f"   User ID: {user['user_id']}")
            print(f"   Total Errors: {user['error_count']}")
            print(f"   First Error: {user['first_error']}")
            print(f"   Last Error: {user['last_error']}")
            
            if user['sample_errors']:
                print(f"   Sample Failed Activities:")
                for err in user['sample_errors'][:2]:
                    print(f"     - {err['type']} at {err['created_at']}: {err['subject']}")
    
    if reauthenticated_users:
        print(f"\n✅ USERS WHO APPEAR TO HAVE REAUTHENTICATED:")
        print("-" * 70)
        
        for user in sorted(reauthenticated_users, key=lambda x: x["first_success_after_error"]):
            print(f"\n👤 {user['name']}")
            print(f"   Email: {user['email']}")
            print(f"   Had errors starting: {user['first_error']}")
            print(f"   Successfully synced at: {user['first_success_after_error']}")
            print(f"   Error Count: {user['error_count']} → Success Count: {user['success_count']}")
    
    # Additional analysis
    print(f"\n🔍 DETAILED ANALYSIS:")
    print("-" * 70)
    
    # Users with mixed results (some success, some failures)
    mixed_users = []
    for user_id, data in users_with_errors.items():
        if data["error_count"] > 0 and data["success_count"] > 0:
            success_rate = (data["success_count"] / (data["error_count"] + data["success_count"])) * 100
            mixed_users.append({
                "name": data["user_details"].get("name", "Unknown"),
                "email": data["user_details"].get("email", ""),
                "error_count": data["error_count"],
                "success_count": data["success_count"],
                "success_rate": success_rate,
                "last_error": data["last_error"],
                "last_success": data["last_success"]
            })
    
    if mixed_users:
        print(f"\n⚠️  USERS WITH INTERMITTENT ISSUES (Mixed success/failure):")
        for user in sorted(mixed_users, key=lambda x: x["success_rate"]):
            print(f"\n👤 {user['name']}")
            print(f"   Email: {user['email']}")
            print(f"   Success Rate: {user['success_rate']:.1f}%")
            print(f"   Successes: {user['success_count']}, Failures: {user['error_count']}")
            print(f"   Last Success: {user['last_success']}")
            print(f"   Last Error: {user['last_error']}")
    
    # Save detailed report
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "period": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat()
        },
        "summary": {
            "total_users_with_errors": len([u for u in users_with_errors.values() if u['error_count'] > 0]),
            "reauthenticated_users": len(reauthenticated_users),
            "persistently_failing_users": len(persistently_failing_users),
            "mixed_status_users": len(mixed_users)
        },
        "persistently_failing_users": persistently_failing_users,
        "reauthenticated_users": reauthenticated_users,
        "mixed_status_users": mixed_users
    }
    
    output_file = "/home/chris/Desktop/RevPal/Agents/user_error_analysis.json"
    with open(output_file, "w") as f:
        json.dump(report, f, indent=2)
    
    print(f"\n📄 Detailed report saved to: {output_file}")
    
    # Recommendations
    print("\n" + "="*80)
    print("RECOMMENDATIONS")
    print("="*80)
    
    if persistently_failing_users:
        print("\n🚨 IMMEDIATE ACTION REQUIRED for persistently failing users:")
        print("1. Have each user log into Salesloft web interface")
        print("2. Navigate to their personal settings")
        print("3. Re-connect their individual CRM authentication")
        print("4. Test with a manual activity sync")
    
    if reauthenticated_users:
        print("\n✅ POSITIVE SIGN: Some users have already reauthenticated")
        print("This shows the issue can be resolved at the user level")
    
    if mixed_users:
        print("\n⚠️  FOR INTERMITTENT ISSUES:")
        print("1. Check if these users have multiple browser sessions")
        print("2. Clear browser cache and cookies")
        print("3. Use a single authenticated session")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)