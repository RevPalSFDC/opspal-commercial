# Dependency Coverage

Validate that dependent metadata (record types, picklist dependencies, folders) is included when required.

## Critical Dependency Rules

| Deploying | Must Also Include | Why |
|-----------|------------------|-----|
| `Layout` | `RecordType` (if layout is record-type-specific) | Layout assignment references RecordType |
| `Report` | `ReportFolder` (parent folder) | Org requires folder before report |
| `Dashboard` | `DashboardFolder` | Same as Report |
| `CustomField` (picklist) | `StandardValueSet` or `GlobalValueSet` (if shared) | Picklist depends on value set |
| `Flow` (launched by Process Builder) | `WorkflowRule` or parent Flow | Subflow references must exist |
| `PermissionSet` | `CustomField`, `CustomObject` (for FLS entries) | FLS references fields that must exist |
| `ApexTrigger` | `CustomObject` (trigger's object) | Compile-time dependency |
| `ValidationRule` | `CustomField` (if rule references custom fields) | Deploy field before rule that uses it |

## Automated Dependency Check Script

```bash
check_manifest_dependencies() {
  local manifest="$1"
  local errors=0

  # Parse all Layout members
  LAYOUTS=$(xmllint --xpath \
    '//*[local-name()="types"][*[local-name()="name"]="Layout"]/*[local-name()="members"]/text()' \
    "$manifest" 2>/dev/null | tr ' ' '\n')

  # Parse all RecordType members
  RECORD_TYPES=$(xmllint --xpath \
    '//*[local-name()="types"][*[local-name()="name"]="RecordType"]/*[local-name()="members"]/text()' \
    "$manifest" 2>/dev/null | tr ' ' '\n')

  for layout in $LAYOUTS; do
    # Layout name format: ObjectName-RecordTypeName Page Layout
    # Extract object and record type
    OBJECT=$(echo "$layout" | cut -d'-' -f1)
    RT_PART=$(echo "$layout" | cut -d'-' -f2 | sed 's/ Page Layout//')
    EXPECTED_RT="${OBJECT}.${RT_PART}"

    if [[ "$RT_PART" == "Account Layout" ]] || [[ -z "$RT_PART" ]]; then
      continue  # default layout, no record type required
    fi

    if ! echo "$RECORD_TYPES" | grep -qxF "$EXPECTED_RT"; then
      echo "ERROR: Layout '$layout' requires RecordType '$EXPECTED_RT' but it is not in the manifest"
      errors=$((errors + 1))
    fi
  done

  # Check Report → ReportFolder
  REPORTS=$(xmllint --xpath \
    '//*[local-name()="types"][*[local-name()="name"]="Report"]/*[local-name()="members"]/text()' \
    "$manifest" 2>/dev/null | tr ' ' '\n')
  REPORT_FOLDERS=$(xmllint --xpath \
    '//*[local-name()="types"][*[local-name()="name"]="ReportFolder"]/*[local-name()="members"]/text()' \
    "$manifest" 2>/dev/null | tr ' ' '\n')

  for report in $REPORTS; do
    FOLDER=$(echo "$report" | cut -d'/' -f1)
    if ! echo "$REPORT_FOLDERS" | grep -qxF "$FOLDER"; then
      echo "WARNING: Report '$report' requires ReportFolder '$FOLDER'"
      errors=$((errors + 1))
    fi
  done

  return $errors
}
```

## Field History Tracking Dependency

Validate the 20-field limit before deploying custom fields with History Tracking enabled:

```bash
check_field_history_limit() {
  local object="$1"
  local target_org="$2"

  CURRENT=$(sf data query \
    --query "SELECT COUNT() FROM FieldDefinition \
      WHERE EntityDefinition.QualifiedApiName = '${object}' \
      AND IsFieldHistoryTracked = true" \
    --use-tooling-api \
    --target-org "$target_org" \
    --json 2>/dev/null | jq -r '.result.totalSize // 0')

  if [[ "$CURRENT" -ge 20 ]]; then
    echo "ERROR: $object already has $CURRENT/20 tracked fields. Cannot add more without removing existing ones."
    return 1
  fi
  echo "OK: $object has $CURRENT/20 tracked fields"
}
```

## Wildcard Expansion for Dependency Checking

If the manifest uses `<members>*</members>`, expand it before checking dependencies:

```bash
# Retrieve full member list from org for wildcard expansion
sf project retrieve start --metadata Flow --target-org "$SF_TARGET_ORG" --dry-run --json \
  | jq -r '.result.files[].fullName'
```

## Integration with Pre-Deployment Hook

The dependency check integrates into `hooks/pre-deployment-comprehensive-validation.sh`:

```bash
# Stage: Dependency Coverage Check
if [[ -f "$MANIFEST_PATH" ]]; then
  if ! check_manifest_dependencies "$MANIFEST_PATH"; then
    echo "DEPLOY_BLOCKED: Manifest has missing dependencies"
    exit 1
  fi
fi
```
