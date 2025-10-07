#!/usr/bin/env python3
"""
Find and fix all companies and people with malformed domains in Salesloft
"""

import os
import requests
import json
import re
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

    # Remove trailing slashes
    cleaned = cleaned.rstrip('/')

    # Remove any remaining //
    cleaned = cleaned.replace('//', '')

    return cleaned

def scan_companies():
    """Scan all companies for malformed domains"""
    print("SCANNING COMPANIES FOR MALFORMED DOMAINS")
    print("="*60)

    companies_to_fix = []
    page = 1
    total_scanned = 0

    while True:
        params = {
            "per_page": 100,
            "page": page
        }

        try:
            response = requests.get(
                "https://api.salesloft.com/v2/companies",
                headers=headers,
                params=params,
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                companies = data.get("data", [])

                if not companies:
                    break

                for company in companies:
                    total_scanned += 1
                    domain = company.get('domain', '')

                    if domain:
                        # Check if domain needs cleaning
                        if any(x in domain for x in ['http://', 'https://', 'www.', '//']):
                            cleaned = clean_domain(domain)
                            companies_to_fix.append({
                                'id': company.get('id'),
                                'name': company.get('name', 'Unknown'),
                                'original_domain': domain,
                                'cleaned_domain': cleaned,
                                'created_at': company.get('created_at', ''),
                                'updated_at': company.get('updated_at', '')
                            })

                # Check if more pages
                if not data.get("metadata", {}).get("paging", {}).get("next_page"):
                    break

                page += 1
                print(f"  Scanned {total_scanned} companies so far...")

            else:
                print(f"Error fetching companies: {response.status_code}")
                break

        except Exception as e:
            print(f"Error scanning companies: {e}")
            break

    print(f"\nTotal companies scanned: {total_scanned}")
    print(f"Companies needing domain cleanup: {len(companies_to_fix)}")

    return companies_to_fix

def scan_people():
    """Scan people for those linked to malformed company domains"""
    print("\nSCANNING PEOPLE RECORDS")
    print("="*60)

    people_with_issues = []
    page = 1
    total_scanned = 0

    while page <= 5:  # Limit to first 500 people for now
        params = {
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
                people = data.get("data", [])

                if not people:
                    break

                for person in people:
                    total_scanned += 1

                    # Check website field
                    website = person.get('website', '')
                    if website and any(x in website for x in ['http://', 'https://', 'www.']):
                        people_with_issues.append({
                            'id': person.get('id'),
                            'name': person.get('display_name', 'Unknown'),
                            'email': person.get('email_address', ''),
                            'company': person.get('company_name', ''),
                            'website': website,
                            'cleaned_website': clean_domain(website)
                        })

                page += 1
                print(f"  Scanned {total_scanned} people so far...")

            else:
                print(f"Error fetching people: {response.status_code}")
                break

        except Exception as e:
            print(f"Error scanning people: {e}")
            break

    print(f"\nTotal people scanned: {total_scanned}")
    print(f"People with website issues: {len(people_with_issues)}")

    return people_with_issues

def fix_company_domains(companies_to_fix, dry_run=True):
    """Fix malformed company domains"""
    print("\n" + "="*60)
    print("FIXING COMPANY DOMAINS")
    print("="*60)

    if dry_run:
        print("DRY RUN MODE - No changes will be made")

    fixed_count = 0
    error_count = 0

    for company in companies_to_fix[:50]:  # Limit to 50 for safety
        print(f"\nCompany: {company['name']}")
        print(f"  Original domain: {company['original_domain']}")
        print(f"  Cleaned domain: {company['cleaned_domain']}")

        if not dry_run:
            try:
                # Update company domain
                update_data = {
                    "domain": company['cleaned_domain']
                }

                response = requests.patch(
                    f"https://api.salesloft.com/v2/companies/{company['id']}",
                    headers=headers,
                    json=update_data,
                    timeout=10
                )

                if response.status_code in [200, 201]:
                    print(f"  ✅ Fixed successfully")
                    fixed_count += 1
                else:
                    print(f"  ❌ Error: {response.status_code} - {response.text[:100]}")
                    error_count += 1

            except Exception as e:
                print(f"  ❌ Error fixing: {e}")
                error_count += 1
        else:
            print(f"  [DRY RUN] Would fix domain")
            fixed_count += 1

    return fixed_count, error_count

def generate_report(companies_to_fix, people_with_issues):
    """Generate detailed report of findings"""

    report_file = f"/tmp/salesloft_domain_cleanup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

    # Group companies by domain pattern
    patterns = {
        'has_https': [],
        'has_http': [],
        'has_www': [],
        'has_double_slash': [],
        'has_trailing_slash': []
    }

    for company in companies_to_fix:
        domain = company['original_domain']
        if 'https://' in domain:
            patterns['has_https'].append(company)
        if 'http://' in domain and 'https://' not in domain:
            patterns['has_http'].append(company)
        if 'www.' in domain:
            patterns['has_www'].append(company)
        if '//' in domain:
            patterns['has_double_slash'].append(company)
        if domain.endswith('/'):
            patterns['has_trailing_slash'].append(company)

    report = {
        "scan_timestamp": datetime.now().isoformat(),
        "summary": {
            "companies_with_malformed_domains": len(companies_to_fix),
            "people_with_website_issues": len(people_with_issues),
            "pattern_breakdown": {
                "https_prefix": len(patterns['has_https']),
                "http_prefix": len(patterns['has_http']),
                "www_prefix": len(patterns['has_www']),
                "double_slash": len(patterns['has_double_slash']),
                "trailing_slash": len(patterns['has_trailing_slash'])
            }
        },
        "companies_to_fix": companies_to_fix,
        "people_with_issues": people_with_issues,
        "patterns": patterns
    }

    with open(report_file, 'w') as f:
        json.dump(report, f, indent=2)

    print(f"\nDetailed report saved to: {report_file}")

    # Also create CSV for easy viewing
    csv_file = f"/tmp/salesloft_domains_to_fix_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    with open(csv_file, 'w') as f:
        f.write("Type,Name,Original,Cleaned,ID\n")
        for company in companies_to_fix:
            f.write(f"Company,\"{company['name']}\",\"{company['original_domain']}\",\"{company['cleaned_domain']}\",{company['id']}\n")
        for person in people_with_issues:
            f.write(f"Person,\"{person['name']}\",\"{person['website']}\",\"{person['cleaned_website']}\",{person['id']}\n")

    print(f"CSV report saved to: {csv_file}")

    return report

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Find and fix malformed domains in Salesloft")
    parser.add_argument("--fix", action="store_true", help="Actually fix the domains (not just report)")
    parser.add_argument("--limit", type=int, default=50, help="Limit number of fixes")

    args = parser.parse_args()

    print("SALESLOFT DOMAIN CLEANUP TOOL")
    print("="*60)
    print(f"Mode: {'FIX MODE' if args.fix else 'SCAN ONLY'}")
    print()

    # Scan for issues
    companies_to_fix = scan_companies()
    people_with_issues = scan_people()

    # Generate report
    report = generate_report(companies_to_fix, people_with_issues)

    # Display findings
    print("\n" + "="*60)
    print("FINDINGS SUMMARY")
    print("="*60)

    if companies_to_fix:
        print(f"\n🏢 COMPANIES NEEDING CLEANUP: {len(companies_to_fix)}")
        print("\nTop 10 companies with malformed domains:")
        for company in companies_to_fix[:10]:
            print(f"  {company['name'][:30]:30} | {company['original_domain']} → {company['cleaned_domain']}")

    if people_with_issues:
        print(f"\n👥 PEOPLE WITH WEBSITE ISSUES: {len(people_with_issues)}")
        print("\nTop 10 people with malformed websites:")
        for person in people_with_issues[:10]:
            print(f"  {person['name'][:30]:30} | {person['website']} → {person['cleaned_website']}")

    # Pattern analysis
    print("\n📊 PATTERN ANALYSIS:")
    for pattern, companies in report['patterns'].items():
        if companies:
            print(f"  {pattern}: {len(companies)} companies")

    # Fix if requested
    if args.fix and companies_to_fix:
        print("\n" + "="*60)
        print("APPLYING FIXES")
        print("="*60)

        response = input(f"\nReady to fix {min(len(companies_to_fix), args.limit)} companies? (yes/no): ")
        if response.lower() == 'yes':
            fixed, errors = fix_company_domains(companies_to_fix[:args.limit], dry_run=False)
            print(f"\n✅ Fixed: {fixed}")
            print(f"❌ Errors: {errors}")
        else:
            print("Cancelled - no changes made")
    else:
        # Show what would be fixed
        if companies_to_fix:
            print("\n" + "="*60)
            print("WHAT WOULD BE FIXED")
            print("="*60)
            fixed, errors = fix_company_domains(companies_to_fix[:10], dry_run=True)
            print(f"\nTo apply fixes, run with --fix flag")

if __name__ == "__main__":
    main()