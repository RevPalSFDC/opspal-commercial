#!/usr/bin/env python3
"""
Direct execution of SF CLI commands to add Is_DVM__c to Contact layout
"""

import subprocess
import os
import json


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

def run_cmd_interactive(cmd_list):
    """Run command with live output"""
    print(f"\n🔧 Running: {' '.join(cmd_list)}")
    print("-" * 50)
    
    try:
        # Run command with live output
        process = subprocess.Popen(
            cmd_list,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            cwd=INSTANCE_ROOT
        )
        
        # Print output in real time
        for line in process.stdout:
            print(line.rstrip())
        
        process.wait()
        print(f"\n✅ Command completed with return code: {process.returncode}")
        return process.returncode == 0
        
    except Exception as e:
        print(f"❌ Error running command: {e}")
        return False

def main():
    os.chdir(INSTANCE_ROOT)
    
    print("🎯 DIRECT SF CLI EXECUTION TO ADD Is_DVM__c TO CONTACT LAYOUT")
    print("=" * 65)
    
    # Step 1: Test connection
    print(f"\n1️⃣  Testing connection to {ORG_ALIAS}")
    success = run_cmd_interactive(['sf', 'org', 'display', '--target-org', ORG_ALIAS])
    
    if not success:
        print("❌ Cannot connect to org. Please check authentication.")
        return
    
    # Step 2: Create project structure
    print("\n2️⃣  Setting up project structure")
    os.makedirs('force-app/main/default/layouts', exist_ok=True)
    
    # Create project config required by SF CLI
    project_config = {
        "packageDirectories": [{"path": "force-app", "default": True}],
        "name": "ContactLayoutMod", 
        "sourceApiVersion": "61.0"
    }
    
    with open('sfdx-project.json', 'w') as f:
        json.dump(project_config, f, indent=2)
    
    print("✅ Project structure created")
    
    # Step 3: Query Contact layouts
    print("\n3️⃣  Querying Contact layouts")
    success = run_cmd_interactive([
        'sf', 'data', 'query',
        '--use-tooling-api',
        '--query', "SELECT Name FROM Layout WHERE TableEnumOrId = 'Contact'",
        '--target-org', ORG_ALIAS
    ])
    
    # Step 4: Retrieve Contact layouts  
    print("\n4️⃣  Retrieving Contact layouts")
    success = run_cmd_interactive([
        'sf', 'project', 'retrieve', 'start',
        '-m', 'Layout:Contact*',
        '--target-org', ORG_ALIAS
    ])
    
    # Step 5: List what was retrieved
    print("\n5️⃣  Checking retrieved files")
    run_cmd_interactive(['find', 'force-app', '-name', '*.layout*', '-type', 'f'])
    
    # Step 6: If we have layout files, show their names
    try:
        result = subprocess.run(['find', 'force-app', '-name', '*.layout-meta.xml', '-type', 'f'], 
                              capture_output=True, text=True, cwd=INSTANCE_ROOT)
        
        if result.stdout.strip():
            layout_files = result.stdout.strip().split('\n')
            print(f"\n✅ Found {len(layout_files)} layout files:")
            for f in layout_files:
                print(f"   📄 {f}")
            
            # Step 7: Show content of first layout file
            if layout_files:
                first_layout = layout_files[0]
                print(f"\n6️⃣  Examining layout file: {first_layout}")
                run_cmd_interactive(['head', '-20', first_layout])
                
                # Check if Is_DVM__c is already there
                grep_result = subprocess.run(['grep', 'Is_DVM__c', first_layout], 
                                           capture_output=True, text=True)
                
                if grep_result.returncode == 0:
                    print("\n✅ Is_DVM__c field is already in the layout!")
                else:
                    print("\n⚠️  Is_DVM__c field not found in layout")
                    print("   This is where we would add the field to the XML")
                    
        else:
            print("\n❌ No layout files found after retrieval")
            
    except Exception as e:
        print(f"\n❌ Error checking files: {e}")
    
    print("\n🏁 Direct execution completed")
    print("   Next steps would be:")
    print("   1. Parse the layout XML")
    print("   2. Add Is_DVM__c field to appropriate section")
    print("   3. Deploy the modified layout")

if __name__ == "__main__":
    main()
