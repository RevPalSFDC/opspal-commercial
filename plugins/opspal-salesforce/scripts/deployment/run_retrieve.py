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

def run_command(cmd, cwd=None):
    """Run a shell command and return the result."""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd)
        print(f"Command: {cmd}")
        print(f"Return code: {result.returncode}")
        print(f"STDOUT: {result.stdout}")
        if result.stderr:
            print(f"STDERR: {result.stderr}")
        return result
    except Exception as e:
        print(f"Error running command: {e}")
        return None

def main():
    # Create temp directory
    temp_dir = INSTANCE_ROOT
    os.makedirs(temp_dir, exist_ok=True)
    
    # Change to temp directory
    os.chdir(temp_dir)
    
    # First, let's check if we can connect to the org
    print("Checking org connection...")
    result = run_command(f"sf org display --target-org {ORG_ALIAS}")
    
    if result and result.returncode == 0:
        print("Connected to org successfully!")
        
        # Try to retrieve the Contact page layout
        print("\nRetrieving Contact page layout...")
        result = run_command(f'sf project retrieve start -m "Layout:Contact-Contact Layout" --target-org {ORG_ALIAS}')
        
        if result and result.returncode == 0:
            print("Layout retrieved successfully!")
            
            # List retrieved files
            print("\nLooking for layout files...")
            result = run_command("find . -name '*.layout*' -type f")
            
            # Also try to find any metadata files
            print("\nAll files in directory:")
            result = run_command("find . -type f")
        else:
            print("Failed to retrieve layout. Let's try a different approach...")
            # Try retrieving all Contact layouts
            result = run_command(f'sf project retrieve start -m "Layout:Contact*" --target-org {ORG_ALIAS}')
    else:
        print("Failed to connect to org. Verify SF CLI auth and try again.")
        sys.exit(1)

if __name__ == "__main__":
    main()
