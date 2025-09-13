#!/usr/bin/env python3
"""
Estimate recording volume and download time for IQ SDR calls from the past year
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
    "User-Agent": "salesloft-recording-estimator/1.0"
}

# API Rate Limits (from Salesloft documentation)
RATE_LIMIT_PER_10_SECONDS = 100  # 100 requests per 10 seconds
RATE_LIMIT_PER_MINUTE = 600      # 600 requests per minute
RATE_LIMIT_PER_HOUR = 36000      # 36,000 requests per hour

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

def find_iq_sdr_group() -> Dict:
    """Find the IQ SDRs group"""
    print("\n=== Searching for IQ SDRs Group ===")
    
    # Search for groups
    params = {
        "per_page": 100,
        "page": 1
    }
    
    result = api_request("/groups", params)
    groups = result.get("data", [])
    
    iq_sdr_group = None
    all_groups = []
    
    for group in groups:
        group_name = group.get("name", "")
        all_groups.append(group_name)
        
        # Look for IQ SDR group (case insensitive)
        if "iq" in group_name.lower() and "sdr" in group_name.lower():
            iq_sdr_group = group
            print(f"✅ Found group: {group_name} (ID: {group.get('id')})")
            break
    
    if not iq_sdr_group:
        print("❌ IQ SDRs group not found")
        print(f"Available groups: {', '.join(all_groups[:10])}")
        if len(all_groups) > 10:
            print(f"  ... and {len(all_groups) - 10} more")
    
    return iq_sdr_group

def get_users_in_group(group_id: int) -> List[Dict]:
    """Get all users in a specific group"""
    print(f"\n=== Fetching Users in Group {group_id} ===")
    
    users = []
    page = 1
    
    while page <= 10:  # Limit pages for safety
        params = {
            "group_id": group_id,
            "per_page": 100,
            "page": page
        }
        
        result = api_request("/users", params)
        page_users = result.get("data", [])
        
        if not page_users:
            break
        
        users.extend(page_users)
        print(f"  Page {page}: Found {len(page_users)} users")
        
        page += 1
        time.sleep(0.3)
    
    print(f"Total users in group: {len(users)}")
    
    # Show user names
    if users:
        print("\nUsers found:")
        for user in users[:10]:
            print(f"  - {user.get('name')} (ID: {user.get('id')}, GUID: {user.get('guid')})")
        if len(users) > 10:
            print(f"  ... and {len(users) - 10} more")
    
    return users

def count_calls_with_recordings_for_users(user_guids: List[str], start_date: datetime, end_date: datetime) -> Tuple[int, List[Dict]]:
    """Count calls with recordings for specific users in date range"""
    print(f"\n=== Counting Calls with Recordings ===")
    print(f"Date range: {start_date.date()} to {end_date.date()}")
    print(f"Users: {len(user_guids)}")
    
    total_calls = 0
    calls_with_recordings = 0
    sample_recordings = []
    
    # Query calls for each user (can't filter by multiple users in one query)
    for idx, user_guid in enumerate(user_guids, 1):
        print(f"\nProcessing user {idx}/{len(user_guids)}...")
        
        page = 1
        user_calls = 0
        user_recordings = 0
        
        while page <= 20:  # Limit pages per user
            params = {
                "user_guid": user_guid,
                "created_at[gte]": start_date.isoformat(),
                "created_at[lte]": end_date.isoformat(),
                "per_page": 100,
                "page": page,
                "sort": "created_at",
                "sort_direction": "desc"
            }
            
            result = api_request("/activities/calls", params)
            calls = result.get("data", [])
            
            if not calls:
                break
            
            for call in calls:
                total_calls += 1
                user_calls += 1
                
                recordings = call.get("recordings", [])
                if recordings:
                    calls_with_recordings += 1
                    user_recordings += 1
                    
                    # Collect sample recording data
                    if len(sample_recordings) < 100:
                        for rec in recordings:
                            sample_recordings.append({
                                "call_id": call.get("id"),
                                "user_guid": user_guid,
                                "duration": call.get("duration"),
                                "created_at": call.get("created_at"),
                                "recording_url": rec.get("url"),
                                "recording_status": rec.get("status")
                            })
            
            page += 1
            
            # Brief pause to avoid rate limiting
            time.sleep(0.1)
        
        print(f"  User {idx}: {user_calls} calls, {user_recordings} with recordings")
    
    return calls_with_recordings, sample_recordings

def estimate_download_metrics(num_recordings: int, avg_duration_seconds: float) -> Dict:
    """Estimate download time and storage requirements"""
    
    # Estimates based on typical audio file sizes
    # Assuming ~1 MB per minute of compressed audio (typical for phone recordings)
    avg_mb_per_minute = 1.0
    avg_duration_minutes = avg_duration_seconds / 60
    avg_file_size_mb = avg_duration_minutes * avg_mb_per_minute
    
    total_size_mb = num_recordings * avg_file_size_mb
    total_size_gb = total_size_mb / 1024
    
    # Download time calculations
    # Each recording requires: 1 API call to get URL + 1 download
    api_calls_needed = num_recordings * 2
    
    # Calculate based on different rate limits
    time_at_10s_limit = (api_calls_needed / RATE_LIMIT_PER_10_SECONDS) * 10  # seconds
    time_at_minute_limit = (api_calls_needed / RATE_LIMIT_PER_MINUTE) * 60  # seconds
    time_at_hour_limit = (api_calls_needed / RATE_LIMIT_PER_HOUR) * 3600  # seconds
    
    # The actual time will be the maximum of these (bottleneck)
    api_time_seconds = max(time_at_10s_limit, time_at_minute_limit, time_at_hour_limit)
    
    # Add download time (assuming 1 MB/s download speed)
    download_time_seconds = total_size_mb
    
    total_time_seconds = api_time_seconds + download_time_seconds
    
    return {
        "num_recordings": num_recordings,
        "avg_duration_seconds": avg_duration_seconds,
        "avg_file_size_mb": avg_file_size_mb,
        "total_size_mb": total_size_mb,
        "total_size_gb": total_size_gb,
        "api_calls_needed": api_calls_needed,
        "api_time_seconds": api_time_seconds,
        "download_time_seconds": download_time_seconds,
        "total_time_seconds": total_time_seconds,
        "total_time_hours": total_time_seconds / 3600
    }

def main():
    print("\n" + "="*80)
    print("IQ SDR RECORDING VOLUME ESTIMATION")
    print("="*80)
    
    # Define date range (past year)
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=365)
    
    print(f"\nAnalysis Period: {start_date.date()} to {end_date.date()}")
    
    # Find IQ SDRs group
    iq_group = find_iq_sdr_group()
    
    if not iq_group:
        # Fall back to searching all users for IQ/SDR in title
        print("\n=== Searching for IQ SDR users by title ===")
        
        params = {
            "per_page": 100,
            "page": 1
        }
        
        result = api_request("/users", params)
        all_users = result.get("data", [])
        
        iq_sdr_users = []
        for user in all_users:
            title = user.get("title", "").lower()
            name = user.get("name", "").lower()
            if ("iq" in title or "iq" in name) and "sdr" in title:
                iq_sdr_users.append(user)
        
        if iq_sdr_users:
            print(f"Found {len(iq_sdr_users)} IQ SDR users by title")
            user_guids = [u.get("guid") for u in iq_sdr_users if u.get("guid")]
        else:
            print("No IQ SDR users found. Using sample of all users...")
            user_guids = [u.get("guid") for u in all_users[:5] if u.get("guid")]
    else:
        # Get users from group
        users = get_users_in_group(iq_group.get("id"))
        user_guids = [u.get("guid") for u in users if u.get("guid")]
    
    if not user_guids:
        print("\n❌ No users to analyze")
        return
    
    # Count calls with recordings
    num_recordings, sample_recordings = count_calls_with_recordings_for_users(
        user_guids[:10],  # Limit to first 10 users for estimation
        start_date,
        end_date
    )
    
    # If we only checked a subset, extrapolate
    if len(user_guids) > 10:
        extrapolation_factor = len(user_guids) / 10
        estimated_total_recordings = int(num_recordings * extrapolation_factor)
        print(f"\n📊 Extrapolating from 10 users to {len(user_guids)} users")
        print(f"  Estimated total recordings: {estimated_total_recordings}")
    else:
        estimated_total_recordings = num_recordings
    
    # Calculate average duration from samples
    if sample_recordings:
        durations = [r["duration"] for r in sample_recordings if r.get("duration")]
        avg_duration = sum(durations) / len(durations) if durations else 180  # Default 3 minutes
    else:
        avg_duration = 180  # Default 3 minutes
    
    # Estimate download metrics
    metrics = estimate_download_metrics(estimated_total_recordings, avg_duration)
    
    # Generate report
    print("\n" + "="*80)
    print("ESTIMATION REPORT")
    print("="*80)
    
    print(f"\n📊 Recording Volume:")
    print(f"  Total recordings: {metrics['num_recordings']:,}")
    print(f"  Average duration: {metrics['avg_duration_seconds']:.0f} seconds ({metrics['avg_duration_seconds']/60:.1f} minutes)")
    print(f"  Average file size: {metrics['avg_file_size_mb']:.1f} MB")
    print(f"  Total storage needed: {metrics['total_size_gb']:.1f} GB")
    
    print(f"\n⏱️  Download Time Estimates:")
    print(f"  API calls needed: {metrics['api_calls_needed']:,}")
    print(f"  API time (rate limited): {metrics['api_time_seconds']/60:.1f} minutes")
    print(f"  File download time (1 MB/s): {metrics['download_time_seconds']/60:.1f} minutes")
    print(f"  Total estimated time: {metrics['total_time_hours']:.1f} hours")
    
    print(f"\n🔄 Rate Limit Impact:")
    print(f"  10-second limit: {RATE_LIMIT_PER_10_SECONDS} requests")
    print(f"  Minute limit: {RATE_LIMIT_PER_MINUTE} requests")
    print(f"  Hour limit: {RATE_LIMIT_PER_HOUR:,} requests")
    print(f"  Bottleneck: {'Hour limit' if metrics['api_calls_needed'] > 1000 else 'Minute limit'}")
    
    print(f"\n💡 Recommendations:")
    if metrics['total_time_hours'] > 24:
        print(f"  ⚠️  This will take over {metrics['total_time_hours']/24:.1f} days to download")
        print(f"  Consider:")
        print(f"    - Filtering by date range (e.g., last 3 months)")
        print(f"    - Filtering by call duration (e.g., > 1 minute)")
        print(f"    - Running downloads in parallel with multiple API keys")
        print(f"    - Using batch export if available")
    else:
        print(f"  ✅ Download can be completed in under a day")
        print(f"  Consider running overnight to avoid disruption")
    
    # Save detailed results
    output_file = "/home/chris/Desktop/RevPal/Agents/iq_sdr_recording_estimate.json"
    with open(output_file, "w") as f:
        json.dump({
            "analysis_timestamp": datetime.now(timezone.utc).isoformat(),
            "date_range": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat()
            },
            "users_analyzed": len(user_guids),
            "metrics": metrics,
            "sample_recordings": sample_recordings[:20]
        }, f, indent=2)
    
    print(f"\nDetailed results saved to: {output_file}")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)