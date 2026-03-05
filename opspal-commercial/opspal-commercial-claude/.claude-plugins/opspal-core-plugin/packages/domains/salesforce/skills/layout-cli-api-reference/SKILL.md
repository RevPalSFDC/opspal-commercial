---
name: layout-cli-api-reference
description: Salesforce layout CLI and API operations. Use when creating, retrieving, modifying, or deploying page layouts, Lightning Record Pages, and Compact Layouts via command line or Metadata API.
allowed-tools: Read, Grep, Glob, Bash
---

# Layout CLI/API Reference

## When to Use This Skill

Activate this skill when the user needs to:
- Retrieve existing layouts from a Salesforce org
- Modify layout XML metadata
- Deploy layout changes via CLI
- Manage profile layout assignments programmatically
- Troubleshoot layout deployment errors

## Layout Types and API Names

### Page Layouts (Classic)

**Metadata Type:** `Layout`

**API Name Format:** `ObjectAPIName-LayoutName`

Examples:
- `Account-Account Layout`
- `Contact-Contact Layout`
- `Opportunity-Opportunity Layout`
- `CustomObject__c-CustomObject Layout`

**File Extension:** `.layout-meta.xml`

### Lightning Record Pages (FlexiPages)

**Metadata Type:** `FlexiPage`

**API Name Format:** `Object_Record_Page` (no spaces, underscores)

Examples:
- `Account_Record_Page`
- `Contact_Record_Page`
- `Custom_Object_Record_Page`

**File Extension:** `.flexipage-meta.xml`

### Compact Layouts

**Metadata Type:** `CompactLayout`

**API Name Format:** `ObjectAPIName.CompactLayoutAPIName`

Examples:
- `Account.Account_Compact_Layout`
- `Contact.Mobile_Contact_Layout`

**File Extension:** `.compactLayout-meta.xml`

---

## Retrieval Commands

### Retrieve All Layouts of a Type

```bash
# All Page Layouts
sf project retrieve start -m Layout

# All Lightning Record Pages
sf project retrieve start -m FlexiPage

# All Compact Layouts
sf project retrieve start -m CompactLayout
```

### Retrieve Specific Layout

```bash
# Page Layout (Classic)
sf project retrieve start -m "Layout:Account-Account Layout"

# Lightning Record Page
sf project retrieve start -m "FlexiPage:Account_Record_Page"

# Compact Layout
sf project retrieve start -m "CompactLayout:Account.Account_Compact_Layout"
```

### Retrieve by Object (All Layout Types)

```bash
# Get all layout-related metadata for an object
sf project retrieve start -m \
  "Layout:Account-*,FlexiPage:Account_*,CompactLayout:Account.*"
```

### Using package.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>Account-Account Layout</members>
        <members>Contact-Contact Layout</members>
        <name>Layout</name>
    </types>
    <types>
        <members>Account_Record_Page</members>
        <name>FlexiPage</name>
    </types>
    <types>
        <members>Account.Account_Compact_Layout</members>
        <name>CompactLayout</name>
    </types>
    <version>62.0</version>
</Package>
```

```bash
sf project retrieve start -x package.xml
```

---

## Deployment Commands

### Deploy Specific Layout

```bash
# Page Layout
sf project deploy start -m "Layout:Account-Account Layout"

# Lightning Record Page
sf project deploy start -m "FlexiPage:Account_Record_Page"

# Compact Layout
sf project deploy start -m "CompactLayout:Account.Account_Compact_Layout"
```

### Deploy with Profile Assignments

Profile layout assignments are stored in Profile metadata. To deploy layout with assignments:

```bash
# Deploy layout and profiles together
sf project deploy start -m \
  "Layout:Account-Account Layout,Profile:Standard User,Profile:Sales User"
```

### Deploy from Source Directory

```bash
# Deploy all layouts in project
sf project deploy start -d force-app/main/default/layouts

# Deploy specific directory
sf project deploy start -d force-app/main/default/flexipages
```

### Validate Before Deploy (Dry Run)

```bash
# Check-only deployment (no actual changes)
sf project deploy start -m "Layout:Account-Account Layout" --dry-run

# Validate entire project
sf project deploy validate -d force-app
```

---

## Profile Layout Assignments

### Assignment Structure in Profile XML

```xml
<Profile>
    <layoutAssignments>
        <layout>Account-Account Layout</layout>
    </layoutAssignments>
    <layoutAssignments>
        <layout>Account-Sales Account Layout</layout>
        <recordType>Account.Customer</recordType>
    </layoutAssignments>
</Profile>
```

### Retrieve Profiles with Assignments

```bash
sf project retrieve start -m "Profile:Standard User,Profile:Admin"
```

### Changing Assignments via CLI

1. Retrieve the profile: `sf project retrieve start -m "Profile:TargetProfile"`
2. Edit `<layoutAssignments>` in the XML
3. Deploy profile: `sf project deploy start -m "Profile:TargetProfile"`

---

## Common CLI Patterns

### Pattern 1: Layout Backup Before Changes

```bash
# Backup current state
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
sf project retrieve start -m "Layout:Account-Account Layout" \
  -d backup_${TIMESTAMP}

# Make changes, then deploy
sf project deploy start -m "Layout:Account-Account Layout"

# Rollback if needed
sf project deploy start -d backup_${TIMESTAMP}
```

### Pattern 2: Bulk Layout Operations

```bash
# Retrieve all Account-related layouts
sf project retrieve start -m "Layout:Account-*"

# Deploy all retrieved layouts
sf project deploy start -d force-app/main/default/layouts
```

### Pattern 3: Environment Comparison

```bash
# Retrieve from sandbox
sf project retrieve start -m "Layout:Account-*" \
  --target-org sandbox -d sandbox_layouts

# Retrieve from production
sf project retrieve start -m "Layout:Account-*" \
  --target-org prod -d prod_layouts

# Compare
diff -r sandbox_layouts prod_layouts
```

---

## Query Commands for Discovery

### List All Page Layouts for an Object

```bash
sf data query --query \
  "SELECT Name, EntityDefinition.QualifiedApiName
   FROM Layout
   WHERE EntityDefinition.QualifiedApiName = 'Account'" \
  --use-tooling-api
```

### List All Lightning Pages for an Object

```bash
sf data query --query \
  "SELECT DeveloperName, EntityDefinition.QualifiedApiName
   FROM FlexiPage
   WHERE EntityDefinition.QualifiedApiName = 'Account'" \
  --use-tooling-api
```

### List All Compact Layouts for an Object

```bash
sf data query --query \
  "SELECT DeveloperName, FullName
   FROM CompactLayout
   WHERE SobjectType = 'Account'" \
  --use-tooling-api
```

### Check Current Compact Layout Assignment

```bash
sf data query --query \
  "SELECT DefaultCompactLayoutName
   FROM EntityDefinition
   WHERE QualifiedApiName = 'Account'" \
  --use-tooling-api
```

---

## Reference Documentation

For detailed guidance, see:
- `retrieve-patterns.md` - Advanced retrieval scenarios
- `deploy-patterns.md` - Deployment strategies and validation
- `profile-assignment.md` - Profile layout assignment management
- `error-recovery.md` - Troubleshooting deployment failures
