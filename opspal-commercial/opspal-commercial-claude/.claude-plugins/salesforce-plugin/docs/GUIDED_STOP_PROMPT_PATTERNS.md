# Guided Stop Prompt Patterns for Salesforce Plugin Hooks

**Version**: 1.0.0
**Created**: 2025-11-04
**Feature**: Claude Code v2.0.30 `stopWithPrompt` Integration

## Overview

Guided stop prompts replace hard-blocking `exit 1` statements in hooks with helpful, actionable JSON prompts that guide users to resolve issues. Instead of abruptly halting operations, hooks now provide:

- Clear explanation of why the operation stopped
- Specific context about what went wrong
- Actionable next steps to resolve the issue
- Code examples and commands to run
- Helpful tips and documentation links
- Appropriate severity levels (error, warning, info)

**User Experience Impact:**
- **Before**: "Error: Validation failed" → operation blocks with no guidance
- **After**: Structured prompt with context, steps, and commands → clear path forward

**Implementation**: Uses `hook-stop-prompt-helper.sh` library with 7 specialized functions.

## Quick Start

### 1. Load the Helper Library

```bash
#!/bin/bash
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
source "$PLUGIN_ROOT/scripts/lib/hook-stop-prompt-helper.sh"
```

### 2. Replace `exit 1` with Guided Stop

**Before (Hard Block):**
```bash
if [ $validation_errors -gt 0 ]; then
    echo "❌ Validation failed"
    echo "Fix errors before deployment"
    exit 1  # Abrupt block, no guidance
fi
```

**After (Guided Stop):**
```bash
if [ $validation_errors -gt 0 ]; then
    build_stop_prompt \
        --title "Validation Failed" \
        --severity error \
        --context "Found $validation_errors critical errors" \
        --step "Fix validation errors listed above" \
        --step "Re-run validation script" \
        --step "Deploy after validation passes" \
        --tip "Use automated validation tools" \
        --code "node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/validator.js"
fi
```

### 3. JSON Output Format

All stop prompt functions output JSON to stdout for Claude Code:

```json
{
  "stopWithPrompt": true,
  "message": "❌ **Validation Failed**\n\n**Context:**\n...",
  "severity": "error"
}
```

Claude Code displays this as a formatted stop prompt instead of blocking silently.

## Stop Prompt Functions

### 1. `stop_with_guidance()` - General Error Blocking

**Purpose**: Standard error-level stop prompt with clear guidance.

**Signature**:
```bash
stop_with_guidance <title> [context] <next_steps...>
```

**Example**:
```bash
stop_with_guidance \
    "High risk operation requires approval" \
    "Risk score: 85/100 (CRITICAL)" \
    "Request approval from security team" \
    "Provide business justification" \
    "Create comprehensive rollback plan"
```

**Output**:
```
❌ **High risk operation requires approval**

**Context:**
Risk score: 85/100 (CRITICAL)

**Next Steps:**
▶ Request approval from security team
▶ Provide business justification
▶ Create comprehensive rollback plan
```

**When to Use**: General error conditions that block operations but don't fit specialized patterns.

---

### 2. `stop_with_warning()` - Warning-Level Guidance

**Purpose**: Warning-level stop prompt that may allow override.

**Signature**:
```bash
stop_with_warning <title> [context] <next_steps...>
```

**Example**:
```bash
stop_with_warning \
    "Deployment contains potential issues" \
    "3 validation warnings detected" \
    "Review warnings and confirm intent" \
    "Add --force flag to proceed anyway"
```

**Output**:
```
⚠️ **Deployment contains potential issues**

**Context:**
3 validation warnings detected

**What You Can Do:**
▶ Review warnings and confirm intent
▶ Add --force flag to proceed anyway
```

**When to Use**: Non-critical issues that may be acceptable in some scenarios.

---

### 3. `stop_with_info()` - Informational Guidance

**Purpose**: Info-level stop prompt for missing setup or configuration.

**Signature**:
```bash
stop_with_info <title> [context] <next_steps...>
```

**Example**:
```bash
stop_with_info \
    "Operation requires manual setup" \
    "API credentials not configured" \
    "Run: npm run setup:api" \
    "Documentation: https://docs.example.com"
```

**Output**:
```
ℹ️ **Operation requires manual setup**

**Details:**
API credentials not configured

**Next Steps:**
▶ Run: npm run setup:api
▶ Documentation: https://docs.example.com
```

**When to Use**: Missing prerequisites that aren't errors but need user action.

---

### 4. `build_stop_prompt()` - Structured Builder

**Purpose**: Flexible builder for complex stop prompts with multiple sections.

**Signature**:
```bash
build_stop_prompt \
    --title <text> \
    --severity <error|warning|info> \
    --context <text> \
    --step <text> \          # Can repeat
    --tip <text> \           # Can repeat
    --link <url> <text> \    # Can repeat
    --code <text>            # Can repeat
```

**Example**:
```bash
build_stop_prompt \
    --title "Validation Failed" \
    --severity error \
    --context "3 critical errors found in deployment" \
    --step "Fix field dependencies" \
    --step "Include RecordType metadata" \
    --tip "Use PicklistDependencyManager for easier setup" \
    --link "https://docs.com/picklist" "Picklist Documentation" \
    --code "node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/picklist-dependency-manager.js"
```

**Output**:
```
❌ **Validation Failed**

**Context:**
3 critical errors found in deployment

**Next Steps:**
▶ Fix field dependencies
▶ Include RecordType metadata

**Commands:**
```
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/picklist-dependency-manager.js
```

💡 **Tip:** Use PicklistDependencyManager for easier setup

**Documentation:**
🔗 [Picklist Documentation](https://docs.com/picklist)
```

**When to Use**: Complex scenarios needing multiple sections (context, steps, tips, links, code).

---

### 5. `stop_with_approval()` - Approval Workflow

**Purpose**: Special format for operations requiring human approval.

**Signature**:
```bash
stop_with_approval \
    <operation_name> \
    <risk_level> \
    <required_approver> \
    <requirements...>
```

**Example**:
```bash
stop_with_approval \
    "Production metadata deployment" \
    "Risk: 85/100 (CRITICAL)" \
    "Required approver: Security Team" \
    "Business justification required" \
    "Rollback plan required"
```

**Output**:
```
❌ **Approval Required for Production metadata deployment**

**Risk Assessment:**
Risk: 85/100 (CRITICAL)

**Approval Process:**
▶ Required approver: Security Team

**Requirements:**
▶ Business justification required
▶ Rollback plan required

💡 **Tip:** Contact Required approver: Security Team at security@company.com
```

**When to Use**: High-risk operations requiring explicit approval before proceeding.

**Additional JSON Field**: `"requiresApproval": true`

---

### 6. `stop_with_validation_errors()` - Validation Failures

**Purpose**: Specialized format for validation errors with numbered error list.

**Signature**:
```bash
stop_with_validation_errors \
    <validation_type> \
    <error_count> \
    <error_messages...>
```

**Example**:
```bash
stop_with_validation_errors \
    "Picklist dependency validation" \
    "3" \
    "Missing controllingField attribute on Field__c" \
    "Missing valueSettings array on AnotherField__c" \
    "RecordType metadata not included"
```

**Output**:
```
❌ **Picklist dependency validation Failed**

**Found 3 error(s):**

1. Missing controllingField attribute on Field__c
2. Missing valueSettings array on AnotherField__c
3. RecordType metadata not included

**Next Steps:**
▶ Fix the errors listed above
▶ Re-run the operation

💡 **Tip:** Use validation helper tools to automate fixes
```

**When to Use**: Multiple validation errors needing numbered presentation.

**Additional JSON Field**: `"errorCount": <number>`

---

### 7. `stop_with_missing_config()` - Missing Setup

**Purpose**: Specialized format for missing configuration or credentials.

**Signature**:
```bash
stop_with_missing_config \
    <what_is_missing> \
    <setup_command> \
    [documentation_url]
```

**Example**:
```bash
stop_with_missing_config \
    "API credentials" \
    "npm run setup:api" \
    "https://docs.company.com/api-setup"
```

**Output**:
```
ℹ️ **Setup Required: API credentials**

**Quick Setup:**
```
npm run setup:api
```

**Next Steps:**
▶ Run the setup command above
▶ Follow the prompts to configure API credentials
▶ Re-run your operation

🔗 **Documentation:** [Setup Guide](https://docs.company.com/api-setup)
```

**When to Use**: Missing prerequisites with clear setup process.

## Usage Patterns

### Pattern 1: Simple Validation Failure

**Scenario**: Single validation check fails, needs quick fix.

**Implementation**:
```bash
if ! validate_metadata; then
    stop_with_guidance \
        "Metadata validation failed" \
        "Review and fix metadata issues" \
        "Re-run validation after fixes"
fi
```

**Use Case**: Simple pass/fail validations with straightforward remediation.

---

### Pattern 2: Multi-Check Validation with Error Collection

**Scenario**: Multiple validation checks, collect all errors before blocking.

**Implementation**:
```bash
ERROR_DETAILS=()

# Check 1
if ! check_api_version; then
    ERROR_DETAILS+=("API version compatibility issue")
fi

# Check 2
if ! check_field_references; then
    ERROR_DETAILS+=("Field reference errors detected")
fi

# Check 3
if ! check_formulas; then
    ERROR_DETAILS+=("Formula validation failed")
fi

if [ ${#ERROR_DETAILS[@]} -gt 0 ]; then
    build_stop_prompt \
        --title "Multiple Validation Failures" \
        --severity error \
        --context "Found ${#ERROR_DETAILS[@]} errors" \
        --step "Fix API version issues" \
        --step "Resolve field references" \
        --step "Correct formula errors" \
        --step "Re-run complete validation" \
        --code "node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/validator.js --fix-all"
fi
```

**Use Case**: Comprehensive validation with multiple independent checks.

---

### Pattern 3: Risk-Based Blocking with Approval

**Scenario**: High-risk operations require approval workflow.

**Implementation**:
```bash
RISK_SCORE=$(calculate_risk_score "$operation")

if [ "$RISK_SCORE" -gt 70 ]; then
    stop_with_approval \
        "$OPERATION_TYPE by $AGENT_NAME" \
        "Risk Score: $RISK_SCORE/100 (CRITICAL)" \
        "Required approver: Security Team (security@company.com)" \
        "Detailed business justification required" \
        "Executive approval required" \
        "Comprehensive rollback plan required"
fi
```

**Use Case**: Governance workflows requiring documented approval.

---

### Pattern 4: Warning with Override Option

**Scenario**: Non-critical issues that may be acceptable in some scenarios.

**Implementation**:
```bash
WARNING_DETAILS=()

# Collect warnings
if [ -z "$ORG_ALIAS" ]; then
    WARNING_DETAILS+=("Org alias not provided - some checks skipped")
fi

if [ ${#WARNING_DETAILS[@]} -gt 0 ]; then
    if [ "$STRICT_MODE" = "true" ]; then
        # Strict mode - block with warning
        stop_with_warning \
            "Validation warnings in strict mode" \
            "Found ${#WARNING_DETAILS[@]} warnings" \
            "Review warnings and decide if acceptable" \
            "Set STRICT_MODE=false to allow warnings" \
            "OR fix warnings and re-run"
    else
        # Non-strict - allow with console warning
        echo "⚠️ Found ${#WARNING_DETAILS[@]} warnings (proceeding)"
        exit 0
    fi
fi
```

**Use Case**: Configurable validation strictness with user control.

---

### Pattern 5: Missing Prerequisites

**Scenario**: Operation requires setup that hasn't been completed.

**Implementation**:
```bash
if [ ! -f "$CONFIG_FILE" ]; then
    stop_with_missing_config \
        "Salesforce credentials" \
        "sf org login web --alias production" \
        "https://docs.salesforce.com/auth"
fi

if [ -z "$REQUIRED_TOOL" ]; then
    stop_with_missing_config \
        "jq (JSON processor)" \
        "brew install jq  # macOS\nsudo apt-get install jq  # Linux" \
        "https://stedolan.github.io/jq/"
fi
```

**Use Case**: Missing tools, credentials, or configuration.

## Converted Hooks (Examples)

### 1. Pre-High-Risk-Operation Hook

**File**: `hooks/pre-high-risk-operation.sh`

**Before**:
```bash
if [[ "$BLOCKED" == "true" ]]; then
    echo "❌ OPERATION BLOCKED"
    echo "Risk Score: $RISK_SCORE/100 - Too high"
    exit 1
fi
```

**After**:
```bash
if [[ "$BLOCKED" == "true" ]]; then
    stop_with_approval \
        "$OPERATION_TYPE by $AGENT_NAME" \
        "Risk Score: $RISK_SCORE/100 ($RISK_LEVEL)" \
        "Required approver: Security Team" \
        "Business justification required" \
        "Rollback plan required"
fi
```

**Impact**: Clear approval process instead of hard block.

---

### 2. Pre-Picklist-Dependency-Validation Hook

**File**: `hooks/pre-picklist-dependency-validation.sh`

**Before**:
```bash
if [ $validation_errors -gt 0 ]; then
    echo "❌ Found $validation_errors errors"
    echo "Fix errors before deployment"
    exit 1
fi
```

**After**:
```bash
if [ $validation_errors -gt 0 ]; then
    build_stop_prompt \
        --title "Picklist Dependency Validation Failed" \
        --severity error \
        --context "Found $validation_errors critical error(s)" \
        --step "Fix controllingField attributes" \
        --step "Ensure valueSettings arrays defined" \
        --step "Include RecordType metadata" \
        --tip "Use PicklistDependencyManager" \
        --code "node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/picklist-dependency-manager.js"
fi
```

**Impact**: Specific remediation steps with automated tool suggestion.

---

### 3. Pre-Flow-Deployment Hook

**File**: `hooks/pre-flow-deployment.sh`

**Before**:
```bash
if [ "$HAS_ERRORS" = true ]; then
    echo "❌ VALIDATION FAILED"
    exit 1
fi
```

**After**:
```bash
if [ "$HAS_ERRORS" = true ]; then
    build_stop_prompt \
        --title "Flow Deployment Validation Failed" \
        --severity error \
        --context "Flow: $FLOW_NAME - Found ${#ERROR_DETAILS[@]} errors" \
        --step "Fix API version compatibility issues" \
        --step "Run migration script" \
        --step "Re-validate after fixes" \
        --code "node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-pattern-migrator.js"
fi
```

**Impact**: Flow-specific guidance with migration tool reference.

---

### 4. Pre-Batch-Validation Hook

**File**: `hooks/pre-batch-validation.sh`

**Before**:
```bash
if validation failed; then
    echo "❌ Validation failed"
    echo "1. Re-run analysis"
    echo "2. Verify no changes"
    exit 1
fi
```

**After**:
```bash
if validation failed; then
    build_stop_prompt \
        --title "Batch Validation Failed" \
        --severity error \
        --context "Analysis file: $FILE - Target: $ORG" \
        --step "Re-run analysis query for fresh data" \
        --step "Verify no concurrent modifications" \
        --step "Re-run validation" \
        --tip "Analysis data may be stale" \
        --code "$0 $ANALYSIS_FILE $TARGET_ORG"
fi
```

**Impact**: Data freshness context with re-validation command.

## Best Practices

### 1. Always Provide Context

**❌ Bad** (no context):
```bash
stop_with_guidance "Validation failed" "Fix errors"
```

**✅ Good** (clear context):
```bash
stop_with_guidance \
    "Metadata validation failed" \
    "Found 3 critical errors in picklist dependencies" \
    "Fix controllingField attributes" \
    "Add valueSettings arrays"
```

**Why**: Users need to understand what went wrong before fixing it.

---

### 2. Make Steps Actionable

**❌ Bad** (vague):
```bash
--step "Fix the problems"
--step "Try again"
```

**✅ Good** (specific):
```bash
--step "Fix controllingField attribute on Status__c"
--step "Add valueSettings array to Priority__c"
--step "Re-run validation: node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/validator.js"
```

**Why**: Users can follow clear instructions without guessing.

---

### 3. Include Code Examples

**❌ Bad** (description only):
```bash
--step "Run the validation script"
```

**✅ Good** (exact command):
```bash
--step "Run validation script"
--code "node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validator.js --org production"
```

**Why**: Copy-paste commands reduce errors and friction.

---

### 4. Use Appropriate Severity

| Severity | When to Use | Example |
|----------|-------------|---------|
| `error` | Critical issues that must be fixed | Validation failures, risk too high |
| `warning` | Non-critical issues that may be acceptable | Missing optional checks, best practice violations |
| `info` | Missing setup or configuration | Credentials not found, tools not installed |

**Why**: Severity indicates urgency and whether override is possible.

---

### 5. Provide Documentation Links

**❌ Bad** (no references):
```bash
stop_with_guidance "Setup Salesforce auth" "Run auth command"
```

**✅ Good** (with docs):
```bash
build_stop_prompt \
    --title "Salesforce Authentication Required" \
    --severity info \
    --step "Run: sf org login web --alias myorg" \
    --link "https://developer.salesforce.com/docs/auth" "Auth Guide"
```

**Why**: Users can learn more without asking for help.

---

### 6. Collect Multiple Errors Before Blocking

**❌ Bad** (stop on first error):
```bash
if ! check1; then exit 1; fi
if ! check2; then exit 1; fi
if ! check3; then exit 1; fi
```

**✅ Good** (collect all errors):
```bash
ERRORS=()
check1 || ERRORS+=("Error 1")
check2 || ERRORS+=("Error 2")
check3 || ERRORS+=("Error 3")

if [ ${#ERRORS[@]} -gt 0 ]; then
    stop_with_validation_errors "Validation" "${#ERRORS[@]}" "${ERRORS[@]}"
fi
```

**Why**: Users can fix all issues at once instead of iteratively.

---

### 7. Test JSON Output

**Always test** that your stop prompt generates valid JSON:

```bash
bash -c 'source hook-stop-prompt-helper.sh && \
  build_stop_prompt --title "Test" --step "Step 1" 2>&1 | jq .'
```

**Why**: Invalid JSON breaks Claude Code's stop prompt display.

## Testing Stop Prompts

### Manual Testing

```bash
# Test basic stop
bash -c 'source scripts/lib/hook-stop-prompt-helper.sh && \
  stop_with_guidance "Test" "Context" "Step 1" "Step 2"'

# Test structured stop
bash -c 'source scripts/lib/hook-stop-prompt-helper.sh && \
  build_stop_prompt --title "Test" --severity error --step "Fix"'

# Test warning
bash -c 'source scripts/lib/hook-stop-prompt-helper.sh && \
  stop_with_warning "Warning" "Issue found" "Review"'

# Test approval
bash -c 'source scripts/lib/hook-stop-prompt-helper.sh && \
  stop_with_approval "Deploy" "Risk: 85" "Security Team"'
```

### Validation Checklist

- [ ] JSON is valid (`jq .` parses successfully)
- [ ] `stopWithPrompt: true` is present
- [ ] `message` field contains formatted markdown
- [ ] `severity` is one of: error, warning, info
- [ ] Symbols render correctly (❌, ⚠️, ℹ️, 💡, 🔗, ▶)
- [ ] Code blocks use triple backticks
- [ ] Links use markdown format: `[Text](URL)`
- [ ] Steps have clear action verbs
- [ ] Context explains why operation stopped

## Troubleshooting

### Issue: JSON Parse Error

**Symptom**: Hook fails with `jq: parse error`

**Cause**: Special characters not escaped in arguments

**Solution**: Avoid quotes and special chars in arguments, or escape properly:
```bash
# ❌ Bad
--context "Found 3 errors: \"field missing\""

# ✅ Good
--context "Found 3 errors: field missing"
```

---

### Issue: Steps Not Showing

**Symptom**: Stop prompt shows but steps section is empty

**Cause**: Forgot to use `--step` parameter or steps look like context

**Solution**: Use `--step` for each step:
```bash
build_stop_prompt \
    --title "Error" \
    --step "First step" \      # Use --step
    --step "Second step"       # Not bare arguments
```

---

### Issue: Context Treated as Step

**Symptom**: Context appears under "Next Steps" instead of "Context"

**Cause**: Context starts with capital letter + verb (matches step heuristic)

**Solution**: Use non-verb start or `build_stop_prompt` with explicit `--context`:
```bash
# ❌ May be treated as step
stop_with_guidance "Title" "Review the errors" "Fix"

# ✅ Explicit context
build_stop_prompt --title "Title" --context "Review the errors" --step "Fix"
```

---

### Issue: Symbols Not Rendering

**Symptom**: Shows `\u274C` instead of ❌

**Cause**: Unicode not supported in terminal/environment

**Solution**: Symbols should still work in Claude Code even if not in terminal test. Claude Code renders markdown properly.

## Migration Guide

### Converting Existing Hooks

**Step 1**: Identify blocking exit statements
```bash
grep -n "exit 1" hooks/*.sh
```

**Step 2**: For each `exit 1`, determine context:
- What went wrong?
- What should user do to fix it?
- What commands should they run?
- Are there helpful docs?

**Step 3**: Choose appropriate function:
- Validation errors → `stop_with_validation_errors()` or `build_stop_prompt()`
- High risk → `stop_with_approval()`
- Missing setup → `stop_with_missing_config()`
- General errors → `stop_with_guidance()` or `build_stop_prompt()`
- Warnings → `stop_with_warning()`

**Step 4**: Replace exit with stop prompt

**Step 5**: Test JSON output

**Step 6**: Commit changes

### Example Migration

**Before**:
```bash
#!/bin/bash
if ! validate_something; then
    echo "Validation failed"
    exit 1
fi
```

**After**:
```bash
#!/bin/bash
PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$PLUGIN_ROOT/scripts/lib/hook-stop-prompt-helper.sh"

if ! validate_something; then
    build_stop_prompt \
        --title "Validation Failed" \
        --severity error \
        --context "Something validation failed" \
        --step "Fix the issues" \
        --step "Re-run validation" \
        --code "node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/validator.js"
fi
```

## API Reference

### Function Signatures

```bash
# Simple error stop
stop_with_guidance <title> [context] <next_steps...>

# Warning stop
stop_with_warning <title> [context] <next_steps...>

# Info stop
stop_with_info <title> [context] <next_steps...>

# Structured stop with all options
build_stop_prompt \
    --title <text> \
    --severity <error|warning|info> \
    [--context <text>] \
    [--step <text>]... \
    [--tip <text>]... \
    [--link <url> <text>]... \
    [--code <text>]...

# Approval workflow stop
stop_with_approval \
    <operation> \
    <risk_level> \
    <required_approver> \
    <requirements...>

# Validation errors stop
stop_with_validation_errors \
    <validation_type> \
    <error_count> \
    <error_messages...>

# Missing setup stop
stop_with_missing_config \
    <what_missing> \
    <setup_command> \
    [documentation_url]
```

### JSON Output Schema

```json
{
  "stopWithPrompt": true,           // Required: Always true
  "message": "string",               // Required: Formatted markdown
  "severity": "error|warning|info",  // Required: Severity level
  "requiresApproval": boolean,       // Optional: For stop_with_approval
  "errorCount": number               // Optional: For stop_with_validation_errors
}
```

### Exit Behavior

All stop prompt functions call `exit 0` (not `exit 1`) because:
- The JSON output IS the response (not an error)
- Claude Code handles the stop prompt gracefully
- Prevents hook failures from cascading
- Allows proper display of formatted guidance

**Important**: The operation is still stopped, but via Claude Code's stop prompt mechanism, not a bash error.

## See Also

- **Hook Progress Patterns**: `docs/HOOK_PROGRESS_PATTERNS.md`
- **Hook Stop Prompt Helper**: `scripts/lib/hook-stop-prompt-helper.sh`
- **Phase 2 Completion**: `PHASE_2_PART_3_GUIDED_STOP_COMPLETE.md`
- **Claude Code Docs**: https://docs.claude.com/en/docs/claude-code

---

**Last Updated**: 2025-11-04
**Version**: 1.0.0
**Feature**: Claude Code v2.0.30 Integration
