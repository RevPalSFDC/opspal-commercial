#!/bin/bash

# Critical Einstein Activity Capture Investigation Queries
# Run these queries first to identify .gov domain exclusions

echo "=== CRITICAL INVESTIGATION: Einstein Activity Capture .gov Domain Exclusions ==="
echo "Org: acme-corp-main"
echo "Issue: ALL .gov domains missing email activities"
echo

# Set the org alias
ORG_ALIAS="acme-corp-main"

echo "1. CHECKING ACTIVITY CAPTURE SETTINGS FOR DOMAIN EXCLUSIONS..."
echo "=============================================================="

# Check main Activity Capture settings
sf data query --query "SELECT Id, DeveloperName, IsActive, ExcludedDomains__c, ExcludedEmailDomains__c FROM ActivityCaptureSettings__c" --target-org $ORG_ALIAS --use-tooling-api

echo
echo "2. CHECKING CUSTOM SETTINGS FOR EXCLUSIONS..."
echo "============================================="

# Check for custom settings with domain exclusions
sf data query --query "SELECT Id, Name, ExcludedDomains__c, BlockedDomains__c, ExcludedEmailDomains__c FROM ActivityCaptureConfiguration__c" --target-org $ORG_ALIAS

echo
echo "3. CHECKING EMAIL INTEGRATION SETTINGS..."
echo "========================================"

# Check email integration exclusions  
sf data query --query "SELECT Id, Name, EmailDomainExclusions__c, RestrictedDomains__c FROM EmailIntegrationSettings__c" --target-org $ORG_ALIAS

echo
echo "4. CHECKING EINSTEIN ACTIVITY INSIGHTS SETTINGS..."
echo "================================================="

# Check Einstein Activity Insights
sf data query --query "SELECT Id, Name, ExcludedDomains__c FROM EinsteinActivityInsightSettings__c" --target-org $ORG_ALIAS

echo
echo "5. CHECKING USER COLLEEN MARCHESANO (005Pg00000FguErIAJ)..."
echo "========================================================="

# Check user Einstein Activity Capture status
sf data query --query "SELECT Id, Name, IsActive, UserPreferencesActivityRemindersPopup, EinsteinActivityCaptureEnabled__c FROM User WHERE Id = '005Pg00000FguErIAJ'" --target-org $ORG_ALIAS

echo
echo "6. CHECKING USER-SPECIFIC EXCLUSIONS..."
echo "======================================"

# Check for user-specific exclusions
sf data query --query "SELECT Id, UserId, ExcludedFromActivityCapture__c, EmailExclusions__c FROM ActivityCaptureUserSettings__c WHERE UserId = '005Pg00000FguErIAJ'" --target-org $ORG_ALIAS

echo
echo "7. CHECKING ORG-WIDE FEATURE STATUS..."
echo "====================================="

# Check Einstein Activity Capture feature license
sf data query --query "SELECT Id, FeatureName, IsEnabled FROM FeatureLicense WHERE FeatureName LIKE '%Einstein%' OR FeatureName LIKE '%Activity%'" --target-org $ORG_ALIAS

echo
echo "8. CHECKING EMAIL RELAY CONFIGURATIONS..."
echo "========================================"

# Check email relay for domain restrictions
sf data query --query "SELECT Id, Name, IsActive, ExcludedDomains__c FROM EmailRelay" --target-org $ORG_ALIAS

echo
echo "9. VERIFYING CONTACT CURT FAUST..."
echo "================================"

# Find the contact first
sf data query --query "SELECT Id, Name, Email FROM Contact WHERE Email = 'cfaust@lincoln.ne.gov'" --target-org $ORG_ALIAS

echo
echo "10. CHECKING RECENT SETUP CHANGES..."
echo "===================================="

# Check setup audit trail for recent Einstein/Activity changes
sf data query --query "SELECT Id, Action, Display, CreatedById, CreatedDate, Section FROM SetupAuditTrail WHERE (Display LIKE '%Einstein%' OR Display LIKE '%Activity%' OR Display LIKE '%gov%') AND CreatedDate = LAST_N_DAYS:30 ORDER BY CreatedDate DESC LIMIT 10" --target-org $ORG_ALIAS

echo
echo "11. CHECKING FOR CUSTOM APEX FILTERING..."
echo "========================================"

# Look for Apex classes that might filter activities
sf data query --query "SELECT Id, Name FROM ApexClass WHERE Name LIKE '%Activity%' OR Name LIKE '%Einstein%' OR Name LIKE '%Email%'" --target-org $ORG_ALIAS --use-tooling-api

echo
echo "12. CHECKING ORGANIZATION PREFERENCES..."
echo "======================================="

# Check org preferences for activity capture
sf data query --query "SELECT Id, SettingName, SettingValue FROM OrganizationPreference WHERE SettingName LIKE '%Activity%' OR SettingName LIKE '%Einstein%'" --target-org $ORG_ALIAS

echo
echo "=== INVESTIGATION COMPLETE ==="
echo "Review results above for any mentions of:"
echo "- .gov domains"
echo "- lincoln.ne.gov"
echo "- government"
echo "- Domain exclusions"
echo "- User-specific blocks for Colleen"
echo "- Disabled features or licenses"