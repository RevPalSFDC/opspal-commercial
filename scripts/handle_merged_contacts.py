#!/usr/bin/env python3
"""
Handle merged Salesforce contacts in Salesloft
Find the merge winners and resync them
"""

import os
import sys
import json
import requests
import subprocess
from datetime import datetime
from typing import Dict, List, Tuple

# Salesloft API configuration
BASE_URL = "https://api.salesloft.com/v2"
TOKEN = os.getenv("SALESLOFT_TOKEN")

if not TOKEN:
    print("Error: SALESLOFT_TOKEN not set")
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json",
    "Content-Type": "application/json"
}

# Christian's merged contacts based on the Recycle Bin data
MERGED_CONTACTS = {
    # Deleted ID -> Contact Name (for searching)
    "0033j00003wOVdnAAG": {"name": "Liz Culibrk", "email": "lculibrk@fairfieldresidential.com", "account": "Fairfield Residential"},
    "0033j00003wOVdlAAG": {"name": "Greg Morehead", "email": "gmorehead@fairfieldresidential.com", "account": "Fairfield Residential"},
    "0033j00003wOvYuAAK": {"name": "Dana Tucker", "email": "dana.tucker@cortland.com", "account": "Cortland"},
    "003Rh00000EAxjVIAT": {"name": "Ashley Tamer", "email": "ashley.tamer@kmgprestige.com", "account": "KMG Prestige"},
    "003Rh00000XP0ieIAD": {"name": "Stephen Shows", "email": "sshows@berkshireresi.com", "account": "Berkshire Residential"},
}

def find_merge_winner_in_salesforce(deleted_contact):
    """Find the winning contact after a merge in Salesforce"""
    
    print(f"\nSearching for merge winner for: {deleted_contact['name']}")
    
    # Search by email first (most reliable)
    query = f"SELECT Id, Name, Email, AccountId, Account.Name FROM Contact WHERE Email = '{deleted_contact['email']}'"
    
    cmd = [
        "sf", "data", "query",
        "-q", query,
        "-o", "rentable-production",
        "--json"
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        
        if result.returncode == 0:
            data = json.loads(result.stdout)
            records = data.get("result", {}).get("records", [])
            
            if records:
                winner = records[0]
                print(f"  ✅ Found merge winner: {winner['Name']} (ID: {winner['Id']})")
                return winner
            else:
                # Try searching by name if email doesn't work
                name_parts = deleted_contact['name'].split()
                query = f"SELECT Id, Name, Email, AccountId, Account.Name FROM Contact WHERE FirstName = '{name_parts[0]}' AND LastName = '{name_parts[-1]}'"
                
                cmd[3] = query  # Update query in command
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
                
                if result.returncode == 0:
                    data = json.loads(result.stdout)
                    records = data.get("result", {}).get("records", [])
                    
                    if records:
                        # Find best match based on account
                        for record in records:
                            if deleted_contact['account'] in str(record.get('Account', {}).get('Name', '')):
                                print(f"  ✅ Found merge winner by name: {record['Name']} (ID: {record['Id']})")
                                return record
                        
                        # Return first match if no account match
                        winner = records[0]
                        print(f"  ⚠️  Found possible winner: {winner['Name']} (ID: {winner['Id']})")
                        return winner
                
                print(f"  ❌ No merge winner found")
                return None
    except Exception as e:
        print(f"  Error: {e}")
        return None

def find_person_in_salesloft(email):
    """Find a person in Salesloft by email"""
    
    params = {
        "email_address": email,
        "per_page": 1
    }
    
    try:
        response = requests.get(f"{BASE_URL}/people", headers=HEADERS, params=params)
        
        if response.status_code == 200:
            data = response.json()
            people = data.get("data", [])
            
            if people:
                return people[0]
    except:
        pass
    
    return None

def update_salesloft_person(person_id, new_crm_id):
    """Update a Salesloft person with new CRM ID"""
    
    data = {
        "crm_id": new_crm_id
    }
    
    try:
        response = requests.put(
            f"{BASE_URL}/people/{person_id}",
            headers=HEADERS,
            json=data
        )
        
        if response.status_code == 200:
            return True
        else:
            print(f"    Error updating: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"    Error: {e}")
        return False

def remove_from_cadence(person_id):
    """Remove person from all cadences to stop sync attempts"""
    
    # Get person's cadence memberships
    params = {
        "person_id": person_id,
        "per_page": 100
    }
    
    try:
        response = requests.get(f"{BASE_URL}/cadence_memberships", headers=HEADERS, params=params)
        
        if response.status_code == 200:
            data = response.json()
            memberships = data.get("data", [])
            
            removed_count = 0
            for membership in memberships:
                if membership.get("currently_on_cadence"):
                    # Remove from cadence
                    delete_response = requests.delete(
                        f"{BASE_URL}/cadence_memberships/{membership['id']}",
                        headers=HEADERS
                    )
                    if delete_response.status_code == 204:
                        removed_count += 1
            
            return removed_count
    except:
        pass
    
    return 0

def main():
    print("=" * 80)
    print("MERGED CONTACT HANDLER FOR SALESLOFT")
    print("=" * 80)
    
    merge_mappings = []
    
    # Step 1: Find all merge winners in Salesforce
    print("\n📊 STEP 1: Finding Merge Winners in Salesforce")
    print("-" * 50)
    
    for deleted_id, contact_info in MERGED_CONTACTS.items():
        winner = find_merge_winner_in_salesforce(contact_info)
        
        if winner:
            merge_mappings.append({
                "deleted_id": deleted_id,
                "deleted_name": contact_info["name"],
                "deleted_email": contact_info["email"],
                "winner_id": winner["Id"],
                "winner_name": winner["Name"],
                "winner_email": winner.get("Email")
            })
    
    if not merge_mappings:
        print("\n❌ No merge winners found. Manual intervention required.")
        return
    
    # Step 2: Update Salesloft records
    print("\n📊 STEP 2: Updating Salesloft Records")
    print("-" * 50)
    
    for mapping in merge_mappings:
        print(f"\nProcessing: {mapping['deleted_name']} → {mapping['winner_name']}")
        
        # Find person in Salesloft
        person = find_person_in_salesloft(mapping['deleted_email'])
        
        if person:
            print(f"  Found in Salesloft: {person['display_name']} (ID: {person['id']})")
            
            # Check current CRM ID
            current_crm_id = person.get("crm_id")
            
            if current_crm_id == mapping['deleted_id']:
                print(f"  ⚠️  Has deleted CRM ID: {current_crm_id}")
                print(f"  🔄 Updating to winner ID: {mapping['winner_id']}")
                
                # Update the CRM ID
                if update_salesloft_person(person['id'], mapping['winner_id']):
                    print(f"  ✅ Successfully updated CRM ID")
                else:
                    print(f"  ❌ Failed to update CRM ID")
                    
                    # Alternative: Remove from cadences to stop errors
                    print(f"  🔄 Removing from cadences to stop sync errors...")
                    removed = remove_from_cadence(person['id'])
                    if removed > 0:
                        print(f"  ✅ Removed from {removed} cadence(s)")
            
            elif current_crm_id == mapping['winner_id']:
                print(f"  ✅ Already has correct CRM ID: {current_crm_id}")
            
            else:
                print(f"  ⚠️  Has different CRM ID: {current_crm_id}")
                print(f"     This may be a different person or needs manual review")
        
        else:
            print(f"  ❌ Not found in Salesloft (may have been deleted or never synced)")
    
    # Step 3: Generate summary and next steps
    print("\n" + "=" * 80)
    print("SUMMARY & NEXT STEPS")
    print("=" * 80)
    
    print("\n✅ Merge Mappings Identified:")
    for mapping in merge_mappings:
        print(f"  {mapping['deleted_name']} ({mapping['deleted_id']})")
        print(f"    → {mapping['winner_name']} ({mapping['winner_id']})")
    
    print("\n📋 Manual Steps Required:")
    print("1. Verify the merge winners are correct in Salesforce")
    print("2. In Salesloft, search for any people with the old emails")
    print("3. Update their CRM IDs to the winner IDs")
    print("4. Or remove them from cadences if they're duplicates")
    
    print("\n🔧 Alternative Bulk Fix:")
    print("1. Export all Salesloft people with these emails")
    print("2. Update the CSV with new CRM IDs")
    print("3. Re-import to update the mappings")
    
    # Save mapping for reference
    with open("/home/chris/Desktop/RevPal/Agents/merge_mappings.json", "w") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "mappings": merge_mappings
        }, f, indent=2)
    
    print(f"\n📄 Mappings saved to: merge_mappings.json")

if __name__ == "__main__":
    main()