# Soft-Deleted Field Awareness

> **MANDATORY**: Before creating or deploying custom fields, check for soft-deleted fields with the same API name.

## Why This Matters

**Root Cause (P1 - Reflection Cohort schema/parse)**: Salesforce does NOT permanently delete custom fields immediately. Deleted fields enter a 15-day "Recycle Bin" retention period. During this period, the API name is **reserved** and cannot be reused. Attempts to create a field with the same API name will fail with cryptic errors.

**Blast Radius**: MEDIUM - Deployment failures, wasted debugging time, blocked field creation.

## The Problem

```
1. Field "Revenue_Type__c" exists on Account
2. Admin deletes it via Setup > Object Manager > Account > Fields > Delete
3. Field enters 15-day soft-delete retention
4. Agent tries to create "Revenue_Type__c" on Account
5. ERROR: "Duplicate developer name" or deployment fails silently
```

## Required Pattern

### Before Creating ANY Custom Field

```bash
# Step 1: Check if the API name is in the soft-deleted field list
sf data query --query "
  SELECT Id, DeveloperName, TableEnumOrId, IsDeleted
  FROM CustomField
  WHERE DeveloperName = 'Revenue_Type'
  AND TableEnumOrId = 'Account'
  AND IsDeleted = true
" --use-tooling-api -o <org>
```

### If a Soft-Deleted Field is Found

You have three options:

**Option A: Wait** (easiest, if time allows)
```
The field will be permanently erased after 15 days.
Check deletion date and wait if close to expiry.
```

**Option B: Permanently erase via UI** (requires admin access)
```
1. Go to Setup > Object Manager > [Object] > Fields & Relationships
2. Click "Deleted Fields" link at the bottom
3. Find the field and click "Erase"
4. Confirm permanent deletion
5. Now the API name is available for reuse
```

**Option C: Use a different API name** (fastest)
```
Instead of: Revenue_Type__c
Use:        Revenue_Type_v2__c  or  Rev_Type__c
```

### Pre-Deploy Check Script

```bash
# Check ALL fields in a deployment for soft-delete conflicts
# Pass the deployment directory path
for field_file in $(find ./force-app -name "*.field-meta.xml"); do
  FIELD_NAME=$(grep -oP '(?<=<fullName>)[^<]+' "$field_file" | head -1)
  OBJECT_NAME=$(echo "$field_file" | grep -oP '(?<=objects/)[^/]+')

  if [ -n "$FIELD_NAME" ] && [ -n "$OBJECT_NAME" ]; then
    RESULT=$(sf data query --query "SELECT COUNT() FROM CustomField WHERE DeveloperName = '${FIELD_NAME%__c}' AND TableEnumOrId = '$OBJECT_NAME' AND IsDeleted = true" --use-tooling-api -o <org> --json 2>/dev/null)
    COUNT=$(echo "$RESULT" | jq -r '.result.totalSize // 0')
    if [ "$COUNT" -gt 0 ]; then
      echo "⚠️  CONFLICT: $OBJECT_NAME.$FIELD_NAME is soft-deleted. Must erase before deploy."
    fi
  fi
done
```

## Common Error Messages

| Error | Likely Cause |
|-------|-------------|
| "Duplicate developer name" | Soft-deleted field with same API name |
| "Cannot create field" (no details) | Soft-deleted field blocking |
| Deployment succeeds but field missing | Field created then immediately hidden by system |
| "There are dependent components" | Soft-deleted field has dependent metadata |

## Notes

- There is **no sf CLI command** to permanently erase a soft-deleted field
- Erasing requires manual UI action OR a direct Metadata API call
- The 15-day retention period is a Salesforce platform limit, not configurable
- Soft-deleted fields still count toward object field limits during retention

## See Also

- `hooks/pre-deployment-comprehensive-validation.sh` - Pre-deploy checks
- `scripts/lib/enhanced-deployment-validator.js` - Enhanced deploy validation
- `agents/sfdc-metadata-manager.md` - Metadata management agent

---
**Source**: Reflection Cohort - schema/parse (P1)
**Version**: 1.0.0
**Date**: 2026-03-01
