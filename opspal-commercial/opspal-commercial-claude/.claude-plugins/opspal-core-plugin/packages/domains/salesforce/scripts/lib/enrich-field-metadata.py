#!/usr/bin/env python3
"""
Enrich Field Inventory CSV with Salesforce Metadata

Purpose: Combine field lists from Lightning Pages with comprehensive Salesforce metadata
         to create enriched CSVs with labels, types, classifications, and help text

Usage:
    python3 enrich-field-metadata.py <input_csv> <metadata_json> <output_csv>

Example:
    python3 enrich-field-metadata.py \
        /tmp/opportunity_page_fields.csv \
        /tmp/Opportunity_metadata.json \
        /workspace/instances/salesforce/my-org/Opportunity_Page_fields.csv

Input CSV Format:
    Field_API_Name,Section,UI_Behavior
    AccountId,Account Information,required
    Amount,Opportunity Details,required

Output CSV Format:
    Field_API_Name,Field_Label,Field_Type,Field_Classification,Help_Text,UI_Behavior
    AccountId,Account ID,reference,Standard,,required
    Amount,Amount,currency,Standard,,required

Author: RevPal Operations Team
Version: 1.0
Created: 2025-10-17
"""

import json
import csv
import sys
import os


def enrich_csv_with_metadata(csv_path, metadata_path, output_path):
    """
    Enrich field CSV with Salesforce metadata

    Args:
        csv_path (str): Path to input CSV (from extract-flexipage-fields.py)
        metadata_path (str): Path to Salesforce metadata JSON (from sf sobject describe)
        output_path (str): Path for enriched output CSV

    Returns:
        int: Number of fields enriched
    """

    # Load Salesforce metadata
    try:
        with open(metadata_path, 'r', encoding='utf-8') as f:
            metadata = json.load(f)
    except FileNotFoundError:
        print(f"❌ Error: Metadata file not found: {metadata_path}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ Error: Invalid JSON in metadata file: {e}")
        sys.exit(1)

    # Create field lookup dictionary
    field_lookup = {}
    for field in metadata['result']['fields']:
        field_lookup[field['name']] = {
            'label': field['label'],
            'type': field['type'],
            'custom': field['custom'],
            'inlineHelpText': field.get('inlineHelpText', '')
        }

    # Read existing CSV
    rows = []
    fields_not_found = []

    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                field_api_name = row['Field_API_Name']

                if field_api_name in field_lookup:
                    meta = field_lookup[field_api_name]
                    row['Field_Label'] = meta['label']
                    row['Field_Type'] = meta['type']
                    row['Field_Classification'] = 'Custom' if meta['custom'] else 'Standard'
                    row['Help_Text'] = meta['inlineHelpText'] if meta['inlineHelpText'] else ''
                else:
                    # Field not found in metadata (shouldn't happen often)
                    row['Field_Label'] = ''
                    row['Field_Type'] = ''
                    row['Field_Classification'] = ''
                    row['Help_Text'] = ''
                    fields_not_found.append(field_api_name)

                rows.append(row)

    except FileNotFoundError:
        print(f"❌ Error: Input CSV not found: {csv_path}")
        sys.exit(1)
    except KeyError as e:
        print(f"❌ Error: Invalid CSV format. Missing column: {e}")
        print(f"   Expected columns: Field_API_Name, Section, UI_Behavior")
        sys.exit(1)

    # Write enriched CSV
    fieldnames = [
        'Field_API_Name',
        'Field_Label',
        'Field_Type',
        'Field_Classification',
        'Help_Text',
        'UI_Behavior'
    ]

    try:
        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(rows)

        print(f"✓ Enriched {len(rows)} fields")
        print(f"✓ Saved to: {output_path}")

        # Report any fields not found in metadata
        if fields_not_found:
            print(f"⚠️  Warning: {len(fields_not_found)} field(s) not found in metadata:")
            for field in fields_not_found[:5]:  # Show first 5
                print(f"   - {field}")
            if len(fields_not_found) > 5:
                print(f"   ... and {len(fields_not_found) - 5} more")

    except IOError as e:
        print(f"❌ Error writing output CSV: {e}")
        sys.exit(1)

    return len(rows)


def main():
    """Main execution function"""

    if len(sys.argv) < 4:
        print("Usage: python3 enrich-field-metadata.py <input_csv> <metadata_json> <output_csv>")
        print("")
        print("Example:")
        print("  python3 enrich-field-metadata.py \\")
        print("    /tmp/opportunity_page_fields.csv \\")
        print("    /tmp/Opportunity_metadata.json \\")
        print("    /workspace/instances/salesforce/my-org/Opportunity_Page_fields.csv")
        print("")
        print("Input CSV should contain:")
        print("  - Field_API_Name")
        print("  - Section")
        print("  - UI_Behavior")
        print("")
        print("Metadata JSON should be output from:")
        print("  sf sobject describe --sobject {Object} --json")
        sys.exit(1)

    input_csv = sys.argv[1]
    metadata_json = sys.argv[2]
    output_csv = sys.argv[3]

    # Validate input files exist
    if not os.path.exists(input_csv):
        print(f"❌ Error: Input CSV not found: {input_csv}")
        sys.exit(1)

    if not os.path.exists(metadata_json):
        print(f"❌ Error: Metadata JSON not found: {metadata_json}")
        sys.exit(1)

    # Enrich CSV
    try:
        enrich_csv_with_metadata(input_csv, metadata_json, output_csv)
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
