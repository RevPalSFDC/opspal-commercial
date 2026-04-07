#!/usr/bin/env python3

import subprocess
import os


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

def run_cmd(command, timeout=60):
    """Run a command and return result"""
    try:
        print(f"🔄 Running: {' '.join(command) if isinstance(command, list) else command}")
        if isinstance(command, str):
            result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=timeout)
        else:
            result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
        
        print(f"Return code: {result.returncode}")
        if result.stdout:
            print(f"Output: {result.stdout[:500]}...")  # First 500 chars
        if result.stderr:
            print(f"Error: {result.stderr[:500]}...")   # First 500 chars
        
        return result
    except Exception as e:
        print(f"❌ Command failed: {e}")
        return None

def main():
    # Change to project directory
    os.chdir(INSTANCE_ROOT)
    
    print("🚀 Testing Salesforce deployment for Count_of_DVMs__c field")
    print("="*60)
    
    # Step 1: Check SF CLI
    print("1️⃣  Checking Salesforce CLI...")
    sf_version = run_cmd(['sf', '--version'])
    if sf_version and sf_version.returncode == 0:
        print("✅ Salesforce CLI is available")
    else:
        print("❌ Salesforce CLI not found")
        return
    
    # Step 2: Check org authentication
    print(f"\n2️⃣  Checking {ORG_ALIAS} authentication...")
    org_check = run_cmd(['sf', 'org', 'display', '--target-org', ORG_ALIAS])
    if org_check and org_check.returncode == 0:
        print(f"✅ {ORG_ALIAS} org authenticated")
    else:
        print(f"❌ {ORG_ALIAS} org not authenticated")
        print(f"Please run: sf org login web --alias {ORG_ALIAS} --instance-url https://test.salesforce.com")
        return
    
    # Step 3: Check if field already exists
    print("\n3️⃣  Checking if Count_of_DVMs__c field already exists...")
    field_check = run_cmd([
        'sf', 'data', 'query',
        '--query', "SELECT Id, DeveloperName, MasterLabel, TableEnumOrId FROM CustomField WHERE TableEnumOrId = 'Account' AND DeveloperName = 'Count_of_DVMs__c'",
        '--use-tooling-api',
        '--target-org', ORG_ALIAS,
        '--json'
    ])
    
    if field_check and field_check.returncode == 0 and 'Count_of_DVMs__c' in field_check.stdout:
        print(f"✅ Count_of_DVMs__c field already exists in {ORG_ALIAS}!")
        print("Field verification successful")
        return
    
    # Step 4: Deploy the field
    print("\n4️⃣  Deploying Count_of_DVMs__c field...")
    deploy_cmd = [
        'sf', 'project', 'deploy', 'start',
        '--source-dir', 'force-app/main/default/objects/Account/fields/Count_of_DVMs__c.field-meta.xml',
        '--target-org', ORG_ALIAS,
        '--wait', '10'
    ]
    
    deploy_result = run_cmd(deploy_cmd)
    
    if deploy_result and deploy_result.returncode == 0:
        print("✅ Deployment successful!")
        
        # Step 5: Verify deployment
        print("\n5️⃣  Verifying deployment...")
        verify_result = run_cmd([
            'sf', 'data', 'query',
            '--query', "SELECT Id, DeveloperName, MasterLabel, TableEnumOrId FROM CustomField WHERE TableEnumOrId = 'Account' AND DeveloperName = 'Count_of_DVMs__c'",
            '--use-tooling-api',
            '--target-org', ORG_ALIAS
        ])
        
        if verify_result and verify_result.returncode == 0:
            print("✅ Field verification successful!")
        else:
            print("⚠️  Field verification had issues, but deployment may have succeeded")
    else:
        print("❌ Deployment failed")
        return
    
    print("\n🎉 Count_of_DVMs__c field deployment completed!")
    print("Next steps:")
    print("- Add field to Account page layouts")
    print("- Configure field-level security")
    print("- Test field functionality")

if __name__ == "__main__":
    main()
