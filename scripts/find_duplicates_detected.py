#!/usr/bin/env python3
"""
Find and analyze DUPLICATES_DETECTED errors in Salesloft
"""

import os
import sys
import json
import requests
from datetime import datetime, timedelta, timezone
from collections import defaultdict
import re

BASE_URL = "https://api.salesloft.com/v2"
TOKEN = os.getenv("SALESLOFT_TOKEN")

if not TOKEN:
    print("Error: SALESLOFT_TOKEN not set")
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json"
}

def search_duplicate_detected_errors():
    """Search for all DUPLICATES_DETECTED errors"""
    
    print("Searching for DUPLICATES_DETECTED errors...")
    print("=" * 80)
    
    duplicate_detected_errors = []
    affected_records = defaultdict(list)
    error_by_type = defaultdict(int)
    unique_error_messages = set()
    
    # Search last 30 days of activities
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=30)
    
    page = 1
    total_scanned = 0
    total_errors = 0
    duplicates_detected_count = 0
    
    while page <= 50:  # Scan up to 50 pages
        params = {
            "created_at[gte]": start_date.isoformat(),
            "created_at[lte]": end_date.isoformat(),
            "per_page": 100,
            "page": page,
            "sort": "created_at",
            "sort_direction": "desc"
        }
        
        try:
            response = requests.get(f"{BASE_URL}/crm_activities", headers=HEADERS, params=params, timeout=30)
            
            if response.status_code == 429:
                import time
                time.sleep(2)
                continue
                
            if response.status_code != 200:
                break
                
            data = response.json()
            activities = data.get("data", [])
            
            if not activities:
                break
            
            total_scanned += len(activities)
            
            for activity in activities:
                error = activity.get("error")
                if not error:
                    continue
                
                total_errors += 1
                
                # Check for DUPLICATES_DETECTED errors
                if "DUPLICATES_DETECTED" in error:
                    duplicates_detected_count += 1
                    
                    # Extract record IDs from error message
                    record_ids = []
                    # Look for Salesforce IDs (15 or 18 character alphanumeric)
                    id_matches = re.findall(r'\b[a-zA-Z0-9]{15,18}\b', error)
                    record_ids = [id for id in id_matches if id.startswith(('00', '01', '02', '03'))]
                    
                    error_detail = {
                        "id": activity.get("id"),
                        "type": activity.get("activity_type"),
                        "created_at": activity.get("created_at"),
                        "error": error,
                        "subject": activity.get("subject", "")[:100],
                        "crm_id": activity.get("crm_id"),
                        "suggested_records": record_ids,
                        "custom_fields": activity.get("custom_crm_fields", {})
                    }
                    
                    duplicate_detected_errors.append(error_detail)
                    error_by_type[activity.get("activity_type", "unknown")] += 1
                    unique_error_messages.add(error[:200])  # Store first 200 chars
                    
                    # Track affected entities
                    if error_detail.get("custom_fields", {}).get("to_address"):
                        affected_records["emails"].append(error_detail["custom_fields"]["to_address"])
                    if error_detail.get("custom_fields", {}).get("from_address"):
                        affected_records["from_emails"].append(error_detail["custom_fields"]["from_address"])
            
            if page % 5 == 0:
                print(f"Page {page}: Scanned {total_scanned} activities, found {duplicates_detected_count} DUPLICATES_DETECTED errors")
            
            page += 1
            
        except Exception as e:
            print(f"Error on page {page}: {e}")
            break
    
    print(f"\nTotal activities scanned: {total_scanned}")
    print(f"Total activities with errors: {total_errors}")
    print(f"DUPLICATES_DETECTED errors found: {duplicates_detected_count}")
    
    return duplicate_detected_errors, affected_records, error_by_type, unique_error_messages

def analyze_duplicate_patterns(errors):
    """Analyze patterns in duplicate detection errors"""
    
    patterns = {
        "by_date": defaultdict(int),
        "by_hour": defaultdict(int),
        "by_user": defaultdict(int),
        "suggested_records": defaultdict(int),
        "activity_subjects": defaultdict(int)
    }
    
    for error in errors:
        # By date
        if error.get("created_at"):
            date = error["created_at"].split("T")[0]
            patterns["by_date"][date] += 1
            
            # By hour
            hour = error["created_at"].split("T")[1][:2]
            patterns["by_hour"][hour] += 1
        
        # By user (from custom fields)
        if error.get("custom_fields", {}).get("from_name"):
            patterns["by_user"][error["custom_fields"]["from_name"]] += 1
        
        # Suggested records
        for record_id in error.get("suggested_records", []):
            patterns["suggested_records"][record_id] += 1
        
        # Subject patterns
        subject = error.get("subject", "").lower()
        if "call" in subject:
            patterns["activity_subjects"]["calls"] += 1
        elif "email" in subject:
            patterns["activity_subjects"]["emails"] += 1
        elif "meeting" in subject:
            patterns["activity_subjects"]["meetings"] += 1
    
    return patterns

def main():
    print("\n" + "=" * 80)
    print("DUPLICATES_DETECTED ERROR ANALYSIS")
    print("=" * 80)
    
    # Search for errors
    errors, affected_records, error_by_type, unique_messages = search_duplicate_detected_errors()
    
    if not errors:
        print("\n✓ No DUPLICATES_DETECTED errors found in the last 30 days!")
        return
    
    # Analyze patterns
    patterns = analyze_duplicate_patterns(errors)
    
    # Generate report
    print("\n" + "=" * 80)
    print("SUMMARY REPORT")
    print("=" * 80)
    
    print(f"\n📊 Overall Statistics:")
    print(f"  Total DUPLICATES_DETECTED errors: {len(errors)}")
    print(f"  Unique error messages: {len(unique_messages)}")
    print(f"  Affected email addresses: {len(set(affected_records['emails']))}")
    
    print(f"\n🔍 Errors by Activity Type:")
    for activity_type, count in sorted(error_by_type.items(), key=lambda x: x[1], reverse=True):
        print(f"  {activity_type}: {count}")
    
    print(f"\n📅 Errors by Date (Last 7 days):")
    recent_dates = sorted(patterns["by_date"].items(), reverse=True)[:7]
    for date, count in recent_dates:
        print(f"  {date}: {count} errors")
    
    print(f"\n👥 Top Users with Duplicate Errors:")
    top_users = sorted(patterns["by_user"].items(), key=lambda x: x[1], reverse=True)[:10]
    for user, count in top_users:
        print(f"  {user}: {count} errors")
    
    print(f"\n🔗 Most Frequently Suggested Records:")
    top_records = sorted(patterns["suggested_records"].items(), key=lambda x: x[1], reverse=True)[:10]
    for record_id, count in top_records:
        print(f"  {record_id}: suggested {count} times")
    
    # Sample errors
    print(f"\n📝 Sample DUPLICATES_DETECTED Errors:")
    for error in errors[:3]:
        print(f"\n  Activity ID: {error['id']}")
        print(f"  Type: {error['type']}")
        print(f"  Created: {error['created_at']}")
        print(f"  Subject: {error['subject']}")
        print(f"  Error: {error['error'][:150]}...")
        if error['suggested_records']:
            print(f"  Suggested Records: {', '.join(error['suggested_records'])}")
    
    # Save detailed results
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_errors": len(errors),
            "unique_messages": len(unique_messages),
            "affected_emails": len(set(affected_records['emails']))
        },
        "errors_by_type": dict(error_by_type),
        "errors_by_date": dict(patterns["by_date"]),
        "top_users": dict(list(top_users)),
        "suggested_records": dict(patterns["suggested_records"]),
        "sample_errors": errors[:10],
        "all_errors": errors
    }
    
    with open("/home/chris/Desktop/RevPal/Agents/duplicates_detected_report.json", "w") as f:
        json.dump(report, f, indent=2)
    
    print(f"\n📄 Detailed report saved to: duplicates_detected_report.json")
    
    # Provide remediation guidance
    print("\n" + "=" * 80)
    print("REMEDIATION GUIDANCE")
    print("=" * 80)
    
    print("""
DUPLICATES_DETECTED errors occur when Salesforce finds multiple potential matches
for a record. This is different from the domain constraint error.

Common Causes:
1. Multiple Contacts/Leads with same email address
2. Duplicate Account records with similar names
3. Fuzzy matching rules in Salesforce finding multiple candidates

Remediation Steps:
1. Review the suggested record IDs in each error
2. Merge duplicate records in Salesforce
3. Update matching rules to be more specific
4. Clean up duplicate data in source system

For the specific records identified:""")
    
    if top_records:
        print(f"\nTop problematic Salesforce records to investigate:")
        for record_id, count in top_records[:5]:
            print(f"  • {record_id} (appearing in {count} errors)")

if __name__ == "__main__":
    main()