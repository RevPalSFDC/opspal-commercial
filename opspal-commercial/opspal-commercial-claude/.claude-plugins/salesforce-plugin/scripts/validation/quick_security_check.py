#!/usr/bin/env python3
"""Quick security check for the target org"""

import subprocess
import json
import sys
import os

os.chdir(INSTANCE_ROOT)

def run_cmd(cmd):
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
        return result.returncode == 0, result.stdout, result.stderr
    except:
        return False, "", "Timeout or error"

print(f"🔍 Quick Security Check for {ORG_ALIAS}")
print("=" * 50)

# Test connection
print("1. Testing org connection...")
success, stdout, stderr = run_cmd(f"sf org display --target-org {ORG_ALIAS} --json")

if success:
    org_info = json.loads(stdout)
    print("✅ Connected successfully")
    print(f"   Username: {org_info['result']['username']}")
    print(f"   Instance: {org_info['result']['instanceUrl']}")
else:
    print("❌ Connection failed")
    print(f"   Error: {stderr}")
    sys.exit(1)

# Check for Guest User profiles
print("\n2. Checking for Guest/Community profiles...")
guest_profiles = [
    "Guest License User",
    "Customer Community User",
    "Customer Community Plus User",
    "Partner Community User"
]

for profile in guest_profiles:
    success, stdout, stderr = run_cmd(f'sf data query --query "SELECT Id, Name FROM Profile WHERE Name = \'{profile}\'" --target-org {ORG_ALIAS} --json')
    if success:
        data = json.loads(stdout)
        if data['result']['totalSize'] > 0:
            print(f"   ✅ Found: {profile}")
        else:
            print(f"   ➖ Not found: {profile}")
    else:
        print(f"   ❌ Error checking {profile}: {stderr}")

# Check OWD settings
print("\n3. Checking Organization-Wide Defaults...")
success, stdout, stderr = run_cmd(f'sf data query --query "SELECT DefaultAccountAccess, DefaultContactAccess FROM OrganizationDefaultsMap" --target-org {ORG_ALIAS} --json')

if success:
    data = json.loads(stdout)
    if data['result']['totalSize'] > 0:
        owd = data['result']['records'][0]
        print(f"   Account OWD: {owd.get('DefaultAccountAccess', 'Not found')}")
        print(f"   Contact OWD: {owd.get('DefaultContactAccess', 'Not found')}")
        
        # Flag potential issues
        if owd.get('DefaultAccountAccess') in ['Read', 'Edit']:
            print("   🚨 RISK: Account OWD allows read access")
        if owd.get('DefaultContactAccess') in ['Read', 'Edit']:
            print("   🚨 RISK: Contact OWD allows read access")
    else:
        print("   ❌ No OWD settings found")
else:
    print(f"   ❌ Error checking OWD: {stderr}")

# Check DVM fields specifically
print("\n4. Checking DVM custom fields...")
dvm_fields = [
    ('Contact', 'Is_DVM__c'),
    ('Account', 'Count_of_DVMs__c')
]

for obj, field in dvm_fields:
    print(f"\n   Checking {obj}.{field}...")
    
    # Check if field exists
    success, stdout, stderr = run_cmd(f'sf data query --use-tooling-api --query "SELECT QualifiedApiName, Label FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = \'{obj}\' AND QualifiedApiName = \'{field}\'" --target-org {ORG_ALIAS} --json')
    
    if success:
        data = json.loads(stdout)
        if data['result']['totalSize'] > 0:
            field_info = data['result']['records'][0]
            print(f"   ✅ Field exists: {field_info['Label']}")
            
            # Check for any field permissions (simplified check)
            perm_success, perm_stdout, perm_stderr = run_cmd(f'sf data query --query "SELECT COUNT() FROM FieldPermissions WHERE SobjectType = \'{obj}\' AND Field = \'{obj}.{field}\'" --target-org {ORG_ALIAS} --json')
            
            if perm_success:
                perm_data = json.loads(perm_stdout)
                perm_count = perm_data['result']['totalSize']
                print(f"   Field permissions configured: {perm_count} records")
                
                if perm_count == 0:
                    print("   ⚠️  WARNING: No explicit field permissions - may inherit profile defaults")
            else:
                print(f"   ❌ Error checking field permissions: {perm_stderr}")
        else:
            print(f"   ➖ Field not found: {field}")
    else:
        print(f"   ❌ Error checking field: {stderr}")

# Check for Sites/Communities
print("\n5. Checking Sites and Communities...")

# Check Sites
success, stdout, stderr = run_cmd(f'sf data query --query "SELECT Id, Name, SiteType, Status FROM Site" --target-org {ORG_ALIAS} --json')
if success:
    data = json.loads(stdout)
    print(f"   Sites found: {data['result']['totalSize']}")
    for site in data['result']['records']:
        print(f"     - {site.get('Name')} ({site.get('SiteType')}): {site.get('Status')}")
else:
    print(f"   ❌ Error checking sites: {stderr}")

# Check Networks (Communities)
success, stdout, stderr = run_cmd(f'sf data query --query "SELECT Id, Name, Status FROM Network" --target-org {ORG_ALIAS} --json')
if success:
    data = json.loads(stdout)
    print(f"   Communities found: {data['result']['totalSize']}")
    for network in data['result']['records']:
        print(f"     - {network.get('Name')}: {network.get('Status')}")
else:
    print(f"   ❌ Error checking communities: {stderr}")

print("\n" + "=" * 50)
print("🔍 Quick security check complete")
print("For detailed analysis, run the full security_analysis.py script")

from pathlib import Path


LIB_DIR = Path(__file__).resolve().parent / "lib"
if not LIB_DIR.exists():
    LIB_DIR = Path(__file__).resolve().parent.parent / "lib"
sys.path.insert(0, str(LIB_DIR))

from instance_resolver import resolve_project_root, resolve_instance_root, require_sf_project, resolve_org_alias, require_org_alias

PROJECT_ROOT = resolve_project_root()
INSTANCE_ROOT = resolve_instance_root(PROJECT_ROOT)
require_sf_project(INSTANCE_ROOT)
ORG_ALIAS = require_org_alias(resolve_org_alias(PROJECT_ROOT, INSTANCE_ROOT))
