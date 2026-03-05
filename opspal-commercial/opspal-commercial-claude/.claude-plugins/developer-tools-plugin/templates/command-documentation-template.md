---
name: command-name
description: Brief description of what this command does (20-200 chars)
---

# Command Name

## Purpose

**What this command does**: [Single sentence describing the primary purpose]

**When to use it**: [Brief explanation of the right situations to use this command]

**When NOT to use it**: [Common misconceptions or situations where this command is not appropriate]

## Prerequisites

### Configuration (Optional)
These settings improve functionality but are NOT required for basic operation:

- **Environment Variable**: `VARIABLE_NAME` - Description of what it enables
  - Default: `value`
  - Impact if not set: [What functionality is unavailable]

- **File**: `.config-file.json` - Description
  - Impact if not set: [What happens]

### Execution Required
These are MANDATORY before running the command:

- **✅ REQUIRED**: [Thing that must exist/be configured]
  - How to verify: `command to check`
  - How to fix if missing: `command to create`

## Usage

### Basic Usage
```bash
/command-name
```

**What happens**:
1. [First step]
2. [Second step]
3. [Result]

### With Options
```bash
/command-name --option value
```

**Available Options**:
- `--option` - Description of what this does
  - Valid values: `value1`, `value2`
  - Default: `value1`

## Examples

### Example 1: Most Common Use Case
**Scenario**: [Description of the situation]

**Command**:
```bash
/command-name
```

**Expected Output**:
```
[Exact output the user should see]
✅ Success message
```

**What this means**: [Explanation of the result]

### Example 2: Advanced Use Case
**Scenario**: [Description of the situation]

**Command**:
```bash
/command-name --advanced-option
```

**Expected Output**:
```
[Exact output the user should see]
```

## Decision Tree

**Use this decision tree to determine if this command is right for your situation:**

```
Start Here
  ↓
Do you need to [primary purpose]?
  ├─ YES → Is [prerequisite] configured?
  │         ├─ YES → Run /command-name ✅
  │         └─ NO → Set up [prerequisite] first
  │
  └─ NO → Are you trying to [common misconception]?
            ├─ YES → Use /other-command instead
            └─ NO → This command may not be what you need
```

## Expected Output

### Success
```
[Full success output example]
```

**Indicators of success**:
- ✅ [Specific thing to look for]
- ✅ [Another indicator]
- ✅ [File created or action completed]

### Partial Success with Warnings
```
[Output with warnings]
```

**What this means**: [Explanation of warnings and whether action is needed]

### Failure
```
[Error message example]
```

**Common causes**:
1. [First common cause]
   - How to fix: [Solution]
2. [Second common cause]
   - How to fix: [Solution]

## Troubleshooting

### Issue: [Common problem]
**Symptoms**: [What the user sees]

**Cause**: [Why this happens]

**Solution**:
```bash
[Command to fix]
```

**Verification**:
```bash
[Command to verify fix worked]
```

### Issue: [Another common problem]
**Symptoms**: [What the user sees]

**Cause**: [Why this happens]

**Solution**:
1. [Step 1]
2. [Step 2]
3. [Verification step]

## Related Commands

- `/other-command` - Use when [situation]
- `/another-command` - Use when [situation]

## Technical Details

### What Happens Under the Hood
1. [First action the system takes]
2. [Second action]
3. [Final result]

### Files Modified
- `path/to/file.ext` - [What changes]
- `path/to/other.ext` - [What changes]

### Hooks Triggered
- `hook-name` - [What it does]

## Success Criteria

After running this command successfully, you should have:
- ✅ [Specific outcome]
- ✅ [Specific file or state]
- ✅ [Specific verification result]

## Notes

- [Important note about limitations]
- [Important note about performance]
- [Important note about compatibility]
