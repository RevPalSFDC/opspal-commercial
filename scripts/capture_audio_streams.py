#!/usr/bin/env python3
"""
Capture actual audio streams from Salesloft recordings using Chrome DevTools Protocol
This intercepts the real audio files as they're loaded by the browser
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
from selenium.webdriver.chrome.service import Service
from selenium.common.exceptions import TimeoutException
import re
from urllib.parse import urlparse

class AudioStreamCapture:
    def __init__(self, download_dir=None):
        self.download_dir = download_dir or "/home/chris/Desktop/RevPal/Agents/iq_sdr_recordings/downloads"
        Path(self.download_dir).mkdir(parents=True, exist_ok=True)
        self.driver = None
        self.captured_streams = []
        self.processed_recordings = set()
        self.progress_file = Path(self.download_dir) / "capture_progress.json"
        self.load_progress()
        
    def load_progress(self):
        """Load previous progress"""
        if self.progress_file.exists():
            with open(self.progress_file, 'r') as f:
                data = json.load(f)
                self.processed_recordings = set(data.get("processed", []))
                self.captured_streams = data.get("captured", [])
                print(f"Resuming: {len(self.processed_recordings)} already processed")
    
    def save_progress(self):
        """Save progress"""
        with open(self.progress_file, 'w') as f:
            json.dump({
                "processed": list(self.processed_recordings),
                "captured": self.captured_streams,
                "timestamp": datetime.now().isoformat()
            }, f, indent=2)
    
    def setup_chrome_with_logging(self):
        """Setup Chrome with network logging enabled"""
        options = webdriver.ChromeOptions()
        
        # Enable logging
        options.add_argument("--enable-logging")
        options.add_argument("--v=1")
        options.set_capability("goog:loggingPrefs", {"performance": "ALL", "browser": "ALL"})
        
        # Performance logging to capture network
        options.add_experimental_option('perfLoggingPrefs', {
            'enableNetwork': True,
            'enablePage': False,
        })
        
        # Other options
        options.add_argument("--start-maximized")
        options.add_argument("--disable-blink-features=AutomationControlled")
        
        print("Starting Chrome with network monitoring...")
        self.driver = webdriver.Chrome(options=options)
        
        # Enable Chrome DevTools Protocol
        self.driver.execute_cdp_cmd("Network.enable", {})
        
        print("Chrome started with DevTools Protocol enabled")
    
    def login_to_salesloft(self):
        """Login to Salesloft"""
        print("\n" + "="*60)
        print("LOGIN REQUIRED")
        print("="*60)
        
        self.driver.get("https://app.salesloft.com")
        print("\nPlease log in to Salesloft")
        input("Press Enter when logged in...")
        
        print("✅ Login complete")
        return True
    
    def capture_network_streams(self, recording_url):
        """Capture audio streams from network traffic"""
        print(f"\nProcessing: {recording_url.split('/')[-1]}")
        
        # Clear previous logs
        self.driver.get_log('performance')
        
        # Navigate to recording
        self.driver.get(recording_url)
        
        # Wait for page to load and audio to start playing
        print("  Waiting for audio to load...")
        time.sleep(5)
        
        # Try to play audio if there's a play button
        try:
            play_buttons = self.driver.find_elements(By.XPATH, "//button[contains(@class, 'play') or contains(@aria-label, 'Play')]")
            if play_buttons:
                play_buttons[0].click()
                print("  Clicked play button")
                time.sleep(2)
        except:
            pass
        
        # Get network logs
        logs = self.driver.get_log('performance')
        
        audio_urls = []
        
        for log in logs:
            try:
                message = json.loads(log['message'])
                method = message.get('message', {}).get('method', '')
                
                # Look for network responses
                if method == 'Network.responseReceived':
                    response = message['message']['params']['response']
                    url = response.get('url', '')
                    mime_type = response.get('mimeType', '')
                    
                    # Check if this is an audio file
                    if any(audio_type in mime_type.lower() for audio_type in ['audio', 'mpeg', 'mp3', 'wav', 'ogg', 'webm']):
                        print(f"  ✅ Found audio stream: {url[:100]}...")
                        print(f"     Type: {mime_type}")
                        audio_urls.append({
                            'url': url,
                            'type': mime_type,
                            'recording_id': recording_url.split('/')[-1]
                        })
                    
                    # Also check URLs that look like audio files
                    elif any(ext in url.lower() for ext in ['.mp3', '.wav', '.m4a', '.ogg', '.webm']):
                        print(f"  ✅ Found audio file: {url[:100]}...")
                        audio_urls.append({
                            'url': url,
                            'type': 'audio/mpeg',
                            'recording_id': recording_url.split('/')[-1]
                        })
                        
            except Exception as e:
                continue
        
        if not audio_urls:
            # Try alternative method - check page source for audio URLs
            print("  Checking page source for audio URLs...")
            page_source = self.driver.page_source
            
            # Look for audio file URLs in the source
            audio_patterns = [
                r'https?://[^\s<>"]+\.mp3[^\s<>"]*',
                r'https?://[^\s<>"]+\.wav[^\s<>"]*',
                r'https?://[^\s<>"]+\.m4a[^\s<>"]*',
                r'https?://[^\s<>"]+/audio/[^\s<>"]+',
                r'https?://[^\s<>"]+\.cloudfront\.net/[^\s<>"]+',
                r'https?://[^\s<>"]+\.amazonaws\.com/[^\s<>"]+',
            ]
            
            for pattern in audio_patterns:
                matches = re.findall(pattern, page_source)
                for match in matches:
                    if not any(skip in match for skip in ['.js', '.css', '.png', '.jpg', '.svg']):
                        print(f"  ✅ Found potential audio URL: {match[:100]}...")
                        audio_urls.append({
                            'url': match,
                            'type': 'audio/mpeg',
                            'recording_id': recording_url.split('/')[-1]
                        })
        
        return audio_urls
    
    def download_audio_file(self, audio_url, recording_id):
        """Download the audio file"""
        try:
            filename = f"recording_{recording_id}.mp3"
            filepath = Path(self.download_dir) / filename
            
            # Skip if already downloaded
            if filepath.exists():
                print(f"  Already downloaded: {filename}")
                return True
            
            print(f"  Downloading: {filename}")
            
            # Get cookies from browser
            cookies = {}
            for cookie in self.driver.get_cookies():
                cookies[cookie['name']] = cookie['value']
            
            headers = {
                'User-Agent': self.driver.execute_script("return navigator.userAgent"),
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': self.driver.current_url,
                'Origin': 'https://recordings.salesloft.com'
            }
            
            response = requests.get(audio_url, headers=headers, cookies=cookies, stream=True)
            
            if response.status_code == 200:
                total_size = int(response.headers.get('content-length', 0))
                
                with open(filepath, 'wb') as f:
                    downloaded = 0
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            
                            if total_size > 0:
                                percent = (downloaded / total_size) * 100
                                print(f"    {percent:.1f}%", end='\r')
                
                print(f"\n  ✅ Downloaded: {downloaded/1024/1024:.1f} MB")
                return True
            else:
                print(f"  ❌ Download failed: HTTP {response.status_code}")
                return False
                
        except Exception as e:
            print(f"  ❌ Error: {e}")
            return False
    
    def process_recording(self, recording_url):
        """Process a single recording"""
        if recording_url in self.processed_recordings:
            print(f"Skipping already processed: {recording_url.split('/')[-1]}")
            return
        
        # Capture audio streams
        audio_urls = self.capture_network_streams(recording_url)
        
        if audio_urls:
            # Try to download the first valid audio URL
            for audio_data in audio_urls:
                if self.download_audio_file(audio_data['url'], audio_data['recording_id']):
                    self.captured_streams.append({
                        'recording_url': recording_url,
                        'audio_url': audio_data['url'],
                        'type': audio_data['type'],
                        'timestamp': datetime.now().isoformat()
                    })
                    break
        else:
            print("  ⚠️  No audio streams found")
            
            # Try one more method - look for download button
            try:
                download_buttons = self.driver.find_elements(By.XPATH, "//a[contains(@download, '') or contains(text(), 'Download')]")
                if download_buttons:
                    download_url = download_buttons[0].get_attribute('href')
                    if download_url:
                        print(f"  Found download link: {download_url[:100]}...")
                        self.download_audio_file(download_url, recording_url.split('/')[-1])
            except:
                pass
        
        self.processed_recordings.add(recording_url)
        self.save_progress()
    
    def run(self, urls_file, batch_size=10):
        """Main execution"""
        print("="*60)
        print("AUDIO STREAM CAPTURE FOR SALESLOFT RECORDINGS")
        print("="*60)
        
        # Load URLs
        with open(urls_file, 'r') as f:
            urls = [line.strip() for line in f if line.strip()]
        
        # Filter already processed
        remaining = [url for url in urls if url not in self.processed_recordings]
        
        print(f"\n📊 Total recordings: {len(urls)}")
        print(f"📊 Already processed: {len(self.processed_recordings)}")
        print(f"📊 Remaining: {len(remaining)}")
        
        if not remaining:
            print("\n✅ All recordings already processed!")
            return
        
        try:
            # Setup browser
            self.setup_chrome_with_logging()
            
            # Login
            if not self.login_to_salesloft():
                return
            
            # Process recordings
            for i, url in enumerate(remaining):
                print(f"\n[{i+1}/{len(remaining)}]", end="")
                self.process_recording(url)
                
                # Small delay
                time.sleep(2)
                
                # Pause every batch_size recordings
                if (i + 1) % batch_size == 0:
                    print(f"\nProcessed {i+1} recordings. Pausing...")
                    time.sleep(5)
                    
                    if (i + 1) % (batch_size * 3) == 0:
                        response = input("\nContinue? (yes/no): ")
                        if response.lower() != 'yes':
                            break
            
            # Final report
            print("\n" + "="*60)
            print("CAPTURE COMPLETE")
            print("="*60)
            print(f"Processed: {len(self.processed_recordings)}")
            print(f"Captured: {len(self.captured_streams)}")
            
            # Save captured URLs for reference
            urls_file = Path(self.download_dir) / "captured_audio_urls.json"
            with open(urls_file, 'w') as f:
                json.dump(self.captured_streams, f, indent=2)
            print(f"\nAudio URLs saved to: {urls_file}")
            
        finally:
            if self.driver:
                print("\nClosing browser...")
                self.driver.quit()

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Capture audio streams from Salesloft recordings")
    parser.add_argument("urls_file", help="File containing recording URLs")
    parser.add_argument("--batch-size", type=int, default=10, help="Recordings per pause (default: 10)")
    parser.add_argument("--output-dir", help="Directory to save recordings")
    
    args = parser.parse_args()
    
    capture = AudioStreamCapture(download_dir=args.output_dir)
    capture.run(args.urls_file, batch_size=args.batch_size)

if __name__ == "__main__":
    main()