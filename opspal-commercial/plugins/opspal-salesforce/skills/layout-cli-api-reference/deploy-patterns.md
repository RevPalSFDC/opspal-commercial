# Layout Deployment Patterns

## Basic Deployment

### Deploy Single Layout

```bash
# Classic Page Layout
sf project deploy start -m "Layout:Account-Account Layout"

# Lightning Record Page
sf project deploy start -m "FlexiPage:Account_Record_Page"

# Compact Layout
sf project deploy start -m "CompactLayout:Account.Account_Compact_Layout"
```

### Deploy Multiple Layouts

```bash
# Multiple layouts in one deployment
sf project deploy start -m \
  "Layout:Account-Account Layout,Layout:Contact-Contact Layout"

# Mixed types
sf project deploy start -m \
  "Layout:Account-Account Layout,FlexiPage:Account_Record_Page,CompactLayout:Account.Account_Compact"
```

---

## Validation-First Deployment

### Dry Run (Check-Only)

Always validate before deploying to production:

```bash
# Validate without deploying
sf project deploy start -m "Layout:Account-Account Layout" --dry-run

# Validate with verbose output
sf project deploy start -m "Layout:Account-Account Layout" --dry-run --verbose
```

### Validate Entire Project

```bash
# Validate all metadata
sf project deploy validate -d force-app

# Validate specific directory
sf project deploy validate -d force-app/main/default/layouts
```

### Quick Deploy After Validation

If validation succeeds, use quick deploy with the job ID:

```bash
# Get job ID from validation
sf project deploy validate -d force-app --json > validation.json

# Quick deploy using the validated job
sf project deploy quick --job-id <JOB_ID>
```

---

## Deploy with Profile Assignments

### Understanding Profile Dependencies

Layout assignments are stored in Profile metadata. Deploying a new layout doesn't automatically assign it.

**Workflow:**
1. Create/modify layout metadata
2. Update Profile metadata with new `<layoutAssignments>`
3. Deploy both together

### Deploy Layout + Profile

```bash
# Deploy layout and profiles together
sf project deploy start -m \
  "Layout:Account-Sales Account Layout,Profile:Sales User,Profile:Standard User"
```

### Profile Assignment XML Structure

```xml
<!-- In Profile metadata -->
<layoutAssignments>
    <layout>Account-Sales Account Layout</layout>
    <!-- Optional: specific to a record type -->
    <recordType>Account.Enterprise</recordType>
</layoutAssignments>
```

---

## Directory-Based Deployment

### Deploy from Source

```bash
# Deploy entire layouts directory
sf project deploy start -d force-app/main/default/layouts

# Deploy FlexiPages
sf project deploy start -d force-app/main/default/flexipages

# Deploy multiple directories
sf project deploy start \
  -d force-app/main/default/layouts \
  -d force-app/main/default/flexipages
```

### Deploy Entire Project

```bash
# Full project deployment
sf project deploy start -d force-app

# With test execution (for production)
sf project deploy start -d force-app --test-level RunLocalTests
```

---

## Production Deployment Patterns

### Pattern 1: Staged Deployment

```bash
# Step 1: Validate in production
sf project deploy validate -d force-app --target-org prod

# Step 2: Review validation results

# Step 3: Quick deploy if validation passed
sf project deploy quick --job-id <VALIDATION_JOB_ID> --target-org prod
```

### Pattern 2: With Test Execution

```bash
# Production requires test execution
sf project deploy start \
  -m "Layout:Account-Account Layout" \
  --target-org prod \
  --test-level RunLocalTests
```

### Pattern 3: Specific Test Classes

```bash
sf project deploy start \
  -d force-app/main/default/layouts \
  --target-org prod \
  --test-level RunSpecifiedTests \
  --tests AccountTriggerTest,ContactTriggerTest
```

---

## Deployment with Dependencies

### Common Layout Dependencies

Layouts may depend on:
- Custom fields
- Custom buttons (WebLinks)
- Quick Actions
- Related lists (object relationships)

### Deploy Layout with Field Dependencies

```bash
# If layout includes a new field, deploy field first
sf project deploy start -m "CustomField:Account.New_Field__c"

# Then deploy layout
sf project deploy start -m "Layout:Account-Account Layout"

# Or together (SF usually handles order)
sf project deploy start -m \
  "CustomField:Account.New_Field__c,Layout:Account-Account Layout"
```

### Using package.xml for Dependencies

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <!-- Fields first -->
    <types>
        <members>Account.Custom_Field__c</members>
        <name>CustomField</name>
    </types>
    <!-- Then layouts -->
    <types>
        <members>Account-Account Layout</members>
        <name>Layout</name>
    </types>
    <version>62.0</version>
</Package>
```

---

## FlexiPage (Lightning Page) Deployment

### Deploy FlexiPage with Activation

FlexiPages need to be activated after deployment. Include app assignments:

```bash
# Deploy FlexiPage
sf project deploy start -m "FlexiPage:Account_Record_Page"

# Also deploy CustomApplication if page is assigned to apps
sf project deploy start -m \
  "FlexiPage:Account_Record_Page,CustomApplication:Sales"
```

### FlexiPage Assignment in Metadata

Assignments can be included in the FlexiPage XML:

```xml
<FlexiPage>
    <flexiPageRegions>...</flexiPageRegions>
    <!-- Activation -->
    <type>RecordPage</type>
    <sobjectType>Account</sobjectType>
</FlexiPage>
```

Profile-specific assignments go in Profile metadata.

---

## Compact Layout Deployment

### Deploy Compact Layout

```bash
sf project deploy start -m "CompactLayout:Account.Account_Compact"
```

### Set as Default

Default compact layout is set in the CustomObject metadata:

```xml
<!-- In Account.object-meta.xml -->
<CustomObject>
    <compactLayoutAssignment>Account_Compact</compactLayoutAssignment>
</CustomObject>
```

Deploy the object to apply the default:

```bash
sf project deploy start -m \
  "CompactLayout:Account.Account_Compact,CustomObject:Account"
```

---

## Rollback Patterns

### Pattern 1: Backup Before Deploy

```bash
#!/bin/bash
# backup-and-deploy.sh

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups/${TIMESTAMP}"

# Backup current state
sf project retrieve start -m "Layout:Account-*" -d $BACKUP_DIR

# Deploy new layout
sf project deploy start -m "Layout:Account-Account Layout"

# If issues, rollback
# sf project deploy start -d $BACKUP_DIR
```

### Pattern 2: Version Control Rollback

```bash
# Revert to previous version
git checkout HEAD~1 -- force-app/main/default/layouts/Account-Account\ Layout.layout-meta.xml

# Deploy reverted version
sf project deploy start -m "Layout:Account-Account Layout"
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy Layouts
on:
  push:
    paths:
      - 'force-app/main/default/layouts/**'
      - 'force-app/main/default/flexipages/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install SF CLI
        run: npm install -g @salesforce/cli

      - name: Authenticate
        run: |
          echo "${{ secrets.SF_JWT_KEY }}" > server.key
          sf org login jwt \
            --client-id "${{ secrets.SF_CLIENT_ID }}" \
            --jwt-key-file server.key \
            --username "${{ secrets.SF_USERNAME }}" \
            --instance-url https://test.salesforce.com \
            --alias target

      - name: Validate
        run: |
          sf project deploy validate \
            -d force-app/main/default/layouts \
            -d force-app/main/default/flexipages \
            --target-org target

      - name: Deploy
        if: success()
        run: |
          sf project deploy start \
            -d force-app/main/default/layouts \
            -d force-app/main/default/flexipages \
            --target-org target
```

---

## Deployment Tips

### Check Deployment Status

```bash
# Watch deployment progress
sf project deploy report --job-id <JOB_ID>

# JSON output for scripting
sf project deploy start -m "Layout:Account-*" --json --wait 10
```

### Handling Large Deployments

```bash
# Increase timeout for large deployments
sf project deploy start -d force-app --wait 60

# Use async and poll
sf project deploy start -d force-app --async
sf project deploy report --job-id <JOB_ID>
```

### Target Different Orgs

```bash
# Deploy to sandbox
sf project deploy start -m "Layout:*" --target-org sandbox

# Deploy to production
sf project deploy start -m "Layout:*" --target-org prod --test-level RunLocalTests
```
