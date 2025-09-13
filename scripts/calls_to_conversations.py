#!/usr/bin/env python3
"""
Analyze Calls as primary objects and find their linked Conversations
Start with Call activities and check which ones have recordings/conversations
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
    "User-Agent": "salesloft-call-analyzer/1.0"
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

def fetch_recent_calls_with_recordings(limit: int = 10) -> List[Dict]:
    """Fetch recent calls that have recordings"""
    print(f"\n=== Fetching Recent Calls with Recordings ===")
    
    calls_with_recordings = []
    page = 1
    total_calls_checked = 0
    
    # Get calls from the last 30 days
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=30)
    
    while len(calls_with_recordings) < limit and page <= 10:
        params = {
            "page": page,
            "per_page": 100,
            "sort": "created_at",
            "sort_direction": "desc",
            "created_at[gte]": start_date.isoformat(),
            "created_at[lte]": end_date.isoformat()
        }
        
        result = api_request("/activities/calls", params)
        calls = result.get("data", [])
        
        if not calls:
            break
        
        total_calls_checked += len(calls)
        
        for call in calls:
            # Check if call has recordings
            recordings_count = call.get("recordings_count", 0)
            if recordings_count > 0:
                calls_with_recordings.append(call)
                print(f"  Found call {call.get('id')} with {recordings_count} recording(s)")
                
                if len(calls_with_recordings) >= limit:
                    break
        
        print(f"  Checked page {page}: {len([c for c in calls if c.get('recordings_count', 0) > 0])}/{len(calls)} calls have recordings")
        page += 1
        time.sleep(0.5)
    
    print(f"\nTotal calls checked: {total_calls_checked}")
    print(f"Calls with recordings found: {len(calls_with_recordings)}")
    
    return calls_with_recordings[:limit]

def find_conversation_for_call(call: Dict) -> Tuple[Optional[Dict], str]:
    """
    Try to find a conversation that matches this call
    Returns: (conversation_dict or None, method_used)
    """
    call_id = call.get("id")
    user_guid = call.get("user", {}).get("guid") or call.get("user_guid")
    created_at = call.get("created_at")
    duration = call.get("duration", 0)
    
    print(f"\n  Searching for conversation matching call {call_id}")
    
    # Method 1: Check if call has a direct conversation_id field (undocumented but might exist)
    conversation_id = call.get("conversation_id")
    if conversation_id:
        print(f"    Found direct conversation_id: {conversation_id}")
        conv_result = api_request(f"/conversations/{conversation_id}")
        if conv_result.get("data"):
            return conv_result.get("data"), "direct_link"
    
    # Method 2: Search conversations by time window and user
    if user_guid and created_at:
        try:
            # Parse the created_at timestamp
            if isinstance(created_at, str):
                if "T" in created_at:
                    call_time = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                else:
                    call_time = datetime.fromtimestamp(float(created_at), tz=timezone.utc)
            else:
                call_time = datetime.fromtimestamp(float(created_at), tz=timezone.utc)
            
            # Create search window (±5 minutes around call time)
            window_start = call_time - timedelta(minutes=5)
            window_end = call_time + timedelta(minutes=5)
            
            print(f"    Searching conversations for user {user_guid}")
            print(f"    Time window: {window_start.isoformat()} to {window_end.isoformat()}")
            
            # Search conversations in the time window
            params = {
                "per_page": 100,
                "sort": "started_recording_at",
                "sort_direction": "desc"
            }
            
            result = api_request("/conversations", params)
            conversations = result.get("data", [])
            
            # Filter conversations by user and time
            matches = []
            for conv in conversations:
                conv_user = conv.get("user_guid") or conv.get("owner", {}).get("guid")
                if conv_user != user_guid:
                    continue
                
                # Check if conversation time falls within window
                conv_started = conv.get("started_recording_at")
                if not conv_started:
                    continue
                
                try:
                    if isinstance(conv_started, str):
                        if "T" in conv_started:
                            conv_time = datetime.fromisoformat(conv_started.replace("Z", "+00:00"))
                        else:
                            conv_time = datetime.fromtimestamp(float(conv_started), tz=timezone.utc)
                    else:
                        conv_time = datetime.fromtimestamp(float(conv_started), tz=timezone.utc)
                    
                    if window_start <= conv_time <= window_end:
                        # Calculate duration match score
                        conv_duration = conv.get("duration", 0)
                        if duration > 0 and conv_duration > 0:
                            duration_diff = abs(duration - conv_duration)
                            duration_match = 1 - (duration_diff / max(duration, conv_duration))
                        else:
                            duration_match = 0.5
                        
                        matches.append({
                            "conversation": conv,
                            "duration_match": duration_match,
                            "time_diff": abs((conv_time - call_time).total_seconds())
                        })
                except:
                    continue
            
            # Sort matches by best fit (duration match and time proximity)
            if matches:
                matches.sort(key=lambda x: (x["duration_match"], -x["time_diff"]), reverse=True)
                best_match = matches[0]["conversation"]
                print(f"    Found matching conversation: {best_match.get('id')}")
                print(f"    Duration match: {matches[0]['duration_match']:.1%}")
                print(f"    Time difference: {matches[0]['time_diff']:.0f} seconds")
                return best_match, "time_window_match"
                
        except Exception as e:
            print(f"    Error in time window search: {e}")
    
    # Method 3: Check Call Data Records for additional linking information
    if created_at:
        try:
            if isinstance(created_at, str):
                if "T" in created_at:
                    call_time = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                else:
                    call_time = datetime.fromtimestamp(float(created_at), tz=timezone.utc)
            else:
                call_time = datetime.fromtimestamp(float(created_at), tz=timezone.utc)
            
            window_start = call_time - timedelta(minutes=5)
            window_end = call_time + timedelta(minutes=5)
            
            params = {
                "created_at[gte]": window_start.isoformat(),
                "created_at[lte]": window_end.isoformat(),
                "per_page": 100
            }
            
            cdr_result = api_request("/call_data_records", params)
            cdrs = cdr_result.get("data", [])
            
            # Look for CDR that references this call
            for cdr in cdrs:
                if cdr.get("call_id") == call_id or cdr.get("activity_id") == call_id:
                    # Check if CDR has conversation reference
                    conv_id = cdr.get("conversation_id") or cdr.get("recording_id")
                    if conv_id:
                        print(f"    Found conversation via CDR: {conv_id}")
                        conv_result = api_request(f"/conversations/{conv_id}")
                        if conv_result.get("data"):
                            return conv_result.get("data"), "cdr_link"
        except Exception as e:
            print(f"    Error checking CDRs: {e}")
    
    print(f"    No matching conversation found")
    return None, "no_match"

def analyze_calls_to_conversations():
    """Main analysis function starting from Calls"""
    print("\n" + "="*80)
    print("CALLS TO CONVERSATIONS LINKAGE ANALYSIS")
    print("="*80)
    
    # First, get some statistics on all recent calls
    print("\n=== Call Statistics (Last 7 Days) ===")
    
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=7)
    
    params = {
        "created_at[gte]": start_date.isoformat(),
        "created_at[lte]": end_date.isoformat(),
        "per_page": 100,
        "page": 1
    }
    
    all_recent_calls = []
    page = 1
    
    while page <= 3:
        params["page"] = page
        result = api_request("/activities/calls", params)
        calls = result.get("data", [])
        if not calls:
            break
        all_recent_calls.extend(calls)
        page += 1
        time.sleep(0.5)
    
    total_calls = len(all_recent_calls)
    calls_with_recordings = [c for c in all_recent_calls if c.get("recordings_count", 0) > 0]
    
    print(f"Total calls in last 7 days: {total_calls}")
    print(f"Calls with recordings: {len(calls_with_recordings)} ({len(calls_with_recordings)/total_calls:.1%})" if total_calls > 0 else "No calls found")
    
    # Now analyze specific calls with recordings
    print("\n" + "="*80)
    calls_to_analyze = fetch_recent_calls_with_recordings(10)
    
    if not calls_to_analyze:
        print("\n⚠️  No calls with recordings found to analyze")
        return []
    
    # Analyze each call
    results = []
    
    for call in calls_to_analyze:
        call_id = call.get("id")
        print(f"\n--- Analyzing Call {call_id} ---")
        print(f"  User: {call.get('user', {}).get('name')}")
        print(f"  Created: {call.get('created_at')}")
        print(f"  Duration: {call.get('duration')} seconds")
        print(f"  Status: {call.get('status')}")
        print(f"  Disposition: {call.get('disposition')}")
        print(f"  To: {call.get('to')}")
        print(f"  From: {call.get('from')}")
        print(f"  Recordings Count: {call.get('recordings_count')}")
        
        # Try to find matching conversation
        conversation, method = find_conversation_for_call(call)
        
        result = {
            "call_id": call_id,
            "user": call.get("user", {}).get("name"),
            "created_at": call.get("created_at"),
            "duration": call.get("duration"),
            "status": call.get("status"),
            "disposition": call.get("disposition"),
            "recordings_count": call.get("recordings_count"),
            "has_conversation": conversation is not None,
            "match_method": method
        }
        
        if conversation:
            result["conversation"] = {
                "id": conversation.get("id"),
                "platform": conversation.get("platform", {}).get("name") if isinstance(conversation.get("platform"), dict) else conversation.get("platform"),
                "started_recording_at": conversation.get("started_recording_at"),
                "duration": conversation.get("duration")
            }
            print(f"  ✅ Conversation found via {method}")
        else:
            print(f"  ❌ No conversation found")
        
        results.append(result)
        time.sleep(0.5)
    
    # Generate summary
    print("\n" + "="*80)
    print("SUMMARY REPORT")
    print("="*80)
    
    total_analyzed = len(results)
    calls_with_conversations = sum(1 for r in results if r["has_conversation"])
    calls_without_conversations = total_analyzed - calls_with_conversations
    
    print(f"\nCalls with Recordings Analyzed: {total_analyzed}")
    print(f"Successfully linked to Conversations: {calls_with_conversations} ({calls_with_conversations/total_analyzed:.1%})" if total_analyzed > 0 else "")
    print(f"No Conversation found: {calls_without_conversations} ({calls_without_conversations/total_analyzed:.1%})" if total_analyzed > 0 else "")
    
    # Match method breakdown
    method_counts = {}
    for r in results:
        if r["has_conversation"]:
            method = r["match_method"]
            method_counts[method] = method_counts.get(method, 0) + 1
    
    if method_counts:
        print("\nLinkage Methods Used:")
        for method, count in method_counts.items():
            print(f"  {method}: {count}")
    
    # Save results
    output_file = "/home/chris/Desktop/RevPal/Agents/calls_to_conversations_results.json"
    with open(output_file, "w") as f:
        json.dump({
            "analysis_timestamp": datetime.now(timezone.utc).isoformat(),
            "summary": {
                "total_calls_7_days": total_calls,
                "calls_with_recordings_7_days": len(calls_with_recordings),
                "calls_analyzed": total_analyzed,
                "calls_with_conversations": calls_with_conversations,
                "linkage_rate": calls_with_conversations / total_analyzed if total_analyzed > 0 else 0
            },
            "detailed_results": results
        }, f, indent=2)
    
    print(f"\nDetailed results saved to: {output_file}")
    
    # Key insights
    print("\n" + "="*80)
    print("KEY INSIGHTS")
    print("="*80)
    
    if len(calls_with_recordings) == 0:
        print("\n⚠️  CRITICAL: No calls with recordings found in the last 7 days")
        print("   This suggests:")
        print("   - Recording might not be enabled for calls")
        print("   - Recordings might be stored elsewhere")
        print("   - Permission issues accessing recordings")
    elif calls_with_conversations == total_analyzed:
        print("\n✅ EXCELLENT: All calls with recordings have linked conversations!")
    elif calls_with_conversations > total_analyzed * 0.7:
        print(f"\n✅ GOOD: {calls_with_conversations/total_analyzed:.0%} of calls have linked conversations")
    else:
        print(f"\n⚠️  WARNING: Only {calls_with_conversations/total_analyzed:.0%} of calls have linked conversations")
        print("   Possible reasons:")
        print("   - Conversations may be created asynchronously")
        print("   - Some recordings may not generate conversations")
        print("   - Data sync issues between systems")
    
    return results

if __name__ == "__main__":
    try:
        results = analyze_calls_to_conversations()
    except Exception as e:
        print(f"\nError during analysis: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)