#!/usr/bin/env python3
"""
Check for duplicate domain issues in Salesloft
"""

import os
import sys
import json
import requests
from typing import Dict, List
import time

# Configuration
BASE_URL = "https://api.salesloft.com/v2"
TOKEN = os.getenv("SALESLOFT_TOKEN")
if not TOKEN:
    print("Error: SALESLOFT_TOKEN environment variable not set")
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json"
}

def check_company_by_domain(domain: str):
    """Check if a company exists with this domain"""
    
    # Search for companies with this domain
    params = {
        "domain": domain,
        "per_page": 25
    }
    
    response = requests.get(f"{BASE_URL}/companies", headers=HEADERS, params=params)
    
    if response.status_code == 200:
        data = response.json()
        companies = data.get("data", [])
        
        if companies:
            print(f"\n✅ Found {len(companies)} company(ies) with domain '{domain}':")
            for company in companies:
                print(f"\n  Company ID: {company.get('id')}")
                print(f"  Name: {company.get('name')}")
                print(f"  Domain: {company.get('domain')}")
                print(f"  CRM ID: {company.get('crm_id')}")
                print(f"  Created: {company.get('created_at')}")
                print(f"  Updated: {company.get('updated_at')}")
        else:
            print(f"\n❌ No companies found with domain '{domain}'")
    else:
        print(f"Error: {response.status_code} - {response.text}")

def check_domain_variations():
    """Check for common domain variations that might cause duplicates"""
    
    base_domain = "hillpointe.com"
    variations = [
        "hillpointe.com",
        "www.hillpointe.com",
        "http://hillpointe.com",
        "https://hillpointe.com",
        "http://www.hillpointe.com",
        "https://www.hillpointe.com"
    ]
    
    print("=" * 80)
    print("CHECKING DOMAIN VARIATIONS FOR DUPLICATES")
    print("=" * 80)
    
    for domain in variations:
        check_company_by_domain(domain)
        time.sleep(0.5)  # Rate limiting
    
    # Also check accounts with this domain
    print("\n" + "=" * 80)
    print("CHECKING ACCOUNTS WITH THIS DOMAIN")
    print("=" * 80)
    
    params = {
        "domain": "hillpointe.com",
        "per_page": 25
    }
    
    response = requests.get(f"{BASE_URL}/accounts", headers=HEADERS, params=params)
    
    if response.status_code == 200:
        data = response.json()
        accounts = data.get("data", [])
        
        if accounts:
            print(f"\n✅ Found {len(accounts)} account(s) with domain 'hillpointe.com':")
            for account in accounts:
                print(f"\n  Account ID: {account.get('id')}")
                print(f"  Name: {account.get('name')}")
                print(f"  Domain: {account.get('domain')}")
                print(f"  Website: {account.get('website')}")
                print(f"  CRM ID: {account.get('crm_id')}")
                print(f"  CRM URL: {account.get('crm_url')}")
                print(f"  Created: {account.get('created_at')}")
        else:
            print("\n❌ No accounts found with this domain")

def find_recent_sync_errors():
    """Find recent activities with this domain that failed to sync"""
    
    print("\n" + "=" * 80)
    print("CHECKING RECENT SYNC ERRORS FOR HILLPOINTE")
    print("=" * 80)
    
    params = {
        "per_page": 100,
        "page": 1
    }
    
    response = requests.get(f"{BASE_URL}/crm_activities", headers=HEADERS, params=params)
    
    if response.status_code == 200:
        data = response.json()
        activities = data.get("data", [])
        
        hillpointe_errors = []
        for activity in activities:
            error = activity.get("error", "")
            subject = activity.get("subject", "")
            custom_fields = activity.get("custom_crm_fields", {})
            
            # Check if this activity involves hillpointe
            if "hillpointe" in str(error).lower() or "hillpointe" in str(subject).lower():
                hillpointe_errors.append({
                    "id": activity.get("id"),
                    "type": activity.get("activity_type"),
                    "created": activity.get("created_at"),
                    "error": error,
                    "subject": subject[:50]
                })
        
        if hillpointe_errors:
            print(f"\nFound {len(hillpointe_errors)} activities with Hillpointe errors:")
            for err in hillpointe_errors[:5]:
                print(f"\n  Activity ID: {err['id']}")
                print(f"  Type: {err['type']}")
                print(f"  Error: {err['error'][:100]}")

def main():
    print("\n" + "=" * 80)
    print("DUPLICATE DOMAIN CONSTRAINT ANALYSIS")
    print("Investigating: www.hillpointe.com duplicate key violation")
    print("=" * 80)
    
    # Check for domain variations
    check_domain_variations()
    
    # Find related sync errors
    find_recent_sync_errors()
    
    print("\n" + "=" * 80)
    print("REMEDIATION STEPS")
    print("=" * 80)
    
    print("""
1. IMMEDIATE FIX:
   - Identify the duplicate company in Salesloft
   - Merge or delete the duplicate
   - Update Salesforce to use consistent domain format

2. DOMAIN STANDARDIZATION:
   - Remove 'www.' prefix from all domains
   - Remove 'http://' or 'https://' prefixes
   - Use lowercase for all domains
   
3. SALESFORCE CLEANUP:
   - Query: SELECT Id, Name, Website FROM Account WHERE Website LIKE '%hillpointe%'
   - Standardize all Website fields to use same format
   - Check for duplicate Accounts that should be merged
   
4. PREVENTION:
   - Add validation rule in Salesforce to standardize domains
   - Configure Salesloft to normalize domains before sync
   - Set up duplicate prevention rules
    """)

if __name__ == "__main__":
    main()