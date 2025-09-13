#!/usr/bin/env python3
"""
Index all call recordings from Salesloft API
Creates a CSV file and HTML page with clickable links for browser download
"""

import os
import sys
import json
import requests
from datetime import datetime, timedelta, timezone
from pathlib import Path
import csv
import re
from typing import Dict, List, Optional, Any

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
RATE_LIMIT_DELAY = 0.1  # 100ms between API calls

# Stats
stats = {
    "total_calls": 0,
    "calls_with_recordings": 0,
    "total_recordings": 0,
    "users_processed": 0
}

def api_request(endpoint: str, params: Optional[Dict] = None) -> Dict[str, Any]:
    """Make API request with retry logic"""
    url = f"{BASE_URL}{endpoint}" if not endpoint.startswith("http") else endpoint
    
    try:
        response = requests.get(url, headers=HEADERS, params=params, timeout=30)
        
        if response.status_code == 429:
            retry_after = int(response.headers.get("Retry-After", 2))
            print(f"Rate limited, waiting {retry_after} seconds...")
            import time
            time.sleep(retry_after)
            return api_request(endpoint, params)
            
        response.raise_for_status()
        return response.json()
        
    except requests.exceptions.RequestException as e:
        print(f"API Error: {e}")
        return {"error": str(e)}

def extract_recording_id(url: str) -> str:
    """Extract UUID from recording URL"""
    uuid_pattern = r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
    match = re.search(uuid_pattern, url)
    return match.group() if match else "unknown"

def index_recordings(days_back: int = 365) -> List[Dict]:
    """Index all call recordings from the past N days"""
    recordings = []
    
    # Calculate date range
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=days_back)
    
    print(f"Indexing recordings from {start_date.date()} to {end_date.date()}")
    
    # Get all users
    print("\nFetching users...")
    users_response = api_request("/users", {"per_page": 100})
    users = users_response.get("data", [])
    print(f"Found {len(users)} users")
    
    # Process each user
    for user_idx, user in enumerate(users, 1):
        user_name = user.get("name", "Unknown")
        user_id = user.get("id")
        
        if not user_id:
            continue
        
        print(f"\n[{user_idx}/{len(users)}] Processing: {user_name}")
        stats["users_processed"] += 1
        
        # Get calls for this user
        page = 1
        user_recordings = 0
        
        while page <= 10:  # Limit pages per user
            params = {
                "user_id": user_id,
                "created_at[gte]": start_date.isoformat(),
                "created_at[lte]": end_date.isoformat(),
                "per_page": 100,
                "page": page,
                "sort": "-created_at"
            }
            
            calls_response = api_request("/activities/calls", params)
            calls = calls_response.get("data", [])
            
            if not calls:
                break
                
            print(f"  Page {page}: {len(calls)} calls", end="")
            
            for call in calls:
                stats["total_calls"] += 1
                
                # Get call details with recordings
                call_id = call.get("id")
                detail_response = api_request(f"/activities/calls/{call_id}")
                
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
                            user_recordings += 1
                            
                            # Create recording entry
                            recording_entry = {
                                "user_name": user_name,
                                "user_id": user_id,
                                "call_id": call_id,
                                "recording_id": extract_recording_id(rec_url),
                                "recording_url": rec_url,
                                "recording_status": rec.get("status", "unknown"),
                                "call_date": call.get("created_at", ""),
                                "call_duration": call.get("duration"),
                                "call_to": call.get("to"),
                                "call_disposition": call.get("disposition"),
                                "called_person": call.get("called_person", {}).get("name") if call.get("called_person") else None,
                                "called_company": call.get("called_person", {}).get("company", {}).get("name") if call.get("called_person") and call.get("called_person", {}).get("company") else None
                            }
                            recordings.append(recording_entry)
            
            print(f" -> {user_recordings} recordings found")
            page += 1
            
            import time
            time.sleep(RATE_LIMIT_DELAY)
        
        if user_recordings > 0:
            print(f"  Total: {user_recordings} recordings")
    
    return recordings

def create_download_html(recordings: List[Dict]) -> None:
    """Create an HTML page with download links and JavaScript helper"""
    html_file = OUTPUT_DIR / "download_recordings.html"
    
    html_content = """<!DOCTYPE html>
<html>
<head>
    <title>Salesloft Call Recordings Download</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 20px;
            background: #f5f5f5;
        }
        h1 { 
            color: #333; 
            border-bottom: 2px solid #007bff;
            padding-bottom: 10px;
        }
        .stats {
            background: white;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .controls {
            background: white;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        button {
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            margin: 5px;
            font-size: 14px;
        }
        button:hover { background: #0056b3; }
        button:disabled { 
            background: #ccc; 
            cursor: not-allowed;
        }
        table { 
            width: 100%; 
            border-collapse: collapse; 
            background: white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        th { 
            background: #007bff; 
            color: white; 
            padding: 12px; 
            text-align: left;
            position: sticky;
            top: 0;
            z-index: 10;
        }
        td { 
            padding: 10px; 
            border-bottom: 1px solid #ddd; 
        }
        tr:hover { background: #f0f8ff; }
        a { 
            color: #007bff; 
            text-decoration: none; 
        }
        a:hover { text-decoration: underline; }
        .download-status {
            display: inline-block;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            margin-right: 5px;
        }
        .pending { background: #ffc107; }
        .downloading { background: #17a2b8; }
        .completed { background: #28a745; }
        .failed { background: #dc3545; }
        #progress {
            margin: 10px 0;
            font-weight: bold;
        }
        .filter-input {
            padding: 8px;
            margin: 5px;
            border: 1px solid #ddd;
            border-radius: 4px;
            width: 200px;
        }
    </style>
</head>
<body>
    <h1>Salesloft Call Recordings Index</h1>
    
    <div class="stats">
        <h2>Statistics</h2>
        <p>Total Recordings: <strong>""" + str(len(recordings)) + """</strong></p>
        <p>Users with Recordings: <strong>""" + str(len(set(r["user_name"] for r in recordings))) + """</strong></p>
        <p>Date Range: <strong>""" + (min(r["call_date"] for r in recordings if r["call_date"])[:10] if recordings else "N/A") + """ to """ + (max(r["call_date"] for r in recordings if r["call_date"])[:10] if recordings else "N/A") + """</strong></p>
    </div>
    
    <div class="controls">
        <h2>Download Controls</h2>
        <p style="color: #dc3545;"><strong>⚠️ Important:</strong> You must be logged into Salesloft in this browser for downloads to work.</p>
        <p>The browser will open each recording in a new tab. You may need to allow popups for this site.</p>
        
        <button onclick="downloadBatch(10)">Download First 10</button>
        <button onclick="downloadBatch(50)">Download First 50</button>
        <button onclick="downloadAll()">Download All (Batch)</button>
        <button onclick="stopDownload()" style="background: #dc3545;">Stop Download</button>
        
        <div id="progress"></div>
        
        <div style="margin-top: 15px;">
            <input type="text" id="userFilter" class="filter-input" placeholder="Filter by user..." onkeyup="filterTable()">
            <input type="text" id="companyFilter" class="filter-input" placeholder="Filter by company..." onkeyup="filterTable()">
            <input type="date" id="dateFilter" class="filter-input" onchange="filterTable()">
        </div>
    </div>
    
    <table id="recordingsTable">
        <thead>
            <tr>
                <th>Status</th>
                <th>Date</th>
                <th>User</th>
                <th>Called Person</th>
                <th>Company</th>
                <th>Duration</th>
                <th>Recording</th>
                <th>Action</th>
            </tr>
        </thead>
        <tbody>
"""
    
    # Add table rows
    for idx, rec in enumerate(recordings):
        call_date = rec["call_date"][:10] if rec["call_date"] else "Unknown"
        duration = f"{rec['call_duration']}s" if rec["call_duration"] else "N/A"
        called_person = rec["called_person"] or "Unknown"
        company = rec["called_company"] or "N/A"
        
        html_content += f"""
            <tr data-index="{idx}">
                <td><span class="download-status pending" id="status-{idx}"></span></td>
                <td>{call_date}</td>
                <td>{rec['user_name']}</td>
                <td>{called_person}</td>
                <td>{company}</td>
                <td>{duration}</td>
                <td><a href="{rec['recording_url']}" target="_blank">Recording {idx + 1}</a></td>
                <td>
                    <button onclick="downloadSingle({idx})">Download</button>
                </td>
            </tr>
"""
    
    html_content += """
        </tbody>
    </table>
    
    <script>
        let downloadQueue = [];
        let isDownloading = false;
        let downloadedCount = 0;
        
        function downloadSingle(index) {
            const link = document.querySelectorAll('a')[index];
            const statusEl = document.getElementById('status-' + index);
            statusEl.className = 'download-status downloading';
            
            window.open(link.href, '_blank');
            
            setTimeout(() => {
                statusEl.className = 'download-status completed';
            }, 2000);
        }
        
        function downloadBatch(count) {
            const links = document.querySelectorAll('tbody a');
            const limit = Math.min(count, links.length);
            
            downloadQueue = [];
            for (let i = 0; i < limit; i++) {
                downloadQueue.push(i);
            }
            
            processQueue();
        }
        
        function downloadAll() {
            const links = document.querySelectorAll('tbody a');
            
            if (links.length > 100) {
                if (!confirm(`This will attempt to download ${links.length} recordings. This may take a while. Continue?`)) {
                    return;
                }
            }
            
            downloadQueue = [];
            for (let i = 0; i < links.length; i++) {
                downloadQueue.push(i);
            }
            
            processQueue();
        }
        
        function processQueue() {
            if (downloadQueue.length === 0) {
                isDownloading = false;
                updateProgress();
                return;
            }
            
            isDownloading = true;
            const batchSize = 5; // Open 5 tabs at a time
            const batch = downloadQueue.splice(0, batchSize);
            
            batch.forEach((index, i) => {
                setTimeout(() => {
                    downloadSingle(index);
                    downloadedCount++;
                    updateProgress();
                }, i * 500); // Stagger by 500ms
            });
            
            // Process next batch after 10 seconds
            setTimeout(() => {
                if (isDownloading) {
                    processQueue();
                }
            }, 10000);
        }
        
        function stopDownload() {
            isDownloading = false;
            downloadQueue = [];
            updateProgress();
        }
        
        function updateProgress() {
            const progressEl = document.getElementById('progress');
            if (isDownloading) {
                progressEl.innerHTML = `Downloading... ${downloadedCount} completed, ${downloadQueue.length} remaining`;
            } else if (downloadedCount > 0) {
                progressEl.innerHTML = `Download complete! ${downloadedCount} recordings processed.`;
            }
        }
        
        function filterTable() {
            const userFilter = document.getElementById('userFilter').value.toLowerCase();
            const companyFilter = document.getElementById('companyFilter').value.toLowerCase();
            const dateFilter = document.getElementById('dateFilter').value;
            
            const rows = document.querySelectorAll('tbody tr');
            
            rows.forEach(row => {
                const user = row.cells[2].textContent.toLowerCase();
                const company = row.cells[4].textContent.toLowerCase();
                const date = row.cells[1].textContent;
                
                const userMatch = !userFilter || user.includes(userFilter);
                const companyMatch = !companyFilter || company.includes(companyFilter);
                const dateMatch = !dateFilter || date === dateFilter;
                
                row.style.display = (userMatch && companyMatch && dateMatch) ? '' : 'none';
            });
        }
    </script>
</body>
</html>
"""
    
    with open(html_file, 'w') as f:
        f.write(html_content)
    
    print(f"\n✅ HTML download page created: {html_file}")
    print(f"   Open this file in your browser while logged into Salesloft")

def save_recordings_csv(recordings: List[Dict]) -> None:
    """Save recordings to CSV file"""
    csv_file = OUTPUT_DIR / "recordings_index.csv"
    
    with open(csv_file, 'w', newline='') as f:
        if recordings:
            writer = csv.DictWriter(f, fieldnames=recordings[0].keys())
            writer.writeheader()
            writer.writerows(recordings)
    
    print(f"✅ CSV index created: {csv_file}")

def save_download_script(recordings: List[Dict]) -> None:
    """Create a shell script for wget/curl downloads (requires cookies)"""
    script_file = OUTPUT_DIR / "download_recordings.sh"
    
    with open(script_file, 'w') as f:
        f.write("#!/bin/bash\n")
        f.write("# Salesloft Recording Download Script\n")
        f.write("# NOTE: You need to export cookies from your browser first!\n")
        f.write("# Use a browser extension to export cookies.txt\n\n")
        
        f.write("if [ ! -f cookies.txt ]; then\n")
        f.write('    echo "Error: cookies.txt not found!"\n')
        f.write('    echo "Please export cookies from your browser while logged into Salesloft"\n')
        f.write('    exit 1\n')
        f.write("fi\n\n")
        
        f.write("mkdir -p recordings\n")
        f.write("TOTAL=" + str(len(recordings)) + "\n")
        f.write("COUNT=0\n\n")
        
        for rec in recordings:
            safe_name = re.sub(r'[^\w\s-]', '', rec["user_name"]).strip()
            filename = f"{rec['call_date'][:10]}_{rec['call_id']}_{rec['recording_id']}.mp3"
            filepath = f"recordings/{safe_name}/{filename}"
            
            f.write(f"# Recording {recordings.index(rec) + 1}/{len(recordings)}\n")
            f.write(f"COUNT=$((COUNT + 1))\n")
            f.write(f'echo "[$COUNT/$TOTAL] Downloading: {filename}"\n')
            f.write(f"mkdir -p 'recordings/{safe_name}'\n")
            f.write(f"wget --load-cookies=cookies.txt '{rec['recording_url']}' -O '{filepath}' || echo 'Failed: {filename}'\n")
            f.write("sleep 2\n\n")
    
    os.chmod(script_file, 0o755)
    print(f"✅ Download script created: {script_file}")

def main():
    print("=" * 80)
    print("SALESLOFT CALL RECORDINGS INDEXER")
    print("=" * 80)
    
    # Get current user info
    me_data = api_request("/me")
    if "data" in me_data:
        print(f"\n✅ Authenticated as: {me_data['data']['name']} ({me_data['data']['email']})")
    else:
        print("❌ Failed to authenticate. Check your SALESLOFT_TOKEN")
        sys.exit(1)
    
    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Index recordings
    print("\nStarting recording index...")
    recordings = index_recordings(days_back=365)
    
    # Print summary
    print("\n" + "=" * 80)
    print("INDEXING COMPLETE")
    print("=" * 80)
    print(f"Total calls processed: {stats['total_calls']}")
    print(f"Calls with recordings: {stats['calls_with_recordings']}")
    print(f"Total recordings found: {stats['total_recordings']}")
    print(f"Users processed: {stats['users_processed']}")
    
    if recordings:
        # Save outputs
        save_recordings_csv(recordings)
        create_download_html(recordings)
        save_download_script(recordings)
        
        print("\n" + "=" * 80)
        print("NEXT STEPS:")
        print("=" * 80)
        print("1. Open the HTML file in your browser:")
        print(f"   file://{OUTPUT_DIR}/download_recordings.html")
        print("\n2. Make sure you're logged into Salesloft in that browser")
        print("\n3. Use the download buttons to batch download recordings")
        print("\nAlternatively, use the shell script with exported cookies:")
        print(f"   cd {OUTPUT_DIR}")
        print("   # Export cookies.txt from browser first")
        print("   ./download_recordings.sh")
    else:
        print("\n❌ No recordings found in the specified date range")

if __name__ == "__main__":
    main()