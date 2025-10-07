#!/usr/bin/env python3
"""
Test fixing a small batch of email syncs
"""

import os
import sys
import requests
import time
from datetime import datetime, timezone

SALESLOFT_BASE_URL = "https://api.salesloft.com/v2"
SALESLOFT_TOKEN = "v2_ak_101314_d780f0370f98c58e0d514242b6bde735ca4945a0fc0d667f7727bf411336593f"

headers = {
    "Authorization": f"Bearer {SALESLOFT_TOKEN}",
    "Accept": "application/json",
    "Content-Type": "application/json"
}

print("="*60)
print("TESTING EMAIL SYNC FIX - LIMITED BATCH")
print("="*60)

# Get 5 unsynced emails
params = {
    "per_page": 5,
    "sort": "updated_at",
    "sort_direction": "desc"
}

response = requests.get(
    f"{SALESLOFT_BASE_URL}/activities/emails",
    params=params,
    headers=headers,
    timeout=10
)

if response.status_code == 200:
    emails = response.json().get("data", [])

    # Find unsynced ones
    unsynced = [e for e in emails if not (e.get("crm_activity_id") or e.get("crm_id"))]

    print(f"Found {len(unsynced)} unsynced emails out of {len(emails)}")

    success_count = 0
    fail_count = 0

    for email in unsynced[:3]:  # Only try 3
        email_id = email.get("id")
        print(f"\nProcessing email {email_id}...")

        # Method 1: Try to create CRM activity
        try:
            crm_data = {
                "activity_id": email_id,
                "activity_type": "email",
                "person_id": email.get("person_id"),
                "person_crm_id": email.get("person", {}).get("crm_id") if email.get("person") else None
            }

            response = requests.post(
                f"{SALESLOFT_BASE_URL}/crm_activities",
                json=crm_data,
                headers=headers,
                timeout=10
            )

            print(f"  Create CRM Activity Response: {response.status_code}")

            if response.status_code in [200, 201]:
                print(f"  ✅ Successfully created CRM activity")
                success_count += 1
                result = response.json()
                print(f"  CRM ID: {result.get('data', {}).get('crm_id', 'Unknown')}")
            else:
                print(f"  ❌ Failed: {response.text[:200]}")
                fail_count += 1

        except Exception as e:
            print(f"  ❌ Error: {e}")
            fail_count += 1

        time.sleep(1)  # Rate limiting

    print("\n" + "="*60)
    print("RESULTS:")
    print(f"  Successful: {success_count}")
    print(f"  Failed: {fail_count}")

else:
    print(f"Error getting emails: {response.status_code}")