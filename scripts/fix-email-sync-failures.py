#!/usr/bin/env python3
"""
Fix Email Sync Failures Specifically
Target the 21 email sync failures identified in the error analysis
"""

import os
import sys
import json
import requests
from datetime import datetime, timedelta, timezone
import time
from typing import Dict, List, Optional

# Configuration
SALESLOFT_BASE_URL = "https://api.salesloft.com/v2"
SALESLOFT_TOKEN = os.getenv("SALESLOFT_TOKEN")

# Known problem dates from error analysis
PROBLEM_DATES = [
    "2025-09-11",  # 18 errors
    "2025-09-10",  # 1 error
    "2025-09-03",  # 1 error
    "2025-02-19"   # 1 error
]

class EmailSyncFixer:
    """Fix email-specific sync failures"""

    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.headers = {
            "Authorization": f"Bearer {SALESLOFT_TOKEN}",
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
        self.stats = {
            "emails_checked": 0,
            "unsynced_found": 0,
            "sync_triggered": 0,
            "sync_successful": 0,
            "sync_failed": 0
        }

    def fix_email_sync_failures(self) -> Dict:
        """Main method to fix all email sync failures"""
        print("\n" + "="*60)
        print("EMAIL SYNC FAILURE FIX")
        print("="*60)
        print(f"Mode: {'DRY RUN' if self.dry_run else 'LIVE FIX'}")
        print(f"Target dates: {', '.join(PROBLEM_DATES)}")
        print("-"*60)

        # Process each problem date
        for date in PROBLEM_DATES:
            self._process_date(date)

        # Also check for any emails from last 7 days without CRM IDs
        self._check_recent_emails()

        return self.stats

    def _process_date(self, date: str):
        """Process all emails from a specific date"""
        print(f"\nProcessing emails from {date}...")

        try:
            # Get all email activities from this date
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/activities/emails",
                params={
                    "created_at[gte]": f"{date}T00:00:00Z",
                    "created_at[lte]": f"{date}T23:59:59Z",
                    "per_page": 100,
                    "include_paging_counts": True
                },
                headers=self.headers,
                timeout=30
            )

            if response.status_code == 200:
                data = response.json()
                emails = data.get("data", [])

                print(f"  Found {len(emails)} emails from {date}")

                for email in emails:
                    self._process_email(email)

                # Handle pagination if needed
                while data.get("metadata", {}).get("paging", {}).get("next_page"):
                    response = requests.get(
                        data["metadata"]["paging"]["next_page"],
                        headers=self.headers,
                        timeout=30
                    )

                    if response.status_code == 200:
                        data = response.json()
                        emails = data.get("data", [])

                        for email in emails:
                            self._process_email(email)
                    else:
                        break

            elif response.status_code == 404:
                print(f"  No emails endpoint available")
            else:
                print(f"  Error fetching emails: {response.status_code}")

        except Exception as e:
            print(f"  Error processing date {date}: {e}")

    def _process_email(self, email: Dict):
        """Process a single email for sync issues"""
        self.stats["emails_checked"] += 1

        email_id = email.get("id")
        crm_id = email.get("crm_activity_id") or email.get("crm_id")
        subject = email.get("subject", "No subject")[:50]

        if not crm_id:
            self.stats["unsynced_found"] += 1
            print(f"    Found unsynced email: {email_id} - {subject}")

            if not self.dry_run:
                # Attempt to sync
                if self._sync_email(email_id):
                    self.stats["sync_successful"] += 1
                else:
                    self.stats["sync_failed"] += 1
            else:
                print(f"      [DRY RUN] Would sync email {email_id}")
                self.stats["sync_triggered"] += 1

    def _sync_email(self, email_id: str) -> bool:
        """Attempt to sync a single email to CRM"""
        try:
            # Try different sync endpoints
            endpoints = [
                f"/activities/emails/{email_id}/sync",
                f"/crm_activities",
                f"/activities/{email_id}/sync"
            ]

            for endpoint in endpoints:
                try:
                    if endpoint == "/crm_activities":
                        # POST to create CRM activity
                        response = requests.post(
                            f"{SALESLOFT_BASE_URL}{endpoint}",
                            json={"activity_id": email_id, "type": "email"},
                            headers=self.headers,
                            timeout=30
                        )
                    else:
                        # POST to sync endpoint
                        response = requests.post(
                            f"{SALESLOFT_BASE_URL}{endpoint}",
                            headers=self.headers,
                            timeout=30
                        )

                    if response.status_code in [200, 201, 202]:
                        print(f"      ✅ Sync triggered successfully")
                        self.stats["sync_triggered"] += 1

                        # Wait and verify
                        time.sleep(2)
                        if self._verify_sync(email_id):
                            return True

                    elif response.status_code == 404:
                        continue  # Try next endpoint
                    else:
                        print(f"      ⚠️  Sync returned: {response.status_code}")

                except Exception as e:
                    continue

            return False

        except Exception as e:
            print(f"      ❌ Sync failed: {e}")
            return False

    def _verify_sync(self, email_id: str) -> bool:
        """Verify if email was successfully synced"""
        try:
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/activities/emails/{email_id}",
                headers=self.headers,
                timeout=10
            )

            if response.status_code == 200:
                email = response.json().get("data", {})
                if email.get("crm_activity_id") or email.get("crm_id"):
                    return True

        except Exception:
            pass

        return False

    def _check_recent_emails(self):
        """Check for any recent emails that haven't synced"""
        print("\nChecking recent emails (last 7 days)...")

        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=7)

        try:
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/activities/emails",
                params={
                    "created_at[gte]": start_date.isoformat(),
                    "created_at[lte]": end_date.isoformat(),
                    "per_page": 100,
                    "sort": "created_at",
                    "sort_direction": "desc"
                },
                headers=self.headers,
                timeout=30
            )

            if response.status_code == 200:
                emails = response.json().get("data", [])
                unsynced = [e for e in emails if not (e.get("crm_activity_id") or e.get("crm_id"))]

                if unsynced:
                    print(f"  Found {len(unsynced)} recent unsynced emails")

                    for email in unsynced[:10]:  # Process first 10
                        self._process_email(email)
                else:
                    print(f"  ✅ All recent emails are synced")

        except Exception as e:
            print(f"  Error checking recent emails: {e}")

    def generate_report(self) -> str:
        """Generate a summary report"""
        report = []
        report.append("\n" + "="*60)
        report.append("EMAIL SYNC FIX SUMMARY")
        report.append("="*60)
        report.append(f"Emails Checked: {self.stats['emails_checked']}")
        report.append(f"Unsynced Found: {self.stats['unsynced_found']}")

        if not self.dry_run:
            report.append(f"Sync Triggered: {self.stats['sync_triggered']}")
            report.append(f"Sync Successful: {self.stats['sync_successful']}")
            report.append(f"Sync Failed: {self.stats['sync_failed']}")

            if self.stats['sync_triggered'] > 0:
                success_rate = (self.stats['sync_successful'] / self.stats['sync_triggered']) * 100
                report.append(f"Success Rate: {success_rate:.1f}%")
        else:
            report.append(f"Would Sync: {self.stats['sync_triggered']} emails")
            report.append("[DRY RUN - No changes made]")

        return "\n".join(report)


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Fix Salesloft email sync failures"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Perform dry run without making changes"
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose output"
    )

    args = parser.parse_args()

    # Check for API token
    if not SALESLOFT_TOKEN:
        print("Error: SALESLOFT_TOKEN environment variable not set")
        print("\nTo set it:")
        print("  export SALESLOFT_TOKEN='your-token-here'")
        print("\nTo get your token:")
        print("  1. Log into Salesloft")
        print("  2. Go to Settings → API → API Keys")
        print("  3. Create or copy your API key")
        sys.exit(1)

    # Run the fixer
    fixer = EmailSyncFixer(dry_run=args.dry_run)

    # Process known problem emails
    stats = fixer.fix_email_sync_failures()

    # Generate and print report
    report = fixer.generate_report()
    print(report)

    # Save detailed stats
    stats_file = f"/tmp/email_sync_fix_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(stats_file, "w") as f:
        json.dump({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "dry_run": args.dry_run,
            "stats": stats,
            "problem_dates": PROBLEM_DATES
        }, f, indent=2)

    print(f"\nDetailed stats saved to: {stats_file}")

    # Exit code based on results
    if not args.dry_run and stats["sync_failed"] > 0:
        sys.exit(1)  # Some fixes failed
    else:
        sys.exit(0)  # Success or dry run


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nProcess interrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)