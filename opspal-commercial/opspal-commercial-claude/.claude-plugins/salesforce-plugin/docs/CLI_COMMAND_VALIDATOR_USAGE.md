# CLI Command Validator - Usage Guide

**Created:** 2025-10-22
**Version:** 1.0.0
**Fix Plan:** FP-003 - Salesforce CLI Command Validator

---

## Purpose

Prevents CLI command errors by validating syntax before execution.

**Root Cause Addressed:**
- Issue: Invalid CLI commands like `sf data export` (should be `sf data query`)
- Impact: "command not found" errors, 2 hours wasted per occurrence
- ROI: $12K annually

---

## Quick Start

### Programmatic Usage

```javascript
const validator = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/cli-command-validator');

// Validate a command
const result = validator.validate('sf data export --query "SELECT Id FROM Account"');

if (!result.valid) {
  console.error(result.errors.join('\n'));
  console.log('\nSuggested fixes:');
  result.suggestions.forEach(s => {
    console.log(`  ${s.issue} → ${s.fix}`);
    console.log(`  Reason: ${s.reason}`);
  });
  process.exit(1);
}

// Command is valid, proceed with execution
execSync(commandStr);
```

### CLI Usage

```bash
# Test a command
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/cli-command-validator.js "sf data query --query 'SELECT Id FROM Account'"
# Exit code: 0 (valid) or 1 (invalid)

# Test invalid command
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/cli-command-validator.js "sf data export"
# ❌ Invalid command: sf data export
# Suggested fix: Use 'sf data query' instead
```

---

## Integration with Agents

### Pre-Execution Hook Pattern

```javascript
// In any script that executes SF CLI commands:

const { execSync } = require('child_process');
const cliValidator = require('./cli-command-validator');

function executeSFCommand(commandStr, options = {}) {
  // Validate before execution
  const validation = cliValidator.validate(commandStr);

  if (!validation.valid) {
    const formatted = cliValidator.formatResult(validation);
    throw new Error(`Invalid SF CLI command:\n${formatted}`);
  }

  // Warn on deprecations
  if (validation.warnings.length > 0) {
    console.warn('⚠️  Command warnings:');
    validation.warnings.forEach(w => console.warn(`  - ${w}`));
  }

  // Execute
  return execSync(commandStr, options);
}

// Usage
try {
  const result = executeSFCommand('sf data query --query "SELECT Id FROM Account" -o myorg');
  console.log(result.toString());
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
```

---

## Common Errors Caught

### 1. Invalid Command

```bash
❌ sf data export
✅ sf data query
```

### 2. Deprecated Flags

```bash
❌ sf project deploy start --source-path force-app
✅ sf project deploy start --source-dir force-app
✅ sf project deploy start -d force-app
```

### 3. Legacy Syntax (Not Supported)

```bash
❌ force:data:soql:query (legacy format, rejected)
✅ sf data query
```

---

## Reference Data

Command reference is maintained in:
```
.claude-plugins/opspal-core-plugin/packages/domains/salesforce/data/sf-cli-command-reference.json
```

**Update process:**
1. Test new SF CLI commands
2. Add to reference JSON
3. Update validator if needed
4. Run tests

---

## API Reference

### `validate(commandStr, options)`

Validates a CLI command.

**Parameters:**
- `commandStr` (string) - Full command (e.g., "sf data query --query 'SELECT...'")
- `options` (object) - Optional
  - `strict` (boolean) - Strict mode (default: true)

**Returns:** Object with:
```javascript
{
  valid: boolean,
  command: string,      // Base command
  flags: Array,         // Parsed flags
  errors: Array,        // Error messages
  warnings: Array,      // Warning messages
  suggestions: Array    // Fix suggestions
}
```

### `isValid(commandStr)`

Simple boolean check.

**Returns:** `true` if valid, `false` otherwise

### `formatResult(result)`

Formats validation result as human-readable string.

**Returns:** String with formatted errors/warnings/suggestions

### `getExamples(commandBase)`

Gets example commands from reference.

**Parameters:**
- `commandBase` (string) - Base command (e.g., "sf data query")

**Returns:** Array of example commands

---

## Testing

```bash
# Run tests
cd .claude-plugins/salesforce-plugin
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/cli-command-validator.js "sf data export"  # Should fail
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/cli-command-validator.js "sf data query --query 'SELECT Id FROM Account'"  # Should pass
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/cli-command-validator.js "sf project deploy start --source-path force-app"  # Should warn
```

---

## Integration Checklist

To integrate validator with an agent:

- [ ] Import validator at top of script
- [ ] Wrap SF CLI executions with validation call
- [ ] Handle validation errors appropriately
- [ ] Log warnings for deprecated flags
- [ ] Update agent documentation
- [ ] Test with invalid commands
- [ ] Test with valid commands
- [ ] Test with deprecated flags

---

## Maintenance

**When to update:**
- SF CLI releases new version
- New commands added to SF CLI
- Flags changed or deprecated
- Common errors identified in reflections

**Update frequency:** Quarterly or as needed

---

## See Also

- `sf-cli-command-reference.json` - Command reference data
- Reflection FP-003 - Original issue analysis
- `FINAL_GAP_ANALYSIS_REPORT.md` - Implementation plan
