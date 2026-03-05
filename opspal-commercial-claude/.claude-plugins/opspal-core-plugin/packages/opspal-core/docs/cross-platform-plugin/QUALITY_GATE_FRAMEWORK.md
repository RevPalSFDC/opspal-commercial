# Quality Gate Framework

**Version**: 1.0.0
**Status**: ✅ Production Ready
**Created**: 2025-10-24
**Addresses**: Cohort #1 - Agent Behavior Issues ($20k ROI)

## Overview

The Quality Gate Framework validates task deliverables before allowing success declarations, preventing:
- ❌ Unverified success claims
- ❌ Incomplete deliverables
- ❌ Missing post-execution verification
- ❌ Deliverables that don't match requirements

### What It Does

- **Validates** task deliverables against requirements
- **Blocks** success messages until quality gates pass
- **Provides** clear recommendations for failed checks
- **Tracks** validation statistics and success rates

### Benefits

- **Prevents** 8 types of quality issues (from Cohort #1 analysis)
- **Ensures** deliverables match specifications
- **Reduces** rework from incomplete tasks
- **Improves** overall task quality and accuracy

---

## Quick Start

### 1. Basic Usage

```javascript
const QualityGateValidator = require('./scripts/lib/quality-gate-validator');

const validator = new QualityGateValidator();

const taskContext = {
    type: 'report_generation',
    description: 'Generate automation audit report'
};

const deliverable = {
    filePath: './reports/automation-audit.md',
    status: 'success',
    verified: true
};

const result = await validator.validate(taskContext, deliverable);

if (!result.passed) {
    console.error('❌ Quality gate failed:', result.failedChecks);
    // Block success message
} else {
    console.log('✅ Quality gate passed');
    // Allow success message
}
```

### 2. CLI Usage

```bash
# Validate a deliverable
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/quality-gate-validator.js \
  report_generation \
  ./reports/my-report.md

# Exit codes:
#   0 - Validation passed
#   1 - Validation failed
```

### 3. Hook Integration

```bash
# Verify task before declaring success
bash .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/hooks/post-task-verification.sh <<EOF
{
  "taskType": "deployment",
  "deliverable": {
    "status": "success",
    "deploymentId": "12345",
    "verified": true,
    "testResults": { "passed": 25, "failed": 0 }
  }
}
EOF
```

---

## Supported Task Types

| Task Type | Description | Critical Checks |
|-----------|-------------|-----------------|
| **report_generation** | Reports and documentation | File exists, required sections, no placeholders |
| **deployment** | Code/metadata deployments | Deployment succeeded, changes verified, tests passed |
| **data_operation** | Data imports/updates | Operation completed, record count matches, errors handled |
| **configuration** | System configuration | Config applied, verified in system, backup created |
| **flow_development** | Salesforce Flow development | Flow deployed/activated, field references valid, smoke test passed |
| **metadata_change** | Metadata modifications | Metadata deployed, verified, dependencies resolved |
| **api_integration** | API integrations | Connection tested, auth validated, sample request succeeded |
| **analysis_task** | Analysis and assessments | Data collected, analysis documented, recommendations provided |
| **bulk_operation** | Bulk data operations | Operation completed, success rate acceptable, errors analyzed |
| **security_change** | Security modifications | Change applied, access verified, audit trail present |

---

## Quality Checks

### Check Severity Levels

- **CRITICAL**: Must pass - blocks task completion
- **HIGH**: Should pass - generates warnings
- **MEDIUM**: Nice to have - informational
- **LOW**: Optional - best practices

### Common Checks

#### File Existence
```javascript
{
  "name": "file_exists",
  "description": "Report file must exist",
  "severity": "CRITICAL",
  "validator": "fileExists"
}
```

#### Required Sections
```javascript
{
  "name": "minimum_sections",
  "description": "Report must have required sections",
  "severity": "HIGH",
  "validator": "hasRequiredSections",
  "params": {
    "requiredSections": ["Summary", "Findings", "Recommendations"]
  }
}
```

#### No Placeholders
```javascript
{
  "name": "data_completeness",
  "description": "Report must contain actual data, not placeholders",
  "severity": "HIGH",
  "validator": "noPlaceholders"
}
```

#### Deployment Success
```javascript
{
  "name": "deployment_status",
  "description": "Deployment must have succeeded",
  "severity": "CRITICAL",
  "validator": "deploymentSucceeded"
}
```

#### Post-Deployment Verification
```javascript
{
  "name": "post_deployment_verification",
  "description": "Changes must be verified in target environment",
  "severity": "HIGH",
  "validator": "changesVerified"
}
```

---

## Deliverable Format

The `deliverable` object should contain relevant information for validation:

### Report Generation
```javascript
{
  "filePath": "./reports/audit-report.md",
  "content": "Full report content...", // Optional if filePath provided
  "status": "success"
}
```

### Deployment
```javascript
{
  "status": "success",
  "deploymentStatus": "Succeeded",
  "deploymentId": "0Af...",
  "verified": true,
  "testResults": {
    "passed": 25,
    "failed": 0
  },
  "output": "Successfully deployed 5 components..."
}
```

### Data Operation
```javascript
{
  "status": "completed",
  "recordsExpected": 1000,
  "recordsProcessed": 1000,
  "errorCount": 0,
  "errors": [],
  "errorsDocumented": true
}
```

### Configuration
```javascript
{
  "applied": true,
  "verified": true,
  "configurationSet": true,
  "backupCreated": true,
  "backupPath": "./backups/config-2025-10-24.json"
}
```

---

## Agent Integration

### Pattern 1: Pre-Success Validation

Agents should validate deliverables before declaring success:

```markdown
# Agent Workflow

1. **Perform Task** - Execute the requested operation
2. **Collect Deliverable Info** - Gather output, file paths, results
3. **Run Quality Gate** - Validate using QualityGateValidator
4. **Handle Result**:
   - ✅ PASSED → Declare success
   - ❌ FAILED → List failures, provide recommendations, DO NOT declare success
```

### Pattern 2: Automatic Verification

Add quality gate checks to agent task completion:

```javascript
// At end of agent task
const validator = new QualityGateValidator();
const result = await validator.validate(taskContext, deliverable);

if (!result.passed) {
    // Report failures
    console.error('Quality gate validation failed:');
    for (const failure of result.failedChecks) {
        console.error(`[${failure.severity}] ${failure.name}: ${failure.message}`);
    }

    // Provide recommendations
    console.log('\nRecommendations:');
    for (const rec of result.recommendations) {
        console.log(`- ${rec.recommendation}`);
    }

    // Block success message
    throw new Error('Quality gate validation failed - see failures above');
}

// Proceed with success message
console.log('✅ Task completed successfully (quality gates passed)');
```

### Pattern 3: Hook-Based Validation

Use the post-task verification hook:

```bash
# Add to agent workflow
bash $CLAUDE_PLUGIN_ROOT/cross-platform-plugin/hooks/post-task-verification.sh <<EOF
{
  "taskType": "deployment",
  "deliverable": $DELIVERABLE_JSON
}
EOF

if [ $? -eq 0 ]; then
    echo "✅ Quality gates passed"
else
    echo "❌ Quality gates failed"
    exit 1
fi
```

---

## Custom Validation Rules

### Adding New Task Types

Edit `.claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/config/quality-gate-rules.json`:

```json
{
  "my_custom_task": {
    "description": "Validate custom task type",
    "checks": [
      {
        "name": "custom_check",
        "description": "Custom validation logic",
        "severity": "CRITICAL",
        "validator": "myCustomValidator",
        "params": {
          "customParam": "value"
        }
      }
    ]
  }
}
```

### Adding Custom Validators

Extend `QualityGateValidator` class in `quality-gate-validator.js`:

```javascript
async myCustomValidator(taskContext, deliverable, params) {
    // Custom validation logic
    const isValid = /* your logic */;

    return {
        passed: isValid,
        message: isValid ? 'Custom check passed' : 'Custom check failed',
        details: {
            /* additional context */
        }
    };
}
```

---

## Validation Result Format

```json
{
  "passed": false,
  "taskType": "deployment",
  "timestamp": "2025-10-24T12:34:56.789Z",
  "checks": [
    {
      "name": "deployment_status",
      "description": "Deployment must have succeeded",
      "severity": "CRITICAL",
      "passed": true,
      "message": "Deployment succeeded"
    },
    {
      "name": "post_deployment_verification",
      "description": "Changes must be verified in target environment",
      "severity": "HIGH",
      "passed": false,
      "message": "No post-deployment verification performed",
      "details": {
        "recommendation": "Run verification query or check to confirm changes"
      }
    }
  ],
  "failedChecks": [
    {
      "name": "post_deployment_verification",
      "severity": "HIGH",
      "message": "No post-deployment verification performed"
    }
  ],
  "criticalFailures": [],
  "recommendations": [
    {
      "check": "post_deployment_verification",
      "recommendation": "Run verification query or check to confirm changes",
      "severity": "HIGH"
    },
    {
      "check": "general",
      "recommendation": "Address all critical failures before declaring task complete",
      "severity": "CRITICAL"
    }
  ]
}
```

---

## Statistics Tracking

The validator tracks validation statistics:

```javascript
const stats = validator.getStats();
console.log(stats);

// Output:
// {
//   totalValidations: 42,
//   passed: 38,
//   failed: 4,
//   successRate: "90.5%",
//   byTaskType: {
//     deployment: { passed: 15, failed: 2 },
//     report_generation: { passed: 20, failed: 1 },
//     data_operation: { passed: 3, failed: 1 }
//   }
// }
```

---

## Testing

### Unit Testing

```javascript
const validator = new QualityGateValidator({ verbose: true });

// Test report generation
const result = await validator.validate(
    { type: 'report_generation' },
    {
        filePath: './test-report.md',
        status: 'success'
    }
);

console.assert(result.passed, 'Validation should pass');
```

### Integration Testing

```bash
# Create test deliverable
echo "# Test Report" > /tmp/test-report.md
echo "" >> /tmp/test-report.md
echo "## Summary" >> /tmp/test-report.md
echo "Test summary content" >> /tmp/test-report.md
echo "" >> /tmp/test-report.md
echo "## Findings" >> /tmp/test-report.md
echo "Test findings content" >> /tmp/test-report.md
echo "" >> /tmp/test-report.md
echo "## Recommendations" >> /tmp/test-report.md
echo "Test recommendations content" >> /tmp/test-report.md

# Run validation
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/quality-gate-validator.js \
  report_generation \
  /tmp/test-report.md

# Check exit code
if [ $? -eq 0 ]; then
    echo "✅ Test passed"
else
    echo "❌ Test failed"
fi
```

---

## Troubleshooting

### Issue: Validator not found

**Error**: `Quality gate validator not found`

**Solution**: Ensure the validator script exists at:
```
.claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/quality-gate-validator.js
```

### Issue: Rules file not found

**Error**: `Failed to load rules from...`

**Solution**: The validator will use default rules. To use custom rules, create:
```
.claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/config/quality-gate-rules.json
```

### Issue: Validation always passes

**Cause**: No rules defined for task type

**Solution**: Add rules for your task type in `quality-gate-rules.json` or use an existing task type.

### Issue: False failures

**Cause**: Deliverable format doesn't match expected structure

**Solution**: Ensure your deliverable object includes the required fields for the validator (e.g., `status`, `verified`, `filePath`).

---

## ROI Calculation

### Time Saved

Based on Cohort #1 analysis:
- 8 reflections with quality/routing issues
- Average 2 hours per issue (initial + rework)
- **16 hours saved** per month

### Annual Value

- **192 hours/year** × $150/hour = **$28,800/year**
- Plus: Reduced user frustration, improved task quality
- **Total ROI: $20,000/year** (conservative estimate)

### Payback Period

- **Implementation**: 11 hours
- **Payback**: 2.0 months

---

## Future Enhancements

### Planned Features

1. **Machine Learning Integration**: Learn from past validations to improve rules
2. **Custom Validator Plugins**: Allow third-party validators
3. **Real-time Validation**: Stream validation as task progresses
4. **Dashboard**: Web UI for validation statistics
5. **Auto-Fix Suggestions**: Automatically fix common validation failures

### Contributing

To add new validators or improve existing ones:
1. Edit `quality-gate-validator.js`
2. Add/modify rules in `quality-gate-rules.json`
3. Test with various task types
4. Submit changes for review

---

## Related Documentation

- [Proactive Agent Routing](../../salesforce-plugin/PROACTIVE_AGENT_ROUTING_IMPLEMENTATION.md) - Agent routing system
- [Error Prevention System](../../salesforce-plugin/docs/ERROR_PREVENTION_SYSTEM.md) - Command-level error prevention
- [Agent Usage Examples](../../AGENT_USAGE_EXAMPLES.md) - Agent integration patterns

---

**Last Updated**: 2025-10-24
**Maintained By**: RevPal Engineering
**Contact**: Support via reflection system (`/reflect`)
