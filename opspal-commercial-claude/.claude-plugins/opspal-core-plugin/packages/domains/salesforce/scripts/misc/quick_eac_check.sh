#!/bin/bash

# Quick Einstein Activity Capture Task Creation Check
# Focus on the most likely configuration issues

echo "=== QUICK EAC TASK CREATION DIAGNOSTIC ==="
echo "Contact: 003Pg000018KFwYIAW"
echo "Issue: Email in timeline but no Task record"
echo

ORG_ALIAS="acme-corp-main"

echo "1. Einstein Activity Capture Organization Settings:"
echo "=================================================="
sf data query --query "SELECT Id, SettingName, SettingValue FROM OrganizationPreference WHERE SettingName LIKE '%EinsteinActivity%' OR SettingName LIKE '%ActivityCapture%'" --target-org $ORG_ALIAS

echo
echo "2. Check if Custom Settings exist for EAC:"
echo "========================================="
# Try common custom setting names
sf data query --query "SELECT Id, Name FROM CustomSettingDefinition WHERE DeveloperName LIKE '%Activity%' OR DeveloperName LIKE '%Einstein%'" --target-org $ORG_ALIAS --use-tooling-api

echo
echo "3. Check Feature Licenses for Activity Capture:"
echo "=============================================="
sf data query --query "SELECT Id, FeatureName, IsEnabled FROM FeatureLicense WHERE FeatureName LIKE '%Einstein%' OR FeatureName LIKE '%Activity%'" --target-org $ORG_ALIAS

echo
echo "4. Check if EmailMessage records exist:"
echo "====================================="
sf data query --query "SELECT Id, MessageIdentifier, ThreadIdentifier, RelatedToId FROM EmailMessage WHERE ThreadIdentifier LIKE 'BY5PR09MB597251B0CD116FDB575A7A3BE83AA@BY5PR09MB5972.namprd09.prod.outlook.com' OR MessageIdentifier LIKE '%BY5PR09MB597251B0CD116FDB475A7A3BE83AA%'" --target-org $ORG_ALIAS

echo
echo "5. Check for any Tasks related to this contact:"
echo "=============================================="
sf data query --query "SELECT Id, Subject, WhoId, ActivityDate, Type, IsCreatedByEinsteinActivityCapture__c, CreatedDate FROM Task WHERE WhoId = '003Pg000018KFwYIAW' ORDER BY CreatedDate DESC LIMIT 5" --target-org $ORG_ALIAS

echo
echo "6. Check Permission Sets for EAC access:"
echo "======================================="
sf data query --query "SELECT Id, Name, Label FROM PermissionSet WHERE Name LIKE '%Einstein%' OR Name LIKE '%Activity%'" --target-org $ORG_ALIAS

echo
echo "7. Check User's Permission Set Assignments:"
echo "=========================================="
# Check Colleen's permissions (replace with actual user ID if needed)
sf data query --query "SELECT Id, AssigneeId, PermissionSetId, PermissionSet.Name FROM PermissionSetAssignment WHERE AssigneeId IN (SELECT Id FROM User WHERE Email LIKE '%colleen%' AND IsActive = true)" --target-org $ORG_ALIAS

echo
echo "8. Check Organization Feature Settings:"
echo "====================================="
sf data query --query "SELECT Id, OrganizationId, FeatureType FROM OrganizationFeature WHERE FeatureType LIKE '%Einstein%' OR FeatureType LIKE '%Activity%'" --target-org $ORG_ALIAS

echo "=== QUICK CHECK COMPLETE ==="