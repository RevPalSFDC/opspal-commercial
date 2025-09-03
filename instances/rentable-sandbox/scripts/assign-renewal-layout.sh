#!/bin/bash

# Assign Renewal Layout to all profiles with Opportunity access
profiles=(
    "00e2A000001CCCHQA4"    # Standard Platform User
    "00e2A000000fW2aQAE"    # Account Executive
    "00e2A000000fWEbQAM"    # Ops User
    "00e2A000000fWdCQAU"    # Executive
    "00e2A000001CDRPQA4"    # SDR
    "00e3j000000c3MAAAY"    # Sales Enablement
    "00e3j000000c3MFAAY"    # Regional Director
    "00e3j000000fjbrAAA"    # ALN
    "00e3j000000fjfAAAQ"    # Support Engineer
    "00e3j000000ztHGAAY"    # Support Manager
    "00e3j000001MwVCAA0"    # Sales Director
    "00e3j000001R3sOAAS"    # Support
    "00e3j000001R4TdAAK"    # Minimum Access - Salesforce
    "00e3j000001VHvLAAW"    # Account Manager
    "00eF00000015uyYIAQ"    # System Administrator
    "00eF00000015uyeIAA"    # Standard User
    "00eF00000015uygIAA"    # Solution Manager
    "00eF00000015uyfIAA"    # Read Only
    "00eRh000001REhRIAW"    # Head of Customer Experience
    "00e3j000000c3MFAAY"    # Regional Director
    "00e3j000000fjjHAAQ"    # Salesforce API Only System Integrations
)

# Temporary file for deployment
mkdir -p force-app/main/default/profileLayoutAssignments

# Generate layout assignments for each profile
for profile in "${profiles[@]}"; do
    cat > "force-app/main/default/profileLayoutAssignments/ProfileLayoutAssignment_${profile}.profileLayoutAssignment-meta.xml" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<ProfileLayoutAssignment xmlns="http://soap.sforce.com/2006/04/metadata">
    <layout>Opportunity_Renewal_Layout</layout>
    <recordType>Opportunity.Renewal</recordType>
    <profile>$profile</profile>
</ProfileLayoutAssignment>
EOF
done

# Deploy layout assignments
sf project deploy start -o rentable-sandbox -w 10 --verbose