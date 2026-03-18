#!/usr/bin/env python3
import os
import subprocess
import sys


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

def run_deployment():
    """Execute the RevOps flows deployment"""
    try:
        print("Starting RevOps Flows Deployment...")

        script_path = SCRIPT_DIR / "deploy_revops_flows.py"
        if not script_path.exists():
            print(f"❌ Deployment script not found: {script_path}")
            return False

        result = subprocess.run([
            sys.executable,
            str(script_path)
        ],
        capture_output=True, 
        text=True,
        cwd=INSTANCE_ROOT)
        
        print("STDOUT:")
        print(result.stdout)
        
        if result.stderr:
            print("STDERR:")
            print(result.stderr)
        
        print(f"Return code: {result.returncode}")
        
        if result.returncode == 0:
            print("\n✅ RevOps Flows deployment completed successfully!")
        else:
            print("\n❌ RevOps Flows deployment failed!")
            
        return result.returncode == 0
        
    except Exception as e:
        print(f"❌ Error running deployment: {e}")
        return False

if __name__ == "__main__":
    success = run_deployment()
    sys.exit(0 if success else 1)