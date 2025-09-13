#!/usr/bin/env python3
"""
Find and analyze Salesloft platform conversations with audio media type
These should be the actual dialer call recordings
"""

import os
import sys
import json
import requests
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Any, Tuple
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
    "User-Agent": "salesloft-audio-finder/1.0"
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

def find_salesloft_audio_conversations(max_pages: int = 20) -> List[Dict]:
    """
    Search for conversations where:
    - platform = "salesloft" 
    - media_type = "audio"
    """
    print("\n=== Searching for Salesloft Audio Conversations ===")
    print("Criteria: platform='salesloft' AND media_type='audio'\n")
    
    salesloft_audio_convs = []
    all_platforms = {}
    all_media_types = {}
    page = 1
    total_checked = 0
    
    while page <= max_pages:
        params = {
            "page": page,
            "per_page": 100,
            "sort": "started_recording_at",
            "sort_direction": "desc"
        }
        
        result = api_request("/conversations", params)
        data = result.get("data", [])
        
        if not data:
            print(f"No more data after page {page-1}")
            break
        
        total_checked += len(data)
        page_matches = 0
        
        for conv in data:
            # Get platform and media type
            platform = conv.get("platform", {}).get("name") if isinstance(conv.get("platform"), dict) else conv.get("platform")
            media_type = conv.get("media_type")
            
            # Track all platforms and media types we see
            all_platforms[platform] = all_platforms.get(platform, 0) + 1
            if media_type:
                all_media_types[media_type] = all_media_types.get(media_type, 0) + 1
            
            # Check if this is a Salesloft audio conversation
            if platform == "salesloft" and media_type == "audio":
                salesloft_audio_convs.append(conv)
                page_matches += 1
        
        print(f"Page {page}: Checked {len(data)} conversations, found {page_matches} Salesloft audio")
        
        page += 1
        time.sleep(0.3)  # Rate limit protection
    
    print(f"\n📊 Statistics from {total_checked} conversations:")
    print("\nPlatforms found:")
    for platform, count in sorted(all_platforms.items(), key=lambda x: x[1], reverse=True):
        print(f"  {platform}: {count}")
    
    print("\nMedia types found:")
    for media_type, count in sorted(all_media_types.items(), key=lambda x: x[1], reverse=True):
        print(f"  {media_type}: {count}")
    
    print(f"\n✅ Found {len(salesloft_audio_convs)} Salesloft audio conversations")
    
    return salesloft_audio_convs

def analyze_salesloft_conversation(conv: Dict) -> Dict:
    """Analyze a single Salesloft conversation in detail"""
    conv_id = conv.get("id")
    
    # Get extensive data if available
    extensive_result = api_request(f"/conversations/{conv_id}/extensive")
    if extensive_result.get("data"):
        conv = extensive_result["data"]  # Use the extensive version
    
    analysis = {
        "id": conv_id,
        "platform": conv.get("platform", {}).get("name") if isinstance(conv.get("platform"), dict) else conv.get("platform"),
        "media_type": conv.get("media_type"),
        "title": conv.get("title"),
        "duration": conv.get("duration"),
        "started_recording_at": conv.get("started_recording_at"),
        "user_guid": conv.get("user_guid") or conv.get("owner_id"),
        "person_id": conv.get("person", {}).get("id") if isinstance(conv.get("person"), dict) else None,
        "has_recording": bool(conv.get("recording")),
        "has_transcription": bool(conv.get("transcription")),
        "attendees": conv.get("attendees", []) if "attendees" in conv else None
    }
    
    # Try to parse the timestamp
    if analysis["started_recording_at"]:
        try:
            if isinstance(analysis["started_recording_at"], str):
                if "T" in analysis["started_recording_at"]:
                    dt = datetime.fromisoformat(analysis["started_recording_at"].replace("Z", "+00:00"))
                else:
                    dt = datetime.fromtimestamp(float(analysis["started_recording_at"]), tz=timezone.utc)
            else:
                dt = datetime.fromtimestamp(float(analysis["started_recording_at"]), tz=timezone.utc)
            analysis["parsed_datetime"] = dt.isoformat()
        except:
            analysis["parsed_datetime"] = None
    
    return analysis

def find_call_for_conversation(conv_analysis: Dict) -> Tuple[Optional[Dict], str]:
    """
    Find the Call activity that matches this Salesloft conversation
    """
    user_guid = conv_analysis["user_guid"]
    parsed_dt = conv_analysis.get("parsed_datetime")
    duration = conv_analysis.get("duration", 0)
    
    if not user_guid or not parsed_dt:
        return None, "missing_data"
    
    # Parse datetime
    conv_time = datetime.fromisoformat(parsed_dt)
    
    # Create search window
    window_start = conv_time - timedelta(minutes=10)
    window_end = conv_time + timedelta(minutes=10)
    
    # Search for calls
    params = {
        "updated_at[gte]": window_start.isoformat(),
        "updated_at[lte]": window_end.isoformat(),
        "per_page": 100
    }
    
    result = api_request("/activities/calls", params)
    calls = result.get("data", [])
    
    # Filter by user
    user_calls = []
    for call in calls:
        call_user_guid = call.get("user", {}).get("guid") if isinstance(call.get("user"), dict) else None
        if call_user_guid == user_guid:
            user_calls.append(call)
    
    if not user_calls:
        return None, "no_user_calls"
    
    # Score matches based on time and duration
    best_match = None
    best_score = 0
    
    for call in user_calls:
        score = 0
        
        # Check duration match (if both have duration)
        call_duration = call.get("duration", 0)
        if duration > 0 and call_duration > 0:
            duration_diff = abs(duration - call_duration)
            if duration_diff < 30:  # Within 30 seconds
                score += 10
            elif duration_diff < 60:  # Within 1 minute
                score += 5
            elif duration_diff < 120:  # Within 2 minutes
                score += 2
        
        # Check time proximity
        try:
            call_created = call.get("created_at")
            if call_created:
                if isinstance(call_created, str):
                    if "T" in call_created:
                        call_time = datetime.fromisoformat(call_created.replace("Z", "+00:00"))
                    else:
                        call_time = datetime.fromtimestamp(float(call_created), tz=timezone.utc)
                else:
                    call_time = datetime.fromtimestamp(float(call_created), tz=timezone.utc)
                
                time_diff = abs((call_time - conv_time).total_seconds())
                if time_diff < 60:  # Within 1 minute
                    score += 10
                elif time_diff < 300:  # Within 5 minutes
                    score += 5
                elif time_diff < 600:  # Within 10 minutes
                    score += 2
        except:
            pass
        
        # Check if call has recording indication
        if call.get("recordings_count", 0) > 0:
            score += 5
        
        if score > best_score:
            best_score = score
            best_match = call
    
    if best_match and best_score >= 5:
        return best_match, f"matched_score_{best_score}"
    
    return None, "no_good_match"

def main():
    print("\n" + "="*80)
    print("SALESLOFT AUDIO CONVERSATIONS ANALYSIS")
    print("="*80)
    
    # Find Salesloft audio conversations
    salesloft_convs = find_salesloft_audio_conversations(max_pages=20)
    
    if not salesloft_convs:
        print("\n❌ No Salesloft audio conversations found")
        print("This means no dialer call recordings exist in the system")
        return
    
    # Analyze each conversation and try to link to calls
    print("\n" + "="*80)
    print("ANALYZING SALESLOFT CONVERSATIONS AND LINKING TO CALLS")
    print("="*80)
    
    results = []
    successful_links = 0
    
    # Limit to first 10 for detailed analysis
    convs_to_analyze = salesloft_convs[:10]
    
    for idx, conv in enumerate(convs_to_analyze, 1):
        print(f"\n--- Conversation {idx}/{len(convs_to_analyze)} ---")
        
        # Analyze conversation
        analysis = analyze_salesloft_conversation(conv)
        print(f"ID: {analysis['id']}")
        print(f"Title: {analysis['title']}")
        print(f"Duration: {analysis['duration']} seconds")
        print(f"User GUID: {analysis['user_guid']}")
        print(f"Started: {analysis['parsed_datetime']}")
        print(f"Has Recording: {analysis['has_recording']}")
        print(f"Has Transcription: {analysis['has_transcription']}")
        
        # Try to find matching call
        print("\nSearching for matching Call activity...")
        call, match_method = find_call_for_conversation(analysis)
        
        if call:
            print(f"✅ MATCH FOUND ({match_method})")
            print(f"  Call ID: {call.get('id')}")
            print(f"  Call Duration: {call.get('duration')} seconds")
            print(f"  Call Status: {call.get('status')}")
            print(f"  Call Disposition: {call.get('disposition')}")
            print(f"  To: {call.get('to')}")
            successful_links += 1
            
            analysis["linked_call"] = {
                "id": call.get("id"),
                "duration": call.get("duration"),
                "status": call.get("status"),
                "disposition": call.get("disposition"),
                "to": call.get("to"),
                "match_method": match_method
            }
        else:
            print(f"❌ No match found ({match_method})")
            analysis["linked_call"] = None
            analysis["match_failure_reason"] = match_method
        
        results.append(analysis)
        time.sleep(0.5)  # Rate limiting
    
    # Summary report
    print("\n" + "="*80)
    print("SUMMARY REPORT")
    print("="*80)
    
    print(f"\nTotal Salesloft Audio Conversations Found: {len(salesloft_convs)}")
    print(f"Conversations Analyzed in Detail: {len(results)}")
    print(f"Successfully Linked to Calls: {successful_links}/{len(results)} ({successful_links/len(results)*100:.1f}%)" if results else "N/A")
    
    # Save results
    output_file = "/home/chris/Desktop/RevPal/Agents/salesloft_audio_analysis.json"
    with open(output_file, "w") as f:
        json.dump({
            "analysis_timestamp": datetime.now(timezone.utc).isoformat(),
            "total_salesloft_audio_conversations": len(salesloft_convs),
            "analyzed_count": len(results),
            "successful_links": successful_links,
            "linkage_rate": successful_links / len(results) if results else 0,
            "detailed_results": results,
            "sample_conversations": [analyze_salesloft_conversation(c) for c in salesloft_convs[:20]]
        }, f, indent=2)
    
    print(f"\nDetailed results saved to: {output_file}")
    
    # Key insights
    print("\n" + "="*80)
    print("KEY INSIGHTS")
    print("="*80)
    
    if len(salesloft_convs) > 0:
        print(f"\n✅ SUCCESS: Found {len(salesloft_convs)} Salesloft dialer recordings!")
        print("These are actual phone call recordings from the Salesloft dialer")
        
        if successful_links == len(results) and results:
            print("\n🎯 PERFECT: All analyzed conversations have matching Call activities!")
        elif successful_links > len(results) * 0.7 and results:
            print(f"\n✅ GOOD: {successful_links/len(results):.0%} of conversations successfully linked to Calls")
        elif results:
            print(f"\n⚠️  ISSUE: Only {successful_links/len(results):.0%} of conversations linked to Calls")
            print("Possible causes:")
            print("  - Timing synchronization issues")
            print("  - Calls created before/after recordings")
            print("  - User GUID mismatches")
    else:
        print("\n❌ No Salesloft audio conversations found")
        print("All conversations appear to be from video platforms (Zoom/Teams)")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)