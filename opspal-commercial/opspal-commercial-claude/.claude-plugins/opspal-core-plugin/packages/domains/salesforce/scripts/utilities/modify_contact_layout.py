#!/usr/bin/env python3

import subprocess
import os
import xml.etree.ElementTree as ET
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

def run_command(cmd, cwd=None):
    """Run a shell command and return the result."""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd)
        return result
    except Exception as e:
        print(f"Error running command: {e}")
        return None

def main():
    # Set working directory
    base_dir = INSTANCE_ROOT
    os.chdir(base_dir)
    
    print("=== Modifying Contact Page Layout to Add Is_DVM__c Field ===")
    
    # Step 1: Test org connection
    print("1. Testing org connection...")
    result = run_command(f"sf org display --target-org {ORG_ALIAS} --json")
    
    if not result or result.returncode != 0:
        print("✗ Failed to connect to org")
        print(f"Error: {result.stderr if result else 'Unknown error'}")
        return False
    
    print(f"✓ Connected to {ORG_ALIAS}")
    
    # Step 2: Create project structure
    print("\n2. Creating project structure...")
    force_app_dir = Path("force-app/main/default/layouts")
    force_app_dir.mkdir(parents=True, exist_ok=True)
    print("✓ Created force-app/main/default/layouts directory")
    
    # Step 3: Query for Contact layouts
    print("\n3. Querying for Contact layouts...")
    query = "SELECT Name, Id FROM Layout WHERE TableEnumOrId = 'Contact'"
    result = run_command(f'sf data query --use-tooling-api --query "{query}" --target-org {ORG_ALIAS} --json')
    
    if not result or result.returncode != 0:
        print("✗ Failed to query layouts")
        print(f"Error: {result.stderr if result else 'Unknown error'}")
        return False
    
    try:
        query_data = json.loads(result.stdout)
        layouts = query_data['result']['records']
        print(f"✓ Found {len(layouts)} Contact layouts:")
        
        layout_name = None
        for layout in layouts:
            print(f"  - {layout['Name']}")
            if 'Contact Layout' in layout['Name'] or layout['Name'] == 'Contact Layout':
                layout_name = layout['Name']
        
        if not layout_name and layouts:
            layout_name = layouts[0]['Name']  # Use the first one found
            
        if not layout_name:
            print("✗ No Contact layouts found")
            return False
            
        print(f"✓ Will modify layout: {layout_name}")
        
    except Exception as e:
        print(f"✗ Failed to parse layout query: {e}")
        return False
    
    # Step 4: Retrieve the existing layout
    print(f"\n4. Retrieving layout: {layout_name}")
    layout_metadata_name = f"Layout:Contact-{layout_name.replace(' ', '%20')}"
    result = run_command(f'sf project retrieve start -m "{layout_metadata_name}" --target-org {ORG_ALIAS}')
    
    if not result or result.returncode != 0:
        # Try a different approach - retrieve all Contact layouts
        print("   Trying to retrieve all Contact layouts...")
        result = run_command(f'sf project retrieve start -m "Layout:Contact*" --target-org {ORG_ALIAS}')
        
        if not result or result.returncode != 0:
            print("✗ Failed to retrieve Contact layouts")
            print(f"Error: {result.stderr if result else 'Unknown error'}")
            return False
    
    print("✓ Layout retrieval command executed")
    
    # Step 5: Find the retrieved layout file
    print("\n5. Looking for retrieved layout files...")
    layout_files = list(Path("force-app").rglob("*.layout-meta.xml"))
    
    if not layout_files:
        print("✗ No layout files found after retrieval")
        # List all files in force-app to debug
        all_files = list(Path("force-app").rglob("*"))
        print("Files found in force-app:")
        for f in all_files:
            print(f"  {f}")
        return False
    
    print(f"✓ Found {len(layout_files)} layout files:")
    for f in layout_files:
        print(f"  {f}")
    
    # Use the first layout file found
    layout_file = layout_files[0]
    
    # Step 6: Parse and modify the layout
    print(f"\n6. Modifying layout file: {layout_file}")
    
    try:
        # Parse the XML
        tree = ET.parse(layout_file)
        root = tree.getroot()
        
        # Find the Contact Information section or create it
        namespace = {'': 'http://soap.sforce.com/2006/04/metadata'}
        sections = root.findall('.//layoutSections', namespace)
        
        contact_info_section = None
        for section in sections:
            label_elem = section.find('label', namespace)
            if label_elem is not None and 'Contact Information' in label_elem.text:
                contact_info_section = section
                break
        
        # If no Contact Information section, use the first section
        if not contact_info_section and sections:
            contact_info_section = sections[0]
        
        if not contact_info_section:
            print("✗ Could not find a suitable section to add the field")
            return False
        
        # Check if Is_DVM__c is already in the layout
        existing_fields = []
        for item in contact_info_section.findall('.//layoutItems', namespace):
            field_elem = item.find('field', namespace)
            if field_elem is not None:
                existing_fields.append(field_elem.text)
        
        if 'Is_DVM__c' in existing_fields:
            print("✓ Is_DVM__c field is already in the layout")
            return True
        
        # Add Is_DVM__c field to the first column
        columns = contact_info_section.findall('layoutColumns', namespace)
        if columns:
            first_column = columns[0]
            
            # Create new layout item for Is_DVM__c
            new_item = ET.SubElement(first_column, 'layoutItems')
            behavior = ET.SubElement(new_item, 'behavior')
            behavior.text = 'Edit'
            field = ET.SubElement(new_item, 'field')
            field.text = 'Is_DVM__c'
            
            print("✓ Added Is_DVM__c field to the layout")
        else:
            print("✗ Could not find layout columns to add the field")
            return False
        
        # Step 7: Write the modified layout back
        tree.write(layout_file, encoding='utf-8', xml_declaration=True)
        print(f"✓ Modified layout saved to {layout_file}")
        
        # Step 8: Deploy the changes
        print(f"\n7. Deploying modified layout...")
        result = run_command(f'sf project deploy start --source-dir force-app/main/default/layouts --target-org {ORG_ALIAS}')
        
        if not result or result.returncode != 0:
            print("✗ Failed to deploy layout changes")
            print(f"Error: {result.stderr if result else 'Unknown error'}")
            return False
        
        print("✓ Layout deployed successfully!")
        print(f"✓ Is_DVM__c field has been added to the Contact page layout")
        
        return True
        
    except Exception as e:
        print(f"✗ Error modifying layout: {e}")
        return False

if __name__ == "__main__":
    success = main()
    if success:
        print("\n🎉 Task completed successfully!")
    else:
        print("\n❌ Task failed!")
