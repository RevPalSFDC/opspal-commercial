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

class ContactLayoutModifier:
    def __init__(self):
        self.base_dir = INSTANCE_ROOT
        self.target_org = ORG_ALIAS
        os.chdir(self.base_dir)
    
    def run_command(self, cmd, timeout=60):
        """Run a command and return the result"""
        try:
            if isinstance(cmd, str):
                result = subprocess.run(cmd, shell=True, capture_output=True, 
                                      text=True, timeout=timeout, cwd=self.base_dir)
            else:
                result = subprocess.run(cmd, capture_output=True, text=True, 
                                      timeout=timeout, cwd=self.base_dir)
            return result
        except subprocess.TimeoutExpired:
            print(f"Command timed out: {cmd}")
            return None
        except Exception as e:
            print(f"Error running command {cmd}: {e}")
            return None
    
    def test_connection(self):
        """Test the connection to Salesforce org"""
        print(f"🔍 Testing connection to {ORG_ALIAS}...")
        
        result = self.run_command(['sf', 'org', 'display', '--target-org', self.target_org, '--json'])
        
        if not result or result.returncode != 0:
            print("❌ Failed to connect to org")
            if result:
                print(f"Error: {result.stderr}")
            return False
        
        try:
            org_data = json.loads(result.stdout)
            username = org_data['result']['username']
            print(f"✅ Connected successfully to {username}")
            return True
        except:
            print("✅ Connected (could not parse details)")
            return True
    
    def setup_project(self):
        """Setup the Salesforce project structure"""
        print("📁 Setting up project structure...")
        
        # Create project config required by SF CLI if it doesn't exist.
        project_config = {
            "packageDirectories": [{"path": "force-app", "default": True}],
            "name": "ContactLayoutModification",
            "namespace": "",
            "sfdcLoginUrl": "https://login.salesforce.com",
            "sourceApiVersion": "61.0"
        }
        
        with open('sfdx-project.json', 'w') as f:
            json.dump(project_config, f, indent=2)
        
        # Create directory structure
        Path('force-app/main/default/layouts').mkdir(parents=True, exist_ok=True)
        print("✅ Project structure created")
        return True
    
    def find_contact_layouts(self):
        """Find available Contact page layouts"""
        print("🔍 Finding Contact page layouts...")
        
        query = "SELECT Name, Id FROM Layout WHERE TableEnumOrId = 'Contact'"
        result = self.run_command([
            'sf', 'data', 'query',
            '--use-tooling-api',
            '--query', query,
            '--target-org', self.target_org,
            '--json'
        ])
        
        if not result or result.returncode != 0:
            print("❌ Failed to query Contact layouts")
            if result:
                print(f"Error: {result.stderr}")
            return []
        
        try:
            query_data = json.loads(result.stdout)
            layouts = query_data['result']['records']
            
            print(f"✅ Found {len(layouts)} Contact layouts:")
            for layout in layouts:
                print(f"   • {layout['Name']}")
            
            return layouts
        except Exception as e:
            print(f"❌ Failed to parse layout query: {e}")
            return []
    
    def retrieve_layout(self, layout_name):
        """Retrieve a specific Contact layout"""
        print(f"📥 Retrieving layout: {layout_name}")
        
        # Try different metadata name formats
        metadata_names = [
            f"Layout:Contact-{layout_name}",
            f"Layout:Contact-{layout_name.replace(' ', '%20')}",
            "Layout:Contact*"
        ]
        
        for metadata_name in metadata_names:
            print(f"   Trying: {metadata_name}")
            result = self.run_command([
                'sf', 'project', 'retrieve', 'start',
                '-m', metadata_name,
                '--target-org', self.target_org
            ])
            
            if result and result.returncode == 0:
                print(f"✅ Successfully retrieved with: {metadata_name}")
                break
        else:
            print("❌ Failed to retrieve Contact layouts")
            return False
        
        # Check what was retrieved
        layout_files = list(Path('force-app').rglob('*.layout-meta.xml'))
        
        if layout_files:
            print(f"✅ Retrieved {len(layout_files)} layout files:")
            for f in layout_files:
                print(f"   • {f}")
            return True
        else:
            print("❌ No layout files found after retrieval")
            return False
    
    def modify_layout(self):
        """Add Is_DVM__c field to the Contact layout"""
        print("✏️  Modifying Contact layout to add Is_DVM__c field...")
        
        # Find the layout file
        layout_files = list(Path('force-app').rglob('*.layout-meta.xml'))
        
        if not layout_files:
            print("❌ No layout files found to modify")
            return False
        
        layout_file = layout_files[0]  # Use the first one
        print(f"   Modifying: {layout_file}")
        
        try:
            # Parse the XML
            tree = ET.parse(layout_file)
            root = tree.getroot()
            
            # Define namespace
            namespace = 'http://soap.sforce.com/2006/04/metadata'
            ET.register_namespace('', namespace)
            
            # Find layout sections
            sections = root.findall('.//{%s}layoutSections' % namespace)
            
            if not sections:
                print("❌ No layout sections found")
                return False
            
            # Look for Contact Information section, or use first section
            target_section = None
            for section in sections:
                label = section.find('.//{%s}label' % namespace)
                if label is not None and ('Contact Information' in label.text or 
                                        'Information' in label.text):
                    target_section = section
                    break
            
            if not target_section:
                target_section = sections[0]
                print("   Using first available section")
            else:
                print("   Found Contact Information section")
            
            # Check if Is_DVM__c is already there
            existing_fields = []
            for item in target_section.findall('.//{%s}layoutItems' % namespace):
                field_elem = item.find('.//{%s}field' % namespace)
                if field_elem is not None:
                    existing_fields.append(field_elem.text)
            
            if 'Is_DVM__c' in existing_fields:
                print("✅ Is_DVM__c field is already in the layout")
                return True
            
            # Add Is_DVM__c to the first column
            columns = target_section.findall('.//{%s}layoutColumns' % namespace)
            
            if not columns:
                print("❌ No layout columns found")
                return False
            
            first_column = columns[0]
            
            # Create new layout item
            new_item = ET.SubElement(first_column, '{%s}layoutItems' % namespace)
            behavior = ET.SubElement(new_item, '{%s}behavior' % namespace)
            behavior.text = 'Edit'
            field = ET.SubElement(new_item, '{%s}field' % namespace)
            field.text = 'Is_DVM__c'
            
            # Save the modified layout
            tree.write(layout_file, encoding='utf-8', xml_declaration=True, 
                      default_namespace=namespace)
            
            print("✅ Added Is_DVM__c field to the layout")
            return True
            
        except Exception as e:
            print(f"❌ Error modifying layout: {e}")
            return False
    
    def deploy_layout(self):
        """Deploy the modified layout back to Salesforce"""
        print("🚀 Deploying modified layout...")
        
        result = self.run_command([
            'sf', 'project', 'deploy', 'start',
            '--source-dir', 'force-app/main/default/layouts',
            '--target-org', self.target_org
        ])
        
        if not result or result.returncode != 0:
            print("❌ Failed to deploy layout")
            if result:
                print(f"Error: {result.stderr}")
            return False
        
        print("✅ Layout deployed successfully!")
        return True
    
    def run(self):
        """Execute the complete workflow"""
        print("🎯 Starting Contact Layout Modification")
        print("=" * 50)
        
        # Step 1: Test connection
        if not self.test_connection():
            return False
        
        # Step 2: Setup project
        if not self.setup_project():
            return False
        
        # Step 3: Find layouts
        layouts = self.find_contact_layouts()
        if not layouts:
            return False
        
        # Use the first layout or look for standard one
        target_layout = layouts[0]['Name']
        for layout in layouts:
            if 'Contact Layout' == layout['Name']:
                target_layout = layout['Name']
                break
        
        # Step 4: Retrieve layout
        if not self.retrieve_layout(target_layout):
            return False
        
        # Step 5: Modify layout
        if not self.modify_layout():
            return False
        
        # Step 6: Deploy layout
        if not self.deploy_layout():
            return False
        
        print("\n🎉 SUCCESS: Is_DVM__c field has been added to the Contact page layout!")
        return True

def main():
    modifier = ContactLayoutModifier()
    success = modifier.run()
    
    if not success:
        print("\n❌ FAILED: Could not complete the layout modification")
        sys.exit(1)

if __name__ == "__main__":
    main()
