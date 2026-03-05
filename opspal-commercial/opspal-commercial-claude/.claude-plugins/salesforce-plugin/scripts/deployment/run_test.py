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

# Run the test connection script
try:
    script_path = SCRIPT_DIR.parent / "validation" / "test_connection.py"
    if not script_path.exists():
        print(f"❌ Test script not found: {script_path}")
        raise SystemExit(1)
    result = subprocess.run([sys.executable, str(script_path)], 
                          capture_output=True, text=True, timeout=120, cwd=INSTANCE_ROOT)
    
    print("=== STDOUT ===")
    print(result.stdout)
    print("\n=== STDERR ===") 
    print(result.stderr)
    print(f"\n=== RETURN CODE: {result.returncode} ===")
    
except subprocess.TimeoutExpired:
    print("Command timed out after 120 seconds")
except Exception as e:
    print(f"Error running command: {e}")