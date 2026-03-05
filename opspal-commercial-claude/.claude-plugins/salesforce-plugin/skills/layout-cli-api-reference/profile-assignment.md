# Profile Layout Assignment Management

## Overview

Page layout assignments determine which layout a user sees based on their Profile and (optionally) Record Type. These assignments are stored in Profile metadata and must be deployed alongside layout changes.

---

## Assignment Types

### Default Layout Assignment

Assigns a layout to all records for a profile (no record type):

```xml
<layoutAssignments>
    <layout>Account-Account Layout</layout>
</layoutAssignments>
```

### Record Type-Specific Assignment

Assigns a layout for a specific record type:

```xml
<layoutAssignments>
    <layout>Account-Sales Account Layout</layout>
    <recordType>Account.Enterprise</recordType>
</layoutAssignments>
```

---

## Profile Metadata Structure

### Sample Profile with Layout Assignments

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Profile xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Sales User</fullName>

    <!-- Default Account layout -->
    <layoutAssignments>
        <layout>Account-Account Layout</layout>
    </layoutAssignments>

    <!-- Enterprise record type uses different layout -->
    <layoutAssignments>
        <layout>Account-Enterprise Account Layout</layout>
        <recordType>Account.Enterprise</recordType>
    </layoutAssignments>

    <!-- SMB record type layout -->
    <layoutAssignments>
        <layout>Account-SMB Account Layout</layout>
        <recordType>Account.SMB</recordType>
    </layoutAssignments>

    <!-- Contact layouts -->
    <layoutAssignments>
        <layout>Contact-Contact Layout</layout>
    </layoutAssignments>

    <!-- Other profile settings... -->
    <userLicense>Salesforce</userLicense>
</Profile>
```

---

## CLI Operations

### Retrieve Profile with Assignments

```bash
# Single profile
sf project retrieve start -m "Profile:Sales User"

# Multiple profiles
sf project retrieve start -m "Profile:Sales User,Profile:Support User"

# All profiles (large operation)
sf project retrieve start -m Profile
```

### Deploy Profile Assignments

```bash
# Deploy profile (includes layout assignments)
sf project deploy start -m "Profile:Sales User"

# Deploy layout and profile together
sf project deploy start -m \
  "Layout:Account-New Account Layout,Profile:Sales User"
```

### Query Current Assignments

```bash
# Get profile ID first
sf data query --query \
  "SELECT Id, Name FROM Profile WHERE Name = 'Sales User'"

# Query layout assignments (via LayoutAssignment object)
sf data query --query \
  "SELECT Layout.Name, RecordType.Name
   FROM ProfileLayoutAssignment
   WHERE Profile.Name = 'Sales User'" \
  --use-tooling-api
```

---

## Common Assignment Scenarios

### Scenario 1: Assign New Layout to Single Profile

1. **Create new layout** (or modify existing)
2. **Retrieve target profile:**
   ```bash
   sf project retrieve start -m "Profile:Target Profile"
   ```
3. **Edit profile XML** - Add or modify `<layoutAssignments>`
4. **Deploy:**
   ```bash
   sf project deploy start -m "Layout:Account-New Layout,Profile:Target Profile"
   ```

### Scenario 2: Assign Layout to Multiple Profiles

```bash
# Retrieve all relevant profiles
sf project retrieve start -m "Profile:Sales User,Profile:Sales Manager,Profile:Executive"

# Edit each profile's layoutAssignments

# Deploy all together
sf project deploy start -m \
  "Layout:Account-New Layout,Profile:Sales User,Profile:Sales Manager,Profile:Executive"
```

### Scenario 3: Different Layouts per Record Type

Profile XML:
```xml
<layoutAssignments>
    <layout>Account-Standard Layout</layout>
</layoutAssignments>
<layoutAssignments>
    <layout>Account-Premium Layout</layout>
    <recordType>Account.Premium</recordType>
</layoutAssignments>
<layoutAssignments>
    <layout>Account-Partner Layout</layout>
    <recordType>Account.Partner</recordType>
</layoutAssignments>
```

---

## Automation Scripts

### Script: Assign Layout to Profile

```bash
#!/bin/bash
# assign-layout.sh <layout_name> <profile_name> [record_type]

LAYOUT=$1
PROFILE=$2
RECORD_TYPE=$3

# Retrieve current profile
sf project retrieve start -m "Profile:$PROFILE" -d temp_profile

# Backup
cp temp_profile/profiles/${PROFILE}.profile-meta.xml \
   temp_profile/profiles/${PROFILE}.profile-meta.xml.bak

# Add layout assignment (using sed or xmlstarlet)
# This is simplified - use proper XML tools for production

if [ -z "$RECORD_TYPE" ]; then
    # Default assignment
    echo "Adding default assignment: $LAYOUT"
else
    # Record type specific
    echo "Adding assignment: $LAYOUT for $RECORD_TYPE"
fi

# Deploy
sf project deploy start -d temp_profile/profiles
```

### Script: Bulk Profile Update

```bash
#!/bin/bash
# bulk-assign-layout.sh <layout_name> <profiles_file>

LAYOUT=$1
PROFILES_FILE=$2  # File with one profile name per line

PROFILES=""
while read profile; do
    PROFILES="$PROFILES,Profile:$profile"
done < "$PROFILES_FILE"

# Remove leading comma
PROFILES=${PROFILES:1}

# Retrieve all profiles
sf project retrieve start -m "$PROFILES" -d temp_profiles

# (Edit each profile - implement your logic)

# Deploy
sf project deploy start -d temp_profiles
```

---

## Lightning Page Assignments

### FlexiPage Assignment Types

Lightning Record Pages can be assigned:
1. **Org Default** - All users see this page
2. **App Default** - Users in specific app see this page
3. **App + Profile + Record Type** - Most granular

### Assignment in FlexiPage Metadata

Basic org-level assignment is implicit. For app/profile assignments, the assignment is in other metadata.

### Assignment via Lightning App Builder

Most Lightning page assignments are done in the UI via Lightning App Builder's Activation panel. The assignments are then stored in:
- `CustomApplication` metadata (for app-level)
- `Profile` metadata (for profile-level)

### Retrieve App with Page Assignments

```bash
sf project retrieve start -m "CustomApplication:Sales,CustomApplication:Service"
```

---

## Permission Set Layout Assignments

### Note on Permission Sets

As of Winter '24+, Permission Sets can be used for layout assignments in some scenarios. However, Profile-based assignment remains the primary method.

---

## Best Practices

### 1. Always Deploy Profile with Layout

```bash
# Correct: Include profile
sf project deploy start -m "Layout:Account-New Layout,Profile:Sales User"

# Incorrect: Layout alone won't be visible to users
sf project deploy start -m "Layout:Account-New Layout"
```

### 2. Document Assignments

Maintain a reference document or spreadsheet tracking:
- Which profiles use which layouts
- Record type variations
- Reason for specific assignments

### 3. Test in Sandbox First

```bash
# Validate assignment in sandbox
sf project deploy start -m "Layout:Account-New Layout,Profile:Sales User" \
  --target-org sandbox

# Verify by logging in as user with that profile
```

### 4. Use Meaningful Names

Layout names should indicate their purpose:
- `Account-Sales Team Layout`
- `Account-Support Team Layout`
- `Account-Executive View`

### 5. Minimize Profile Modifications

When possible, use Permission Sets for feature access and keep profile assignments simple. This reduces deployment complexity.

---

## Troubleshooting

### Issue: Layout Not Visible to Users

**Cause:** Profile assignment missing
**Solution:** Retrieve profile, verify `<layoutAssignments>`, deploy profile

### Issue: Wrong Layout Showing

**Cause:** Record type mismatch or default overriding specific
**Solution:** Check record type assignments in profile, ensure correct `<recordType>` specified

### Issue: Profile Deploy Fails

**Cause:** Profile has many dependencies
**Solution:** Deploy profile separately or use selective profile deployment (include only layout assignments in deploy package)

### Selective Profile Deployment

To deploy only layout assignments without other profile settings:
1. Retrieve full profile
2. Create a minimal profile XML with only `<layoutAssignments>`
3. Deploy the minimal profile

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Profile xmlns="http://soap.sforce.com/2006/04/metadata">
    <layoutAssignments>
        <layout>Account-New Layout</layout>
    </layoutAssignments>
</Profile>
```
