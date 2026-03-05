# Layout Retrieval Patterns

## Basic Retrieval

### Single Layout Retrieval

```bash
# Classic Page Layout
sf project retrieve start -m "Layout:ObjectName-Layout Name"

# Examples
sf project retrieve start -m "Layout:Account-Account Layout"
sf project retrieve start -m "Layout:Opportunity-Equipment Finance"
sf project retrieve start -m "Layout:CustomObject__c-Custom Layout"
```

**Note:** Layout names with spaces must be specified exactly, including spaces.

### Lightning Record Page Retrieval

```bash
# FlexiPage (Lightning Record Page)
sf project retrieve start -m "FlexiPage:PageAPIName"

# Examples
sf project retrieve start -m "FlexiPage:Account_Record_Page"
sf project retrieve start -m "FlexiPage:Custom_Object_Page"
```

### Compact Layout Retrieval

```bash
# Compact Layout uses Object.LayoutName format
sf project retrieve start -m "CompactLayout:Object.LayoutName"

# Examples
sf project retrieve start -m "CompactLayout:Account.Account_Compact_Layout"
sf project retrieve start -m "CompactLayout:Contact.Mobile_Contact_Layout"
```

---

## Bulk Retrieval Patterns

### All Layouts by Type

```bash
# All Page Layouts in org
sf project retrieve start -m Layout

# All Lightning Record Pages
sf project retrieve start -m FlexiPage

# All Compact Layouts
sf project retrieve start -m CompactLayout
```

### Wildcard Patterns

```bash
# All Account layouts (Classic)
sf project retrieve start -m "Layout:Account-*"

# All Opportunity layouts
sf project retrieve start -m "Layout:Opportunity-*"

# All FlexiPages for Account
sf project retrieve start -m "FlexiPage:Account_*"
```

### Multiple Specific Layouts

```bash
# Multiple layouts in one command
sf project retrieve start -m \
  "Layout:Account-Account Layout,Layout:Contact-Contact Layout,Layout:Opportunity-Opportunity Layout"

# Mixed types
sf project retrieve start -m \
  "Layout:Account-Account Layout,FlexiPage:Account_Record_Page,CompactLayout:Account.Account_Compact"
```

---

## Using package.xml

### Basic Package

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>Account-Account Layout</members>
        <members>Contact-Contact Layout</members>
        <name>Layout</name>
    </types>
    <version>62.0</version>
</Package>
```

### Comprehensive Layout Package

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <!-- Classic Page Layouts -->
    <types>
        <members>Account-Account Layout</members>
        <members>Account-Sales Account Layout</members>
        <members>Contact-Contact Layout</members>
        <members>Opportunity-Opportunity Layout</members>
        <name>Layout</name>
    </types>

    <!-- Lightning Record Pages -->
    <types>
        <members>Account_Record_Page</members>
        <members>Contact_Record_Page</members>
        <members>Opportunity_Record_Page</members>
        <name>FlexiPage</name>
    </types>

    <!-- Compact Layouts -->
    <types>
        <members>Account.Account_Compact_Layout</members>
        <members>Contact.Contact_Compact_Layout</members>
        <name>CompactLayout</name>
    </types>

    <!-- Profiles (for assignments) -->
    <types>
        <members>Standard User</members>
        <members>Sales User</members>
        <name>Profile</name>
    </types>

    <version>62.0</version>
</Package>
```

### Retrieve Using Package

```bash
sf project retrieve start -x package.xml -d retrieved_layouts
```

---

## Advanced Retrieval Scenarios

### Retrieve with Dependencies

When layouts reference custom fields, buttons, or actions, retrieve dependencies:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>Account-Account Layout</members>
        <name>Layout</name>
    </types>
    <types>
        <members>Account.Custom_Field__c</members>
        <members>Account.Another_Field__c</members>
        <name>CustomField</name>
    </types>
    <types>
        <members>Account.Custom_Button</members>
        <name>WebLink</name>
    </types>
    <version>62.0</version>
</Package>
```

### Retrieve All for an Object

Script to retrieve all layout-related metadata for an object:

```bash
#!/bin/bash
OBJECT=$1
ORG=$2

echo "Retrieving all layouts for $OBJECT from $ORG..."

sf project retrieve start \
  --target-org $ORG \
  -m "Layout:${OBJECT}-*" \
  -m "FlexiPage:${OBJECT}_*" \
  -m "CompactLayout:${OBJECT}.*" \
  -m "CustomObject:${OBJECT}"
```

### Compare Layouts Across Orgs

```bash
#!/bin/bash
# compare-layouts.sh <object> <org1> <org2>

OBJECT=$1
ORG1=$2
ORG2=$3

# Retrieve from first org
sf project retrieve start -m "Layout:${OBJECT}-*" \
  --target-org $ORG1 -d .compare/${ORG1}

# Retrieve from second org
sf project retrieve start -m "Layout:${OBJECT}-*" \
  --target-org $ORG2 -d .compare/${ORG2}

# Compare
diff -r .compare/${ORG1} .compare/${ORG2}
```

---

## Discovery Queries

### Find All Page Layouts

```bash
# List all page layouts in org
sf data query --query \
  "SELECT Id, Name, EntityDefinition.QualifiedApiName, TableEnumOrId
   FROM Layout
   ORDER BY EntityDefinition.QualifiedApiName" \
  --use-tooling-api --result-format csv
```

### Find Layouts for Specific Object

```bash
# Account layouts
sf data query --query \
  "SELECT Name FROM Layout WHERE TableEnumOrId = 'Account'" \
  --use-tooling-api
```

### Find Lightning Record Pages

```bash
# All FlexiPages with their entity
sf data query --query \
  "SELECT Id, DeveloperName, MasterLabel, EntityDefinition.QualifiedApiName
   FROM FlexiPage
   WHERE Type = 'RecordPage'
   ORDER BY EntityDefinition.QualifiedApiName" \
  --use-tooling-api
```

### Find Compact Layouts

```bash
sf data query --query \
  "SELECT Id, DeveloperName, SobjectType, FullName
   FROM CompactLayout
   ORDER BY SobjectType" \
  --use-tooling-api
```

---

## Retrieval Tips

### Handling Names with Spaces

Layout names with spaces work in CLI but require proper quoting:

```bash
# Correct (double quotes around the whole -m argument)
sf project retrieve start -m "Layout:Account-My Custom Layout"

# Also correct (escaping)
sf project retrieve start -m Layout:Account-My\ Custom\ Layout
```

### Retrieve to Specific Directory

```bash
# Custom output directory
sf project retrieve start -m "Layout:Account-*" -d my-layouts

# Relative path
sf project retrieve start -m "FlexiPage:Account_*" -d ./retrieved/account
```

### Retrieve from Non-Default Org

```bash
# Specify target org
sf project retrieve start -m "Layout:Account-*" --target-org production

# Using org alias
sf project retrieve start -m "FlexiPage:*" --target-org sandbox1
```

### JSON Output for Scripting

```bash
# Get retrieval results as JSON
sf project retrieve start -m "Layout:Account-*" --json > retrieve_result.json
```
