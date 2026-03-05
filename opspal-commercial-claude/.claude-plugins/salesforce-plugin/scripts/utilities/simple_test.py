import subprocess
import os


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

os.chdir(INSTANCE_ROOT)

print("Testing SF CLI connection...")

# Test SF CLI version
try:
    result = subprocess.run(['sf', '--version'], capture_output=True, text=True, timeout=10)
    print(f"SF CLI version: {result.stdout.strip()}")
except:
    print("SF CLI not found or not working")

# Test org connection
try:
    result = subprocess.run(['sf', 'org', 'display', '--target-org', ORG_ALIAS], 
                          capture_output=True, text=True, timeout=30)
    print(f"Org connection return code: {result.returncode}")
    if result.returncode == 0:
        print(f"✅ Successfully connected to {ORG_ALIAS}")
        print("First few lines of org info:")
        lines = result.stdout.split('\n')[:5]
        for line in lines:
            if line.strip():
                print(f"  {line}")
    else:
        print("❌ Failed to connect to org")
        print(f"Error: {result.stderr}")
except Exception as e:
    print(f"Error testing org connection: {e}")

# If connection works, try a simple query
if result.returncode == 0:
    print("\nTesting simple query...")
    try:
        query_result = subprocess.run([
            'sf', 'data', 'query',
            '-q', 'SELECT Id, Name FROM Contact LIMIT 1',
            '--target-org', ORG_ALIAS
        ], capture_output=True, text=True, timeout=30)
        
        print(f"Query return code: {query_result.returncode}")
        if query_result.returncode == 0:
            print("✅ Query successful")
        else:
            print(f"❌ Query failed: {query_result.stderr}")
    except Exception as e:
        print(f"Error running query: {e}")
