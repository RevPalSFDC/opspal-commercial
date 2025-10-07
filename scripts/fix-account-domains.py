#!/usr/bin/env python3
"""
Fix malformed domains in Salesloft accounts
"""

import os
import requests
import json
import re
import time
from datetime import datetime

SALESLOFT_TOKEN = os.getenv("SALESLOFT_TOKEN", "v2_ak_101314_d780f0370f98c58e0d514242b6bde735ca4945a0fc0d667f7727bf411336593f")
headers = {
    "Authorization": f"Bearer {SALESLOFT_TOKEN}",
    "Accept": "application/json",
    "Content-Type": "application/json"
}

def clean_domain(domain):
    """Clean a domain to proper format"""
    if not domain:
        return domain

    # Convert to lowercase
    cleaned = domain.lower().strip()

    # Remove protocol
    cleaned = re.sub(r'^https?://', '', cleaned)

    # Remove www
    cleaned = re.sub(r'^www\.', '', cleaned)

    # Remove trailing slashes and paths
    cleaned = cleaned.split('/')[0]

    # Remove any port numbers
    cleaned = cleaned.split(':')[0]

    return cleaned

def get_all_accounts_with_bad_domains():
    """Get all accounts with malformed domains"""
    print("SCANNING ALL ACCOUNTS FOR MALFORMED DOMAINS")
    print("="*60)

    all_accounts = []
    page = 1

    while True:
        params = {
            "per_page": 100,
            "page": page
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

                for account in accounts:
                    domain = account.get('domain', '')
                    if domain and any(x in domain for x in ['http://', 'https://', 'www.', '//']):
                        cleaned = clean_domain(domain)
                        all_accounts.append({
                            'id': account.get('id'),
                            'name': account.get('name', 'Unknown'),
                            'original_domain': domain,
                            'cleaned_domain': cleaned,
                            'crm_id': account.get('crm_id'),
                            'owner': account.get('owner', {}).get('name', 'Unknown')
                        })

                print(f"  Page {page}: Found {len(accounts)} accounts, {len([a for a in accounts if a.get('domain') and any(x in a.get('domain') for x in ['http://', 'https://', 'www.', '//'])])} need cleaning")

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

def fix_account_domains(accounts, dry_run=True):
    """Fix the malformed domains"""
    print("\n" + "="*60)
    print(f"FIXING {len(accounts)} ACCOUNT DOMAINS")
    print("="*60)

    if dry_run:
        print("DRY RUN MODE - No changes will be made\n")
    else:
        print("LIVE MODE - Changes will be applied\n")

    fixed = 0
    errors = 0
    skipped = 0

    # Group by cleaned domain to identify conflicts
    domain_groups = {}
    for account in accounts:
        cleaned = account['cleaned_domain']
        if cleaned not in domain_groups:
            domain_groups[cleaned] = []
        domain_groups[cleaned].append(account)

    # Show potential conflicts
    conflicts = {d: accs for d, accs in domain_groups.items() if len(accs) > 1}
    if conflicts:
        print("⚠️  POTENTIAL CONFLICTS DETECTED:")
        print("-"*40)
        for domain, accs in list(conflicts.items())[:5]:
            print(f"\nDomain: {domain}")
            for acc in accs:
                print(f"  - {acc['name'][:40]:40} | Current: {acc['original_domain']}")

    print("\n" + "="*60)
    print("PROCESSING ACCOUNTS")
    print("="*60)

    for i, account in enumerate(accounts):
        # Skip if this would create a conflict
        if account['cleaned_domain'] in conflicts:
            print(f"\n[{i+1}/{len(accounts)}] {account['name']}")
            print(f"  ⚠️  SKIPPED - Would conflict with other account using {account['cleaned_domain']}")
            skipped += 1
            continue

        print(f"\n[{i+1}/{len(accounts)}] {account['name']}")
        print(f"  Original: {account['original_domain']}")
        print(f"  Cleaned:  {account['cleaned_domain']}")

        if not dry_run:
            try:
                # Update the account
                update_data = {
                    "domain": account['cleaned_domain']
                }

                response = requests.put(
                    f"https://api.salesloft.com/v2/accounts/{account['id']}",
                    headers=headers,
                    json=update_data,
                    timeout=10
                )

                if response.status_code in [200, 201, 202]:
                    print(f"  ✅ Fixed successfully")
                    fixed += 1
                else:
                    print(f"  ❌ Error: {response.status_code}")
                    if response.text:
                        error_msg = response.text[:200]
                        print(f"     {error_msg}")

                        # Check for duplicate key error
                        if "duplicate key" in error_msg.lower():
                            print(f"  ⚠️  Domain {account['cleaned_domain']} already exists on another account")

                    errors += 1

                # Rate limiting
                time.sleep(0.5)

            except Exception as e:
                print(f"  ❌ Exception: {e}")
                errors += 1
        else:
            print(f"  [DRY RUN] Would update domain")
            fixed += 1

        # Stop after 10 in dry run mode for review
        if dry_run and i >= 9:
            print(f"\n... and {len(accounts) - 10} more accounts")
            break

    return fixed, errors, skipped

def generate_report(accounts):
    """Generate detailed report"""

    # Analyze patterns
    patterns = {
        'http://www.': [],
        'https://www.': [],
        'http://': [],
        'https://': [],
        'www.': [],
        'trailing_slash': []
    }

    for account in accounts:
        domain = account['original_domain']
        if domain.startswith('http://www.'):
            patterns['http://www.'].append(account)
        elif domain.startswith('https://www.'):
            patterns['https://www.'].append(account)
        elif domain.startswith('http://'):
            patterns['http://'].append(account)
        elif domain.startswith('https://'):
            patterns['https://'].append(account)
        elif domain.startswith('www.'):
            patterns['www.'].append(account)
        if domain.endswith('/'):
            patterns['trailing_slash'].append(account)

    # Save full report
    report_file = f"/tmp/salesloft_account_domains_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

    report = {
        "timestamp": datetime.now().isoformat(),
        "total_accounts_with_issues": len(accounts),
        "pattern_breakdown": {k: len(v) for k, v in patterns.items()},
        "accounts": accounts
    }

    with open(report_file, 'w') as f:
        json.dump(report, f, indent=2)

    # Create CSV for easy review
    csv_file = f"/tmp/salesloft_account_domains_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

    with open(csv_file, 'w') as f:
        f.write("Account Name,Original Domain,Cleaned Domain,Owner,Account ID,CRM ID\n")
        for acc in accounts:
            f.write(f'"{acc["name"]}","{acc["original_domain"]}","{acc["cleaned_domain"]}","{acc["owner"]}",{acc["id"]},{acc["crm_id"] or "None"}\n')

    print(f"\nReports saved:")
    print(f"  JSON: {report_file}")
    print(f"  CSV:  {csv_file}")

    return patterns

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Fix malformed domains in Salesloft accounts")
    parser.add_argument("--fix", action="store_true", help="Actually fix the domains (not just scan)")
    parser.add_argument("--limit", type=int, help="Limit number of accounts to fix")

    args = parser.parse_args()

    print("SALESLOFT ACCOUNT DOMAIN CLEANUP")
    print("="*60)
    print(f"Mode: {'FIX MODE' if args.fix else 'SCAN ONLY (Dry Run)'}")
    print()

    # Get all accounts with issues
    accounts = get_all_accounts_with_bad_domains()

    if not accounts:
        print("\n✅ No accounts with malformed domains found!")
        return

    # Generate report
    patterns = generate_report(accounts)

    # Show summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print(f"Total accounts with malformed domains: {len(accounts)}")
    print("\nPattern breakdown:")
    for pattern, count in sorted([(k, len(v)) for k, v in patterns.items()], key=lambda x: x[1], reverse=True):
        if count > 0:
            print(f"  {pattern:20} {count:4} accounts")

    print("\nTop 10 accounts needing cleanup:")
    for acc in accounts[:10]:
        print(f"  {acc['name'][:40]:40} | {acc['original_domain']} → {acc['cleaned_domain']}")

    # Apply fixes if requested
    if args.fix:
        print("\n" + "="*60)
        print("READY TO FIX DOMAINS")
        print("="*60)

        to_fix = accounts[:args.limit] if args.limit else accounts
        print(f"\nWill fix {len(to_fix)} account domains")
        print("This will clean domains by removing http://, https://, www., and trailing slashes")

        # Auto-proceed for automated execution
        print("\nProceeding with fixes...")
        fixed, errors, skipped = fix_account_domains(to_fix, dry_run=False)

        print("\n" + "="*60)
        print("RESULTS")
        print("="*60)
        print(f"✅ Fixed:   {fixed}")
        print(f"❌ Errors:  {errors}")
        print(f"⚠️  Skipped: {skipped}")
    else:
        # Show what would be fixed
        print("\n" + "="*60)
        print("DRY RUN - WHAT WOULD BE FIXED")
        print("="*60)

        to_show = accounts[:10]
        fixed, errors, skipped = fix_account_domains(to_show, dry_run=True)

        print(f"\n📝 To apply these fixes, run with --fix flag")
        print(f"   Example: python3 {__file__} --fix --limit 10")

if __name__ == "__main__":
    main()