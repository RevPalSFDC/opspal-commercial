#!/bin/bash

# Script to create revenue fields on Contract object in example-company sandbox
echo "=========================================="
echo "Creating Revenue Fields on Contract Object"
echo "Target: example-company Sandbox"
echo "=========================================="

# Set the target org
export SF_TARGET_ORG=example-company-sandbox

# Function to create a currency field
create_currency_field() {
    local api_name=$1
    local label=$2
    local description=$3
    local required=$4
    
    echo "Creating Currency field: $api_name"
    
    cat > ${TEMP_DIR:-/tmp}}.field-meta.xml << EOF
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Contract.${api_name}</fullName>
    <label>${label}</label>
    <type>Currency</type>
    <precision>18</precision>
    <scale>2</scale>
    <required>${required}</required>
    <description>${description}</description>
    <inlineHelpText>${description}</inlineHelpText>
</CustomField>
EOF
    
    sf metadata deploy --source-dir /tmp --target-org example-company-sandbox --wait 10
}

# Function to create a number field
create_number_field() {
    local api_name=$1
    local label=$2
    local description=$3
    local required=$4
    
    echo "Creating Number field: $api_name"
    
    cat > ${TEMP_DIR:-/tmp}}.field-meta.xml << EOF
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Contract.${api_name}</fullName>
    <label>${label}</label>
    <type>Number</type>
    <precision>18</precision>
    <scale>0</scale>
    <required>${required}</required>
    <description>${description}</description>
    <inlineHelpText>${description}</inlineHelpText>
</CustomField>
EOF
    
    sf metadata deploy --source-dir /tmp --target-org example-company-sandbox --wait 10
}

# Function to create a date field
create_date_field() {
    local api_name=$1
    local label=$2
    local description=$3
    
    echo "Creating Date field: $api_name"
    
    cat > ${TEMP_DIR:-/tmp}}.field-meta.xml << EOF
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Contract.${api_name}</fullName>
    <label>${label}</label>
    <type>Date</type>
    <required>false</required>
    <description>${description}</description>
    <inlineHelpText>${description}</inlineHelpText>
</CustomField>
EOF
    
    sf metadata deploy --source-dir /tmp --target-org example-company-sandbox --wait 10
}

# Function to create a picklist field
create_picklist_field() {
    local api_name=$1
    local label=$2
    local description=$3
    local values=$4
    
    echo "Creating Picklist field: $api_name"
    
    # Build picklist values XML
    local picklist_values=""
    IFS=',' read -ra VALUE_ARRAY <<< "$values"
    for value in "${VALUE_ARRAY[@]}"; do
        value=$(echo $value | xargs) # trim whitespace
        picklist_values="${picklist_values}
        <picklistValues>
            <fullName>${value}</fullName>
            <default>false</default>
        </picklistValues>"
    done
    
    cat > ${TEMP_DIR:-/tmp}}.field-meta.xml << EOF
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Contract.${api_name}</fullName>
    <label>${label}</label>
    <type>Picklist</type>
    <required>false</required>
    <description>${description}</description>
    <inlineHelpText>${description}</inlineHelpText>
    <valueSet>
        <restricted>true</restricted>
        <valueSetDefinition>
            <sorted>false</sorted>
            <value>
                ${picklist_values}
            </value>
        </valueSetDefinition>
    </valueSet>
</CustomField>
EOF
    
    sf metadata deploy --source-dir /tmp --target-org example-company-sandbox --wait 10
}

# Create Currency Fields
echo "Creating Currency fields..."
create_currency_field "Total_Contract_Value__c" "Total Contract Value" "Total value of the contract including all terms" "true"
create_currency_field "Annual_Contract_Value__c" "Annual Contract Value" "Annual value of the contract" "true"
create_currency_field "Monthly_Recurring_Revenue__c" "Monthly Recurring Revenue" "Monthly recurring revenue from this contract" "false"
create_currency_field "Renewal_Amount__c" "Renewal Amount" "Expected renewal amount" "false"
create_currency_field "Expansion_Revenue__c" "Expansion Revenue" "Additional revenue from contract expansion" "false"

# Create Number Field
echo "Creating Number field..."
create_number_field "Contract_Term_Months__c" "Contract Term (Months)" "Length of contract in months" "true"

# Create Date Fields
echo "Creating Date fields..."
create_date_field "Revenue_Recognition_Start_Date__c" "Revenue Recognition Start Date" "Date when revenue recognition begins"
create_date_field "Revenue_Recognition_End_Date__c" "Revenue Recognition End Date" "Date when revenue recognition ends"

# Create Picklist Fields
echo "Creating Picklist fields..."
create_picklist_field "Contract_Revenue_Type__c" "Contract Revenue Type" "Type of revenue for this contract" "New Business,Renewal,Expansion,Upsell,Downsell"
create_picklist_field "Payment_Terms__c" "Payment Terms" "Payment terms for the contract" "Net 30,Net 60,Net 90,Due on Receipt,Custom"

echo "=========================================="
echo "Field creation process completed!"
echo "Note: Fields may need to be manually added to page layouts"
echo "=========================================="