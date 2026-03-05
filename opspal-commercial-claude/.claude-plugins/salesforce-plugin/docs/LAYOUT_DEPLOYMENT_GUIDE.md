# Layout Deployment Guide

Comprehensive guide for deploying Salesforce layouts (FlexiPages, Classic Layouts, CompactLayouts) with validation, backup, profile assignments, and rollback capabilities.

**Last Updated:** 2025-12-12
**Version:** 1.0.0
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Deployment Workflow](#deployment-workflow)
4. [Using /deploy-layout Command](#using-deploy-layout-command)
5. [Profile Assignments](#profile-assignments)
6. [Backup and Rollback](#backup-and-rollback)
7. [Validation Checks](#validation-checks)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)
10. [Reference](#reference)

---

## Overview

### What This Guide Covers

This guide explains how to deploy Salesforce layouts using the automated deployment system introduced in v2.1.0:

- **Pre-deployment validation** - Catch errors before deployment
- **Automatic backup** - Create rollback points before changes
- **Deployment orchestration** - Deploy FlexiPages, Layouts, CompactLayouts
- **Profile assignments** - Assign layouts to profiles automatically
- **Post-deployment verification** - Confirm successful deployment
- **Rollback support** - Restore from backups if needed

### Components Involved

| Component | Purpose |
|-----------|---------|
| `sfdc-layout-deployer` agent | Orchestrates deployment workflow |
| `/deploy-layout` command | User-facing command interface |
| `layout-deployer.js` script | Programmatic deployment automation |
| `layout-cli-api-reference` skill | CLI/API command reference |

---

## Quick Start

### Deploy a Layout (5-Step Process)

```bash
# Step 1: Generate layout (if not already done)
/design-layout --object Account --persona sales-rep --org my-sandbox

# Step 2: Dry-run to validate
/deploy-layout --source instances/my-sandbox/generated-layouts/latest/ --org my-sandbox --dry-run

# Step 3: Review dry-run output
# Ensure all validations pass before proceeding

# Step 4: Deploy to sandbox
/deploy-layout --source instances/my-sandbox/generated-layouts/latest/ --org my-sandbox

# Step 5: Verify deployment
/deploy-layout --verify Account --org my-sandbox
```

### One-Liner for Experienced Users

```bash
# Deploy with backup, validation, and verification in one command
/deploy-layout --source ./layouts/ --org my-sandbox --verbose
```

---

## Deployment Workflow

### Standard Deployment Flow

```
1. Pre-Deployment Validation
   ├── XML syntax validation
   ├── Required elements check
   ├── Field reference validation
   └── API version compatibility

2. Create Backup (if production)
   ├── Retrieve existing layouts
   └── Store in timestamped backup directory

3. Deploy Metadata
   ├── sf project deploy start
   ├── Monitor deployment progress
   └── Capture success/failure

4. Update Profile Assignments (if specified)
   ├── Retrieve current profiles
   ├── Update layoutAssignments
   └── Deploy updated profiles

5. Post-Deployment Verification
   ├── Query org for deployed metadata
   └── Confirm layouts exist and are active

6. Report Results
   ├── Display deployment summary
   ├── List any errors/warnings
   └── Provide rollback instructions if needed
```

### Workflow Diagram

```
┌─────────────────┐
│ Layout Source   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Pre-Validation  │────▶│ Validation Pass │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │ Fail                  ▼
         ▼              ┌─────────────────┐
┌─────────────────┐     │ Create Backup   │
│ Report Errors   │     └────────┬────────┘
│ (Stop)          │              │
└─────────────────┘              ▼
                        ┌─────────────────┐
                        │ Deploy Metadata │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ Profile Assign  │ (optional)
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ Verify Deploy   │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ Report Success  │
                        └─────────────────┘
```

---

## Using /deploy-layout Command

### Basic Usage

```bash
# Standard deployment
/deploy-layout --source {path} --org {org-alias}

# Dry-run (validation only)
/deploy-layout --source {path} --org {org-alias} --dry-run

# Check-only deployment (validates in org but doesn't activate)
/deploy-layout --source {path} --org {org-alias} --check-only
```

### All Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--org` | Yes | Salesforce CLI org alias |
| `--source` | One of source/backup/rollback/verify required | Path to layout files |
| `--backup` | One of source/backup/rollback/verify required | Object name to backup |
| `--rollback` | One of source/backup/rollback/verify required | Backup path to restore |
| `--verify` | One of source/backup/rollback/verify required | Object name to verify |
| `--dry-run` | No | Validate without deploying |
| `--check-only` | No | Validate in org without activating |
| `--profiles` | No | Comma-separated profiles for assignment |
| `--record-types` | No | Record type-specific assignments |
| `--layout` | No | Layout name for profile assignment |
| `--ignore-warnings` | No | Continue despite warnings |
| `--verbose` | No | Show detailed output |

### Example Commands

```bash
# Deploy FlexiPages only
/deploy-layout --source ./flexipages/ --org my-sandbox

# Deploy with profile assignments
/deploy-layout --source ./layouts/ --org my-sandbox \
  --profiles "Sales User,Sales Manager" \
  --layout "Account-Sales Layout"

# Deploy with record type assignments
/deploy-layout --source ./layouts/ --org my-sandbox \
  --profiles "Sales User" \
  --layout "Account-Enterprise Layout" \
  --record-types "Account.Enterprise,Account.SMB"

# Create backup before any changes
/deploy-layout --backup Account --org production

# Verify deployment success
/deploy-layout --verify Account --org my-sandbox

# Rollback to previous version
/deploy-layout --rollback .backups/my-sandbox/Account_2025-12-12T10-00-00Z --org my-sandbox
```

---

## Profile Assignments

### Assigning Layouts to Profiles

Layouts can be assigned to profiles during deployment:

```bash
/deploy-layout --source ./layouts/ --org my-sandbox \
  --profiles "Sales User,Sales Manager" \
  --layout "Account-Sales Account Layout"
```

### How Profile Assignment Works

1. **Retrieve current profile**
   ```bash
   sf project retrieve start --metadata "Profile:Sales User" --target-org my-sandbox
   ```

2. **Update layoutAssignments in profile XML**
   ```xml
   <layoutAssignments>
       <layout>Account-Sales Account Layout</layout>
   </layoutAssignments>
   ```

3. **Deploy updated profile**
   ```bash
   sf project deploy start --source-dir ./profiles --target-org my-sandbox
   ```

### Record Type-Specific Assignments

For orgs with record types:

```bash
/deploy-layout --source ./layouts/ --org my-sandbox \
  --profiles "Sales User" \
  --layout "Account-Enterprise Account Layout" \
  --record-types "Account.Enterprise"
```

This creates:
```xml
<layoutAssignments>
    <layout>Account-Enterprise Account Layout</layout>
    <recordType>Account.Enterprise</recordType>
</layoutAssignments>
```

### Multiple Layout Assignments

Assign different layouts to different profiles in separate commands:

```bash
# Sales rep layout for sales users
/deploy-layout --source ./sales-rep-layouts/ --org my-sandbox \
  --profiles "Sales User,Inside Sales" \
  --layout "Opportunity-Sales Rep Layout"

# Manager layout for managers
/deploy-layout --source ./manager-layouts/ --org my-sandbox \
  --profiles "Sales Manager,VP Sales" \
  --layout "Opportunity-Sales Manager Layout"
```

---

## Backup and Rollback

### Creating Backups

Backups are automatically created for production deployments. For sandbox, create manually:

```bash
# Create backup before changes
/deploy-layout --backup Account --org my-sandbox
```

Backups are stored in: `.backups/{org-alias}/{Object}_{timestamp}/`

### Backup Contents

```
.backups/my-sandbox/Account_2025-12-12T10-00-00Z/
├── force-app/main/default/
│   ├── flexipages/
│   │   └── Account_Record_Page.flexipage-meta.xml
│   ├── layouts/
│   │   └── Account-Account Layout.layout-meta.xml
│   └── compactLayouts/
│       └── Account.Account_Compact.compactLayout-meta.xml
└── backup-manifest.json
```

### Rollback Procedure

1. **Identify available backups**
   ```bash
   node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/layout-deployer.js my-sandbox history
   ```

2. **Select backup to restore**
   ```
   Available backups:
   1. Account_2025-12-12T10-00-00Z
   2. Account_2025-12-11T14-30-00Z
   3. Account_2025-12-10T09-15-00Z
   ```

3. **Execute rollback**
   ```bash
   /deploy-layout --rollback .backups/my-sandbox/Account_2025-12-12T10-00-00Z --org my-sandbox
   ```

4. **Verify rollback**
   ```bash
   /deploy-layout --verify Account --org my-sandbox
   ```

### Automatic Rollback on Failure

If deployment fails mid-operation:

1. Deployment stops at first error
2. Error details are displayed
3. Rollback instructions are provided
4. Original backup remains available

---

## Validation Checks

### Pre-Deployment Validations

The deployer performs these checks before deployment:

| Check | Description | Failure Action |
|-------|-------------|----------------|
| XML Syntax | Well-formed XML | Block deployment |
| Required Elements | masterLabel, template, type | Block deployment |
| Field References | Record.FieldName format | Block deployment |
| API Version | v62.0 or higher | Warn (continue) |
| Component Names | Valid Salesforce components | Block deployment |
| Facet References | All referenced facets exist | Block deployment |

### Validation Output Example

```
🔍 Running pre-deployment validation...

✓ XML syntax valid
✓ Required elements present
✓ Field references valid
✓ API version: 62.0 ✓
✓ Component names valid
✓ Facet references valid

✓ Pre-deployment validation passed
  📦 FlexiPages: 2
  📦 Layouts: 3
  📦 CompactLayouts: 2
```

### Post-Deployment Verification

After deployment, the system queries the org to confirm:

```bash
# FlexiPages
sf data query --query "SELECT Id, DeveloperName FROM FlexiPage WHERE EntityDefinitionId = 'Account'" --use-tooling-api --target-org my-sandbox

# Compact Layouts
sf data query --query "SELECT Id, DeveloperName FROM CompactLayout WHERE SobjectType = 'Account'" --use-tooling-api --target-org my-sandbox
```

---

## Troubleshooting

### Common Errors

#### Error: "Field does not exist"

**Cause:** Layout references a field that doesn't exist in target org

**Solution:**
1. Create the missing field in target org first
2. OR remove the field reference from the layout
3. OR deploy to an org that has the field

```bash
# Check if field exists
sf sobject describe Account --target-org my-sandbox | grep "Custom_Field__c"
```

#### Error: "Profile not found"

**Cause:** Profile name doesn't match target org

**Solution:**
1. Use API name, not label
2. Verify profile exists in target org

```bash
# List profiles
sf data query --query "SELECT Name FROM Profile" --target-org my-sandbox
```

#### Error: "Invalid component"

**Cause:** Component requires feature not available in org

**Solution:**
1. Enable required feature (e.g., Path requires Sales Cloud)
2. OR remove component from layout
3. OR deploy to org with feature enabled

#### Error: "EACCES: permission denied"

**Cause:** Cannot write to backup or temp directory

**Solution:**
1. Check directory permissions
2. Run with appropriate user
3. Use `--verbose` to see exact path

```bash
chmod 755 .backups/
```

### Debug Mode

Enable verbose output for troubleshooting:

```bash
/deploy-layout --source ./layouts/ --org my-sandbox --verbose
```

Verbose output includes:
- Each validation step with timing
- Deployment progress (file by file)
- API responses
- Detailed error messages

---

## Best Practices

### Before Deployment

1. **Always dry-run first**
   ```bash
   /deploy-layout --source ./layouts/ --org my-sandbox --dry-run
   ```

2. **Create backup for production**
   ```bash
   /deploy-layout --backup Account --org production
   ```

3. **Test in sandbox first**
   - Deploy to sandbox
   - Test with actual users
   - Verify functionality
   - Then deploy to production

4. **Review generated files**
   - Check field references
   - Verify section organization
   - Confirm component placement

### During Deployment

1. **Monitor progress** - Watch for errors during deployment
2. **Check warnings** - Even successful deployments may have warnings
3. **Verify completion** - Don't assume success without confirmation

### After Deployment

1. **Run verification**
   ```bash
   /deploy-layout --verify Account --org my-sandbox
   ```

2. **Test with users** - Have actual users validate the layout

3. **Check profile assignments** - Verify correct profiles are assigned

4. **Document changes** - Record what was deployed and why

### Deployment Checklist

```markdown
## Pre-Deployment
- [ ] Generated layouts reviewed
- [ ] Dry-run passed
- [ ] Backup created (production)
- [ ] Test plan prepared

## Deployment
- [ ] Deploy to sandbox
- [ ] Verify in sandbox
- [ ] Test with users
- [ ] Deploy to production
- [ ] Verify in production

## Post-Deployment
- [ ] Profile assignments verified
- [ ] User acceptance confirmed
- [ ] Documentation updated
- [ ] Rollback plan documented
```

---

## Reference

### Related Documentation

- **Pattern Documentation**: `docs/LAYOUT_PATTERNS.md`
- **Example Layouts**: `docs/LAYOUT_EXAMPLES.md`
- **Skills**: `skills/layout-cli-api-reference/`
- **Agent**: `agents/sfdc-layout-deployer.md`
- **Command**: `commands/deploy-layout.md`
- **Script**: `scripts/lib/layout-deployer.js`

### CLI Commands Reference

```bash
# Retrieve FlexiPage
sf project retrieve start --metadata "FlexiPage:Account_Record_Page" --target-org {org}

# Deploy FlexiPage
sf project deploy start --metadata "FlexiPage:Account_Record_Page" --target-org {org}

# Deploy from source directory
sf project deploy start --source-dir ./force-app/main/default/flexipages --target-org {org}

# Query FlexiPages in org
sf data query --query "SELECT DeveloperName FROM FlexiPage WHERE EntityDefinitionId = 'Account'" --use-tooling-api --target-org {org}

# Query Compact Layouts
sf data query --query "SELECT DeveloperName FROM CompactLayout WHERE SobjectType = 'Account'" --use-tooling-api --target-org {org}
```

### Metadata Types

| Type | File Extension | Location |
|------|----------------|----------|
| FlexiPage | `.flexipage-meta.xml` | `force-app/main/default/flexipages/` |
| Layout | `.layout-meta.xml` | `force-app/main/default/layouts/` |
| CompactLayout | `.compactLayout-meta.xml` | `force-app/main/default/compactLayouts/` |
| Profile | `.profile-meta.xml` | `force-app/main/default/profiles/` |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Validation failed |
| 2 | Deployment failed |
| 3 | Verification failed |
| 4 | Rollback failed |
| 5 | Permission error |

---

## Version History

### v1.0.0 (2025-12-12)
- Initial release
- Pre-deployment validation
- Automatic backup creation
- Profile assignment automation
- Post-deployment verification
- Rollback support
- Integration with sfdc-layout-generator and sfdc-layout-analyzer

---

**Document Maintained By:** RevPal Salesforce Plugin Team
**Last Reviewed:** 2025-12-12
