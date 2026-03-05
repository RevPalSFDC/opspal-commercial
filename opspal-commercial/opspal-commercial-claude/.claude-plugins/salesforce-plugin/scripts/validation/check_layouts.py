#!/usr/bin/env python3

import subprocess
import os
import json


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

def run_command(cmd):
    """Run an SF CLI command and return the result."""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        return result
    except Exception as e:
        print(f"Error: {e}")
        return None

def main():
    print("Checking SF CLI authentication and available layouts...")
    
    # Check org info
    result = run_command(f"sf org display --target-org {ORG_ALIAS} --json")
    if result and result.returncode == 0:
        org_info = json.loads(result.stdout)
        print(f"Connected to org: {org_info['result']['username']}")
        print(f"Org ID: {org_info['result']['id']}")
    else:
        print("Failed to connect to org")
        print(f"Error: {result.stderr if result else 'Unknown error'}")
        return
    
    # Query for Contact layouts
    print("\nQuerying for Contact layouts...")
    query_cmd = f'sf data query --use-tooling-api --query "SELECT Name, Id FROM Layout WHERE TableEnumOrId = \'Contact\'" --target-org {ORG_ALIAS} --json'
    result = run_command(query_cmd)
    
    if result and result.returncode == 0:
        try:
            query_result = json.loads(result.stdout)
            layouts = query_result['result']['records']
            print(f"Found {len(layouts)} Contact layouts:")
            for layout in layouts:
                print(f"  - {layout['Name']} (ID: {layout['Id']})")
        except:
            print("Failed to parse query result")
            print(f"Raw output: {result.stdout}")
    else:
        print("Failed to query layouts")
        if result:
            error_output = result.stderr.strip() or result.stdout.strip()
            if error_output:
                print(f"Error: {error_output}")
    
    # Try to retrieve metadata for Contact layouts
    print("\nAttempting to retrieve Contact layouts...")
    os.makedirs(PROJECT_ROOT, exist_ok=True)
    os.chdir(INSTANCE_ROOT)
    
    retrieve_cmd = f'sf project retrieve start -m "Layout:Contact*" --target-org {ORG_ALIAS}'
    result = run_command(retrieve_cmd)
    
    if result:
        print(f"Retrieve command result: {result.returncode}")
        print(f"Output: {result.stdout}")
        if result.stderr:
            print(f"Error: {result.stderr}")
    
    # List what we got
    print("\nFiles retrieved:")
    list_result = run_command("find . -name '*.layout*' -type f")
    if list_result:
        print(list_result.stdout)

if __name__ == "__main__":
    main()
