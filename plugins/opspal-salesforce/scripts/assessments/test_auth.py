#!/usr/bin/env python3
import subprocess
import json

def test_auth():
    """Test Salesforce authentication and basic query"""
    org_alias = 'gamma-corp'
    
    print(f"Testing authentication for org: {org_alias}")
    
    # Test basic query
    try:
        result = subprocess.run([
            'sf', 'data', 'query', 
            '--query', 'SELECT Id, Name FROM Account LIMIT 1',
            '--target-org', org_alias,
            '--json'
        ], capture_output=True, text=True, check=True)
        
        data = json.loads(result.stdout)
        if data.get('status') == 0:
            print("✅ Authentication successful!")
            records = data.get('result', {}).get('records', [])
            print(f"   Retrieved {len(records)} test record(s)")
            return True
        else:
            print("❌ Authentication failed")
            print(f"   Error: {data.get('message', 'Unknown error')}")
            return False
            
    except subprocess.CalledProcessError as e:
        print("❌ Command failed")
        print(f"   Error: {e.stderr if e.stderr else str(e)}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

if __name__ == "__main__":
    test_auth()