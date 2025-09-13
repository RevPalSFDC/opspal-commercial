#!/usr/bin/env python3
"""
Query Salesforce Recycle Bin for deleted contacts
"""

import subprocess
import json
import requests

def get_sf_credentials():
    """Get Salesforce access token and instance URL"""
    result = subprocess.run(
        ["sf", "org", "display", "--target-org", "rentable-production", "--json"],
        capture_output=True,
        text=True
    )
    
    if result.returncode == 0:
        data = json.loads(result.stdout)
        return data["result"]["accessToken"], data["result"]["instanceUrl"]
    else:
        raise Exception("Failed to get Salesforce credentials")

def query_recycle_bin(contact_ids):
    """Query the Recycle Bin for deleted contacts"""
    
    token, instance_url = get_sf_credentials()
    
    # Build the SOQL query with ALL ROWS to include deleted records
    ids_str = "','".join(contact_ids)
    query = f"SELECT Id, Name, Email, IsDeleted, AccountId, Account.Name, LastModifiedDate, LastModifiedBy.Name FROM Contact WHERE Id IN ('{ids_str}')"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }
    
    # Use queryAll endpoint which includes deleted records
    url = f"{instance_url}/services/data/v62.0/queryAll"
    params = {"q": query}
    
    response = requests.get(url, headers=headers, params=params)
    
    if response.status_code == 200:
        return response.json()
    else:
        print(f"Error: {response.status_code}")
        print(response.text)
        return None

def main():
    # List of deleted contact IDs from the error log
    contact_ids = [
        "0033j00003wOVdnAAG",  # Mitch Scarski - 14 failures
        "003Rh000000fsPSIAY",  # Austin Schleisner
        "0033j00003wOvYuAAK",  # Jordan Wilkins - 5 failures
        "0033j00003iqOYzAAM",  # Eli Tomasch
        "003Rh00000EAxjVIAT",  # Anna Kelly - 7 failures
        "0033j00003wOVdlAAG",  # Mitch Scarski
        "003Rh00000XP0ieIAD",  # Kristen Nelson - 5 failures
        "0033j00003Fh84CAAR",  # Patrick Burkholder
        "003Rh000001IzODIA0",  # Brian Trefilek
        "003Rh00000bDOSDIA4",  # Anna Choiniere
        "0033j00003wOxRrAAK",  # Jordan Wilkins
        "0033j00003wPOZSAA4",  # Josh Vasseur
        "003Rh000000SAQRIA4",  # Austin Schleisner
        "0033j00003zjANQAA2",  # Amanda Frazier
        "0033j00004B1saLAAR",  # Nathan Warren
        "0033j00003YN6oAAAT"   # Rebekka Pace
    ]
    
    print("=" * 80)
    print("QUERYING SALESFORCE RECYCLE BIN")
    print("=" * 80)
    print(f"\nSearching for {len(contact_ids)} deleted contacts...")
    
    result = query_recycle_bin(contact_ids)
    
    if result:
        records = result.get("records", [])
        
        if records:
            print(f"\n✅ Found {len(records)} contacts in Salesforce:")
            print()
            
            deleted_count = 0
            active_count = 0
            
            for record in records:
                is_deleted = record.get("IsDeleted")
                status = "🗑️ DELETED" if is_deleted else "✓ ACTIVE"
                
                if is_deleted:
                    deleted_count += 1
                else:
                    active_count += 1
                
                print(f"{status} {record.get('Id')}")
                print(f"  Name: {record.get('Name')}")
                print(f"  Email: {record.get('Email')}")
                if record.get('Account'):
                    print(f"  Account: {record['Account'].get('Name')}")
                print(f"  Last Modified: {record.get('LastModifiedDate')}")
                if record.get('LastModifiedBy'):
                    print(f"  Modified By: {record['LastModifiedBy'].get('Name')}")
                print()
            
            print("=" * 80)
            print("SUMMARY")
            print("=" * 80)
            print(f"Total found: {len(records)}")
            print(f"In Recycle Bin (deleted): {deleted_count}")
            print(f"Active (not deleted): {active_count}")
            print(f"Missing completely: {len(contact_ids) - len(records)}")
            
            if deleted_count > 0:
                print("\n🔴 ACTION REQUIRED:")
                print("These contacts are in the Recycle Bin and can be restored!")
                print("To restore: Go to Salesforce > Setup > Recycle Bin > Select contacts > Undelete")
            
            if active_count > 0:
                print("\n⚠️ UNEXPECTED:")
                print("Some contacts marked as ENTITY_IS_DELETED in Salesloft are actually ACTIVE in Salesforce!")
                print("This suggests a sync issue rather than actual deletion.")
            
        else:
            print("\n❌ No contacts found (not even in Recycle Bin)")
            print("These contacts may have been:")
            print("  • Permanently deleted (emptied from Recycle Bin)")
            print("  • Merged into other records")
            print("  • Never existed with these IDs")
    else:
        print("\n❌ Failed to query Salesforce")

if __name__ == "__main__":
    main()