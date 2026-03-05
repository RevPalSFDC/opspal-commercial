# Rollback Procedures

## Pre-Deployment Backup Requirements

**MANDATORY:** Always create backup before ANY deployment.

```bash
# Create timestamped backup
sf project retrieve start --manifest package.xml --target-org <org>
cp -r force-app "backups/force-app-$(date +%Y%m%d-%H%M%S)"

# Store deployment context
echo "{
  \"timestamp\": \"$(date -Iseconds)\",
  \"org\": \"$ORG_ALIAS\",
  \"manifest\": \"package.xml\",
  \"deployer\": \"$USER\"
}" > backups/deployment-context.json
```

## Rollback Types

### 1. Cancel In-Progress Deployment

**Use when:** Deployment is still running and you need to stop it

```bash
# Cancel by job ID
sf project deploy cancel --job-id <job-id>

# Verify cancellation
sf project deploy report --job-id <job-id>
```

**Note:** Partial changes may have been applied - verify org state

### 2. Quick Deploy Rollback

**Use when:** Last successful deployment was the previous state

```bash
# Get last successful deployment ID
sf project deploy report --target-org <org> | grep "Successful"

# Quick deploy previous state (if validation still cached)
sf project deploy quick --job-id <previous-validation-id>
```

### 3. Full Package Rollback

**Use when:** Need to restore from backup package

```bash
# Retrieve current state (for safety)
sf project retrieve start --manifest package.xml --target-org <org>

# Deploy backup package
sf project deploy start \
  --source-dir backups/force-app-YYYYMMDD-HHMMSS \
  --target-org <org>

# Verify rollback
sf project deploy report --job-id <rollback-job-id>
```

### 4. Metadata-Specific Rollback

**Use when:** Only specific metadata needs to be reverted

```javascript
async function rollbackSpecificMetadata(metadataList, backupPath, orgAlias) {
  // Create rollback package.xml
  const packageXml = generatePackageXml(metadataList);
  fs.writeFileSync('rollback-package.xml', packageXml);

  // Copy specific files from backup
  for (const item of metadataList) {
    const backupFile = path.join(backupPath, item);
    const targetFile = path.join('force-app/main/default', item);
    fs.copyFileSync(backupFile, targetFile);
  }

  // Deploy rollback
  await exec(`sf project deploy start --manifest rollback-package.xml --target-org ${orgAlias}`);
}

// Usage
await rollbackSpecificMetadata([
  'flows/AccountValidation.flow-meta.xml',
  'objects/Account/fields/Status__c.field-meta.xml'
], 'backups/force-app-20251027-143000', 'production');
```

### 5. Flow Version Rollback

**Use when:** Need to revert to previous Flow version

```bash
# List Flow versions
sf data query --query "SELECT VersionNumber, Status, DeveloperName
  FROM FlowVersionView WHERE DeveloperName = 'Account_Validation'
  ORDER BY VersionNumber DESC" --use-tooling-api

# Activate previous version
sf data update record --sobject FlowDefinition \
  --record-id <flowDefinitionId> \
  --values "ActiveVersion=<previous-version-id>"
```

## Rollback Decision Matrix

| Scenario | Method | Risk | Time |
|----------|--------|------|------|
| In-progress deployment | Cancel | Low | Seconds |
| Just deployed (< 2 hours) | Quick deploy | Low | Minutes |
| Recent deployment (< 24 hours) | Package rollback | Medium | 10-30 min |
| Older deployment | Metadata-specific | Medium | 30-60 min |
| Flow issues only | Version rollback | Low | Minutes |
| Unknown state | Full retrieve + compare | High | 1-2 hours |

## Rollback Verification

After ANY rollback, verify:

```bash
# 1. Check deployment status
sf project deploy report --job-id <rollback-job-id>

# 2. Verify specific metadata
sf data query --query "SELECT DeveloperName, VersionNumber
  FROM FlowVersionView WHERE DeveloperName = '<FlowName>'" --use-tooling-api

# 3. Run smoke test
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/post-deployment-state-verifier.js <org> <type> <name>

# 4. Check for errors in debug logs
sf apex tail log --target-org <org> --skip-trace-flag
```

## Emergency Rollback Procedure

**For production outages:**

1. **STOP** - Don't make additional changes
2. **ASSESS** - Identify what broke
3. **COMMUNICATE** - Notify stakeholders
4. **ROLLBACK** - Use appropriate method
5. **VERIFY** - Confirm system is stable
6. **DOCUMENT** - Record incident details

```bash
#!/bin/bash
# Emergency rollback script

echo "🚨 EMERGENCY ROLLBACK INITIATED"
echo "Timestamp: $(date -Iseconds)"

# Cancel any in-progress deployments
sf project deploy cancel --target-org production 2>/dev/null || true

# Deploy last known good state
BACKUP_DIR=$(ls -td backups/force-app-* | head -1)
echo "Rolling back to: $BACKUP_DIR"

sf project deploy start \
  --source-dir "$BACKUP_DIR" \
  --target-org production \
  --wait 30

# Verify
sf project deploy report

echo "✅ Rollback complete - verify system functionality"
```

## Rollback Documentation Template

```markdown
# Rollback Report

**Date:** YYYY-MM-DD HH:MM
**Initiated By:** [Name]
**Environment:** [Org Alias]

## Reason for Rollback
[Brief description of issue that triggered rollback]

## Pre-Rollback State
- Deployment Job ID: [id]
- Deployed At: [timestamp]
- Metadata Changed: [count]

## Rollback Method Used
[Cancel/Quick Deploy/Package/Metadata-Specific/Flow Version]

## Rollback Details
- Rollback Job ID: [id]
- Backup Source: [path]
- Duration: [minutes]

## Post-Rollback Verification
- [ ] Deployment report shows success
- [ ] Key functionality tested
- [ ] No new errors in logs
- [ ] Stakeholders notified

## Root Cause (if known)
[Description]

## Prevention Measures
[What will prevent this in future]
```
