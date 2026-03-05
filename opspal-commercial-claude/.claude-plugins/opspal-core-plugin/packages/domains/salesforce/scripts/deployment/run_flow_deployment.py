#!/usr/bin/env python3
import subprocess
import os
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

def make_executable_and_run():
    """Make the deploy script executable and run it"""
    script_path = SCRIPT_DIR.parent / "lib" / "validate_and_deploy_flow.py"
    
    try:
        if not script_path.exists():
            print(f"❌ Deployment script not found: {script_path}")
            return

        # Make script executable
        print("Making deploy script executable...")
        subprocess.run(['chmod', '+x', str(script_path)], check=True)
        
        # Run the deployment script
        print("Running flow deployment...")
        result = subprocess.run([sys.executable, str(script_path), *sys.argv[1:]], 
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
            print("✅ Flow deployment completed successfully!")
        else:
            print("❌ Flow deployment failed!")
            
    except subprocess.CalledProcessError as e:
        print(f"Error running deployment: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")

if __name__ == "__main__":
    make_executable_and_run()
