#!/usr/bin/env python3
"""
Detailed analysis of CRM activity sync issues
"""

import os
import sys
import json
import requests
from datetime import datetime, timedelta, timezone
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
    "User-Agent": "salesloft-crm-analyzer/1.0"
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
    print("DETAILED CRM ACTIVITY ANALYSIS")
    print("="*80)
    
    # Date range (last 7 days)
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=7)
    
    print(f"\nAnalyzing period: {start_date.date()} to {end_date.date()}")
    
    # Get recent CRM activities
    print("\n=== Fetching Recent CRM Activities ===")
    
    params = {
        "created_at[gte]": start_date.isoformat(),
        "created_at[lte]": end_date.isoformat(),
        "per_page": 100,
        "page": 1,
        "sort": "created_at",
        "sort_direction": "desc"
    }
    
    all_activities = []
    error_activities = []
    page = 1
    
    while page <= 5:  # Check first 5 pages
        params["page"] = page
        result = api_request("/crm_activities", params)
        
        if "error" in result:
            print(f"Error fetching page {page}: {result['error']}")
            break
        
        activities = result.get("data", [])
        if not activities:
            break
        
        print(f"Page {page}: {len(activities)} activities")
        all_activities.extend(activities)
        
        # Filter for errors
        for activity in activities:
            # Check various error indicators
            has_error = False
            error_info = {}
            
            # Check direct error field
            if activity.get("error"):
                has_error = True
                error_info["error"] = activity.get("error")
            
            # Check sync status
            if activity.get("sync_status") in ["failed", "error", "rejected"]:
                has_error = True
                error_info["sync_status"] = activity.get("sync_status")
            
            # Check for error messages
            if activity.get("error_message"):
                has_error = True
                error_info["error_message"] = activity.get("error_message")
            
            # Check for sync errors
            if activity.get("crm_sync_error"):
                has_error = True
                error_info["crm_sync_error"] = activity.get("crm_sync_error")
            
            # Check for validation errors
            if activity.get("validation_errors"):
                has_error = True
                error_info["validation_errors"] = activity.get("validation_errors")
            
            if has_error:
                error_activities.append({
                    "id": activity.get("id"),
                    "type": activity.get("activity_type"),
                    "created_at": activity.get("created_at"),
                    "error_info": error_info,
                    "details": activity
                })
        
        page += 1
        time.sleep(0.1)
    
    print(f"\nTotal activities fetched: {len(all_activities)}")
    print(f"Activities with errors: {len(error_activities)}")
    
    # Analyze activity types
    print("\n=== Activity Type Distribution ===")
    activity_types = {}
    for activity in all_activities:
        act_type = activity.get("activity_type", "unknown")
        activity_types[act_type] = activity_types.get(act_type, 0) + 1
    
    for act_type, count in sorted(activity_types.items(), key=lambda x: x[1], reverse=True):
        print(f"  {act_type}: {count}")
    
    # Check emails separately
    print("\n=== Checking Email Activities ===")
    
    params = {
        "created_at[gte]": start_date.isoformat(),
        "created_at[lte]": end_date.isoformat(),
        "per_page": 100,
        "page": 1
    }
    
    email_errors = []
    result = api_request("/activities/emails", params)
    emails = result.get("data", [])
    
    print(f"Emails found: {len(emails)}")
    
    for email in emails[:50]:  # Check first 50 emails
        # Check for sync issues
        if email.get("error") or email.get("sync_error") or email.get("crm_error"):
            email_errors.append({
                "id": email.get("id"),
                "created_at": email.get("created_at"),
                "to": email.get("to"),
                "status": email.get("status"),
                "error": email.get("error") or email.get("sync_error") or email.get("crm_error"),
                "crm_id": email.get("crm_id"),
                "crm_activity_id": email.get("crm_activity_id")
            })
    
    # Check calls separately
    print("\n=== Checking Call Activities ===")
    
    call_errors = []
    result = api_request("/activities/calls", params)
    calls = result.get("data", [])
    
    print(f"Calls found: {len(calls)}")
    
    for call in calls[:50]:  # Check first 50 calls
        # Check for sync issues
        if call.get("error") or call.get("sync_error") or call.get("crm_error"):
            call_errors.append({
                "id": call.get("id"),
                "created_at": call.get("created_at"),
                "to": call.get("to"),
                "duration": call.get("duration"),
                "status": call.get("status"),
                "error": call.get("error") or call.get("sync_error") or call.get("crm_error"),
                "crm_id": call.get("crm_id"),
                "crm_activity_id": call.get("crm_activity_id")
            })
    
    # Check people for sync issues
    print("\n=== Checking People Sync Status ===")
    
    people_errors = []
    result = api_request("/people", {"updated_at[gte]": start_date.isoformat(), "per_page": 100})
    people = result.get("data", [])
    
    print(f"Recently updated people: {len(people)}")
    
    for person in people[:50]:  # Check first 50 people
        # Check for CRM sync issues
        if person.get("crm_url") and not person.get("crm_id"):
            people_errors.append({
                "id": person.get("id"),
                "name": person.get("display_name"),
                "issue": "Has CRM URL but no CRM ID",
                "crm_url": person.get("crm_url")
            })
        
        # Check last sync time
        last_contacted = person.get("last_contacted_at")
        crm_last_sync = person.get("crm_last_sync")
        
        if last_contacted and crm_last_sync:
            try:
                contact_date = datetime.fromisoformat(last_contacted.replace("Z", "+00:00"))
                sync_date = datetime.fromisoformat(crm_last_sync.replace("Z", "+00:00"))
                
                if (contact_date - sync_date).days > 1:
                    people_errors.append({
                        "id": person.get("id"),
                        "name": person.get("display_name"),
                        "issue": "CRM sync lagging",
                        "last_contact": last_contacted,
                        "last_sync": crm_last_sync
                    })
            except:
                pass
    
    # Generate comprehensive report
    print("\n" + "="*80)
    print("SYNC ERROR ANALYSIS RESULTS")
    print("="*80)
    
    if error_activities:
        print("\n🔴 CRM Activity Errors:")
        for error in error_activities[:5]:
            print(f"\n  ID: {error['id']}")
            print(f"  Type: {error['type']}")
            print(f"  Created: {error['created_at']}")
            print(f"  Error Info: {json.dumps(error['error_info'], indent=4)}")
    
    if email_errors:
        print("\n📧 Email Sync Errors:")
        for error in email_errors[:5]:
            print(f"\n  ID: {error['id']}")
            print(f"  To: {error['to']}")
            print(f"  Error: {error['error']}")
            print(f"  CRM ID: {error.get('crm_id', 'None')}")
    
    if call_errors:
        print("\n📞 Call Sync Errors:")
        for error in call_errors[:5]:
            print(f"\n  ID: {error['id']}")
            print(f"  To: {error['to']}")
            print(f"  Duration: {error['duration']}s")
            print(f"  Error: {error['error']}")
    
    if people_errors:
        print("\n👥 People Sync Issues:")
        for error in people_errors[:5]:
            print(f"\n  ID: {error['id']}")
            print(f"  Name: {error['name']}")
            print(f"  Issue: {error['issue']}")
    
    # Summary and recommendations
    print("\n" + "="*80)
    print("RECOMMENDED ACTIONS")
    print("="*80)
    
    total_errors = len(error_activities) + len(email_errors) + len(call_errors) + len(people_errors)
    
    if total_errors == 0:
        print("\n✅ No sync errors detected in the available data!")
        print("\nPossible scenarios:")
        print("1. Sync is working correctly")
        print("2. Errors are logged elsewhere (check Salesforce)")
        print("3. Sync might be paused or disabled")
    else:
        print(f"\n⚠️  Total issues found: {total_errors}")
        
        if error_activities:
            print("\n1. CRM Activity Sync Issues:")
            print("   • Review CRM field mappings")
            print("   • Check API permissions in Salesforce")
            print("   • Verify activity types are enabled in CRM")
        
        if email_errors:
            print("\n2. Email Sync Issues:")
            print("   • Verify email tracking is enabled")
            print("   • Check email field mapping")
            print("   • Review email bounce handling")
        
        if call_errors:
            print("\n3. Call Sync Issues:")
            print("   • Verify call logging permissions")
            print("   • Check duration field compatibility")
            print("   • Review call disposition mappings")
        
        if people_errors:
            print("\n4. Contact/Lead Sync Issues:")
            print("   • Run full contact re-sync")
            print("   • Check for duplicate merge issues")
            print("   • Verify required fields are mapped")
    
    # Save detailed report
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "period": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat()
        },
        "summary": {
            "total_activities": len(all_activities),
            "error_activities": len(error_activities),
            "email_errors": len(email_errors),
            "call_errors": len(call_errors),
            "people_issues": len(people_errors)
        },
        "activity_types": activity_types,
        "errors": {
            "activities": error_activities[:10],
            "emails": email_errors[:10],
            "calls": call_errors[:10],
            "people": people_errors[:10]
        }
    }
    
    output_file = "/home/chris/Desktop/RevPal/Agents/detailed_crm_analysis.json"
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