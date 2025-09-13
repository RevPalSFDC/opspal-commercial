#!/usr/bin/env python3
"""
Search for transcriptions associated with Salesloft call recordings
Check if the recording IDs from calls have corresponding transcription data
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
    "User-Agent": "salesloft-transcription-finder/1.0"
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

def get_calls_with_recordings(limit: int = 20) -> List[Dict]:
    """Get recent calls that have recordings"""
    print("\n=== Fetching Calls with Recordings ===")
    
    calls_with_recordings = []
    page = 1
    
    while len(calls_with_recordings) < limit and page <= 10:
        params = {
            "page": page,
            "per_page": 100,
            "sort": "created_at",
            "sort_direction": "desc"
        }
        
        result = api_request("/activities/calls", params)
        calls = result.get("data", [])
        
        if not calls:
            break
        
        for call in calls:
            recordings = call.get("recordings", [])
            if recordings:
                # Extract recording IDs from URLs
                for rec in recordings:
                    url = rec.get("url", "")
                    if "recordings.salesloft.com" in url:
                        # Extract UUID from URL
                        uuid_pattern = r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
                        match = re.search(uuid_pattern, url)
                        if match:
                            rec["recording_id"] = match.group()
                
                calls_with_recordings.append({
                    "call_id": call.get("id"),
                    "created_at": call.get("created_at"),
                    "duration": call.get("duration"),
                    "to": call.get("to"),
                    "recordings": recordings,
                    "user": call.get("user", {}).get("name") if isinstance(call.get("user"), dict) else None
                })
                
                if len(calls_with_recordings) >= limit:
                    break
        
        page += 1
        time.sleep(0.3)
    
    print(f"Found {len(calls_with_recordings)} calls with recordings")
    return calls_with_recordings

def search_transcriptions_by_recording_id(recording_id: str) -> Optional[Dict]:
    """Search for transcriptions using a recording ID"""
    
    # Try different approaches to find transcriptions
    
    # Approach 1: Direct transcription endpoint with recording ID
    endpoints = [
        f"/transcriptions?recording_id={recording_id}",
        f"/transcriptions/{recording_id}",
        f"/recordings/{recording_id}/transcription",
        f"/recordings/{recording_id}/transcriptions"
    ]
    
    for endpoint in endpoints:
        result = api_request(endpoint)
        if not result.get("error"):
            if result.get("data"):
                return result
    
    # Approach 2: Search all transcriptions for matching references
    # This is expensive but thorough
    params = {
        "per_page": 100,
        "page": 1,
        "sort": "created_at",
        "sort_direction": "desc"
    }
    
    result = api_request("/transcriptions", params)
    transcriptions = result.get("data", [])
    
    for trans in transcriptions:
        # Check if transcription references this recording
        trans_id = trans.get("id")
        conversation_id = trans.get("conversation", {}).get("id") if isinstance(trans.get("conversation"), dict) else trans.get("conversation_id")
        
        # Check if the IDs match
        if trans_id == recording_id or conversation_id == recording_id:
            return {"data": trans}
    
    return None

def check_transcription_for_call(call_data: Dict) -> Dict:
    """Check if a call with recordings has transcriptions"""
    call_id = call_data["call_id"]
    recordings = call_data["recordings"]
    
    print(f"\n--- Call {call_id} ---")
    print(f"  Created: {call_data['created_at']}")
    print(f"  Duration: {call_data['duration']} seconds")
    print(f"  User: {call_data['user']}")
    print(f"  Recordings: {len(recordings)}")
    
    transcriptions_found = []
    
    for rec in recordings:
        rec_id = rec.get("recording_id")
        rec_url = rec.get("url")
        
        if rec_id:
            print(f"\n  Checking recording {rec_id}...")
            
            # Try to find transcription
            trans_result = search_transcriptions_by_recording_id(rec_id)
            
            if trans_result and trans_result.get("data"):
                trans_data = trans_result["data"]
                print(f"    ✅ Transcription found!")
                
                # Handle both list and dict responses
                if isinstance(trans_data, list):
                    if trans_data:
                        trans_item = trans_data[0]
                        print(f"    Transcription ID: {trans_item.get('id')}")
                        transcriptions_found.append({
                            "recording_id": rec_id,
                            "transcription_id": trans_item.get("id"),
                            "transcription_data": trans_item
                        })
                else:
                    print(f"    Transcription ID: {trans_data.get('id')}")
                    transcriptions_found.append({
                        "recording_id": rec_id,
                        "transcription_id": trans_data.get("id"),
                        "transcription_data": trans_data
                    })
            else:
                print(f"    ❌ No transcription found")
    
    return {
        "call_id": call_id,
        "recordings_count": len(recordings),
        "transcriptions_found": len(transcriptions_found),
        "transcriptions": transcriptions_found
    }

def check_conversation_creation_from_calls():
    """Check if any conversations were created from call recordings"""
    print("\n=== Checking for Conversations Created from Call Recordings ===")
    
    # Get all conversations and check if any reference call recordings
    params = {
        "per_page": 100,
        "page": 1
    }
    
    conversations_from_calls = []
    
    for page in range(1, 6):  # Check first 5 pages
        params["page"] = page
        result = api_request("/conversations", params)
        conversations = result.get("data", [])
        
        if not conversations:
            break
        
        for conv in conversations:
            # Check if conversation has any reference to a call
            conv_id = conv.get("id")
            platform = conv.get("platform", {}).get("name") if isinstance(conv.get("platform"), dict) else conv.get("platform")
            
            # Look for call-related fields
            if platform == "salesloft" or "call" in str(conv).lower():
                conversations_from_calls.append({
                    "conversation_id": conv_id,
                    "platform": platform,
                    "media_type": conv.get("media_type"),
                    "recording": conv.get("recording")
                })
        
        time.sleep(0.3)
    
    print(f"Found {len(conversations_from_calls)} conversations potentially from calls")
    return conversations_from_calls

def analyze_transcription_artifacts():
    """Check if transcription artifacts contain the actual text"""
    print("\n=== Analyzing Transcription Artifacts ===")
    
    # Get a sample transcription
    params = {
        "per_page": 5,
        "page": 1
    }
    
    result = api_request("/transcriptions", params)
    transcriptions = result.get("data", [])
    
    if not transcriptions:
        print("No transcriptions found")
        return []
    
    artifacts_data = []
    
    for trans in transcriptions[:3]:  # Check first 3
        trans_id = trans.get("id")
        print(f"\nTranscription {trans_id}:")
        
        # Try to get the artifact
        artifact_result = api_request(f"/transcriptions/{trans_id}/artifact")
        
        if artifact_result and not artifact_result.get("error"):
            artifact = artifact_result.get("data", {})
            if artifact:
                print(f"  ✅ Artifact found")
                print(f"  URL: {artifact.get('url', 'N/A')[:80]}...")
                
                # Try to get sentences
                sentences_result = api_request(f"/transcriptions/{trans_id}/sentences")
                if sentences_result and not sentences_result.get("error"):
                    sentences = sentences_result.get("data", [])
                    print(f"  Sentences: {len(sentences)} found")
                    
                    if sentences:
                        # Show sample sentence
                        sample = sentences[0]
                        print(f"  Sample sentence:")
                        print(f"    Text: {sample.get('text', '')[:100]}...")
                        print(f"    Start: {sample.get('start_time')}, End: {sample.get('end_time')}")
                
                artifacts_data.append({
                    "transcription_id": trans_id,
                    "has_artifact": True,
                    "artifact_url": artifact.get("url"),
                    "sentences_count": len(sentences) if 'sentences' in locals() else 0
                })
        else:
            print(f"  ❌ No artifact found")
            artifacts_data.append({
                "transcription_id": trans_id,
                "has_artifact": False
            })
    
    return artifacts_data

def main():
    print("\n" + "="*80)
    print("CALL RECORDING TRANSCRIPTION ANALYSIS")
    print("="*80)
    
    # Get calls with recordings
    calls_with_recordings = get_calls_with_recordings(limit=10)
    
    if not calls_with_recordings:
        print("\n❌ No calls with recordings found")
        return
    
    # Check each call for transcriptions
    print("\n" + "="*80)
    print("CHECKING TRANSCRIPTIONS FOR CALL RECORDINGS")
    print("="*80)
    
    transcription_results = []
    calls_with_transcriptions = 0
    
    for call_data in calls_with_recordings:
        result = check_transcription_for_call(call_data)
        transcription_results.append(result)
        
        if result["transcriptions_found"] > 0:
            calls_with_transcriptions += 1
        
        time.sleep(0.5)
    
    # Check for conversations from calls
    conversations_from_calls = check_conversation_creation_from_calls()
    
    # Analyze transcription artifacts
    artifacts_data = analyze_transcription_artifacts()
    
    # Summary Report
    print("\n" + "="*80)
    print("SUMMARY REPORT")
    print("="*80)
    
    total_calls = len(transcription_results)
    total_recordings = sum(r["recordings_count"] for r in transcription_results)
    total_transcriptions = sum(r["transcriptions_found"] for r in transcription_results)
    
    print(f"\n📊 Analysis Results:")
    print(f"  Calls analyzed: {total_calls}")
    print(f"  Total recordings: {total_recordings}")
    print(f"  Calls with transcriptions: {calls_with_transcriptions}/{total_calls} ({calls_with_transcriptions/total_calls*100:.1f}%)" if total_calls > 0 else "N/A")
    print(f"  Total transcriptions found: {total_transcriptions}")
    
    if conversations_from_calls:
        print(f"\n🔄 Conversations from Calls:")
        print(f"  Found {len(conversations_from_calls)} potential call-based conversations")
    
    if artifacts_data:
        artifacts_with_data = sum(1 for a in artifacts_data if a["has_artifact"])
        print(f"\n📝 Transcription Artifacts:")
        print(f"  {artifacts_with_data}/{len(artifacts_data)} transcriptions have downloadable artifacts")
    
    # Save results
    output_file = "/home/chris/Desktop/RevPal/Agents/call_transcription_analysis.json"
    with open(output_file, "w") as f:
        json.dump({
            "analysis_timestamp": datetime.now(timezone.utc).isoformat(),
            "summary": {
                "calls_analyzed": total_calls,
                "total_recordings": total_recordings,
                "calls_with_transcriptions": calls_with_transcriptions,
                "total_transcriptions": total_transcriptions,
                "transcription_rate": calls_with_transcriptions / total_calls if total_calls > 0 else 0
            },
            "call_results": transcription_results,
            "conversations_from_calls": conversations_from_calls[:10],
            "artifact_analysis": artifacts_data
        }, f, indent=2)
    
    print(f"\nDetailed results saved to: {output_file}")
    
    # Key Insights
    print("\n" + "="*80)
    print("KEY INSIGHTS")
    print("="*80)
    
    if calls_with_transcriptions == 0:
        print("\n❌ No transcriptions found for call recordings")
        print("   Possible reasons:")
        print("   - Transcription may not be enabled for calls")
        print("   - Transcriptions might be processed asynchronously")
        print("   - Different storage mechanism for call transcriptions")
    elif calls_with_transcriptions == total_calls:
        print("\n✅ All call recordings have transcriptions!")
    else:
        print(f"\n⚠️  Only {calls_with_transcriptions}/{total_calls} calls have transcriptions")
        print("   Some recordings may not have been transcribed yet")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)