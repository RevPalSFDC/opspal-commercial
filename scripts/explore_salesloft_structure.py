#!/usr/bin/env python3
"""
Explore the actual structure of Salesloft Calls and Conversations
to understand how they're linked in this instance
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
    "User-Agent": "salesloft-explorer/1.0"
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
                return {}
            time.sleep(2 ** attempt)
    
    return {}

def explore_call_structure():
    """Get sample calls and examine their full structure"""
    print("\n=== Exploring Call Structure ===")
    
    # Get recent calls
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=7)
    
    params = {
        "created_at[gte]": start_date.isoformat(),
        "per_page": 5,
        "page": 1
    }
    
    result = api_request("/activities/calls", params)
    calls = result.get("data", [])
    
    if not calls:
        print("No recent calls found")
        return
    
    print(f"\nFound {len(calls)} recent calls. Examining structure:\n")
    
    # Look at first call in detail
    call = calls[0]
    print("Sample Call Object Fields:")
    print("-" * 40)
    
    # Print all fields with their types and sample values
    for key, value in sorted(call.items()):
        value_type = type(value).__name__
        if isinstance(value, dict):
            print(f"  {key}: {value_type} with keys: {list(value.keys())}")
        elif isinstance(value, list):
            print(f"  {key}: {value_type} with {len(value)} items")
        elif isinstance(value, str) and len(value) > 50:
            print(f"  {key}: {value_type} (truncated): {value[:50]}...")
        else:
            print(f"  {key}: {value_type} = {value}")
    
    # Check for any conversation-related fields
    print("\n🔍 Checking for conversation-related fields:")
    conversation_fields = [k for k in call.keys() if 'conver' in k.lower() or 'record' in k.lower() or 'transc' in k.lower()]
    if conversation_fields:
        print(f"  Found: {conversation_fields}")
        for field in conversation_fields:
            print(f"    {field}: {call.get(field)}")
    else:
        print("  No direct conversation/recording fields found")
    
    return calls

def explore_conversation_structure():
    """Get sample conversations and examine their structure"""
    print("\n=== Exploring Conversation Structure ===")
    
    params = {
        "per_page": 5,
        "page": 1
    }
    
    result = api_request("/conversations", params)
    conversations = result.get("data", [])
    
    if not conversations:
        print("No conversations found")
        return
    
    print(f"\nFound {len(conversations)} conversations. Examining structure:\n")
    
    # Look at first conversation in detail
    conv = conversations[0]
    print("Sample Conversation Object Fields:")
    print("-" * 40)
    
    for key, value in sorted(conv.items()):
        value_type = type(value).__name__
        if isinstance(value, dict):
            print(f"  {key}: {value_type} with keys: {list(value.keys())}")
        elif isinstance(value, list):
            print(f"  {key}: {value_type} with {len(value)} items")
        elif isinstance(value, str) and len(value) > 50:
            print(f"  {key}: {value_type} (truncated): {value[:50]}...")
        else:
            print(f"  {key}: {value_type} = {value}")
    
    # Check for any call-related fields
    print("\n🔍 Checking for call-related fields:")
    call_fields = [k for k in conv.keys() if 'call' in k.lower() or 'activity' in k.lower()]
    if call_fields:
        print(f"  Found: {call_fields}")
        for field in call_fields:
            print(f"    {field}: {conv.get(field)}")
    else:
        print("  No direct call/activity fields found")
    
    return conversations

def check_call_recordings_endpoint():
    """Check if there's a recordings endpoint for calls"""
    print("\n=== Checking Call Recordings Endpoint ===")
    
    # Get a recent call
    params = {
        "per_page": 1,
        "page": 1
    }
    
    result = api_request("/activities/calls", params)
    calls = result.get("data", [])
    
    if not calls:
        print("No calls to test with")
        return
    
    call_id = calls[0].get("id")
    print(f"Testing with call ID: {call_id}")
    
    # Try different potential endpoints
    endpoints_to_try = [
        f"/activities/calls/{call_id}/recordings",
        f"/activities/calls/{call_id}/recording",
        f"/activities/calls/{call_id}/conversations",
        f"/activities/calls/{call_id}/conversation",
        f"/recordings?call_id={call_id}",
        f"/call_recordings?call_id={call_id}"
    ]
    
    for endpoint in endpoints_to_try:
        print(f"\n  Trying: {endpoint}")
        result = api_request(endpoint)
        if result and not result.get("error"):
            print(f"    ✅ Success! Response: {json.dumps(result, indent=2)[:200]}")
            return result
        else:
            print(f"    ❌ Not found or error")
    
    return None

def check_extensive_endpoints():
    """Check if there are 'extensive' variants that provide more data"""
    print("\n=== Checking Extensive Endpoints ===")
    
    # Get a conversation and a call
    conv_result = api_request("/conversations", {"per_page": 1})
    call_result = api_request("/activities/calls", {"per_page": 1})
    
    if conv_result.get("data"):
        conv_id = conv_result["data"][0].get("id")
        print(f"\nTrying extensive conversation endpoint for ID: {conv_id}")
        
        # Try extensive endpoint
        extensive = api_request(f"/conversations/{conv_id}/extensive")
        if extensive and not extensive.get("error"):
            print("✅ Extensive conversation endpoint works!")
            print("Additional fields in extensive response:")
            if extensive.get("data"):
                regular_keys = set(conv_result["data"][0].keys())
                extensive_keys = set(extensive["data"].keys())
                additional = extensive_keys - regular_keys
                if additional:
                    for key in additional:
                        print(f"  + {key}: {type(extensive['data'][key]).__name__}")
                else:
                    print("  (No additional fields)")
    
    if call_result.get("data"):
        call_id = call_result["data"][0].get("id")
        print(f"\nTrying extensive call endpoint for ID: {call_id}")
        
        # Try extensive endpoint for calls
        extensive = api_request(f"/activities/calls/{call_id}/extensive")
        if extensive and not extensive.get("error"):
            print("✅ Extensive call endpoint works!")
        else:
            print("❌ No extensive endpoint for calls")

def analyze_linking_pattern():
    """Analyze how conversations and calls are actually linked in this instance"""
    print("\n" + "="*80)
    print("FINAL ANALYSIS: CONVERSATION-CALL LINKING PATTERN")
    print("="*80)
    
    # Get conversations from different platforms
    print("\n1. Checking Conversations by Platform:")
    
    platforms_data = {}
    for platform in ["salesloft", "zoom", "ms_teams", "chorus"]:
        params = {
            "per_page": 100,
            "page": 1
        }
        
        result = api_request("/conversations", params)
        convs = result.get("data", [])
        
        platform_convs = [c for c in convs if (c.get("platform", {}).get("name") if isinstance(c.get("platform"), dict) else c.get("platform")) == platform]
        
        if platform_convs:
            platforms_data[platform] = len(platform_convs)
            print(f"  {platform}: {len(platform_convs)} conversations")
            
            # Check first conversation for call references
            conv = platform_convs[0]
            print(f"    Sample ID: {conv.get('id')}")
            print(f"    Has 'call_id': {'call_id' in conv}")
            print(f"    Has 'activity_id': {'activity_id' in conv}")
    
    print("\n2. Checking if Calls reference Conversations:")
    
    # Get some recent calls
    params = {
        "per_page": 10,
        "page": 1
    }
    
    result = api_request("/activities/calls", params)
    calls = result.get("data", [])
    
    if calls:
        has_conv_ref = 0
        for call in calls:
            if any(k for k in call.keys() if 'conver' in k.lower()):
                has_conv_ref += 1
        
        print(f"  Calls with conversation reference: {has_conv_ref}/{len(calls)}")
    
    print("\n3. Key Findings:")
    print("-" * 40)
    
    if not platforms_data.get("salesloft"):
        print("⚠️  No Salesloft dialer conversations found")
        print("   → Conversations are from external platforms (Zoom, Teams)")
        print("   → These won't directly link to Salesloft Call activities")
    else:
        print("✅ Found Salesloft dialer conversations")
        print("   → These should link to Call activities")
    
    print("\n📊 Data Model Summary:")
    print("  • Conversations: Recording/transcript containers from any platform")
    print("  • Calls: Salesloft dialer activity records")
    print("  • Linking: Time-based matching + user correlation required")
    print("  • No direct field linkage found in API responses")

def main():
    print("\n" + "="*80)
    print("SALESLOFT DATA STRUCTURE EXPLORATION")
    print("="*80)
    
    # Explore structures
    calls = explore_call_structure()
    conversations = explore_conversation_structure()
    
    # Check for recording endpoints
    check_call_recordings_endpoint()
    
    # Check extensive endpoints
    check_extensive_endpoints()
    
    # Final analysis
    analyze_linking_pattern()
    
    print("\n" + "="*80)
    print("RECOMMENDATIONS")
    print("="*80)
    print("\n1. For Salesloft Dialer Calls → Conversations:")
    print("   Use time window matching with user_guid correlation")
    print("\n2. For External Platform Conversations (Zoom/Teams):")
    print("   These are separate from Call activities")
    print("   They represent meeting recordings, not phone calls")
    print("\n3. Best Practice:")
    print("   Treat Conversations and Calls as separate entities")
    print("   Link them via temporal correlation when needed")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)