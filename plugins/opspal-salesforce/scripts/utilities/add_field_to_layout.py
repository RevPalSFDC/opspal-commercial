#!/usr/bin/env python3

import subprocess
import os
import json
import xml.etree.ElementTree as ET
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

def execute_command(cmd):
    """Execute a command and return result with detailed output"""
    print(f"🔧 Executing: {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    
    try:
        if isinstance(cmd, str):
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=120)
        else:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        
        print(f"   Return code: {result.returncode}")
        
        if result.stdout:
            print("   STDOUT:")
            for line in result.stdout.strip().split('\n'):
                print(f"     {line}")
        
        if result.stderr:
            print("   STDERR:")
            for line in result.stderr.strip().split('\n'):
                print(f"     {line}")
        
        return result
        
    except subprocess.TimeoutExpired:
        print("   ❌ Command timed out")
        return None
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return None

def main():
    # Set working directory
    os.chdir(INSTANCE_ROOT)
    
    print("🎯 Adding Is_DVM__c field to Contact Page Layout")
    print("=" * 55)
    
    # Step 1: Verify connection
    print("\n1️⃣  VERIFYING CONNECTION")
    result = execute_command(['sf', 'org', 'display', '--target-org', ORG_ALIAS])
    
    if not result or result.returncode != 0:
        print(f"❌ Cannot connect to {ORG_ALIAS} org")
        return False
    
    print(f"✅ Connected to {ORG_ALIAS}")
    
    # Step 2: Setup project structure
    print("\n2️⃣  SETTING UP PROJECT STRUCTURE")
    
    # Create project config required by SF CLI
    project_config = {
        "packageDirectories": [{"path": "force-app", "default": True}],
        "name": "ContactLayoutMod",
        "sourceApiVersion": "61.0"
    }
    
    with open('sfdx-project.json', 'w') as f:
        json.dump(project_config, f, indent=2)
    
    # Create directories
    Path('force-app/main/default/layouts').mkdir(parents=True, exist_ok=True)
    
    print("✅ Project structure ready")
    
    # Step 3: Query for Contact layouts
    print("\n3️⃣  QUERYING CONTACT LAYOUTS")
    result = execute_command([
        'sf', 'data', 'query',
        '--use-tooling-api',
        '--query', "SELECT Name FROM Layout WHERE TableEnumOrId = 'Contact'",
        '--target-org', ORG_ALIAS,
        '--json'
    ])
    
    if not result or result.returncode != 0:
        print("❌ Failed to query Contact layouts")
        return False
    
    try:
        query_data = json.loads(result.stdout)
        layouts = [record['Name'] for record in query_data['result']['records']]
        print(f"✅ Found layouts: {layouts}")
    except:
        print("❌ Could not parse layout query results")
        return False
    
    # Step 4: Retrieve Contact layouts
    print("\n4️⃣  RETRIEVING CONTACT LAYOUTS")
    result = execute_command([
        'sf', 'project', 'retrieve', 'start',
        '-m', 'Layout:Contact*',
        '--target-org', ORG_ALIAS
    ])
    
    # Check if any files were retrieved
    layout_files = list(Path('force-app').rglob('*Contact*.layout-meta.xml'))
    
    if not layout_files:
        print("❌ No Contact layout files retrieved")
        
        # Try alternative retrieval approach
        print("   Trying alternative metadata retrieval...")
        for layout_name in layouts[:2]:  # Try first 2 layouts
            alt_result = execute_command([
                'sf', 'project', 'retrieve', 'start',
                '-m', f'Layout:Contact-{layout_name}',
                '--target-org', ORG_ALIAS
            ])
            
            layout_files = list(Path('force-app').rglob('*.layout-meta.xml'))
            if layout_files:
                break
    
    if not layout_files:
        print("❌ Still no layout files found after retrieval attempts")
        return False
    
    print(f"✅ Retrieved {len(layout_files)} layout files:")
    for f in layout_files:
        print(f"   📄 {f}")
    
    # Step 5: Modify the layout to include Is_DVM__c
    print("\n5️⃣  MODIFYING LAYOUT TO ADD Is_DVM__c")
    
    layout_file = layout_files[0]
    print(f"   Modifying: {layout_file.name}")
    
    try:
        # Read and parse the XML
        with open(layout_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Check if Is_DVM__c is already in the layout
        if 'Is_DVM__c' in content:
            print("✅ Is_DVM__c field is already present in the layout!")
            return True
        
        # Parse XML
        tree = ET.parse(layout_file)
        root = tree.getroot()
        
        # Register namespace
        ns = 'http://soap.sforce.com/2006/04/metadata'
        ET.register_namespace('', ns)
        
        # Find layout sections
        sections = root.findall(f'.//{{{ns}}}layoutSections')
        
        if not sections:
            print("❌ No layout sections found")
            return False
        
        # Find a suitable section (preferably Contact Information)
        target_section = sections[0]  # Default to first section
        
        for section in sections:
            label_elem = section.find(f'.//{{{ns}}}label')
            if label_elem is not None:
                label_text = label_elem.text or ""
                if 'Contact' in label_text or 'Information' in label_text:
                    target_section = section
                    print(f"   📍 Using section: {label_text}")
                    break
        
        # Find the first layout column in the target section
        columns = target_section.findall(f'.//{{{ns}}}layoutColumns')
        
        if not columns:
            print("❌ No layout columns found in target section")
            return False
        
        first_column = columns[0]
        
        # Add Is_DVM__c field as a new layout item
        new_item = ET.SubElement(first_column, f'{{{ns}}}layoutItems')
        behavior = ET.SubElement(new_item, f'{{{ns}}}behavior')
        behavior.text = 'Edit'
        field = ET.SubElement(new_item, f'{{{ns}}}field')
        field.text = 'Is_DVM__c'
        
        # Write back the modified XML
        tree.write(layout_file, encoding='utf-8', xml_declaration=True)
        
        print("✅ Added Is_DVM__c field to the layout")
        
    except Exception as e:
        print(f"❌ Error modifying layout: {e}")
        return False
    
    # Step 6: Deploy the modified layout
    print("\n6️⃣  DEPLOYING MODIFIED LAYOUT")
    result = execute_command([
        'sf', 'project', 'deploy', 'start',
        '--source-dir', 'force-app/main/default/layouts',
        '--target-org', ORG_ALIAS
    ])
    
    if not result or result.returncode != 0:
        print("❌ Failed to deploy the modified layout")
        return False
    
    print("✅ Layout deployed successfully!")
    
    print("\n🎉 SUCCESS!")
    print("✅ Is_DVM__c checkbox field has been added to the Contact page layout")
    print("✅ Users can now see and edit the Is_DVM__c field on Contact records")
    
    return True

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
