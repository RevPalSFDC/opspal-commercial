#!/bin/bash

# Script to create Contract records for renewal opportunities without Parent_Contract__c
# Author: Claude Code
# Date: 2025-08-30

set -e

TARGET_ORG="example-company-sandbox"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${SCRIPT_DIR}/../data/renewal-contracts"

# Create data directory if it doesn't exist
mkdir -p "${DATA_DIR}"

echo "=== Creating Contract Records for Renewal Opportunities ==="
echo "Target Org: ${TARGET_ORG}"
echo "Data Directory: ${DATA_DIR}"
echo ""

# Step 1: Export renewal opportunities without contracts
echo "Step 1: Exporting renewal opportunities without Parent_Contract__c..."
sf data query \
    --query "SELECT Id, Name, AccountId, Type, Type_Contract__c, CloseDate, Contract_Start_Date__c, Contract_End_Date__c, Amount FROM Opportunity WHERE Type = 'Renewal' AND Parent_Contract__c = null ORDER BY AccountId, Name" \
    --result-format csv \
    --target-org "${TARGET_ORG}" > "${DATA_DIR}/renewal_opportunities.csv"

# Count the records
RECORD_COUNT=$(tail -n +2 "${DATA_DIR}/renewal_opportunities.csv" | wc -l)
echo "Found ${RECORD_COUNT} renewal opportunities without contracts"
echo ""

# Step 2: Create Contract CSV for bulk insert with unique naming
echo "Step 2: Creating Contract records CSV..."
cat > "${DATA_DIR}/process_contracts.py" << 'EOF'
import csv
import sys
from datetime import datetime, timedelta

def process_contracts(input_file, output_file):
    contracts = []
    
    with open(input_file, 'r') as infile:
        reader = csv.DictReader(infile)
        
        for i, row in enumerate(reader, 1):
            # Determine contract dates
            start_date = row['Contract_Start_Date__c'] or row['CloseDate']
            
            # If we have a start date, calculate end date as 1 year later
            if start_date:
                try:
                    start_dt = datetime.strptime(start_date, '%Y-%m-%d')
                    end_dt = start_dt.replace(year=start_dt.year + 1)
                    end_date = end_dt.strftime('%Y-%m-%d')
                except:
                    # Fallback if date parsing fails
                    end_date = row['Contract_End_Date__c'] or ''
            else:
                start_date = row['CloseDate']
                end_date = row['Contract_End_Date__c'] or ''
            
            # Create contract record with unique name for matching
            contract_name = f"Renewal Contract - {row['Name'][:50]} - {row['Id'][:8]}"
            
            contract = {
                'AccountId': row['AccountId'],
                'Status': 'Activated',  # Set as Activated since these are renewals
                'StartDate': start_date,
                'EndDate': end_date,
                'Contracting_Entity__c': row['Type_Contract__c'],
                'ContractNumber': contract_name[:80]  # Use ContractNumber for matching (usually auto-generated but we can override)
            }
            
            contracts.append(contract)
    
    # Write contracts CSV
    with open(output_file, 'w', newline='') as outfile:
        if contracts:
            fieldnames = contracts[0].keys()
            writer = csv.DictWriter(outfile, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(contracts)
    
    print(f"Created {len(contracts)} contract records")
    
    # Also create a mapping file
    mapping_file = output_file.replace('.csv', '_mapping.csv')
    with open(input_file, 'r') as infile:
        reader = csv.DictReader(infile)
        with open(mapping_file, 'w', newline='') as mapfile:
            writer = csv.writer(mapfile)
            writer.writerow(['OpportunityId', 'ContractNumber', 'AccountId'])
            for row in reader:
                contract_name = f"Renewal Contract - {row['Name'][:50]} - {row['Id'][:8]}"
                writer.writerow([row['Id'], contract_name[:80], row['AccountId']])
    
    return len(contracts)

if __name__ == "__main__":
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    count = process_contracts(input_file, output_file)
    print(f"Contract CSV created with {count} records")
EOF

# Run the Python script to create contracts CSV
python3 "${DATA_DIR}/process_contracts.py" "${DATA_DIR}/renewal_opportunities.csv" "${DATA_DIR}/contracts_to_create.csv"
echo ""

# Step 3: Bulk insert Contract records
echo "Step 3: Bulk inserting Contract records..."
sf data import bulk \
    --sobject Contract \
    --file "${DATA_DIR}/contracts_to_create.csv" \
    --target-org "${TARGET_ORG}" \
    --wait 10

echo ""

# Step 4: Query created contracts to get their IDs using our naming pattern
echo "Step 4: Retrieving created Contract IDs..."
sf data query \
    --query "SELECT Id, ContractNumber, AccountId FROM Contract WHERE ContractNumber LIKE 'Renewal Contract -%' ORDER BY CreatedDate DESC" \
    --result-format csv \
    --target-org "${TARGET_ORG}" > "${DATA_DIR}/created_contracts.csv"

# Step 5: Create update CSV for opportunities using the mapping
echo "Step 5: Creating opportunity update CSV..."
cat > "${DATA_DIR}/create_opportunity_updates.py" << 'EOF'
import csv
import sys

def create_opportunity_updates(mapping_file, contracts_file, output_file):
    # Read created contracts
    contract_map = {}
    with open(contracts_file, 'r') as cfile:
        reader = csv.DictReader(cfile)
        for row in reader:
            # Use ContractNumber and AccountId as key for matching
            key = (row['ContractNumber'], row['AccountId'])
            contract_map[key] = row['Id']
    
    # Create opportunity updates using mapping
    updates = []
    with open(mapping_file, 'r') as mfile:
        reader = csv.DictReader(mfile)
        for row in reader:
            key = (row['ContractNumber'], row['AccountId'])
            if key in contract_map:
                updates.append({
                    'Id': row['OpportunityId'],
                    'Parent_Contract__c': contract_map[key]
                })
            else:
                print(f"Warning: No contract found for opportunity {row['OpportunityId']}")
    
    # Write updates CSV
    with open(output_file, 'w', newline='') as outfile:
        if updates:
            fieldnames = updates[0].keys()
            writer = csv.DictWriter(outfile, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(updates)
    
    print(f"Created {len(updates)} opportunity updates")
    return len(updates)

if __name__ == "__main__":
    mapping_file = sys.argv[1]
    contracts_file = sys.argv[2]
    output_file = sys.argv[3]
    count = create_opportunity_updates(mapping_file, contracts_file, output_file)
    print(f"Opportunity updates CSV created with {count} records")
EOF

# Run the script to create opportunity updates
python3 "${DATA_DIR}/create_opportunity_updates.py" \
    "${DATA_DIR}/contracts_to_create_mapping.csv" \
    "${DATA_DIR}/created_contracts.csv" \
    "${DATA_DIR}/opportunity_updates.csv"

echo ""

# Step 6: Bulk update opportunities with Parent_Contract__c
echo "Step 6: Bulk updating opportunities with Parent_Contract__c..."
sf data import bulk \
    --sobject Opportunity \
    --file "${DATA_DIR}/opportunity_updates.csv" \
    --target-org "${TARGET_ORG}" \
    --wait 10

echo ""

# Step 7: Verification
echo "Step 7: Verifying results..."
echo "Checking renewal opportunities that still don't have Parent_Contract__c..."
REMAINING_COUNT=$(sf data query \
    --query "SELECT COUNT(Id) FROM Opportunity WHERE Type = 'Renewal' AND Parent_Contract__c = null" \
    --target-org "${TARGET_ORG}" --result-format csv | tail -1)

echo "Remaining opportunities without contracts: ${REMAINING_COUNT}"

echo "Checking recently created contracts..."
CREATED_CONTRACTS=$(sf data query \
    --query "SELECT COUNT(Id) FROM Contract WHERE ContractNumber LIKE 'Renewal Contract -%'" \
    --target-org "${TARGET_ORG}" --result-format csv | tail -1)

echo "Total contracts created: ${CREATED_CONTRACTS}"

echo "Sample of created contract-opportunity relationships:"
sf data query \
    --query "SELECT Id, Name, Parent_Contract__c, Parent_Contract__r.ContractNumber FROM Opportunity WHERE Type = 'Renewal' AND Parent_Contract__c != null ORDER BY CreatedDate DESC LIMIT 5" \
    --target-org "${TARGET_ORG}"

echo ""
echo "=== Script completed successfully ==="
echo "Data files saved in: ${DATA_DIR}"
echo ""
