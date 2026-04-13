# Deployment Gates

Define hard-block vs warning policy for missing manifest dependencies with clear remediation text.

## Gate Severity Levels

| Level | Action | Exit Code | Use When |
|-------|--------|-----------|----------|
| `ERROR` (hard block) | Deny deployment, print remediation steps | 1 | Missing required dependencies, malformed XML, wrong API version |
| `WARNING` | Allow deployment, surface advisory | 0 | Optional dependency missing, non-critical inconsistency |
| `INFO` | Log only, no user-facing message | 0 | Expected patterns that are fine |

## Gate Decision Tree

```
Is the XML malformed?
  YES → ERROR: "package.xml is not well-formed XML"
  NO  ↓
Does a Layout reference a RecordType not in the manifest?
  YES → ERROR: "Layout X requires RecordType Y"
  NO  ↓
Does a Report reference a folder not in the manifest?
  YES → WARNING: "Report X will fail if folder Y doesn't exist in org"
  NO  ↓
Does a CustomField have History Tracking when object is at limit?
  YES → ERROR: "Object at 20-field tracking limit"
  NO  ↓
Is the manifest API version lower than the project API version?
  YES → WARNING: "API version mismatch"
  NO  ↓
PASS: Manifest gates cleared
```

## Hard Block Pattern

```bash
gate_error() {
  local message="$1"
  local remediation="${2:-}"

  echo ""
  echo "❌ DEPLOYMENT BLOCKED: $message"
  if [[ -n "$remediation" ]]; then
    echo ""
    echo "   Remediation:"
    echo "   $remediation"
  fi
  echo ""
  exit 1
}

# Usage
if ! xmllint --noout "$MANIFEST" 2>/dev/null; then
  gate_error \
    "package.xml is malformed XML" \
    "Run: xmllint --format $MANIFEST > package-fixed.xml && mv package-fixed.xml $MANIFEST"
fi
```

## Warning Pattern (non-blocking)

```bash
gate_warning() {
  local message="$1"
  local suggestion="${2:-}"

  echo ""
  echo "⚠️  DEPLOYMENT WARNING: $message"
  if [[ -n "$suggestion" ]]; then
    echo "   Suggestion: $suggestion"
  fi
  echo ""
  # exit 0 — do not block
}

gate_warning \
  "Report 'Sales_Pipeline' requires folder 'Sales_Reports' which is not in the manifest" \
  "Add <members>Sales_Reports</members> under <name>ReportFolder</name>"
```

## Gate Integration with Pre-Deployment Hook

In `hooks/pre-deployment-comprehensive-validation.sh`, gates run sequentially. The first hard block stops the deployment:

```bash
run_manifest_gates() {
  local manifest="$1"
  local target_org="$2"

  # Gate 1: Well-formedness (hard block)
  xmllint --noout "$manifest" 2>/dev/null \
    || gate_error "package.xml is not well-formed XML"

  # Gate 2: Dependency coverage (hard block for layouts, warning for reports)
  check_manifest_dependencies "$manifest"  # exits 1 on ERROR

  # Gate 3: API version consistency (warning)
  MANIFEST_VER=$(xmllint --xpath '//*[local-name()="version"]/text()' "$manifest" 2>/dev/null)
  PROJECT_VER=$(jq -r '.sourceApiVersion' sfdx-project.json 2>/dev/null)
  [[ "$MANIFEST_VER" != "$PROJECT_VER" ]] \
    && gate_warning "API version mismatch: manifest=$MANIFEST_VER, project=$PROJECT_VER"

  # Gate 4: Validate against org (dry-run, non-blocking)
  if [[ -n "$target_org" ]]; then
    sf project deploy validate \
      --manifest "$manifest" \
      --target-org "$target_org" \
      --test-level NoTestRun \
      --json 2>/dev/null | jq -r '.result.success' \
      | grep -q true \
      || gate_warning "Manifest validation against org returned failures — review before deploying"
  fi

  echo "✅ All manifest gates passed"
}
```

## Remediation Text Standards

Every hard block must include:
1. What was blocked and why (one sentence).
2. The exact command or file change to fix it.
3. Where to find more information (runbook link or reference doc).

```bash
gate_error \
  "Layout 'Account-Customer Page Layout' requires RecordType 'Account.Customer' but it is not in the manifest" \
  "Add the following to your manifest and retry:
   <types>
     <members>Account.Customer</members>
     <name>RecordType</name>
   </types>
   See: docs/runbooks/MANIFEST_DEPENDENCY_RULES.md"
```
