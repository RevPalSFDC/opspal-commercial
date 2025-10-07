#!/usr/bin/env python3
"""
Find duplicate companies and malformed domains in Salesloft
"""

import os
import requests
import json

SALESLOFT_TOKEN = os.getenv("SALESLOFT_TOKEN", "v2_ak_101314_d780f0370f98c58e0d514242b6bde735ca4945a0fc0d667f7727bf411336593f")
headers = {
    "Authorization": f"Bearer {SALESLOFT_TOKEN}",
    "Accept": "application/json"
}

print("SEARCHING FOR DUPLICATE/MALFORMED COMPANIES")
print("="*60)

# Search for TLR Group specifically
search_terms = ["tlrgroup", "tlr group", "https://www.tlrgroup.com", "www.tlrgroup.com"]

for term in search_terms:
    print(f"\nSearching for: {term}")

    # Search companies
    params = {
        "per_page": 25,
        "q": term
    }

    try:
        response = requests.get(
            "https://api.salesloft.com/v2/companies",
            headers=headers,
            params=params,
            timeout=10
        )

        if response.status_code == 200:
            companies = response.json().get("data", [])

            if companies:
                print(f"  Found {len(companies)} companies:")
                for company in companies:
                    print(f"\n  Company: {company.get('name', 'Unknown')}")
                    print(f"    ID: {company.get('id')}")
                    print(f"    Domain: {company.get('domain', 'No domain')}")
                    print(f"    Created: {company.get('created_at', '')[:19]}")
                    print(f"    Updated: {company.get('updated_at', '')[:19]}")

                    # Check for malformed domain
                    domain = company.get('domain', '')
                    if domain and any(x in domain for x in ['http://', 'https://', 'www.']):
                        print(f"    ⚠️  MALFORMED DOMAIN DETECTED: {domain}")
            else:
                print(f"  No companies found")

    except Exception as e:
        print(f"  Error: {e}")

# Look for other companies with malformed domains
print("\n" + "="*60)
print("CHECKING FOR OTHER MALFORMED DOMAINS")
print("="*60)

params = {
    "per_page": 100,
    "sort": "updated_at",
    "sort_direction": "desc"
}

try:
    response = requests.get(
        "https://api.salesloft.com/v2/companies",
        headers=headers,
        params=params,
        timeout=10
    )

    if response.status_code == 200:
        companies = response.json().get("data", [])

        malformed = []
        duplicates = {}

        for company in companies:
            domain = company.get('domain', '')

            # Check for malformed domains
            if domain and any(x in domain for x in ['http://', 'https://', 'www.', '//']):
                malformed.append({
                    'name': company.get('name', 'Unknown'),
                    'domain': domain,
                    'id': company.get('id')
                })

            # Check for potential duplicates (normalize domain)
            if domain:
                normalized = domain.lower().replace('https://', '').replace('http://', '').replace('www.', '').strip('/')
                if normalized not in duplicates:
                    duplicates[normalized] = []
                duplicates[normalized].append({
                    'name': company.get('name', 'Unknown'),
                    'domain': domain,
                    'id': company.get('id')
                })

        if malformed:
            print(f"\nFound {len(malformed)} companies with malformed domains:")
            for company in malformed[:10]:
                print(f"  {company['name']:30} | Domain: {company['domain']}")

        print("\nPotential duplicate companies (same normalized domain):")
        for normalized, companies in duplicates.items():
            if len(companies) > 1:
                print(f"\nDomain: {normalized}")
                for company in companies:
                    print(f"  - {company['name']:30} | Original: {company['domain']}")

except Exception as e:
    print(f"Error: {e}")

print("\n" + "="*60)
print("RECOMMENDATIONS:")
print("="*60)
print("1. In Salesloft UI, search for and merge duplicate companies")
print("2. Fix malformed domains (remove http://, https://, www.)")
print("3. Check People records linked to these companies")
print("4. Consider bulk domain cleanup if many malformed domains exist")