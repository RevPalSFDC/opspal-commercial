# Universal Schema Validation Guide

**Last Updated**: 2025-10-13
**Purpose**: Prevent database constraint violations through pre-submission validation
**ROI**: Part of Universal Schema Validator ($9,200/year)

---

## Why Schema Validation?

**Problem**: Database submissions fail with cryptic constraint violation errors after data has been processed, wasting time on error recovery and rollback.

**Solution**: Validate data against schema BEFORE submission to catch errors early with clear, actionable error messages.

**Impact**:
- **Before**: 24 hours/month spent debugging constraint violations
- **After**: < 2 hours/month with pre-flight validation
- **Savings**: 22 hours/month = $1,100/month = $13,200/year (conservative: $9,200/year)

---

## Quick Start

### 1. Install Dependencies

```bash
npm install @supabase/supabase-js
```

### 2. Basic Usage

```javascript
const validator = require('../scripts/lib/universal-schema-validator');

// Define schema
const schema = {
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email' },
    age: { type: 'integer', minimum: 0, maximum: 150 },
    name: { type: 'string', minLength: 1, maxLength: 100 }
  },
  required: ['email', 'name']
};

// Validate data
const data = {
  email: 'user@example.com',
  age: 25,
  name: 'John Doe'
};

const result = validator.validateAgainstSchema(data, schema);
validator.logValidation('User Registration', result);

if (!result.valid) {
  console.error('Validation failed:', result.errors);
  return; // Stop before database submission
}

// Safe to submit to database
await database.insert(data);
```

---

## Schema Definition Format

The Universal Schema Validator uses **JSON Schema Draft 7** format with PostgreSQL extensions.

### Basic Structure

```javascript
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "table_name",
  "properties": {
    "field_name": {
      "type": "string",           // Data type
      "nullable": false,          // Can be null?
      "minLength": 1,             // Constraints
      "maxLength": 255,
      "format": "email"           // Format hint
    }
  },
  "required": ["field_name"],     // NOT NULL fields
  "unique": ["field_name"],       // UNIQUE constraints
  "foreignKeys": [...],           // Foreign key constraints
  "checks": [...]                 // CHECK constraints
}
```

### Supported Types

| JSON Schema Type | PostgreSQL Type | Validation |
|------------------|-----------------|------------|
| `string` | TEXT, VARCHAR, CHAR, UUID | Length, pattern, format |
| `integer` | INTEGER, BIGINT, SMALLINT | Min/max, range |
| `number` | NUMERIC, REAL, DOUBLE | Min/max, range |
| `boolean` | BOOLEAN | true/false |
| `array` | ARRAY | Items, length, uniqueness |
| `object` | JSON, JSONB | Nested validation |

### Format Validators

| Format | Validation Pattern |
|--------|-------------------|
| `email` | RFC 5322 email format |
| `uuid` | UUID v4 format |
| `date-time` | ISO 8601 date-time |

---

## Schema Introspection (Automatic)

Instead of manually defining schemas, use the **Schema Introspector** to automatically retrieve schema from databases.

### Supabase Schema Introspection

```bash
# Set environment variables
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Introspect table schema
node .claude-plugins/developer-tools-plugin/scripts/lib/schema-introspector.js \
  supabase reflections ./schemas/reflections.json

# Output:
# 🔍 Introspecting Supabase table: reflections...
# ✅ Schema saved to: ./schemas/reflections.json
#
# 📊 Schema Summary:
#   Table: reflections
#   Properties: 15
#   Required: 5
#   Unique: 1
#   Foreign Keys: 2
```

### Use Introspected Schema

```javascript
const validator = require('../scripts/lib/universal-schema-validator');
const introspector = require('../scripts/lib/schema-introspector');

// Load schema from file
const schema = introspector.getSchemaFromFile('./schemas/reflections.json');

// Validate data
const result = validator.validateAgainstSchema(reflectionData, schema);
```

---

## Validation Examples

### Example 1: Required Fields

**Schema**:
```javascript
{
  type: 'object',
  properties: {
    email: { type: 'string' },
    name: { type: 'string' }
  },
  required: ['email', 'name']
}
```

**❌ Invalid Data**:
```javascript
const data = { email: 'user@example.com' };
// Error: Missing required field: name
```

**✅ Valid Data**:
```javascript
const data = { email: 'user@example.com', name: 'John Doe' };
```

---

### Example 2: Type Validation

**Schema**:
```javascript
{
  type: 'object',
  properties: {
    age: { type: 'integer', minimum: 0, maximum: 150 },
    score: { type: 'number', minimum: 0.0, maximum: 100.0 }
  }
}
```

**❌ Invalid Data**:
```javascript
const data = { age: '25', score: 105 };
// Errors:
// - Field age must be an integer, got string
// - Field score must be <= 100.0 (got 105)
```

**✅ Valid Data**:
```javascript
const data = { age: 25, score: 95.5 };
```

---

### Example 3: String Constraints

**Schema**:
```javascript
{
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email' },
    username: {
      type: 'string',
      minLength: 3,
      maxLength: 20,
      pattern: '^[a-zA-Z0-9_]+$'
    }
  }
}
```

**❌ Invalid Data**:
```javascript
const data = {
  email: 'invalid-email',
  username: 'ab'
};
// Errors:
// - Field email must be a valid email address
// - Field username must be at least 3 characters (got 2)
```

**✅ Valid Data**:
```javascript
const data = {
  email: 'user@example.com',
  username: 'john_doe_123'
};
```

---

### Example 4: Unique Constraints

**Schema**:
```javascript
{
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email' }
  },
  unique: ['email']
}
```

**Validation with existing records**:
```javascript
const existingRecords = [
  { email: 'existing@example.com' },
  { email: 'another@example.com' }
];

const data = { email: 'existing@example.com' };

const result = validator.validateAgainstSchema(data, schema, {
  existingRecords
});

// Error: Unique constraint violation: email = 'existing@example.com' already exists
```

---

### Example 5: Foreign Key Constraints

**Schema**:
```javascript
{
  type: 'object',
  properties: {
    user_id: { type: 'string', format: 'uuid' }
  },
  foreignKeys: [{
    field: 'user_id',
    references: {
      table: 'users',
      field: 'id'
    }
  }]
}
```

**Validation with referenced data**:
```javascript
const referencedData = {
  users: [
    { id: '123e4567-e89b-12d3-a456-426614174000' },
    { id: '987fcdeb-51a2-43d7-8c9f-123456789abc' }
  ]
};

const data = { user_id: 'invalid-uuid' };

const result = validator.validateAgainstSchema(data, schema, {
  referencedData
});

// Errors:
// - Field user_id must be a valid UUID
// - Foreign key violation: user_id = 'invalid-uuid' not found in users.id
```

---

## Batch Validation

For bulk operations, use `batchValidate` to validate multiple records efficiently:

```javascript
const records = [
  { email: 'user1@example.com', name: 'User 1' },
  { email: 'invalid-email', name: 'User 2' },      // Invalid
  { email: 'user3@example.com' }                   // Missing name
];

const result = validator.batchValidate(records, schema);
validator.logValidation('Bulk Import', result);

// Output:
// ❌ Bulk Import schema validation failed:
//   - Record 1: Field email must be a valid email address
//   - Record 2: Missing required field: name
//
// 📊 Batch Validation Summary:
//   Total records: 3
//   Valid: 1 (33%)
//   Invalid: 2
//   Total errors: 2
//   Total warnings: 0

if (!result.valid) {
  // Review failed records
  result.results.filter(r => !r.valid).forEach(failed => {
    console.error(`Record ${failed.index} failed:`, failed.errors);
  });
}
```

---

## Two-Phase Migration Pattern

Use the **Two-Phase Migration** wrapper for safe data migrations:

```javascript
const migration = require('../scripts/lib/two-phase-migration');

const result = await migration.execute({
  sourceName: 'old_table',
  targetName: 'new_table',
  records: sourceRecords,
  schema: targetSchema,

  // Transform function
  transformFn: (record) => ({
    new_field: record.old_field,
    normalized_value: record.value.toLowerCase()
  }),

  // Custom validation
  validationFn: async (migrated, source) => {
    // Verify data integrity
    return { valid: migrated.length === source.length };
  },

  // Delete source after migration
  deleteSourceFn: async (records) => {
    return await database.delete(records);
  },

  options: {
    phase2Confirmed: true  // Auto-proceed to deletion
  }
});

// Workflow:
// Phase 1/2: Migrating data...
// ✅ Phase 1 complete: 100 records migrated
//
// ⚠️  Validation Checkpoint
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Verifying record count...
//    ✅ 100 records migrated
// 2. Running custom validation...
//    ✅ Custom validation passed
// 3. Verifying data integrity...
//    ✅ Data integrity verified
// ✅ Validation checkpoint passed
//
// Phase 2/2: Deleting source data...
// ✅ Phase 2 complete: 100 source records deleted
//
// ✅ Two-phase migration completed successfully
```

---

## When to Use Schema Validation

### ✅ Always Validate

1. **Database submissions** - Any INSERT/UPDATE operation
2. **API data ingestion** - External data from webhooks/APIs
3. **CSV/file imports** - Bulk data imports from files
4. **User-generated content** - Forms, surveys, user input
5. **Data migrations** - Moving data between systems
6. **Reflection submissions** - `/reflect` command data

### ❌ Skip Validation (Conditionally)

1. **Read operations** - SELECT queries don't need validation
2. **Internal transformations** - Validated data being transformed
3. **Performance-critical paths** - Only if schema is guaranteed correct

---

## Integration with Agents

All agents submitting data to databases should use schema validation:

```javascript
// Import validator
const validator = require('../scripts/lib/universal-schema-validator');
const introspector = require('../scripts/lib/schema-introspector');

// Get schema (cache this in production)
const schema = introspector.getSchemaFromFile('./schemas/reflections.json');

// Pre-submission validation
const validationResult = validator.validateAgainstSchema(reflectionData, schema);
validator.logValidation('Reflection Submission', validationResult);

if (!validationResult.valid) {
  throw new Error(`Schema validation failed: ${validationResult.errors.join(', ')}`);
}

// Safe to submit
await supabase.from('reflections').insert(reflectionData);
```

---

## Error Handling

### Clear Error Messages

Schema validation provides **actionable error messages**:

**Before** (Database Error):
```
ERROR: null value in column "email" violates not-null constraint
DETAIL: Failing row contains (...)
```

**After** (Validation Error):
```
❌ Reflection Submission schema validation failed:
  - Missing required field: email
  - Field taxonomy must be one of: error, friction, suggestion (got 'unknown')
  - Field estimated_time_wasted_minutes must be an integer, got string
```

### Error Recovery

```javascript
const result = validator.validateAgainstSchema(data, schema);

if (!result.valid) {
  // Log for debugging
  console.error('Validation errors:', result.errors);

  // Attempt auto-fix for common issues
  if (result.errors.some(e => e.includes('must be an integer'))) {
    // Convert string numbers to integers
    Object.keys(data).forEach(key => {
      if (typeof data[key] === 'string' && /^\d+$/.test(data[key])) {
        data[key] = parseInt(data[key]);
      }
    });

    // Re-validate
    const retryResult = validator.validateAgainstSchema(data, schema);
    if (retryResult.valid) {
      console.log('✅ Auto-fix successful');
      return data;
    }
  }

  // Cannot auto-fix
  throw new Error(`Validation failed: ${result.errors.join(', ')}`);
}
```

---

## Performance Considerations

### Schema Caching

Cache schemas in memory to avoid repeated introspection:

```javascript
const schemaCache = {};

function getSchema(tableName) {
  if (!schemaCache[tableName]) {
    schemaCache[tableName] = introspector.getSchemaFromFile(
      `./schemas/${tableName}.json`
    );
  }
  return schemaCache[tableName];
}
```

### Batch Validation

Use `batchValidate` for bulk operations:

```javascript
// ✅ Efficient (single pass)
const result = validator.batchValidate(records, schema);

// ❌ Inefficient (multiple passes)
records.forEach(record => {
  validator.validateAgainstSchema(record, schema);
});
```

---

## Success Metrics

### Targets

- **Schema validation calls**: > 90% of database submissions
- **Constraint violations**: 24 hours/month → < 2 hours/month (92% reduction)
- **Two-phase migration adoption**: 100% of migrations
- **Validator usage breadth**: > 5 scripts across 3+ plugins

### Monitoring

```javascript
// Add telemetry to validation calls
const result = validator.validateAgainstSchema(data, schema);

// Log validation metrics
logMetric('schema_validation', {
  operation: 'reflection_submission',
  valid: result.valid,
  errorCount: result.errors.length,
  warningCount: result.warnings.length
});
```

---

## Additional Resources

- **Validator Library**: `../scripts/lib/universal-schema-validator.js`
- **Schema Introspector**: `../scripts/lib/schema-introspector.js`
- **Two-Phase Migration**: `../scripts/lib/two-phase-migration.js`
- **SQL Functions**: `../scripts/migrations/create-schema-introspection-functions.sql`
- **JSON Schema Spec**: https://json-schema.org/draft-07/schema

---

**Questions?** Submit a reflection via `/reflect` with category "schema-validation"
