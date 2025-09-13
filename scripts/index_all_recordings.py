#!/usr/bin/env python3
"""
Index ALL call recordings from Salesloft API
Optimized for large-scale retrieval (6000+ recordings)
"""

import os
import sys
import json
import requests
from datetime import datetime, timedelta, timezone
from pathlib import Path
import csv
import time
from typing import Dict, List, Optional, Any
import re

# Configuration
BASE_URL = "https://api.salesloft.com/v2"
TOKEN = os.getenv("SALESLOFT_TOKEN")
if not TOKEN:
    print("Error: SALESLOFT_TOKEN environment variable not set")
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json"
}

OUTPUT_DIR = Path("/home/chris/Desktop/RevPal/Agents/iq_sdr_recordings")
RATE_LIMIT_DELAY = 0.05  # 50ms between API calls (faster)

def api_request(endpoint: str, params: Optional[Dict] = None) -> Dict[str, Any]:
    """Make API request with retry logic"""
    url = f"{BASE_URL}{endpoint}" if not endpoint.startswith("http") else endpoint
    
    for attempt in range(3):
        try:
            response = requests.get(url, headers=HEADERS, params=params, timeout=30)
            
            if response.status_code == 429:
                retry_after = int(response.headers.get("Retry-After", 2))
                print(f"  Rate limited, waiting {retry_after}s...")
                time.sleep(retry_after)
                continue
                
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            if attempt == 2:
                print(f"  API Error after 3 attempts: {e}")
                return {"error": str(e)}
            time.sleep(1)
    
    return {"error": "Failed after 3 attempts"}

def extract_recording_id(url: str) -> str:
    """Extract UUID from recording URL"""
    uuid_pattern = r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
    match = re.search(uuid_pattern, url)
    return match.group() if match else "unknown"

def index_all_recordings(days_back: int = 365) -> List[Dict]:
    """Index all recordings efficiently using parallel call fetching"""
    recordings = []
    stats = {
        "total_calls": 0,
        "calls_with_recordings": 0,
        "total_recordings": 0,
        "api_calls": 0,
        "start_time": datetime.now()
    }
    
    # Calculate date range
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=days_back)
    
    print(f"Indexing recordings from {start_date.date()} to {end_date.date()}")
    print("=" * 60)
    
    # First, get all calls in date range (more efficient than per-user)
    print("\nPhase 1: Fetching all calls with recordings...")
    print("This will take several minutes for 6000+ recordings\n")
    
    page = 1
    max_pages = 1000  # Safety limit
    
    while page <= max_pages:
        # Fetch calls in bulk
        params = {
            "created_at[gte]": start_date.isoformat(),
            "created_at[lte]": end_date.isoformat(),
            "per_page": 100,  # Maximum allowed
            "page": page,
            "sort": "-created_at"
        }
        
        print(f"Fetching page {page}...", end="")
        calls_response = api_request("/activities/calls", params)
        stats["api_calls"] += 1
        
        if "error" in calls_response:
            print(f" Error: {calls_response['error']}")
            break
            
        calls = calls_response.get("data", [])
        
        if not calls:
            print(" No more calls found")
            break
        
        print(f" {len(calls)} calls", end="")
        
        # Process calls in this batch
        recordings_in_batch = 0
        for call in calls:
            stats["total_calls"] += 1
            
            # Quick check if recordings exist
            call_id = call.get("id")
            if not call_id:
                continue
            
            # Get detailed call info only if needed
            detail_response = api_request(f"/activities/calls/{call_id}")
            stats["api_calls"] += 1
            
            if "data" not in detail_response:
                continue
            
            call_detail = detail_response["data"]
            call_recordings = call_detail.get("recordings", [])
            
            if call_recordings:
                stats["calls_with_recordings"] += 1
                
                for rec in call_recordings:
                    rec_url = rec.get("url")
                    if rec_url:
                        stats["total_recordings"] += 1
                        recordings_in_batch += 1
                        
                        # Extract all useful metadata
                        recording_entry = {
                            "recording_id": extract_recording_id(rec_url),
                            "recording_url": rec_url,
                            "call_id": call_id,
                            "call_date": call.get("created_at", "")[:10],
                            "call_time": call.get("created_at", "")[11:19],
                            "user_name": call.get("user", {}).get("name", "Unknown") if call.get("user") else "Unknown",
                            "user_id": call.get("user", {}).get("id") if call.get("user") else None,
                            "duration": call.get("duration"),
                            "disposition": call.get("disposition"),
                            "to": call.get("to"),
                            "called_person": call.get("called_person", {}).get("name") if call.get("called_person") else None,
                            "company": call.get("called_person", {}).get("company", {}).get("name") if call.get("called_person") and call.get("called_person", {}).get("company") else None,
                            "recording_status": rec.get("status", "unknown")
                        }
                        recordings.append(recording_entry)
            
            # Small delay to avoid rate limits
            if stats["api_calls"] % 50 == 0:
                time.sleep(0.5)
        
        print(f" -> {recordings_in_batch} recordings found (Total: {len(recordings)})")
        
        # Progress update
        if page % 10 == 0:
            elapsed = (datetime.now() - stats["start_time"]).total_seconds()
            rate = stats["api_calls"] / elapsed if elapsed > 0 else 0
            print(f"\n  Progress: {stats['total_calls']} calls, {len(recordings)} recordings")
            print(f"  API calls: {stats['api_calls']} ({rate:.1f}/sec)")
            print(f"  Time elapsed: {elapsed/60:.1f} minutes\n")
        
        page += 1
        time.sleep(RATE_LIMIT_DELAY)
        
        # Stop if we have enough recordings for testing
        # Remove this limit for production
        # if len(recordings) >= 100:
        #     print("\n[TEST MODE] Stopping at 100 recordings")
        #     break
    
    # Final statistics
    elapsed = (datetime.now() - stats["start_time"]).total_seconds()
    print("\n" + "=" * 60)
    print("INDEXING COMPLETE")
    print("=" * 60)
    print(f"Total calls processed: {stats['total_calls']:,}")
    print(f"Calls with recordings: {stats['calls_with_recordings']:,}")
    print(f"Total recordings found: {stats['total_recordings']:,}")
    print(f"API calls made: {stats['api_calls']:,}")
    print(f"Time elapsed: {elapsed/60:.1f} minutes")
    print(f"Average rate: {stats['api_calls']/elapsed:.1f} API calls/sec")
    
    return recordings

def save_recordings_data(recordings: List[Dict]) -> None:
    """Save recordings in multiple formats for different use cases"""
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # 1. Full CSV with all metadata
    csv_file = OUTPUT_DIR / "all_recordings.csv"
    with open(csv_file, 'w', newline='') as f:
        if recordings:
            writer = csv.DictWriter(f, fieldnames=recordings[0].keys())
            writer.writeheader()
            writer.writerows(recordings)
    print(f"\n✅ Full CSV saved: {csv_file}")
    
    # 2. Simple URL list for batch processing
    url_file = OUTPUT_DIR / "recording_urls.txt"
    with open(url_file, 'w') as f:
        for rec in recordings:
            f.write(f"{rec['recording_url']}\n")
    print(f"✅ URL list saved: {url_file}")
    
    # 3. JSON for programmatic access
    json_file = OUTPUT_DIR / "recordings.json"
    with open(json_file, 'w') as f:
        json.dump(recordings, f, indent=2)
    print(f"✅ JSON data saved: {json_file}")
    
    # 4. Organized by user
    by_user = {}
    for rec in recordings:
        user = rec['user_name']
        if user not in by_user:
            by_user[user] = []
        by_user[user].append(rec)
    
    user_summary_file = OUTPUT_DIR / "recordings_by_user.json"
    with open(user_summary_file, 'w') as f:
        summary = {
            user: {
                "count": len(recs),
                "date_range": f"{min(r['call_date'] for r in recs)} to {max(r['call_date'] for r in recs)}",
                "total_duration": sum(r['duration'] or 0 for r in recs)
            }
            for user, recs in by_user.items()
        }
        json.dump(summary, f, indent=2)
    print(f"✅ User summary saved: {user_summary_file}")
    
    # 5. Statistics file
    stats_file = OUTPUT_DIR / "recording_stats.txt"
    with open(stats_file, 'w') as f:
        f.write("RECORDING STATISTICS\n")
        f.write("=" * 40 + "\n")
        f.write(f"Total recordings: {len(recordings)}\n")
        f.write(f"Unique users: {len(by_user)}\n")
        f.write(f"Date range: {min(r['call_date'] for r in recordings if r['call_date'])} to {max(r['call_date'] for r in recordings if r['call_date'])}\n")
        f.write(f"\nTop 10 users by recording count:\n")
        for user, recs in sorted(by_user.items(), key=lambda x: len(x[1]), reverse=True)[:10]:
            f.write(f"  {user}: {len(recs)} recordings\n")
    print(f"✅ Statistics saved: {stats_file}")

def main():
    print("=" * 60)
    print("SALESLOFT RECORDING INDEXER - FULL SCALE")
    print("=" * 60)
    
    # Authenticate
    me_data = api_request("/me")
    if "data" in me_data:
        print(f"\n✅ Authenticated as: {me_data['data']['name']} ({me_data['data']['email']})")
    else:
        print("❌ Failed to authenticate. Check your SALESLOFT_TOKEN")
        sys.exit(1)
    
    # Ask for confirmation
    print("\n⚠️  This will index ALL recordings from the past year.")
    print("This may take 15-30 minutes for 6000+ recordings.")
    response = input("\nProceed? (yes/no): ")
    
    if response.lower() != 'yes':
        print("Cancelled.")
        sys.exit(0)
    
    # Index all recordings
    recordings = index_all_recordings(days_back=365)
    
    if recordings:
        # Save all data
        save_recordings_data(recordings)
        
        print("\n" + "=" * 60)
        print("✅ INDEXING COMPLETE!")
        print("=" * 60)
        print(f"\nFound {len(recordings)} recordings")
        print(f"\nFiles saved in: {OUTPUT_DIR}")
        print("\nNext step: Use the automation script to download them all")
    else:
        print("\n❌ No recordings found")

if __name__ == "__main__":
    main()