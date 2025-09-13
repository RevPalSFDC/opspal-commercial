#!/usr/bin/env python3
"""
Analyze Salesloft sync errors from the last 7 days
"""

import os
import sys
import json
import requests
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Any, Tuple
import time
from collections import defaultdict, Counter

# Configuration
BASE_URL = "https://api.salesloft.com/v2"
TOKEN = os.getenv("SALESLOFT_TOKEN")
if not TOKEN:
    print("Error: SALESLOFT_TOKEN environment variable not set")
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json",
    "User-Agent": "salesloft-sync-error-analyzer/1.0"
}

# Stats tracking
error_stats = {
    "total_errors": 0,
    "errors_by_type": defaultdict(int),
    "errors_by_entity": defaultdict(int),
    "errors_by_message": defaultdict(int),
    "errors_by_day": defaultdict(int),
    "sample_errors": [],
    "unique_error_patterns": set()
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
                
            if response.status_code == 404:
                return {"error": "not_found", "status_code": 404}
                
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            if attempt == 2:
                return {"error": str(e)}
            time.sleep(2 ** attempt)
    
    return {}

def categorize_error(error: Dict) -> Tuple[str, str, str]:
    """Categorize error by type, entity, and pattern"""
    error_message = error.get("message", "").lower()
    entity_type = error.get("entity_type", "unknown")
    
    # Categorize by error type
    if "authentication" in error_message or "unauthorized" in error_message:
        error_type = "Authentication"
    elif "permission" in error_message or "access denied" in error_message:
        error_type = "Permission"
    elif "rate limit" in error_message or "too many requests" in error_message:
        error_type = "RateLimit"
    elif "timeout" in error_message or "timed out" in error_message:
        error_type = "Timeout"
    elif "validation" in error_message or "invalid" in error_message:
        error_type = "Validation"
    elif "duplicate" in error_message or "already exists" in error_message:
        error_type = "Duplicate"
    elif "not found" in error_message or "404" in error_message:
        error_type = "NotFound"
    elif "connection" in error_message or "network" in error_message:
        error_type = "Connection"
    elif "sync" in error_message:
        error_type = "SyncError"
    else:
        error_type = "Other"
    
    # Extract key error pattern
    if "field" in error_message:
        # Extract field name if mentioned
        import re
        field_match = re.search(r"field[:\s]+(\w+)", error_message)
        if field_match:
            pattern = f"Field:{field_match.group(1)}"
        else:
            pattern = "Field:Unknown"
    elif "required" in error_message:
        pattern = "RequiredField"
    elif "format" in error_message:
        pattern = "InvalidFormat"
    elif "length" in error_message or "too long" in error_message:
        pattern = "LengthViolation"
    else:
        # Use first 50 chars of message as pattern
        pattern = error.get("message", "Unknown")[:50]
    
    return error_type, entity_type, pattern

def fetch_sync_errors(start_date: datetime, end_date: datetime) -> List[Dict]:
    """Fetch sync errors from Salesloft API"""
    print("\n=== Fetching Sync Errors ===")
    print(f"Date range: {start_date.date()} to {end_date.date()}")
    
    errors = []
    page = 1
    
    # Try different endpoints that might contain sync errors
    endpoints = [
        "/sync_errors",
        "/import_errors",
        "/activities/errors",
        "/crm_sync/errors"
    ]
    
    for endpoint in endpoints:
        print(f"\nTrying endpoint: {endpoint}")
        page = 1
        
        while page <= 10:
            params = {
                "created_at[gte]": start_date.isoformat(),
                "created_at[lte]": end_date.isoformat(),
                "per_page": 100,
                "page": page,
                "sort": "created_at",
                "sort_direction": "desc"
            }
            
            result = api_request(endpoint, params)
            
            if result.get("error") == "not_found":
                print(f"  Endpoint not found: {endpoint}")
                break
            
            if "error" in result:
                print(f"  Error accessing endpoint: {result['error']}")
                break
            
            page_errors = result.get("data", [])
            
            if not page_errors:
                if page == 1:
                    print(f"  No errors found at {endpoint}")
                break
            
            errors.extend(page_errors)
            print(f"  Page {page}: Found {len(page_errors)} errors")
            
            page += 1
            time.sleep(0.1)
    
    # Also check for sync-related data in other endpoints
    print("\n=== Checking Activity Logs for Sync Issues ===")
    
    # Check recent activities for failures
    params = {
        "created_at[gte]": start_date.isoformat(),
        "created_at[lte]": end_date.isoformat(),
        "per_page": 100,
        "page": 1
    }
    
    # Check imports
    print("\nChecking imports endpoint...")
    result = api_request("/imports", params)
    imports = result.get("data", [])
    
    for imp in imports:
        if imp.get("status") == "failed" or imp.get("errors_count", 0) > 0:
            errors.append({
                "type": "import",
                "entity_type": "Import",
                "message": imp.get("error_message", "Import failed"),
                "created_at": imp.get("created_at"),
                "details": imp
            })
    
    # Check CRM activities
    print("\nChecking CRM activities...")
    result = api_request("/crm_activities", params)
    crm_activities = result.get("data", [])
    
    for activity in crm_activities:
        if activity.get("error") or activity.get("sync_status") == "failed":
            errors.append({
                "type": "crm_sync",
                "entity_type": activity.get("activity_type", "CRMActivity"),
                "message": activity.get("error_message", "CRM sync failed"),
                "created_at": activity.get("created_at"),
                "details": activity
            })
    
    return errors

def analyze_errors(errors: List[Dict]) -> Dict:
    """Analyze error patterns and generate insights"""
    print(f"\n=== Analyzing {len(errors)} Errors ===")
    
    for error in errors:
        error_stats["total_errors"] += 1
        
        # Categorize error
        error_type, entity_type, pattern = categorize_error(error)
        
        error_stats["errors_by_type"][error_type] += 1
        error_stats["errors_by_entity"][entity_type] += 1
        error_stats["unique_error_patterns"].add(pattern)
        
        # Track full error message
        message = error.get("message", "No message")
        error_stats["errors_by_message"][message] += 1
        
        # Track by day
        created_at = error.get("created_at", "")
        if created_at:
            try:
                date = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                day_key = date.strftime("%Y-%m-%d")
                error_stats["errors_by_day"][day_key] += 1
            except:
                pass
        
        # Collect sample errors (up to 20)
        if len(error_stats["sample_errors"]) < 20:
            error_stats["sample_errors"].append({
                "type": error_type,
                "entity": entity_type,
                "message": message,
                "created_at": created_at,
                "pattern": pattern
            })
    
    # Generate insights
    insights = {
        "most_common_error_type": max(error_stats["errors_by_type"].items(), key=lambda x: x[1]) if error_stats["errors_by_type"] else ("None", 0),
        "most_affected_entity": max(error_stats["errors_by_entity"].items(), key=lambda x: x[1]) if error_stats["errors_by_entity"] else ("None", 0),
        "top_error_messages": sorted(error_stats["errors_by_message"].items(), key=lambda x: x[1], reverse=True)[:10],
        "daily_trend": dict(sorted(error_stats["errors_by_day"].items())),
        "unique_patterns_count": len(error_stats["unique_error_patterns"])
    }
    
    return insights

def generate_remediation_plan(insights: Dict) -> List[Dict]:
    """Generate remediation plan based on error analysis"""
    plan = []
    
    # Based on most common error type
    error_type, count = insights["most_common_error_type"]
    
    if error_type == "Authentication":
        plan.append({
            "priority": "HIGH",
            "category": "Authentication",
            "issue": f"Authentication errors ({count} occurrences)",
            "actions": [
                "Verify API token is valid and not expired",
                "Check if user permissions have changed",
                "Ensure OAuth refresh tokens are working",
                "Review any recent security policy changes"
            ]
        })
    
    elif error_type == "Validation":
        plan.append({
            "priority": "HIGH",
            "category": "Data Validation",
            "issue": f"Validation errors ({count} occurrences)",
            "actions": [
                "Review field mapping between Salesloft and CRM",
                "Check for required fields that may be missing",
                "Validate data formats (dates, phone numbers, emails)",
                "Ensure picklist values match between systems"
            ]
        })
    
    elif error_type == "Duplicate":
        plan.append({
            "priority": "MEDIUM",
            "category": "Duplicate Prevention",
            "issue": f"Duplicate record errors ({count} occurrences)",
            "actions": [
                "Review deduplication rules in both systems",
                "Implement better matching logic",
                "Consider using external IDs for syncing",
                "Clean up existing duplicates before re-syncing"
            ]
        })
    
    elif error_type == "RateLimit":
        plan.append({
            "priority": "MEDIUM",
            "category": "API Rate Limiting",
            "issue": f"Rate limit errors ({count} occurrences)",
            "actions": [
                "Implement exponential backoff in sync processes",
                "Batch API calls more efficiently",
                "Consider upgrading API limits if needed",
                "Spread sync operations across off-peak hours"
            ]
        })
    
    elif error_type == "NotFound":
        plan.append({
            "priority": "MEDIUM",
            "category": "Missing Records",
            "issue": f"Record not found errors ({count} occurrences)",
            "actions": [
                "Verify record IDs are correctly mapped",
                "Check if records were deleted in source system",
                "Implement soft delete handling",
                "Add existence checks before updates"
            ]
        })
    
    # Add plan for top error messages
    top_messages = insights["top_error_messages"][:3]
    for msg, msg_count in top_messages:
        if "field" in msg.lower():
            plan.append({
                "priority": "HIGH",
                "category": "Field-Specific Error",
                "issue": f"'{msg}' ({msg_count} occurrences)",
                "actions": [
                    "Review field configuration in both systems",
                    "Check field-level security settings",
                    "Validate field data types match",
                    "Consider field mapping adjustments"
                ]
            })
    
    # Add trend-based recommendations
    daily_trend = insights["daily_trend"]
    if daily_trend:
        recent_days = list(daily_trend.keys())[-3:]
        recent_counts = [daily_trend[day] for day in recent_days]
        
        if len(recent_counts) >= 2 and recent_counts[-1] > recent_counts[-2]:
            plan.append({
                "priority": "HIGH",
                "category": "Trending Issue",
                "issue": "Error rate is increasing in recent days",
                "actions": [
                    "Investigate recent configuration changes",
                    "Check for new validation rules or workflows",
                    "Review recent deployments or updates",
                    "Monitor sync processes more closely"
                ]
            })
    
    return plan

def main():
    print("\n" + "="*80)
    print("SALESLOFT SYNC ERROR ANALYSIS")
    print("="*80)
    
    # Date range (last 7 days)
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=7)
    
    # Fetch sync errors
    errors = fetch_sync_errors(start_date, end_date)
    
    if not errors:
        print("\n✅ No sync errors found in the last 7 days!")
        print("\nPossible reasons:")
        print("1. The sync is working perfectly")
        print("2. Error logging might be disabled")
        print("3. Errors might be logged in a different system (CRM side)")
        print("4. The API endpoints for errors might be different")
        
        print("\nRecommended next steps:")
        print("1. Check Salesforce for sync errors")
        print("2. Review Salesloft UI for error notifications")
        print("3. Check webhook logs if using webhooks")
        print("4. Verify sync configuration is active")
        return
    
    # Analyze errors
    insights = analyze_errors(errors)
    
    # Generate remediation plan
    remediation_plan = generate_remediation_plan(insights)
    
    # Generate report
    print("\n" + "="*80)
    print("ERROR ANALYSIS REPORT")
    print("="*80)
    
    print(f"\n📊 Summary Statistics:")
    print(f"  Total errors: {error_stats['total_errors']}")
    print(f"  Unique error patterns: {insights['unique_patterns_count']}")
    print(f"  Date range: {start_date.date()} to {end_date.date()}")
    
    print(f"\n🔍 Error Distribution by Type:")
    for error_type, count in sorted(error_stats["errors_by_type"].items(), key=lambda x: x[1], reverse=True):
        percentage = (count / error_stats["total_errors"]) * 100
        print(f"  {error_type}: {count} ({percentage:.1f}%)")
    
    print(f"\n📈 Daily Error Trend:")
    for day, count in insights["daily_trend"].items():
        print(f"  {day}: {count} errors")
    
    print(f"\n⚠️  Top Error Messages:")
    for msg, count in insights["top_error_messages"][:5]:
        print(f"  [{count}x] {msg[:100]}")
    
    print(f"\n🎯 Most Affected Entities:")
    for entity, count in sorted(error_stats["errors_by_entity"].items(), key=lambda x: x[1], reverse=True)[:5]:
        print(f"  {entity}: {count} errors")
    
    print("\n" + "="*80)
    print("REMEDIATION PLAN")
    print("="*80)
    
    for idx, action in enumerate(remediation_plan, 1):
        print(f"\n{idx}. [{action['priority']}] {action['category']}")
        print(f"   Issue: {action['issue']}")
        print(f"   Actions:")
        for step in action['actions']:
            print(f"     • {step}")
    
    # Save detailed report
    report = {
        "analysis_timestamp": datetime.now(timezone.utc).isoformat(),
        "date_range": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat()
        },
        "summary": {
            "total_errors": error_stats["total_errors"],
            "unique_patterns": insights["unique_patterns_count"],
            "most_common_type": insights["most_common_error_type"],
            "most_affected_entity": insights["most_affected_entity"]
        },
        "error_distribution": dict(error_stats["errors_by_type"]),
        "daily_trend": insights["daily_trend"],
        "top_errors": insights["top_error_messages"],
        "sample_errors": error_stats["sample_errors"],
        "remediation_plan": remediation_plan
    }
    
    output_file = "/home/chris/Desktop/RevPal/Agents/sync_error_analysis.json"
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