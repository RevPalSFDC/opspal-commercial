#!/bin/bash

# Check that example-company-production org is selected
sf org list --verbose | grep -q "example-company-production.*true" || {
    echo "Error: example-company-production must be your default org"
    exit 1
}

# Create Apex class
sf apex generate class ContactFieldCleaner

# Deploy Apex class
sf project deploy start --source-dir ./force-app/main/default/classes

# Execute batch job
sf apex run --file ./scripts/lib/clear_contact_fields.apex