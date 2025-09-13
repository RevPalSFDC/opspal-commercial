#!/usr/bin/env python3
"""
Extract actual media URLs from Salesloft recording pages and download directly
This bypasses the need for browser extensions
"""

import os
import sys
import time
import json
import requests
from pathlib import Path
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import re

class SmartRecordingDownloader:
    def __init__(self, download_dir=None):
        self.download_dir = download_dir or "/home/chris/Desktop/RevPal/Agents/iq_sdr_recordings/downloads"
        Path(self.download_dir).mkdir(parents=True, exist_ok=True)
        self.driver = None
        self.session_cookies = None
        self.media_urls = []
        self.progress_file = Path(self.download_dir) / "extraction_progress.json"
        
    def setup_chrome(self):
        """Setup Chrome browser"""
        options = webdriver.ChromeOptions()
        options.add_argument("--start-maximized")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        
        print("Starting Chrome...")
        self.driver = webdriver.Chrome(options=options)
        print("Chrome started")
    
    def login_to_salesloft(self):
        """Login to Salesloft"""
        print("\n" + "="*60)
        print("LOGIN REQUIRED")
        print("="*60)
        
        self.driver.get("https://app.salesloft.com")
        print("\nPlease log in to Salesloft in the browser")
        input("Press Enter when logged in...")
        
        # Save cookies for later use
        self.session_cookies = self.driver.get_cookies()
        print("✅ Login successful, cookies saved")
        return True
    
    def extract_media_url(self, recording_url):
        """Extract the actual media file URL from a recording page"""
        try:
            print(f"\nExtracting from: {recording_url.split('/')[-1]}")
            self.driver.get(recording_url)
            time.sleep(3)  # Wait for page load
            
            # Method 1: Check for audio/video elements
            media_url = self.driver.execute_script("""
                var media = document.querySelector('audio, video');
                if (media && media.src) {
                    return media.src;
                }
                // Check for source elements
                var source = document.querySelector('audio source, video source');
                if (source && source.src) {
                    return source.src;
                }
                return null;
            """)
            
            if media_url:
                print(f"  ✅ Found media URL: {media_url[:100]}...")
                return media_url
            
            # Method 2: Check network requests for media files
            # This would require Chrome DevTools Protocol
            print("  ⚠️  No direct media URL found on page")
            
            # Method 3: Check for iframe with media
            iframes = self.driver.find_elements(By.TAG_NAME, "iframe")
            for iframe in iframes:
                self.driver.switch_to.frame(iframe)
                media_url = self.driver.execute_script("""
                    var media = document.querySelector('audio, video');
                    return media ? media.src : null;
                """)
                self.driver.switch_to.default_content()
                
                if media_url:
                    print(f"  ✅ Found media URL in iframe: {media_url[:100]}...")
                    return media_url
            
            return None
            
        except Exception as e:
            print(f"  ❌ Error extracting: {e}")
            return None
    
    def download_media_file(self, media_url, filename):
        """Download a media file using the session cookies"""
        try:
            # Convert cookies to requests format
            cookies = {}
            for cookie in self.session_cookies:
                cookies[cookie['name']] = cookie['value']
            
            # Set headers to mimic browser
            headers = {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'audio/webm,audio/ogg,audio/wav,audio/*;q=0.9',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Referer': 'https://recordings.salesloft.com/'
            }
            
            filepath = Path(self.download_dir) / filename
            
            print(f"  Downloading to: {filename}")
            response = requests.get(media_url, headers=headers, cookies=cookies, stream=True)
            
            if response.status_code == 200:
                total_size = int(response.headers.get('content-length', 0))
                
                with open(filepath, 'wb') as f:
                    downloaded = 0
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            
                            # Progress
                            if total_size > 0:
                                percent = (downloaded / total_size) * 100
                                print(f"    Progress: {percent:.1f}%", end='\r')
                
                print(f"\n  ✅ Downloaded: {downloaded/1024/1024:.1f} MB")
                return True
            else:
                print(f"  ❌ Download failed: HTTP {response.status_code}")
                return False
                
        except Exception as e:
            print(f"  ❌ Download error: {e}")
            return False
    
    def process_batch(self, urls, start_index=0):
        """Process a batch of recording URLs"""
        extracted = []
        
        for i, url in enumerate(urls, start_index):
            print(f"\n[{i+1}/{len(urls)+start_index}] Processing recording")
            
            # Extract media URL
            media_url = self.extract_media_url(url)
            
            if media_url:
                # Generate filename from URL
                recording_id = url.split('/')[-1]
                filename = f"recording_{i+1}_{recording_id}.mp3"
                
                # Store for later download
                extracted.append({
                    'recording_url': url,
                    'media_url': media_url,
                    'filename': filename
                })
                
                # Try immediate download
                self.download_media_file(media_url, filename)
            
            time.sleep(2)  # Be nice to the server
            
            # Save progress every 10 recordings
            if (i + 1) % 10 == 0:
                self.save_extracted_urls(extracted)
        
        return extracted
    
    def save_extracted_urls(self, extracted):
        """Save extracted media URLs for later use"""
        output_file = Path(self.download_dir) / "extracted_media_urls.json"
        
        # Load existing if present
        existing = []
        if output_file.exists():
            with open(output_file, 'r') as f:
                existing = json.load(f)
        
        # Append new
        existing.extend(extracted)
        
        # Save
        with open(output_file, 'w') as f:
            json.dump(existing, f, indent=2)
        
        print(f"\n💾 Saved {len(extracted)} extracted URLs to {output_file}")
    
    def run(self, urls_file, batch_size=20):
        """Main execution"""
        print("="*60)
        print("SMART SALESLOFT RECORDING EXTRACTOR & DOWNLOADER")
        print("="*60)
        
        # Load URLs
        with open(urls_file, 'r') as f:
            urls = [line.strip() for line in f if line.strip()]
        
        print(f"\n📊 Loaded {len(urls)} recording URLs")
        
        try:
            # Setup browser
            self.setup_chrome()
            
            # Login
            if not self.login_to_salesloft():
                return
            
            # Process in batches
            all_extracted = []
            
            for batch_num, i in enumerate(range(0, len(urls), batch_size), 1):
                batch = urls[i:i + batch_size]
                
                print(f"\n{'='*60}")
                print(f"BATCH {batch_num} - Processing {len(batch)} recordings")
                print(f"{'='*60}")
                
                extracted = self.process_batch(batch, start_index=i)
                all_extracted.extend(extracted)
                
                # Save all extracted URLs
                self.save_extracted_urls(extracted)
                
                # Pause between batches
                if i + batch_size < len(urls):
                    print(f"\nBatch complete. Pausing for 10 seconds...")
                    time.sleep(10)
                    
                    if batch_num % 3 == 0:
                        response = input("\nContinue? (yes/no): ")
                        if response.lower() != 'yes':
                            break
            
            # Final summary
            print("\n" + "="*60)
            print("EXTRACTION COMPLETE")
            print("="*60)
            print(f"Total recordings processed: {len(all_extracted)}")
            print(f"Media URLs extracted: {sum(1 for e in all_extracted if e.get('media_url'))}")
            
            # Create a wget script for any that failed to download
            self.create_wget_script(all_extracted)
            
        finally:
            if self.driver:
                print("\nClosing browser...")
                self.driver.quit()
    
    def create_wget_script(self, extracted):
        """Create a wget script for batch downloading"""
        script_file = Path(self.download_dir) / "download_all.sh"
        
        with open(script_file, 'w') as f:
            f.write("#!/bin/bash\n")
            f.write("# Salesloft Recording Download Script\n")
            f.write("# Generated: " + datetime.now().isoformat() + "\n\n")
            
            for item in extracted:
                if item.get('media_url'):
                    f.write(f"echo 'Downloading {item['filename']}...'\n")
                    f.write(f"wget -c '{item['media_url']}' -O '{item['filename']}'\n")
                    f.write("sleep 1\n\n")
        
        os.chmod(script_file, 0o755)
        print(f"\n📝 Created wget script: {script_file}")
        print(f"   Run with: cd {self.download_dir} && ./download_all.sh")

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Extract and download Salesloft recordings")
    parser.add_argument("urls_file", help="File containing recording URLs")
    parser.add_argument("--batch-size", type=int, default=20, help="URLs per batch (default: 20)")
    parser.add_argument("--output-dir", help="Directory to save recordings")
    
    args = parser.parse_args()
    
    downloader = SmartRecordingDownloader(download_dir=args.output_dir)
    downloader.run(args.urls_file, batch_size=args.batch_size)

if __name__ == "__main__":
    main()