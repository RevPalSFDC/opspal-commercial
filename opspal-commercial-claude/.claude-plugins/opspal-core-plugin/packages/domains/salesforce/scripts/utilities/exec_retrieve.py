#!/usr/bin/env python3

import subprocess
import os


from pathlib import Path

import sys

LIB_DIR = Path(__file__).resolve().parent / "lib"
if not LIB_DIR.exists():
    LIB_DIR = Path(__file__).resolve().parent.parent / "lib"
sys.path.insert(0, str(LIB_DIR))

from instance_resolver import resolve_project_root

PROJECT_ROOT = resolve_project_root()

SCRIPT_DIR = Path(__file__).resolve().parent

def main():
    os.chdir(SCRIPT_DIR)
    
    # Make script executable
    os.chmod('retrieve_contact_layout.sh', 0o755)
    
    # Run the script
    result = subprocess.run(['./retrieve_contact_layout.sh'], capture_output=True, text=True, cwd=SCRIPT_DIR)
    
    print("STDOUT:")
    print(result.stdout)
    print("\nSTDERR:")
    print(result.stderr)
    print(f"\nReturn code: {result.returncode}")

if __name__ == "__main__":
    main()