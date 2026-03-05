# Assignment Rules CLI Command Reference

**Version**: 1.0.0
**Last Updated**: 2025-12-15

## Overview

This document provides a comprehensive reference for all CLI commands related to Salesforce Assignment Rules operations, including Salesforce CLI commands, custom scripts, and agent operations.

---

## Quick Reference

| Operation | Command | Category |
|-----------|---------|----------|
| Query rules | `sf data query --query "SELECT ..."` | Discovery |
| Retrieve metadata | `sf project retrieve start --metadata AssignmentRules:Lead` | Discovery |
| Parse rule XML | `node assignment-rule-parser.js <file>` | Analysis |
| Validate assignees | `node assignee-validator.js batch-validate ...` | Validation |
| Detect conflicts | `node assignment-rule-overlap-detector.js detect ...` | Validation |
| Simulate routing | `node criteria-evaluator.js <xml> <json>` | Testing |
| Pre-deployment validation | `node validators/assignment-rule-validator.js validate ...` | Validation |
| Deploy rule | `sf project deploy start --metadata-dir ...` | Deployment |
| Deploy (script) | `node assignment-rule-deployer.js deploy ...` | Deployment |
| Activate rule | `node assignment-rule-deployer.js activate ...` | Deployment |

---

## Discovery Commands

### Query Assignment Rules

**List all Lead assignment rules:**
```bash
sf data query \
  --query "SELECT Id, Name, Active FROM AssignmentRule WHERE SobjectType = 'Lead'" \
  --target-org <org-alias>
```

**List all Case assignment rules:**
```bash
sf data query \
  --query "SELECT Id, Name, Active FROM AssignmentRule WHERE SobjectType = 'Case'" \
  --target-org <org-alias>
```

**Query specific rule by ID (requires Tooling API):**
```bash
sf data query \
  --query "SELECT Id, Name, Active, SobjectType FROM AssignmentRule WHERE Id = '01Q...'" \
  --use-tooling-api \
  --target-org <org-alias>
```

**List all assignment rules (all objects):**
```bash
sf data query \
  --query "SELECT Id, Name, Active, SobjectType FROM AssignmentRule ORDER BY SobjectType, Name" \
  --use-tooling-api \
  --target-org <org-alias>
```

**Find active rules only:**
```bash
sf data query \
  --query "SELECT Id, Name, SobjectType FROM AssignmentRule WHERE Active = true" \
  --use-tooling-api \
  --target-org <org-alias>
```

---

### Retrieve Metadata

**Retrieve Lead assignment rules:**
```bash
sf project retrieve start \
  --metadata AssignmentRules:Lead \
  --target-org <org-alias>
```

**Retrieve Case assignment rules:**
```bash
sf project retrieve start \
  --metadata AssignmentRules:Case \
  --target-org <org-alias>
```

**Retrieve all assignment rules:**
```bash
sf project retrieve start \
  --metadata AssignmentRules \
  --target-org <org-alias>
```

**Retrieve to specific directory:**
```bash
sf project retrieve start \
  --metadata AssignmentRules:Lead \
  --output-dir ./rules \
  --target-org <org-alias>
```

**Retrieve with package.xml:**
```xml
<!-- package.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>Lead</members>
        <members>Case</members>
        <name>AssignmentRules</name>
    </types>
    <version>62.0</version>
</Package>
```

```bash
sf project retrieve start \
  --manifest package.xml \
  --target-org <org-alias>
```

---

## Analysis Commands

### Parse Rule XML

**Parse assignment rule metadata:**
```bash
node scripts/lib/assignment-rule-parser.js \
  force-app/main/default/assignmentRules/Lead.assignmentRules-meta.xml
```

**Output:**
```
Object: Lead
Rules: 1

Rule: Lead_Assignment_Healthcare_CA (Active)
  Entries: 4
  Entry 1: 2 criteria → 00G1234567890ABC (Queue)
  Entry 2: 1 criteria → 00G2345678901BCD (Queue)
  Entry 3: 1 criteria → 00G3456789012CDE (Queue)
  Entry 4: 0 criteria → 00G4567890123DEF (Queue)
```

**Parse with JSON output:**
```bash
node scripts/lib/assignment-rule-parser.js \
  Lead.assignmentRules-meta.xml \
  --output json > parsed-rule.json
```

**Parse and extract criteria only:**
```bash
node scripts/lib/assignment-rule-parser.js \
  Lead.assignmentRules-meta.xml \
  --extract-criteria
```

---

### Query Assignees

**Query user by ID:**
```bash
sf data query \
  --query "SELECT Id, Name, IsActive, Email FROM User WHERE Id = '005...'" \
  --target-org <org-alias>
```

**Query queue by ID:**
```bash
sf data query \
  --query "SELECT Id, DeveloperName, Type, Name FROM Group WHERE Id = '00G...' AND Type = 'Queue'" \
  --target-org <org-alias>
```

**Query queue members:**
```bash
sf data query \
  --query "SELECT UserOrGroupId, User.Name FROM GroupMember WHERE GroupId = '00G...'" \
  --target-org <org-alias>
```

**Query role by ID:**
```bash
sf data query \
  --query "SELECT Id, Name, ParentRoleId FROM UserRole WHERE Id = '00E...'" \
  --target-org <org-alias>
```

**Query territory by ID:**
```bash
sf data query \
  --query "SELECT Id, DeveloperName, Territory2ModelId FROM Territory2 WHERE Id = '0TM...'" \
  --target-org <org-alias>
```

---

## Validation Commands

### Validate Assignees

**Validate single user:**
```bash
node scripts/lib/assignee-validator.js validate-user \
  --user-id "005..." \
  --org <org-alias>
```

**Validate queue:**
```bash
node scripts/lib/assignee-validator.js validate-queue \
  --queue-id "00G..." \
  --org <org-alias>
```

**Validate role:**
```bash
node scripts/lib/assignee-validator.js validate-role \
  --role-id "00E..." \
  --org <org-alias>
```

**Batch validate multiple assignees:**
```bash
node scripts/lib/assignee-validator.js batch-validate \
  --assignees "00G1234567890ABC,00G2345678901BCD,005..." \
  --org <org-alias>
```

**Output:**
```
Validating 3 assignees...

✓ 00G1234567890ABC (Queue): Healthcare_CA_Queue - Valid
✓ 00G2345678901BCD (Queue): General_CA_Queue - Valid
✓ 0051234567890ABC (User): John Doe (Active) - Valid

Summary: 3/3 valid (100%)
```

**Validate with access check:**
```bash
node scripts/lib/assignee-validator.js batch-validate \
  --assignees "00G...,005..." \
  --check-access \
  --object Lead \
  --org <org-alias>
```

---

### Detect Conflicts

**Detect overlapping criteria:**
```bash
node scripts/lib/assignment-rule-overlap-detector.js detect \
  --rule-file rule-design.json
```

**Detect all conflict types:**
```bash
node scripts/lib/assignment-rule-overlap-detector.js detect \
  --rule-file rule-design.json \
  --check-all
```

**Detect circular routing:**
```bash
node scripts/lib/assignment-rule-overlap-detector.js detect-circular \
  --rule-file rule-design.json \
  --queues queues.json \
  --user-forwarding forwarding.json
```

**Generate conflict report:**
```bash
node scripts/lib/assignment-rule-overlap-detector.js report \
  --rule-file rule-design.json \
  --output conflict-report.json
```

**Output:**
```
=== Conflict Detection Report ===

Total Conflicts: 2
  - Critical: 1
  - High: 0
  - Medium: 1
  - Low: 0

Critical Conflicts:
1. Overlapping Criteria (Entry 2 vs Entry 1)
   Risk Score: 85
   Resolution: Reorder entries - Entry 1 (more specific) should come before Entry 2

Medium Conflicts:
1. Partial Overlap (Entry 3 vs Entry 4)
   Risk Score: 40
   Resolution: Review - may be intentional

Overall Risk Score: 62.5 (HIGH)
```

---

### Simulate Routing

**Simulate with sample records:**
```bash
node scripts/lib/criteria-evaluator.js \
  Lead.assignmentRules-meta.xml \
  sample-leads.json
```

**sample-leads.json format:**
```json
[
  {
    "Industry": "Healthcare",
    "State": "CA"
  },
  {
    "Industry": "Technology",
    "State": "NY"
  },
  {
    "Industry": "Manufacturing",
    "State": "TX"
  }
]
```

**Output:**
```
=== Assignment Rule Simulation ===

Rule: Lead_Assignment_Healthcare_CA (Active)
Object: Lead
Entries: 4

Total Records: 3
Assigned: 3
Unassigned: 0

Assignment Breakdown:
  00G1234567890ABC: 1 records
  00G2345678901BCD: 1 records
  00G4567890123DEF: 1 records

Sample Results (first 3 of 3):
  Record 0: Matched entry 1 → 00G1234567890ABC
  Record 1: Matched entry 4 → 00G4567890123DEF
  Record 2: Matched entry 4 → 00G4567890123DEF
```

---

### Pre-Deployment Validation

**Run 20-point validation:**
```bash
node scripts/lib/validators/assignment-rule-validator.js validate \
  --rule-file rule-design.json \
  --org <org-alias>
```

**Validate specific rule entry:**
```bash
node scripts/lib/validators/assignment-rule-validator.js validate-entry \
  --rule-file rule-design.json \
  --entry 1 \
  --org <org-alias>
```

**Generate validation report:**
```bash
node scripts/lib/validators/assignment-rule-validator.js validate \
  --rule-file rule-design.json \
  --org <org-alias> \
  --output validation-report.json
```

**Output:**
```
=== Pre-Deployment Validation ===

Checking 20 validation points...

✓ 1. Assignee existence
✓ 2. Assignee active status
✓ 3. Field existence on object
✓ 4. Field type vs operator compatibility
✓ 5. Picklist value validity
✗ 6. Formula syntax (N/A)
✓ 7. Multi-select picklist syntax
✓ 8. Currency field handling
✓ 9. Relationship field resolution
✓ 10. Active rule conflict
✓ 11. Rule order conflicts
⚠ 12. Assignee object access permissions (1 warning)
✓ 13. Email template existence
✓ 14. Object supports assignment rules
✓ 15. Rule entry limit
✓ 16. Rule name uniqueness
✓ 17. Circular routing detection
✓ 18. Conflicting automation
✓ 19. Field history tracking limit
✓ 20. API version compatibility

Summary:
  Passed: 18/20
  Warnings: 1
  Critical Errors: 0

Status: READY FOR DEPLOYMENT
Recommendation: Review warnings before deploying
```

---

### Access Validation

**Check user object access:**
```bash
node scripts/lib/validators/assignee-access-validator.js check-user-access \
  --user-id "005..." \
  --object Lead \
  --org <org-alias>
```

**Check queue object access:**
```bash
node scripts/lib/validators/assignee-access-validator.js check-queue-access \
  --queue-id "00G..." \
  --object Lead \
  --org <org-alias>
```

**Audit access levels for entire rule:**
```bash
node scripts/lib/validators/assignee-access-validator.js audit-access-levels \
  --rule-file rule-design.json \
  --org <org-alias>
```

**Output:**
```
=== Access Level Audit ===

Entry 1: Healthcare CA Queue (00G1234567890ABC)
  Queue Members: 5
  Access Level: Edit ✓
  Members with access: 5/5 (100%)

Entry 2: General CA Queue (00G2345678901BCD)
  Queue Members: 8
  Access Level: Edit ✓
  Members with access: 8/8 (100%)

Entry 3: Default Queue (00G3456789012CDE)
  Queue Members: 3
  Access Level: Edit ✓
  Members with access: 3/3 (100%)

Summary: All assignees have required access (Edit)
```

---

## Deployment Commands

### Deploy via Salesforce CLI

**Deploy assignment rules:**
```bash
sf project deploy start \
  --metadata-dir force-app/main/default/assignmentRules \
  --target-org <org-alias>
```

**Dry-run (validate only):**
```bash
sf project deploy start \
  --metadata-dir force-app/main/default/assignmentRules \
  --target-org <org-alias> \
  --dry-run
```

**Deploy with specific manifest:**
```bash
sf project deploy start \
  --manifest package.xml \
  --target-org <org-alias>
```

**Deploy and run tests (production):**
```bash
sf project deploy start \
  --metadata-dir force-app/main/default/assignmentRules \
  --target-org <org-alias> \
  --test-level RunLocalTests
```

**Check deployment status:**
```bash
sf project deploy report \
  --job-id <deployment-id> \
  --target-org <org-alias>
```

---

### Deploy via Script

**Deploy rule:**
```bash
node scripts/lib/assignment-rule-deployer.js deploy \
  --rule-xml force-app/main/default/assignmentRules/Lead.assignmentRules-meta.xml \
  --org <org-alias>
```

**Deploy with validation only:**
```bash
node scripts/lib/assignment-rule-deployer.js deploy \
  --rule-xml Lead.assignmentRules-meta.xml \
  --org <org-alias> \
  --validate-only
```

**Deploy to multiple orgs:**
```bash
for org in sandbox-alias prod-alias; do
  node scripts/lib/assignment-rule-deployer.js deploy \
    --rule-xml Lead.assignmentRules-meta.xml \
    --org $org
done
```

---

### Activation Commands

**Activate rule:**
```bash
node scripts/lib/assignment-rule-deployer.js activate \
  --rule-name "Lead_Assignment_Healthcare_CA" \
  --object Lead \
  --org <org-alias>
```

**What activation does:**
1. Query current active rule (if any)
2. Deactivate current active rule
3. Activate specified rule
4. Verify activation

**Deactivate rule:**
```bash
node scripts/lib/assignment-rule-deployer.js deactivate \
  --rule-name "Lead_Assignment_Healthcare_CA" \
  --object Lead \
  --org <org-alias>
```

---

### Backup & Restore

**Backup current rules:**
```bash
node scripts/lib/assignment-rule-deployer.js backup \
  --object Lead \
  --org <org-alias> \
  --output backups/Lead-$(date +%Y%m%d).xml
```

**Restore from backup:**
```bash
node scripts/lib/assignment-rule-deployer.js restore \
  --backup-file backups/Lead-20251215.xml \
  --org <org-alias>
```

**Alternative manual backup:**
```bash
sf project retrieve start \
  --metadata AssignmentRules:Lead \
  --target-org <org-alias>

cp force-app/main/default/assignmentRules/Lead.assignmentRules-meta.xml \
   backups/Lead-backup-$(date +%Y%m%d).xml
```

---

## Testing Commands

### Create Test Records

**Create test lead with assignment rule (Apex):**
```apex
Lead lead = new Lead(
    FirstName = 'Test',
    LastName = 'User',
    Company = 'TestCo',
    Industry = 'Healthcare',
    State = 'CA'
);

Database.DMLOptions dmlOpts = new Database.DMLOptions();
dmlOpts.assignmentRuleHeader.useDefaultRule = true;
lead.setOptions(dmlOpts);

insert lead;

System.debug('Owner: ' + [SELECT OwnerId FROM Lead WHERE Id = :lead.Id].OwnerId);
```

**Execute via Salesforce CLI:**
```bash
echo "Lead lead = new Lead(FirstName='Test', LastName='User', Company='TestCo', Industry='Healthcare', State='CA');
Database.DMLOptions dmlOpts = new Database.DMLOptions();
dmlOpts.assignmentRuleHeader.useDefaultRule = true;
lead.setOptions(dmlOpts);
insert lead;
System.debug('Owner: ' + [SELECT OwnerId FROM Lead WHERE Id = :lead.Id].OwnerId);" \
| sf apex run --file /dev/stdin --target-org <org-alias>
```

---

### Query Test Results

**Query test lead owner:**
```bash
sf data query \
  --query "SELECT Id, FirstName, LastName, OwnerId, Owner.Name FROM Lead WHERE LastName = 'Test*' ORDER BY CreatedDate DESC LIMIT 10" \
  --target-org <org-alias>
```

**Verify correct assignment:**
```bash
sf data query \
  --query "SELECT Id, FirstName, LastName, Industry, State, OwnerId, Owner.Name FROM Lead WHERE LastName = 'TestUser'" \
  --target-org <org-alias>
```

---

### Debug Logging

**Enable debug logs:**
```bash
sf apex log get --number 5 --target-org <org-alias>
```

**Search for assignment rule execution:**
```bash
sf apex log get --number 5 --target-org <org-alias> | grep "AssignmentRule"
```

---

## Utility Commands

### Build XML from JSON

**Generate XML from rule design:**
```bash
node scripts/lib/assignment-rule-deployer.js build-xml \
  --design rule-design.json \
  --output force-app/main/default/assignmentRules/Lead.assignmentRules-meta.xml
```

---

### Apply Template

**Apply template from library:**
```bash
node scripts/lib/assignment-rule-deployer.js apply-template \
  --template lead-industry-geography \
  --config template-config.json \
  --output force-app/main/default/assignmentRules/Lead.assignmentRules-meta.xml
```

**template-config.json format:**
```json
{
  "Healthcare_CA_Queue": "00G1234567890ABC",
  "Technology_NY_Queue": "00G2345678901BCD",
  "General_CA_Queue": "00G3456789012CDE",
  "Default_Queue": "00G4567890123DEF"
}
```

---

### Delete Rule

**Delete assignment rule:**
```bash
node scripts/lib/assignment-rule-deployer.js delete \
  --rule-id "01Q..." \
  --org <org-alias>
```

**Note**: Deleting via Metadata API requires removing the rule from the XML and deploying. The above command handles this automatically.

---

## Advanced Commands

### Cross-Org Comparison

**Compare rules between orgs:**
```bash
# Retrieve from both orgs
sf project retrieve start --metadata AssignmentRules:Lead --target-org sandbox-alias --output-dir ./sandbox
sf project retrieve start --metadata AssignmentRules:Lead --target-org prod-alias --output-dir ./prod

# Compare files
diff ./sandbox/force-app/main/default/assignmentRules/Lead.assignmentRules-meta.xml \
     ./prod/force-app/main/default/assignmentRules/Lead.assignmentRules-meta.xml
```

---

### Generate Documentation

**Generate rule documentation:**
```bash
node scripts/lib/assignment-rule-parser.js \
  Lead.assignmentRules-meta.xml \
  --generate-docs \
  --output docs/Lead-Assignment-Rules.md
```

---

### Statistics & Analysis

**Analyze rule complexity:**
```bash
node scripts/lib/assignment-rule-overlap-detector.js analyze \
  --rule-file rule-design.json \
  --complexity
```

**Output:**
```
=== Rule Complexity Analysis ===

Total Entries: 4
Total Criteria Items: 6
Average Criteria per Entry: 1.5
Max Criteria in Entry: 2
Fields Used: 2 (Industry, State)
Operators Used: 1 (equals)

Complexity Score: 3/10 (Simple)
```

---

## Cheat Sheets

### Quick Deployment Workflow

```bash
# 1. Discovery
sf data query --query "SELECT Id, Name, Active FROM AssignmentRule WHERE SobjectType = 'Lead'" --target-org <org>

# 2. Retrieve current rule
sf project retrieve start --metadata AssignmentRules:Lead --target-org <org>

# 3. Backup
cp force-app/main/default/assignmentRules/Lead.assignmentRules-meta.xml backups/Lead-$(date +%Y%m%d).xml

# 4. Validate design
node scripts/lib/validators/assignment-rule-validator.js validate --rule-file rule-design.json --org <org>

# 5. Simulate
node scripts/lib/criteria-evaluator.js rule-design.xml sample-leads.json

# 6. Deploy to sandbox
sf project deploy start --metadata-dir force-app --target-org sandbox-alias --dry-run
sf project deploy start --metadata-dir force-app --target-org sandbox-alias

# 7. Test in sandbox
# (Create test records, verify routing)

# 8. Deploy to production
sf project deploy start --metadata-dir force-app --target-org prod-alias

# 9. Activate
node scripts/lib/assignment-rule-deployer.js activate --rule-name "..." --object Lead --org prod-alias
```

---

### Quick Troubleshooting

```bash
# Check if rule is active
sf data query --query "SELECT Id, Name, Active FROM AssignmentRule WHERE SobjectType = 'Lead'" --target-org <org>

# Verify assignee exists and is active
sf data query --query "SELECT Id, Name, IsActive FROM User WHERE Id = '005...'" --target-org <org>

# Check queue
sf data query --query "SELECT Id, DeveloperName, Type FROM Group WHERE Id = '00G...'" --target-org <org>

# Query queue members
sf data query --query "SELECT UserOrGroupId, User.Name FROM GroupMember WHERE GroupId = '00G...'" --target-org <org>

# Check lead owner
sf data query --query "SELECT Id, OwnerId, Owner.Name FROM Lead WHERE Id = '00Q...'" --target-org <org>

# Review debug logs
sf apex log get --number 5 --target-org <org> | grep "AssignmentRule"
```

---

## Environment Variables

**Set default org:**
```bash
export SF_ORG_ALIAS=<org-alias>
```

**Set script paths:**
```bash
export SFDC_SCRIPTS="$HOME/scripts/salesforce-plugin/scripts/lib"
```

**Use in commands:**
```bash
node $SFDC_SCRIPTS/assignment-rule-parser.js Lead.assignmentRules-meta.xml
```

---

## Error Codes

| Exit Code | Meaning |
|-----------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Validation failure |
| 3 | Deployment failure |
| 4 | Assignee not found |
| 5 | File not found |
| 6 | Permission denied |
| 7 | Conflict detected |

---

## Best Practices

1. **Always backup before deployment**
   ```bash
   cp Lead.assignmentRules-meta.xml backups/Lead-$(date +%Y%m%d).xml
   ```

2. **Test in sandbox first**
   ```bash
   sf project deploy start --metadata-dir force-app --target-org sandbox-alias
   ```

3. **Use dry-run for validation**
   ```bash
   sf project deploy start --metadata-dir force-app --dry-run --target-org <org>
   ```

4. **Validate assignees before deployment**
   ```bash
   node scripts/lib/assignee-validator.js batch-validate --assignees "..." --org <org>
   ```

5. **Run conflict detection**
   ```bash
   node scripts/lib/assignment-rule-overlap-detector.js detect --rule-file rule-design.json
   ```

6. **Monitor after deployment**
   ```bash
   sf data query --query "SELECT COUNT() FROM Lead WHERE OwnerId = NULL AND CreatedDate = TODAY" --target-org <org>
   ```

---

## Additional Resources

- **SKILL.md**: Complete 7-phase methodology
- **conflict-detection-rules.md**: 8 conflict patterns
- **template-library.json**: Pre-built templates
- **assignment-rule-parser.js**: Script documentation
- **assignee-validator.js**: Validator documentation

---

**Version**: 1.0.0
**Last Updated**: 2025-12-15
**Maintained By**: RevPal Engineering
