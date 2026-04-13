---
name: salesforce-permission-propagation-and-field-readiness-framework
description: Manage hook workflows for permission sync and post-field-deployment readiness validation.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Permission Propagation and Field Readiness

## When to Use This Skill

Use this skill when:
- A new custom field is deployed but not yet visible (missing FLS in permission sets/profiles)
- Automating FLS grants after field deployment so downstream Flows/reports can access the field
- Verifying that permission propagation completed before data operations begin
- Building hooks that check field readiness after schema deployments

**Not for**: Permission set creation (use `sfdc-permission-orchestrator` agent), security model design (use `security-governance-framework`), or general deployment (use `deployment-state-management-framework`).

## Field Readiness Checklist

After deploying a new custom field, verify:

| Check | Query | Pass Criteria |
|-------|-------|---------------|
| Field exists | `SELECT QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '<Object>' AND QualifiedApiName = '<Field>'` (Tooling API) | Field found |
| FLS granted | `SELECT Field, PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE SobjectType = '<Object>' AND Field = '<Object>.<Field>'` | Read=true for required profiles |
| Layout visible | Check FlexiPage or Layout XML for field reference | Field present on relevant layout |
| Report accessible | Test report column with the field | No "field not found" error |

## Propagation Pattern

```
Deploy Field → Grant FLS (Permission Set) → Add to Layout → Verify Readiness
```

FLS must be propagated to ALL permission sets and profiles that need the field. A field deployed without FLS is invisible to users and agents querying via the REST API in user mode.

## Retry Logic

Permission propagation can take up to 60 seconds after deployment. Hooks should:
1. Wait briefly (5s) after field deployment
2. Query for field existence
3. If not found, retry up to 3 times with 10s backoff
4. Only proceed with data operations after field is confirmed accessible

## Routing Boundaries

Use this skill for post-deployment permission sync and field readiness.
Use `sfdc-permission-orchestrator` for creating permission sets.

## References

- [Predeploy Permission Sync](./predeploy-perm-sync.md)
- [Post-Field Deployment Readiness](./field-readiness.md)
- [Propagation Retry Patterns](./propagation-retries.md)
