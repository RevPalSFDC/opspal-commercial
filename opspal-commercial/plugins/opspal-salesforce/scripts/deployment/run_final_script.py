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
    print("Executing final Contact layout modification script...")
    print("=" * 60)
    
    try:
        # Execute the final script
        script_path = SCRIPT_DIR.parent / "utilities" / "final_layout_script.py"
        if not script_path.exists():
            print(f"❌ Final layout script not found: {script_path}")
            return
        result = subprocess.run([sys.executable, str(script_path)], 
                              capture_output=False, text=True, timeout=600, cwd=INSTANCE_ROOT)
        
        print(f"\n{'='*60}")
        print(f"Script completed with exit code: {result.returncode}")
        
        if result.returncode == 0:
            print("✅ SUCCESS: Contact layout modification completed!")
        else:
            print("❌ FAILED: Script encountered errors")
            
    except subprocess.TimeoutExpired:
        print("❌ Script timed out after 10 minutes")
    except KeyboardInterrupt:
        print("\n❌ Script interrupted by user")
    except Exception as e:
        print(f"❌ Error running script: {e}")

if __name__ == "__main__":
    main()