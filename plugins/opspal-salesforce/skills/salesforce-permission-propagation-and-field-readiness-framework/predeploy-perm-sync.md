# Predeploy Permission Sync

Primary hook source: `hooks/pre-deployment-permission-sync.sh`.

## Guidance

Synchronize permission dependencies before deployment.

## Post-deploy perm set auto-assign

After deploying permission sets, `permission-deployment-utils.sh` now automatically:
1. Resolves the connected CLI user via `sf org display`
2. Assigns each deployed base perm set to the CLI user (idempotent — skips if already assigned)
3. Runs a FieldPermissions verification spot-check

This prevents the common failure where FLS grants exist in the perm set but the deploying
user has no access because the perm set was never assigned to them.

```bash
# Manual invocation (normally called automatically by deploy_all_permission_sets)
source scripts/lib/permission-deployment-utils.sh
post_deploy_assign_cli_user <org-alias>

# Standalone FLS verification
verify_field_permissions <username> <org-alias>
```

## PermissionSet vs Profile deploy behavior

- **PermissionSet** (v40+): Omitted `<fieldPermissions>` entries are **ignored** — existing
  access is preserved. Only entries present in the XML are updated.
- **Profile**: Omitted `<fieldPermissions>` entries are **removed** — this is destructive.

When deploying mixed metadata (Profiles + PermissionSets), be aware that Profile deploys can
strip FLS for fields not explicitly listed in the XML.

Ref: https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_permissionset.htm
