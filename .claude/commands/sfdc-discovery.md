---
description: Salesforce environment discovery command reference for querying org state before changes
allowed-tools: Bash, Read, Grep
---

# Salesforce Discovery Commands

Essential commands for querying Salesforce org state BEFORE making any changes. These commands help prevent duplicate work and ensure accurate understanding of the current environment.

## 🚨 CRITICAL: Always Query Org First

**NEVER** rely on local files alone. **ALWAYS** query the Salesforce org directly to understand what exists.

## Lightning Pages (FlexiPages)

### Query All Lightning Pages for an Object
```bash
# For Contact object
sf data query --query "SELECT Id, DeveloperName, MasterLabel, Description FROM FlexiPage WHERE EntityDefinitionId = 'Contact'" --target-org [org-alias] --use-tooling-api

# For any custom object
sf data query --query "SELECT Id, DeveloperName, MasterLabel FROM FlexiPage WHERE EntityDefinitionId = 'CustomObject__c'" --target-org [org-alias] --use-tooling-api
```

### Query All Lightning Pages in Org
```bash
sf data query --query "SELECT Id, DeveloperName, MasterLabel, EntityDefinitionId, Type FROM FlexiPage" --target-org [org-alias] --use-tooling-api
```

### Check Specific Lightning Page Configuration
```bash
# Retrieve the page to see its components and related lists
sf project retrieve start --metadata "FlexiPage:Org_Contact_Page" --target-org [org-alias]
```

## Page Layouts

### Query All Page Layouts for an Object
```bash
# For Contact object
sf data query --query "SELECT Id, Name, NamespacePrefix FROM Layout WHERE TableEnumOrId = 'Contact'" --target-org [org-alias] --use-tooling-api

# For custom object
sf data query --query "SELECT Id, Name FROM Layout WHERE TableEnumOrId = 'CustomObject__c'" --target-org [org-alias] --use-tooling-api
```

### Get Layout Details with Related Lists
```bash
# Retrieve specific layout to see all related lists
sf project retrieve start --metadata "Layout:Contact-Contact Layout" --target-org [org-alias]
```

## Field Discovery

### Check if Field Exists on Object
```bash
# Check for specific field
sf sobject describe Contact --target-org [org-alias] | jq '.fields[] | select(.name=="Business_Unit__c")'

# List all fields on object
sf sobject describe Contact --target-org [org-alias] | jq '.fields[].name'

# Get field details (type, required, etc.)
sf sobject describe Contact --target-org [org-alias] | jq '.fields[] | select(.name=="FieldName") | {name, type, required: .nillable | not}'
```

### Find Lookup Relationships
```bash
# Find all lookup fields on an object pointing to Contact
sf sobject describe Business_Unit__c --target-org [org-alias] | jq '.fields[] | select(.type=="reference" and .referenceTo[]=="Contact")'

# Find all reference fields on an object
sf sobject describe CustomObject__c --target-org [org-alias] | jq '.fields[] | select(.type=="reference") | {name, referenceTo}'
```

## Related Lists Discovery

### Check Related List Configuration
```bash
# Get related lists from a specific layout
sf data query --query "SELECT Id, RelatedList, SortField, SortOrder FROM RelatedListItem WHERE ParentEntityId IN (SELECT Id FROM Layout WHERE Name = 'Contact-Contact Layout')" --target-org [org-alias] --use-tooling-api
```

### Find Child Relationships
```bash
# Find all objects with lookups to Contact
sf sobject describe Contact --target-org [org-alias] | jq '.childRelationships[] | {relationshipName, childSObject, field}'
```

## Object and Metadata Discovery

### List All Custom Objects
```bash
sf data query --query "SELECT DeveloperName, Label FROM CustomObject WHERE DeveloperName LIKE '%__c'" --target-org [org-alias] --use-tooling-api
```

### Check Record Types
```bash
# Get record types for an object
sf sobject describe Contact --target-org [org-alias] | jq '.recordTypeInfos[] | {name, recordTypeId, available, defaultRecordTypeMapping}'
```

### Query Permission Sets and Profiles
```bash
# Find profiles with access to a specific object
sf data query --query "SELECT Parent.Name FROM ObjectPermissions WHERE SobjectType = 'CustomObject__c' AND PermissionsRead = true" --target-org [org-alias] --use-tooling-api

# Check field permissions
sf data query --query "SELECT Parent.Name, Field FROM FieldPermissions WHERE SobjectType = 'Contact' AND Field = 'Contact.Business_Unit__c'" --target-org [org-alias] --use-tooling-api
```

## Validation Rules and Workflow

### Query Validation Rules
```bash
sf data query --query "SELECT Id, ValidationName, Active, ErrorMessage FROM ValidationRule WHERE EntityDefinition.DeveloperName = 'Contact'" --target-org [org-alias] --use-tooling-api
```

### Check Flows and Process Builders
```bash
# Active flows for an object
sf data query --query "SELECT Id, MasterLabel, ProcessType, TriggerType FROM Flow WHERE ProcessType = 'AutoLaunchedFlow' AND IsActive = true" --target-org [org-alias] --use-tooling-api
```

## Complete Discovery Workflow Example

When asked to add a Business Unit related list to Contact pages:

```bash
# 1. Discover ALL Contact Lightning Pages in the org
sf data query --query "SELECT DeveloperName, MasterLabel FROM FlexiPage WHERE EntityDefinitionId = 'Contact'" --target-org rentable-sandbox --use-tooling-api

# Output shows: Org_Contact_Page, Contact_Record_Page, etc.

# 2. Discover ALL Contact Page Layouts
sf data query --query "SELECT Name FROM Layout WHERE TableEnumOrId = 'Contact'" --target-org rentable-sandbox --use-tooling-api

# Output shows: Contact-AptIQ Contact, Contact-Contact Layout, Contact-Groove Layout, etc.

# 3. Check if lookup field exists on Business_Unit__c
sf sobject describe Business_Unit__c --target-org rentable-sandbox | jq '.fields[] | select(.type=="reference" and .referenceTo[]=="Contact")'

# 4. Retrieve and check each page/layout for existing related list
sf project retrieve start --metadata "FlexiPage:Org_Contact_Page" --target-org rentable-sandbox
grep -i "business.*unit" force-app/main/default/flexipages/Org_Contact_Page.flexipage-meta.xml

# 5. Only add to pages/layouts that don't already have it
```

## Common Mistakes to Avoid

❌ **DON'T**: Check local files first
✅ **DO**: Query the org first

❌ **DON'T**: Assume metadata doesn't exist because it's not in your project
✅ **DO**: Query the org to see ALL metadata

❌ **DON'T**: Make changes without checking current state
✅ **DO**: Document current state, then make only necessary changes

## Quick Reference Checklist

Before ANY Salesforce change:
- [ ] Queried org for existing Lightning Pages
- [ ] Queried org for existing Page Layouts
- [ ] Checked if fields exist in org
- [ ] Verified relationships and lookups
- [ ] Retrieved current configurations
- [ ] Documented what already exists
- [ ] Identified only necessary changes