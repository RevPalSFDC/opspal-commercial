# Salesforce Plugin - Migration Guide

This guide documents deprecated features and how to migrate to their replacements.

## Active Deprecations

### BulkMergeExecutor (Serial) → ParallelBulkMergeExecutor

**Deprecated**: 2025-10-18
**Reason**: Parallel implementation is 5x faster (10s vs 49.5s per pair)
**Timeline**: Serial executor will be removed in v4.0.0 (Q2 2026)

#### Performance Comparison

| Implementation | Time per Pair | Workers | Total Time (100 pairs) |
|----------------|---------------|---------|------------------------|
| Serial (OLD) | 49.5s | 1 | 82.5 minutes |
| Parallel (NEW) | 10.0s | 5 | 16.7 minutes |

**Speedup**: 5x faster with 5 workers

#### Migration

**Before (Serial - DEPRECATED):**
```javascript
const BulkMergeExecutor = require('./bulk-merge-executor');

const executor = new BulkMergeExecutor(orgAlias, {
  batchSize: 10,
  dryRun: false,
  autoApprove: false
});

const result = await executor.execute(decisions);
```

**After (Parallel - RECOMMENDED):**
```javascript
const ParallelBulkMergeExecutor = require('./bulk-merge-executor-parallel');

const executor = new ParallelBulkMergeExecutor(orgAlias, {
  batchSize: 10,
  maxWorkers: 5,  // ← NEW: Control parallelism (default: 5)
  dryRun: false,
  autoApprove: false
});

const result = await executor.execute(decisions);
```

**Key Changes:**
1. Import from `./bulk-merge-executor-parallel` instead of `./bulk-merge-executor`
2. Add `maxWorkers` config (recommended: 5 for optimal performance)
3. API is otherwise identical (drop-in replacement)

#### Files to Update

If you see deprecation warnings, search your codebase for:

```bash
# Find all uses of BulkMergeExecutor
grep -r "BulkMergeExecutor" --include="*.js" --include="*.md"

# Should update these patterns:
# 1. require('./bulk-merge-executor')
# 2. new BulkMergeExecutor(
# 3. const BulkMergeExecutor =
```

**Already Migrated**:
- ✅ `agent-dedup-helper.js` (migrated 2025-10-18)

**Still Using Serial** (NONE - all migrated):
- None remaining

#### Warnings

When using the deprecated serial executor, you'll see:

```
═══════════════════════════════════════════════════════════════════
⚠️  DEPRECATION WARNING: BulkMergeExecutor (serial) is deprecated
═══════════════════════════════════════════════════════════════════

Use ParallelBulkMergeExecutor instead for 5x performance improvement.

Migration:
  ❌ OLD: const executor = new BulkMergeExecutor(orgAlias, options);
  ✅ NEW: const executor = new ParallelBulkMergeExecutor(orgAlias, {
            maxWorkers: 5,  // Add this config for parallel execution
            ...options
          });

Performance comparison:
  Serial:   49.5s per pair
  Parallel: 10.0s per pair (5x faster with 5 workers)

This warning will be shown every time you use BulkMergeExecutor.
Update to ParallelBulkMergeExecutor to remove this warning.
═══════════════════════════════════════════════════════════════════
```

To remove this warning, migrate to `ParallelBulkMergeExecutor`.

---

## Future Deprecations

### None Currently Planned

---

## Removed Features

### Legacy sfdx CLI Support

**Removed**: 2025-12-28 (hard deprecation)
**Reason**: Salesforce CLI features ship via `sf` only; legacy `sfdx` commands are unsupported.
**Impact**: Any invocation of `sfdx` fails fast with a clear error.

#### Migration

1. Install Salesforce CLI (`sf`) v2+ and ensure it is on PATH.
2. Replace legacy command syntax with `sf` equivalents (see `docs/SF_CLI_COMMAND_MAPPING.md`).
3. Use `--target-org` or `SF_TARGET_ORG` for org targeting; auth persists via `sf`.

---

## Version History

### v3.2.0 (Current)
- ⚠️ DEPRECATED: BulkMergeExecutor (serial) in favor of ParallelBulkMergeExecutor
- ✅ NEW: ParallelBulkMergeExecutor with 5x performance improvement
- ✅ NEW: Routing Toolkit for pattern validation and optimization

### v3.1.0
- Added dedup safety engine
- Added conflict detection

### v3.0.0
- Initial Phase 5 release
- Bulk merge operations
- Safety guardrails

---

## Migration Support

### Getting Help

**Documentation**:
- Routing System: `/routing-help` command
- Agent Reference: `WIRING_TABLE.csv` in project root
- API Documentation: See individual agent `.md` files

**Testing**:
```bash
# Validate routing patterns
node scripts/lib/routing-toolkit.js validate

# Test your migration
node scripts/lib/routing-toolkit.js test "your operation here"

# Analyze usage
node scripts/lib/routing-toolkit.js analyze
```

**Reporting Issues**:
- Use `/reflect` command to submit feedback
- Reflections are processed weekly via Supabase → Asana workflow

---

## Backward Compatibility

We maintain backward compatibility across minor versions (3.x.x):

- **Deprecated features**: Kept for 12+ months with warnings
- **Breaking changes**: Only in major versions (4.0.0+)
- **Security fixes**: May break compatibility if critical

**Deprecation Timeline**:
1. **Month 0**: Feature deprecated, warnings added
2. **Month 3**: Warnings become more prominent
3. **Month 6**: Documentation updated to remove old examples
4. **Month 12+**: Feature removed in next major version

---

## Questions?

Use `/reflect` to submit questions or feedback about migrations.

**Last Updated**: 2025-12-28
