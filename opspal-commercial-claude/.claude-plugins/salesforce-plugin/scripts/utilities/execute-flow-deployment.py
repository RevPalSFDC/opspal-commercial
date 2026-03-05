#!/usr/bin/env python3

import os
import subprocess
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

def main():
    """Deploy the Contract Creation Flow fix to the target org"""
    
    print("🚀 Executing Contract Creation Flow Fix Deployment")
    print("=" * 60)
    
    # Make deployment script executable
    script_path = SCRIPT_DIR.parent / "lib" / "validate_and_deploy_flow.py"
    try:
        if not script_path.exists():
            print(f"❌ Deployment script not found: {script_path}")
            return 1
        os.chmod(script_path, 0o755)
        print(f"✅ Made {script_path} executable")
    except Exception as e:
        print(f"❌ Error making script executable: {e}")
        return 1
    
    # Execute the deployment script
    try:
        print("🔄 Running deployment script...")
        result = subprocess.run([sys.executable, str(script_path), *sys.argv[1:]], 
                              capture_output=True, 
                              text=True, 
                              cwd=INSTANCE_ROOT)
        
        print("📤 Deployment Output:")
        print("-" * 40)
        print(result.stdout)
        
        if result.stderr:
            print("⚠️  Deployment Errors:")
            print("-" * 40)
            print(result.stderr)
        
        if result.returncode == 0:
            print("✅ Deployment completed successfully!")
        else:
            print(f"❌ Deployment failed with return code: {result.returncode}")
            return result.returncode
            
    except Exception as e:
        print(f"❌ Error executing deployment script: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
