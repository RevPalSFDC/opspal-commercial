# User Expectation Tracker

**Version:** 1.0.0
**Created:** 2025-10-26
**ROI:** $36,000/year
**Addresses:** Reflection Cohort - User Preference Violations

## Purpose

Tracks user preferences, corrections, and validation expectations across sessions to prevent recurring preference violations. The system learns from user feedback and automatically validates future outputs.

Key features:
- ✅ Track user corrections (what was wrong → what was expected)
- ✅ Learn formatting preferences (date formats, naming conventions)
- ✅ Store validation requirements (required fields, quality standards)
- ✅ Cross-session persistence (SQLite database)
- ✅ Auto-validate against learned patterns

## What It Does

The tracker learns from user feedback and enforces learned preferences:

### 1. Record Corrections ✅
Track when users correct agent outputs.

```
User corrects: "Use YYYY-MM-DD for dates, not MM/DD/YYYY"

Stored:
  Context: cpq-assessment
  Category: date-format
  What Was Wrong: Used MM/DD/YYYY format
  What Was Expected: Expected YYYY-MM-DD format
  Pattern: \d{2}/\d{2}/\d{4}
```

### 2. Set Preferences ✅
Store user preferences for specific contexts.

```
User preference: "Property names should use snake_case"

Stored:
  Context: cpq-assessment
  Preference: naming-convention = snake_case
  Description: Use snake_case for property names
```

### 3. Validation Rules ✅
Create automatic validation rules from corrections.

```
From correction → Validation rule:
  Type: date-format
  Pattern: YYYY-MM-DD
  Severity: error
  Description: Use ISO 8601 date format

Future outputs automatically checked for date format compliance
```

### 4. Auto-Validation ✅
Validate outputs against learned expectations.

```
Output:
  {
    "report_date": "10/26/2025",  // Wrong format
    "status": "complete"
  }

Validation Result:
  ❌ VIOLATION: Date format should be YYYY-MM-DD, found MM/DD/YYYY
  💡 Use ISO 8601 date format
```

### 5. Cross-Session Persistence ✅
All preferences and rules persist across sessions via SQLite database.

### 6. Correction Summary ✅
Get summary of correction patterns.

```
Correction Summary for cpq-assessment:
  date-format: 5 corrections
  naming-convention: 3 corrections
  required-field: 2 corrections
```

## Usage

### Programmatic

```javascript
const UserExpectationTracker = require('./user-expectation-tracker');

const tracker = new UserExpectationTracker({
  dbPath: './.claude/user-expectations.db',
  verbose: true,
  userEmail: 'user@company.com'
});

await tracker.initialize();

// Record user correction
await tracker.recordCorrection(
  'cpq-assessment',                  // Context
  'date-format',                     // Category
  'Used MM/DD/YYYY format',          // What was wrong
  'Expected YYYY-MM-DD format',      // What was expected
  {
    severity: 'high',
    pattern: '\\d{2}/\\d{2}/\\d{4}'
  }
);

// Set preference
await tracker.setPreference(
  'cpq-assessment',
  'date-format',
  'YYYY-MM-DD',
  'ISO 8601 date format'
);

// Add validation rule
await tracker.addValidationRule(
  'cpq-assessment',
  'date-format',
  'YYYY-MM-DD',
  { description: 'Use ISO 8601', severity: 'error' }
);

// Validate output
const output = {
  report_date: '10/26/2025',
  status: 'complete'
};

const result = await tracker.validate(output, 'cpq-assessment');

if (!result.valid) {
  console.log('Violations:');
  result.violations.forEach(v => {
    console.log(`  ❌ ${v.message}`);
    console.log(`     💡 ${v.suggestion}`);
  });
}

await tracker.close();
```

### Command Line

```bash
# Record correction
node user-expectation-tracker.js add-correction \
  cpq-assessment \
  date-format \
  "Used MM/DD/YYYY" \
  "Expected YYYY-MM-DD"

# Add validation rule
node user-expectation-tracker.js add-rule \
  cpq-assessment \
  date-format \
  "YYYY-MM-DD" \
  "Use ISO 8601 date format"

# Get correction summary
node user-expectation-tracker.js summary cpq-assessment
```

### Integration with Agents

Agents can validate outputs before returning to user:

```javascript
// In agent workflow

// Generate output
const output = generateAssessment();

// Validate against user expectations
const tracker = new UserExpectationTracker();
await tracker.initialize();

const validation = await tracker.validate(output, 'cpq-assessment');

if (!validation.valid) {
  // Fix violations before returning
  output = await fixViolations(output, validation.violations);
}

// Return validated output
return output;
```

## Validation Rule Types

### 1. Date Format

**Pattern**: `YYYY-MM-DD`, `MM/DD/YYYY`, etc.

```javascript
await tracker.addValidationRule(
  'cpq-assessment',
  'date-format',
  'YYYY-MM-DD',
  { description: 'Use ISO 8601', severity: 'error' }
);
```

**Validates**: All dates in output match expected format

### 2. Naming Convention

**Pattern**: `snake_case`, `camelCase`, `PascalCase`, `kebab-case`

```javascript
await tracker.addValidationRule(
  'cpq-assessment',
  'naming-convention',
  'snake_case',
  { description: 'Use snake_case for properties', severity: 'warning' }
);
```

**Validates**: Property/field names follow convention

### 3. Required Field

**Pattern**: Field name

```javascript
await tracker.addValidationRule(
  'cpq-assessment',
  'required-field',
  'summary',
  { description: 'Summary field is required', severity: 'error' }
);
```

**Validates**: Specified field exists in output

### 4. Format Pattern

**Pattern**: Regular expression

```javascript
await tracker.addValidationRule(
  'cpq-assessment',
  'format-pattern',
  'test@example\\.com',
  { description: 'No test emails', severity: 'error' }
);
```

**Validates**: Output doesn't match disallowed pattern

### 5. Value Range

**Pattern**: `field:min:max`

```javascript
await tracker.addValidationRule(
  'cpq-assessment',
  'value-range',
  'score:0:100',
  { description: 'Score must be 0-100', severity: 'error' }
);
```

**Validates**: Numeric field is within range

## Output Format

```javascript
{
  valid: false,
  violations: [
    {
      type: 'DATE_FORMAT_VIOLATION',
      ruleId: 1,
      message: 'Date format should be YYYY-MM-DD, found MM/DD/YYYY',
      severity: 'error',
      details: {
        expectedFormat: 'YYYY-MM-DD',
        foundFormat: 'MM/DD/YYYY',
        examples: ['10/26/2025']
      },
      suggestion: 'Use ISO 8601 date format'
    }
  ],
  warnings: [
    {
      type: 'NAMING_CONVENTION_VIOLATION',
      ruleId: 2,
      message: 'Naming should use snake_case, found camelCase',
      severity: 'warning',
      details: {
        expectedConvention: 'snake_case',
        foundConvention: 'camelCase',
        example: 'reportDate'
      },
      suggestion: 'Use snake_case for naming'
    }
  ],
  context: 'cpq-assessment'
}
```

## Test Results

**Test Suite:** `test/user-expectation-tracker.test.js`

| Test | Status | Description |
|------|--------|-------------|
| Record Correction | ✅ PASS | Store user corrections |
| Set/Get Preferences | ✅ PASS | Store and retrieve preferences |
| Add Validation Rule | ✅ PASS | Create validation rules |
| Date Format Validation | ✅ PASS | Detect date format violations |
| Naming Convention | ✅ PASS | Detect naming violations |
| Required Field | ✅ PASS | Detect missing required fields |
| Cross-Session Persistence | ✅ PASS | Rules persist across sessions |
| Correction Summary | ✅ PASS | Generate correction statistics |
| Value Range Validation | ✅ PASS | Detect out-of-range values |
| Valid Output Passes | ✅ PASS | Correctly validate good outputs |

**Overall:** 10/10 tests passing (100%)

Run tests:
```bash
cd .claude-plugins/cross-platform-plugin
node test/user-expectation-tracker.test.js
```

## Database Schema

### corrections table
```sql
CREATE TABLE corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT NOT NULL,
    context TEXT NOT NULL,
    category TEXT NOT NULL,
    what_was_wrong TEXT NOT NULL,
    what_was_expected TEXT NOT NULL,
    correction_type TEXT,
    severity TEXT DEFAULT 'medium',
    pattern TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### preferences table
```sql
CREATE TABLE preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT NOT NULL,
    context TEXT NOT NULL,
    preference_key TEXT NOT NULL,
    preference_value TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_email, context, preference_key)
);
```

### validation_rules table
```sql
CREATE TABLE validation_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT NOT NULL,
    context TEXT NOT NULL,
    rule_type TEXT NOT NULL,
    rule_pattern TEXT NOT NULL,
    rule_description TEXT,
    severity TEXT DEFAULT 'warning',
    times_violated INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_violated_at DATETIME
);
```

## Common Use Cases

### Use Case 1: Learn from User Corrections

```javascript
// User corrects agent output
await tracker.recordCorrection(
  'cpq-assessment',
  'date-format',
  'Output used MM/DD/YYYY dates',
  'Should use YYYY-MM-DD ISO 8601 format',
  { severity: 'high', pattern: '\\d{2}/\\d{2}/\\d{4}' }
);

// Automatically create validation rule
await tracker.addValidationRule(
  'cpq-assessment',
  'date-format',
  'YYYY-MM-DD',
  { description: 'Use ISO 8601 date format', severity: 'error' }
);

// Future outputs automatically validated
const result = await tracker.validate(newOutput, 'cpq-assessment');
```

### Use Case 2: Enforce Naming Conventions

```javascript
// User prefers snake_case
await tracker.setPreference('global', 'naming-convention', 'snake_case');

await tracker.addValidationRule(
  'global',
  'naming-convention',
  'snake_case',
  { description: 'Use snake_case', severity: 'warning' }
);

// All future outputs checked for snake_case
```

### Use Case 3: Required Fields

```javascript
// User always wants certain fields
await tracker.addValidationRule('cpq-assessment', 'required-field', 'summary');
await tracker.addValidationRule('cpq-assessment', 'required-field', 'findings');
await tracker.addValidationRule('cpq-assessment', 'required-field', 'recommendations');

// Validate output has all required fields
const result = await tracker.validate(output, 'cpq-assessment');
```

### Use Case 4: Correction Analytics

```javascript
// Get summary of corrections over time
const summary = await tracker.getCorrectionSummary('cpq-assessment');

console.table(summary);
// Category          | Count | Last Correction
// date-format       | 8     | 2025-10-26
// naming-convention | 5     | 2025-10-25
// required-field    | 3     | 2025-10-24

// Identify patterns that need addressing
```

## Success Metrics

**Prevention Target:** 50% reduction in user corrections

**Measured By:**
- User corrections per assessment (reduced)
- Validation rule effectiveness (violations caught before user sees output)
- User satisfaction with output format

**Expected ROI:** $36,000/year
- 3 hours/week saved on fixing user-reported formatting issues
- 50 weeks/year
- $240/hour developer rate

## Integration Points

### Extends

- SQLite for persistent storage
- Cross-platform (works with all agents)
- Context-aware (different rules per agent/task type)

### Used By

- All agents before returning output to user
- Quality assurance workflows
- Agent self-validation frameworks

## Known Limitations

### 1. Manual Rule Creation
**Current:** Rules must be manually created from corrections
**Planned:** Auto-create rules from repeated corrections in v1.1
**Workaround:** Use CLI to quickly add rules after corrections

### 2. Complex Pattern Matching
**Current:** Basic regex patterns only
**Planned:** Advanced pattern learning in v2.0
**Workaround:** Use multiple simple rules instead of one complex rule

### 3. Context Inference
**Current:** Context must be specified explicitly
**Planned:** Auto-infer context from task type in v1.1
**Workaround:** Use 'global' context for rules that apply everywhere

## Future Enhancements (v1.1 Roadmap)

1. **Auto-Rule Creation**
   - Automatically create rules after 2+ similar corrections
   - Suggest rule creation to user
   - Batch rule creation

2. **Pattern Learning**
   - Learn patterns from multiple examples
   - Generalize from specific corrections
   - Machine learning for complex patterns

3. **Context Inference**
   - Auto-detect context from task description
   - Inherit rules from parent contexts
   - Context hierarchy (global → domain → task)

4. **Rule Refinement**
   - Update rules based on new corrections
   - Deprecate rules that are no longer violated
   - Merge similar rules

## Dependencies

**Required:**
- `sqlite3` - Database persistence

Install:
```bash
npm install sqlite3
```

## Files

**Main Script:** `.claude-plugins/cross-platform-plugin/scripts/lib/user-expectation-tracker.js`
**Tests:** `.claude-plugins/cross-platform-plugin/test/user-expectation-tracker.test.js`
**Documentation:** This file

## Contributing

To improve tracking:
1. Add new validation rule types
2. Implement auto-rule creation
3. Add pattern learning algorithms
4. Build context inference

See: `docs/CONTRIBUTING.md` for guidelines

---

**Status:** ✅ Production Ready
**Test Coverage:** 100% (10/10 tests passing)
**Maintenance:** Active
**Support:** File issues in project repository
