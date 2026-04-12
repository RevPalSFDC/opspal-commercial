# Report and Flow Quality Gates

Primary sources:
- `hooks/pre-deploy-report-quality-gate.sh`
- `hooks/pre-deploy-flow-validation.sh`

## Gates

- Block high-risk report/dashboard semantic issues.
- Validate flow XML patterns before deployment.

## Flow field reference validation — read vs write context

The flow field reference validator (`scripts/lib/flow-field-reference-validator.js`) now
distinguishes read-context field references from write-context references when checking
field permissions:

- **Write context** (`inputAssignments` in recordCreates/recordUpdates, `assignmentItems`):
  checked for `writable` (updateable/createable). Non-writable fields produce `PERMISSION_DENIED`.
- **Read context** (`filters`, `conditions`, `outputAssignments`, `queriedFields`):
  only checked for field existence. Formula fields, auto-number fields, and system fields
  used in Get Records or filter conditions no longer produce false `PERMISSION_DENIED` errors.

The `toExistenceOnlyResult()` method used by deploy hooks still blocks on `PERMISSION_DENIED`,
but these errors now only fire for genuine write-context violations.

Ref: https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_visual_workflow.htm
