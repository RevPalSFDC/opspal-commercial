# Hook System Migration Guide

**Purpose**: Guide for migrating existing hooks and scripts to use the new OutputFormatter, StatusLine, and HookLogger libraries.

**Target Audience**: Developers updating existing hooks or creating new ones

**Prerequisites**: Hook System Modernization (Phase 1-3) complete

---

## Table of Contents

1. [OutputFormatter Migration](#outputformatter-migration)
2. [StatusLine Integration](#statusline-integration)
3. [HookLogger Integration](#hooklogger-integration)
4. [Complete Migration Examples](#complete-migration-examples)
5. [Best Practices](#best-practices)

---

## OutputFormatter Migration

### Overview

Replace manual echo statements with structured OutputFormatter calls for consistent, professional output.

### Before and After

#### Error Messages

**❌ Before (Manual Output)**:
```bash
echo "🚫 Deployment Failed" >&2
echo "" >&2
echo "Details:" >&2
echo "  - Component: Account.cls" >&2
echo "  - Error: INVALID_FIELD" >&2
echo "" >&2
echo "Recommendations:" >&2
echo "  1. Verify field exists" >&2
echo "  2. Check API name" >&2
exit 1
```

**✅ After (OutputFormatter)**:
```bash
# Get script directory for OutputFormatter
FORMATTER="$(dirname "$0")/../scripts/lib/output-formatter.js"

# Use OutputFormatter
if [ -f "$FORMATTER" ]; then
  node "$FORMATTER" error \
    "Deployment Failed" \
    "The deployment encountered validation errors" \
    "Component:Account.cls,Error:INVALID_FIELD" \
    "Verify field exists,Check API name" \
    ""
  exit 1
else
  # Fallback to basic output
  echo "🚫 Deployment Failed" >&2
  exit 1
fi
```

#### Warning Messages

**❌ Before (Manual Output)**:
```bash
echo "⚠️  Low Confidence Routing" >&2
echo "  Confidence: 65%" >&2
echo "  Consider reviewing alternatives" >&2
exit 2
```

**✅ After (OutputFormatter)**:
```bash
if [ -f "$FORMATTER" ]; then
  node "$FORMATTER" warning \
    "Low Confidence Routing" \
    "The routing system has low confidence" \
    "Confidence:65%,Agent:sfdc-metadata" \
    "Review alternatives,Use [USE: agent] to override" \
    "Proceeding with selected agent"
  exit 2
else
  echo "⚠️  Low Confidence Routing" >&2
  exit 2
fi
```

#### Success Messages

**❌ Before (Manual Output)**:
```bash
echo "✅ Deployment Complete" >&2
echo "  Deployed: 15 components" >&2
echo "  Coverage: 87%" >&2
echo "" >&2
echo "Next Steps:" >&2
echo "  1. Verify changes" >&2
echo "  2. Monitor for errors" >&2
exit 0
```

**✅ After (OutputFormatter)**:
```bash
if [ -f "$FORMATTER" ]; then
  node "$FORMATTER" success \
    "Deployment Complete" \
    "Successfully deployed 15 components" \
    "Components:15,Coverage:87%" \
    "Verify changes,Monitor for errors" \
    "Org: production-org"
  exit 0
else
  echo "✅ Deployment Complete" >&2
  exit 0
fi
```

#### Info Messages

**❌ Before (Manual Output)**:
```bash
echo "ℹ️  Validation Check Complete" >&2
echo "  Tests Passed: 42" >&2
echo "  Coverage: 87%" >&2
exit 0
```

**✅ After (OutputFormatter)**:
```bash
if [ -f "$FORMATTER" ]; then
  node "$FORMATTER" info \
    "Validation Check Complete" \
    "All validation checks passed successfully" \
    "Tests Passed:42,Coverage:87%" \
    ""
  exit 0
else
  echo "ℹ️  Validation Check Complete" >&2
  exit 0
fi
```

### CLI Format Reference

```bash
# Warning
node output-formatter.js warning \
  "<title>" \
  "<description>" \
  "<context as key:value,key:value>" \
  "<suggestions as item1,item2,item3>" \
  "<footer>"

# Error
node output-formatter.js error \
  "<title>" \
  "<description>" \
  "<details as key:value,key:value>" \
  "<recommendations as item1,item2,item3>" \
  "<footer>"

# Success
node output-formatter.js success \
  "<title>" \
  "<summary>" \
  "<metrics as key:value,key:value>" \
  "<next steps as item1,item2,item3>" \
  "<footer>"

# Info
node output-formatter.js info \
  "<title>" \
  "<content>" \
  "<details as key:value,key:value>" \
  "<footer>"
```

### Key-Value Format

**Context/Details/Metrics**: `"key1:value1,key2:value2,key3:value3"`

**Example**:
```bash
"Confidence:65%,Agent:sfdc-metadata,Keywords:3/5"
```

**Lists** (Suggestions/Recommendations/Next Steps): `"item1,item2,item3"`

**Example**:
```bash
"Review alternatives,Use [USE: agent] to override,Increase confidence threshold"
```

### Important Notes

1. **Always include fallback**: If OutputFormatter not available, use basic output
2. **Escape special characters**: Use `\:` for colons in values, `\,` for commas
3. **Keep messages concise**: Titles < 50 chars, descriptions < 200 chars
4. **Use structured data**: Context/details as key:value pairs
5. **Actionable suggestions**: Always provide next steps or recommendations

---

## StatusLine Integration

### Overview

Add real-time progress updates to long-running operations for better user experience.

### Use Cases

- Batch processing (> 10 items)
- Long-running queries (> 5 seconds)
- File operations (multiple files)
- Data migrations
- Report generation

### Node.js Integration

**❌ Before (No Progress)**:
```javascript
// Process 100 records
for (let i = 0; i < records.length; i++) {
  await processRecord(records[i]);
}
console.log('Processing complete');
```

**✅ After (With StatusLine)**:
```javascript
const StatusLineHelper = require('./status-line-helper');

const statusLine = new StatusLineHelper({
  enabled: true,
  totalItems: records.length
});

statusLine.update('Starting batch processing');

for (let i = 0; i < records.length; i++) {
  statusLine.update('Processing records', {
    current: i + 1,
    total: records.length
  });

  await processRecord(records[i]);
}

statusLine.complete('Batch processing complete');
```

**Output**:
```
⏳ Processing records [50/100] (50%) - ETA: 2m 30s
```

### Bash Integration

**❌ Before (No Progress)**:
```bash
for file in *.txt; do
  process_file "$file"
done
echo "Processing complete"
```

**✅ After (With StatusLine - via Node.js wrapper)**:
```bash
# Create progress tracker script
cat > /tmp/progress.js << 'EOF'
const StatusLineHelper = require('./status-line-helper');
const statusLine = new StatusLineHelper({
  enabled: true,
  totalItems: parseInt(process.argv[2])
});

statusLine.update('Processing files', {
  current: parseInt(process.argv[3]),
  total: parseInt(process.argv[2])
});
EOF

# Use in bash
FILES=(*.txt)
TOTAL=${#FILES[@]}

for i in "${!FILES[@]}"; do
  # Update progress
  node /tmp/progress.js "$TOTAL" "$((i+1))"

  # Process file
  process_file "${FILES[$i]}"
done
```

### Configuration

```javascript
const statusLine = new StatusLineHelper({
  enabled: true,          // Enable/disable
  totalItems: 100,        // Total items to process
  updateInterval: 500,    // Update frequency (ms)
  showETA: true,          // Show estimated time remaining
  showPercentage: true,   // Show percentage complete
  showElapsed: true       // Show elapsed time
});
```

### Methods

```javascript
// Update progress
statusLine.update('Processing items', {
  current: 50,
  total: 100
});

// Complete
statusLine.complete('Processing complete');

// Batch helper
statusLine.batchStart(100, 'Processing items');
statusLine.batchUpdate(25);  // Progress to 25
statusLine.batchUpdate(50);  // Progress to 50
statusLine.batchEnd();       // Complete
```

---

## HookLogger Integration

### Overview

Add structured JSON logging to hooks for debugging, analytics, and monitoring.

### Use Cases

- Critical hooks (pre-compact, post-tool-use)
- Error tracking
- Performance monitoring
- Audit trails
- Debugging

### Node.js Integration

**❌ Before (console.log)**:
```javascript
console.log('[post-tool-use] Validating SOQL query');
console.log('[post-tool-use] Query returned 0 results');
console.error('[post-tool-use] ERROR: Empty result set');
```

**✅ After (HookLogger)**:
```javascript
const HookLogger = require('./hook-logger');

const logger = new HookLogger('post-tool-use', {
  enabled: true,
  level: 'info'  // debug, info, warn, error
});

logger.info('Validating SOQL query', { query: 'SELECT Id FROM Account' });

if (results.length === 0) {
  logger.warn('Query returned no results', { query });
}

// With performance tracking
logger.startTimer('validation');
await validateQuery(query);
logger.endTimer('validation');

logger.info('Validation complete', {
  duration: logger.getTimer('validation'),
  results: results.length
});
```

**Log Output** (`~/.claude/logs/hooks/post-tool-use-2025-11-13.jsonl`):
```json
{"timestamp":"2025-11-13T18:00:00.000Z","level":"info","hook":"post-tool-use","message":"Validating SOQL query","query":"SELECT Id FROM Account","pid":12345,"hostname":"localhost"}
{"timestamp":"2025-11-13T18:00:01.234Z","level":"warn","hook":"post-tool-use","message":"Query returned no results","query":"SELECT Id FROM Account","pid":12345,"hostname":"localhost"}
{"timestamp":"2025-11-13T18:00:02.456Z","level":"info","hook":"post-tool-use","message":"Validation complete","duration":1234,"results":0,"pid":12345,"hostname":"localhost"}
```

### Configuration

```javascript
const logger = new HookLogger('my-hook', {
  enabled: true,           // Enable/disable
  level: 'info',           // Minimum log level
  logDir: '~/.claude/logs/hooks',  // Log directory
  maxFileSize: 10485760,   // 10MB
  retentionDays: 7         // Keep logs for 7 days
});
```

### Log Levels

```javascript
logger.debug('Debug message', { detail });  // Verbose debugging
logger.info('Info message', { detail });    // General information
logger.warn('Warning message', { detail }); // Warnings
logger.error('Error message', { detail });  // Errors
```

### Performance Tracking

```javascript
// Start timer
logger.startTimer('operation');

// Do work
await performOperation();

// End timer and log
logger.endTimer('operation');
logger.info('Operation complete', {
  duration: logger.getTimer('operation')
});
```

### Query Logs

```bash
# Query logs programmatically
node hook-logger.js query post-tool-use

# Get analytics
node hook-logger.js analytics

# Test logger
node hook-logger.js test
```

---

## Complete Migration Examples

### Example 1: Pre-Task Hook with All Three Libraries

**File**: `hooks/pre-deployment-validation.sh`

```bash
#!/bin/bash

###############################################################################
# Pre-Deployment Validation Hook
# Uses: OutputFormatter, StatusLine (via Node.js), HookLogger
###############################################################################

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"
FORMATTER="$PLUGIN_DIR/scripts/lib/output-formatter.js"
VALIDATOR_SCRIPT="$PLUGIN_DIR/scripts/lib/deployment-validator.js"

# Check if deployment validation is needed
if [ "${ENABLE_DEPLOYMENT_VALIDATION:-1}" != "1" ]; then
  exit 0
fi

# Run validation (using HookLogger internally)
VALIDATION_OUTPUT=$(node "$VALIDATOR_SCRIPT" "$DEPLOYMENT_DIR" 2>&1)
VALIDATION_EXIT=$?

# Parse results
ERRORS=$(echo "$VALIDATION_OUTPUT" | grep -c "ERROR:")
WARNINGS=$(echo "$VALIDATION_OUTPUT" | grep -c "WARNING:")

# Use OutputFormatter for results
if [ "$ERRORS" -gt 0 ]; then
  # Validation failed - use error format
  if [ -f "$FORMATTER" ]; then
    node "$FORMATTER" error \
      "Deployment Validation Failed" \
      "Pre-deployment validation detected ${ERRORS} error(s)" \
      "Errors:${ERRORS},Warnings:${WARNINGS},Path:${DEPLOYMENT_DIR}" \
      "Review error details above,Fix validation errors,Re-run validation" \
      ""
    exit 1
  else
    echo "❌ Deployment Validation Failed" >&2
    exit 1
  fi
elif [ "$WARNINGS" -gt 0 ]; then
  # Warnings only - use warning format
  if [ -f "$FORMATTER" ]; then
    node "$FORMATTER" warning \
      "Deployment Validation Warning" \
      "Pre-deployment validation detected ${WARNINGS} warning(s)" \
      "Warnings:${WARNINGS},Path:${DEPLOYMENT_DIR}" \
      "Review warnings above,Consider fixing before deployment,Proceed with caution" \
      "Deployment can proceed with warnings"
    exit 2  # Exit code 2 = automatic feedback to Claude
  else
    echo "⚠️  Deployment Validation Warning" >&2
    exit 2
  fi
else
  # Success
  if [ -f "$FORMATTER" ]; then
    node "$FORMATTER" success \
      "Deployment Validation Passed" \
      "All pre-deployment checks passed" \
      "Errors:0,Warnings:0,Files Validated:$(find $DEPLOYMENT_DIR -type f | wc -l)" \
      "Proceed with deployment" \
      ""
    exit 0
  else
    echo "✅ Deployment Validation Passed" >&2
    exit 0
  fi
fi
```

### Example 2: Long-Running Script with StatusLine and HookLogger

**File**: `scripts/batch-data-migration.js`

```javascript
#!/usr/bin/env node

const StatusLineHelper = require('./lib/status-line-helper');
const HookLogger = require('./lib/hook-logger');
const OutputFormatter = require('./lib/output-formatter');

// Initialize libraries
const logger = new HookLogger('data-migration', {
  enabled: true,
  level: 'info'
});

const statusLine = new StatusLineHelper({
  enabled: true,
  totalItems: 0  // Will set after loading records
});

async function migrate() {
  logger.info('Starting data migration');
  logger.startTimer('total');

  try {
    // Load records
    statusLine.update('Loading records from source');
    const records = await loadRecords();
    statusLine.setTotalItems(records.length);

    logger.info('Records loaded', { count: records.length });

    // Process records
    let processed = 0;
    let errors = 0;

    for (let i = 0; i < records.length; i++) {
      statusLine.update('Migrating records', {
        current: i + 1,
        total: records.length
      });

      logger.startTimer(`record-${i}`);

      try {
        await migrateRecord(records[i]);
        processed++;

        logger.debug('Record migrated', {
          recordId: records[i].id,
          duration: logger.getTimer(`record-${i}`)
        });
      } catch (error) {
        errors++;
        logger.error('Record migration failed', {
          recordId: records[i].id,
          error: error.message
        });
      }

      logger.endTimer(`record-${i}`);
    }

    logger.endTimer('total');

    // Report results
    const totalDuration = logger.getTimer('total');

    if (errors > 0) {
      const formatted = OutputFormatter.warning('Migration Complete with Errors', {
        description: `Migrated ${processed} records with ${errors} errors`,
        context: {
          'Total Records': records.length,
          'Successful': processed,
          'Failed': errors,
          'Duration': `${(totalDuration / 1000).toFixed(2)}s`
        },
        suggestions: [
          'Review error logs for failed records',
          'Retry failed records',
          'Verify data integrity'
        ]
      });
      OutputFormatter.output(formatted);

      logger.warn('Migration completed with errors', {
        total: records.length,
        processed,
        errors,
        duration: totalDuration
      });

      process.exit(2);
    } else {
      const formatted = OutputFormatter.success('Migration Complete', {
        summary: `Successfully migrated ${processed} records`,
        metrics: {
          'Total Records': records.length,
          'Successful': processed,
          'Duration': `${(totalDuration / 1000).toFixed(2)}s`,
          'Avg Per Record': `${(totalDuration / records.length).toFixed(0)}ms`
        },
        nextSteps: [
          'Verify migrated data',
          'Update references',
          'Archive source data'
        ]
      });
      OutputFormatter.output(formatted, false);

      logger.info('Migration completed successfully', {
        total: records.length,
        processed,
        errors: 0,
        duration: totalDuration
      });

      process.exit(0);
    }
  } catch (error) {
    logger.error('Migration failed', { error: error.message, stack: error.stack });

    const formatted = OutputFormatter.error('Migration Failed', {
      description: 'Data migration encountered a fatal error',
      details: {
        'Error': error.message,
        'Type': error.name
      },
      recommendations: [
        'Check source data availability',
        'Verify target org connectivity',
        'Review error logs',
        'Retry migration'
      ]
    });
    OutputFormatter.outputAndExit(formatted);
  }
}

migrate();
```

---

## Best Practices

### General Guidelines

1. **Always use fallbacks**: Include basic output if libraries unavailable
2. **Log appropriately**: Use correct log levels (debug, info, warn, error)
3. **Keep messages concise**: Titles < 50 chars, descriptions < 200 chars
4. **Provide context**: Include relevant details (IDs, counts, timestamps)
5. **Be actionable**: Always suggest next steps or remediation

### OutputFormatter

- ✅ Use for all user-facing messages
- ✅ Structure data as key:value pairs
- ✅ Include recommendations/suggestions
- ✅ Keep consistent exit codes (0=success, 1=error, 2=warning)
- ❌ Don't hardcode formatting (let library handle it)

### StatusLine

- ✅ Use for operations > 10 items or > 5 seconds
- ✅ Update frequently (every item or every 500ms)
- ✅ Show ETA for long operations
- ✅ Use batch helpers for simple cases
- ❌ Don't update too frequently (< 100ms)

### HookLogger

- ✅ Log all significant events
- ✅ Include context data in logs
- ✅ Use performance timers for slow operations
- ✅ Use appropriate log levels
- ❌ Don't log sensitive data (passwords, keys)
- ❌ Don't log excessively (debug in production)

### Performance

- Keep hook execution < 1 second
- Use async operations where possible
- Batch operations for efficiency
- Monitor log file size
- Clean up old logs automatically

---

## Migration Checklist

### Before Migration
- [ ] Identify hooks/scripts to migrate
- [ ] Review current output patterns
- [ ] Test libraries are available
- [ ] Plan fallback behavior

### During Migration
- [ ] Replace echo with OutputFormatter
- [ ] Add StatusLine to long operations
- [ ] Add HookLogger to critical paths
- [ ] Include fallback to basic output
- [ ] Test with libraries present
- [ ] Test with libraries missing

### After Migration
- [ ] Verify output formatting
- [ ] Check log file creation
- [ ] Test progress updates
- [ ] Verify exit codes
- [ ] Update documentation
- [ ] Monitor analytics dashboard

---

## Troubleshooting

### OutputFormatter not found
```bash
# Check if file exists
ls -la scripts/lib/output-formatter.js

# Test directly
node scripts/lib/output-formatter.js demo-warning
```

### StatusLine not updating
```javascript
// Enable explicitly
const statusLine = new StatusLineHelper({ enabled: true });

// Check update interval
const statusLine = new StatusLineHelper({ updateInterval: 500 });
```

### HookLogger not creating logs
```javascript
// Check directory exists
const logger = new HookLogger('test', { enabled: true });

// Verify log directory
ls -la ~/.claude/logs/hooks/

// Check permissions
chmod 755 ~/.claude/logs/hooks/
```

---

## Additional Resources

- **Phase 3 Implementation**: `HOOK_ENHANCEMENTS_2025-11.md`
- **Implementation Summary**: `HOOK_SYSTEM_MODERNIZATION_SUMMARY.md`
- **Analytics Dashboard**: `scripts/hook-analytics-dashboard.js`
- **Output Templates**: `output-styles/*.md`

---

**Document Version**: 1.0
**Last Updated**: 2025-11-13
**Author**: RevPal Engineering
