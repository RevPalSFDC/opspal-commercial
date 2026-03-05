#!/bin/bash

# Quick .gov Domain Investigation for Einstein Activity Capture
# Run this first for immediate results

ORG_ALIAS="acme-corp-main"

echo "🔍 QUICK .gov DOMAIN INVESTIGATION"
echo "=================================="
echo

# 1. Check the most likely culprit - Custom Settings
echo "1. Checking Activity Capture Settings (Most Likely Source)..."
sf data query --query "SELECT Id, Name, SetupOwnerId, ExcludedDomains__c, BlockedDomains__c, ExcludedEmailDomains__c FROM ActivityCaptureSettings__c" --target-org $ORG_ALIAS

echo
echo "2. Checking Email Integration Settings..."
sf data query --query "SELECT Id, Name, EmailDomainExclusions__c, RestrictedDomains__c FROM EmailIntegrationSettings__c" --target-org $ORG_ALIAS

echo
echo "3. Checking if Colleen's User Account is Active for Activity Capture..."
sf data query --query "SELECT Id, Name, IsActive, Email FROM User WHERE Id = '005Pg00000FguErIAJ'" --target-org $ORG_ALIAS

echo
echo "4. Checking Contact Curt Faust exists..."
sf data query --query "SELECT Id, Name, Email, OwnerId FROM Contact WHERE Email = 'cfaust@lincoln.ne.gov'" --target-org $ORG_ALIAS

echo
echo "5. Checking for ANY .gov activities in the system..."
sf data query --query "SELECT COUNT() FROM Task WHERE (Description LIKE '%.gov%' OR Subject LIKE '%.gov%')" --target-org $ORG_ALIAS

echo
echo "6. Checking for ANY EmailMessage records with .gov domains..."
sf data query --query "SELECT COUNT() FROM EmailMessage WHERE (FromAddress LIKE '%.gov%' OR ToAddress LIKE '%.gov%')" --target-org $ORG_ALIAS

echo
echo "✅ Quick Investigation Complete!"
echo "Next steps: If you see domain exclusions containing '.gov' or 'lincoln.ne.gov', that's your issue!"
echo "If no exclusions found, run the full investigation script."