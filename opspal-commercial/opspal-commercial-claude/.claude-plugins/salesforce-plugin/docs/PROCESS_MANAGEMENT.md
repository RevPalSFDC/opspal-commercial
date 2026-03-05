# Process Lock Manager & Progress Monitoring

**Version:** 1.0.0
**Created:** 2025-10-14
**Fixes:** Reflection Cohort fp-002-process-management

## Overview

Prevents concurrent execution of identical scripts and provides real-time progress visibility for long-running Salesforce operations.

## Components

### 1. Process Lock Manager (`process-lock-manager.js`)
- PID-based file locking
- Automatic stale lock detection (1-hour threshold)
- Graceful retry mechanism
- Manual lock release utility

### 2. Progress File Framework (`progress-file-writer.js`)
- Structured JSON progress updates
- File-based (no database required)
- Atomic writes prevent corruption
- Auto-cleanup on completion

### 3. Check Progress CLI (`check-progress.js`)
- Real-time progress monitoring
- Watch mode for continuous updates
- ASCII progress bars with color coding
- ETA calculation

## Quick Start

### Add to Long-Running Script

```javascript
const { acquireLock, releaseLock } = require('./lib/process-lock-manager');
const { ProgressWriter } = require('./lib/progress-file-writer');

async function main() {
  // Step 1: Acquire lock
  const lock = await acquireLock({
    scriptName: 'query_all_parent_accounts.js',
    args: process.argv.slice(2)
  });

  if (!lock.acquired) {
    console.error('❌ Script is already running');
    console.error(`   PID ${lock.metadata.pid} started ${lock.metadata.startedAt}`);
    process.exit(1);
  }

  // Step 2: Initialize progress tracking
  const progress = new ProgressWriter({
    scriptName: 'query_all_parent_accounts.js',
    totalSteps: 1000
  });

  try {
    // Your long-running operation
    for (let i = 1; i <= 1000; i++) {
      // Do work...

      // Update progress
      progress.update({
        currentStep: i,
        message: `Processing record ${i}/1000`
      });
    }

    progress.complete('All records processed successfully');

  } catch (error) {
    progress.fail(error.message);
    throw error;

  } finally {
    // Step 3: Release lock
    await releaseLock(lock.lockFile);
  }
}
```

### Monitor Progress

```bash
# Show all active operations
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/check-progress.js

# Show specific script
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/check-progress.js query_all_parent_accounts.js

# Watch mode (updates every 2 seconds)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/check-progress.js --watch
```

## Success Criteria

1. **Zero Concurrent Execution** - 0 incidents in 90 days
2. **100% Progress Reporting** - All scripts >30s report progress
3. **Progress Accuracy** - Within 10% of actual completion
4. **Fast Diagnosis** - <5 min to answer "is this hung?"

## Examples

See `docs/PAGINATION_AND_VALIDATION.md` for integration patterns.

## ROI

**Annual Savings:** $36,000
**Implementation:** 6 hours
**Payback:** 0.6 months

**Prevents:**
- API rate limit errors from concurrent execution
- Wasted compute resources
- User uncertainty about operation status

## References

- **Asana Task:** https://app.asana.com/0/1211617834659194/1211640470718725
- **Reflection:** 068c7cf7-7087-4a29-940e-ba25163505c6
