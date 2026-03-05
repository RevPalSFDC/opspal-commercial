# Layout Deployment Error Recovery

## Common Deployment Errors

### Error 1: "No source-backed components present"

**Error Message:**
```
Error: No source-backed components present in the package.
```

**Cause:** The specified metadata doesn't exist in the local project or the path is wrong.

**Solutions:**

1. **Verify the file exists:**
   ```bash
   ls -la force-app/main/default/layouts/
   ```

2. **Check file naming:**
   - Layout: `ObjectName-Layout Name.layout-meta.xml`
   - FlexiPage: `Page_Name.flexipage-meta.xml`
   - Compact: `Object.Layout_Name.compactLayout-meta.xml`

3. **Retrieve first if missing:**
   ```bash
   sf project retrieve start -m "Layout:Account-Account Layout"
   ```

---

### Error 2: "This component already exists"

**Error Message:**
```
Error: A component with the same name already exists.
```

**Cause:** Attempting to create a layout that already exists in the org.

**Solutions:**

1. **Retrieve and merge:**
   ```bash
   # Get existing layout
   sf project retrieve start -m "Layout:Account-Account Layout"
   # Merge your changes into the retrieved file
   # Deploy merged version
   sf project deploy start -m "Layout:Account-Account Layout"
   ```

2. **If intentional replacement:**
   - Delete the layout in org first (via Setup UI)
   - Then deploy the new version

---

### Error 3: "Invalid field" or "Field does not exist"

**Error Message:**
```
Error: Field Custom_Field__c does not exist or is not visible.
```

**Cause:** Layout references a field that doesn't exist in the target org.

**Solutions:**

1. **Deploy field first:**
   ```bash
   sf project deploy start -m "CustomField:Account.Custom_Field__c"
   # Then deploy layout
   sf project deploy start -m "Layout:Account-Account Layout"
   ```

2. **Remove field from layout:**
   - Edit the layout XML
   - Remove the `<layoutItems>` referencing the missing field

3. **Check field-level security:**
   - Field might exist but not be visible to the deploying user
   - Verify FLS in target profile

---

### Error 4: "Invalid related list"

**Error Message:**
```
Error: Related list CustomObject__r does not exist.
```

**Cause:** Layout includes a related list for an object or relationship that doesn't exist.

**Solutions:**

1. **Verify relationship exists:**
   ```bash
   sf sobject describe Account --json | grep -i "childRelationships"
   ```

2. **Deploy parent object/relationship first:**
   ```bash
   sf project deploy start -m "CustomObject:RelatedObject__c"
   ```

3. **Remove related list from layout:**
   - Edit XML and remove the `<relatedLists>` section for the missing relationship

---

### Error 5: "Quick action not found"

**Error Message:**
```
Error: Quick action New_Task does not exist.
```

**Cause:** Layout references a quick action that doesn't exist.

**Solutions:**

1. **Deploy quick action first:**
   ```bash
   sf project deploy start -m "QuickAction:Account.New_Task"
   ```

2. **Remove from layout:**
   - Edit XML and remove from `<quickActionList>` or `<platformActionList>`

---

### Error 6: "Invalid layout assignment"

**Error Message:**
```
Error: Layout Account-Sales Layout is not valid for record type Account.Enterprise.
```

**Cause:** Trying to assign a layout to a record type that doesn't exist or isn't accessible.

**Solutions:**

1. **Verify record type exists:**
   ```bash
   sf data query --query \
     "SELECT Id, Name, DeveloperName FROM RecordType WHERE SobjectType='Account'" \
     --use-tooling-api
   ```

2. **Deploy record type first:**
   ```bash
   sf project deploy start -m "RecordType:Account.Enterprise"
   ```

3. **Fix profile assignment:**
   - Edit Profile XML
   - Use correct RecordType DeveloperName

---

### Error 7: "FlexiPage component error"

**Error Message:**
```
Error: Component flexipage:fieldSection has invalid property: fields
```

**Cause:** Invalid FlexiPage structure or component syntax.

**Solutions:**

1. **Validate XML structure:**
   - Ensure proper facet hierarchy
   - Check component names match Salesforce standards

2. **Use fieldInstance pattern:**
   ```xml
   <facets>
       <facetId>fieldFacet1</facetId>
       <fieldInstance>
           <fieldItem>Account.Name</fieldItem>
       </fieldInstance>
   </facets>
   ```

3. **Retrieve working example:**
   ```bash
   # Get a working FlexiPage from org as reference
   sf project retrieve start -m "FlexiPage:Account_Record_Page"
   ```

---

### Error 8: "Compact layout field limit"

**Error Message:**
```
Error: Compact layouts can have a maximum of 10 fields.
```

**Cause:** Compact layout includes too many fields.

**Solutions:**

1. **Reduce fields:**
   - Edit compactLayout XML
   - Keep only 4-5 most important fields
   - Remove `<fields>` entries beyond limit

2. **Prioritize fields:**
   - Keep: Name, Phone, Email, Status fields
   - Remove: Descriptions, dates, secondary info

---

### Error 9: "Profile not found"

**Error Message:**
```
Error: Profile Standard User not found.
```

**Cause:** Profile name in deployment doesn't match actual profile name.

**Solutions:**

1. **Get exact profile name:**
   ```bash
   sf data query --query "SELECT Id, Name FROM Profile"
   ```

2. **Use API name:**
   - Some profiles have different API names
   - "Standard User" vs "StandardUser"
   - Check profile's actual `<fullName>` in metadata

---

### Error 10: "Insufficient access rights"

**Error Message:**
```
Error: Insufficient access rights on cross-reference id.
```

**Cause:** Deploying user doesn't have access to referenced objects or fields.

**Solutions:**

1. **Check deploying user permissions:**
   - Ensure user has Modify All Data or appropriate object permissions
   - Verify user can see all fields referenced in layout

2. **Deploy as System Administrator:**
   ```bash
   sf project deploy start -m "Layout:*" --target-org admin-user
   ```

---

## Recovery Procedures

### Procedure 1: Rollback Layout Change

```bash
#!/bin/bash
# rollback-layout.sh <layout_name> <org>

LAYOUT=$1
ORG=$2

# Option A: From backup
if [ -d "backups/latest" ]; then
    sf project deploy start -d backups/latest --target-org $ORG
fi

# Option B: From version control
git checkout HEAD~1 -- "force-app/main/default/layouts/${LAYOUT}.layout-meta.xml"
sf project deploy start -m "Layout:$LAYOUT" --target-org $ORG
```

### Procedure 2: Reset to Org Default

```bash
# Retrieve current org state
sf project retrieve start -m "Layout:Account-*" --target-org $ORG -d from_org

# Deploy the org's version to overwrite local changes
sf project deploy start -d from_org
```

### Procedure 3: Clean Deployment

```bash
# Remove problematic items, deploy clean version
# 1. Backup current
cp layout.layout-meta.xml layout.layout-meta.xml.bak

# 2. Remove problematic fields/sections from XML

# 3. Validate first
sf project deploy start -m "Layout:Account-Account Layout" --dry-run

# 4. Deploy if validation passes
sf project deploy start -m "Layout:Account-Account Layout"
```

---

## Pre-Deployment Validation Checklist

Before deploying layouts, verify:

- [ ] All referenced custom fields exist in target org
- [ ] All referenced quick actions exist
- [ ] All referenced related lists have valid relationships
- [ ] All referenced record types exist
- [ ] Profile names match exactly
- [ ] Compact layout has ≤10 fields
- [ ] FlexiPage uses valid component structure
- [ ] Deploying user has necessary permissions

### Automated Validation Script

```bash
#!/bin/bash
# validate-layout-deploy.sh <layout_file>

LAYOUT_FILE=$1

echo "Validating layout deployment..."

# Check file exists
if [ ! -f "$LAYOUT_FILE" ]; then
    echo "ERROR: Layout file not found"
    exit 1
fi

# Extract field references
FIELDS=$(grep -oP '<layoutItems>.*?</layoutItems>' "$LAYOUT_FILE" | \
         grep -oP 'field>[^<]+' | sed 's/field>//')

echo "Fields referenced: $FIELDS"

# Dry run deployment
sf project deploy start -m "Layout:$(basename $LAYOUT_FILE .layout-meta.xml)" --dry-run

if [ $? -eq 0 ]; then
    echo "Validation PASSED"
else
    echo "Validation FAILED - check errors above"
    exit 1
fi
```

---

## Getting Help

If errors persist:

1. **Check Salesforce documentation** for specific error codes
2. **Search Known Issues** at https://issues.salesforce.com
3. **Review deployment logs:**
   ```bash
   sf project deploy report --job-id <JOB_ID> --verbose
   ```
4. **Use verbose mode:**
   ```bash
   sf project deploy start -m "Layout:*" --verbose --json
   ```
