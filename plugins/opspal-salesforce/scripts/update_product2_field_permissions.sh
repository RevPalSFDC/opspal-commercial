#!/bin/bash

# Field Permission Update Script for Product2.IsSubscription__c
# Version: 1.3
# Date: 2025-09-08

set -e

# Profiles to explicitly update (core list)
CORE_PROFILES=(
    "System Administrator"
    "Standard User"
    "Sales Insights Integration User"
    "Sales Leader"
    "Account Executive"
    "Executive"
    "Business Development"
    "Procurement"
)

# Temporary working directory
WORK_DIR=$(mktemp -d)
cd "$WORK_DIR"

# Generate package.xml for deployment
generate_package_xml() {
    cat > package.xml <<'EOL'
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>Product2.IsSubscription__c</members>
        <name>CustomField</name>
    </types>
    <types>
        <members>System Administrator</members>
        <members>Standard User</members>
        <members>Sales Insights Integration User</members>
        <members>Sales Leader</members>
        <members>Account Executive</members>
        <members>Executive</members>
        <members>Business Development</members>
        <members>Procurement</members>
        <name>Profile</name>
    </types>
    <version>64.0</version>
</Package>
EOL
}

# Generate Profile metadata
generate_profile_metadata() {
    local profile_name="$1"
    local profile_file_name=$(echo "$profile_name" | sed 's/ /_/g')
    
    # Ensure profiles directory exists
    mkdir -p "profiles"
    
    cat > "profiles/${profile_file_name}.profile-meta.xml" <<'EOL'
<?xml version="1.0" encoding="UTF-8"?>
<Profile xmlns="http://soap.sforce.com/2006/04/metadata">
    <fieldPermissions>
        <editable>true</editable>
        <field>Product2.IsSubscription__c</field>
        <readable>true</readable>
    </fieldPermissions>
</Profile>
EOL
}

# Generate CustomField metadata
generate_custom_field_metadata() {
    # Ensure fields directory exists
    mkdir -p "objects"
    
    cat > "objects/Product2.object-meta.xml" <<'EOL'
<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">
    <fields>
        <fullName>IsSubscription__c</fullName>
        <defaultValue>false</defaultValue>
        <description>Indicates whether this product is a subscription-based product</description>
        <externalId>false</externalId>
        <label>Is Subscription</label>
        <type>Checkbox</type>
    </fields>
</CustomObject>
EOL
}

# Main execution
main() {
    # Clean up any previous artifacts
    rm -rf "$WORK_DIR"
    mkdir -p "$WORK_DIR"
    cd "$WORK_DIR"

    generate_package_xml
    generate_custom_field_metadata

    for profile in "${CORE_PROFILES[@]}"; do
        echo "Processing profile: $profile"
        generate_profile_metadata "$profile"
    done

    # Deploy all generated metadata
    sf project deploy start \
        --metadata-dir "$WORK_DIR" \
        --target-org acme-corp-staging \
        --ignore-warnings \
        --wait 15

    # Optional: Clean up artifacts
    rm -rf "$WORK_DIR"
}

# Run main function
main