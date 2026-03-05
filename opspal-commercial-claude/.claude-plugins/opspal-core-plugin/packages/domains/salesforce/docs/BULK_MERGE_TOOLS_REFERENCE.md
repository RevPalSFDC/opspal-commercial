# Bulk Merge Tools Reference for Agents

**Version**: v3.3.0
**Last Updated**: 2025-10-16
**Audience**: Sub-agents (sfdc-merge-orchestrator, sfdc-data-operations, etc.)

## Overview

When users request bulk merge/deduplication operations, use the **bulk merge executor tools** instead of implementing merges manually.

## Quick Reference

### When to Use Bulk Merge Tools

**Triggers**:
- User requests to "merge" or "deduplicate" 5+ Account pairs
- User provides a decisions file or duplicate pairs list
- User says "bulk merge", "mass merge", "dedup 100 accounts"
- After running `/dedup analyze` command

**Don't Use For**:
- Single pair merges (use Salesforce native merge UI)
- Object consolidation (different than record deduplication)
- Field merging (use sfdc-metadata-manager)

## Available Tools

### 1. bulk-merge-executor-parallel.js (RECOMMENDED)

**Use For**: 5+ pairs, production scale operations

**Performance**: 5x faster than serial (16.5 min for 100 pairs)

**Command**:
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/bulk-merge-executor-parallel.js \
  --org {org-alias} \
  --decisions {decisions-file} \
  --workers {n} \
  --batch-size {n} \
  [--dry-run] \
  [--max-pairs {n}] \
  [--auto-approve]
```

**Options**:
- `--workers {n}`: Parallel workers per batch (default: 5, max: 10)
- `--batch-size {n}`: Pairs per batch (default: 10)
- `--dry-run`: Validation mode without executing
- `--max-pairs {n}`: Limit total pairs (for testing)
- `--auto-approve`: Skip 5-second confirmation
- `--serial`: Disable parallelization (backward compatibility)

**Example Usage in Agent**:
```javascript
// User: "Execute the approved merges from dedup-decisions.json"

// Use Bash tool to execute
const result = await Bash({
  command: `node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/bulk-merge-executor-parallel.js \
    --org production \
    --decisions dedup-decisions.json \
    --workers 5 \
    --batch-size 10`,
  description: "Execute bulk merge with parallel processing",
  timeout: 300000  // 5 minutes for large batches
});

// Check for success
if (result.includes('✅ Execution complete')) {
  // Success - inform user
  console.log('Bulk merge completed successfully');

  // Extract execution log path
  const logMatch = result.match(/execution-logs\/(exec_.*\.json)/);
  if (logMatch) {
    console.log(`Execution log: ${logMatch[1]}`);
    console.log('Use this for rollback if needed');
  }
}
```

### 2. bulk-merge-executor.js (Legacy Serial)

**Use For**: Small batches (<10 pairs), compatibility mode

**Performance**: Serial processing (49.5s per pair)

**Command**:
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/bulk-merge-executor.js \
  --org {org-alias} \
  --decisions {decisions-file} \
  [--batch-size {n}] \
  [--dry-run] \
  [--max-pairs {n}]
```

**When to Use**:
- User explicitly requests serial mode
- Org has API rate limit concerns
- Testing/validation phase
- Fallback if parallel has issues

### 3. Rollback Tool (dedup-rollback-system.js)

**Use For**: Undoing completed merges

**Command**:
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dedup-rollback-system.js \
  --execution-log execution-logs/{exec_id}.json \
  [--dry-run]
```

**Features**:
- Undeletes merged records from recycle bin
- Restores original field values on master
- Re-parents related records back
- Works within 72 hours of merge (recycle bin retention)

## Integration Patterns

### Pattern 1: Standard Dedup Workflow

```javascript
// User: "/dedup execute production dedup-decisions.json"

// 1. Validate prerequisites
const validation = await checkPrerequisites();
if (!validation.passed) {
  return 'Prerequisites not met. Run /dedup prepare first.';
}

// 2. Execute with parallel processing
await Bash({
  command: `node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/bulk-merge-executor-parallel.js \
    --org production \
    --decisions dedup-decisions.json \
    --workers 5`,
  timeout: 600000  // 10 minutes
});

// 3. Report results
return 'Merge execution complete. Check execution log for details.';
```

### Pattern 2: Conservative Rollout

```javascript
// User: "Start with 50 pairs to test"

// Start conservative
await Bash({
  command: `node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/bulk-merge-executor-parallel.js \
    --org production \
    --decisions dedup-decisions.json \
    --workers 3 \
    --max-pairs 50 \
    --batch-size 10`,
  timeout: 300000
});
```

### Pattern 3: Dry-Run First

```javascript
// User: "Execute the merges but let's test first"

// 1. Dry run
const dryRunResult = await Bash({
  command: `node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/bulk-merge-executor-parallel.js \
    --org production \
    --decisions dedup-decisions.json \
    --dry-run`,
  timeout: 120000
});

// 2. Check results
if (dryRunResult.includes('✅ Execution simulation complete')) {
  const approval = await getUserConfirmation('Dry run passed. Execute for real?');

  if (approval) {
    // Real execution
    await Bash({
      command: `node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/bulk-merge-executor-parallel.js \
        --org production \
        --decisions dedup-decisions.json`,
      timeout: 600000
    });
  }
}
```

### Pattern 4: Rollback After Error

```javascript
// User: "Something went wrong, rollback the last merge"

// 1. Find latest execution log
const logs = await Bash({
  command: 'ls -t execution-logs/*.json | head -1',
  timeout: 5000
});

const latestLog = logs.trim();

// 2. Execute rollback
await Bash({
  command: `node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dedup-rollback-system.js \
    --execution-log ${latestLog}`,
  timeout: 300000
});
```

## Decision File Format

The tools expect `dedup-decisions.json` in this format:

```json
{
  "decisions": [
    {
      "pair_id": "001xx00000ABC123_001xx00000DEF456",
      "recommended_survivor": "001xx00000ABC123",
      "recommended_deleted": "001xx00000DEF456",
      "decision": "APPROVE",
      "confidence_score": 0.95,
      "reason": "High confidence match",
      "scores": {
        "relationship_score": 100,
        "integration_id_score": 50,
        "data_completeness_score": 30
      }
    }
  ],
  "summary": {
    "total_pairs": 100,
    "approved": 85,
    "rejected": 10,
    "review_required": 5
  }
}
```

**Important**: The executor only processes `"decision": "APPROVE"` pairs. REVIEW and BLOCK are automatically skipped.

## Performance Guidelines

### Worker Count Recommendations

| Pairs | Workers | Batch Size | Expected Time |
|-------|---------|------------|---------------|
| 1-5 | 1 (serial) | 5 | <5 min |
| 10-50 | 3 | 10 | 5-15 min |
| 50-100 | 5 | 10 | 15-20 min |
| 100-500 | 5 | 20 | 60-100 min |
| 500+ | 5-7 | 20 | 2-6 hours |

### API Rate Limits

**Salesforce Limits**:
- 100 API calls per 10 seconds (most orgs)
- 25 concurrent API requests

**Safe Worker Counts**:
- 5 workers: ~50 calls/10s (safe)
- 7 workers: ~70 calls/10s (moderate)
- 10 workers: ~90 calls/10s (risky)

**Recommendation**: Default to 5 workers unless org has proven high capacity.

## Error Handling

### Common Errors

**1. "Cannot find decisions file"**
```javascript
// Solution: Check file path
const decisions File = path.resolve(decisionsFile);
if (!fs.existsSync(decisionsFile)) {
  return `Decisions file not found: ${decisionsFile}`;
}
```

**2. "No approved decisions"**
```javascript
// Solution: Check decision file content
// The tool only executes APPROVE decisions
// May need to review REVIEW decisions manually
```

**3. "Pre-flight validation failed"**
```javascript
// Solution: Run /dedup prepare first
await Bash({
  command: `/dedup prepare ${org}`,
  timeout: 300000
});
```

**4. "UNABLE_TO_LOCK_ROW"**
```
// Solution: Transient error, executor retries automatically
// If persistent, reduce workers or batch size
```

## Output Files

### Execution Log

**Location**: `execution-logs/exec_{timestamp}.json`

**Contents**:
```json
{
  "execution_id": "exec_2025-10-16T12-00-00-000Z",
  "org": "production",
  "timestamp_start": "2025-10-16T12:00:00.000Z",
  "timestamp_end": "2025-10-16T12:16:30.000Z",
  "config": {
    "batchSize": 10,
    "maxWorkers": 5,
    "dryRun": false
  },
  "batches": [...],
  "summary": {
    "total": 100,
    "success": 98,
    "failed": 2,
    "skipped": 0
  },
  "parallel_stats": {
    "workers": 5,
    "execution_mode": "PARALLEL",
    "avg_duration_seconds": "9.8",
    "total_merges": 98
  }
}
```

**Usage**: Required for rollback operations

### Rollback Log

**Location**: `rollback-logs/rollback_{timestamp}.json`

**Created By**: `dedup-rollback-system.js`

**Contents**: List of restored pairs with status

## Best Practices for Agents

### ✅ DO

1. **Always dry-run first** for production orgs
2. **Use parallel executor** for 5+ pairs
3. **Default to 5 workers** unless user specifies
4. **Capture execution log path** for user reference
5. **Check prerequisites** before execution
6. **Inform user of performance** (estimated time)
7. **Provide rollback instructions** after execution

### ❌ DON'T

1. **Don't implement merges manually** when bulk tools exist
2. **Don't use 10 workers** without user confirmation
3. **Don't skip dry-run** for production
4. **Don't lose execution log path** (needed for rollback)
5. **Don't execute REVIEW/BLOCK decisions** (safety violation)

## Example Agent Prompts

### sfdc-merge-orchestrator

```
User: "Execute the 150 approved merges from the dedup analysis"

Agent Response:
I'll execute the approved merges using parallel processing for optimal performance.

**Configuration**:
- Workers: 5 (default for enterprise scale)
- Expected time: ~25 minutes for 150 pairs
- Mode: Production (real execution)

**Pre-flight check**...
✅ Decisions file found (150 APPROVE decisions)
✅ Org connection validated
✅ Prerequisites passed

**Execution** (with progress updates)...
[Uses bulk-merge-executor-parallel.js]

**Result**:
✅ Merge complete: 148 success, 2 failed
📄 Execution log: execution-logs/exec_2025-10-16T12-00-00-000Z.json

**Rollback Available**:
If needed, rollback with:
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dedup-rollback-system.js --execution-log execution-logs/exec_2025-10-16T12-00-00-000Z.json
```

### sfdc-data-operations

```
User: "Process the dedup decisions but start with just 20 pairs"

Agent Response:
I'll process 20 pairs as a conservative start.

**Configuration**:
- Workers: 3 (conservative)
- Max pairs: 20
- Expected time: ~3 minutes

**Executing**...
[Uses bulk-merge-executor-parallel.js with --max-pairs 20]

**Result**:
✅ 20 pairs merged successfully
📄 Log: execution-logs/exec_*.json

You can now proceed with remaining pairs if satisfied with results.
```

## Troubleshooting

### Performance Issues

**Symptom**: Execution taking longer than expected

**Solutions**:
1. Check worker count: `grep "workers" execution-log.json`
2. Increase workers if <5: `--workers 7`
3. Check API usage in Salesforce Setup → System Overview
4. Reduce batch size if seeing UNABLE_TO_LOCK_ROW errors

### Rollback Failures

**Symptom**: Rollback can't restore records

**Common Causes**:
1. Records purged from recycle bin (>15 days)
2. Execution log corrupted/incomplete
3. Org permissions changed

**Solutions**:
1. Check recycle bin retention
2. Verify execution log is valid JSON
3. Try manual restore via Salesforce UI

## Related Documentation

- **User Guide**: `/dedup` command documentation
- **Implementation**: `ENTERPRISE_SCALE_ROADMAP_COMPLETE.md`
- **Performance**: `PHASE2_PARALLEL_PROCESSING_RESULTS.md`
- **Recovery**: `DEDUP_RECOVERY_GUIDE.md`

---

**Remember**: These tools provide 5x performance improvement over manual processing. Always use them for bulk operations with 5+ pairs.
