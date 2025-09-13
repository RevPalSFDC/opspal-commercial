#!/usr/bin/env python3
"""
Download all IQ SDR call recordings from the past year
Saves recordings organized by user and date with metadata
"""

import os
import sys
import json
import requests
from datetime import datetime, timedelta, timezone
from pathlib import Path
import time
import re
from typing import Dict, List, Optional, Any, Tuple
import csv

# Configuration
BASE_URL = "https://api.salesloft.com/v2"
TOKEN = os.getenv("SALESLOFT_TOKEN")
if not TOKEN:
    print("Error: SALESLOFT_TOKEN environment variable not set")
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json",
    "User-Agent": "salesloft-recording-downloader/1.0"
}

# Download configuration
OUTPUT_DIR = Path("/home/chris/Desktop/RevPal/Agents/iq_sdr_recordings")
RATE_LIMIT_DELAY = 0.1  # 100ms between API calls
DOWNLOAD_BATCH_SIZE = 10  # Process in batches to show progress
MAX_RETRIES = 3

# Stats tracking
stats = {
    "total_calls": 0,
    "calls_with_recordings": 0,
    "recordings_downloaded": 0,
    "recordings_failed": 0,
    "total_bytes": 0,
    "start_time": None,
    "errors": []
}

def api_request(endpoint: str, params: Optional[Dict] = None) -> Dict[str, Any]:
    """Make API request with retry logic"""
    url = f"{BASE_URL}{endpoint}" if not endpoint.startswith("http") else endpoint
    
    for attempt in range(MAX_RETRIES):
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
            if attempt == MAX_RETRIES - 1:
                return {"error": str(e)}
            time.sleep(2 ** attempt)
    
    return {}

def download_file(url: str, filepath: Path) -> bool:
    """Download a file from URL to filepath"""
    try:
        # Don't re-download if file exists
        if filepath.exists():
            print(f"    Skipping (exists): {filepath.name}")
            return True
        
        # Include authentication headers for protected resources
        response = requests.get(url, headers=HEADERS, stream=True, timeout=60)
        response.raise_for_status()
        
        # Write file in chunks
        chunk_size = 8192
        bytes_downloaded = 0
        
        with open(filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=chunk_size):
                if chunk:
                    f.write(chunk)
                    bytes_downloaded += len(chunk)
        
        stats["total_bytes"] += bytes_downloaded
        print(f"    ✅ Downloaded: {filepath.name} ({bytes_downloaded/1024:.1f} KB)")
        return True
        
    except Exception as e:
        print(f"    ❌ Failed: {e}")
        stats["errors"].append(f"Download failed for {url}: {e}")
        return False

def get_iq_sdr_users() -> List[Dict]:
    """Get all users in the IQ SDRs group"""
    print("\n=== Fetching IQ SDR Users ===")
    
    # First find the group
    result = api_request("/groups", {"per_page": 100})
    groups = result.get("data", [])
    
    iq_group = None
    for group in groups:
        if "iq" in group.get("name", "").lower() and "sdr" in group.get("name", "").lower():
            iq_group = group
            break
    
    if not iq_group:
        print("❌ IQ SDRs group not found")
        return []
    
    print(f"Found group: {iq_group.get('name')} (ID: {iq_group.get('id')})")
    
    # Get users in group
    users = []
    page = 1
    
    while page <= 10:
        params = {
            "group_id": iq_group.get("id"),
            "per_page": 100,
            "page": page
        }
        
        result = api_request("/users", params)
        page_users = result.get("data", [])
        
        if not page_users:
            break
        
        users.extend(page_users)
        page += 1
        time.sleep(RATE_LIMIT_DELAY)
    
    print(f"Found {len(users)} users in group")
    return users

def process_user_recordings(user: Dict, start_date: datetime, end_date: datetime) -> int:
    """Download all recordings for a specific user"""
    user_name = user.get("name", "Unknown")
    user_guid = user.get("guid")
    
    if not user_guid:
        return 0
    
    print(f"\n📞 Processing user: {user_name}")
    
    # Create user directory
    safe_name = re.sub(r'[^\w\s-]', '', user_name).strip()
    user_dir = OUTPUT_DIR / safe_name
    user_dir.mkdir(parents=True, exist_ok=True)
    
    # Track user stats
    user_recordings = 0
    page = 1
    
    while True:
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
        
        print(f"  Page {page}: {len(calls)} calls")
        
        for call in calls:
            stats["total_calls"] += 1
            
            recordings = call.get("recordings", [])
            if not recordings:
                continue
            
            stats["calls_with_recordings"] += 1
            
            # Process each recording
            for rec_idx, recording in enumerate(recordings):
                rec_url = recording.get("url")
                if not rec_url:
                    continue
                
                # Extract recording ID from URL
                uuid_pattern = r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
                match = re.search(uuid_pattern, rec_url)
                rec_id = match.group() if match else f"unknown_{call.get('id')}_{rec_idx}"
                
                # Create filename with metadata
                call_date = call.get("created_at", "").split("T")[0]
                call_id = call.get("id")
                filename = f"{call_date}_{call_id}_{rec_id}.mp3"
                filepath = user_dir / filename
                
                # Download the recording
                print(f"\n  Call {call_id} - Recording {rec_idx + 1}")
                if download_file(rec_url, filepath):
                    stats["recordings_downloaded"] += 1
                    user_recordings += 1
                    
                    # Save metadata
                    metadata = {
                        "call_id": call_id,
                        "recording_id": rec_id,
                        "user": user_name,
                        "user_guid": user_guid,
                        "created_at": call.get("created_at"),
                        "duration": call.get("duration"),
                        "to": call.get("to"),
                        "from": call.get("from"),
                        "disposition": call.get("disposition"),
                        "status": call.get("status"),
                        "recording_url": rec_url,
                        "download_time": datetime.now(timezone.utc).isoformat()
                    }
                    
                    metadata_file = filepath.with_suffix(".json")
                    with open(metadata_file, "w") as f:
                        json.dump(metadata, f, indent=2)
                else:
                    stats["recordings_failed"] += 1
                
                # Rate limiting
                time.sleep(RATE_LIMIT_DELAY)
                
                # Progress update every 10 recordings
                if stats["recordings_downloaded"] % 10 == 0:
                    elapsed = (datetime.now() - stats["start_time"]).total_seconds()
                    rate = stats["recordings_downloaded"] / elapsed if elapsed > 0 else 0
                    print(f"\n📊 Progress: {stats['recordings_downloaded']} downloaded ({rate:.1f}/sec)")
        
        page += 1
        
        # Stop after 20 pages per user (2000 calls) to avoid infinite loops
        if page > 20:
            break
    
    print(f"  ✅ {user_name}: {user_recordings} recordings downloaded")
    return user_recordings

def generate_summary_report():
    """Generate a summary report of the download"""
    elapsed = (datetime.now() - stats["start_time"]).total_seconds()
    
    report = {
        "download_timestamp": datetime.now(timezone.utc).isoformat(),
        "duration_seconds": elapsed,
        "duration_formatted": f"{elapsed/60:.1f} minutes",
        "statistics": {
            "total_calls_processed": stats["total_calls"],
            "calls_with_recordings": stats["calls_with_recordings"],
            "recordings_downloaded": stats["recordings_downloaded"],
            "recordings_failed": stats["recordings_failed"],
            "total_size_mb": stats["total_bytes"] / (1024 * 1024),
            "average_size_kb": (stats["total_bytes"] / stats["recordings_downloaded"] / 1024) if stats["recordings_downloaded"] > 0 else 0
        },
        "errors": stats["errors"][-20:]  # Last 20 errors
    }
    
    report_file = OUTPUT_DIR / "download_report.json"
    with open(report_file, "w") as f:
        json.dump(report, f, indent=2)
    
    # Also create a CSV index of all recordings
    csv_file = OUTPUT_DIR / "recordings_index.csv"
    with open(csv_file, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["User", "Call ID", "Recording ID", "Date", "Duration", "To", "From", "File"])
        
        # Scan all downloaded files
        for user_dir in OUTPUT_DIR.iterdir():
            if user_dir.is_dir() and user_dir.name != "reports":
                for json_file in user_dir.glob("*.json"):
                    with open(json_file) as jf:
                        metadata = json.load(jf)
                        writer.writerow([
                            metadata.get("user"),
                            metadata.get("call_id"),
                            metadata.get("recording_id"),
                            metadata.get("created_at"),
                            metadata.get("duration"),
                            metadata.get("to"),
                            metadata.get("from"),
                            json_file.with_suffix(".mp3").name
                        ])
    
    return report

def main():
    print("\n" + "="*80)
    print("IQ SDR RECORDING DOWNLOAD")
    print("="*80)
    
    stats["start_time"] = datetime.now()
    
    # Setup output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"\nOutput directory: {OUTPUT_DIR}")
    
    # Date range (past year)
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=365)
    print(f"Date range: {start_date.date()} to {end_date.date()}")
    
    # Get IQ SDR users
    users = get_iq_sdr_users()
    
    if not users:
        print("\n❌ No users found")
        return
    
    print(f"\n🎯 Starting download for {len(users)} users...")
    print("This may take 30-60 minutes. Press Ctrl+C to stop.\n")
    
    try:
        # Process each user
        for idx, user in enumerate(users, 1):
            print(f"\n{'='*60}")
            print(f"User {idx}/{len(users)}")
            print(f"{'='*60}")
            
            process_user_recordings(user, start_date, end_date)
            
            # Brief pause between users
            time.sleep(1)
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Download interrupted by user")
    except Exception as e:
        print(f"\n\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    
    # Generate summary report
    print("\n" + "="*80)
    print("DOWNLOAD COMPLETE")
    print("="*80)
    
    report = generate_summary_report()
    
    print(f"\n📊 Final Statistics:")
    print(f"  Duration: {report['duration_formatted']}")
    print(f"  Calls processed: {report['statistics']['total_calls_processed']:,}")
    print(f"  Recordings downloaded: {report['statistics']['recordings_downloaded']:,}")
    print(f"  Failed downloads: {report['statistics']['recordings_failed']}")
    print(f"  Total size: {report['statistics']['total_size_mb']:.1f} MB")
    
    if report['statistics']['recordings_downloaded'] > 0:
        print(f"  Average size: {report['statistics']['average_size_kb']:.1f} KB")
    
    print(f"\n📁 Files saved to: {OUTPUT_DIR}")
    print(f"📄 Report saved to: {OUTPUT_DIR}/download_report.json")
    print(f"📊 Index saved to: {OUTPUT_DIR}/recordings_index.csv")

if __name__ == "__main__":
    main()