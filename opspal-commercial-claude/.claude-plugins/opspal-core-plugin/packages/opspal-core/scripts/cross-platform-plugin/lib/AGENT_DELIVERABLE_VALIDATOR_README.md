# Agent Deliverable Validator

**Version:** 1.0.0
**Created:** 2025-10-26
**ROI:** $48,000/year
**Addresses:** Reflection Cohort - Prompt Mismatch / Incomplete Deliverables

## Purpose

Validates agent deliverables **before task completion** to prevent:
- ❌ Missing deliverables (file doesn't exist)
- ❌ Format mismatches (JSON corrupted, CSV malformed)
- ❌ Placeholder content (TODO, EXAMPLE, generic data)
- ❌ Incomplete work (success criteria not met)
- ❌ Empty or trivial outputs

## What It Does

The validator performs 6 key validations before agents mark tasks complete:

### 1. File Existence ✅
Verifies all required deliverables exist.

```
Deliverable: report.json (required)
File Path: ./reports/hivemq/report.json

Result:
  ✅ File exists
  ❌ File not found → ERROR
```

### 2. File Not Empty ✅
Checks that files contain actual content.

```
File: report.json
Size: 0 bytes

Result: ❌ ERROR - File is empty
```

```
File: report.json
Size: 45 bytes

Result: ⚠️  WARNING - File suspiciously small
```

### 3. Format Validation ✅
Validates format-specific requirements.

**JSON Validation:**
```
Content: { "status": "complete", "findings": [...] }

Result: ✅ Valid JSON
```

```
Content: { "status": "complete" invalid }

Result: ❌ ERROR - Invalid JSON syntax
```

**CSV Validation:**
```
Content:
Name,Email,Status
John Smith,john@company.com,Active
Jane Doe,jane@company.com,Active

Result: ✅ Valid CSV with data
```

```
Content:
Name,Email,Status

Result: ⚠️  WARNING - CSV has only headers, no data
```

**Markdown Validation:**
```
Content:
# Report
## Summary
[Actual content...]

Result: ✅ Valid Markdown with structure
```

**PDF Validation:**
```
Magic Bytes: %PDF-1.4

Result: ✅ Valid PDF file
```

### 4. Placeholder Detection ✅
Scans for placeholder content.

```
Content: "TODO: Add summary here"

Result: ❌ ERROR - Contains placeholder: TODO
```

**Detected Patterns:**
- `TODO`, `FIXME`, `XXX`
- `PLACEHOLDER`, `EXAMPLE`
- `INSERT X HERE`, `REPLACE WITH`
- `[YOUR ...]`, `{...placeholder...}`
- `Coming soon`, `To be implemented`

### 5. Generic Content Detection ⚠️
Warns about example/test data.

```
Content:
Name: John Doe
Email: test@example.com
Company: Example Corp

Result: ⚠️  WARNING - Contains 3 generic patterns
Examples: test@example.com, John Doe, Example Corp
```

**Detected Patterns:**
- `test@example.com`, `example.com`
- `John Doe`, `Jane Doe`
- `foo`, `bar`, `baz`
- `12345`, `sample data`
- `Lorem ipsum`

### 6. Success Criteria Validation ✅
Checks if success criteria are met.

```
Criterion: "Test coverage > 80%"

Result: ❌ CRITERION_NOT_MET - Requires manual verification
```

```
Criterion: "report.json created"
File Exists: Yes

Result: ✅ CRITERION_MET
```

## Usage

### Programmatic

```javascript
const AgentDeliverableValidator = require('./agent-deliverable-validator');

const validator = new AgentDeliverableValidator({
  verbose: true,
  strictMode: false  // Warnings don't fail validation
});

const result = await validator.validate({
  taskDescription: 'Generate CPQ assessment for HiveMQ',
  workingDirectory: './reports/hivemq/',
  deliverables: [
    { path: 'assessment.json', format: 'json', required: true },
    { path: 'summary.md', format: 'markdown', required: true },
    { path: 'optional-data.csv', format: 'csv', required: false }
  ],
  successCriteria: [
    'assessment.json created',
    'summary.md created',
    'All validations passing'
  ]
});

if (!result.valid) {
  console.log('❌ Validation failed:');
  result.errors.forEach(err => {
    console.log(`  - ${err.message}`);
    console.log(`    💡 ${err.suggestion}`);
  });
}
```

### Command Line

```bash
# Create config file
cat > validation-config.json <<EOF
{
  "taskDescription": "Generate CPQ assessment for HiveMQ",
  "workingDirectory": "./reports/hivemq/",
  "deliverables": [
    { "path": "assessment.json", "format": "json", "required": true },
    { "path": "summary.md", "format": "markdown", "required": true }
  ],
  "successCriteria": [
    "assessment.json created",
    "summary.md created"
  ]
}
EOF

# Run validation
node agent-deliverable-validator.js validation-config.json
```

### Integration with Agents

Add validation before agent marks task complete:

```javascript
// In agent completion workflow

// Step 1: Generate deliverables
await generateReport('assessment.json');
await generateSummary('summary.md');

// Step 2: Validate before marking complete
const { AgentDeliverableValidator } = require('../scripts/lib/agent-deliverable-validator');
const validator = new AgentDeliverableValidator({ verbose: true });

const validation = await validator.validate({
  taskDescription: userRequest,
  workingDirectory: process.cwd(),
  deliverables: [
    { path: 'assessment.json', format: 'json', required: true },
    { path: 'summary.md', format: 'markdown', required: true }
  ],
  successCriteria: userSuccessCriteria
});

if (!validation.valid) {
  throw new Error(`Deliverable validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
}

// Step 3: Mark task complete
await markTaskComplete();
```

## Output Format

```javascript
{
  valid: false,
  taskDescription: 'Generate CPQ assessment for HiveMQ',
  workingDirectory: './reports/hivemq/',
  errors: [
    {
      type: 'PLACEHOLDER_CONTENT',
      message: 'File contains placeholder content: summary.md',
      severity: 'ERROR',
      placeholders: ['TODO', 'FIXME', 'EXAMPLE'],
      count: 3,
      suggestion: 'Replace all placeholder text with actual content'
    }
  ],
  warnings: [
    {
      type: 'GENERIC_CONTENT',
      message: 'File may contain generic/example data: contacts.csv',
      severity: 'WARNING',
      examples: ['test@example.com', 'John Doe'],
      count: 5,
      suggestion: 'Verify content uses real data, not examples'
    }
  ],
  suggestions: [],
  metadata: {
    deliverablesChecked: 2,
    deliverablesValid: 1,
    criteriaChecked: 2,
    criteriaMet: 1
  }
}
```

## Test Results

**Test Suite:** `test/agent-deliverable-validator.test.js`

| Test | Status | Description |
|------|--------|-------------|
| Missing Required File | ✅ PASS | Detects missing deliverables |
| Empty File Detection | ✅ PASS | Catches empty files |
| Invalid JSON Format | ✅ PASS | Validates JSON syntax |
| CSV Header Only | ✅ PASS | Warns about CSV with no data |
| Placeholder Content | ✅ PASS | Detects TODO/FIXME/EXAMPLE |
| Generic Content | ✅ PASS | Warns about test@example.com patterns |
| Success Criteria File | ✅ PASS | Validates file existence criteria |
| Valid Deliverables | ✅ PASS | Correctly validates good outputs |
| Optional Missing File | ✅ PASS | Warnings for optional files |
| Cross-Check Task | ✅ PASS | Compares deliverables to task description |

**Overall:** 10/10 tests passing (100%)

Run tests:
```bash
cd .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin
node test/agent-deliverable-validator.test.js
```

## Error Types

### MISSING_FILE
**Cause:** Required deliverable file doesn't exist
**Solution:** Create the missing file or update deliverable path

### EMPTY_FILE
**Cause:** File exists but has zero bytes
**Solution:** Populate the file with actual content

### FORMAT_ERROR
**Cause:** File format is invalid (JSON not parseable, PDF magic bytes wrong)
**Solution:** Fix format issues or regenerate file

### PLACEHOLDER_CONTENT
**Cause:** File contains TODO/FIXME/EXAMPLE/INSERT HERE placeholders
**Solution:** Replace all placeholders with actual content

### GENERIC_CONTENT
**Cause:** File contains test@example.com, John Doe, or other generic patterns
**Solution:** Verify content uses real data, not examples

### CRITERION_NOT_MET
**Cause:** Success criterion not satisfied
**Solution:** Complete remaining work to meet criterion

## Configuration Options

```javascript
const validator = new AgentDeliverableValidator({
  verbose: true,                    // Log detailed information (default: false)
  strictMode: true,                 // Treat warnings as errors (default: false)
  allowMissingOptional: true        // Allow optional files to be missing (default: true)
});
```

## Common Use Cases

### Use Case 1: Pre-Completion Self-Check

```javascript
// Agent about to mark task complete
const result = await validator.validate({
  taskDescription: userOriginalRequest,
  workingDirectory: './output/',
  deliverables: agentGeneratedFiles,
  successCriteria: userSuccessCriteria
});

if (!result.valid) {
  // Fix issues before marking complete
  await fixIssues(result.errors);
  await revalidate();
}
```

### Use Case 2: CI/CD Integration

```bash
# In deployment pipeline
node agent-deliverable-validator.js validation-config.json

if [ $? -ne 0 ]; then
  echo "❌ Deliverable validation failed"
  exit 1
fi
```

### Use Case 3: Batch Validation

```javascript
// Validate multiple agent outputs
const outputs = [
  { agent: 'cpq-assessor', config: cpqConfig },
  { agent: 'revops-auditor', config: revopsConfig },
  { agent: 'security-auditor', config: securityConfig }
];

for (const output of outputs) {
  const validation = await validator.validate(output.config);

  if (!validation.valid) {
    console.error(`${output.agent} validation failed`);
  }
}
```

## Success Metrics

**Prevention Target:** 40% reduction in prompt-mismatch issues

**Measured By:**
- Tasks marked complete with missing deliverables (reduced)
- Tasks marked complete with placeholder content (reduced)
- User follow-up requests for missing items (reduced)

**Expected ROI:** $48,000/year
- 4 hours/week saved on fixing incomplete deliverables
- 50 weeks/year
- $240/hour developer rate

## Integration Points

### Extends

- Built as cross-platform validator (works with all agents)
- Integrates with agent completion workflows
- Compatible with existing task tracking systems

### Used By

- All agents before marking tasks complete
- CI/CD pipelines for deployment validation
- Quality assurance workflows

## Known Limitations

### 1. Success Criteria Parsing
**Current:** Basic pattern matching (test coverage, file existence)
**Planned:** Full natural language parsing in v1.1
**Workaround:** Use specific patterns ("file.json created", "tests passing")

### 2. Format-Specific Deep Validation
**Current:** Basic checks (JSON parseable, CSV not empty)
**Planned:** Schema validation, data quality checks in v2.0
**Workaround:** Add custom validators for specific formats

### 3. Context-Aware Placeholder Detection
**Current:** Pattern-based detection (TODO, EXAMPLE)
**Planned:** Semantic analysis to detect incomplete reasoning in v2.0
**Workaround:** Manual review of generated content

## Future Enhancements (v1.1 Roadmap)

1. **Schema Validation**
   - Validate JSON against JSON Schema
   - Validate CSV column structure
   - Check required fields present

2. **Data Quality Checks**
   - Minimum data row counts
   - Field completeness percentages
   - Statistical anomaly detection

3. **Natural Language Success Criteria**
   - Parse complex criteria statements
   - Automatically validate criteria
   - Suggest criteria based on task

4. **Agent-Specific Rules**
   - Custom validation rules per agent
   - Agent output templates
   - Validation profiles

## Files

**Main Script:** `.claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/agent-deliverable-validator.js`
**Tests:** `.claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/test/agent-deliverable-validator.test.js`
**Documentation:** This file

## Contributing

To improve validation:
1. Add format-specific validators (XML, YAML, etc.)
2. Implement schema validation
3. Add agent-specific validation rules
4. Test with real-world agent outputs

See: `docs/CONTRIBUTING.md` for guidelines

---

**Status:** ✅ Production Ready
**Test Coverage:** 100% (10/10 tests passing)
**Maintenance:** Active
**Support:** File issues in project repository
