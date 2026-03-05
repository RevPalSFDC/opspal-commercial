#!/bin/bash

# Einstein Activity Capture - Key Settings Check
# Focus on the exact settings that control Timeline vs Task creation

echo "=== EINSTEIN ACTIVITY CAPTURE KEY SETTINGS CHECK ==="
echo "Target: Identify why emails show in timeline but don't create Tasks"
echo "Contact: 003Pg000018KFwYIAW"
echo

ORG_ALIAS="acme-corp-main"

echo "1. CHECKING ORG PREFERENCES FOR EAC MODE..."
echo "=========================================="
# These are the most critical settings that control EAC behavior
sf data query --query "SELECT Id, SettingName, SettingValue FROM OrganizationPreference WHERE SettingName IN ('EinsteinActivityCaptureEnabled', 'EinsteinActivityCaptureInsightsOnly', 'EinsteinActivityCaptureTaskCreation', 'ActivityTimelineEnabled')" --target-org $ORG_ALIAS

echo
echo "2. CHECKING EINSTEIN ACTIVITY CAPTURE METADATA TYPES..."
echo "======================================================"
# Check if metadata type exists and its configuration
sf data query --query "SELECT Id, DeveloperName, MasterLabel, Language FROM CustomObjectDefinition WHERE DeveloperName LIKE '%EinsteinActivity%' OR DeveloperName LIKE '%ActivityCapture%'" --target-org $ORG_ALIAS --use-tooling-api

echo
echo "3. CHECKING CUSTOM SETTINGS DEFINITIONS..."
echo "========================================="
# Look for custom settings that might control EAC behavior
sf data query --query "SELECT Id, DeveloperName, MasterLabel, IsProtected FROM CustomSettingDefinition WHERE DeveloperName LIKE '%Einstein%' OR DeveloperName LIKE '%Activity%' OR DeveloperName LIKE '%Timeline%'" --target-org $ORG_ALIAS --use-tooling-api

echo
echo "4. CHECKING EMAIL RELAY SETTINGS..."
echo "=================================="
# Email relay can affect how emails are processed
sf data query --query "SELECT Id, Name, IsActive, RelayFrom__c, RelayTo__c FROM EmailRelay" --target-org $ORG_ALIAS

echo
echo "5. CHECKING CONNECTED APPLICATIONS FOR EINSTEIN..."
echo "================================================="
# Connected apps for Einstein services
sf data query --query "SELECT Id, Name, IsActive, Description FROM ConnectedApplication WHERE Name LIKE '%Einstein%' OR Description LIKE '%Activity%'" --target-org $ORG_ALIAS

echo
echo "6. CHECKING USER'S FEATURE LICENSES..."
echo "====================================="
# Feature licenses for Einstein Activity Capture
sf data query --query "SELECT Id, DefinitionId, IsEnabled, Name FROM UserFeatureLicense WHERE Name LIKE '%Einstein%' OR Name LIKE '%Activity%'" --target-org $ORG_ALIAS

echo
echo "7. CHECKING EMAIL MESSAGE FOR THE SPECIFIC THREAD..."
echo "===================================================="
# Check if EmailMessage exists for this thread
sf data query --query "SELECT Id, MessageIdentifier, ThreadIdentifier, FromAddress, ToAddress, Subject, TextBody, CreatedDate, RelatedToId, ParentId FROM EmailMessage WHERE ThreadIdentifier LIKE '%BY5PR09MB597251B0CD116FDB475A7A3BE83AA%' OR MessageIdentifier LIKE '%BY5PR09MB597251B0CD116FDB475A7A3BE83AA%'" --target-org $ORG_ALIAS

echo
echo "8. CHECKING EMAILMESSAGERELATION RECORDS..."
echo "==========================================="
# Check email relationships to contacts/leads
sf data query --query "SELECT Id, EmailMessageId, RelationId, RelationType, RelationAddress FROM EmailMessageRelation WHERE EmailMessageId IN (SELECT Id FROM EmailMessage WHERE ThreadIdentifier LIKE '%BY5PR09MB597251B0CD116FDB475A7A3BE83AA%')" --target-org $ORG_ALIAS

echo
echo "9. CHECKING ACTIVITY TIMELINE SETTINGS..."
echo "========================================"
# Check if Activity Timeline is configured differently
sf data query --query "SELECT Id, DefinitionId, IsEnabled, FeatureParameterValueId FROM OrganizationFeatureParameter WHERE FeatureParameterId IN (SELECT Id FROM FeatureParameter WHERE Name LIKE '%Timeline%' OR Name LIKE '%Activity%')" --target-org $ORG_ALIAS

echo
echo "10. CHECKING RECENT SETUP AUDIT TRAIL..."
echo "======================================="
# Look for recent changes to Einstein/Activity settings
sf data query --query "SELECT Id, Action, Display, CreatedBy.Name, CreatedDate, Section FROM SetupAuditTrail WHERE (Display LIKE '%Einstein%' OR Display LIKE '%Activity%' OR Display LIKE '%Email%' OR Display LIKE '%Timeline%') AND CreatedDate = LAST_N_DAYS:7 ORDER BY CreatedDate DESC LIMIT 10" --target-org $ORG_ALIAS

echo
echo "11. CHECKING FOR VALIDATION RULES ON TASK OBJECT..."
echo "=================================================="
# Check if validation rules might prevent Task creation
sf data query --query "SELECT Id, ValidationName, Active, ErrorDisplayField, ErrorMessage FROM ValidationRule WHERE EntityDefinitionId = 'Task'" --target-org $ORG_ALIAS --use-tooling-api

echo
echo "12. CHECKING PROCESS BUILDER/FLOW RULES ON TASKS..."
echo "=================================================="
# Check for active automations that might affect Task creation
sf data query --query "SELECT Id, MasterLabel, Status, TriggerType FROM Flow WHERE Status = 'Active' AND TriggerType IN ('RecordBeforeInsert', 'RecordAfterInsert') AND (MasterLabel LIKE '%Task%' OR MasterLabel LIKE '%Activity%' OR MasterLabel LIKE '%Einstein%')" --target-org $ORG_ALIAS --use-tooling-api

echo
echo "=== KEY SETTINGS CHECK COMPLETE ==="
echo
echo "CRITICAL ITEMS TO REVIEW:"
echo "1. EinsteinActivityCaptureInsightsOnly = true (Timeline only mode)"
echo "2. EmailMessage record exists but no related Task"  
echo "3. Validation rules blocking Task creation"
echo "4. User permissions vs feature licenses"
echo "5. Recent setup changes to Einstein/Activity settings"