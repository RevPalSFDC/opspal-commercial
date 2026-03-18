#!/usr/bin/env python3
"""Test connection to gamma-corp Salesforce instance"""

import subprocess
import json
import sys

def test_connection():
    org_alias = "gamma-corp"
    
    print(f"Testing connection to {org_alias}...")
    
    # Test query
    query = "SELECT Id, Name FROM Account LIMIT 1"
    
    # Try sf CLI
    print("\n1. Testing with 'sf' CLI:")
    try:
        cmd = ['sf', 'data', 'query', '--query', query, '--target-org', org_alias, '--json']
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            data = json.loads(result.stdout)
            records = data.get('result', {}).get('records', [])
            print(f"   ✅ SUCCESS - Retrieved {len(records)} record(s)")
            if records:
                print(f"   Sample: {records[0]}")
            return True
        else:
            print(f"   ❌ FAILED - {result.stderr[:100]}")
    except Exception as e:
        print(f"   ❌ ERROR - {str(e)}")
    
    # Check org display
    print("\n2. Checking org authentication:")
    try:
        cmd = ['sf', 'org', 'display', '--target-org', org_alias, '--json']
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            data = json.loads(result.stdout)
            org_info = data.get('result', {})
            print(f"   Org ID: {org_info.get('id', 'Unknown')}")
            print(f"   Instance URL: {org_info.get('instanceUrl', 'Unknown')}")
            print(f"   Username: {org_info.get('username', 'Unknown')}")
            print(f"   Status: {org_info.get('status', 'Unknown')}")
        else:
            print(f"   ❌ Org not found or not authenticated")
            print(f"   Please authenticate using: sf org login web --alias {org_alias}")
    except Exception as e:
        print(f"   ❌ ERROR - {str(e)}")
    
    return False

if __name__ == "__main__":
    if test_connection():
        print("\n✅ Connection test successful! You can run the full assessment.")
    else:
        print("\n❌ Connection test failed. Please check authentication and try again.")
        print("\nTo authenticate, run:")
        print("  sf org login web --alias gamma-corp")
        sys.exit(1)
