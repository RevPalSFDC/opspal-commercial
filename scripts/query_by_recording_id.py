#!/usr/bin/env python3
"""
Query conversations using recording IDs
Based on URL pattern: https://recordings.salesloft.com/c/101314/9af09c28-5c42-4bc9-9e8d-52bb2938ae41
Where 101314 appears to be the company/tenant ID and the UUID is the recording ID
"""

import os
import sys
import json
import requests
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Any, Tuple
import time
import re

# Configuration
BASE_URL = "https://api.salesloft.com/v2"
TOKEN = os.getenv("SALESLOFT_TOKEN")
if not TOKEN:
    print("Error: SALESLOFT_TOKEN environment variable not set")
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json",
    "User-Agent": "salesloft-recording-finder/1.0"
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
                print(f"Error making request to {endpoint}: {e}")
                return {"error": str(e)}
            time.sleep(2 ** attempt)
    
    return {}

def extract_recording_ids_from_conversations() -> List[Dict]:
    """
    Extract recording IDs from conversation objects
    Look for recording references in various fields
    """
    print("\n=== Extracting Recording IDs from Conversations ===")
    
    recording_refs = []
    page = 1
    max_pages = 5
    
    while page <= max_pages:
        params = {
            "page": page,
            "per_page": 100,
            "sort": "created_at",
            "sort_direction": "desc"
        }
        
        result = api_request("/conversations", params)
        conversations = result.get("data", [])
        
        if not conversations:
            break
        
        for conv in conversations:
            conv_id = conv.get("id")
            
            # Check for recording field
            recording = conv.get("recording")
            if recording:
                if isinstance(recording, dict):
                    rec_id = recording.get("id")
                    rec_href = recording.get("_href", "")
                    
                    # Extract ID from href if present
                    if rec_href and not rec_id:
                        # Try to extract UUID from href
                        uuid_pattern = r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
                        match = re.search(uuid_pattern, rec_href)
                        if match:
                            rec_id = match.group()
                    
                    if rec_id:
                        recording_refs.append({
                            "conversation_id": conv_id,
                            "recording_id": rec_id,
                            "recording_href": rec_href,
                            "platform": conv.get("platform", {}).get("name") if isinstance(conv.get("platform"), dict) else conv.get("platform"),
                            "media_type": conv.get("media_type")
                        })
                elif isinstance(recording, str):
                    recording_refs.append({
                        "conversation_id": conv_id,
                        "recording_id": recording,
                        "platform": conv.get("platform", {}).get("name") if isinstance(conv.get("platform"), dict) else conv.get("platform"),
                        "media_type": conv.get("media_type")
                    })
        
        print(f"Page {page}: Found {len([r for r in recording_refs if r['conversation_id'] in [c.get('id') for c in conversations]])} recordings")
        page += 1
        time.sleep(0.3)
    
    print(f"\nTotal recording references found: {len(recording_refs)}")
    return recording_refs

def test_recording_endpoints(sample_recording_id: str = "9af09c28-5c42-4bc9-9e8d-52bb2938ae41"):
    """
    Test various recording endpoint patterns
    """
    print(f"\n=== Testing Recording Endpoints with ID: {sample_recording_id} ===")
    
    endpoints_to_test = [
        f"/recordings/{sample_recording_id}",
        f"/conversations/{sample_recording_id}",
        f"/conversations/{sample_recording_id}/recording",
        f"/recordings?id={sample_recording_id}",
        f"/conversations?recording_id={sample_recording_id}",
        f"/activities/calls?recording_id={sample_recording_id}",
    ]
    
    results = []
    
    for endpoint in endpoints_to_test:
        print(f"\nTrying: {endpoint}")
        result = api_request(endpoint)
        
        if result.get("error") == "not_found":
            print("  ❌ 404 Not Found")
        elif result.get("error"):
            print(f"  ❌ Error: {result.get('error')}")
        else:
            print(f"  ✅ Success!")
            if result.get("data"):
                if isinstance(result["data"], list):
                    print(f"     Found {len(result['data'])} items")
                    if result["data"]:
                        print(f"     First item type: {result['data'][0].get('type', 'unknown')}")
                else:
                    print(f"     Found single item")
                results.append((endpoint, result))
            else:
                print(f"     Response: {json.dumps(result, indent=2)[:200]}")
    
    return results

def query_conversations_with_recordings():
    """
    Query conversations and check their recording references
    """
    print("\n=== Analyzing Conversation Recording References ===")
    
    # Get a sample of conversations
    params = {
        "page": 1,
        "per_page": 10,
        "sort": "created_at",
        "sort_direction": "desc"
    }
    
    result = api_request("/conversations", params)
    conversations = result.get("data", [])
    
    recordings_found = []
    
    for conv in conversations:
        conv_id = conv.get("id")
        platform = conv.get("platform", {}).get("name") if isinstance(conv.get("platform"), dict) else conv.get("platform")
        media_type = conv.get("media_type")
        
        print(f"\nConversation {conv_id}:")
        print(f"  Platform: {platform}")
        print(f"  Media Type: {media_type}")
        
        # Check recording field
        recording = conv.get("recording")
        if recording:
            print(f"  Recording field present: {type(recording).__name__}")
            
            if isinstance(recording, dict):
                rec_id = recording.get("id")
                rec_href = recording.get("_href", "")
                print(f"    ID: {rec_id}")
                print(f"    Href: {rec_href}")
                
                # Try to fetch the recording directly
                if rec_id:
                    print(f"  Attempting to fetch recording {rec_id}...")
                    rec_result = api_request(f"/conversations/{conv_id}/recording")
                    if not rec_result.get("error"):
                        rec_data = rec_result.get("data", {})
                        if rec_data:
                            print(f"    ✅ Recording data retrieved")
                            print(f"    URL: {rec_data.get('url', 'N/A')}")
                            print(f"    Status: {rec_data.get('status', 'N/A')}")
                            
                            # Check if URL matches the pattern
                            url = rec_data.get("url", "")
                            if "recordings.salesloft.com" in url:
                                print(f"    🎯 Salesloft recording URL found!")
                                # Extract recording ID from URL
                                uuid_pattern = r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
                                match = re.search(uuid_pattern, url)
                                if match:
                                    found_rec_id = match.group()
                                    print(f"    Recording ID from URL: {found_rec_id}")
                                    recordings_found.append({
                                        "conversation_id": conv_id,
                                        "recording_id": found_rec_id,
                                        "url": url,
                                        "platform": platform
                                    })
                    else:
                        print(f"    ❌ Could not fetch recording")
        else:
            print(f"  No recording field")
    
    return recordings_found

def check_call_to_recording_linkage():
    """
    Check if Calls have any recording references
    """
    print("\n=== Checking Call Recording References ===")
    
    # Get recent calls
    params = {
        "page": 1,
        "per_page": 20,
        "sort": "created_at",
        "sort_direction": "desc"
    }
    
    result = api_request("/activities/calls", params)
    calls = result.get("data", [])
    
    calls_with_recordings = []
    
    for call in calls:
        call_id = call.get("id")
        recordings = call.get("recordings", [])
        recordings_count = call.get("recordings_count", 0)
        
        if recordings_count > 0 or recordings:
            print(f"\nCall {call_id}:")
            print(f"  Recordings count: {recordings_count}")
            print(f"  Recordings array: {recordings}")
            
            calls_with_recordings.append({
                "call_id": call_id,
                "recordings": recordings,
                "recordings_count": recordings_count,
                "to": call.get("to"),
                "created_at": call.get("created_at")
            })
            
            # Try to fetch recording for this call
            for potential_endpoint in [
                f"/activities/calls/{call_id}/recording",
                f"/activities/calls/{call_id}/recordings",
                f"/calls/{call_id}/recording"
            ]:
                rec_result = api_request(potential_endpoint)
                if not rec_result.get("error"):
                    print(f"  ✅ Found recording at {potential_endpoint}")
                    print(f"     Data: {json.dumps(rec_result, indent=2)[:200]}")
                    break
    
    if not calls_with_recordings:
        print("\nNo calls found with recording references")
    
    return calls_with_recordings

def main():
    print("\n" + "="*80)
    print("RECORDING ID BASED CONVERSATION QUERY")
    print("="*80)
    
    # Test the sample recording ID from the URL
    sample_id = "9af09c28-5c42-4bc9-9e8d-52bb2938ae41"
    print(f"\nTesting with recording ID from URL: {sample_id}")
    
    # Test various endpoints
    test_results = test_recording_endpoints(sample_id)
    
    # Extract recording IDs from conversations
    recording_refs = extract_recording_ids_from_conversations()
    
    # Query conversations with recordings
    recordings_found = query_conversations_with_recordings()
    
    # Check call recording linkage
    call_recordings = check_call_to_recording_linkage()
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    
    print(f"\n📊 Analysis Results:")
    print(f"  Recording references found in conversations: {len(recording_refs)}")
    print(f"  Salesloft recording URLs found: {len(recordings_found)}")
    print(f"  Calls with recording references: {len(call_recordings)}")
    
    if recording_refs:
        print("\n🔍 Sample Recording IDs from Conversations:")
        for ref in recording_refs[:5]:
            print(f"  Conv {ref['conversation_id']}: Recording {ref.get('recording_id', 'N/A')}")
            print(f"    Platform: {ref['platform']}, Media: {ref['media_type']}")
    
    if recordings_found:
        print("\n🎯 Salesloft Recording URLs Found:")
        for rec in recordings_found[:5]:
            print(f"  Conv {rec['conversation_id']}: {rec['url'][:80]}...")
    
    # Save results
    output_file = "/home/chris/Desktop/RevPal/Agents/recording_id_analysis.json"
    with open(output_file, "w") as f:
        json.dump({
            "analysis_timestamp": datetime.now(timezone.utc).isoformat(),
            "sample_recording_id_tested": sample_id,
            "recording_references": recording_refs[:20],
            "salesloft_recordings": recordings_found,
            "calls_with_recordings": call_recordings
        }, f, indent=2)
    
    print(f"\nDetailed results saved to: {output_file}")
    
    print("\n" + "="*80)
    print("KEY INSIGHTS")
    print("="*80)
    
    if recordings_found:
        print("\n✅ Found Salesloft recording URLs in conversations!")
        print("These recordings use the URL pattern: recordings.salesloft.com/c/{tenant_id}/{recording_id}")
    else:
        print("\n⚠️  No Salesloft recording URLs found in conversation data")
    
    if not call_recordings:
        print("\n❌ Calls do not have populated recording arrays")
        print("The recording data exists at the Conversation level, not the Call level")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)