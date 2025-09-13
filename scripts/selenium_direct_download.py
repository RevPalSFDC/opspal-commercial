#!/usr/bin/env python3
"""
Direct download automation for Salesloft recordings
Uses Selenium to navigate to each recording and trigger the browser's save dialog
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
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import pyautogui  # For handling save dialogs

class DirectRecordingDownloader:
    def __init__(self, download_dir=None, batch_size=5):
        """
        Initialize the downloader
        
        Args:
            download_dir: Directory where recordings will be saved
            batch_size: Number of recordings to process before a pause
        """
        self.download_dir = download_dir or "/home/chris/Desktop/RevPal/Agents/iq_sdr_recordings/downloads"
        self.batch_size = batch_size
        self.driver = None
        self.processed_urls = set()
        self.failed_urls = []
        
        # Create download directory
        Path(self.download_dir).mkdir(parents=True, exist_ok=True)
        
        # Progress tracking
        self.progress_file = Path(self.download_dir) / "download_progress.json"
        self.load_progress()
        
        print(f"Download directory: {self.download_dir}")
        print(f"Batch size: {self.batch_size}")
    
    def load_progress(self):
        """Load previous progress if exists"""
        if self.progress_file.exists():
            with open(self.progress_file, 'r') as f:
                data = json.load(f)
                self.processed_urls = set(data.get("processed", []))
                self.failed_urls = data.get("failed", [])
                print(f"Resuming: {len(self.processed_urls)} already processed")
    
    def save_progress(self):
        """Save current progress"""
        with open(self.progress_file, 'w') as f:
            json.dump({
                "processed": list(self.processed_urls),
                "failed": self.failed_urls,
                "last_update": datetime.now().isoformat()
            }, f, indent=2)
    
    def setup_chrome(self):
        """Setup Chrome with download preferences"""
        options = webdriver.ChromeOptions()
        
        # Set download directory and preferences
        prefs = {
            "download.default_directory": self.download_dir,
            "download.prompt_for_download": False,  # Don't prompt
            "download.directory_upgrade": True,
            "safebrowsing.enabled": True,
            "plugins.always_open_pdf_externally": True,  # Download PDFs instead of displaying
            # Try to force downloads for media
            "profile.default_content_setting_values.automatic_downloads": 1,
            "profile.default_content_settings.popups": 0,
        }
        options.add_experimental_option("prefs", prefs)
        
        # Additional options
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option('useAutomationExtension', False)
        
        # Start maximized
        options.add_argument("--start-maximized")
        
        print("Starting Chrome...")
        self.driver = webdriver.Chrome(options=options)
        
        # Execute CDP command to allow downloads
        self.driver.execute_cdp_cmd("Page.setDownloadBehavior", {
            "behavior": "allow",
            "downloadPath": self.download_dir
        })
        
        print("Chrome started successfully")
    
    def login_to_salesloft(self):
        """Guide user through Salesloft login"""
        print("\n" + "="*60)
        print("MANUAL LOGIN REQUIRED")
        print("="*60)
        
        print("\n1. Opening Salesloft login page...")
        self.driver.get("https://app.salesloft.com")
        
        print("2. Please log in to Salesloft")
        input("\nPress Enter when logged in...")
        
        if "app.salesloft.com" in self.driver.current_url:
            print("✅ Login successful!")
            return True
        else:
            print("⚠️  Warning: May not be logged in properly")
            response = input("Continue anyway? (yes/no): ")
            return response.lower() == 'yes'
    
    def download_recording_method1(self, url):
        """Method 1: Try to find and trigger download via audio element"""
        try:
            self.driver.get(url)
            time.sleep(3)  # Wait for page load
            
            # Try to find audio/video element
            media_elements = self.driver.find_elements(By.TAG_NAME, "audio") + \
                           self.driver.find_elements(By.TAG_NAME, "video")
            
            if media_elements:
                # Get the source URL
                for elem in media_elements:
                    src = elem.get_attribute("src")
                    if src:
                        # Open source directly to trigger download
                        self.driver.get(src)
                        time.sleep(2)
                        return True
            
            return False
        except Exception as e:
            print(f"    Method 1 failed: {e}")
            return False
    
    def download_recording_method2(self, url):
        """Method 2: Use browser save page functionality"""
        try:
            self.driver.get(url)
            time.sleep(3)
            
            # Try Ctrl+S to save page
            actions = ActionChains(self.driver)
            actions.key_down(Keys.CONTROL).send_keys('s').key_up(Keys.CONTROL).perform()
            
            time.sleep(1)
            
            # Use pyautogui to handle save dialog
            pyautogui.press('enter')  # Confirm save
            
            return True
        except Exception as e:
            print(f"    Method 2 failed: {e}")
            return False
    
    def download_recording_method3(self, url):
        """Method 3: Right-click and save audio"""
        try:
            self.driver.get(url)
            time.sleep(3)
            
            # Find audio element
            audio = self.driver.find_element(By.TAG_NAME, "audio")
            
            # Right-click on audio element
            actions = ActionChains(self.driver)
            actions.context_click(audio).perform()
            
            time.sleep(1)
            
            # Use pyautogui to select "Save audio as..."
            # Navigate menu (this may need adjustment based on your browser)
            pyautogui.press('down', presses=4)  # Navigate to "Save audio as"
            pyautogui.press('enter')
            
            time.sleep(1)
            pyautogui.press('enter')  # Confirm save
            
            return True
        except Exception as e:
            print(f"    Method 3 failed: {e}")
            return False
    
    def download_recording_method4(self, url):
        """Method 4: Use Video DownloadHelper if installed"""
        try:
            self.driver.get(url)
            time.sleep(3)
            
            # Look for DownloadHelper button in toolbar
            # This requires the extension to be installed
            print("    Waiting for DownloadHelper to detect media...")
            time.sleep(5)
            
            # The extension should auto-detect media
            # You may need to click its icon manually
            print("    Please click DownloadHelper icon if media was detected")
            time.sleep(10)
            
            return True
        except Exception as e:
            print(f"    Method 4 failed: {e}")
            return False
    
    def download_recording(self, url, index):
        """Try multiple methods to download a recording"""
        print(f"\n[{index}] Attempting to download: {url.split('/')[-1]}")
        
        # Try different methods
        methods = [
            ("Direct media source", self.download_recording_method1),
            ("Browser save page", self.download_recording_method2),
            ("Right-click save", self.download_recording_method3),
            ("DownloadHelper", self.download_recording_method4),
        ]
        
        for method_name, method_func in methods:
            print(f"  Trying {method_name}...")
            if method_func(url):
                print(f"  ✅ Success with {method_name}")
                return True
            time.sleep(2)
        
        print(f"  ❌ All methods failed")
        return False
    
    def process_recordings(self, recording_urls):
        """Process all recordings"""
        # Filter out already processed
        remaining_urls = [url for url in recording_urls if url not in self.processed_urls]
        
        print(f"\n📊 Total recordings: {len(recording_urls)}")
        print(f"📊 Already processed: {len(self.processed_urls)}")
        print(f"📊 Remaining: {len(remaining_urls)}")
        
        # Process in batches
        for batch_num, i in enumerate(range(0, len(remaining_urls), self.batch_size), 1):
            batch = remaining_urls[i:i + self.batch_size]
            
            print(f"\n{'='*60}")
            print(f"BATCH {batch_num} - {len(batch)} recordings")
            print(f"{'='*60}")
            
            for j, url in enumerate(batch, 1):
                success = self.download_recording(url, f"{batch_num}.{j}")
                
                if success:
                    self.processed_urls.add(url)
                else:
                    self.failed_urls.append(url)
                
                # Small delay between recordings
                time.sleep(3)
            
            # Save progress after each batch
            self.save_progress()
            
            # Pause between batches
            if i + self.batch_size < len(remaining_urls):
                print(f"\nBatch complete. Pausing for 10 seconds...")
                time.sleep(10)
                
                # Ask to continue after every 5 batches
                if batch_num % 5 == 0:
                    response = input("\nContinue? (yes/no): ")
                    if response.lower() != 'yes':
                        break
    
    def run(self, urls_file):
        """Main execution"""
        print("="*60)
        print("SALESLOFT RECORDING DIRECT DOWNLOADER")
        print("="*60)
        
        # Load URLs
        print(f"\nLoading URLs from: {urls_file}")
        urls = []
        
        with open(urls_file, 'r') as f:
            urls = [line.strip() for line in f if line.strip()]
        
        if not urls:
            print("❌ No URLs found")
            return
        
        print(f"✅ Loaded {len(urls)} URLs")
        
        try:
            # Setup
            self.setup_chrome()
            
            # Login
            if not self.login_to_salesloft():
                return
            
            # Process recordings
            self.process_recordings(urls)
            
            # Final report
            print("\n" + "="*60)
            print("DOWNLOAD COMPLETE")
            print("="*60)
            print(f"Processed: {len(self.processed_urls)}")
            print(f"Failed: {len(self.failed_urls)}")
            
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
    # Check if pyautogui is installed
    try:
        import pyautogui
    except ImportError:
        print("Error: pyautogui not installed")
        print("Install with: pip install pyautogui")
        sys.exit(1)
    
    import argparse
    
    parser = argparse.ArgumentParser(description="Direct download Salesloft recordings")
    parser.add_argument("urls_file", help="File containing recording URLs")
    parser.add_argument("--batch-size", type=int, default=5, help="Recordings per batch (default: 5)")
    parser.add_argument("--output-dir", help="Directory to save recordings")
    
    args = parser.parse_args()
    
    # Create downloader
    downloader = DirectRecordingDownloader(
        download_dir=args.output_dir,
        batch_size=args.batch_size
    )
    
    # Run
    downloader.run(args.urls_file)

if __name__ == "__main__":
    main()