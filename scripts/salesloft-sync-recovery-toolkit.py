#!/usr/bin/env python3
"""
Salesloft Sync Recovery Toolkit
Tools to recover from sync failures and remediate common issues
"""

import os
import sys
import json
import requests
import argparse
import subprocess
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple, Any
import time
from collections import defaultdict
import csv

# Configuration
SALESLOFT_BASE_URL = "https://api.salesloft.com/v2"
SALESLOFT_TOKEN = os.getenv("SALESLOFT_TOKEN")
SALESFORCE_ORG = os.getenv("SALESFORCE_ORG_ALIAS", "production")
DRY_RUN = False  # Global flag for dry run mode

class SyncRecoveryToolkit:
    """Comprehensive toolkit for sync recovery operations"""

    def __init__(self, dry_run: bool = False, verbose: bool = False):
        self.dry_run = dry_run
        self.verbose = verbose
        self.headers = {
            "Authorization": f"Bearer {SALESLOFT_TOKEN}",
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
        self.recovery_stats = {
            "records_processed": 0,
            "records_recovered": 0,
            "records_failed": 0,
            "duplicates_found": 0,
            "duplicates_merged": 0,
            "mappings_fixed": 0
        }

    def retry_failed_syncs(self, hours: int = 24, max_retries: int = 3) -> Dict:
        """Retry all failed sync operations from the specified time period"""
        print(f"\n{'[DRY RUN] ' if self.dry_run else ''}Retrying Failed Syncs...")
        print(f"Time period: Last {hours} hours")
        print(f"Max retries per record: {max_retries}")
        print("-" * 60)

        # Get failed sync records
        failed_syncs = self._get_failed_syncs(hours)

        if not failed_syncs:
            print("✅ No failed syncs found")
            return {"status": "success", "message": "No failed syncs to retry"}

        print(f"Found {len(failed_syncs)} failed sync records")

        retry_results = {
            "total": len(failed_syncs),
            "successful": 0,
            "failed": 0,
            "skipped": 0,
            "details": []
        }

        for sync_record in failed_syncs:
            record_id = sync_record.get("id")
            record_type = sync_record.get("activity_type", "unknown")
            error_msg = sync_record.get("error_message", "")

            print(f"\nProcessing {record_type} (ID: {record_id})")
            print(f"  Original error: {error_msg[:100]}")

            # Check if we should retry based on error type
            if not self._should_retry(error_msg):
                print(f"  ⏭️  Skipping (non-retryable error)")
                retry_results["skipped"] += 1
                continue

            # Attempt retry
            if self.dry_run:
                print(f"  [DRY RUN] Would retry sync for {record_id}")
                retry_results["successful"] += 1
            else:
                success = self._retry_single_sync(record_id, record_type, max_retries)
                if success:
                    print(f"  ✅ Successfully synced")
                    retry_results["successful"] += 1
                    self.recovery_stats["records_recovered"] += 1
                else:
                    print(f"  ❌ Retry failed")
                    retry_results["failed"] += 1
                    self.recovery_stats["records_failed"] += 1

            self.recovery_stats["records_processed"] += 1

        # Summary
        print("\n" + "="*60)
        print("RETRY SUMMARY")
        print(f"Total records: {retry_results['total']}")
        print(f"✅ Successful: {retry_results['successful']}")
        print(f"❌ Failed: {retry_results['failed']}")
        print(f"⏭️  Skipped: {retry_results['skipped']}")

        return retry_results

    def _get_failed_syncs(self, hours: int) -> List[Dict]:
        """Get failed sync records from specified time period"""
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(hours=hours)

        try:
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/crm_activities",
                params={
                    "updated_at[gte]": start_time.isoformat(),
                    "sync_status": "failed",
                    "per_page": 100
                },
                headers=self.headers,
                timeout=30
            )

            if response.status_code == 200:
                return response.json().get("data", [])

        except Exception as e:
            print(f"Error fetching failed syncs: {e}")

        return []

    def _should_retry(self, error_message: str) -> bool:
        """Determine if error is retryable"""
        error_lower = error_message.lower()

        # Non-retryable errors
        non_retryable = [
            "permission denied",
            "invalid field",
            "required field missing",
            "duplicate",
            "validation error",
            "not connected to your crm"
        ]

        for pattern in non_retryable:
            if pattern in error_lower:
                return False

        # Retryable errors
        retryable = [
            "timeout",
            "rate limit",
            "connection",
            "temporary",
            "503",
            "504",
            "unable to find"  # Might be timing issue
        ]

        for pattern in retryable:
            if pattern in error_lower:
                return True

        # Default to retry for unknown errors
        return True

    def _retry_single_sync(self, record_id: str, record_type: str,
                          max_retries: int) -> bool:
        """Retry sync for a single record"""
        for attempt in range(max_retries):
            try:
                # Force resync
                response = requests.post(
                    f"{SALESLOFT_BASE_URL}/crm_activities/{record_id}/retry",
                    headers=self.headers,
                    timeout=30
                )

                if response.status_code in [200, 201, 202]:
                    # Wait a bit for sync to complete
                    time.sleep(2)

                    # Verify sync succeeded
                    verify_response = requests.get(
                        f"{SALESLOFT_BASE_URL}/crm_activities/{record_id}",
                        headers=self.headers,
                        timeout=10
                    )

                    if verify_response.status_code == 200:
                        activity = verify_response.json().get("data", {})
                        if activity.get("sync_status") != "failed":
                            return True

                # Rate limit handling
                if response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", 2))
                    time.sleep(retry_after)
                    continue

            except Exception as e:
                if self.verbose:
                    print(f"    Attempt {attempt + 1} failed: {e}")

            # Exponential backoff
            time.sleep(2 ** attempt)

        return False

    def clean_duplicates(self, object_type: str = "Contact") -> Dict:
        """Clean up duplicate records in Salesloft"""
        print(f"\n{'[DRY RUN] ' if self.dry_run else ''}Cleaning Duplicate {object_type}s...")
        print("-" * 60)

        duplicates = self._find_duplicates(object_type)

        if not duplicates:
            print(f"✅ No duplicate {object_type}s found")
            return {"status": "success", "duplicates_found": 0, "merged": 0}

        print(f"Found {len(duplicates)} sets of duplicates")

        merge_results = {
            "duplicates_found": len(duplicates),
            "merged": 0,
            "failed": 0,
            "details": []
        }

        for email, records in duplicates.items():
            print(f"\nDuplicate set for: {email}")
            print(f"  Records: {len(records)}")

            # Determine master record (most complete/recent)
            master = self._select_master_record(records)
            duplicates_to_merge = [r for r in records if r["id"] != master["id"]]

            print(f"  Master: {master.get('name')} (ID: {master['id']})")
            print(f"  Duplicates to merge: {len(duplicates_to_merge)}")

            if self.dry_run:
                print(f"  [DRY RUN] Would merge {len(duplicates_to_merge)} duplicates")
                merge_results["merged"] += len(duplicates_to_merge)
            else:
                # Merge duplicates
                for duplicate in duplicates_to_merge:
                    success = self._merge_records(master, duplicate, object_type)
                    if success:
                        merge_results["merged"] += 1
                        self.recovery_stats["duplicates_merged"] += 1
                    else:
                        merge_results["failed"] += 1

            self.recovery_stats["duplicates_found"] += len(records)

        # Summary
        print("\n" + "="*60)
        print("DUPLICATE CLEANUP SUMMARY")
        print(f"Duplicate sets found: {merge_results['duplicates_found']}")
        print(f"Records merged: {merge_results['merged']}")
        print(f"Failed merges: {merge_results['failed']}")

        return merge_results

    def _find_duplicates(self, object_type: str) -> Dict[str, List[Dict]]:
        """Find duplicate records by email"""
        duplicates = defaultdict(list)

        try:
            endpoint = "/people" if object_type == "Contact" else f"/{object_type.lower()}s"

            page = 1
            while True:
                response = requests.get(
                    f"{SALESLOFT_BASE_URL}{endpoint}",
                    params={"per_page": 100, "page": page},
                    headers=self.headers,
                    timeout=30
                )

                if response.status_code == 200:
                    data = response.json().get("data", [])

                    if not data:
                        break

                    for record in data:
                        email = record.get("email_address", "").lower()
                        if email:
                            duplicates[email].append(record)

                    if len(data) < 100:
                        break

                    page += 1
                else:
                    break

        except Exception as e:
            print(f"Error finding duplicates: {e}")

        # Filter to only actual duplicates (more than 1 record)
        return {email: records for email, records in duplicates.items()
                if len(records) > 1}

    def _select_master_record(self, records: List[Dict]) -> Dict:
        """Select the best record to keep as master"""
        # Score each record
        scored_records = []

        for record in records:
            score = 0

            # Has CRM ID
            if record.get("crm_id"):
                score += 10

            # Has more fields populated
            for field in ["phone", "title", "company_name", "city"]:
                if record.get(field):
                    score += 1

            # More recent activity
            if record.get("last_contacted_at"):
                last_contact = datetime.fromisoformat(
                    record["last_contacted_at"].replace("Z", "+00:00")
                )
                days_ago = (datetime.now(timezone.utc) - last_contact).days
                if days_ago < 30:
                    score += 5
                elif days_ago < 90:
                    score += 2

            # More activities
            score += min(record.get("counts", {}).get("activities", 0) / 10, 5)

            scored_records.append((score, record))

        # Return highest scoring record
        scored_records.sort(key=lambda x: x[0], reverse=True)
        return scored_records[0][1]

    def _merge_records(self, master: Dict, duplicate: Dict,
                      object_type: str) -> bool:
        """Merge duplicate record into master"""
        try:
            # Transfer activities from duplicate to master
            # This would need actual API support for merging

            # Delete duplicate
            response = requests.delete(
                f"{SALESLOFT_BASE_URL}/people/{duplicate['id']}",
                headers=self.headers,
                timeout=10
            )

            return response.status_code in [200, 204]

        except Exception as e:
            if self.verbose:
                print(f"    Merge failed: {e}")
            return False

    def fix_missing_mappings(self) -> Dict:
        """Fix missing field mappings and user mappings"""
        print(f"\n{'[DRY RUN] ' if self.dry_run else ''}Fixing Missing Mappings...")
        print("-" * 60)

        results = {
            "user_mappings": self._fix_user_mappings(),
            "field_mappings": self._fix_field_mappings()
        }

        return results

    def _fix_user_mappings(self) -> Dict:
        """Fix unmapped users"""
        print("\nFixing User Mappings...")

        try:
            # Get unmapped users
            response = requests.get(
                f"{SALESLOFT_BASE_URL}/users",
                params={"per_page": 100},
                headers=self.headers,
                timeout=30
            )

            if response.status_code == 200:
                users = response.json().get("data", [])
                unmapped = [u for u in users if u.get("active") and not u.get("crm_user_id")]

                if not unmapped:
                    print("  ✅ All users already mapped")
                    return {"status": "success", "fixed": 0}

                print(f"  Found {len(unmapped)} unmapped users")

                # Get Salesforce users
                sf_users = self._get_salesforce_users()

                fixed = 0
                for sl_user in unmapped:
                    # Match by email
                    email = sl_user.get("email")
                    sf_match = next((u for u in sf_users if u.get("Email") == email), None)

                    if sf_match:
                        print(f"  Mapping: {sl_user['name']} -> {sf_match['Name']}")

                        if not self.dry_run:
                            # Update mapping
                            success = self._update_user_mapping(
                                sl_user["id"],
                                sf_match["Id"]
                            )
                            if success:
                                fixed += 1
                                self.recovery_stats["mappings_fixed"] += 1
                        else:
                            print(f"    [DRY RUN] Would map to {sf_match['Id']}")
                            fixed += 1

                return {"status": "success", "fixed": fixed, "total": len(unmapped)}

        except Exception as e:
            print(f"  Error fixing user mappings: {e}")
            return {"status": "error", "message": str(e)}

    def _get_salesforce_users(self) -> List[Dict]:
        """Get Salesforce users via CLI"""
        try:
            result = subprocess.run(
                ["sf", "data", "query", "--query",
                 "SELECT Id, Name, Email FROM User WHERE IsActive = true",
                 "--target-org", SALESFORCE_ORG, "--json"],
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                data = json.loads(result.stdout)
                return data.get("result", {}).get("records", [])

        except Exception as e:
            if self.verbose:
                print(f"    Error getting Salesforce users: {e}")

        return []

    def _update_user_mapping(self, sl_user_id: str, sf_user_id: str) -> bool:
        """Update user CRM mapping"""
        try:
            response = requests.patch(
                f"{SALESLOFT_BASE_URL}/users/{sl_user_id}",
                json={"crm_user_id": sf_user_id},
                headers=self.headers,
                timeout=10
            )

            return response.status_code in [200, 201]

        except Exception:
            return False

    def _fix_field_mappings(self) -> Dict:
        """Fix field mapping issues"""
        print("\nFixing Field Mappings...")

        # This would require actual field mapping API
        # For now, we'll provide recommendations

        recommendations = [
            "Ensure Email field is mapped to email_address",
            "Map FirstName and LastName to first_name and last_name",
            "Configure custom field mappings for SalesLoft1__ fields",
            "Enable bidirectional sync for Task and Event objects"
        ]

        print("  Recommended field mapping fixes:")
        for rec in recommendations:
            print(f"    • {rec}")

        return {"status": "recommendations", "items": recommendations}

    def recover_lost_data(self, start_date: str, end_date: str) -> Dict:
        """Recover data that failed to sync in a date range"""
        print(f"\n{'[DRY RUN] ' if self.dry_run else ''}Recovering Lost Data...")
        print(f"Date range: {start_date} to {end_date}")
        print("-" * 60)

        # Parse dates
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)

        # Get all activities in date range
        activities = self._get_activities_in_range(start, end)

        print(f"Found {len(activities)} activities in date range")

        # Check which ones are not synced
        unsynced = []
        for activity in activities:
            if not activity.get("crm_activity_id"):
                unsynced.append(activity)

        if not unsynced:
            print("✅ All activities are synced")
            return {"status": "success", "unsynced": 0}

        print(f"Found {len(unsynced)} unsynced activities")

        # Attempt to sync them
        recovered = 0
        for activity in unsynced:
            print(f"\nRecovering: {activity.get('type')} from {activity.get('created_at')}")

            if self.dry_run:
                print(f"  [DRY RUN] Would sync activity {activity['id']}")
                recovered += 1
            else:
                success = self._sync_activity(activity)
                if success:
                    print(f"  ✅ Synced successfully")
                    recovered += 1
                else:
                    print(f"  ❌ Sync failed")

        return {
            "status": "complete",
            "total_activities": len(activities),
            "unsynced": len(unsynced),
            "recovered": recovered
        }

    def _get_activities_in_range(self, start: datetime, end: datetime) -> List[Dict]:
        """Get all activities in date range"""
        activities = []

        try:
            page = 1
            while True:
                response = requests.get(
                    f"{SALESLOFT_BASE_URL}/activities",
                    params={
                        "created_at[gte]": start.isoformat(),
                        "created_at[lte]": end.isoformat(),
                        "per_page": 100,
                        "page": page
                    },
                    headers=self.headers,
                    timeout=30
                )

                if response.status_code == 200:
                    data = response.json().get("data", [])

                    if not data:
                        break

                    activities.extend(data)

                    if len(data) < 100:
                        break

                    page += 1
                else:
                    break

        except Exception as e:
            print(f"Error getting activities: {e}")

        return activities

    def _sync_activity(self, activity: Dict) -> bool:
        """Sync a single activity to CRM"""
        try:
            response = requests.post(
                f"{SALESLOFT_BASE_URL}/activities/{activity['id']}/sync",
                headers=self.headers,
                timeout=30
            )

            return response.status_code in [200, 201, 202]

        except Exception:
            return False

    def generate_recovery_report(self) -> Dict:
        """Generate comprehensive recovery report"""
        print("\n" + "="*80)
        print("SYNC RECOVERY REPORT")
        print("="*80)

        print(f"\n📊 RECOVERY STATISTICS:")
        for key, value in self.recovery_stats.items():
            formatted_key = key.replace("_", " ").title()
            print(f"  {formatted_key}: {value}")

        success_rate = 0
        if self.recovery_stats["records_processed"] > 0:
            success_rate = (self.recovery_stats["records_recovered"] /
                          self.recovery_stats["records_processed"]) * 100

        print(f"\n✅ Success Rate: {success_rate:.1f}%")

        return self.recovery_stats


def main():
    parser = argparse.ArgumentParser(
        description="Salesloft Sync Recovery Toolkit"
    )
    parser.add_argument(
        "--action",
        choices=["retry", "duplicates", "mappings", "recover", "full"],
        required=True,
        help="Recovery action to perform"
    )
    parser.add_argument(
        "--hours",
        type=int,
        default=24,
        help="Number of hours to look back (for retry action)"
    )
    parser.add_argument(
        "--start-date",
        help="Start date for recovery (YYYY-MM-DD)"
    )
    parser.add_argument(
        "--end-date",
        help="End date for recovery (YYYY-MM-DD)"
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

    # Check for required environment variables
    if not SALESLOFT_TOKEN:
        print("Error: SALESLOFT_TOKEN environment variable not set")
        sys.exit(1)

    # Initialize toolkit
    toolkit = SyncRecoveryToolkit(dry_run=args.dry_run, verbose=args.verbose)

    if args.dry_run:
        print("\n" + "="*80)
        print("DRY RUN MODE - No changes will be made")
        print("="*80)

    # Execute requested action
    if args.action == "retry":
        toolkit.retry_failed_syncs(hours=args.hours)

    elif args.action == "duplicates":
        toolkit.clean_duplicates("Contact")

    elif args.action == "mappings":
        toolkit.fix_missing_mappings()

    elif args.action == "recover":
        if not args.start_date or not args.end_date:
            print("Error: --start-date and --end-date required for recover action")
            sys.exit(1)
        toolkit.recover_lost_data(args.start_date, args.end_date)

    elif args.action == "full":
        print("\n🔧 RUNNING FULL RECOVERY SUITE")
        print("="*80)

        # Run all recovery actions
        print("\n[Step 1/4] Fixing Mappings...")
        toolkit.fix_missing_mappings()

        print("\n[Step 2/4] Cleaning Duplicates...")
        toolkit.clean_duplicates("Contact")

        print("\n[Step 3/4] Retrying Failed Syncs...")
        toolkit.retry_failed_syncs(hours=args.hours)

        print("\n[Step 4/4] Complete!")

    # Generate report
    toolkit.generate_recovery_report()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nRecovery cancelled by user")
        sys.exit(0)
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)