#!/usr/bin/env python3

import subprocess
import sys
import os


from pathlib import Path


LIB_DIR = Path(__file__).resolve().parent / "lib"
if not LIB_DIR.exists():
    LIB_DIR = Path(__file__).resolve().parent.parent / "lib"
sys.path.insert(0, str(LIB_DIR))

from instance_resolver import resolve_project_root, resolve_instance_root, require_sf_project

PROJECT_ROOT = resolve_project_root()
INSTANCE_ROOT = resolve_instance_root(PROJECT_ROOT)
require_sf_project(INSTANCE_ROOT)

SCRIPT_DIR = Path(__file__).resolve().parent

def main():
    print("Executing Contact layout modification script...")

    # Run the layout modification script
    try:
        script_path = SCRIPT_DIR.parent / "utilities" / "modify_contact_layout.py"
        if not script_path.exists():
            print(f"❌ Layout modification script not found: {script_path}")
            return
        result = subprocess.run([sys.executable, str(script_path)], 
                              capture_output=True, text=True, timeout=300, cwd=INSTANCE_ROOT)
        
        print("=== SCRIPT OUTPUT ===")
        print(result.stdout)
        
        if result.stderr:
            print("\n=== SCRIPT ERRORS ===")
            print(result.stderr)
        
        print(f"\n=== EXIT CODE: {result.returncode} ===")
        
        if result.returncode == 0:
            print("✅ Script executed successfully!")
        else:
            print("❌ Script failed!")
            
    except subprocess.TimeoutExpired:
        print("❌ Script timed out after 5 minutes")
    except Exception as e:
        print(f"❌ Error running script: {e}")

if __name__ == "__main__":
    main()