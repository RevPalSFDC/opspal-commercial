# File Operation Best Practices

**Purpose**: Prevent context explosion from large file operations
**Date**: 2026-01-05
**Status**: Production

## The Problem

File operations can quickly consume context window:
- **Before**: "Simple upload" task consumed 6,132k tokens (3066% of limit)
- **Root cause**: Reading large files directly into conversation, multiple iterations
- **Baseline bloat**: 110-134k tokens in fresh conversation before any work

## Core Principles

### ❌ NEVER Do This

1. **Don't read large files into conversation**
   ```bash
   # BAD - Consumes thousands of tokens
   Read(file_path="large-data.csv")  # 5000+ lines
   ```

2. **Don't iterate on file contents**
   ```bash
   # BAD - Accumulates in message history
   Read → Edit → Read → Edit → Read → Edit
   ```

3. **Don't manually process bulk data**
   ```bash
   # BAD - Should use batch patterns
   for record in records:
       process_one_by_one()  # N+1 anti-pattern
   ```

4. **Don't load all plugin skills**
   ```bash
   # BAD - 206 skills = ~69k tokens
   Load all plugins unconditionally
   ```

---

### ✅ ALWAYS Do This

1. **Use agents for file uploads**
   ```bash
   # GOOD - Delegates to specialist
   Task(subagent_type='opspal-salesforce:sfdc-data-import-manager',
        prompt='Import customer CSV to Salesforce')
   ```

2. **Use batch patterns for >10 records**
   ```bash
   # GOOD - 80-99% fewer API calls
   batch_metadata_fetch()  # Fetch all metadata once
   process_all_records()    # Use pre-fetched metadata
   ```

3. **Use Write tool for single-pass file creation**
   ```bash
   # GOOD - No iterations
   Write(file_path="config.json", content=complete_content)
   ```

4. **Use conditional plugin loading**
   ```bash
   # GOOD - Only load relevant skills
   PluginSelector(task_description).selectPlugins()
   # Result: 12-20 skills instead of 206
   ```

---

## Decision Tree

```
File operation requested?
│
├─ Is this Salesforce data?
│  └─ YES → Route to opspal-salesforce:sfdc-data-import-manager
│
├─ Is this HubSpot data?
│  └─ YES → Route to opspal-hubspot:hubspot-data-operations-manager
│
├─ Is this interactive UI/upload?
│  └─ YES → Use FileUploadComponent (HTML5, no Playwright)
│             - opspal-core/scripts/lib/web-viz/components/FileUploadComponent.js
│             - Supports: JSON, CSV, XLSX (max 5MB)
│             - Features: drag-drop, validation, progress, column mapping
│
├─ Is this a compensation plan?
│  └─ YES → Use plan-builder template
│             - Template: opspal-core/templates/web-viz/plan-builder.json
│             - Component: PlanBuilderComponent with editable tables
│
├─ Need to create files manually?
│  └─ YES → Use Write tool (single pass, no iteration)
│             - Write complete content at once
│             - Don't read-edit-read cycle
│
└─ File size >1000 lines?
   └─ YES → BLOCK - Route to agent or chunk processing
```

---

## Agent Routing Table

| Operation | Platform | Agent | Example |
|-----------|----------|-------|---------|
| **Import CSV** | Salesforce | `sfdc-data-import-manager` | Import 500 leads from CSV |
| **Import CSV** | HubSpot | `hubspot-data-operations-manager` | Upload contact list to HubSpot |
| **Bulk Export** | Salesforce | `sfdc-data-export-manager` | Backup all accounts (10k records) |
| **Bulk Export** | HubSpot | `hubspot-data-operations-manager` | Export deals for analysis |
| **Interactive Upload** | Web UI | `diagram-generator` | Create plan builder with file upload |
| **Compensation Plan** | Web UI | `diagram-generator` + plan-builder | Interactive tier/role editor |
| **Data Quality** | Cross-platform | `revops-data-quality-orchestrator` | Deduplicate contacts across systems |

---

## Performance Guidelines

### File Size Thresholds

| Records | Approach | Expected Time | Token Usage |
|---------|----------|---------------|-------------|
| <10 | Direct operation | Seconds | <1k tokens |
| 10-100 | Batch API | Minutes | 1-5k tokens |
| 100-10k | Bulk API + agent | 5-30 min | 5-20k tokens |
| >10k | Async Bulk API + agent | Hours | 20-50k tokens |

### Token Budgets

| Operation Type | Budget | Risk Level |
|----------------|--------|------------|
| Simple query | <5k tokens | ✅ Safe |
| Single file read (<500 lines) | <10k tokens | ✅ Safe |
| Multiple file reads | <20k tokens | ⚠️ Caution |
| Large file read (>1000 lines) | 20-50k tokens | ⚠️ Caution |
| Bulk data operation (manual) | 50-100k+ tokens | ❌ Blocked |

**Rule of Thumb**: If budget >20k tokens, delegate to agent

---

## Context Safeguards

### Pre-Tool Context Check

**Hook**: `.claude/hooks/pre-tool-context-check.sh`

**Triggers when**: Context usage >100k tokens (50% of limit)

**Actions**:
- ❌ Blocks tool execution
- 💡 Shows recommendations:
  - `/clear` - Clear conversation history
  - `/compact` - Compress message history
  - Use Task tool for large operations
  - Delegate to specialized agents

**Example**:
```bash
⚠️ CONTEXT WARNING: 134k/200k tokens used (67%)
Threshold: 100k tokens (50% limit)

Recommended Actions:
  1. /clear
  2. Delegate to agents: sfdc-data-import-manager, sfdc-data-export-manager
```

---

### Pre-Data Operation Check

**Hook**: `.claude/hooks/pre-data-operation.sh`

**Triggers when**: Keywords match bulk data operations
- `import|upload|bulk|process` + `csv|records|data`

**Actions**:
- ✅ Allows execution (non-blocking)
- 💡 Shows batch pattern recommendations
- 📊 Displays specialized agents for task
- 📖 Links to performance guides

**Example**:
```bash
💡 BATCH PATTERN RECOMMENDED

For optimal performance, consider:
  • Salesforce: sfdc-data-import-manager
  • HubSpot: hubspot-data-operations-manager

Performance Benefits:
  • 80-99% fewer API calls
  • Automatic retry logic
  • Pre-flight validation
```

---

## Conditional Plugin Loading

**Problem**: All 206 skills loaded = ~69k tokens (35% of limit)

**Solution**: Context-aware lazy loading

### How It Works

1. **Parse Task Description**
   ```javascript
   const extractor = new TaskKeywordExtractor("Import leads to Salesforce");
   // Extracts: { platforms: ['salesforce'], operations: ['import'], domains: ['data'] }
   ```

2. **Select Relevant Plugins**
   ```javascript
   const selector = new PluginSelector(taskDescription);
   const plugins = selector.selectPlugins();
   // Result: ['salesforce-plugin'] (not all 9 plugins)
   ```

3. **Filter Skills**
   ```javascript
   // Load top 20 salesforce skills (not all 68)
   // Token savings: 186 skills = ~62k tokens (90% reduction)
   ```

### Expected Savings

| Task Type | Skills Loaded | Token Savings | Reduction |
|-----------|---------------|---------------|-----------|
| Salesforce import | 20 of 206 | ~62k tokens | 90% |
| HubSpot workflow | 12 of 206 | ~65k tokens | 94% |
| Cross-platform diagram | 15 of 206 | ~64k tokens | 93% |
| Multi-platform | 40 of 206 | ~55k tokens | 80% |

**Scripts**:
- `scripts/lib/task-keyword-extractor.js` - Keyword extraction
- `scripts/lib/plugin-selector.js` - Plugin/skill selection

**Usage**:
```bash
node scripts/lib/plugin-selector.js "Import 500 leads to Salesforce"
# Output: Selected plugins, estimated token savings
```

---

## Real-World Examples

### Example 1: CSV Import (CORRECT)

**Task**: Import 500 customer records from CSV to Salesforce

**❌ Wrong Approach** (consumed 6,132k tokens):
1. Read CSV file into conversation (5k tokens)
2. Parse CSV manually (iterations add 2k tokens)
3. Create records one-by-one (N+1 pattern, 50k tokens)
4. Multiple error iterations (message history bloat, 6,000k+ tokens)

**✅ Correct Approach** (<20k tokens):
```bash
Task(subagent_type='opspal-salesforce:sfdc-data-import-manager',
     prompt='Import customers.csv to Salesforce Account object.
             Map CSV columns: Name→Name, Email→Email__c, Phone→Phone')
```

**Result**:
- Agent handles file reading, validation, bulk API
- Uses batch patterns (1 + M API calls instead of 1 + N*M)
- Pre-flight validation catches errors before import
- Token usage: ~15k tokens (6,132k → 15k = 99.8% reduction)

---

### Example 2: Compensation Plan Upload (CORRECT)

**Task**: Create interactive compensation plan builder with file upload

**❌ Wrong Approach**:
1. Manually create FileUploadComponent (read docs, 5k tokens)
2. Manually create EditableTableComponent (read docs, 5k tokens)
3. Manually create PlanBuilderComponent (read docs, 5k tokens)
4. Write demo data manually (iterations, 3k tokens)
5. Debug integration issues (message bloat, 10k+ tokens)

**✅ Correct Approach**:
```bash
Task(subagent_type='opspal-core:diagram-generator',
     prompt='Create compensation plan builder interface with:
             - File upload for tiers/roles (CSV/JSON/XLSX)
             - Editable tables for plan modification
             - Live preview with charts
             Use plan-builder template')
```

**Result**:
- Agent uses existing FileUploadComponent (HTML5, no Playwright)
- Uses plan-builder template (pre-built)
- Token usage: <10k tokens

---

### Example 3: Bulk Export (CORRECT)

**Task**: Export all Salesforce accounts for analysis (10,000 records)

**❌ Wrong Approach**:
1. Query accounts in batches (1000 records × 10 queries)
2. Read each batch into conversation (10k tokens per batch = 100k tokens)
3. Manual CSV formatting (iterations, 20k tokens)

**✅ Correct Approach**:
```bash
Task(subagent_type='opspal-salesforce:sfdc-data-export-manager',
     prompt='Export all Accounts to CSV with fields:
             Name, Industry, AnnualRevenue, Phone, Website')
```

**Result**:
- Agent uses streaming export (doesn't load into memory)
- Writes directly to file (no conversation bloat)
- Token usage: ~10k tokens (100k → 10k = 90% reduction)

---

## Monitoring & Validation

### Check Context Usage
```bash
# Before operation
claude status

# Expected: <80k tokens baseline (down from 134k)
# After conditional loading: 40-60k tokens
```

### Test Plugin Selector
```bash
# Test various tasks
node scripts/lib/plugin-selector.js "Import Salesforce data"
node scripts/lib/plugin-selector.js "Create HubSpot workflow"
node scripts/lib/plugin-selector.js "Generate ERD diagram"

# Verify 80-95% token savings
```

### Validate Routing
```bash
# Check if agent routing works
claude code "upload customer CSV to Salesforce"
# Should trigger: sfdc-data-import-manager

# Check if batch pattern recommendation appears
claude code "bulk import 1000 contacts"
# Should show: 💡 BATCH PATTERN RECOMMENDED
```

---

## Troubleshooting

### Context Still High (>100k tokens)

**Symptoms**: Fresh conversation starts at 100k+ tokens

**Causes**:
1. Conditional plugin loading not active
2. Too many skills still loading
3. Large CLAUDE.md files in memory

**Fixes**:
```bash
# 1. Verify plugin selector works
node scripts/lib/plugin-selector.js "test task"

# 2. Check how many skills loading
# Expected: 12-40 skills depending on task
# Current: 206 skills (if conditional loading disabled)

# 3. Review CLAUDE.md sizes
find . -name "CLAUDE.md" -exec wc -l {} +
# Consider applying progressive disclosure if any >1000 lines
```

---

### File Operation Still Consuming Too Many Tokens

**Symptoms**: File imports/exports use >50k tokens

**Causes**:
1. Not using specialized agents
2. Reading files directly into conversation
3. N+1 query patterns

**Fixes**:
```bash
# 1. Always route to agents
if [[ "$task" =~ import|upload|bulk ]]; then
    use_agent="true"
fi

# 2. Never read large files
if [[ $(wc -l "$file") -gt 1000 ]]; then
    delegate_to_agent
fi

# 3. Use batch patterns
# See docs/BATCH_PATTERN_GUIDE.md
```

---

## Success Metrics

### Week 1 (Immediate Wins)
- ✅ Baseline context: 134k → ~80k tokens (40% reduction)
- ✅ Conditional plugin loading: 90-94% token savings
- ✅ Context safeguard hooks in place
- ✅ Routing table updated with file operations

### Week 2-3 (Optimization)
- ⏱️ Context-based skill filtering: 134k → 54-64k tokens (52-60% reduction)
- ⏱️ File operations properly routed: 100% agent usage
- ⏱️ Zero context explosions (>200k tokens)

### Week 4-5 (Validation)
- ⏱️ Progressive disclosure for large agents: Additional 4-5k token savings
- ⏱️ Agent-scoped MCP loading: Additional 16.5k token savings
- ⏱️ Final baseline: **<60k tokens** (55% reduction from 134k)

---

## Related Documentation

- `docs/BATCH_PATTERN_GUIDE.md` - 88% improvement across 18 agents
- `docs/PROGRESSIVE_DISCLOSURE_REPLICATION_GUIDE.md` - 40-50% token reduction
- `docs/CONDITIONAL_PLUGIN_LOADING.md` - Lazy loading strategy
- `docs/PLUGIN_SKILL_AUDIT.md` - Skills breakdown by plugin
- `docs/routing-help.md` - Agent routing table
- `.claude/hooks/pre-tool-context-check.sh` - Context safeguard
- `.claude/hooks/pre-data-operation.sh` - Batch pattern recommendations

---

**Last Updated**: 2026-01-05
**Owner**: RevPal Engineering
**Status**: Production - Week 1 Complete
