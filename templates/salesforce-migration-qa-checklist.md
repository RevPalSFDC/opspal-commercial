# Salesforce Migration QA Checklist

## Pre-Migration Discovery Phase ✅

### Requirements Gathering (Prevents 20% of errors)
- [ ] **Identify Primary Objects**
  - [ ] Confirm source object (e.g., QuoteLineItem vs OpportunityLineItem)
  - [ ] Confirm target object relationships
  - [ ] Document object API names exactly as they appear in org
  
- [ ] **Field Mapping Verification**
  - [ ] List all source fields with data types
  - [ ] List all target fields with data types
  - [ ] Identify any data type mismatches
  - [ ] Document required field transformations

- [ ] **Business Logic Understanding**
  - [ ] Document existing automation (workflows, process builders, flows)
  - [ ] Identify trigger order dependencies
  - [ ] Map validation rule logic
  - [ ] Confirm rollup summary field impacts

## Pre-Deployment Validation ✅

### Field History Tracking (Critical - Deployment Blocker)
```bash
# Run before ANY deployment with field history changes
node scripts/sfdc-pre-deployment-validator.js [org-alias] [deployment-path]
```
- [ ] Check current tracked field count (max 20 per object)
- [ ] Verify new fields won't exceed limit
- [ ] Document which fields to untrack if needed

### Formula Syntax Validation (Prevents 40% of errors)
- [ ] **Picklist Formula Checks**
  - [ ] No ISBLANK() on picklist fields - use TEXT(field) = ""
  - [ ] No ISNULL() on picklist fields - use TEXT(field) = ""
  - [ ] Proper ISPICKVAL() usage for picklist comparisons

- [ ] **Cross-Object Formula Validation**
  - [ ] Verify all referenced fields exist
  - [ ] Check field accessibility across objects
  - [ ] Validate formula compile in target org

### Apex Code Validation
- [ ] **Syntax Verification**
  - [ ] All classes compile without errors
  - [ ] Test classes have proper assertions
  - [ ] No hardcoded IDs or environment-specific values

- [ ] **Governor Limit Checks**
  - [ ] SOQL queries in loops identified
  - [ ] DML operations in loops identified
  - [ ] Bulk processing patterns implemented

## Migration Execution ✅

### Data Migration Steps
- [ ] **Pre-Migration Backup**
  - [ ] Export current data to CSV
  - [ ] Document record counts
  - [ ] Save metadata backup

- [ ] **Migration Execution**
  - [ ] Run in sandbox first
  - [ ] Verify record counts match
  - [ ] Check data integrity
  - [ ] Validate automation triggers correctly

### Post-Migration Validation
- [ ] **Data Verification**
  ```sql
  -- Verify migration completion
  SELECT COUNT(Id), MIN(CreatedDate), MAX(CreatedDate) 
  FROM Target_Object__c 
  WHERE Migration_Flag__c = true
  ```
  
- [ ] **Automation Testing**
  - [ ] Create test record manually
  - [ ] Verify all automation fires
  - [ ] Check email alerts sent
  - [ ] Validate approval processes

## Error Recovery Procedures ✅

### Common Error Resolutions

#### Field History Tracking Limit Reached
1. Query current tracked fields:
   ```bash
   sf data query --query "SELECT Field FROM FieldHistory WHERE ParentId = 'ObjectId'" --use-tooling-api
   ```
2. Identify fields to untrack
3. Update object metadata
4. Redeploy

#### Picklist Formula Errors
1. Search for ISBLANK/ISNULL on picklists:
   ```bash
   grep -r "ISBLANK.*__c" force-app/
   ```
2. Replace with TEXT(field) = ""
3. Revalidate formulas

#### Apex Compilation Failures
1. Run local compilation check:
   ```bash
   sf project deploy start --check-only --source-dir force-app/main/default/classes
   ```
2. Fix compilation errors
3. Ensure 75% code coverage

## Sign-off Checklist ✅

### Technical Sign-off
- [ ] All validation checks passed
- [ ] Zero data loss confirmed
- [ ] Performance benchmarks met
- [ ] Security review completed

### Business Sign-off
- [ ] UAT completed successfully
- [ ] Business users trained
- [ ] Rollback plan documented
- [ ] Go-live date confirmed

### Post-Deployment Monitoring
- [ ] Error logs monitored for 24 hours
- [ ] Performance metrics tracked
- [ ] User feedback collected
- [ ] Issues documented and resolved

## Automation Script

```bash
#!/bin/bash
# Run complete pre-deployment validation

echo "🚀 Starting Salesforce Migration Pre-flight Checks..."

# 1. Run automated validator
node scripts/sfdc-pre-deployment-validator.js production .

# 2. Check code coverage
sf apex test run --code-coverage --result-format json

# 3. Validate metadata
sf project deploy validate --source-dir force-app

# 4. Check limits
sf limits api display

echo "✅ Pre-flight checks complete!"
```

## Lessons Learned Log

### From ProductIntegration to Subscription Migration
1. **Always check field history limits first** - This is a hard limit that will block deployment
2. **Never use ISBLANK on picklist fields** - Use TEXT(field) = "" instead
3. **Confirm object types with users** - QuoteLineItem vs OpportunityLineItem saved hours
4. **Run pre-deployment validation** - Would have caught 80% of our issues

### Best Practices
- Run validation in sandbox first
- Keep detailed logs of all changes
- Have rollback scripts ready
- Document every assumption
- Get user confirmation on object relationships

---
*Last Updated: Based on ProductIntegration to Subscription Migration Experience*
*Template Version: 1.0*