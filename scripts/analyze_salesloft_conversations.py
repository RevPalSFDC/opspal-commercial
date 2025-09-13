#!/usr/bin/env python3
"""
Analyze Salesloft Conversations and match them with Call activities
This script fetches recent conversations with recordings and attempts to match them
with corresponding Call activities using the time window approach.
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
    "User-Agent": "salesloft-conversation-analyzer/1.0"
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

def fetch_recent_conversations_with_recordings(limit: int = 10) -> List[Dict]:
    """Fetch recent conversations that have recordings"""
    print(f"\n=== Fetching {limit} recent conversations with recordings ===")
    
    conversations = []
    page = 1
    per_page = 25
    
    while len(conversations) < limit:
        params = {
            "page": page,
            "per_page": per_page,
            "sort": "started_recording_at",
            "sort_direction": "desc"
        }
        
        result = api_request("/conversations", params)
        data = result.get("data", [])
        
        if not data:
            break
            
        for conv in data:
            # Check if conversation has a recording
            conv_id = conv.get("id")
            if conv_id:
                # Try to fetch recording details
                try:
                    recording_result = api_request(f"/conversations/{conv_id}/recording")
                    if recording_result.get("data", {}).get("url"):
                        conv["has_recording"] = True
                        conversations.append(conv)
                        print(f"  Found conversation {conv_id} with recording")
                        
                        if len(conversations) >= limit:
                            break
                except:
                    conv["has_recording"] = False
                    
        page += 1
        if page > 5:  # Limit to 5 pages to avoid excessive API calls
            break
    
    return conversations[:limit]

def parse_timestamp(ts: Any) -> Optional[datetime]:
    """Parse various timestamp formats"""
    if not ts:
        return None
        
    if isinstance(ts, str):
        try:
            # Try ISO format
            if "T" in ts:
                return datetime.fromisoformat(ts.replace("Z", "+00:00"))
            # Try Unix timestamp as string
            return datetime.fromtimestamp(float(ts), tz=timezone.utc)
        except:
            return None
    elif isinstance(ts, (int, float)):
        try:
            return datetime.fromtimestamp(float(ts), tz=timezone.utc)
        except:
            return None
    return None

def find_matching_calls(conversation: Dict, window_minutes: int = 5) -> List[Dict]:
    """Find Call activities that match the conversation based on time window"""
    user_guid = conversation.get("user_guid") or conversation.get("owner", {}).get("guid")
    started_at = parse_timestamp(conversation.get("started_recording_at"))
    
    if not user_guid or not started_at:
        print(f"  Missing user_guid or started_recording_at for conversation {conversation.get('id')}")
        return []
    
    # Create time window
    window_start = started_at - timedelta(minutes=window_minutes)
    window_end = started_at + timedelta(minutes=window_minutes)
    
    # Query calls within the time window
    params = {
        "user_guid": user_guid,
        "updated_at[gte]": window_start.isoformat(),
        "updated_at[lte]": window_end.isoformat(),
        "per_page": 100
    }
    
    print(f"  Searching for calls by user {user_guid} between {window_start.isoformat()} and {window_end.isoformat()}")
    
    result = api_request("/activities/calls", params)
    calls = result.get("data", [])
    
    # Filter and score matches based on duration similarity
    conv_duration = conversation.get("duration", 0)
    matched_calls = []
    
    for call in calls:
        call_duration = call.get("duration", 0)
        if conv_duration > 0 and call_duration > 0:
            # Calculate duration similarity (0-1, where 1 is perfect match)
            duration_diff = abs(conv_duration - call_duration)
            similarity = max(0, 1 - (duration_diff / max(conv_duration, call_duration)))
            call["duration_similarity"] = similarity
            
            # Consider it a match if duration is within 20% or 30 seconds
            if similarity > 0.8 or duration_diff < 30:
                matched_calls.append(call)
        else:
            # If duration info is missing, include based on time window alone
            matched_calls.append(call)
    
    # Sort by duration similarity if available
    matched_calls.sort(key=lambda x: x.get("duration_similarity", 0), reverse=True)
    
    return matched_calls

def fetch_call_data_records(call_ids: List[str], window_start: datetime, window_end: datetime) -> List[Dict]:
    """Fetch CDR records for disambiguation"""
    params = {
        "created_at[gte]": window_start.isoformat(),
        "created_at[lte]": window_end.isoformat(),
        "per_page": 100
    }
    
    result = api_request("/call_data_records", params)
    cdrs = result.get("data", [])
    
    # Filter CDRs that might match our calls
    relevant_cdrs = []
    for cdr in cdrs:
        # CDR might reference the call directly or we match by time/phone
        if cdr.get("call_id") in call_ids:
            relevant_cdrs.append(cdr)
    
    return relevant_cdrs

def analyze_conversation_linkage():
    """Main analysis function"""
    print("\n" + "="*80)
    print("SALESLOFT CONVERSATION-CALL LINKAGE ANALYSIS")
    print("="*80)
    
    # Fetch recent conversations with recordings
    conversations = fetch_recent_conversations_with_recordings(10)
    
    if not conversations:
        print("No conversations with recordings found")
        return
    
    print(f"\nFound {len(conversations)} conversations with recordings")
    
    # Analyze each conversation
    results = []
    
    for conv in conversations:
        conv_id = conv.get("id")
        platform = conv.get("platform", {}).get("name") if isinstance(conv.get("platform"), dict) else conv.get("platform")
        
        print(f"\n--- Analyzing Conversation {conv_id} ---")
        print(f"  Platform: {platform}")
        print(f"  Started Recording: {conv.get('started_recording_at')}")
        print(f"  Duration: {conv.get('duration')} seconds")
        
        # Find matching calls
        matching_calls = find_matching_calls(conv)
        
        result = {
            "conversation_id": conv_id,
            "platform": platform,
            "started_recording_at": conv.get("started_recording_at"),
            "duration": conv.get("duration"),
            "user_guid": conv.get("user_guid") or conv.get("owner", {}).get("guid"),
            "matching_calls_count": len(matching_calls),
            "matching_calls": []
        }
        
        if matching_calls:
            print(f"  Found {len(matching_calls)} potential matching call(s)")
            
            for idx, call in enumerate(matching_calls[:3], 1):  # Show top 3 matches
                print(f"\n  Match #{idx}:")
                print(f"    Call ID: {call.get('id')}")
                print(f"    Status: {call.get('status')}")
                print(f"    Duration: {call.get('duration')} seconds")
                print(f"    Similarity: {call.get('duration_similarity', 'N/A'):.2%}" if 'duration_similarity' in call else "")
                print(f"    To: {call.get('to')}")
                print(f"    From: {call.get('from')}")
                print(f"    Disposition: {call.get('disposition')}")
                
                result["matching_calls"].append({
                    "call_id": call.get("id"),
                    "status": call.get("status"),
                    "duration": call.get("duration"),
                    "similarity": call.get("duration_similarity"),
                    "to": call.get("to"),
                    "from": call.get("from")
                })
        else:
            print("  No matching calls found in time window")
        
        results.append(result)
        
        # Add a small delay to avoid rate limiting
        time.sleep(0.5)
    
    # Generate summary report
    print("\n" + "="*80)
    print("SUMMARY REPORT")
    print("="*80)
    
    total_conversations = len(results)
    conversations_with_matches = sum(1 for r in results if r["matching_calls_count"] > 0)
    conversations_without_matches = total_conversations - conversations_with_matches
    
    print(f"\nTotal Conversations Analyzed: {total_conversations}")
    print(f"Conversations with Call Matches: {conversations_with_matches} ({conversations_with_matches/total_conversations:.1%})")
    print(f"Conversations without Matches: {conversations_without_matches} ({conversations_without_matches/total_conversations:.1%})")
    
    # Platform breakdown
    platform_counts = {}
    for r in results:
        platform = r.get("platform", "unknown")
        platform_counts[platform] = platform_counts.get(platform, 0) + 1
    
    print("\nConversations by Platform:")
    for platform, count in platform_counts.items():
        print(f"  {platform}: {count}")
    
    # Save detailed results to JSON
    output_file = "/home/chris/Desktop/RevPal/Agents/conversation_analysis_results.json"
    with open(output_file, "w") as f:
        json.dump({
            "analysis_timestamp": datetime.now(timezone.utc).isoformat(),
            "summary": {
                "total_conversations": total_conversations,
                "conversations_with_matches": conversations_with_matches,
                "conversations_without_matches": conversations_without_matches,
                "match_rate": conversations_with_matches / total_conversations if total_conversations > 0 else 0
            },
            "platform_breakdown": platform_counts,
            "detailed_results": results
        }, f, indent=2)
    
    print(f"\nDetailed results saved to: {output_file}")
    
    # Show specific insights
    print("\n" + "="*80)
    print("KEY INSIGHTS")
    print("="*80)
    
    if conversations_with_matches == total_conversations:
        print("✅ EXCELLENT: All conversations have matching Call activities!")
    elif conversations_with_matches > total_conversations * 0.8:
        print("✅ GOOD: Most conversations ({:.0%}) have matching Call activities".format(
            conversations_with_matches/total_conversations))
    else:
        print("⚠️  WARNING: Only {:.0%} of conversations have matching Call activities".format(
            conversations_with_matches/total_conversations if total_conversations > 0 else 0))
        print("   This may indicate:")
        print("   - Calls not being logged properly")
        print("   - Time synchronization issues")
        print("   - Different user associations")
    
    return results

if __name__ == "__main__":
    try:
        results = analyze_conversation_linkage()
    except Exception as e:
        print(f"\nError during analysis: {e}")
        sys.exit(1)