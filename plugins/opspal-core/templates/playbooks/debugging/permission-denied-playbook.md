# Permission Denied Debugging Playbook

## Overview

Use this playbook when encountering permission or authorization errors in Salesforce, HubSpot, or other platforms.

## Symptoms

- Error messages containing "permission denied", "unauthorized", "insufficient privileges"
- HTTP 401, 403, or 404 status codes
- "FIELD_CUSTOM_VALIDATION_EXCEPTION" with permission context
- Profile or permission set errors during deployment

## Diagnostic Steps

### Step 1: Identify the Permission Context

```bash
# Check recent errors in unified log
grep -i "permission\|unauthorized\|403\|401" ~/.claude/logs/unified.jsonl | tail -20

# Extract from debugging context
node scripts/lib/debugging-context-extractor.js extract --window=60 | jq '.debugging_context.log_metrics'
```

**What to look for:**
- Which user/profile is attempting the operation
- Which object/field is being accessed
- What operation type (read, write, delete)

### Step 2: Check User Permissions (Salesforce)

```bash
# Get current user info
sf org display user --target-org <org-alias>

# List permission sets assigned to user
sf data query --query "SELECT PermissionSetId, PermissionSet.Name FROM PermissionSetAssignment WHERE AssigneeId = '<user-id>'" --target-org <org-alias>

# Check field-level security for specific object
sf data query --query "SELECT Field, PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE SObjectType = '<ObjectName>' AND Parent.ProfileId = '<profile-id>'" --use-tooling-api --target-org <org-alias>
```

### Step 3: Check OAuth Scopes (API Access)

```bash
# For Salesforce connected app
sf org list auth

# Check OAuth token scopes
cat ~/.sf/config.json | jq '.oauthTokens'
```

**What to look for:**
- `api` scope for standard API access
- `refresh_token` for session refresh
- `full` scope for complete access

### Step 4: Trace the Request

```bash
# Find the specific request in traces
node scripts/lib/trace-context.js summary

# Look for failed spans
grep -E '"status":"ERROR"' ~/.claude/logs/traces.jsonl | tail -10
```

## Common Root Causes

| Root Cause | Indicators | Fix |
|------------|------------|-----|
| Missing object permission | 403 on specific object | Add object to profile/perm set |
| Field-level security | Can't see/edit specific field | Update FLS in permission set |
| Record type restriction | Can't create with certain RT | Assign record type to profile |
| Sharing rules | Can't see records | Expand sharing or assign owner |
| OAuth scope missing | API call rejected | Re-authenticate with full scope |
| Expired token | 401 after working | Refresh OAuth token |
| IP restrictions | Access from new location | Update login IP ranges |

## Quick Fixes

### 1. Check Current User Profile

```bash
# Quick check for Salesforce
sf data query --query "SELECT Id, Name, Profile.Name FROM User WHERE Username LIKE '%<your-username>%'" --target-org <org-alias>
```

### 2. Re-authenticate with Full Scope

```bash
# Salesforce - full refresh
sf org login web --target-org <org-alias> --browser

# HubSpot - check access token
node scripts/lib/unified-auth-manager.js test hubspot
```

### 3. Create Temporary Permission Set (Salesforce)

```bash
# Create permission set with needed access
# Use the permission-orchestrator agent for production
/permission-set "Temporary <Object> Access"
```

## Permission Debugging Commands

### Salesforce

```bash
# List all objects user can access
sf data query --query "SELECT SObjectType FROM ObjectPermissions WHERE PermissionsRead = true AND ParentId IN (SELECT PermissionSetId FROM PermissionSetAssignment WHERE AssigneeId = '<user-id>')" --use-tooling-api

# Check CRUD on specific object
sf data query --query "SELECT PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete FROM ObjectPermissions WHERE SObjectType = '<Object>' AND ParentId = '<profile-id>'" --use-tooling-api
```

### HubSpot

```bash
# Check API scopes
curl -X GET "https://api.hubapi.com/oauth/v1/access-tokens/<access-token>"

# Test specific API endpoint
curl -H "Authorization: Bearer <token>" "https://api.hubapi.com/crm/v3/objects/contacts?limit=1"
```

## Prevention Checklist

- [ ] Use dedicated integration user with full permissions
- [ ] Document required permissions in runbook
- [ ] Set up permission set groups for common workflows
- [ ] Monitor permission changes with audit trail
- [ ] Test in sandbox before production deployments

## Recovery Actions

1. **If token expired**: Re-authenticate and retry
2. **If object permission missing**: Create/assign permission set
3. **If FLS blocked**: Update field permissions
4. **If sharing blocks**: Check record ownership or sharing rules

## Related Playbooks

- [Authentication Playbook](./authentication-playbook.md)
- [Salesforce Security Playbook](./salesforce-security-playbook.md)

---

**Version**: 1.0.0
**Last Updated**: 2026-01-31
