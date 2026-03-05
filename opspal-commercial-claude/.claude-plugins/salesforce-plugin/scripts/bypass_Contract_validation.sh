#!/bin/bash

# Auto-generated validation bypass script
# Object: Contract
# Generated: 2025-08-31T11:11:53-04:00

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEFAULTS_FILE="$PROJECT_ROOT/config/safe_defaults_Contract.json"

# Load defaults
if [ ! -f "$DEFAULTS_FILE" ]; then
    echo "Error: Defaults file not found"
    exit 1
fi

# Function to apply safe defaults to CSV
apply_defaults_to_csv() {
    local csv_file="$1"
    local output_file="${csv_file%.csv}_with_defaults.csv"
    
    echo "Applying safe defaults to $csv_file..."
    
    # Get field defaults
    local defaults=$(jq -r '.defaults | to_entries | .[] | .key + "=" + .value' "$DEFAULTS_FILE")
    
    # Create a temporary Python script to handle CSV manipulation
    cat > ${TEMP_DIR:-/tmp} << 'PYTHON'
import csv
import json
import sys

csv_file = sys.argv[1]
output_file = sys.argv[2]
defaults_file = sys.argv[3]

with open(defaults_file, 'r') as f:
    config = json.load(f)
    defaults = config['defaults']

with open(csv_file, 'r') as infile, open(output_file, 'w', newline='') as outfile:
    reader = csv.DictReader(infile)
    
    # Add missing columns if needed
    fieldnames = reader.fieldnames.copy()
    for field in defaults.keys():
        if field not in fieldnames:
            fieldnames.append(field)
    
    writer = csv.DictWriter(outfile, fieldnames=fieldnames)
    writer.writeheader()
    
    for row in reader:
        # Apply defaults for empty fields
        for field, default_value in defaults.items():
            if field not in row or not row[field]:
                if default_value == "TODAY()":
                    from datetime import date
                    row[field] = date.today().isoformat()
                elif default_value != "__CHECK_PICKLIST__":
                    row[field] = default_value
        
        writer.writerow(row)

print(f"Created {output_file} with safe defaults")
PYTHON
    
    python3 ${TEMP_DIR:-/tmp} "$csv_file" "$output_file" "$DEFAULTS_FILE"
    rm ${TEMP_DIR:-/tmp}
    
    echo "Output: $output_file"
}

# Main execution
if [ $# -eq 0 ]; then
    echo "Usage: $0 <csv_file>"
    echo ""
    echo "This script applies safe default values to bypass validation rules"
    echo "for Contract records during data import."
    exit 1
fi

apply_defaults_to_csv "$1"
