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
    
    # Change to the project directory
    project_dir = INSTANCE_ROOT
    os.chdir(project_dir)
    print(f"📁 Working directory: {os.getcwd()}")
    
    # Test org authentication first
    print(f"📋 Testing {ORG_ALIAS} authentication...")
    auth_result = run_command(f"sf org display --target-org {ORG_ALIAS}")
    
    if auth_result is None or auth_result.returncode != 0:
        print(f"❌ {ORG_ALIAS} org is not authenticated or not accessible")
        print("Please authenticate first:")
        print(f"sf org login web --alias {ORG_ALIAS} --instance-url https://test.salesforce.com")
        return False
    
    print(f"✅ {ORG_ALIAS} org is authenticated")
    
    # Make deployment script executable
    print("📋 Making deployment script executable...")
    script_path = SCRIPT_DIR / "deploy-count-dvms.sh"
    if script_path.exists() and script_path.stat().st_size > 0:
        chmod_result = run_command(f"chmod +x {script_path}", cwd=SCRIPT_DIR)
    else:
        print(f"⚠️  Deployment script missing or empty: {script_path}")
    
    # Run the deployment
    print("📦 Deploying Count_of_DVMs__c field...")
    
    deploy_cmd = f"""sf project deploy start \
        --source-dir "force-app/main/default/objects/Account/fields/Count_of_DVMs__c.field-meta.xml" \
        --target-org {ORG_ALIAS} \
        --wait 10 \
        --verbose"""
    
    deploy_result = run_command(deploy_cmd)
    
    if deploy_result and deploy_result.returncode == 0:
        print("✅ Deployment completed successfully!")
        
        # Verify the deployment
        print("🔍 Verifying field deployment...")
        verify_cmd = f"""sf data query \
            --query "SELECT DeveloperName, Label, DataType FROM CustomField WHERE TableEnumOrId = 'Account' AND DeveloperName = 'Count_of_DVMs__c'" \
            --target-org {ORG_ALIAS}"""
        
        verify_result = run_command(verify_cmd)
        
        if verify_result and verify_result.returncode == 0:
            print("✅ Field verification successful!")
            print()
            print("🎉 Next Steps:")
            print("1. Add the Count_of_DVMs__c field to Account page layouts")
            print("2. Configure field-level security if needed") 
            print("3. Test the field by updating Account records")
            return True
        else:
            print("⚠️  Field verification failed, but deployment may have succeeded")
            return True
    else:
        print("❌ Deployment failed")
        print("Checking if field already exists...")
        
        # Check if field already exists
        existing_check = run_command(f"""sf data query \
            --query "SELECT DeveloperName, Label FROM CustomField WHERE TableEnumOrId = 'Account' AND DeveloperName = 'Count_of_DVMs__c'" \
            --target-org {ORG_ALIAS}""")
        
        if existing_check and "Count_of_DVMs__c" in existing_check.stdout:
            print("✅ Field already exists in the org!")
            return True
        
        return False

if __name__ == "__main__":
    success = main()
    if success:
        print("\n🎉 Count_of_DVMs__c field deployment process completed!")
    else:
        print("\n❌ Deployment process failed")
        sys.exit(1)
