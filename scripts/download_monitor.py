#!/usr/bin/env python3
"""
Monitor and report on download progress
Shows real-time statistics and helps manage the download process
"""

import os
import json
import time
from pathlib import Path
from datetime import datetime, timedelta
import subprocess

class DownloadMonitor:
    def __init__(self, download_dir="/home/chris/Desktop/RevPal/Agents/iq_sdr_recordings/downloads"):
        self.download_dir = Path(download_dir)
        self.progress_file = self.download_dir / "download_progress.json"
        self.recordings_file = Path("/home/chris/Desktop/RevPal/Agents/iq_sdr_recordings/recordings.json")
        
    def get_download_stats(self):
        """Get current download statistics"""
        stats = {
            "total_recordings": 0,
            "processed": 0,
            "downloaded": 0,
            "failed": 0,
            "remaining": 0,
            "percent_complete": 0,
            "estimated_time_remaining": "Unknown"
        }
        
        # Load total recordings
        if self.recordings_file.exists():
            with open(self.recordings_file, 'r') as f:
                recordings = json.load(f)
                stats["total_recordings"] = len(recordings)
        
        # Load progress
        if self.progress_file.exists():
            with open(self.progress_file, 'r') as f:
                progress = json.load(f)
                stats["processed"] = len(progress.get("processed", []))
                stats["failed"] = len(progress.get("failed", []))
                
                # Count actual downloaded files
                if self.download_dir.exists():
                    audio_files = list(self.download_dir.glob("*.mp3")) + \
                                 list(self.download_dir.glob("*.mp4")) + \
                                 list(self.download_dir.glob("*.wav")) + \
                                 list(self.download_dir.glob("*.m4a"))
                    stats["downloaded"] = len(audio_files)
                
                # Calculate remaining and percentage
                stats["remaining"] = stats["total_recordings"] - stats["processed"]
                if stats["total_recordings"] > 0:
                    stats["percent_complete"] = (stats["processed"] / stats["total_recordings"]) * 100
                
                # Estimate time remaining
                if "stats" in progress and progress["stats"].get("start_time"):
                    start_time = datetime.fromisoformat(progress["stats"]["start_time"])
                    elapsed = datetime.now() - start_time
                    
                    if stats["processed"] > 0:
                        rate = stats["processed"] / elapsed.total_seconds()
                        remaining_seconds = stats["remaining"] / rate if rate > 0 else 0
                        stats["estimated_time_remaining"] = str(timedelta(seconds=int(remaining_seconds)))
        
        return stats
    
    def get_disk_usage(self):
        """Get disk usage statistics"""
        if self.download_dir.exists():
            # Get total size of downloaded files
            total_size = 0
            file_count = 0
            
            for file in self.download_dir.iterdir():
                if file.is_file() and file.suffix in ['.mp3', '.mp4', '.wav', '.m4a']:
                    total_size += file.stat().st_size
                    file_count += 1
            
            # Get available disk space
            stat = os.statvfs(self.download_dir)
            available = stat.f_bavail * stat.f_frsize
            
            return {
                "files": file_count,
                "total_size_mb": total_size / (1024 * 1024),
                "average_size_mb": (total_size / file_count / (1024 * 1024)) if file_count > 0 else 0,
                "available_space_gb": available / (1024 * 1024 * 1024)
            }
        
        return None
    
    def print_dashboard(self):
        """Print a nice dashboard view"""
        os.system('clear' if os.name == 'posix' else 'cls')
        
        print("=" * 70)
        print(" SALESLOFT RECORDING DOWNLOAD MONITOR".center(70))
        print("=" * 70)
        print(f" Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}".center(70))
        print("=" * 70)
        
        # Get stats
        stats = self.get_download_stats()
        disk = self.get_disk_usage()
        
        # Progress bar
        bar_width = 50
        filled = int(bar_width * stats["percent_complete"] / 100)
        bar = "█" * filled + "░" * (bar_width - filled)
        
        print("\n📊 DOWNLOAD PROGRESS")
        print(f"  [{bar}] {stats['percent_complete']:.1f}%")
        print()
        
        # Statistics
        print("📈 STATISTICS")
        print(f"  Total Recordings:    {stats['total_recordings']:,}")
        print(f"  Processed:          {stats['processed']:,}")
        print(f"  Downloaded:         {stats['downloaded']:,}")
        print(f"  Failed:             {stats['failed']:,}")
        print(f"  Remaining:          {stats['remaining']:,}")
        print()
        
        # Time estimate
        print("⏱️  TIME")
        print(f"  Estimated Remaining: {stats['estimated_time_remaining']}")
        print()
        
        # Disk usage
        if disk:
            print("💾 DISK USAGE")
            print(f"  Downloaded Files:    {disk['files']:,}")
            print(f"  Total Size:         {disk['total_size_mb']:.1f} MB")
            print(f"  Average Size:       {disk['average_size_mb']:.2f} MB")
            print(f"  Available Space:    {disk['available_space_gb']:.1f} GB")
            print()
        
        # Recommendations
        print("💡 RECOMMENDATIONS")
        if stats['percent_complete'] < 100:
            if stats['failed'] > stats['processed'] * 0.1:
                print("  ⚠️  High failure rate detected. Check your connection.")
            if disk and disk['available_space_gb'] < 10:
                print("  ⚠️  Low disk space! Less than 10GB remaining.")
            if stats['remaining'] > 0:
                print(f"  ▶️  {stats['remaining']} recordings still to process")
        else:
            print("  ✅ All recordings processed!")
        
        print("\n" + "=" * 70)
    
    def watch(self, refresh_interval=10):
        """Watch progress with auto-refresh"""
        print("Starting monitor... Press Ctrl+C to stop")
        
        try:
            while True:
                self.print_dashboard()
                time.sleep(refresh_interval)
        except KeyboardInterrupt:
            print("\n\nMonitor stopped.")
    
    def generate_report(self):
        """Generate a detailed report"""
        stats = self.get_download_stats()
        disk = self.get_disk_usage()
        
        report_file = self.download_dir / f"download_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        
        with open(report_file, 'w') as f:
            f.write("SALESLOFT RECORDING DOWNLOAD REPORT\n")
            f.write("=" * 50 + "\n")
            f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            
            f.write("SUMMARY\n")
            f.write("-" * 30 + "\n")
            f.write(f"Total Recordings: {stats['total_recordings']:,}\n")
            f.write(f"Successfully Downloaded: {stats['downloaded']:,}\n")
            f.write(f"Failed: {stats['failed']:,}\n")
            f.write(f"Completion: {stats['percent_complete']:.1f}%\n\n")
            
            if disk:
                f.write("DISK USAGE\n")
                f.write("-" * 30 + "\n")
                f.write(f"Total Files: {disk['files']:,}\n")
                f.write(f"Total Size: {disk['total_size_mb']:.1f} MB\n")
                f.write(f"Average File Size: {disk['average_size_mb']:.2f} MB\n\n")
            
            # Load and list failed URLs
            if self.progress_file.exists():
                with open(self.progress_file, 'r') as pf:
                    progress = json.load(pf)
                    failed = progress.get("failed", [])
                    
                    if failed:
                        f.write("FAILED RECORDINGS\n")
                        f.write("-" * 30 + "\n")
                        for url in failed:
                            f.write(f"{url}\n")
        
        print(f"Report saved to: {report_file}")
        return report_file

def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Monitor Salesloft recording downloads")
    parser.add_argument("--watch", action="store_true", help="Watch progress with auto-refresh")
    parser.add_argument("--interval", type=int, default=10, help="Refresh interval in seconds (default: 10)")
    parser.add_argument("--report", action="store_true", help="Generate a detailed report")
    parser.add_argument("--dir", help="Download directory to monitor")
    
    args = parser.parse_args()
    
    monitor = DownloadMonitor(download_dir=args.dir) if args.dir else DownloadMonitor()
    
    if args.watch:
        monitor.watch(refresh_interval=args.interval)
    elif args.report:
        monitor.generate_report()
    else:
        monitor.print_dashboard()

if __name__ == "__main__":
    main()