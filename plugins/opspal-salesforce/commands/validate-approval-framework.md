---
description: Run pre-deployment validation for Salesforce custom approval frameworks
argument-hint: "[options]"
allowed-tools: Bash
---

Run pre-deployment validation for Salesforce custom approval frameworks.

Steps:
1. Identify the target Salesforce org alias from current instance configuration or user context
2. Run approval framework validation: `node scripts/lib/approval-framework-validator.js <org-alias>`
3. Display validation results to user
4. If exit code = 1 (critical issues):
   - Show error details
   - Recommend fixes from validator output
   - **BLOCK deployment** until issues resolved
5. If exit code = 2 (warnings):
   - Show warning details
   - Recommend review before deployment
6. If exit code = 0 (all passed):
   - Confirm framework ready for deployment
   - Suggest next step: `sf project deploy start --source-dir force-app/main/default --target-org <org-alias>`

Output should include:
- ✅/❌ Status for each validation check
- Specific issues found with rule names, objects, or fields
- Suggested fixes for each error
- Whether deployment should proceed

Refer to: templates/playbooks/salesforce-approval-framework-deployment/README.md for full deployment guide
