#!/usr/bin/env python3

import subprocess
import os
import sys


from pathlib import Path


LIB_DIR = Path(__file__).resolve().parent / "lib"
if not LIB_DIR.exists():
    LIB_DIR = Path(__file__).resolve().parent.parent / "lib"
sys.path.insert(0, str(LIB_DIR))

from instance_resolver import resolve_project_root, resolve_instance_root, require_sf_project, resolve_org_alias, require_org_alias

PROJECT_ROOT = resolve_project_root()
INSTANCE_ROOT = resolve_instance_root(PROJECT_ROOT)
require_sf_project(INSTANCE_ROOT)
ORG_ALIAS = require_org_alias(resolve_org_alias(PROJECT_ROOT, INSTANCE_ROOT))

SCRIPT_DIR = Path(__file__).resolve().parent

def run_command(cmd, cwd=None):
    """Run a command and return the result"""
    try:
        print(f"🔄 Running: {cmd}")
        result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
        
        if result.stdout:
            print("📤 Output:")
            print(result.stdout)
        
        if result.stderr:
            print("⚠️  Errors/Warnings:")
            print(result.stderr)
            
        return result
    except Exception as e:
        print(f"❌ Error running command: {e}")
        return None

def main():
    """Deploy Count_of_DVMs__c field to the target org"""
    print(f"🚀 Starting deployment of Count_of_DVMs__c field to {ORG_ALIAS}")
    
    # Make the deployment script executable
    print("📋 Making deployment script executable...")
    script_path = SCRIPT_DIR / "deploy-count-dvms-field.sh"
    if script_path.exists() and script_path.stat().st_size > 0:
        chmod_result = run_command(f"chmod +x {script_path}", cwd=SCRIPT_DIR)
    else:
        chmod_result = None
        print(f"⚠️  Deployment script missing or empty: {script_path}")
    
    if chmod_result and chmod_result.returncode == 0:
        print("✅ Script made executable")
    elif chmod_result is not None:
        print("❌ Failed to make script executable")

    # Run the deployment script
    deploy_result = None
    if script_path.exists() and script_path.stat().st_size > 0:
        print("🚀 Running deployment script...")
        deploy_result = run_command(str(script_path), cwd=SCRIPT_DIR)
    
    if deploy_result and deploy_result.returncode == 0:
        print("✅ Deployment completed successfully!")
    else:
        print("❌ Deployment failed")
        print("Let's try alternative deployment method...")
        
        # Alternative deployment using sf command directly
        print("🔄 Trying direct sf deployment...")
        direct_deploy = run_command(
            f"sf project deploy start --source-dir metadata --target-org {ORG_ALIAS} --wait 10",
            cwd=INSTANCE_ROOT
        )
        
        if direct_deploy and direct_deploy.returncode == 0:
            print("✅ Direct deployment successful!")
        else:
            print("❌ Direct deployment also failed")

if __name__ == "__main__":
    main()
