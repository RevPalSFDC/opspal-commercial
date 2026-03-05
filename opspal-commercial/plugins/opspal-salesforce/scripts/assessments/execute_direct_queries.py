#!/usr/bin/env python3
"""
Direct SOQL Query Execution for RevOps Assessment
This script executes individual queries to ensure we get real data
"""

import subprocess
import json
import sys

def execute_query(query, description):
    """Execute a single SOQL query and return results"""
    print(f"\n{'='*60}")
    print(f"Executing: {description}")
    print(f"Query: {query[:100]}...")
    
    try:
        # Try sf CLI first
        cmd = ['sf', 'data', 'query', '--query', query, '--target-org', 'gamma-corp', '--json']
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            data = json.loads(result.stdout)
            records = data.get('result', {}).get('records', [])
            print(f"✅ Success: {len(records)} records retrieved")
            
            # Print first 3 records as examples
            for i, record in enumerate(records[:3], 1):
                print(f"\nExample {i}:")
                # Print key fields
                if 'Id' in record:
                    print(f"  ID: {record['Id']}")
                if 'Name' in record:
                    print(f"  Name: {record.get('Name', 'N/A')}")
                if 'Company' in record:
                    print(f"  Company: {record.get('Company', 'N/A')}")
                if 'Status' in record:
                    print(f"  Status: {record.get('Status', 'N/A')}")
                if 'LeadSource' in record:
                    print(f"  Source: {record.get('LeadSource', 'N/A')}")
                if 'IsConverted' in record:
                    print(f"  Converted: {record.get('IsConverted')}")
                if 'Amount' in record:
                    print(f"  Amount: ${record.get('Amount', 0):,.2f}")
                if 'StageName' in record:
                    print(f"  Stage: {record.get('StageName', 'N/A')}")
                if 'IsWon' in record:
                    print(f"  Won: {record.get('IsWon')}")
            
            return records
        else:
            print(f"❌ Query failed: {result.stderr or result.stdout}")
            return None
            
    except Exception as e:
        print(f"❌ Exception: {str(e)}")
        return None

def main():
    print("="*80)
    print("DIRECT SOQL QUERY EXECUTION - GAMMA_CORP INSTANCE")
    print("="*80)
    
    # Test authentication first
    print("\n📌 Testing authentication...")
    test_result = execute_query(
        "SELECT Id, Name FROM Account LIMIT 1",
        "Authentication test"
    )
    
    if not test_result:
        print("\n❌ Authentication failed. Please check your Salesforce connection.")
        sys.exit(1)
    
    print("\n✅ Authentication successful. Proceeding with assessment queries...")
    
    # 1. Lead Analysis
    print("\n" + "="*80)
    print("SECTION 1: LEAD ANALYSIS")
    print("="*80)
    
    leads = execute_query("""
        SELECT Id, Name, Company, Status, LeadSource, ConvertedDate,
               IsConverted, CreatedDate, Owner.Name, Rating
        FROM Lead 
        WHERE CreatedDate >= LAST_N_MONTHS:6
        ORDER BY CreatedDate DESC
        LIMIT 10
    """, "Recent leads with conversion status")
    
    if leads:
        converted = [l for l in leads if l.get('IsConverted')]
        print(f"\n📊 Summary: {len(converted)}/{len(leads)} leads converted ({len(converted)/len(leads)*100:.1f}%)")
    
    # 2. Opportunity Analysis
    print("\n" + "="*80)
    print("SECTION 2: OPPORTUNITY ANALYSIS")
    print("="*80)
    
    opportunities = execute_query("""
        SELECT Id, Name, StageName, Amount, CloseDate, IsWon, IsClosed,
               LeadSource, Account.Name, Owner.Name
        FROM Opportunity 
        WHERE CreatedDate >= LAST_N_MONTHS:6
        AND Amount > 0
        ORDER BY Amount DESC
        LIMIT 10
    """, "Recent opportunities with amounts")
    
    if opportunities:
        won = [o for o in opportunities if o.get('IsWon')]
        closed = [o for o in opportunities if o.get('IsClosed')]
        print(f"\n📊 Summary: {len(won)}/{len(closed)} won ({len(won)/len(closed)*100:.1f}% win rate)" if closed else "No closed opportunities")
    
    # 3. User Activity
    print("\n" + "="*80)
    print("SECTION 3: USER ACTIVITY")
    print("="*80)
    
    users = execute_query("""
        SELECT Id, Name, Profile.Name, LastLoginDate, IsActive
        FROM User 
        WHERE IsActive = true
        ORDER BY LastLoginDate DESC NULLS LAST
        LIMIT 10
    """, "Active users and login activity")
    
    # 4. Campaign Members
    print("\n" + "="*80)
    print("SECTION 4: CAMPAIGN TRACKING")
    print("="*80)
    
    campaign_members = execute_query("""
        SELECT Id, Campaign.Name, Status, HasResponded, CreatedDate
        FROM CampaignMember
        WHERE CreatedDate >= LAST_N_MONTHS:3
        LIMIT 10
    """, "Recent campaign member activity")
    
    if campaign_members:
        responded = [cm for cm in campaign_members if cm.get('HasResponded')]
        print(f"\n📊 Summary: {len(responded)}/{len(campaign_members)} responded ({len(responded)/len(campaign_members)*100:.1f}%)")
    
    # 5. Data Quality Check
    print("\n" + "="*80)
    print("SECTION 5: DATA QUALITY")
    print("="*80)
    
    accounts = execute_query("""
        SELECT Id, Name, Phone, Website, Industry, Type, BillingCity
        FROM Account
        WHERE CreatedDate >= LAST_N_MONTHS:12
        LIMIT 10
    """, "Account data quality check")
    
    if accounts:
        complete = [a for a in accounts if all([
            a.get('Phone'), a.get('Website'), a.get('Industry'), a.get('Type')
        ])]
        print(f"\n📊 Summary: {len(complete)}/{len(accounts)} accounts have complete data ({len(complete)/len(accounts)*100:.1f}%)")
    
    print("\n" + "="*80)
    print("ASSESSMENT COMPLETE")
    print("="*80)
    print("\nThis was a sample of the data. Full assessment would analyze larger datasets.")

if __name__ == "__main__":
    main()
