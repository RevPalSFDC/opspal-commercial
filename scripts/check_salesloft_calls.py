#!/usr/bin/env python3
"""
Check for Salesloft dialer conversations and recent Call activities
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
    "User-Agent": "salesloft-call-checker/1.0"
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
                print(f"Error making request to {endpoint}: {e}")
                raise
            time.sleep(2 ** attempt)
    
    return {}

def check_salesloft_platform_conversations():
    """Check for conversations from Salesloft dialer platform"""
    print("\n=== Checking for Salesloft Dialer Conversations ===")
    
    salesloft_convs = []
    page = 1
    total_checked = 0
    
    # Check first 10 pages for Salesloft platform conversations
    while page <= 10:
        params = {
            "page": page,
            "per_page": 100,
            "sort": "started_recording_at",
            "sort_direction": "desc"
        }
        
        result = api_request("/conversations", params)
        data = result.get("data", [])
        
        if not data:
            break
        
        total_checked += len(data)
        
        for conv in data:
            platform = conv.get("platform", {}).get("name") if isinstance(conv.get("platform"), dict) else conv.get("platform")
            if platform == "salesloft":
                salesloft_convs.append({
                    "id": conv.get("id"),
                    "platform": platform,
                    "started_recording_at": conv.get("started_recording_at"),
                    "duration": conv.get("duration"),
                    "user_guid": conv.get("user_guid") or conv.get("owner", {}).get("guid")
                })
        
        print(f"  Checked page {page}: Found {len([c for c in data if (c.get('platform', {}).get('name') if isinstance(c.get('platform'), dict) else c.get('platform')) == 'salesloft'])}/{len(data)} Salesloft conversations")
        
        page += 1
        time.sleep(0.5)  # Avoid rate limiting
    
    print(f"\nTotal conversations checked: {total_checked}")
    print(f"Salesloft dialer conversations found: {len(salesloft_convs)}")
    
    return salesloft_convs

def check_recent_call_activities(days_back: int = 7):
    """Check recent Call activities"""
    print(f"\n=== Checking Call Activities (last {days_back} days) ===")
    
    # Calculate date range
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=days_back)
    
    params = {
        "updated_at[gte]": start_date.isoformat(),
        "updated_at[lte]": end_date.isoformat(),
        "per_page": 100,
        "page": 1
    }
    
    all_calls = []
    page = 1
    
    while page <= 5:  # Check first 5 pages
        params["page"] = page
        result = api_request("/activities/calls", params)
        calls = result.get("data", [])
        
        if not calls:
            break
        
        all_calls.extend(calls)
        print(f"  Page {page}: Found {len(calls)} calls")
        
        page += 1
        time.sleep(0.5)
    
    # Analyze call statistics
    if all_calls:
        statuses = {}
        dispositions = {}
        users = {}
        
        for call in all_calls:
            # Count by status
            status = call.get("status", "unknown")
            statuses[status] = statuses.get(status, 0) + 1
            
            # Count by disposition
            disposition = call.get("disposition", "none")
            dispositions[disposition] = dispositions.get(disposition, 0) + 1
            
            # Count by user
            user_name = call.get("user", {}).get("name", "unknown")
            users[user_name] = users.get(user_name, 0) + 1
        
        print(f"\nTotal calls found: {len(all_calls)}")
        print("\nCall Status Breakdown:")
        for status, count in sorted(statuses.items(), key=lambda x: x[1], reverse=True):
            print(f"  {status}: {count}")
        
        print("\nTop Dispositions:")
        for disposition, count in sorted(dispositions.items(), key=lambda x: x[1], reverse=True)[:5]:
            print(f"  {disposition}: {count}")
        
        print("\nTop Users by Call Count:")
        for user, count in sorted(users.items(), key=lambda x: x[1], reverse=True)[:5]:
            print(f"  {user}: {count}")
        
        # Check for calls with recordings
        calls_with_recordings = [c for c in all_calls if c.get("recordings_count", 0) > 0]
        print(f"\nCalls with recordings: {len(calls_with_recordings)}")
        
        # Show sample calls
        print("\nSample Recent Calls:")
        for call in all_calls[:5]:
            print(f"\n  Call ID: {call.get('id')}")
            print(f"    User: {call.get('user', {}).get('name')}")
            print(f"    Status: {call.get('status')}")
            print(f"    Duration: {call.get('duration')} seconds")
            print(f"    Recordings: {call.get('recordings_count', 0)}")
            print(f"    To: {call.get('to')}")
            print(f"    Created: {call.get('created_at')}")
    else:
        print("No calls found in the specified time range")
    
    return all_calls

def check_conversation_platforms():
    """Get breakdown of all conversation platforms"""
    print("\n=== Conversation Platform Breakdown ===")
    
    platforms = {}
    page = 1
    
    while page <= 5:
        params = {
            "page": page,
            "per_page": 100
        }
        
        result = api_request("/conversations", params)
        data = result.get("data", [])
        
        if not data:
            break
        
        for conv in data:
            platform = conv.get("platform", {}).get("name") if isinstance(conv.get("platform"), dict) else conv.get("platform")
            platforms[platform] = platforms.get(platform, 0) + 1
        
        page += 1
        time.sleep(0.5)
    
    print("\nPlatform Distribution:")
    for platform, count in sorted(platforms.items(), key=lambda x: x[1], reverse=True):
        print(f"  {platform}: {count}")
    
    return platforms

def main():
    print("\n" + "="*80)
    print("SALESLOFT CALLS AND CONVERSATIONS ANALYSIS")
    print("="*80)
    
    # Check conversation platforms
    platforms = check_conversation_platforms()
    
    # Check for Salesloft dialer conversations
    salesloft_convs = check_salesloft_platform_conversations()
    
    # Check recent call activities
    calls = check_recent_call_activities(days_back=7)
    
    # If we found Salesloft conversations, try to match them
    if salesloft_convs:
        print("\n=== Attempting to Match Salesloft Conversations with Calls ===")
        
        for conv in salesloft_convs[:5]:  # Check first 5
            print(f"\nConversation {conv['id']}:")
            print(f"  User: {conv['user_guid']}")
            print(f"  Started: {conv['started_recording_at']}")
            print(f"  Duration: {conv['duration']}")
            
            # Try to find matching call
            # This would use similar logic to the previous script
            # but specifically for Salesloft platform conversations
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    
    if "salesloft" not in platforms:
        print("\n⚠️  No Salesloft dialer conversations found")
        print("   All conversations appear to be from external platforms (Zoom, MS Teams, etc.)")
    else:
        print(f"\n✅ Found {platforms.get('salesloft', 0)} Salesloft dialer conversations")
    
    if calls:
        print(f"\n✅ Found {len(calls)} Call activities in the last 7 days")
    else:
        print("\n⚠️  No Call activities found in the last 7 days")
    
    print("\nThis indicates that:")
    print("- Conversations are primarily from video conferencing platforms")
    print("- Call activities may be logged separately from video conversations")
    print("- The linkage between Conversations and Calls is platform-dependent")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\nError: {e}")
        sys.exit(1)