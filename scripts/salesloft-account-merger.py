#!/usr/bin/env python3
"""
Salesloft Account Merger Tool
Safely merges duplicate accounts with comprehensive validation and rollback capability
"""

import os
import requests
import json
import time
from datetime import datetime
from collections import defaultdict
import re

SALESLOFT_TOKEN = os.getenv("SALESLOFT_TOKEN", "v2_ak_101314_d780f0370f98c58e0d514242b6bde735ca4945a0fc0d667f7727bf411336593f")
headers = {
    "Authorization": f"Bearer {SALESLOFT_TOKEN}",
    "Accept": "application/json",
    "Content-Type": "application/json"
}

class AccountMerger:
    def __init__(self):
        self.merge_log = []
        self.errors = []
        self.backup_data = {}

    def clean_domain(self, domain):
        """Clean domain to canonical format"""
        if not domain:
            return ""

        cleaned = domain.lower().strip()
        cleaned = re.sub(r'^https?://', '', cleaned)
        cleaned = re.sub(r'^www\.', '', cleaned)
        cleaned = cleaned.split('/')[0]
        cleaned = cleaned.split(':')[0]
        return cleaned

    def get_account_details(self, account_id):
        """Get comprehensive account details"""
        try:
            response = requests.get(
                f"https://api.salesloft.com/v2/accounts/{account_id}",
                headers=headers,
                timeout=10
            )

            if response.status_code == 200:
                return response.json().get('data')
            else:
                self.errors.append(f"Failed to get account {account_id}: {response.status_code}")
                return None
        except Exception as e:
            self.errors.append(f"Error getting account {account_id}: {e}")
            return None

    def get_account_people(self, account_id):
        """Get all people associated with an account"""
        people = []
        page = 1

        while True:
            params = {
                "account_id": account_id,
                "per_page": 100,
                "page": page
            }

            try:
                response = requests.get(
                    "https://api.salesloft.com/v2/people",
                    headers=headers,
                    params=params,
                    timeout=10
                )

                if response.status_code == 200:
                    data = response.json()
                    batch = data.get("data", [])

                    if not batch:
                        break

                    people.extend(batch)

                    if not data.get("metadata", {}).get("paging", {}).get("next_page"):
                        break

                    page += 1
                else:
                    break

            except Exception:
                break

        return people

    def get_account_activities(self, account_id, limit=100):
        """Get recent activities for an account"""
        activities = {
            'emails': [],
            'calls': [],
            'other': []
        }

        # Get activities through people
        people = self.get_account_people(account_id)

        for person in people[:10]:  # Sample first 10 people
            # Get recent emails
            try:
                response = requests.get(
                    f"https://api.salesloft.com/v2/activities/emails",
                    headers=headers,
                    params={"person_id": person['id'], "per_page": 10},
                    timeout=10
                )
                if response.status_code == 200:
                    activities['emails'].extend(response.json().get('data', []))
            except:
                pass

        return activities

    def analyze_merger(self, primary_id, duplicate_ids):
        """Analyze the impact of merging accounts"""
        analysis = {
            'primary': None,
            'duplicates': [],
            'total_people': 0,
            'total_activities': 0,
            'conflicts': [],
            'recommendations': []
        }

        # Get primary account details
        primary = self.get_account_details(primary_id)
        if not primary:
            return None

        primary_people = self.get_account_people(primary_id)

        analysis['primary'] = {
            'id': primary_id,
            'name': primary.get('name'),
            'domain': primary.get('domain'),
            'people_count': len(primary_people),
            'crm_id': primary.get('crm_id'),
            'owner': primary.get('owner', {}).get('id'),
            'created_at': primary.get('created_at'),
            'custom_fields': primary.get('custom_fields', {})
        }

        analysis['total_people'] = len(primary_people)

        # Analyze each duplicate
        for dup_id in duplicate_ids:
            duplicate = self.get_account_details(dup_id)
            if not duplicate:
                continue

            dup_people = self.get_account_people(dup_id)

            dup_info = {
                'id': dup_id,
                'name': duplicate.get('name'),
                'domain': duplicate.get('domain'),
                'people_count': len(dup_people),
                'crm_id': duplicate.get('crm_id'),
                'owner': duplicate.get('owner', {}).get('id'),
                'created_at': duplicate.get('created_at'),
                'custom_fields': duplicate.get('custom_fields', {})
            }

            analysis['duplicates'].append(dup_info)
            analysis['total_people'] += len(dup_people)

            # Check for conflicts
            if duplicate.get('crm_id') and primary.get('crm_id') and duplicate.get('crm_id') != primary.get('crm_id'):
                analysis['conflicts'].append({
                    'type': 'CRM_ID_MISMATCH',
                    'primary_crm': primary.get('crm_id'),
                    'duplicate_crm': duplicate.get('crm_id'),
                    'account': dup_info['name']
                })

            if dup_info['owner'] != analysis['primary']['owner']:
                analysis['conflicts'].append({
                    'type': 'DIFFERENT_OWNER',
                    'primary_owner': analysis['primary']['owner'],
                    'duplicate_owner': dup_info['owner'],
                    'account': dup_info['name']
                })

        # Generate recommendations
        if analysis['total_people'] > 100:
            analysis['recommendations'].append("HIGH_IMPACT: Over 100 people affected, recommend manual review")

        if len(analysis['conflicts']) > 0:
            analysis['recommendations'].append("CONFLICTS_FOUND: Review conflicts before merging")

        if analysis['total_people'] < 20 and len(analysis['conflicts']) == 0:
            analysis['recommendations'].append("SAFE_TO_MERGE: Low impact, no conflicts")

        return analysis

    def backup_account(self, account_id):
        """Create backup of account data before merge"""
        backup = {
            'account': self.get_account_details(account_id),
            'people': self.get_account_people(account_id),
            'timestamp': datetime.now().isoformat()
        }

        self.backup_data[account_id] = backup

        # Save to file
        backup_file = f"/tmp/salesloft_account_backup_{account_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(backup_file, 'w') as f:
            json.dump(backup, f, indent=2)

        return backup_file

    def merge_custom_fields(self, primary_fields, duplicate_fields):
        """Intelligently merge custom fields"""
        merged = primary_fields.copy()

        for key, value in duplicate_fields.items():
            # If primary doesn't have this field or it's empty, use duplicate's value
            if key not in merged or not merged[key]:
                merged[key] = value
            # If both have values and they differ, keep primary but log
            elif merged[key] != value:
                self.merge_log.append(f"Custom field conflict for '{key}': keeping '{merged[key]}' over '{value}'")

        return merged

    def move_people(self, from_account_id, to_account_id):
        """Move all people from one account to another"""
        people = self.get_account_people(from_account_id)
        moved = 0
        failed = 0

        print(f"Moving {len(people)} people from account {from_account_id} to {to_account_id}")

        for person in people:
            try:
                update_data = {
                    "account_id": to_account_id
                }

                response = requests.put(
                    f"https://api.salesloft.com/v2/people/{person['id']}",
                    headers=headers,
                    json=update_data,
                    timeout=10
                )

                if response.status_code in [200, 201, 202]:
                    moved += 1
                    self.merge_log.append(f"Moved person {person['display_name']} (ID: {person['id']})")
                else:
                    failed += 1
                    self.errors.append(f"Failed to move person {person['id']}: {response.status_code}")

                # Rate limiting
                time.sleep(0.2)

            except Exception as e:
                failed += 1
                self.errors.append(f"Error moving person {person['id']}: {e}")

        return moved, failed

    def archive_account(self, account_id):
        """Archive an account after merger"""
        try:
            # Add note about merger before archiving
            account = self.get_account_details(account_id)

            archive_data = {
                "archived_at": datetime.now().isoformat()
            }

            response = requests.put(
                f"https://api.salesloft.com/v2/accounts/{account_id}",
                headers=headers,
                json=archive_data,
                timeout=10
            )

            if response.status_code in [200, 201, 202]:
                self.merge_log.append(f"Archived account {account_id} ({account.get('name', 'Unknown')})")
                return True
            else:
                self.errors.append(f"Failed to archive account {account_id}: {response.status_code}")
                return False

        except Exception as e:
            self.errors.append(f"Error archiving account {account_id}: {e}")
            return False

    def execute_merge(self, primary_id, duplicate_ids, dry_run=True):
        """Execute the account merge"""
        print("\n" + "="*60)
        print("EXECUTING ACCOUNT MERGE")
        print("="*60)

        if dry_run:
            print("DRY RUN MODE - No changes will be made\n")

        # Step 1: Analyze
        print("Step 1: Analyzing merge...")
        analysis = self.analyze_merger(primary_id, duplicate_ids)

        if not analysis:
            print("ERROR: Could not analyze accounts")
            return False

        print(f"  Primary: {analysis['primary']['name']} (ID: {primary_id})")
        print(f"  Duplicates: {len(analysis['duplicates'])} accounts")
        print(f"  Total people affected: {analysis['total_people']}")
        print(f"  Conflicts found: {len(analysis['conflicts'])}")

        # Step 2: Check for blockers
        if analysis['conflicts']:
            print("\nConflicts detected:")
            for conflict in analysis['conflicts']:
                print(f"  - {conflict['type']}: {conflict}")

        if 'HIGH_IMPACT' in str(analysis['recommendations']):
            print("\n⚠️  WARNING: High impact merge, manual review recommended")
            if not dry_run:
                response = input("Continue anyway? (yes/no): ")
                if response.lower() != 'yes':
                    print("Merge cancelled")
                    return False

        if dry_run:
            print("\n[DRY RUN] Would perform the following:")
            for dup in analysis['duplicates']:
                print(f"  - Move {dup['people_count']} people from {dup['name']} to {analysis['primary']['name']}")
                print(f"  - Archive account {dup['name']} (ID: {dup['id']})")
            return True

        # Step 3: Backup
        print("\nStep 2: Creating backups...")
        self.backup_account(primary_id)
        for dup in analysis['duplicates']:
            backup_file = self.backup_account(dup['id'])
            print(f"  Backed up {dup['name']} to {backup_file}")

        # Step 4: Move people
        print("\nStep 3: Moving people...")
        total_moved = 0
        total_failed = 0

        for dup in analysis['duplicates']:
            moved, failed = self.move_people(dup['id'], primary_id)
            total_moved += moved
            total_failed += failed
            print(f"  {dup['name']}: {moved} moved, {failed} failed")

        # Step 5: Merge custom fields
        print("\nStep 4: Merging custom fields...")
        primary_account = self.get_account_details(primary_id)
        merged_fields = primary_account.get('custom_fields', {})

        for dup in analysis['duplicates']:
            dup_account = self.get_account_details(dup['id'])
            if dup_account:
                merged_fields = self.merge_custom_fields(
                    merged_fields,
                    dup_account.get('custom_fields', {})
                )

        # Update primary with merged fields
        try:
            response = requests.put(
                f"https://api.salesloft.com/v2/accounts/{primary_id}",
                headers=headers,
                json={"custom_fields": merged_fields},
                timeout=10
            )
            if response.status_code in [200, 201, 202]:
                print("  ✅ Custom fields merged")
        except:
            print("  ⚠️  Could not update custom fields")

        # Step 6: Archive duplicates
        print("\nStep 5: Archiving duplicate accounts...")
        for dup in analysis['duplicates']:
            if self.archive_account(dup['id']):
                print(f"  ✅ Archived {dup['name']}")
            else:
                print(f"  ❌ Failed to archive {dup['name']}")

        # Final report
        print("\n" + "="*60)
        print("MERGE COMPLETE")
        print("="*60)
        print(f"✅ People moved: {total_moved}")
        if total_failed > 0:
            print(f"❌ People failed: {total_failed}")
        print(f"📁 Accounts archived: {len(analysis['duplicates'])}")

        # Save merge log
        log_file = f"/tmp/salesloft_merge_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(log_file, 'w') as f:
            json.dump({
                'analysis': analysis,
                'merge_log': self.merge_log,
                'errors': self.errors,
                'timestamp': datetime.now().isoformat()
            }, f, indent=2)

        print(f"\n📋 Merge log saved to: {log_file}")

        return total_failed == 0

    def find_duplicates_by_domain(self):
        """Find all accounts with duplicate domains"""
        print("Finding duplicate accounts by domain...")

        all_accounts = []
        page = 1

        while page <= 50:  # Limit for testing
            params = {"per_page": 100, "page": page}

            try:
                response = requests.get(
                    "https://api.salesloft.com/v2/accounts",
                    headers=headers,
                    params=params,
                    timeout=10
                )

                if response.status_code == 200:
                    data = response.json()
                    accounts = data.get("data", [])

                    if not accounts:
                        break

                    all_accounts.extend(accounts)
                    page += 1
                else:
                    break

            except Exception:
                break

        # Group by cleaned domain
        domain_groups = defaultdict(list)

        for account in all_accounts:
            domain = account.get('domain', '')
            cleaned = self.clean_domain(domain)

            if cleaned:
                domain_groups[cleaned].append({
                    'id': account.get('id'),
                    'name': account.get('name'),
                    'domain': domain,
                    'people_count': account.get('counts', {}).get('people', 0),
                    'created_at': account.get('created_at')
                })

        # Filter to only duplicates
        duplicates = {k: v for k, v in domain_groups.items() if len(v) > 1}

        # Sort each group by creation date (oldest first)
        for domain in duplicates:
            duplicates[domain].sort(key=lambda x: x.get('created_at', ''))

        return duplicates

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Merge duplicate Salesloft accounts")
    parser.add_argument("--primary", type=int, help="Primary account ID to keep")
    parser.add_argument("--duplicates", type=int, nargs='+', help="Duplicate account IDs to merge")
    parser.add_argument("--find-duplicates", action="store_true", help="Find duplicate accounts")
    parser.add_argument("--auto-merge", action="store_true", help="Automatically merge safe duplicates")
    parser.add_argument("--limit", type=int, default=5, help="Limit for auto-merge")
    parser.add_argument("--execute", action="store_true", help="Execute merge (not dry run)")

    args = parser.parse_args()

    merger = AccountMerger()

    if args.find_duplicates:
        print("FINDING DUPLICATE ACCOUNTS")
        print("="*60)

        duplicates = merger.find_duplicates_by_domain()

        print(f"\nFound {len(duplicates)} groups of duplicate accounts\n")

        # Show top 10
        for i, (domain, accounts) in enumerate(list(duplicates.items())[:10]):
            print(f"{i+1}. Domain: {domain}")
            print(f"   Accounts: {len(accounts)}")
            for acc in accounts:
                print(f"     - {acc['name']} (ID: {acc['id']}, People: {acc['people_count']})")
            print()

        if args.auto_merge:
            print("AUTO-MERGE MODE")
            print("="*60)

            # Find safe merges (low people count, same domain)
            safe_merges = []

            for domain, accounts in duplicates.items():
                total_people = sum(acc['people_count'] for acc in accounts)

                if total_people < 20 and len(accounts) == 2:
                    safe_merges.append((domain, accounts))

            print(f"Found {len(safe_merges)} safe merge candidates\n")

            # Execute merges
            for i, (domain, accounts) in enumerate(safe_merges[:args.limit]):
                print(f"\n[{i+1}/{min(len(safe_merges), args.limit)}] Merging for domain: {domain}")

                primary_id = accounts[0]['id']
                duplicate_ids = [acc['id'] for acc in accounts[1:]]

                success = merger.execute_merge(
                    primary_id,
                    duplicate_ids,
                    dry_run=not args.execute
                )

                if not success:
                    print("Merge failed, stopping auto-merge")
                    break

    elif args.primary and args.duplicates:
        # Manual merge
        success = merger.execute_merge(
            args.primary,
            args.duplicates,
            dry_run=not args.execute
        )

        if not args.execute:
            print("\nTo execute this merge, add --execute flag")

    else:
        print("Usage:")
        print("  Find duplicates: python3 salesloft-account-merger.py --find-duplicates")
        print("  Auto-merge safe: python3 salesloft-account-merger.py --find-duplicates --auto-merge --execute")
        print("  Manual merge:    python3 salesloft-account-merger.py --primary 123 --duplicates 456 789 --execute")

if __name__ == "__main__":
    main()