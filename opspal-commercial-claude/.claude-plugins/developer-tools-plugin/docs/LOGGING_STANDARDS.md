# Logging Standards for OpsPal Plugins

## Overview

All OpsPal plugin scripts MUST use the structured logger for consistent, queryable logging across the plugin marketplace.

**Benefits:**
- Structured JSON logs enable automated analysis
- Automatic context capture (file, line, function)
- Log rotation prevents disk space issues
- Query capabilities for debugging
- Consistent format across all plugins

## Quick Start

### Basic Usage

```javascript
const { createLogger } = require('./scripts/lib/structured-logger');
const logger = createLogger('my-script-name');

logger.info('Processing started', { recordCount: 100 });
logger.error('Operation failed', error, { recordId: 'abc123' });
```

### Configuration

Via environment variables:
```bash
export LOG_LEVEL=DEBUG           # DEBUG, INFO, WARN, ERROR, FATAL
export LOG_FORMAT=pretty         # json or pretty
export LOG_OUTPUT=both           # console, file, both
export LOG_DIR=.claude/logs      # Log directory path
export LOG_MAX_FILE_SIZE=10485760 # 10MB
export LOG_MAX_FILES=10          # Keep last 10 log files
```

Or via code:
```javascript
const logger = createLogger('my-script', {
  level: 'DEBUG',
  format: 'pretty',
  output: 'both'
});
```

## Log Levels

Use the appropriate log level for each message:

### DEBUG
**When**: Detailed information for debugging
**Example**: Variable values, function calls, loop iterations

```javascript
logger.debug('Processing record', {
  recordId: record.id,
  status: record.status,
  iteration: i
});
```

### INFO
**When**: Normal operational messages
**Example**: Process started, milestones reached, successful operations

```javascript
logger.info('Batch processing complete', {
  recordsProcessed: 1000,
  duration_ms: 5432,
  successRate: 0.98
});
```

### WARN
**When**: Unexpected but handled situations
**Example**: Approaching limits, deprecated features, recoverable errors

```javascript
logger.warn('API rate limit approaching', {
  currentUsage: 85,
  threshold: 90,
  remaining: 150
});
```

### ERROR
**When**: Errors that prevent operation but don't crash the script
**Example**: Failed API calls, invalid data, recoverable failures

```javascript
try {
  await processRecord(record);
} catch (error) {
  logger.error('Failed to process record', error, {
    recordId: record.id,
    retryAttempt: 2
  });
}
```

### FATAL
**When**: Unrecoverable errors that require script termination
**Example**: Missing required config, database connection failure

```javascript
if (!process.env.SUPABASE_URL) {
  logger.fatal('Missing required environment variable', null, {
    variable: 'SUPABASE_URL',
    script: 'submit-reflection.js'
  });
  process.exit(1);
}
```

## Structured Metadata

Always include relevant metadata with log messages:

### Good Examples

```javascript
// Include context that helps debugging
logger.info('User authenticated', {
  userId: user.id,
  email: user.email,
  roles: user.roles,
  loginMethod: 'oauth'
});

// Include operation metrics
logger.info('Database query completed', {
  query: 'SELECT * FROM users WHERE status = ?',
  rowsReturned: 42,
  duration_ms: 123,
  cacheHit: false
});

// Include error context
logger.error('API request failed', error, {
  endpoint: '/api/v1/users',
  method: 'POST',
  statusCode: 503,
  retryAfter: 30
});
```

### Bad Examples

```javascript
// ❌ Too vague
logger.info('Done');

// ❌ No context
logger.error('Error occurred', error);

// ❌ Message contains data that should be metadata
logger.info(`Processed ${count} records in ${duration}ms`);
// ✅ Better:
logger.info('Processing complete', { recordCount: count, duration_ms: duration });
```

## Timing Operations

Use the built-in timer for performance tracking:

```javascript
const timer = logger.timer('database migration');

try {
  await runMigration();
  timer.end({ recordsM igrated: 1000, tablesAffected: 5 });
} catch (error) {
  timer.fail(error, { phase: 'applying constraints' });
}
```

## Sensitive Data

**NEVER log sensitive information:**

```javascript
// ❌ BAD - Logs credentials
logger.info('Connecting to database', {
  url: process.env.DATABASE_URL,
  password: process.env.DB_PASSWORD  // NEVER DO THIS
});

// ✅ GOOD - Masks sensitive data
logger.info('Connecting to database', {
  url: maskUrl(process.env.DATABASE_URL),
  authMethod: 'password'
});
```

**Sensitive data includes:**
- Passwords, API keys, tokens
- Personal identifiable information (PII)
- Customer data
- Credit card numbers
- Session IDs

## Child Loggers

Create child loggers for additional context:

```javascript
const logger = createLogger('batch-processor');

async function processBatch(batchId) {
  const batchLogger = logger.child({ batchId });

  batchLogger.info('Batch processing started');
  // All logs from batchLogger include batchId

  for (const record of records) {
    const recordLogger = batchLogger.child({ recordId: record.id });
    recordLogger.debug('Processing record');
    // Includes both batchId and recordId
  }

  batchLogger.info('Batch processing complete', { recordCount: records.length });
}
```

## Querying Logs

### From Command Line

```bash
# View recent logs
tail -f .claude/logs/my-script-2025-10-16.log | jq '.'

# Filter by level
cat .claude/logs/my-script-*.log | jq 'select(.level == "ERROR")'

# Search for pattern
cat .claude/logs/my-script-*.log | jq 'select(.message | contains("database"))'

# Get error summary
cat .claude/logs/my-script-*.log | jq 'select(.level == "ERROR") | .error.message' | sort | uniq -c
```

### From Code

```javascript
const { queryLogs } = require('./scripts/lib/structured-logger');

// Query recent errors
const errors = await queryLogs({
  logger: 'my-script',
  level: 'ERROR',
  since: '2025-10-16T00:00:00Z',
  limit: 100
});

console.log(`Found ${errors.length} errors`);
errors.forEach(log => {
  console.log(`  ${log.timestamp}: ${log.message}`);
});

// Search for pattern
const apiErrors = await queryLogs({
  logger: 'my-script',
  pattern: 'API request failed',
  limit: 50
});
```

## Integration Examples

### Simple Script

```javascript
#!/usr/bin/env node

const { createLogger } = require('./structured-logger');
const logger = createLogger('simple-script');

async function main() {
  logger.info('Script started');

  try {
    const result = await doWork();
    logger.info('Script completed successfully', { result });
  } catch (error) {
    logger.fatal('Script failed', error);
    process.exit(1);
  }
}

main();
```

### Complex Workflow

```javascript
const { createLogger } = require('./structured-logger');
const logger = createLogger('complex-workflow');

async function runWorkflow() {
  const workflowTimer = logger.timer('complete workflow');

  try {
    // Phase 1
    logger.info('Phase 1: Data extraction');
    const extractTimer = logger.timer('data extraction');
    const data = await extractData();
    extractTimer.end({ recordCount: data.length });

    // Phase 2
    logger.info('Phase 2: Data transformation');
    const transformTimer = logger.timer('data transformation');
    const transformed = await transformData(data);
    transformTimer.end({ recordsTransformed: transformed.length });

    // Phase 3
    logger.info('Phase 3: Data loading');
    const loadTimer = logger.timer('data loading');
    const loaded = await loadData(transformed);
    loadTimer.end({ recordsLoaded: loaded.length });

    workflowTimer.end({
      totalRecords: loaded.length,
      phases: 3
    });

    logger.info('Workflow completed successfully', {
      totalRecords: loaded.length,
      successRate: loaded.length / data.length
    });

  } catch (error) {
    workflowTimer.fail(error);
    logger.fatal('Workflow failed', error);
    throw error;
  }
}
```

### Agent Integration

```javascript
const { createLogger } = require('../scripts/lib/structured-logger');
const logger = createLogger('my-agent', {
  level: process.env.AGENT_LOG_LEVEL || 'INFO'
});

class MyAgent {
  constructor() {
    this.logger = logger.child({ agent: 'MyAgent' });
  }

  async execute(task) {
    const timer = this.logger.timer('task execution');

    this.logger.info('Task started', {
      taskId: task.id,
      taskType: task.type
    });

    try {
      const result = await this.processTask(task);
      timer.end({ success: true, resultSize: result.length });
      return result;
    } catch (error) {
      timer.fail(error, { taskId: task.id });
      throw error;
    }
  }

  async processTask(task) {
    this.logger.debug('Processing task', {
      taskId: task.id,
      inputSize: task.data.length
    });

    // ... processing logic ...
  }
}
```

## Migration Guide

### Migrating Existing Scripts

**Before:**
```javascript
console.log('Processing record', record.id);
console.error('Error:', error.message);
```

**After:**
```javascript
const { createLogger } = require('./structured-logger');
const logger = createLogger('my-script');

logger.info('Processing record', { recordId: record.id });
logger.error('Processing failed', error, { recordId: record.id });
```

### Search and Replace Patterns

```bash
# Replace console.log with logger.info
sed -i 's/console\.log(/logger.info(/g' my-script.js

# Replace console.error with logger.error
sed -i 's/console\.error(/logger.error(/g' my-script.js

# Replace console.warn with logger.warn
sed -i 's/console\.warn(/logger.warn(/g' my-script.js
```

**Note:** After automated replacement, manually review to:
1. Add structured metadata
2. Extract data from message strings to metadata
3. Add error objects where applicable

## Testing with Logs

### In Unit Tests

```javascript
const { createLogger } = require('../structured-logger');

describe('my-function', () => {
  let logger;

  beforeEach(() => {
    // Create logger with file output disabled for tests
    logger = createLogger('test', {
      output: 'console',
      level: 'DEBUG'
    });
  });

  it('should log correct metadata', async () => {
    // Capture console output
    const logSpy = jest.spyOn(console, 'log');

    await myFunction(logger);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('INFO')
    );
  });
});
```

## Best Practices

1. **Create logger once per script**
   ```javascript
   // At top of file
   const logger = createLogger('script-name');
   ```

2. **Use child loggers for context**
   ```javascript
   const requestLogger = logger.child({ requestId });
   ```

3. **Log at entry and exit points**
   ```javascript
   async function myFunction() {
     logger.info('Function started');
     // ... work ...
     logger.info('Function completed', { result });
   }
   ```

4. **Include all relevant metadata**
   - IDs, counts, statuses
   - Timing information
   - Error details

5. **Use timers for performance tracking**
   ```javascript
   const timer = logger.timer('operation-name');
   // ... work ...
   timer.end({ metadata });
   ```

6. **Never log sensitive data**
   - Mask credentials
   - Redact PII
   - Hash identifiers if needed

## Log Retention

- **File rotation**: Automatic at 10MB per file
- **Max files**: Keeps last 10 files per logger
- **Cleanup**: Automatic deletion of oldest files
- **Location**: `.claude/logs/` by default

## Troubleshooting

**Logs not appearing:**
- Check `LOG_OUTPUT` environment variable
- Verify `.claude/logs/` directory exists
- Check `LOG_LEVEL` setting

**Logs too verbose:**
- Set `LOG_LEVEL=WARN` or higher
- Use `--quiet` flag in scripts

**Can't find old logs:**
- Check `LOG_MAX_FILES` setting
- Look in rotated files (`*-TIMESTAMP.log`)
- Query programmatically with `queryLogs()`

---

**Version**: 1.0.0
**Last Updated**: 2025-10-16
**Maintained By**: Developer Tools Plugin Team
