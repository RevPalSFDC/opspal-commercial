#!/bin/bash

# Einstein Activity Capture Task Creation Investigation
# This script investigates why emails appear in timeline but don't create Task records
# Specifically for Contact 003Pg000018KFwYIAW

echo "=== EINSTEIN ACTIVITY CAPTURE TASK CREATION INVESTIGATION ==="
echo "Contact ID: 003Pg000018KFwYIAW"
echo "ThreadIdentifier: BY5PR09MB597251B0CD116FDB475A7A3BE83AA@BY5PR09MB5972.namprd09.prod.outlook.com"
echo "Issue: Email visible in timeline but no Task record created"
echo "Org: acme-corp-main"
echo

ORG_ALIAS="acme-corp-main"
CONTACT_ID="003Pg000018KFwYIAW"

echo "1. CHECKING EINSTEIN ACTIVITY CAPTURE SETTINGS..."
echo "================================================="

# Query the main EAC settings for Task creation behavior
sf data query --query "SELECT Id, Name, MasterLabel, DeveloperName, IsEnabled__c, EmailIntegrationEnabled__c, CalendarIntegrationEnabled__c, CreateTasksForEmails__c, TimelineDisplayOnly__c, EmailInsightsMode__c FROM EinsteinActivityCapture__mdt" --target-org $ORG_ALIAS --use-tooling-api

echo
echo "2. CHECKING ACTIVITY CAPTURE CONFIGURATION..."
echo "============================================="

# Check for Activity Capture configuration that might control Task creation
sf data query --query "SELECT Id, DeveloperName, MasterLabel, ActivityCaptureSettings__c, EmailTaskCreation__c, TimelineOnlyMode__c FROM ActivityCaptureConfiguration__mdt" --target-org $ORG_ALIAS --use-tooling-api

echo
echo "3. CHECKING EMAIL INTEGRATION SETTINGS..."
echo "========================================"

# Check Email Integration settings that might control Task vs Timeline display
sf data query --query "SELECT Id, Name, EmailToTaskEnabled__c, DisplayEmailsInTimeline__c, CreateTaskRecords__c FROM EmailIntegrationSettings__c" --target-org $ORG_ALIAS

echo
echo "4. CHECKING USER ACTIVITY CAPTURE PREFERENCES..."
echo "==============================================="

# Check if the user has specific preferences for Task creation
sf data query --query "SELECT Id, UserId, EmailTaskCreationEnabled__c, TimelineDisplayPreference__c, ActivityCaptureMode__c FROM UserActivityCapturePreference__c WHERE UserId IN (SELECT Id FROM User WHERE IsActive = true)" --target-org $ORG_ALIAS

echo
echo "5. CHECKING ORGANIZATION ACTIVITY SETTINGS..."
echo "============================================="

# Check organization-level settings for Activity Capture behavior
sf data query --query "SELECT Id, SettingName, SettingValue FROM OrganizationPreference WHERE SettingName LIKE '%EinsteinActivity%' OR SettingName LIKE '%EmailTask%' OR SettingName LIKE '%Timeline%'" --target-org $ORG_ALIAS

echo
echo "6. CHECKING ACTIVITY CAPTURE FEATURE FLAGS..."
echo "============================================="

# Check for feature flags that might control Task creation vs Timeline display
sf data query --query "SELECT Id, FeatureName, IsEnabled FROM FeatureLicense WHERE FeatureName LIKE '%Activity%' OR FeatureName LIKE '%EmailInsights%' OR FeatureName LIKE '%Timeline%'" --target-org $ORG_ALIAS

echo
echo "7. CHECKING EMAIL MESSAGE PROCESSING STATUS..."
echo "=============================================="

# Check if EmailMessage records exist with processing status
sf data query --query "SELECT Id, MessageIdentifier, ThreadIdentifier, Status, ProcessingStatus__c, ActivityCaptureStatus__c FROM EmailMessage WHERE ThreadIdentifier = 'BY5PR09MB597251B0CD116FDB475A7A3BE83AA@BY5PR09MB5972.namprd09.prod.outlook.com'" --target-org $ORG_ALIAS

echo
echo "8. CHECKING ACTIVITY CAPTURE PROCESSING LOGS..."
echo "==============================================="

# Check for Activity Capture processing logs or status records
sf data query --query "SELECT Id, EmailIdentifier__c, ProcessingStatus__c, TaskCreated__c, ErrorMessage__c, ProcessedDate__c FROM ActivityCaptureProcessingLog__c WHERE EmailIdentifier__c LIKE '%BY5PR09MB597251B0CD116FDB475A7A3BE83AA%'" --target-org $ORG_ALIAS

echo
echo "9. CHECKING CONTACT'S ACTIVITY CAPTURE STATUS..."
echo "==============================================="

# Check if the specific contact has any Activity Capture exclusions
sf data query --query "SELECT Id, Name, Email, ActivityCaptureEnabled__c, EmailActivityCaptureExcluded__c FROM Contact WHERE Id = '$CONTACT_ID'" --target-org $ORG_ALIAS

echo
echo "10. CHECKING RECENT ACTIVITY CAPTURE TASKS..."
echo "============================================="

# Check for any recent Activity Capture tasks for this contact
sf data query --query "SELECT Id, Subject, WhoId, ActivityDate, Description, Type, ActivitySubtype, IsCreatedByEinsteinActivityCapture__c FROM Task WHERE WhoId = '$CONTACT_ID' AND CreatedDate = LAST_N_DAYS:30 ORDER BY CreatedDate DESC LIMIT 10" --target-org $ORG_ALIAS

echo
echo "11. CHECKING EINSTEIN ACTIVITY INSIGHTS..."
echo "=========================================="

# Check Einstein Activity Insights configuration
sf data query --query "SELECT Id, Name, DeveloperName, InsightsOnly__c, CreateActivities__c, DisplayInTimeline__c FROM EinsteinActivityInsightsSettings__mdt" --target-org $ORG_ALIAS --use-tooling-api

echo
echo "12. CHECKING PERMISSION SETS FOR ACTIVITY CAPTURE..."
echo "===================================================="

# Check permission sets that might control Task creation
sf data query --query "SELECT Id, Name, Label, HasEinsteinActivityCaptureAccess__c, HasEmailTaskCreationAccess__c FROM PermissionSet WHERE (Name LIKE '%Einstein%' OR Name LIKE '%Activity%') AND IsOwnedByProfile = false" --target-org $ORG_ALIAS

echo
echo "13. CHECKING CUSTOM SETTINGS FOR TASK CREATION..."
echo "================================================"

# Check custom settings that might control Task creation behavior
sf data query --query "SELECT Id, Name, EmailsCreateTasks__c, TimelineOnlyMode__c, InsightsMode__c FROM EinsteinActivityCaptureSettings__c" --target-org $ORG_ALIAS

echo
echo "14. CHECKING ACTIVITY TIMELINE CONFIGURATION..."
echo "==============================================="

# Check Activity Timeline configuration
sf data query --query "SELECT Id, Name, DeveloperName, ShowEmailsInTimeline__c, CreateTasksFromEmails__c, EmailDisplayMode__c FROM ActivityTimelineSettings__mdt" --target-org $ORG_ALIAS --use-tooling-api

echo
echo "15. CHECKING FOR ASYNC PROCESSING JOBS..."
echo "========================================"

# Check for async jobs that might be processing Activity Capture
sf data query --query "SELECT Id, JobType, Status, CompletedDate, JobItemsProcessed, TotalJobItems FROM AsyncApexJob WHERE JobType LIKE '%Activity%' OR JobType LIKE '%Einstein%' OR JobType LIKE '%Email%' ORDER BY CreatedDate DESC LIMIT 5" --target-org $ORG_ALIAS

echo
echo "=== INVESTIGATION COMPLETE ==="
echo
echo "KEY FINDINGS TO REVIEW:"
echo "- Look for Task creation flags set to FALSE"
echo "- Check for 'Timeline Only' or 'Insights Only' modes"
echo "- Verify EmailTaskCreation settings"
echo "- Check processing status of email with ThreadIdentifier"
echo "- Look for user or contact-specific exclusions"
echo "- Review permission set assignments"
echo "- Check for async processing delays"