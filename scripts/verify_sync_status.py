#!/usr/bin/env python3
"""
Verify sync status and investigate specific sync success ID
"""

import os
import sys
import json
import requests
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Any
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
    "User-Agent": "salesloft-sync-verifier/1.0"
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

def search_for_activity_by_id(activity_id: str):
    """Search for a specific activity by ID"""
    print(f"\n=== Searching for Activity ID: {activity_id} ===")
    
    # Try different endpoints where this ID might exist
    endpoints = [
        f"/activities/{activity_id}",
        f"/crm_activities/{activity_id}",
        f"/activities/emails/{activity_id}",
        f"/activities/calls/{activity_id}",
        f"/sync_logs/{activity_id}"
    ]
    
    for endpoint in endpoints:
        print(f"Checking: {endpoint}")
        result = api_request(endpoint)
        
        if "error" not in result and result.get("data"):
            print(f"✅ Found at {endpoint}")
            return result.get("data")
    
    # Try searching in activities with this ID in various fields
    print("\n=== Searching in recent activities ===")
    
    # Check emails
    params = {"per_page": 100, "page": 1}
    result = api_request("/activities/emails", params)
    emails = result.get("data", [])
    
    for email in emails:
        if str(activity_id) in str(email.get("id", "")) or \
           str(activity_id) in str(email.get("crm_id", "")) or \
           str(activity_id) in str(email.get("crm_activity_id", "")):
            print(f"✅ Found in emails: {email.get('id')}")
            return email
    
    # Check calls
    result = api_request("/activities/calls", params)
    calls = result.get("data", [])
    
    for call in calls:
        if str(activity_id) in str(call.get("id", "")) or \
           str(activity_id) in str(call.get("crm_id", "")) or \
           str(activity_id) in str(call.get("crm_activity_id", "")):
            print(f"✅ Found in calls: {call.get('id')}")
            return call
    
    return None

def analyze_sync_patterns():
    """Analyze both successful and failed syncs"""
    print("\n=== Analyzing Sync Patterns (Last 7 Days) ===")
    
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=7)
    
    stats = {
        "successful_syncs": 0,
        "failed_syncs": 0,
        "partial_syncs": 0,
        "by_day": defaultdict(lambda: {"success": 0, "failed": 0}),
        "by_type": defaultdict(lambda: {"success": 0, "failed": 0}),
        "sample_successes": [],
        "sample_failures": []
    }
    
    # Check CRM activities for both successes and failures
    print("\n=== Checking CRM Activities ===")
    
    for page in range(1, 11):  # Check 10 pages
        params = {
            "created_at[gte]": start_date.isoformat(),
            "created_at[lte]": end_date.isoformat(),
            "per_page": 100,
            "page": page,
            "sort": "created_at",
            "sort_direction": "desc"
        }
        
        result = api_request("/crm_activities", params)
        activities = result.get("data", [])
        
        if not activities:
            break
        
        print(f"Page {page}: Processing {len(activities)} activities")
        
        for activity in activities:
            # Determine sync status
            has_error = activity.get("error") or activity.get("sync_error")
            has_crm_id = activity.get("crm_id") or activity.get("crm_activity_id")
            sync_status = activity.get("sync_status", "")
            
            # Categorize
            if has_error or sync_status in ["failed", "error"]:
                stats["failed_syncs"] += 1
                status = "failed"
                
                if len(stats["sample_failures"]) < 10:
                    stats["sample_failures"].append({
                        "id": activity.get("id"),
                        "type": activity.get("activity_type"),
                        "created": activity.get("created_at"),
                        "error": activity.get("error") or activity.get("sync_error") or "Unknown error",
                        "crm_id": activity.get("crm_id")
                    })
            elif has_crm_id or sync_status == "success":
                stats["successful_syncs"] += 1
                status = "success"
                
                if len(stats["sample_successes"]) < 10:
                    stats["sample_successes"].append({
                        "id": activity.get("id"),
                        "type": activity.get("activity_type"),
                        "created": activity.get("created_at"),
                        "crm_id": activity.get("crm_id") or activity.get("crm_activity_id"),
                        "sync_status": sync_status
                    })
            else:
                stats["partial_syncs"] += 1
                status = "partial"
            
            # Track by day
            created = activity.get("created_at", "")
            if created:
                try:
                    date = datetime.fromisoformat(created.replace("Z", "+00:00"))
                    day_key = date.strftime("%Y-%m-%d")
                    if status == "success":
                        stats["by_day"][day_key]["success"] += 1
                    elif status == "failed":
                        stats["by_day"][day_key]["failed"] += 1
                except:
                    pass
            
            # Track by type
            activity_type = activity.get("activity_type", "unknown")
            if status == "success":
                stats["by_type"][activity_type]["success"] += 1
            elif status == "failed":
                stats["by_type"][activity_type]["failed"] += 1
    
    # Also check regular activities for CRM sync evidence
    print("\n=== Checking Email Activities for CRM IDs ===")
    
    params = {
        "created_at[gte]": start_date.isoformat(),
        "created_at[lte]": end_date.isoformat(),
        "per_page": 100,
        "page": 1
    }
    
    result = api_request("/activities/emails", params)
    emails = result.get("data", [])
    
    emails_with_crm = 0
    emails_without_crm = 0
    
    for email in emails[:100]:  # Check first 100
        if email.get("crm_id") or email.get("crm_activity_id"):
            emails_with_crm += 1
        else:
            emails_without_crm += 1
    
    print(f"Emails with CRM ID: {emails_with_crm}")
    print(f"Emails without CRM ID: {emails_without_crm}")
    
    # Check calls
    print("\n=== Checking Call Activities for CRM IDs ===")
    
    result = api_request("/activities/calls", params)
    calls = result.get("data", [])
    
    calls_with_crm = 0
    calls_without_crm = 0
    
    for call in calls[:100]:  # Check first 100
        if call.get("crm_id") or call.get("crm_activity_id"):
            calls_with_crm += 1
        else:
            calls_without_crm += 1
    
    print(f"Calls with CRM ID: {calls_with_crm}")
    print(f"Calls without CRM ID: {calls_without_crm}")
    
    return stats, emails_with_crm, emails_without_crm, calls_with_crm, calls_without_crm

def main():
    print("\n" + "="*80)
    print("SALESLOFT SYNC STATUS VERIFICATION")
    print("="*80)
    
    # Search for the specific ID
    activity_id = "7233738594"
    found_activity = search_for_activity_by_id(activity_id)
    
    if found_activity:
        print("\n=== Activity Details ===")
        print(json.dumps(found_activity, indent=2, default=str))
    else:
        print(f"\n⚠️  Activity ID {activity_id} not found directly")
        print("This ID might be a Salesforce ID rather than a Salesloft ID")
    
    # Analyze overall sync patterns
    stats, emails_with_crm, emails_without_crm, calls_with_crm, calls_without_crm = analyze_sync_patterns()
    
    # Generate report
    print("\n" + "="*80)
    print("SYNC STATUS REPORT")
    print("="*80)
    
    total_activities = stats["successful_syncs"] + stats["failed_syncs"] + stats["partial_syncs"]
    
    print(f"\n📊 Overall Statistics (Last 7 Days):")
    print(f"  Total CRM Activities: {total_activities}")
    print(f"  Successful Syncs: {stats['successful_syncs']} ({stats['successful_syncs']/total_activities*100:.1f}%)" if total_activities > 0 else "  No activities found")
    print(f"  Failed Syncs: {stats['failed_syncs']} ({stats['failed_syncs']/total_activities*100:.1f}%)" if total_activities > 0 else "")
    print(f"  Partial/Unknown: {stats['partial_syncs']}")
    
    print(f"\n📧 Email Sync Status:")
    total_emails = emails_with_crm + emails_without_crm
    if total_emails > 0:
        print(f"  With CRM ID: {emails_with_crm} ({emails_with_crm/total_emails*100:.1f}%)")
        print(f"  Without CRM ID: {emails_without_crm} ({emails_without_crm/total_emails*100:.1f}%)")
    
    print(f"\n📞 Call Sync Status:")
    total_calls = calls_with_crm + calls_without_crm
    if total_calls > 0:
        print(f"  With CRM ID: {calls_with_crm} ({calls_with_crm/total_calls*100:.1f}%)")
        print(f"  Without CRM ID: {calls_without_crm} ({calls_without_crm/total_calls*100:.1f}%)")
    
    print(f"\n📅 Daily Sync Trend:")
    for day in sorted(stats["by_day"].keys()):
        day_stats = stats["by_day"][day]
        total_day = day_stats["success"] + day_stats["failed"]
        if total_day > 0:
            success_rate = (day_stats["success"] / total_day) * 100
            print(f"  {day}: {day_stats['success']} success, {day_stats['failed']} failed ({success_rate:.1f}% success rate)")
    
    print(f"\n🎯 Sync by Activity Type:")
    for act_type in sorted(stats["by_type"].keys(), key=lambda x: (x is None, x)):
        type_stats = stats["by_type"][act_type]
        total_type = type_stats["success"] + type_stats["failed"]
        if total_type > 0:
            success_rate = (type_stats["success"] / total_type) * 100
            type_name = act_type if act_type else "Unknown"
            print(f"  {type_name}: {type_stats['success']} success, {type_stats['failed']} failed ({success_rate:.1f}% success rate)")
    
    if stats["sample_successes"]:
        print(f"\n✅ Sample Successful Syncs:")
        for success in stats["sample_successes"][:3]:
            print(f"  ID: {success['id']}")
            print(f"    Type: {success['type']}")
            print(f"    CRM ID: {success['crm_id']}")
            print(f"    Created: {success['created']}")
    
    if stats["sample_failures"]:
        print(f"\n❌ Sample Failed Syncs:")
        for failure in stats["sample_failures"][:3]:
            print(f"  ID: {failure['id']}")
            print(f"    Type: {failure['type']}")
            print(f"    Error: {failure['error']}")
            print(f"    Created: {failure['created']}")
    
    # Analysis conclusion
    print("\n" + "="*80)
    print("ANALYSIS CONCLUSION")
    print("="*80)
    
    if stats["successful_syncs"] > 0:
        print("\n✅ SYNC IS PARTIALLY WORKING")
        print(f"  - Found {stats['successful_syncs']} successful syncs")
        print(f"  - Some activities ARE syncing to Salesforce")
        
        if stats["failed_syncs"] > 0:
            print(f"\n⚠️  However, {stats['failed_syncs']} syncs failed")
            print("  - This indicates intermittent sync issues")
            print("  - May be user-specific or activity-type specific")
    else:
        print("\n❌ NO SUCCESSFUL SYNCS FOUND")
        print("  - CRM connection appears to be broken")
        print("  - All activities failing to sync")
    
    # Save detailed report
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "searched_id": activity_id,
        "found_activity": found_activity,
        "summary": {
            "total_activities": total_activities,
            "successful_syncs": stats["successful_syncs"],
            "failed_syncs": stats["failed_syncs"],
            "partial_syncs": stats["partial_syncs"],
            "emails_with_crm": emails_with_crm,
            "emails_without_crm": emails_without_crm,
            "calls_with_crm": calls_with_crm,
            "calls_without_crm": calls_without_crm
        },
        "daily_trend": dict(stats["by_day"]),
        "by_type": dict(stats["by_type"]),
        "sample_successes": stats["sample_successes"],
        "sample_failures": stats["sample_failures"]
    }
    
    output_file = "/home/chris/Desktop/RevPal/Agents/sync_verification_report.json"
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