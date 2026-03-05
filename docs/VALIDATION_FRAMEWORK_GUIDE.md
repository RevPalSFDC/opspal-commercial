# Validation Framework Guide

**Version**: 1.0.0
**Created**: 2026-01-06
**Target ROI**: $30,618 annually (611 errors prevented)

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Validation Stages](#validation-stages)
5. [Configuration](#configuration)
6. [Usage Examples](#usage-examples)
7. [Dashboard & Monitoring](#dashboard--monitoring)
8. [Integration Guide](#integration-guide)
9. [Extending the Framework](#extending-the-framework)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The Validation Framework provides comprehensive error prevention across all OpsPal operations through multi-stage validation with automatic blocking of CRITICAL errors.

### Key Features

- **Multi-Stage Validation**: Schema → Parse → Data Quality → Tool Contract → Permissions
- **Automatic Blocking**: CRITICAL errors prevent execution
- **Real-Time Monitoring**: Interactive dashboard with validation statistics
- **Performance Optimized**: <500ms end-to-end validation
- **Configurable Severity**: CRITICAL, HIGH, WARNING, INFO levels
- **Detailed Remediation**: Actionable error messages with fix suggestions

### Problem Solved

**Before**: 611 errors annually costing $29,898 in wasted time (averaging 15 min per error)

**After**: 60-80% reduction in errors through automatic validation

**Addressed Cohorts**:
- **schema/parse** (54 reflections): 80% reduction → $12,960 saved
- **data-quality** (37 reflections): 70% reduction → $9,063 saved
- **tool-contract** (42 reflections): 75% reduction → $7,875 saved
- **auth/permissions** (2 reflections): 60% reduction → $720 saved

---

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Validation Entry Points                       │
├─────────────────────────────────────────────────────────────────┤
│  Hook: pre-reflection-submit.sh  │  Hook: pre-tool-execution.sh │
│  API: UnifiedValidationPipeline  │  CLI: Direct validator calls │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│           Unified Validation Pipeline (Orchestrator)             │
├─────────────────────────────────────────────────────────────────┤
│  • Stage determination & sequencing                              │
│  • Parallel/sequential execution                                 │
│  • Short-circuit on CRITICAL errors                              │
│  • Result aggregation & reporting                                │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Validation Stages                          │
├────────────┬────────────┬─────────────┬──────────┬──────────────┤
│   Schema   │   Parse    │ Data Quality│  Tool    │  Permissions │
│  Registry  │   Error    │  Framework  │ Contract │  Validator   │
│            │  Handler   │             │          │              │
│  • AJV     │  • JSON    │  • Completeness│ • Param│ • Bulk ops │
│  • Caching │  • XML     │  • Authenticity│ • Types│ • FLS matrix│
│  • Multi-  │  • CSV     │  • Consistency │ • Enums│ • Cumulative│
│    stage   │  • Auto-fix│  • Freshness  │ • Rules│   perms     │
└────────────┴────────────┴─────────────┴──────────┴──────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Monitoring & Reporting                          │
├─────────────────────────────────────────────────────────────────┤
│  • Validation logs: ~/.claude/validation-logs/*.jsonl           │
│  • Dashboard generator: Interactive HTML with charts             │
│  • Real-time statistics: Pass rate, avg time, error trends      │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User Operation
    │
    ▼
Pre-Hook (if enabled)
    │
    ├─ Schema Validation ──> [PASS/WARN] ──┐
    │                                       │
    ├─ Parse Validation ───> [PASS/AUTO-FIX/FAIL] ─┐
    │                                               │
    ├─ Data Quality ──────> [SCORE: 0-100] ───────┤
    │                                               │
    ├─ Tool Contract ─────> [PASS/WARN/CRITICAL] ──┤
    │                                               │
    └─ Permissions ───────> [PASS/WARN/CRITICAL] ──┤
                                                    │
                                                    ▼
                                         Aggregate Results
                                                    │
                                                    ▼
                                         ┌─────────────────┐
                                         │  CRITICAL?      │
                                         └─────┬───────────┘
                                               │
                            ┌──────────────────┼──────────────────┐
                            │                  │                  │
                            ▼                  ▼                  ▼
                          BLOCK             WARN              PROCEED
                      (Exit 1)           (Exit 2)            (Exit 0)
                            │                  │                  │
                            └──────────────────┴──────────────────┘
                                               │
                                               ▼
                                      Log to validation logs
                                               │
                                               ▼
                                    Update dashboard statistics
```

---

## Quick Start

### Installation

All components are pre-installed in the opspal-core and salesforce-plugin.

### Enable Validation

**1. Enable pre-reflection-submit hook** (schema/parse validation):
```bash
# Already enabled by default in developer-tools-plugin
# Located at: .claude-plugins/developer-tools-plugin/hooks/pre-reflection-submit.sh
```

**2. Enable pre-tool-execution hook** (tool contract validation):
```bash
# Already enabled by default in opspal-core
# Located at: .claude-plugins/opspal-core/hooks/pre-tool-execution.sh
```

**3. (Optional) Disable validation temporarily**:
```bash
export SKIP_VALIDATION=1              # Skip all validation
export SKIP_TOOL_VALIDATION=1         # Skip tool contract validation only
```

### Quick Test

**Test schema validation**:
```bash
cd .claude-plugins/opspal-core
node scripts/lib/schema-registry.js list
# Shows: result-bundle, slide-spec, solution-catalog, task-spec
```

**Test tool contract validation**:
```bash
cd .claude-plugins/opspal-core
node scripts/lib/tool-contract-validator.js validate sf_data_query \
  --params '{"query":"SELECT Id FROM FlowDefinitionView"}'
# Should warn: Missing --use-tooling-api flag
```

**Test unified pipeline**:
```bash
cd .claude-plugins/opspal-core
cat > /tmp/test-context.json << 'EOF'
{
  "type": "tool",
  "toolName": "sf_data_query",
  "toolParams": {
    "query": "SELECT Id FROM Account"
  }
}
EOF

node scripts/lib/unified-validation-pipeline.js validate --context /tmp/test-context.json
```

**Generate dashboard**:
```bash
cd .claude-plugins/opspal-core
node scripts/lib/validation-dashboard-generator.js generate --days 30 \
  --output ./reports/validation-dashboard.html
```

---

## Validation Stages

### Stage 1: Schema Validation

**Purpose**: Validate data structure against JSON Schema definitions

**Files**: `.claude-plugins/opspal-core/scripts/lib/schema-registry.js`

**Capabilities**:
- AJV-based JSON Schema validation
- Schema caching for performance
- Multi-stage validation: structure → required fields → types → custom rules
- Detailed error messages with remediation

**Usage**:
```javascript
const SchemaRegistry = require('./schema-registry');
const registry = new SchemaRegistry();
registry.loadAllSchemas();

const result = await registry.validate(data, 'reflection');
// result: { valid, errors, warnings, validationTime }
```

**CLI**:
```bash
node scripts/lib/schema-registry.js list                    # List schemas
node scripts/lib/schema-registry.js validate data.json reflection
node scripts/lib/schema-registry.js stats                    # Show statistics
```

**Schemas Location**: `.claude-plugins/opspal-core/schemas/*.json`

---

### Stage 2: Parse Validation

**Purpose**: Gracefully parse JSON/XML/CSV with auto-fix capabilities

**Files**: `.claude-plugins/opspal-core/scripts/lib/parse-error-handler.js`

**Capabilities**:
- Multi-format support (JSON, XML, CSV, YAML)
- Line-level error reporting with context
- Auto-fix common issues (trailing commas, encoding, line endings)
- Partial parse recovery
- Encoding detection and normalization

**Auto-Fix Patterns**:
- Trailing commas in JSON: `,}` → `}`
- Unescaped quotes in strings
- Mixed line endings (CRLF/LF normalization)
- BOM markers in UTF-8
- Invalid XML entities

**Usage**:
```javascript
const ParseErrorHandler = require('./parse-error-handler');
const handler = new ParseErrorHandler();

const result = await handler.parse(content, 'json', { autoFix: true });
// result: { success, format, parsed, errors, parseTime }
```

**CLI**:
```bash
node scripts/lib/parse-error-handler.js parse file.json --format json
node scripts/lib/parse-error-handler.js auto-fix file.json --dry-run
```

---

### Stage 3: Data Quality Validation

**Purpose**: Detect synthetic data, fakes, and quality issues

**Files**: `.claude-plugins/opspal-salesforce/scripts/lib/enhanced-data-quality-framework.js`

**Capabilities**:
- **Completeness**: Field coverage, value density, outlier detection
- **Authenticity**: 20+ synthetic data patterns, fake ID detection
- **Consistency**: Cross-field validation, temporal consistency
- **Freshness**: Staleness indicators, last modified checks

**Quality Score Formula**:
```
Score = (completeness * 0.3) + (authenticity * 0.3) +
        (consistency * 0.25) + (freshness * 0.15)

Thresholds:
  90-100: EXCELLENT (green, proceed)
  70-89:  GOOD (yellow, warn)
  50-69:  FAIR (orange, review required)
  0-49:   POOR (red, BLOCK analysis)
```

**Synthetic Patterns Detected**:
- Generic naming: "Lead 1", "Opportunity 23", "Test Account"
- Fake Salesforce IDs: `00Q000000000000045`
- Round percentages: 15%, 30%, 45%
- Placeholder values: "Example Corp", "N/A", "TBD"

**Usage**:
```javascript
const EnhancedDataQualityFramework = require('./enhanced-data-quality-framework');
const framework = new EnhancedDataQualityFramework();

const result = await framework.validate(queryResult, expectedSchema);
// result: { qualityScore, qualityLevel, shouldBlock, issues, layerScores }
```

**CLI**:
```bash
cd .claude-plugins/opspal-salesforce
node scripts/lib/enhanced-data-quality-framework.js validate \
  --data '[{"Name":"Lead 1"},{"Name":"Test Account"}]'
# Should detect synthetic patterns
```

---

### Stage 4: Tool Contract Validation

**Purpose**: Validate tool invocations against contracts

**Files**:
- `.claude-plugins/opspal-core/scripts/lib/tool-contract-validator.js`
- `.claude-plugins/opspal-core/config/tool-contracts/*.json`

**Capabilities**:
- Required parameter validation
- Type checking (string, boolean, array, object)
- Enum value validation
- Range checks (min/max)
- Regex pattern validation
- Conditional requirements (tool-specific rules)

**Example Contract** (sf_data_query):
```json
{
  "required": ["query"],
  "optional": ["target-org", "use-tooling-api"],
  "rules": [
    {
      "name": "tooling_api_required_for_metadata",
      "pattern": "(FlowDefinitionView|FlexiPage|Layout)",
      "requires": ["use-tooling-api"],
      "severity": "CRITICAL",
      "message": "Metadata objects require --use-tooling-api flag"
    }
  ]
}
```

**Usage**:
```javascript
const ToolContractValidator = require('./tool-contract-validator');
const validator = new ToolContractValidator();
validator.loadContracts();

const result = await validator.validate('sf_data_query', params);
// result: { valid, errors, warnings, validationTime }
```

**CLI**:
```bash
node scripts/lib/tool-contract-validator.js list
node scripts/lib/tool-contract-validator.js validate sf_data_query \
  --params '{"query":"SELECT Id FROM FlowDefinitionView"}'
```

---

### Stage 5: Permission Validation

**Purpose**: Validate bulk operations and field-level security

**Files**: `.claude-plugins/opspal-salesforce/scripts/lib/validators/enhanced-permission-validator.js`

**Capabilities**:
- Bulk operation validation (delete, update, transfer)
- Field-level security (FLS) matrix checking
- Cumulative permission analysis (profile + permission sets)
- Production environment safeguards

**Usage**:
```javascript
const EnhancedPermissionValidator = require('./enhanced-permission-validator');
const validator = new EnhancedPermissionValidator('my-org');

// Bulk operation
const result = await validator.validateBulkOperation(
  'Account',
  'delete',
  recordIds,
  { targetOrg: 'production' }
);

// Field-level security
const flsResult = await validator.validateFieldLevelSecurity(
  'Account',
  ['Name', 'Phone', 'Industry'],
  'editable'
);
```

**CLI**:
```bash
cd .claude-plugins/opspal-salesforce
node scripts/lib/validators/enhanced-permission-validator.js bulk Account delete \
  --count 500 --org my-sandbox
node scripts/lib/validators/enhanced-permission-validator.js fls Account \
  --fields "Name,Phone,Industry" --access editable --org my-sandbox
```

---

## Configuration

### Pipeline Configuration

**File**: `.claude-plugins/opspal-core/config/validation-pipeline.json`

```json
{
  "stages": {
    "schema": {
      "enabled": true,
      "blocking": true,
      "warningMode": false
    },
    "parse": {
      "enabled": true,
      "blocking": true,
      "warningMode": false,
      "autoFix": true
    },
    "dataQuality": {
      "enabled": true,
      "threshold": 70,
      "blocking": "criticalOnly",
      "blockThreshold": 50
    },
    "toolContract": {
      "enabled": true,
      "blocking": true,
      "warningMode": false
    },
    "permissions": {
      "enabled": true,
      "blocking": true,
      "warningMode": false
    }
  },
  "parallelization": {
    "enabled": true,
    "maxConcurrent": 3
  },
  "performance": {
    "timeoutMs": 500,
    "stageTimeoutMs": 200
  }
}
```

### Environment Variables

```bash
# Disable all validation
export SKIP_VALIDATION=1

# Disable tool contract validation only
export SKIP_TOOL_VALIDATION=1

# Enable verbose logging
export VALIDATION_VERBOSE=1

# Custom logs directory
export VALIDATION_LOGS_DIR=~/.claude/validation-logs
```

---

## Usage Examples

### Example 1: Validate Reflection Before Submission

```bash
# Automatic via hook - runs before every reflection submission
/reflect

# Manual validation
bash .claude-plugins/developer-tools-plugin/hooks/pre-reflection-submit.sh \
  ./my-reflection.json
```

### Example 2: Validate Tool Invocation

```bash
# Automatic via hook - runs before sf/mcp tool execution
sf data query --query "SELECT Id FROM FlowDefinitionView"
# Hook detects missing --use-tooling-api flag and blocks

# Manual validation
bash .claude-plugins/opspal-core/hooks/pre-tool-execution.sh \
  "sf data query --query 'SELECT Id FROM FlowDefinitionView'"
```

### Example 3: Validate Data Quality

```javascript
const EnhancedDataQualityFramework = require('./enhanced-data-quality-framework');
const framework = new EnhancedDataQualityFramework();

const salesforceData = await runQuery('SELECT Name, Amount FROM Opportunity');

const result = await framework.validate(salesforceData, {
  expectedFields: ['Name', 'Amount'],
  requiredFields: ['Name']
});

if (result.qualityScore < 70) {
  console.log(`⚠️  Data quality: ${result.qualityLevel} (${result.qualityScore}/100)`);
  console.log('Issues:', result.issues);
}

if (result.shouldBlock) {
  console.log('❌ Data quality too low - blocking analysis');
  process.exit(1);
}
```

### Example 4: Unified Pipeline Validation

```javascript
const UnifiedValidationPipeline = require('./unified-validation-pipeline');
const pipeline = new UnifiedValidationPipeline({ verbose: true });

const context = {
  type: 'data',
  data: myData,
  schemaName: 'task-spec',
  format: 'json',
  toolName: 'sf_data_query',
  toolParams: { query: 'SELECT Id FROM Account' },
  orgAlias: 'production',
  operation: 'bulk',
  objectType: 'Account',
  operationType: 'delete',
  recordIds: ['001...']
};

const result = await pipeline.validate(context);

if (result.blocked) {
  console.log('❌ Validation FAILED - operation blocked');
  console.log(`Errors: ${result.summary.criticalErrors} CRITICAL`);
  result.errors.forEach(e => console.log(`  • ${e.message}`));
  process.exit(1);
}

console.log('✅ Validation passed');
```

---

## Dashboard & Monitoring

### Generate Dashboard

```bash
cd .claude-plugins/opspal-core
node scripts/lib/validation-dashboard-generator.js generate \
  --days 30 \
  --output ./reports/validation-dashboard.html

# Open in browser
xdg-open ./reports/validation-dashboard.html  # Linux
open ./reports/validation-dashboard.html      # macOS
```

### Dashboard Components

The dashboard includes:

1. **KPI Cards**:
   - Total Validations
   - Pass Rate (target: >95%)
   - Avg Validation Time (target: <100ms)
   - Block Rate (target: <5%)

2. **Stage Performance Bar Chart**:
   - Validations by stage
   - Pass/fail breakdown

3. **Error Trends Line Chart**:
   - Total errors over time
   - Blocked operations
   - 7-day moving average

4. **Severity Distribution Pie Chart**:
   - CRITICAL, HIGH, WARNING, INFO breakdown

5. **Top Issues Table**:
   - Most frequent errors
   - Severity, stage, message
   - Sorted by occurrence count

### Validation Logs

**Location**: `~/.claude/validation-logs/*.jsonl`

**Format**: JSON Lines (one JSON object per line)

**Example Log Entry**:
```json
{
  "timestamp": "2026-01-06T10:00:00Z",
  "valid": true,
  "blocked": false,
  "validationTime": 15,
  "stages": {
    "schema": {"valid": true},
    "toolContract": {"valid": true}
  },
  "errors": [],
  "warnings": []
}
```

---

## Integration Guide

### Integrate with Agents

**Add to agent backstory**:
```markdown
Before any operation that modifies data or executes commands, you MUST:

1. Call the unified validation pipeline
2. Check for CRITICAL errors
3. Block execution if validation fails
4. Provide detailed error messages to the user

Example:
```javascript
const pipeline = require('./unified-validation-pipeline');
const result = await pipeline.validate(context);
if (result.blocked) {
  throw new Error(`Validation failed: ${result.summary.criticalErrors} CRITICAL errors`);
}
```

### Integrate with Workflows

**Pre-execution validation**:
```javascript
async function executeWorkflow(workflowData) {
  // Validate before execution
  const validator = new SchemaRegistry();
  const result = await validator.validate(workflowData, 'workflow-spec');

  if (!result.valid) {
    throw new Error(`Invalid workflow: ${result.errors.map(e => e.message).join(', ')}`);
  }

  // Proceed with execution
  return await runWorkflow(workflowData);
}
```

### Integrate with MCP Tools

**Add validation wrapper**:
```javascript
async function validateMCPCall(toolName, params) {
  const validator = new ToolContractValidator();
  const result = await validator.validate(toolName, params);

  if (!result.valid) {
    const criticalErrors = result.errors.filter(e => e.severity === 'CRITICAL');
    if (criticalErrors.length > 0) {
      throw new Error(`MCP call validation failed: ${criticalErrors[0].message}`);
    }
  }

  return result;
}
```

---

## Extending the Framework

### Add a New Schema

**1. Create schema file**: `.claude-plugins/opspal-core/schemas/my-schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id", "name"],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^[a-z0-9_]+$"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    }
  }
}
```

**2. Register in schema registry** (automatic on `loadAllSchemas()`)

**3. Use in validation**:
```javascript
const result = await registry.validate(data, 'my-schema');
```

### Add a New Tool Contract

**1. Create contract file**: `.claude-plugins/opspal-core/config/tool-contracts/my-tools.json`

```json
{
  "my_custom_tool": {
    "description": "My custom tool contract",
    "required": ["param1"],
    "optional": ["param2"],
    "types": {
      "param1": "string",
      "param2": "number"
    },
    "enums": {
      "param1": ["value1", "value2"]
    },
    "rules": [
      {
        "name": "my_rule",
        "condition": {
          "param": "param1",
          "value": "value1",
          "operator": "="
        },
        "requires": ["param2"],
        "severity": "CRITICAL",
        "message": "param2 is required when param1 is value1"
      }
    ]
  }
}
```

**2. Load contracts** (automatic on `loadContracts()`)

**3. Use in validation**:
```javascript
const result = await validator.validate('my_custom_tool', params);
```

### Add a New Validator

**1. Create validator class**:
```javascript
class MyCustomValidator {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
  }

  async validate(data, options = {}) {
    // Validation logic
    return {
      valid: true,
      errors: [],
      warnings: [],
      validationTime: Date.now() - startTime
    };
  }
}
```

**2. Integrate into pipeline**:
```javascript
// In unified-validation-pipeline.js
this.validators.myCustom = new MyCustomValidator({ verbose: this.verbose });
```

**3. Add stage configuration**:
```json
{
  "stages": {
    "myCustom": {
      "enabled": true,
      "blocking": true
    }
  }
}
```

---

## Troubleshooting

### Validation Always Passes

**Check**:
1. Validation is enabled: `echo $SKIP_VALIDATION` (should be empty or 0)
2. Hooks are executable: `ls -la .claude-plugins/*/hooks/*.sh`
3. Contracts/schemas loaded: Run `list` command for each validator

**Fix**:
```bash
# Re-enable validation
unset SKIP_VALIDATION
unset SKIP_TOOL_VALIDATION

# Make hooks executable
chmod +x .claude-plugins/*/hooks/*.sh

# Reload contracts
node scripts/lib/tool-contract-validator.js list
node scripts/lib/schema-registry.js list
```

### False Positives

**Check**:
1. Contract definitions are accurate
2. Schema allows expected data shapes
3. Data quality thresholds are appropriate

**Fix**:
```bash
# Adjust data quality threshold
# In validation-pipeline.json:
{
  "stages": {
    "dataQuality": {
      "threshold": 60  # Lower threshold
    }
  }
}

# Skip specific validation temporarily
export SKIP_TOOL_VALIDATION=1
```

### Performance Issues

**Check**:
1. Validation time: Should be <500ms total
2. Stage timeouts: Should be <200ms per stage
3. Cache hits: Should be >80%

**Fix**:
```bash
# Check statistics
node scripts/lib/unified-validation-pipeline.js stats
node scripts/lib/schema-registry.js stats

# Increase timeouts if needed
# In validation-pipeline.json:
{
  "performance": {
    "timeoutMs": 1000,      # Increase from 500ms
    "stageTimeoutMs": 400   # Increase from 200ms
  }
}
```

### Dashboard Not Generating

**Check**:
1. Logs directory exists: `~/.claude/validation-logs/`
2. Logs have valid JSON: `cat ~/.claude/validation-logs/*.jsonl | jq .`
3. Output directory is writable

**Fix**:
```bash
# Create logs directory
mkdir -p ~/.claude/validation-logs

# Check log format
head -1 ~/.claude/validation-logs/*.jsonl | jq .

# Generate with verbose output
node scripts/lib/validation-dashboard-generator.js generate --days 30 2>&1 | tee /tmp/dashboard-gen.log
```

---

## Success Metrics

### Primary Metrics (Target)

| Metric | Target | Measure |
|--------|--------|---------|
| Reflection reduction | 60-80% | Count schema/parse/data-quality reflections over 90 days |
| Validation pass rate | >95% | Legitimate operations should pass |
| Error detection rate | >90% | Catch issues before execution |
| Performance | <500ms | Pipeline end-to-end time |

### Secondary Metrics

| Metric | Target | Measure |
|--------|--------|---------|
| Time savings | 255 hrs/year | 15 min avg per prevented error |
| Developer satisfaction | >4/5 | "Validation messages are helpful" rating |
| False positive rate | <5% | Incorrectly blocked valid operations |
| Adoption rate | >90% | Agents using validation within 30 days |

### Monitoring Dashboard

- **URL**: `file://./reports/validation-dashboard.html`
- **Update Frequency**: Generate weekly or after significant changes
- **Key Indicators**:
  - Pass rate trending toward 95%+
  - Block rate <5% (low false positives)
  - Avg validation time <100ms (good performance)
  - Error trends decreasing over time

---

## Next Steps

1. **Run validation tests**: Execute quick test commands from Quick Start section
2. **Generate baseline dashboard**: Create initial dashboard to establish metrics
3. **Review integration points**: Check where validation should be added to agents
4. **Plan rollout**: Start with 10% of operations, monitor for 7 days, then scale
5. **Train team**: Share this guide with team members and conduct walkthrough

---

## Support

- **Issues**: GitHub Issues at https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues
- **Feedback**: Use `/reflect` command to submit improvement suggestions
- **Documentation**: This guide + additional guides in `docs/` directory

---

**Last Updated**: 2026-01-06
**Maintained By**: OpsPal Core Team
