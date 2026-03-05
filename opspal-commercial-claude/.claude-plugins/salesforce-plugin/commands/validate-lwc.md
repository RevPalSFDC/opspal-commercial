---
description: Run pre-deployment validation for Lightning Web Components (LWC)
allowed-tools: Bash
---

Run pre-deployment validation for Lightning Web Components (LWC) to prevent field reference errors, null safety issues, and deployment failures.

Steps:
1. Determine LWC component path from user input or current context
   - If user provides component name: use `force-app/main/default/lwc/<component-name>`
   - If user provides path: use as-is
   - If no input: validate all components in `force-app/main/default/lwc/`

2. Identify target Salesforce org alias from current instance configuration or ask user

3. Run LWC validation: `node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/lwc-apex-field-validator.js <component-path> [apex-class-path]`

4. Display validation results with clear formatting:
   - 📄 Template file being validated
   - 🔗 Apex class detected
   - ✅ Fields validated successfully
   - ❌ Missing fields in Apex query
   - ⚠️ Null-unsafe relationship fields

5. If exit code = 1 (validation errors):
   - Show all field mismatch errors
   - Display suggested fixes (add fields to Apex SOQL query)
   - **BLOCK deployment** until errors fixed
   - Reference: docs/NULL_SAFETY_PATTERNS.md for solutions

6. If warnings exist (null-unsafe fields):
   - Show relationship fields that need conditional rendering
   - Suggest wrapping in `<template if:true={}>`
   - Reference: docs/NULL_SAFETY_PATTERNS.md for patterns
   - Recommend review but allow deployment

7. If exit code = 0 (all passed):
   - Confirm component ready for deployment
   - Remind about cache clearing requirement
   - Suggest next step: `sf project deploy start --source-dir force-app/main/default/lwc/<component-name> --target-org <org-alias>`

8. For comprehensive validation, optionally run:
   - `node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/unified-syntax-validator.js --type lwc --path <component-path> --org <org-alias>`

Output should include:
- ✅/❌ Status for each validation check
- Specific fields missing from Apex queries
- Relationship fields requiring null safety checks
- Suggested code fixes with examples
- Cache clearing reminder (Ctrl+Shift+R after deployment)
- Whether deployment should proceed

**Common Issues Detected**:
- Field referenced in template but not in Apex SOQL query
- Relationship field access without null check (e.g., `request.Rule__r.Field__c`)
- Computed properties (false positives - can be ignored)

**Post-Validation Actions**:
If errors found:
1. Update Apex class to include missing fields in SELECT clause
2. Add conditional rendering for relationship fields
3. Re-run validation to confirm fixes
4. Proceed with deployment

Refer to:
- docs/LWC_DEPLOYMENT_CHECKLIST.md for complete deployment guide
- docs/NULL_SAFETY_PATTERNS.md for null safety patterns
- scripts/lib/lwc-apex-field-validator.js for validator details
