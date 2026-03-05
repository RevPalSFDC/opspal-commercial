# Validator Telemetry Integration Guide

**Version**: 1.0.0
**Last Updated**: 2025-11-13
**Purpose**: Guide for integrating telemetry tracking into validators

## Overview

This guide shows how to add production telemetry tracking to pre-deployment validators. Telemetry enables real-world effectiveness measurement, ROI validation, and user feedback collection.

## Quick Start

### 1. Basic Integration (5 minutes)

Add telemetry to any validator with 3 lines of code:

```javascript
const ValidatorTelemetry = require('./validator-telemetry');

class MyValidator {
  constructor(options = {}) {
    // Initialize telemetry
    this.telemetry = new ValidatorTelemetry('my-validator', {
      enabled: options.telemetryEnabled !== false,
      verbose: options.verbose || false
    });
  }

  async validate(input) {
    const startTime = Date.now();

    // Your validation logic
    const errors = [];
    const warnings = [];

    // ... validation code ...

    // Log telemetry
    const result = {
      executionTime: Date.now() - startTime,
      errors,
      warnings,
      outcome: errors.length > 0 ? 'blocked' : 'passed'
    };

    this.telemetry.logValidation(result, {
      org: process.env.SF_ORG_ALIAS,
      operationType: 'field-deletion'  // Customize per operation
    });

    return result;
  }
}
```

### 2. Enable Telemetry

```bash
# Enable globally (recommended for production)
export VALIDATOR_TELEMETRY_ENABLED=1

# Or enable per-validator in constructor
const validator = new MyValidator({ telemetryEnabled: true });
```

### 3. View Telemetry Reports

```bash
# Generate report
node scripts/lib/validator-telemetry.js report my-validator

# Analyze effectiveness
node scripts/analyze-validator-telemetry.js
```

---

## Integration Examples

### Example 1: Metadata Dependency Analyzer

**Location**: `scripts/lib/metadata-dependency-analyzer.js`

```javascript
const ValidatorTelemetry = require('./validator-telemetry');

class MetadataDependencyAnalyzer {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.verbose = options.verbose || false;

    // Add telemetry
    this.telemetry = new ValidatorTelemetry('metadata-dependency-analyzer', {
      enabled: options.telemetryEnabled !== false,
      verbose: this.verbose
    });
  }

  async analyzeFieldDependencies(objectName, fieldName) {
    const startTime = Date.now();
    const errors = [];
    const warnings = [];

    try {
      // Check validation rules
      const validationRules = await this.checkValidationRules(objectName, fieldName);
      if (validationRules.length > 0) {
        errors.push({
          type: 'VALIDATION_RULE_DEPENDENCY',
          message: `Field referenced in ${validationRules.length} validation rules`,
          dependencies: validationRules
        });
      }

      // Check flows
      const flows = await this.checkFlows(objectName, fieldName);
      if (flows.length > 0) {
        errors.push({
          type: 'FLOW_DEPENDENCY',
          message: `Field referenced in ${flows.length} Flows`,
          dependencies: flows
        });
      }

      // Check layouts
      const layouts = await this.checkLayouts(objectName, fieldName);
      if (layouts.length > 0) {
        warnings.push({
          type: 'LAYOUT_DEPENDENCY',
          message: `Field appears on ${layouts.length} layouts`,
          dependencies: layouts
        });
      }

      // Log telemetry
      const result = {
        executionTime: Date.now() - startTime,
        errors,
        warnings,
        outcome: errors.length > 0 ? 'blocked' : (warnings.length > 0 ? 'warnings_only' : 'passed')
      };

      this.telemetry.logValidation(result, {
        org: this.orgAlias,
        user: process.env.USER_EMAIL,
        operationType: 'field-deletion',
        objectName,
        fieldName
      });

      return result;
    } catch (error) {
      // Log error case
      this.telemetry.logValidation({
        executionTime: Date.now() - startTime,
        errors: [{ type: 'ERROR', message: error.message }],
        warnings: [],
        outcome: 'error'
      }, {
        org: this.orgAlias,
        operationType: 'field-deletion',
        error: error.message
      });

      throw error;
    }
  }
}

module.exports = MetadataDependencyAnalyzer;
```

### Example 2: Flow XML Validator

**Location**: `scripts/lib/flow-xml-validator.js`

```javascript
const ValidatorTelemetry = require('./validator-telemetry');

class FlowXMLValidator {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.telemetry = new ValidatorTelemetry('flow-xml-validator', {
      enabled: options.telemetryEnabled !== false,
      verbose: this.verbose
    });
  }

  async validateFlow(flowXml, options = {}) {
    const startTime = Date.now();
    const errors = [];
    const warnings = [];

    try {
      // Syntax validation
      const syntaxErrors = await this.validateSyntax(flowXml);
      errors.push(...syntaxErrors);

      // Best practice validation
      const bestPracticeWarnings = await this.validateBestPractices(flowXml);
      warnings.push(...bestPracticeWarnings);

      // Governor limit checks
      const governorLimitWarnings = await this.validateGovernorLimits(flowXml);
      warnings.push(...governorLimitWarnings);

      // Auto-fix if enabled
      let autoFixed = false;
      if (options.autoFix && errors.some(e => e.fixable)) {
        await this.applyAutoFixes(flowXml, errors);
        autoFixed = true;
      }

      // Log telemetry
      const result = {
        executionTime: Date.now() - startTime,
        errors,
        warnings,
        outcome: errors.length > 0 ? 'blocked' : (warnings.length > 0 ? 'warnings_only' : 'passed')
      };

      this.telemetry.logValidation(result, {
        org: process.env.SF_ORG_ALIAS,
        user: process.env.USER_EMAIL,
        operationType: 'flow-deployment',
        flowName: this.extractFlowName(flowXml),
        autoFixed,
        bestPracticesEnabled: options.bestPractices || false
      });

      return result;
    } catch (error) {
      this.telemetry.logValidation({
        executionTime: Date.now() - startTime,
        errors: [{ type: 'ERROR', message: error.message }],
        warnings: [],
        outcome: 'error'
      }, {
        org: process.env.SF_ORG_ALIAS,
        operationType: 'flow-deployment',
        error: error.message
      });

      throw error;
    }
  }
}

module.exports = FlowXMLValidator;
```

### Example 3: CSV Parser Safe

**Location**: `scripts/lib/csv-parser-safe.js`

```javascript
const ValidatorTelemetry = require('./validator-telemetry');

class CSVParserSafe {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.telemetry = new ValidatorTelemetry('csv-parser-safe', {
      enabled: options.telemetryEnabled !== false,
      verbose: this.verbose
    });
  }

  async parseCSV(csvData, schema = null) {
    const startTime = Date.now();
    const errors = [];
    const warnings = [];

    try {
      // Detect and fix BOM
      if (csvData.charCodeAt(0) === 0xFEFF) {
        csvData = csvData.substring(1);
        warnings.push({ type: 'BOM_REMOVED', message: 'UTF-8 BOM detected and removed' });
      }

      // Normalize line endings
      const originalEndings = this.detectLineEndings(csvData);
      csvData = csvData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      if (originalEndings !== '\n') {
        warnings.push({ type: 'LINE_ENDINGS_NORMALIZED', message: `Converted ${originalEndings} to \\n` });
      }

      // Validate schema if provided
      if (schema) {
        const schemaErrors = this.validateSchema(csvData, schema);
        errors.push(...schemaErrors);
      }

      // Parse CSV
      const records = this.parse(csvData);

      // Log telemetry
      const result = {
        executionTime: Date.now() - startTime,
        errors,
        warnings,
        outcome: errors.length > 0 ? 'blocked' : (warnings.length > 0 ? 'warnings_only' : 'passed')
      };

      this.telemetry.logValidation(result, {
        org: process.env.SF_ORG_ALIAS,
        user: process.env.USER_EMAIL,
        operationType: 'csv-import',
        recordCount: records.length,
        hadBOM: warnings.some(w => w.type === 'BOM_REMOVED'),
        lineEndingsFixed: warnings.some(w => w.type === 'LINE_ENDINGS_NORMALIZED')
      });

      return { records, errors, warnings };
    } catch (error) {
      this.telemetry.logValidation({
        executionTime: Date.now() - startTime,
        errors: [{ type: 'ERROR', message: error.message }],
        warnings: [],
        outcome: 'error'
      }, {
        org: process.env.SF_ORG_ALIAS,
        operationType: 'csv-import',
        error: error.message
      });

      throw error;
    }
  }
}

module.exports = CSVParserSafe;
```

### Example 4: Automation Feasibility Analyzer

**Location**: `scripts/lib/automation-feasibility-analyzer.js`

```javascript
const ValidatorTelemetry = require('./validator-telemetry');

class AutomationFeasibilityAnalyzer {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.telemetry = new ValidatorTelemetry('automation-feasibility-analyzer', {
      enabled: options.telemetryEnabled !== false,
      verbose: this.verbose
    });
  }

  async analyzeFeasibility(request) {
    const startTime = Date.now();
    const errors = [];
    const warnings = [];

    try {
      // Extract intent
      const intent = this.extractIntent(request);

      // Analyze feasibility
      const analysis = await this.performAnalysis(intent);

      // Calculate score
      const score = this.calculateFeasibilityScore(analysis);

      // Check for expectation mismatches
      if (score < 30 && request.toLowerCase().includes('fully automated')) {
        errors.push({
          type: 'EXPECTATION_MISMATCH',
          message: 'Request expects full automation but is mostly manual (score: ' + score + '%)',
          recommendation: 'Set expectations: significant manual configuration required'
        });
      }

      // Check for complexity warnings
      if (analysis.estimatedEffort.total > 40) {
        warnings.push({
          type: 'HIGH_COMPLEXITY',
          message: 'Extremely complex request (70+ hours estimated)',
          recommendation: 'Consider breaking into smaller phases'
        });
      }

      // Log telemetry
      const result = {
        executionTime: Date.now() - startTime,
        errors,
        warnings,
        outcome: errors.length > 0 ? 'blocked' : (warnings.length > 0 ? 'warnings_only' : 'passed')
      };

      this.telemetry.logValidation(result, {
        org: process.env.SF_ORG_ALIAS,
        user: process.env.USER_EMAIL,
        operationType: 'feasibility-assessment',
        feasibilityScore: score,
        estimatedHours: analysis.estimatedEffort.total,
        automationLevel: analysis.feasibilityLevel
      });

      return { ...analysis, errors, warnings };
    } catch (error) {
      this.telemetry.logValidation({
        executionTime: Date.now() - startTime,
        errors: [{ type: 'ERROR', message: error.message }],
        warnings: [],
        outcome: 'error'
      }, {
        org: process.env.SF_ORG_ALIAS,
        operationType: 'feasibility-assessment',
        error: error.message
      });

      throw error;
    }
  }
}

module.exports = AutomationFeasibilityAnalyzer;
```

---

## Advanced Integration Patterns

### Pattern 1: Conditional Telemetry

Enable telemetry only in production:

```javascript
constructor(options = {}) {
  const isProduction = process.env.NODE_ENV === 'production';

  this.telemetry = new ValidatorTelemetry('my-validator', {
    enabled: isProduction && options.telemetryEnabled !== false,
    verbose: options.verbose || false
  });
}
```

### Pattern 2: Custom Metadata

Add validator-specific metadata:

```javascript
this.telemetry.logValidation(result, {
  org: this.orgAlias,
  user: process.env.USER_EMAIL,
  operationType: 'field-deletion',

  // Custom metadata
  objectName,
  fieldName,
  fieldType,
  dependencyCount: dependencies.length,
  validationRuleCount: validationRules.length,
  flowCount: flows.length,
  layoutCount: layouts.length
});
```

### Pattern 3: Performance Tracking

Track sub-operations for performance analysis:

```javascript
async validate(input) {
  const startTime = Date.now();
  const timings = {};

  // Track each operation
  const t1 = Date.now();
  const validationRules = await this.checkValidationRules();
  timings.validationRules = Date.now() - t1;

  const t2 = Date.now();
  const flows = await this.checkFlows();
  timings.flows = Date.now() - t2;

  const t3 = Date.now();
  const layouts = await this.checkLayouts();
  timings.layouts = Date.now() - t3;

  // Log with sub-timings
  this.telemetry.logValidation(result, {
    org: this.orgAlias,
    operationType: 'field-deletion',
    timings  // Include sub-operation timings
  });
}
```

### Pattern 4: User Feedback Prompts

Prompt users for feedback after validation:

```javascript
async validate(input) {
  const result = await this.performValidation(input);

  this.telemetry.logValidation(result, metadata);

  // Prompt for feedback (non-blocking)
  if (process.env.VALIDATOR_FEEDBACK_ENABLED === '1') {
    setTimeout(() => {
      console.log('\n📝 Help improve validation accuracy:');
      console.log(`   node scripts/submit-validator-feedback.js ${this.validatorName} ${new Date().toISOString()}`);
    }, 100);
  }

  return result;
}
```

---

## Testing Telemetry Integration

### Unit Test Example

```javascript
const ValidatorTelemetry = require('../scripts/lib/validator-telemetry');
const MetadataDependencyAnalyzer = require('../scripts/lib/metadata-dependency-analyzer');
const fs = require('fs');
const path = require('path');

describe('Telemetry Integration Tests', () => {
  const logDir = path.join(__dirname, '../logs/telemetry-test');
  const logFile = path.join(logDir, 'metadata-dependency-analyzer.jsonl');

  beforeEach(() => {
    // Clean up
    if (fs.existsSync(logFile)) {
      fs.unlinkSync(logFile);
    }
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(logFile)) {
      fs.unlinkSync(logFile);
    }
  });

  it('should log telemetry on validation', async () => {
    const analyzer = new MetadataDependencyAnalyzer('test-org', {
      telemetryEnabled: true,
      logDir
    });

    await analyzer.analyzeFieldDependencies('Account', 'Test__c');

    // Verify log file created
    expect(fs.existsSync(logFile)).toBe(true);

    // Parse log entry
    const logContent = fs.readFileSync(logFile, 'utf-8');
    const entry = JSON.parse(logContent.trim());

    // Verify structure
    expect(entry.validator).toBe('metadata-dependency-analyzer');
    expect(entry.executionTime).toBeGreaterThan(0);
    expect(entry.outcome).toBeDefined();
    expect(entry.metadata.org).toBe('test-org');
  });

  it('should not log when telemetry disabled', async () => {
    const analyzer = new MetadataDependencyAnalyzer('test-org', {
      telemetryEnabled: false,
      logDir
    });

    await analyzer.analyzeFieldDependencies('Account', 'Test__c');

    // Verify no log file created
    expect(fs.existsSync(logFile)).toBe(false);
  });

  it('should respect VALIDATOR_TELEMETRY_ENABLED=0', async () => {
    process.env.VALIDATOR_TELEMETRY_ENABLED = '0';

    const analyzer = new MetadataDependencyAnalyzer('test-org', {
      logDir
    });

    await analyzer.analyzeFieldDependencies('Account', 'Test__c');

    // Verify no log file created
    expect(fs.existsSync(logFile)).toBe(false);

    delete process.env.VALIDATOR_TELEMETRY_ENABLED;
  });
});
```

### Integration Test Example

```javascript
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

describe('End-to-End Telemetry Integration', () => {
  const logDir = path.join(__dirname, '../logs/telemetry');

  it('should log telemetry during real validation', () => {
    // Enable telemetry
    process.env.VALIDATOR_TELEMETRY_ENABLED = '1';

    // Run validator
    const result = execSync('node scripts/lib/metadata-dependency-analyzer.js test-org Account Test__c', {
      encoding: 'utf-8'
    });

    // Verify telemetry logged
    const logFile = path.join(logDir, 'metadata-dependency-analyzer.jsonl');
    expect(fs.existsSync(logFile)).toBe(true);

    // Parse and verify
    const logs = fs.readFileSync(logFile, 'utf-8').trim().split('\n');
    const lastEntry = JSON.parse(logs[logs.length - 1]);

    expect(lastEntry.validator).toBe('metadata-dependency-analyzer');
    expect(lastEntry.metadata.objectName).toBe('Account');
    expect(lastEntry.metadata.fieldName).toBe('Test__c');

    delete process.env.VALIDATOR_TELEMETRY_ENABLED;
  });

  it('should generate accurate statistics', () => {
    // Run validator multiple times
    for (let i = 0; i < 10; i++) {
      execSync('node scripts/lib/metadata-dependency-analyzer.js test-org Account Test__c');
    }

    // Generate report
    const report = execSync('node scripts/lib/validator-telemetry.js report metadata-dependency-analyzer', {
      encoding: 'utf-8'
    });

    expect(report).toContain('Total Validations: 10');
    expect(report).toContain('Average Execution Time:');
  });
});
```

---

## Troubleshooting

### Issue 1: Telemetry not logging

**Check**:
```bash
echo $VALIDATOR_TELEMETRY_ENABLED
# Should be 1 or not set (defaults to enabled)

# Verify log directory exists
ls -la logs/telemetry/
```

**Fix**:
```bash
export VALIDATOR_TELEMETRY_ENABLED=1
mkdir -p logs/telemetry
```

### Issue 2: Log file permission errors

**Check**:
```bash
ls -la logs/telemetry/*.jsonl
```

**Fix**:
```bash
chmod 644 logs/telemetry/*.jsonl
chown $USER logs/telemetry/*.jsonl
```

### Issue 3: JSON parse errors in log files

**Check**:
```bash
# Validate JSON
jq '.' logs/telemetry/metadata-dependency-analyzer.jsonl
```

**Fix**:
```bash
# Remove malformed entries
jq -c '.' logs/telemetry/metadata-dependency-analyzer.jsonl > temp.jsonl
mv temp.jsonl logs/telemetry/metadata-dependency-analyzer.jsonl
```

---

## Best Practices

### 1. Always Track Execution Time

```javascript
const startTime = Date.now();
// ... validation logic ...
const executionTime = Date.now() - startTime;
```

### 2. Use Consistent Operation Types

```javascript
// Good - consistent naming
operationType: 'field-deletion'
operationType: 'flow-deployment'
operationType: 'csv-import'
operationType: 'feasibility-assessment'

// Bad - inconsistent naming
operationType: 'delete field'
operationType: 'deploy_flow'
operationType: 'CSV Import'
```

### 3. Include Contextual Metadata

```javascript
this.telemetry.logValidation(result, {
  org: this.orgAlias,          // Required
  user: process.env.USER_EMAIL, // Required
  operationType: 'field-deletion', // Required

  // Contextual metadata
  objectName,
  fieldName,
  dependencyCount,
  // ... additional context
});
```

### 4. Handle Errors Gracefully

```javascript
try {
  const result = await this.performValidation(input);
  this.telemetry.logValidation(result, metadata);
  return result;
} catch (error) {
  this.telemetry.logValidation({
    executionTime: Date.now() - startTime,
    errors: [{ type: 'ERROR', message: error.message }],
    warnings: [],
    outcome: 'error'
  }, { ...metadata, error: error.message });

  throw error; // Re-throw for caller to handle
}
```

### 5. Test Telemetry Integration

Always add tests to verify:
- Telemetry logs when enabled
- Telemetry doesn't log when disabled
- Log entries have correct structure
- Statistics are calculated accurately

---

## Migration Checklist

For each validator to integrate telemetry:

- [ ] Import ValidatorTelemetry class
- [ ] Initialize telemetry in constructor
- [ ] Add execution time tracking
- [ ] Log validation results with metadata
- [ ] Handle error cases in logging
- [ ] Add unit tests for telemetry
- [ ] Add integration tests
- [ ] Update documentation
- [ ] Test with VALIDATOR_TELEMETRY_ENABLED=1
- [ ] Test with VALIDATOR_TELEMETRY_ENABLED=0
- [ ] Generate test report with analyze-validator-telemetry.js
- [ ] Verify log file format (JSONL)
- [ ] Commit and push changes

---

## Next Steps

After integrating telemetry into validators:

1. **Week 1: Internal Testing**
   - Enable telemetry in sandbox environment
   - Run 20+ test scenarios
   - Verify logging works correctly

2. **Week 2-3: Beta Testing**
   - Enable for 5-10 beta users
   - Monitor telemetry daily
   - Collect user feedback

3. **Week 4+: General Availability**
   - Enable for all users
   - Generate monthly ROI reports
   - Plan Phase 2 enhancements

---

**Last Updated**: 2025-11-13
**Version**: 1.0.0
**Maintained By**: RevPal Engineering
