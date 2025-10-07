#!/usr/bin/env python3
"""
Analyze and merge duplicate accounts in Salesloft
"""

import os
import requests
import json
from datetime import datetime
from collections import defaultdict
import re

SALESLOFT_TOKEN = os.getenv("SALESLOFT_TOKEN", "v2_ak_101314_d780f0370f98c58e0d514242b6bde735ca4945a0fc0d667f7727bf411336593f")
headers = {
    "Authorization": f"Bearer {SALESLOFT_TOKEN}",
    "Accept": "application/json",
    "Content-Type": "application/json"
}

def clean_domain(domain):
    """Clean a domain to proper format for comparison"""
    if not domain:
        return ""

    cleaned = domain.lower().strip()
    cleaned = re.sub(r'^https?://', '', cleaned)
    cleaned = re.sub(r'^www\.', '', cleaned)
    cleaned = cleaned.split('/')[0]
    cleaned = cleaned.split(':')[0]

    return cleaned

def get_all_accounts():
    """Fetch all accounts from Salesloft"""
    print("Fetching all accounts from Salesloft...")
    all_accounts = []
    page = 1

    while True:
        params = {
            "per_page": 100,
            "page": page,
            "include_paging_counts": "true"
        }

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
                print(f"  Fetched page {page}: {len(accounts)} accounts")

                # Check for next page
                if not data.get("metadata", {}).get("paging", {}).get("next_page"):
                    break

                page += 1
            else:
                print(f"Error fetching page {page}: {response.status_code}")
                break

        except Exception as e:
            print(f"Error: {e}")
            break

    return all_accounts

def find_duplicates(accounts):
    """Find duplicate accounts by various criteria"""
    print("\nAnalyzing duplicates...")

    duplicates = {
        'by_domain': defaultdict(list),
        'by_name': defaultdict(list),
        'by_crm_id': defaultdict(list),
        'by_cleaned_domain': defaultdict(list)
    }

    for account in accounts:
        # Group by exact domain
        domain = account.get('domain', '').lower()
        if domain:
            duplicates['by_domain'][domain].append(account)

        # Group by cleaned domain
        cleaned = clean_domain(domain)
        if cleaned:
            duplicates['by_cleaned_domain'][cleaned].append(account)

        # Group by name (case insensitive)
        name = account.get('name', '').lower().strip()
        if name:
            duplicates['by_name'][name].append(account)

        # Group by CRM ID
        crm_id = account.get('crm_id')
        if crm_id:
            duplicates['by_crm_id'][crm_id].append(account)

    # Filter to only keep actual duplicates (2+ accounts)
    for dup_type in duplicates:
        duplicates[dup_type] = {k: v for k, v in duplicates[dup_type].items() if len(v) > 1}

    return duplicates

def analyze_merge_candidates(duplicates):
    """Analyze which accounts should be merged"""
    merge_candidates = []

    # Focus on cleaned domain duplicates (most reliable indicator)
    for domain, accounts in duplicates['by_cleaned_domain'].items():
        if len(accounts) > 1:
            # Sort by creation date (oldest first)
            accounts.sort(key=lambda x: x.get('created_at', ''))

            primary = accounts[0]  # Keep oldest
            duplicates_to_merge = accounts[1:]

            # Calculate merge impact
            total_people = 0
            for acc in accounts:
                counts = acc.get('counts', {})
                if counts and 'people' in counts:
                    people_count = counts.get('people', 0)
                    if people_count is not None:
                        total_people += people_count

            merge_candidates.append({
                'domain': domain,
                'primary_account': {
                    'id': primary.get('id'),
                    'name': primary.get('name'),
                    'created': primary.get('created_at'),
                    'people_count': primary.get('counts', {}).get('people', 0),
                    'crm_id': primary.get('crm_id'),
                    'owner': primary.get('owner', {}).get('id')
                },
                'duplicate_accounts': [
                    {
                        'id': acc.get('id'),
                        'name': acc.get('name'),
                        'created': acc.get('created_at'),
                        'people_count': acc.get('counts', {}).get('people', 0),
                        'crm_id': acc.get('crm_id'),
                        'owner': acc.get('owner', {}).get('id')
                    }
                    for acc in duplicates_to_merge
                ],
                'total_people': total_people,
                'merge_complexity': 'high' if total_people > 100 else 'medium' if total_people > 20 else 'low'
            })

    return merge_candidates

def get_people_for_account(account_id):
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

def merge_accounts(primary_id, duplicate_id, dry_run=True):
    """Merge duplicate account into primary account"""
    if dry_run:
        print(f"  [DRY RUN] Would merge account {duplicate_id} into {primary_id}")
        return True

    # Step 1: Get all people from duplicate account
    people = get_people_for_account(duplicate_id)

    # Step 2: Move people to primary account
    moved = 0
    errors = 0

    for person in people:
        try:
            update_data = {
                "account_id": primary_id
            }

            response = requests.put(
                f"https://api.salesloft.com/v2/people/{person['id']}",
                headers=headers,
                json=update_data,
                timeout=10
            )

            if response.status_code in [200, 201, 202]:
                moved += 1
            else:
                errors += 1

        except Exception:
            errors += 1

    print(f"  Moved {moved} people, {errors} errors")

    # Step 3: Archive the duplicate account
    if moved > 0 and errors == 0:
        try:
            archive_data = {
                "archived_at": datetime.now().isoformat()
            }

            response = requests.put(
                f"https://api.salesloft.com/v2/accounts/{duplicate_id}",
                headers=headers,
                json=archive_data,
                timeout=10
            )

            if response.status_code in [200, 201, 202]:
                print(f"  Archived duplicate account {duplicate_id}")
                return True

        except Exception:
            pass

    return False

def generate_merge_report(merge_candidates):
    """Generate detailed merge report"""
    report_file = f"/tmp/salesloft_merge_analysis_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    csv_file = f"/tmp/salesloft_merge_plan_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

    # Sort by merge complexity
    merge_candidates.sort(key=lambda x: (x['merge_complexity'], -x['total_people']))

    report = {
        "timestamp": datetime.now().isoformat(),
        "total_merge_groups": len(merge_candidates),
        "total_accounts_to_merge": sum(len(mc['duplicate_accounts']) for mc in merge_candidates),
        "total_people_affected": sum(mc['total_people'] for mc in merge_candidates),
        "merge_candidates": merge_candidates
    }

    with open(report_file, 'w') as f:
        json.dump(report, f, indent=2)

    # Create CSV for easy review
    with open(csv_file, 'w') as f:
        f.write("Domain,Primary Account,Primary ID,Duplicates,Total People,Complexity,Action\n")
        for mc in merge_candidates:
            dup_names = "; ".join([d['name'] for d in mc['duplicate_accounts']])
            f.write(f'"{mc["domain"]}","{mc["primary_account"]["name"]}",{mc["primary_account"]["id"]},"{dup_names}",{mc["total_people"]},{mc["merge_complexity"]},MERGE\n')

    print(f"\nReports saved:")
    print(f"  JSON: {report_file}")
    print(f"  CSV:  {csv_file}")

    return report

def execute_safe_merges(merge_candidates, limit=5):
    """Execute safe merges (low complexity, same owner)"""
    safe_merges = []

    for mc in merge_candidates:
        # Only merge if:
        # 1. Low complexity (few people)
        # 2. Same owner
        # 3. No CRM ID conflicts

        primary_owner = mc['primary_account'].get('owner')
        all_same_owner = all(
            d.get('owner') == primary_owner
            for d in mc['duplicate_accounts']
        )

        has_crm_conflicts = (
            mc['primary_account'].get('crm_id') and
            any(d.get('crm_id') for d in mc['duplicate_accounts'])
        )

        if mc['merge_complexity'] == 'low' and all_same_owner and not has_crm_conflicts:
            safe_merges.append(mc)

    return safe_merges[:limit]

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Analyze and merge duplicate Salesloft accounts")
    parser.add_argument("--merge", action="store_true", help="Execute safe merges")
    parser.add_argument("--limit", type=int, default=5, help="Limit number of merges")
    parser.add_argument("--force", action="store_true", help="Merge even complex duplicates")

    args = parser.parse_args()

    print("SALESLOFT DUPLICATE ACCOUNT ANALYZER")
    print("="*60)

    # Get all accounts
    accounts = get_all_accounts()
    print(f"\nTotal accounts: {len(accounts)}")

    # Find duplicates
    duplicates = find_duplicates(accounts)

    # Display duplicate summary
    print("\nDuplicate Summary:")
    print(f"  By domain: {len(duplicates['by_domain'])} groups")
    print(f"  By cleaned domain: {len(duplicates['by_cleaned_domain'])} groups")
    print(f"  By name: {len(duplicates['by_name'])} groups")
    print(f"  By CRM ID: {len(duplicates['by_crm_id'])} groups")

    # Analyze merge candidates
    merge_candidates = analyze_merge_candidates(duplicates)

    if not merge_candidates:
        print("\nNo merge candidates found!")
        return

    # Generate report
    report = generate_merge_report(merge_candidates)

    # Display merge summary
    print("\n" + "="*60)
    print("MERGE ANALYSIS")
    print("="*60)
    print(f"Total merge groups: {len(merge_candidates)}")
    print(f"Total duplicates to merge: {sum(len(mc['duplicate_accounts']) for mc in merge_candidates)}")
    print(f"Total people affected: {sum(mc['total_people'] for mc in merge_candidates)}")

    # Complexity breakdown
    by_complexity = defaultdict(int)
    for mc in merge_candidates:
        by_complexity[mc['merge_complexity']] += 1

    print("\nBy Complexity:")
    for complexity, count in sorted(by_complexity.items()):
        print(f"  {complexity}: {count} groups")

    # Show top 10 candidates
    print("\nTop 10 Merge Candidates:")
    for mc in merge_candidates[:10]:
        print(f"\n  Domain: {mc['domain']}")
        print(f"    Primary: {mc['primary_account']['name']} (ID: {mc['primary_account']['id']})")
        print(f"    Duplicates: {', '.join([d['name'] for d in mc['duplicate_accounts']])}")
        print(f"    Total people: {mc['total_people']}")
        print(f"    Complexity: {mc['merge_complexity']}")

    # Execute merges if requested
    if args.merge:
        print("\n" + "="*60)
        print("EXECUTING MERGES")
        print("="*60)

        if args.force:
            to_merge = merge_candidates[:args.limit]
        else:
            to_merge = execute_safe_merges(merge_candidates, args.limit)

        if not to_merge:
            print("No safe merges available. Use --force to merge complex duplicates.")
            return

        print(f"\nWill merge {len(to_merge)} groups")

        for mc in to_merge:
            print(f"\nMerging duplicates for domain: {mc['domain']}")
            print(f"  Primary: {mc['primary_account']['name']}")

            for dup in mc['duplicate_accounts']:
                success = merge_accounts(
                    mc['primary_account']['id'],
                    dup['id'],
                    dry_run=False
                )

                if success:
                    print(f"    ✅ Merged: {dup['name']}")
                else:
                    print(f"    ❌ Failed: {dup['name']}")

if __name__ == "__main__":
    main()