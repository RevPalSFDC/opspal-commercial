#!/usr/bin/env python3
"""
Automated batch downloader for Salesloft recordings
Works with Video DownloadHelper Chrome extension
Processes 6000+ recordings in manageable batches
"""

import os
import sys
import time
import json
import csv
from pathlib import Path
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
import subprocess

class RecordingDownloader:
    def __init__(self, download_dir=None, batch_size=10, delay_between_batches=30):
        """
        Initialize the downloader
        
        Args:
            download_dir: Directory where recordings will be saved
            batch_size: Number of tabs to open at once (10-20 recommended)
            delay_between_batches: Seconds to wait between batches
        """
        self.download_dir = download_dir or "/home/chris/Desktop/RevPal/Agents/iq_sdr_recordings/downloads"
        self.batch_size = batch_size
        self.delay_between_batches = delay_between_batches
        self.driver = None
        self.processed_urls = set()
        self.failed_urls = []
        self.stats = {
            "total": 0,
            "processed": 0,
            "downloaded": 0,
            "failed": 0,
            "start_time": None
        }
        
        # Create download directory
        Path(self.download_dir).mkdir(parents=True, exist_ok=True)
        
        # Progress file to resume if interrupted
        self.progress_file = Path(self.download_dir) / "download_progress.json"
        self.load_progress()
    
    def load_progress(self):
        """Load previous progress if exists"""
        if self.progress_file.exists():
            with open(self.progress_file, 'r') as f:
                data = json.load(f)
                self.processed_urls = set(data.get("processed", []))
                self.failed_urls = data.get("failed", [])
                print(f"Resuming from previous session: {len(self.processed_urls)} already processed")
    
    def save_progress(self):
        """Save current progress"""
        with open(self.progress_file, 'w') as f:
            json.dump({
                "processed": list(self.processed_urls),
                "failed": self.failed_urls,
                "stats": self.stats,
                "last_update": datetime.now().isoformat()
            }, f, indent=2)
    
    def setup_chrome(self):
        """Setup Chrome with proper configuration"""
        options = webdriver.ChromeOptions()
        
        # Set download directory
        prefs = {
            "download.default_directory": self.download_dir,
            "download.prompt_for_download": False,
            "download.directory_upgrade": True,
            "safebrowsing.enabled": True,
            # Allow multiple downloads
            "profile.default_content_setting_values.automatic_downloads": 1
        }
        options.add_experimental_option("prefs", prefs)
        
        # Add extension support flags
        options.add_argument("--enable-extensions")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        
        # Maximize window to ensure extension is visible
        options.add_argument("--start-maximized")
        
        print("Starting Chrome...")
        self.driver = webdriver.Chrome(options=options)
        print("Chrome started successfully")
    
    def login_to_salesloft(self):
        """Guide user through Salesloft login"""
        print("\n" + "="*60)
        print("MANUAL LOGIN REQUIRED")
        print("="*60)
        
        print("\n1. Opening Salesloft login page...")
        self.driver.get("https://app.salesloft.com")
        
        print("2. Please log in to Salesloft in the browser window")
        print("3. Make sure Video DownloadHelper extension is active (icon should be visible)")
        
        input("\nPress Enter when you're logged in and ready to continue...")
        
        # Verify we're logged in
        if "app.salesloft.com" in self.driver.current_url:
            print("✅ Login successful!")
            return True
        else:
            print("⚠️  Warning: May not be logged in properly")
            response = input("Continue anyway? (yes/no): ")
            return response.lower() == 'yes'
    
    def open_recording_batch(self, urls):
        """Open a batch of recordings in separate tabs"""
        print(f"\nOpening batch of {len(urls)} recordings...")
        
        # Store original tab
        original_tab = self.driver.current_window_handle
        
        # Open each URL in a new tab
        for i, url in enumerate(urls):
            # Open new tab
            self.driver.execute_script("window.open('');")
            
            # Switch to new tab
            self.driver.switch_to.window(self.driver.window_handles[-1])
            
            # Navigate to recording
            self.driver.get(url)
            
            print(f"  [{i+1}/{len(urls)}] Opened: {url.split('/')[-1]}")
            
            # Small delay to avoid overwhelming the browser
            time.sleep(1)
        
        # Return to original tab
        self.driver.switch_to.window(original_tab)
        
        print(f"✅ Batch opened. Waiting for DownloadHelper to capture...")
    
    def wait_for_downloads(self, wait_time=30):
        """Wait for downloads to complete"""
        print(f"Waiting {wait_time} seconds for downloads to process...")
        
        # Show countdown
        for i in range(wait_time, 0, -1):
            print(f"  {i} seconds remaining...", end='\r')
            time.sleep(1)
        
        print("\n✅ Wait complete")
    
    def close_extra_tabs(self):
        """Close all tabs except the first one"""
        if len(self.driver.window_handles) > 1:
            print("Closing tabs...")
            original_tab = self.driver.window_handles[0]
            
            for handle in self.driver.window_handles[1:]:
                self.driver.switch_to.window(handle)
                self.driver.close()
            
            self.driver.switch_to.window(original_tab)
            print("✅ Tabs closed")
    
    def count_downloaded_files(self):
        """Count files in download directory"""
        download_path = Path(self.download_dir)
        # Count audio/video files
        audio_files = list(download_path.glob("*.mp3")) + \
                     list(download_path.glob("*.mp4")) + \
                     list(download_path.glob("*.wav")) + \
                     list(download_path.glob("*.m4a"))
        return len(audio_files)
    
    def process_recordings(self, recording_urls):
        """Process all recordings in batches"""
        self.stats["total"] = len(recording_urls)
        self.stats["start_time"] = datetime.now()
        
        # Filter out already processed URLs
        remaining_urls = [url for url in recording_urls if url not in self.processed_urls]
        
        print(f"\n📊 Total recordings: {len(recording_urls)}")
        print(f"📊 Already processed: {len(self.processed_urls)}")
        print(f"📊 Remaining: {len(remaining_urls)}")
        print(f"📊 Batch size: {self.batch_size}")
        print(f"📊 Estimated batches: {len(remaining_urls) // self.batch_size + 1}")
        
        # Process in batches
        for batch_num, i in enumerate(range(0, len(remaining_urls), self.batch_size), 1):
            batch = remaining_urls[i:i + self.batch_size]
            
            print(f"\n{'='*60}")
            print(f"BATCH {batch_num} - {len(batch)} recordings")
            print(f"{'='*60}")
            
            # Check current download count
            initial_count = self.count_downloaded_files()
            
            try:
                # Open batch
                self.open_recording_batch(batch)
                
                # Wait for DownloadHelper to capture
                self.wait_for_downloads(self.delay_between_batches)
                
                # Check new downloads
                new_count = self.count_downloaded_files()
                new_downloads = new_count - initial_count
                
                print(f"📥 New files downloaded: {new_downloads}")
                self.stats["downloaded"] += new_downloads
                
                # Mark as processed
                for url in batch:
                    self.processed_urls.add(url)
                    self.stats["processed"] += 1
                
                # Close tabs to free memory
                self.close_extra_tabs()
                
                # Save progress
                self.save_progress()
                
                # Progress report
                self.print_progress()
                
                # Check if we should pause
                if batch_num % 10 == 0:
                    print("\n⚠️  Processed 10 batches. Consider taking a break.")
                    response = input("Continue? (yes/no): ")
                    if response.lower() != 'yes':
                        print("Pausing. Progress saved.")
                        break
                
            except Exception as e:
                print(f"❌ Error processing batch: {e}")
                self.failed_urls.extend(batch)
                self.stats["failed"] += len(batch)
                
                # Save progress even on error
                self.save_progress()
                
                response = input("Continue with next batch? (yes/no): ")
                if response.lower() != 'yes':
                    break
    
    def print_progress(self):
        """Print current progress statistics"""
        elapsed = (datetime.now() - self.stats["start_time"]).total_seconds()
        rate = self.stats["processed"] / elapsed if elapsed > 0 else 0
        remaining = self.stats["total"] - self.stats["processed"]
        eta = remaining / rate if rate > 0 else 0
        
        print(f"\n📊 PROGRESS REPORT")
        print(f"  Processed: {self.stats['processed']}/{self.stats['total']} ({self.stats['processed']/self.stats['total']*100:.1f}%)")
        print(f"  Downloaded: {self.stats['downloaded']}")
        print(f"  Failed: {self.stats['failed']}")
        print(f"  Rate: {rate:.1f} recordings/second")
        print(f"  Time elapsed: {elapsed/60:.1f} minutes")
        print(f"  Estimated remaining: {eta/60:.1f} minutes")
    
    def run(self, urls_file):
        """Main execution method"""
        print("="*60)
        print("SALESLOFT BATCH RECORDING DOWNLOADER")
        print("="*60)
        
        # Load URLs
        print(f"\nLoading URLs from: {urls_file}")
        urls = []
        
        if urls_file.endswith('.txt'):
            with open(urls_file, 'r') as f:
                urls = [line.strip() for line in f if line.strip()]
        elif urls_file.endswith('.csv'):
            with open(urls_file, 'r') as f:
                reader = csv.DictReader(f)
                urls = [row['recording_url'] for row in reader if row.get('recording_url')]
        elif urls_file.endswith('.json'):
            with open(urls_file, 'r') as f:
                data = json.load(f)
                urls = [rec['recording_url'] for rec in data if rec.get('recording_url')]
        
        if not urls:
            print("❌ No URLs found in file")
            return
        
        print(f"✅ Loaded {len(urls)} recording URLs")
        
        try:
            # Setup Chrome
            self.setup_chrome()
            
            # Login to Salesloft
            if not self.login_to_salesloft():
                print("❌ Login failed")
                return
            
            # Process all recordings
            self.process_recordings(urls)
            
            # Final report
            print("\n" + "="*60)
            print("DOWNLOAD COMPLETE")
            print("="*60)
            self.print_progress()
            print(f"\nDownloaded files saved to: {self.download_dir}")
            
            if self.failed_urls:
                failed_file = Path(self.download_dir) / "failed_urls.txt"
                with open(failed_file, 'w') as f:
                    for url in self.failed_urls:
                        f.write(f"{url}\n")
                print(f"Failed URLs saved to: {failed_file}")
        
        finally:
            if self.driver:
                print("\nClosing browser...")
                self.driver.quit()

def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Batch download Salesloft recordings")
    parser.add_argument("urls_file", help="File containing recording URLs (txt/csv/json)")
    parser.add_argument("--batch-size", type=int, default=10, help="Number of tabs to open at once (default: 10)")
    parser.add_argument("--delay", type=int, default=30, help="Seconds to wait between batches (default: 30)")
    parser.add_argument("--output-dir", help="Directory to save recordings")
    
    args = parser.parse_args()
    
    # Create downloader
    downloader = RecordingDownloader(
        download_dir=args.output_dir,
        batch_size=args.batch_size,
        delay_between_batches=args.delay
    )
    
    # Run
    downloader.run(args.urls_file)

if __name__ == "__main__":
    main()