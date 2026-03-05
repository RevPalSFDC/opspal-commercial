#!/bin/bash

###############################################################################
# Permission Set Field Validator
#
# Purpose: Validate field visibility and permission set configurations
# Created: 2025-09-19
#
# This script helps troubleshoot field access issues related to permission sets
# which is critical for orgs that rely heavily on permission sets for access control
###############################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Default values
ORG_ALIAS=""
FIELD_NAME=""
OBJECT_NAME=""
PERMISSION_SET=""
USER_NAME=""
VERBOSE=false
CHECK_ALL_PERMS=false

# Function to display usage
usage() {
    cat << EOF
${BOLD}Permission Set Field Validator${NC}

Validates field accessibility issues related to permission sets in Salesforce.

${BOLD}Usage:${NC}
    $0 --field <field> --object <object> [options]

${BOLD}Options:${NC}
    -f, --field <name>         Field API name (e.g., Last_Touch_Campaign__c)
    -o, --object <name>        Object API name (e.g., Contact)
    -p, --perm-set <name>      Permission set name to check
    -u, --user <username>      Username to check permissions for
    -a, --org <alias>          Org alias (default: current org)
    --check-all                Check all permission sets
    -v, --verbose              Show detailed output
    -h, --help                 Show this help message

${BOLD}Examples:${NC}
    # Check why a field isn't accessible
    $0 -f Last_Touch_Campaign__c -o Contact -a myorg

    # Check field in specific permission set
    $0 -f Last_Touch_Campaign__c -o Contact -p GTM_Internal -a myorg

    # Check all permission sets for a field
    $0 -f Attribution_Contact__c -o Opportunity --check-all -a myorg

    # Check field access for specific user
    $0 -f Custom_Field__c -o Account -u user@example.com -a myorg

${BOLD}Output:${NC}
    - Field existence in org metadata
    - Field visibility in API
    - Permission set configurations
    - Profile permissions
    - User access summary

EOF
    exit 1
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--field)
            FIELD_NAME="$2"
            shift 2
            ;;
        -o|--object)
            OBJECT_NAME="$2"
            shift 2
            ;;
        -p|--perm-set)
            PERMISSION_SET="$2"
            shift 2
            ;;
        -u|--user)
            USER_NAME="$2"
            shift 2
            ;;
        -a|--org)
            ORG_ALIAS="$2"
            shift 2
            ;;
        --check-all)
            CHECK_ALL_PERMS=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            ;;
    esac
done

# Validate required parameters
if [[ -z "$FIELD_NAME" || -z "$OBJECT_NAME" ]]; then
    echo -e "${RED}Error: Field name and object name are required${NC}"
    usage
fi

# Set org parameter
ORG_PARAM=""
if [[ -n "$ORG_ALIAS" ]]; then
    ORG_PARAM="--target-org $ORG_ALIAS"
fi

echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}Permission Set Field Validation Report${NC}"
echo -e "${BOLD}========================================${NC}"
echo -e "${BLUE}Object:${NC} $OBJECT_NAME"
echo -e "${BLUE}Field:${NC} $FIELD_NAME"
[[ -n "$ORG_ALIAS" ]] && echo -e "${BLUE}Org:${NC} $ORG_ALIAS"
echo ""

# Step 1: Check if field exists in metadata (Tooling API)
echo -e "${BOLD}1. Checking Field Existence in Metadata...${NC}"
# Fixed: Use FieldDefinition instead of CustomField for Tooling API
FIELD_IN_TOOLING=$(sf data query --query "SELECT Id, DeveloperName, ManageableState FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '$OBJECT_NAME' AND QualifiedApiName = '$OBJECT_NAME.$FIELD_NAME'" --use-tooling-api $ORG_PARAM --json 2>/dev/null | jq -r '.result.totalSize // 0')

if [[ "$FIELD_IN_TOOLING" -gt 0 ]]; then
    echo -e "${GREEN}✓ Field exists in Tooling API metadata${NC}"
    if [[ "$VERBOSE" == "true" ]]; then
        sf data query --query "SELECT Id, DeveloperName, ManageableState, CreatedBy.Name, CreatedDate FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '$OBJECT_NAME' AND QualifiedApiName = '$OBJECT_NAME.$FIELD_NAME'" --use-tooling-api $ORG_PARAM --json | jq -r '.result.records[0]'
    fi
else
    echo -e "${RED}✗ Field NOT found in Tooling API metadata${NC}"
fi

# Step 2: Check if field is queryable via SOQL
echo -e "\n${BOLD}2. Checking Field Accessibility via SOQL...${NC}"

# First check if field exists using safe wrapper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/safe-soql-wrapper.sh" ]]; then
    FIELD_EXISTS=$("$SCRIPT_DIR/safe-soql-wrapper.sh" check-field "$OBJECT_NAME" "$FIELD_NAME" $ORG_PARAM 2>/dev/null && echo "true" || echo "false")
    if [[ "$FIELD_EXISTS" == "false" ]]; then
        echo -e "${RED}✗ Field does not exist on object (pre-check)${NC}"
        SOQL_TEST="Field does not exist"
    else
        SOQL_TEST=$(sf data query --query "SELECT Id, $FIELD_NAME FROM $OBJECT_NAME LIMIT 1" $ORG_PARAM 2>&1 || true)
    fi
else
    # Fallback to direct query if wrapper not available
    SOQL_TEST=$(sf data query --query "SELECT Id, $FIELD_NAME FROM $OBJECT_NAME LIMIT 1" $ORG_PARAM 2>&1 || true)
fi

if echo "$SOQL_TEST" | grep -q "ERROR at Row:1:Column"; then
    echo -e "${RED}✗ Field is NOT queryable via SOQL${NC}"
    echo -e "${YELLOW}  This usually means the field lacks permission set/profile visibility${NC}"
else
    echo -e "${GREEN}✓ Field is queryable via SOQL${NC}"
fi

# Step 3: Check field in describe API
echo -e "\n${BOLD}3. Checking Field in Describe API...${NC}"
FIELD_IN_DESCRIBE=$(sf sobject describe --sobject $OBJECT_NAME $ORG_PARAM --json 2>/dev/null | jq -r ".fields[] | select(.name == \"$FIELD_NAME\") | .name" || echo "")

if [[ -n "$FIELD_IN_DESCRIBE" ]]; then
    echo -e "${GREEN}✓ Field is visible in Describe API${NC}"
    if [[ "$VERBOSE" == "true" ]]; then
        sf sobject describe --sobject $OBJECT_NAME $ORG_PARAM --json | jq -r ".fields[] | select(.name == \"$FIELD_NAME\")"
    fi
else
    echo -e "${RED}✗ Field is NOT visible in Describe API${NC}"
fi

# Step 4: Check permission sets
echo -e "\n${BOLD}4. Checking Permission Set Configurations...${NC}"

if [[ -n "$PERMISSION_SET" ]]; then
    # Check specific permission set
    PERM_SET_ID=$(sf data query --query "SELECT Id FROM PermissionSet WHERE Name = '$PERMISSION_SET'" $ORG_PARAM --json 2>/dev/null | jq -r '.result.records[0].Id // ""')

    if [[ -n "$PERM_SET_ID" ]]; then
        echo -e "${BLUE}Permission Set: $PERMISSION_SET (ID: $PERM_SET_ID)${NC}"

        FIELD_PERM=$(sf data query --query "SELECT PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE ParentId = '$PERM_SET_ID' AND Field = '$OBJECT_NAME.$FIELD_NAME'" $ORG_PARAM --json 2>/dev/null | jq -r '.result.records[0] // {}')

        if [[ "$FIELD_PERM" != "{}" ]]; then
            READ_PERM=$(echo "$FIELD_PERM" | jq -r '.PermissionsRead')
            EDIT_PERM=$(echo "$FIELD_PERM" | jq -r '.PermissionsEdit')
            echo -e "  ${GREEN}✓ Field permissions found:${NC}"
            echo -e "    Read: $READ_PERM"
            echo -e "    Edit: $EDIT_PERM"
        else
            echo -e "  ${RED}✗ No field permissions found in this permission set${NC}"
            echo -e "  ${YELLOW}This is likely why the field isn't accessible!${NC}"
        fi
    else
        echo -e "${RED}Permission set '$PERMISSION_SET' not found${NC}"
    fi
elif [[ "$CHECK_ALL_PERMS" == "true" ]]; then
    # Check all permission sets
    echo -e "${BLUE}Checking all permission sets...${NC}"

    PERM_SETS_WITH_FIELD=$(sf data query --query "SELECT Parent.Name, Parent.Label, PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE Field = '$OBJECT_NAME.$FIELD_NAME' AND Parent.IsOwnedByProfile = false" $ORG_PARAM --json 2>/dev/null | jq -r '.result.records[]' || echo "")

    if [[ -n "$PERM_SETS_WITH_FIELD" ]]; then
        echo -e "${GREEN}Permission sets with this field:${NC}"
        echo "$PERM_SETS_WITH_FIELD" | jq -r '. | "  • \(.Parent.Name): Read=\(.PermissionsRead), Edit=\(.PermissionsEdit)"'
    else
        echo -e "${RED}No permission sets grant access to this field${NC}"
    fi
fi

# Step 5: Check profiles with field access
echo -e "\n${BOLD}5. Checking Profile Permissions...${NC}"
PROFILES_WITH_FIELD=$(sf data query --query "SELECT Parent.Name FROM FieldPermissions WHERE Field = '$OBJECT_NAME.$FIELD_NAME' AND Parent.IsOwnedByProfile = true AND PermissionsRead = true LIMIT 5" $ORG_PARAM --json 2>/dev/null | jq -r '.result.records[].Parent.Name' || echo "")

if [[ -n "$PROFILES_WITH_FIELD" ]]; then
    echo -e "${GREEN}Profiles with field access:${NC}"
    echo "$PROFILES_WITH_FIELD" | while read -r profile; do
        echo "  • $profile"
    done
else
    echo -e "${YELLOW}No profiles have explicit field access${NC}"
fi

# Step 6: Check user access (if username provided)
if [[ -n "$USER_NAME" ]]; then
    echo -e "\n${BOLD}6. Checking User Access for: $USER_NAME${NC}"

    USER_ID=$(sf data query --query "SELECT Id, ProfileId FROM User WHERE Username = '$USER_NAME'" $ORG_PARAM --json 2>/dev/null | jq -r '.result.records[0].Id // ""')

    if [[ -n "$USER_ID" ]]; then
        # Check user's permission sets
        USER_PERM_SETS=$(sf data query --query "SELECT PermissionSet.Name FROM PermissionSetAssignment WHERE AssigneeId = '$USER_ID'" $ORG_PARAM --json 2>/dev/null | jq -r '.result.records[].PermissionSet.Name' || echo "")

        echo -e "${BLUE}User's Permission Sets:${NC}"
        if [[ -n "$USER_PERM_SETS" ]]; then
            echo "$USER_PERM_SETS" | while read -r ps; do
                echo "  • $ps"
            done
        else
            echo "  None assigned"
        fi
    else
        echo -e "${RED}User '$USER_NAME' not found${NC}"
    fi
fi

# Summary and Recommendations
echo -e "\n${BOLD}========================================${NC}"
echo -e "${BOLD}Summary & Recommendations${NC}"
echo -e "${BOLD}========================================${NC}"

if [[ "$FIELD_IN_TOOLING" -gt 0 ]] && echo "$SOQL_TEST" | grep -q "ERROR at Row:1:Column"; then
    echo -e "${YELLOW}⚠ Field exists but isn't accessible via API${NC}"
    echo -e "\n${BOLD}Recommended Actions:${NC}"
    echo -e "1. Add field to required permission sets using:"
    echo -e "   ${BLUE}sf data create record --sobject FieldPermissions --values \"ParentId='<PermSetId>' SobjectType='$OBJECT_NAME' Field='$OBJECT_NAME.$FIELD_NAME' PermissionsRead=true PermissionsEdit=true\" $ORG_PARAM${NC}"
    echo -e "2. Or update profiles to include field access"
    echo -e "3. Check if field-level security is set to 'Visible' in Setup UI"
elif [[ "$FIELD_IN_TOOLING" -eq 0 ]]; then
    echo -e "${RED}⚠ Field doesn't exist in the org${NC}"
    echo -e "\n${BOLD}Recommended Actions:${NC}"
    echo -e "1. Deploy the field metadata to this org"
    echo -e "2. Check if field exists in another sandbox"
else
    echo -e "${GREEN}✓ Field is properly configured and accessible${NC}"
fi

echo ""
echo -e "${BOLD}Run with -v for verbose output or --check-all to see all permission sets${NC}"