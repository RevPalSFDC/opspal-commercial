#!/usr/bin/env python3
"""
Find all duplicate domain constraint errors in Salesloft sync logs
"""

import os
import sys
import json
import requests
from datetime import datetime, timedelta, timezone
from collections import defaultdict
import re

BASE_URL = "https://api.salesloft.com/v2"
TOKEN = os.getenv("SALESLOFT_TOKEN")

if not TOKEN:
    print("Error: SALESLOFT_TOKEN not set")
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json"
}

def search_duplicate_errors():
    """Search for all duplicate domain constraint errors"""
    
    print("Searching for duplicate domain constraint errors...")
    print("=" * 80)
    
    duplicate_errors = []
    affected_domains = defaultdict(list)
    error_by_type = defaultdict(int)
    
    # Search last 30 days of activities
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=30)
    
    page = 1
    total_scanned = 0
    
    while page <= 50:  # Scan up to 50 pages
        params = {
            "created_at[gte]": start_date.isoformat(),
            "created_at[lte]": end_date.isoformat(),
            "per_page": 100,
            "page": page,
            "sort": "created_at",
            "sort_direction": "desc"
        }
        
        try:
            response = requests.get(f"{BASE_URL}/crm_activities", headers=HEADERS, params=params, timeout=30)
            
            if response.status_code == 429:
                import time
                time.sleep(2)
                continue
                
            if response.status_code != 200:
                break
                
            data = response.json()
            activities = data.get("data", [])
            
            if not activities:
                break
            
            total_scanned += len(activities)
            
            for activity in activities:
                error = activity.get("error")
                if not error:
                    continue
                
                # Check for duplicate key constraint errors
                if "duplicate key value violates unique constraint" in error:
                    # Extract domain from error
                    domain_match = re.search(r'\(domain, team_id\)=\(([^,]+),', error)
                    if domain_match:
                        domain = domain_match.group(1)
                        
                        error_detail = {
                            "id": activity.get("id"),
                            "type": activity.get("activity_type"),
                            "created_at": activity.get("created_at"),
                            "domain": domain,
                            "error": error,
                            "subject": activity.get("subject", "")[:100],
                            "crm_id": activity.get("crm_id")
                        }
                        
                        duplicate_errors.append(error_detail)
                        affected_domains[domain].append(error_detail)
                        error_by_type[activity.get("activity_type", "unknown")] += 1
                
                # Also check for other PostgreSQL errors that might be related
                elif "PG::" in error or "PostgreSQL" in error:
                    if "domain" in error.lower():
                        error_detail = {
                            "id": activity.get("id"),
                            "type": activity.get("activity_type"),
                            "created_at": activity.get("created_at"),
                            "error": error[:200],
                            "subject": activity.get("subject", "")[:100]
                        }
                        duplicate_errors.append(error_detail)
                        error_by_type[activity.get("activity_type", "unknown")] += 1
            
            print(f"Page {page}: Scanned {len(activities)} activities, found {len([e for e in duplicate_errors if e['id'] in [a.get('id') for a in activities]])} errors")
            page += 1
            
        except Exception as e:
            print(f"Error on page {page}: {e}")
            break
    
    print(f"\nTotal activities scanned: {total_scanned}")
    
    return duplicate_errors, affected_domains, error_by_type

def analyze_accounts_and_contacts(affected_domains):
    """Check which accounts and contacts are affected"""
    
    print("\nAnalyzing affected accounts and contacts...")
    
    affected_accounts = set()
    affected_people = set()
    
    for domain in affected_domains.keys():
        # Search for accounts with this domain
        try:
            response = requests.get(
                f"{BASE_URL}/accounts",
                headers=HEADERS,
                params={"domain": domain, "per_page": 100},
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                for account in data.get("data", []):
                    affected_accounts.add((account.get("id"), account.get("name"), domain))
        except:
            pass
        
        # Search for people at this domain
        try:
            response = requests.get(
                f"{BASE_URL}/people",
                headers=HEADERS,
                params={"email_domain": domain, "per_page": 100},
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                for person in data.get("data", []):
                    affected_people.add((person.get("id"), person.get("display_name"), person.get("email_address")))
        except:
            pass
    
    return affected_accounts, affected_people

def main():
    print("\n" + "=" * 80)
    print("DUPLICATE DOMAIN CONSTRAINT ERROR ANALYSIS")
    print("=" * 80)
    
    # Search for errors
    duplicate_errors, affected_domains, error_by_type = search_duplicate_errors()
    
    if not duplicate_errors:
        print("\n✓ No duplicate domain constraint errors found in the last 30 days!")
        return
    
    # Analyze affected accounts and contacts
    affected_accounts, affected_people = analyze_accounts_and_contacts(affected_domains)
    
    # Generate report
    print("\n" + "=" * 80)
    print("SUMMARY REPORT")
    print("=" * 80)
    
    print(f"\n📊 Overall Statistics:")
    print(f"  Total duplicate domain errors: {len(duplicate_errors)}")
    print(f"  Unique domains affected: {len(affected_domains)}")
    print(f"  Accounts potentially affected: {len(affected_accounts)}")
    print(f"  Contacts potentially affected: {len(affected_people)}")
    
    print(f"\n🔍 Errors by Activity Type:")
    for activity_type, count in sorted(error_by_type.items(), key=lambda x: x[1], reverse=True):
        print(f"  {activity_type}: {count}")
    
    print(f"\n⚠️  Most Problematic Domains (Top 10):")
    sorted_domains = sorted(affected_domains.items(), key=lambda x: len(x[1]), reverse=True)[:10]
    for domain, errors in sorted_domains:
        print(f"  {domain}: {len(errors)} sync failures")
        # Show date range for this domain's errors
        dates = [e["created_at"] for e in errors if e.get("created_at")]
        if dates:
            earliest = min(dates).split("T")[0]
            latest = max(dates).split("T")[0]
            print(f"    Date range: {earliest} to {latest}")
    
    if affected_accounts:
        print(f"\n📋 Sample Affected Accounts:")
        for account_id, name, domain in list(affected_accounts)[:5]:
            print(f"  - {name} (ID: {account_id}, Domain: {domain})")
    
    if affected_people:
        print(f"\n👥 Sample Affected Contacts:")
        for person_id, name, email in list(affected_people)[:5]:
            print(f"  - {name} ({email})")
    
    # Save detailed results
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_errors": len(duplicate_errors),
            "unique_domains": len(affected_domains),
            "affected_accounts": len(affected_accounts),
            "affected_contacts": len(affected_people)
        },
        "errors_by_type": dict(error_by_type),
        "top_domains": {
            domain: {
                "error_count": len(errors),
                "sample_errors": [
                    {
                        "id": e["id"],
                        "type": e["type"],
                        "created_at": e["created_at"],
                        "subject": e.get("subject", "")
                    } for e in errors[:3]
                ]
            }
            for domain, errors in sorted_domains
        },
        "all_errors": duplicate_errors
    }
    
    with open("/home/chris/Desktop/RevPal/Agents/duplicate_domain_error_report.json", "w") as f:
        json.dump(report, f, indent=2)
    
    print(f"\n📄 Detailed report saved to: duplicate_domain_error_report.json")
    
    # Provide remediation estimate
    print("\n" + "=" * 80)
    print("REMEDIATION ESTIMATE")
    print("=" * 80)
    
    if affected_domains:
        print(f"\nTo fix these errors, you need to standardize domains for:")
        print(f"  • {len(affected_domains)} unique domains")
        print(f"  • Affecting up to {len(affected_accounts)} accounts")
        print(f"  • Potentially impacting {len(affected_people)} contacts")
        
        print(f"\nEstimated Salesforce records to update:")
        # Query would be needed to get exact count
        print(f"  • Accounts with these domains: ~{len(affected_accounts) * 2} (assuming duplicates)")
        print(f"  • Batch update time: ~{(len(affected_accounts) * 2) // 25 + 1} batches of 25 records")

if __name__ == "__main__":
    main()