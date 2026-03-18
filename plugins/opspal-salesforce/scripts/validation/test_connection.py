#!/usr/bin/env python3

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

def run_cmd(cmd):
    """Run command and return result"""
    result = subprocess.run(cmd, shell=True, cwd=INSTANCE_ROOT, 
                          capture_output=True, text=True)
    return result

def main():
    print("Testing Salesforce connection...")
    
    # Test org display
    result = run_cmd(f"sf org display --target-org {ORG_ALIAS} --json")
    print(f"Org display return code: {result.returncode}")
    
    if result.returncode == 0:
        try:
            org_data = json.loads(result.stdout)
            print(f"✓ Connected to: {org_data['result']['username']}")
            print(f"  Org ID: {org_data['result']['id']}")
        except:
            print("Failed to parse org info")
            print(f"Raw output: {result.stdout}")
    else:
        print("✗ Failed to connect to org")
        print(f"Error: {result.stderr}")
        return
    
    # Query for Contact layouts
    print("\nQuerying Contact layouts...")
    query = "SELECT Name, Id FROM Layout WHERE TableEnumOrId = 'Contact'"
    result = run_cmd(f'sf data query --use-tooling-api --query "{query}" --target-org {ORG_ALIAS} --json')
    
    if result.returncode == 0:
        try:
            query_data = json.loads(result.stdout)
            layouts = query_data['result']['records']
            print(f"✓ Found {len(layouts)} Contact layouts:")
            for layout in layouts:
                print(f"  - {layout['Name']}")
        except:
            print("Failed to parse query result")
            print(f"Raw output: {result.stdout}")
    else:
        print("✗ Failed to query layouts")
        error_output = result.stderr.strip() or result.stdout.strip()
        if error_output:
            print(f"Error: {error_output}")
        return
    
    # Create force-app directory
    os.makedirs('force-app/main/default', exist_ok=True)
    
    # Try to retrieve layouts
    print("\nRetrieving Contact layouts...")
    result = run_cmd(f'sf project retrieve start -m "Layout:Contact*" --target-org {ORG_ALIAS}')
    
    print(f"Retrieve return code: {result.returncode}")
    print(f"Retrieve output: {result.stdout}")
    if result.stderr:
        print(f"Retrieve error: {result.stderr}")
    
    # List what we got
    print("\nListing retrieved files...")
    result = run_cmd("find force-app -name '*.layout*' -type f")
    if result.stdout.strip():
        print("Layout files found:")
        print(result.stdout)
    else:
        print("No layout files found")
        # List all files in force-app
        result = run_cmd("find force-app -type f")
        print("All files in force-app:")
        print(result.stdout)

if __name__ == "__main__":
    main()
