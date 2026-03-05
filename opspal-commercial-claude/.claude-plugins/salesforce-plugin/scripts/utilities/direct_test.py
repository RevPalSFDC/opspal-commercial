import subprocess
import json
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

# Set working directory
os.chdir(INSTANCE_ROOT)

print("=== Testing Salesforce Connection ===")

# Test connection
cmd = f"sf org display --target-org {ORG_ALIAS} --json"
result = subprocess.run(cmd, shell=True, capture_output=True, text=True)

print(f"Command: {cmd}")
print(f"Return code: {result.returncode}")
print(f"STDOUT: {result.stdout}")
print(f"STDERR: {result.stderr}")

if result.returncode == 0:
    print("✓ Successfully connected to org")
    
    # Parse org info
    try:
        org_info = json.loads(result.stdout)
        print(f"Username: {org_info['result']['username']}")
        print(f"Org ID: {org_info['result']['id']}")
    except:
        print("Could not parse org info")
else:
    print("✗ Failed to connect")

# Query for layouts
print("\n=== Querying for Contact Layouts ===")
query_cmd = f'sf data query --use-tooling-api --query "SELECT Name FROM Layout WHERE TableEnumOrId = \'Contact\'" --target-org {ORG_ALIAS} --json'
result = subprocess.run(query_cmd, shell=True, capture_output=True, text=True)

print(f"Query return code: {result.returncode}")
if result.returncode == 0:
    try:
        query_result = json.loads(result.stdout)
        layouts = query_result['result']['records']
        print(f"Found {len(layouts)} Contact layouts:")
        for layout in layouts:
            print(f"  - {layout['Name']}")
    except:
        print(f"Could not parse query result: {result.stdout}")
else:
    print(f"Query failed: {result.stderr}")

# Create project structure
print("\n=== Creating Project Structure ===")
os.makedirs('force-app/main/default', exist_ok=True)
print("Created force-app/main/default directory")

# Retrieve layouts
print("\n=== Retrieving Contact Layouts ===")
retrieve_cmd = f'sf project retrieve start -m "Layout:Contact*" --target-org {ORG_ALIAS}'
result = subprocess.run(retrieve_cmd, shell=True, capture_output=True, text=True)

print(f"Retrieve command: {retrieve_cmd}")
print(f"Return code: {result.returncode}")
print(f"STDOUT: {result.stdout}")
if result.stderr:
    print(f"STDERR: {result.stderr}")

# List retrieved files
print("\n=== Listing Retrieved Files ===")
list_cmd = "find force-app -name '*.layout*' -type f"
result = subprocess.run(list_cmd, shell=True, capture_output=True, text=True)
print(f"Layout files: {result.stdout}")

# List all metadata files
list_all_cmd = "find force-app -type f"
result = subprocess.run(list_all_cmd, shell=True, capture_output=True, text=True)
print(f"All files: {result.stdout}")
