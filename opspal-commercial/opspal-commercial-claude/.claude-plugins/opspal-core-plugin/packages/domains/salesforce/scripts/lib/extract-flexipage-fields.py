#!/usr/bin/env python3
"""
Extract Field References from Salesforce FlexiPage (Lightning Page) XML

Purpose: Parse FlexiPage metadata to identify all fields included on Lightning Record Pages

Usage:
    python3 extract-flexipage-fields.py <xml_path> <output_csv>

Example:
    python3 extract-flexipage-fields.py \
        /tmp/flexipages/Opportunity_Record_Page.flexipage-meta.xml \
        /tmp/opportunity_page_fields.csv

Output CSV Columns:
    - Field_API_Name: Salesforce API name (e.g., "AccountId", "Custom_Field__c")
    - Section: Section label from page (or Facet ID if label not mapped)
    - UI_Behavior: required, readonly, or none

Author: RevPal Operations Team
Version: 1.0
Created: 2025-10-17
"""

import xml.etree.ElementTree as ET
import csv
import os
import sys


def extract_fields_from_flexipage(xml_path, page_name):
    """
    Extract field references from FlexiPage XML

    Args:
        xml_path (str): Path to FlexiPage XML file
        page_name (str): Page name for logging

    Returns:
        list: List of dicts containing field information
              [{'Field_API_Name': 'AccountId', 'Section': 'Account Info', 'UI_Behavior': 'required'}, ...]
    """

    # Salesforce metadata namespace
    ns = {'sf': 'http://soap.sforce.com/2006/04/metadata'}

    # Parse XML
    tree = ET.parse(xml_path)
    root = tree.getroot()

    fields = []

    # Build section mapping (Facet IDs -> human-readable labels)
    section_map = {}
    for region in root.findall('.//sf:flexiPageRegions', ns):
        region_name = region.find('sf:name', ns)
        if region_name is not None:
            section_id = region_name.text

            # Find section label if available
            for item_instance in region.findall('.//sf:itemInstance', ns):
                component = item_instance.find('sf:componentName', ns)
                if component is not None and 'fieldSection' in component.text.lower():
                    for prop in item_instance.findall('sf:componentInstanceProperties', ns):
                        name = prop.find('sf:name', ns)
                        if name is not None and name.text == 'label':
                            value = prop.find('sf:value', ns)
                            if value is not None:
                                section_map[section_id] = value.text

    # Extract fields
    for region in root.findall('.//sf:flexiPageRegions', ns):
        region_name_elem = region.find('sf:name', ns)
        section_name = section_map.get(region_name_elem.text, region_name_elem.text) if region_name_elem is not None else 'Unknown'

        for field_instance in region.findall('.//sf:fieldInstance', ns):
            field_item = field_instance.find('sf:fieldItem', ns)

            if field_item is not None and field_item.text and field_item.text.startswith('Record.'):
                field_api_name = field_item.text.replace('Record.', '')

                # Get UI behavior
                ui_behavior = "none"
                for prop in field_instance.findall('sf:fieldInstanceProperties', ns):
                    name_elem = prop.find('sf:name', ns)
                    if name_elem is not None and name_elem.text == 'uiBehavior':
                        value_elem = prop.find('sf:value', ns)
                        if value_elem is not None:
                            ui_behavior = value_elem.text

                fields.append({
                    'Field_API_Name': field_api_name,
                    'Section': section_name,
                    'UI_Behavior': ui_behavior
                })

    # Remove duplicates (keep first occurrence) and sort
    unique_fields = {f['Field_API_Name']: f for f in fields}
    return sorted(unique_fields.values(), key=lambda x: x['Field_API_Name'])


def main():
    """Main execution function"""

    if len(sys.argv) < 3:
        print("Usage: python3 extract-flexipage-fields.py <xml_path> <output_csv>")
        print("")
        print("Example:")
        print("  python3 extract-flexipage-fields.py \\")
        print("    /tmp/Opportunity_Record_Page.flexipage-meta.xml \\")
        print("    /tmp/opportunity_page_fields.csv")
        sys.exit(1)

    xml_path = sys.argv[1]
    output_csv = sys.argv[2]

    # Validate input file
    if not os.path.exists(xml_path):
        print(f"❌ Error: Input file not found: {xml_path}")
        sys.exit(1)

    # Derive page name from filename
    page_name = os.path.basename(xml_path).replace('.flexipage-meta.xml', '')

    try:
        # Extract fields
        fields = extract_fields_from_flexipage(xml_path, page_name)

        # Write CSV
        with open(output_csv, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=['Field_API_Name', 'Section', 'UI_Behavior'])
            writer.writeheader()
            writer.writerows(fields)

        print(f"✓ Extracted {len(fields)} fields from {page_name}")
        print(f"✓ Saved to: {output_csv}")

    except ET.ParseError as e:
        print(f"❌ Error parsing XML: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
