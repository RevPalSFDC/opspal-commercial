#!/usr/bin/env python3
"""Basic security test to verify connection and get initial findings"""

import subprocess
import json
import os

os.chdir(INSTANCE_ROOT)

def run_simple_cmd(cmd):
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return result.returncode == 0, result.stdout, result.stderr
    except:
        return False, "", "Timeout or error"

print(f"🔍 Basic Security Test for {ORG_ALIAS}")
print("=" * 50)

# Test connection
success, stdout, stderr = run_simple_cmd(['sf', 'org', 'display', '--target-org', ORG_ALIAS])
print(f"1. Org connection: {'✅ Success' if success else '❌ Failed'}")
if not success:
    print(f"   Error: {stderr}")
    exit(1)

# Quick OWD check
success, stdout, stderr = run_simple_cmd([
    'sf', 'data', 'query',
    '--query', 'SELECT DefaultAccountAccess, DefaultContactAccess FROM OrganizationDefaultsMap',
    '--target-org', ORG_ALIAS,
    '--json'
])

if success:
    try:
        data = json.loads(stdout)
        if data['result']['totalSize'] > 0:
            owd = data['result']['records'][0]
            print(f"2. Account OWD: {owd.get('DefaultAccountAccess', 'Not found')}")
            print(f"   Contact OWD: {owd.get('DefaultContactAccess', 'Not found')}")
        else:
            print("2. OWD: No data found")
    except:
        print("2. OWD: Error parsing data")
else:
    print("2. OWD: Query failed")

# Check for DVM fields
for obj, field in [('Contact', 'Is_DVM__c'), ('Account', 'Count_of_DVMs__c')]:
    success, stdout, stderr = run_simple_cmd([
        'sf', 'data', 'query',
        '--query', f"SELECT QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '{obj}' AND QualifiedApiName = '{field}'",
        '--target-org', ORG_ALIAS,
        '--json'
    ])
    
    if success:
        try:
            data = json.loads(stdout)
            exists = data['result']['totalSize'] > 0
            print(f"3. {obj}.{field}: {'✅ Exists' if exists else '➖ Not found'}")
        except:
            print(f"3. {obj}.{field}: Error parsing")
    else:
        print(f"3. {obj}.{field}: Query failed")

print("=" * 50)
print("Basic test complete. Run focused_security_analysis.py for full analysis.")

from pathlib import Path
import sys

LIB_DIR = Path(__file__).resolve().parent / "lib"
if not LIB_DIR.exists():
    LIB_DIR = Path(__file__).resolve().parent.parent / "lib"
sys.path.insert(0, str(LIB_DIR))

from instance_resolver import resolve_project_root, resolve_instance_root, require_sf_project, resolve_org_alias, require_org_alias

PROJECT_ROOT = resolve_project_root()
INSTANCE_ROOT = resolve_instance_root(PROJECT_ROOT)
require_sf_project(INSTANCE_ROOT)
ORG_ALIAS = require_org_alias(resolve_org_alias(PROJECT_ROOT, INSTANCE_ROOT))

