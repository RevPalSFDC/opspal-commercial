#!/usr/bin/env python3
"""
Analyze deleted Salesforce Contacts causing sync failures
"""

import subprocess
import json
from collections import defaultdict
from datetime import datetime

# List of deleted Contact IDs from the error log
DELETED_CONTACTS = [
    ("0033j00003wOVdnAAG", "Mitch Scarski", "9/11/2025, 3:15 PM"),
    ("0033j00003wOVdnAAG", "Mitch Scarski", "9/11/2025, 3:15 PM"),
    ("0033j00003wOVdnAAG", "Mitch Scarski", "9/11/2025, 3:02 PM"),
    ("003Rh000000fsPSIAY", "Austin Schleisner", "9/11/2025, 2:59 AM"),
    ("003Rh000000fsPSIAY", "Austin Schleisner", "9/11/2025, 2:59 AM"),
    ("0033j00003wOvYuAAK", "Jordan Wilkins", "9/10/2025, 8:42 PM"),
    ("0033j00003wOvYuAAK", "Jordan Wilkins", "9/10/2025, 8:41 PM"),
    ("0033j00003wOVdnAAG", "Mitch Scarski", "9/10/2025, 8:15 PM"),
    ("0033j00003wOVdnAAG", "Mitch Scarski", "9/9/2025, 5:06 PM"),
    ("0033j00003wOVdnAAG", "Mitch Scarski", "9/9/2025, 5:05 PM"),
    ("0033j00003wOVdnAAG", "Mitch Scarski", "9/9/2025, 3:31 PM"),
    ("0033j00003wOVdnAAG", "Mitch Scarski", "9/9/2025, 3:31 PM"),
    ("0033j00003iqOYzAAM", "Eli Tomasch", "9/9/2025, 1:44 PM"),
    ("0033j00003iqOYzAAM", "Eli Tomasch", "9/9/2025, 1:44 PM"),
    ("003Rh00000EAxjVIAT", "Anna Kelly", "9/9/2025, 12:46 PM"),
    ("003Rh00000EAxjVIAT", "Anna Kelly", "9/9/2025, 12:46 PM"),
    ("003Rh00000EAxjVIAT", "Anna Kelly", "9/9/2025, 12:46 PM"),
    ("003Rh00000EAxjVIAT", "Anna Kelly", "9/9/2025, 12:45 PM"),
    ("003Rh00000EAxjVIAT", "Anna Kelly", "9/9/2025, 12:45 PM"),
    ("0033j00003wOVdnAAG", "Mitch Scarski", "9/8/2025, 6:10 PM"),
    ("0033j00003wOVdnAAG", "Mitch Scarski", "9/8/2025, 6:09 PM"),
    ("0033j00003wOVdnAAG", "Mitch Scarski", "9/8/2025, 5:27 PM"),
    ("0033j00003wOVdnAAG", "Mitch Scarski", "9/8/2025, 5:26 PM"),
    ("0033j00003wOVdlAAG", "Mitch Scarski", "9/8/2025, 5:25 PM"),
    ("003Rh00000EAxjVIAT", "Anna Kelly", "9/8/2025, 3:21 PM"),
    ("003Rh00000EAxjVIAT", "Anna Kelly", "9/8/2025, 3:20 PM"),
    ("0033j00003wOvYuAAK", "Jordan Wilkins", "9/8/2025, 1:32 PM"),
    ("0033j00003wOvYuAAK", "Jordan Wilkins", "9/8/2025, 1:32 PM"),
    ("0033j00003wOvYuAAK", "Jordan Wilkins", "9/8/2025, 1:00 PM"),
    ("0033j00003iqOYzAAM", "Eli Tomasch", "9/8/2025, 12:24 PM"),
    ("0033j00003iqOYzAAM", "Russell Eldridge", "9/8/2025, 12:24 PM"),
    ("003Rh00000XP0ieIAD", "Kristen Nelson", "9/8/2025, 12:22 PM"),
    ("003Rh00000XP0ieIAD", "Kristen Nelson", "9/8/2025, 12:22 PM"),
    ("003Rh00000XP0ieIAD", "Kristen Nelson", "9/8/2025, 12:15 PM"),
    ("003Rh00000XP0ieIAD", "Kristen Nelson", "9/8/2025, 12:15 PM"),
    ("0033j00003wOVdnAAG", "Mitch Scarski", "9/8/2025, 11:51 AM"),
    ("0033j00003wOVdnAAG", "Mitch Scarski", "9/8/2025, 11:51 AM"),
    ("003Rh00000XP0ieIAD", "Kristen Nelson", "9/8/2025, 11:21 AM"),
    ("0033j00003Fh84CAAR", "Patrick Burkholder", "9/8/2025, 11:17 AM"),
    ("003Rh000001IzODIA0", "Brian Trefilek", "9/8/2025, 5:13 AM"),
    ("003Rh00000bDOSDIA4", "Anna Choiniere", "8/19/2025, 1:11 PM"),
    ("0033j00003wOxRrAAK", "Jordan Wilkins", "8/14/2025, 11:07 AM"),
    ("0033j00003wOxRrAAK", "Jordan Wilkins", "8/14/2025, 11:07 AM"),
    ("0033j00003wPOZSAA4", "Josh Vasseur", "8/5/2025, 4:34 PM"),
    ("003Rh000000SAQRIA4", "Austin Schleisner", "8/5/2025, 4:30 PM"),
    ("0033j00003zjANQAA2", "Amanda Frazier", "8/1/2025, 1:30 PM"),
    ("0033j00003zjANQAA2", "Amanda Frazier", "8/1/2025, 1:30 PM"),
    ("0033j00003zjANQAA2", "Amanda Frazier", "8/1/2025, 1:29 PM"),
    ("0033j00004B1saLAAR", "Nathan Warren", "7/29/2025, 12:13 PM"),
    ("0033j00003YN6oAAAT", "Rebekka Pace", "7/18/2025, 10:49 AM"),
]

def analyze_deleted_contacts():
    """Analyze the deleted contacts"""
    
    # Count by Contact ID
    contact_counts = defaultdict(list)
    for contact_id, user, timestamp in DELETED_CONTACTS:
        contact_counts[contact_id].append((user, timestamp))
    
    # Count by User
    user_counts = defaultdict(int)
    for contact_id, user, timestamp in DELETED_CONTACTS:
        user_counts[user] += 1
    
    # Unique contacts
    unique_contacts = list(contact_counts.keys())
    
    print("=" * 80)
    print("DELETED CONTACTS ANALYSIS")
    print("=" * 80)
    
    print(f"\n📊 Summary:")
    print(f"  Total sync failures: {len(DELETED_CONTACTS)}")
    print(f"  Unique deleted contacts: {len(unique_contacts)}")
    print(f"  Date range: 7/18/2025 to 9/11/2025")
    
    print(f"\n🔍 Most Problematic Contacts (by failure count):")
    sorted_contacts = sorted(contact_counts.items(), key=lambda x: len(x[1]), reverse=True)
    for contact_id, attempts in sorted_contacts[:5]:
        users = set([user for user, _ in attempts])
        print(f"  {contact_id}: {len(attempts)} failed attempts")
        print(f"    Users affected: {', '.join(users)}")
    
    print(f"\n👥 Users with Most Failures:")
    sorted_users = sorted(user_counts.items(), key=lambda x: x[1], reverse=True)
    for user, count in sorted_users[:5]:
        print(f"  {user}: {count} failures")
    
    print(f"\n📋 Deleted Contact IDs for Salesforce Query:")
    print("Use this list to check Salesforce Recycle Bin:")
    print()
    
    # Format for SOQL IN clause
    contact_ids_formatted = "'" + "','".join(unique_contacts) + "'"
    print("SOQL Query to find these contacts:")
    print(f"SELECT Id, Name, Email, IsDeleted FROM Contact WHERE Id IN ({contact_ids_formatted}) ALL ROWS")
    
    return unique_contacts

def check_salesforce_contacts(contact_ids):
    """Check if these contacts exist in Salesforce"""
    
    print("\n" + "=" * 80)
    print("CHECKING SALESFORCE FOR DELETED CONTACTS")
    print("=" * 80)
    
    # Check first 5 contacts as a sample
    sample_ids = contact_ids[:5]
    
    for contact_id in sample_ids:
        print(f"\nChecking {contact_id}...")
        
        # Query including deleted records
        query = f"SELECT Id, Name, Email, IsDeleted, AccountId FROM Contact WHERE Id = '{contact_id}' ALL ROWS"
        
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
                    record = records[0]
                    print(f"  Found: {record.get('Name')}")
                    print(f"  Email: {record.get('Email')}")
                    print(f"  IsDeleted: {record.get('IsDeleted')}")
                    print(f"  AccountId: {record.get('AccountId')}")
                else:
                    print(f"  NOT FOUND (even in recycle bin)")
            else:
                print(f"  Error querying: {result.stderr}")
                
        except Exception as e:
            print(f"  Error: {e}")

def main():
    # Analyze the deleted contacts
    unique_contacts = analyze_deleted_contacts()
    
    # Check in Salesforce
    check_salesforce_contacts(unique_contacts)
    
    print("\n" + "=" * 80)
    print("REMEDIATION PLAN")
    print("=" * 80)
    
    print("""
1. IMMEDIATE ACTIONS:
   ✓ Check Salesforce Recycle Bin for these contacts
   ✓ If found in Recycle Bin, undelete them
   ✓ If permanently deleted, identify why they were deleted
   
2. ROOT CAUSE INVESTIGATION:
   • Were these contacts merged into other records?
   • Was there a bulk delete operation?
   • Are these test/invalid contacts that should be deleted?
   
3. PREVENTION:
   • Review deletion policies with team
   • Consider implementing soft delete in Salesloft
   • Set up alerts for bulk deletions
   • Regular sync health monitoring
   
4. CLEANUP:
   • Remove these contacts from Salesloft cadences
   • Update Salesloft to stop trying to sync deleted records
   • Clear cached references in Salesloft
""")

if __name__ == "__main__":
    main()