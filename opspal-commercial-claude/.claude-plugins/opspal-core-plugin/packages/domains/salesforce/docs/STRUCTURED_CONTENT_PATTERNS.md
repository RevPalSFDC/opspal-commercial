# Structured Content Patterns for Salesforce Plugin Scripts

**Version**: 1.0.0
**Created**: 2025-11-04
**Feature**: Claude Code v2.0.32 Integration

## Overview

Structured content formatting transforms plain text script outputs into beautifully formatted reports that Claude Code displays with rich formatting. Instead of console.log statements with raw text, scripts now output:

- **Markdown tables** with automatic column alignment
- **Code blocks** with syntax highlighting
- **Section headers** with emojis and hierarchy
- **Status indicators** with visual symbols
- **Metrics displays** with consistent formatting
- **Progress bars** and timelines
- **Warning/error boxes** with clear styling

**User Experience Impact:**
- **Before**: Plain console.log output, hard to scan
- **After**: Structured, formatted reports with visual hierarchy

**Implementation**: Uses `structured-content-formatter.js` library with 20+ formatting functions.

## Quick Start

### 1. Import the Formatter

```javascript
const { StructuredFormatter } = require('./lib/structured-content-formatter');
const formatter = new StructuredFormatter();
```

### 2. Format Output

```javascript
// Instead of plain console.log
console.log('Object: Account, Records: 1500');

// Use structured formatting
console.log(formatter.table(
  [{ object: 'Account', records: 1500 }],
  ['object', 'records']
));
```

### 3. Example Output

**Before**:
```
Object: Account, Records: 1500
Object: Contact, Records: 3200
```

**After**:
```
| Object  | Records |
|---------|---------|
| Account | 1500    |
| Contact | 3200    |
```

## When to Use Structured Content

### ✅ Use For:

| Scenario | Formatter Method | Why |
|----------|------------------|-----|
| Tabular data (objects, fields, records) | `table()` | Easy to scan, compare values |
| Deployment summaries | `summaryBox()` | Clear overview at a glance |
| Error messages | `errorBox()` | Immediate visibility |
| Code examples | `codeBlock()` | Syntax highlighting |
| Metrics/statistics | `metricsSummary()` | Consistent key-value format |
| Progress updates | `progressBar()` | Visual progress indicator |
| Status updates | `statusBadge()` | Clear visual state |
| Timelines | `timeline()` | Chronological events |
| Comparisons | `comparisonTable()` | Before/after visibility |

### ❌ Don't Use For:

| Scenario | Use Instead | Why |
|----------|-------------|-----|
| Debug logging | `console.error()` | Keep logs simple |
| Interactive prompts | Native prompts | Formatting interferes |
| Real-time streaming | Plain text | Formatting adds overhead |
| Binary data | JSON | Structured data, not formatting |

## Formatter API Reference

### Tables

#### `table(data, columns, options)`

Format arrays of objects as markdown tables.

**Parameters:**
- `data` (Array<Object>): Data to display
- `columns` (Array<string>|Object): Column definitions
- `options` (Object): Formatting options (align, etc.)

**Examples:**

```javascript
// Simple table (infer column names from data)
formatter.table(
  [
    { name: 'Account', count: 150 },
    { name: 'Contact', count: 300 }
  ],
  ['name', 'count']
);

// Table with custom headers
formatter.table(
  data,
  { name: 'Object Name', count: 'Record Count' }
);

// Table with right-aligned numbers
formatter.table(
  data,
  { name: 'Object', count: 'Count' },
  { align: { count: 'right' } }
);
```

**Output:**
```
| Object Name | Record Count |
|-------------|--------------|
| Account     | 150          |
| Contact     | 300          |
```

---

#### `comparisonTable(comparisons, options)`

Format before/after comparison tables.

**Parameters:**
- `comparisons` (Array<Object>): Comparison data with before/after
- `options` (Object): Labels for before/after columns

**Example:**

```javascript
formatter.comparisonTable([
  { item: 'API Calls', before: 1000, after: 750, change: '-25%' },
  { item: 'Response Time', before: '2.5s', after: '1.8s', change: '-28%' }
], { beforeLabel: 'Previous', afterLabel: 'Current' });
```

**Output:**
```
| Item          | Previous | Current | Change |
|---------------|----------|---------|--------|
| API Calls     | 1000     | 750     | -25%   |
| Response Time | 2.5s     | 1.8s    | -28%   |
```

---

### Code Blocks

#### `codeBlock(code, language, options)`

Format code with syntax highlighting.

**Parameters:**
- `code` (string): Code to display
- `language` (string): Language for syntax highlighting
- `options` (Object): Optional title

**Supported Languages:**
- `javascript`, `typescript`, `json`, `sql`, `bash`, `apex`, `xml`, `yaml`, `markdown`

**Examples:**

```javascript
// SOQL query
formatter.codeBlock(
  'SELECT Id, Name FROM Account WHERE Industry = \'Technology\'',
  'sql'
);

// JSON with title
formatter.codeBlock(
  JSON.stringify(data, null, 2),
  'json',
  { title: 'Configuration' }
);

// Bash command
formatter.codeBlock(
  'sf project deploy start --source-dir force-app',
  'bash'
);
```

**Output:**
```sql
SELECT Id, Name FROM Account WHERE Industry = 'Technology'
```

---

### Section Headers

#### `section(title, options)`

Format section headers with hierarchy and emojis.

**Parameters:**
- `title` (string): Section title
- `options` (Object): Level, emoji, type, divider

**Options:**
- `level` (number): Header level (1-6, default: 2)
- `emoji` (string): Custom emoji prefix
- `type` (string): Predefined emoji type (summary, analysis, errors, etc.)
- `divider` (boolean): Add horizontal divider

**Predefined Types:**
- `summary` (📊), `analysis` (🔍), `results` (✅), `errors` (❌), `warnings` (⚠️)
- `info` (ℹ️), `metrics` (📈), `configuration` (⚙️), `deployment` (🚀)
- `security` (🔐), `performance` (⚡), `database` (💾), `api` (🔌)
- `testing` (🧪), `documentation` (📚), `completion` (✓), `progress` (⏳)

**Examples:**

```javascript
// Level 1 header with custom emoji
formatter.section('Deployment Report', { level: 1, emoji: '🚀' });

// Level 2 header with predefined type
formatter.section('Analysis Results', { type: 'analysis', level: 2 });

// Header with divider
formatter.section('Critical Issues', { type: 'errors', divider: true });
```

**Output:**
```markdown
# 🚀 Deployment Report

## 🔍 Analysis Results

────────────────────────────────────────────────────────────
## ❌ Critical Issues
```

---

### Lists

#### `bulletList(items, options)`

Format bulleted lists.

**Parameters:**
- `items` (Array<string>): List items
- `options` (Object): Bullet emoji, indent level

**Examples:**

```javascript
// Simple bullet list
formatter.bulletList(['Item 1', 'Item 2', 'Item 3']);

// Custom bullet emoji
formatter.bulletList(items, { emoji: '→' });

// Indented list
formatter.bulletList(items, { indent: 2 });
```

**Output:**
```
- Item 1
- Item 2
- Item 3
```

---

#### `numberedList(items, options)`

Format numbered lists.

**Parameters:**
- `items` (Array<string>): List items
- `options` (Object): Start number, indent level

**Examples:**

```javascript
// Simple numbered list
formatter.numberedList(['First step', 'Second step', 'Third step']);

// Start from different number
formatter.numberedList(items, { startFrom: 5 });
```

**Output:**
```
1. First step
2. Second step
3. Third step
```

---

### Status Indicators

#### `statusBadge(status, message)`

Format status badges with symbols.

**Parameters:**
- `status` (string): Status type (success, failed, warning, info, pending, etc.)
- `message` (string): Status message

**Available Statuses:**
- `success` (✅), `failed` (❌), `warning` (⚠️), `info` (ℹ️)
- `pending` (⏳), `skipped` (⏭️), `blocked` (🚫)
- `active` (🟢), `inactive` (🔴)

**Examples:**

```javascript
formatter.statusBadge('success', 'Deployment completed');
formatter.statusBadge('failed', 'Validation failed');
formatter.statusBadge('warning', 'Minor issues detected');
```

**Output:**
```
✅ **Deployment completed**
❌ **Validation failed**
⚠️ **Minor issues detected**
```

---

### Metrics

#### `metricsSummary(metrics, options)`

Format key-value metrics display.

**Parameters:**
- `metrics` (Object): Metrics to display
- `options` (Object): Formatting options

**Example:**

```javascript
formatter.metricsSummary({
  'Total Records': '1,500',
  'Success Rate': '95.2%',
  'Duration': '2.5 seconds',
  'Throughput': '600 records/sec'
});
```

**Output:**
```
Total Records : 1,500
Success Rate  : 95.2%
Duration      : 2.5 seconds
Throughput    : 600 records/sec
```

---

#### `keyValuePairs(pairs, options)`

Format key-value pairs with bold keys.

**Parameters:**
- `pairs` (Object): Key-value pairs
- `options` (Object): Separator, indent

**Example:**

```javascript
formatter.keyValuePairs({
  'Org ID': '00D1234567890',
  'Org Name': 'Production',
  'API Version': '62.0'
});
```

**Output:**
```
**Org ID**: 00D1234567890
**Org Name**: Production
**API Version**: 62.0
```

---

### Message Boxes

#### `summaryBox(title, content, options)`

Format summary boxes with borders.

**Parameters:**
- `title` (string): Box title
- `content` (Array<string>|string): Box content
- `options` (Object): Width, symbol, emoji, type

**Example:**

```javascript
formatter.summaryBox('Quick Stats', [
  'Total: 1500',
  'Success: 1425',
  'Failed: 75'
], { type: 'summary' });
```

**Output:**
```
════════════════════════════════════════════════════════════
  📊 Quick Stats
════════════════════════════════════════════════════════════
  Total: 1500
  Success: 1425
  Failed: 75
════════════════════════════════════════════════════════════
```

---

#### `successBox(message, metrics)`

Format success message with optional metrics.

**Example:**

```javascript
formatter.successBox('Operation completed successfully', {
  'Records Processed': 1500,
  'Duration': '2.5s'
});
```

**Output:**
```
✅ **SUCCESS**: Operation completed successfully

Records Processed : 1500
Duration          : 2.5s
```

---

#### `warningBox(message, details)`

Format warning message with optional details.

**Example:**

```javascript
formatter.warningBox('Potential issues detected', [
  'Field API name mismatch on 3 objects',
  'Missing record types on 2 layouts'
]);
```

**Output:**
```
⚠️  **WARNING**: Potential issues detected

- Field API name mismatch on 3 objects
- Missing record types on 2 layouts
```

---

#### `errorBox(message, details)`

Format error message with optional details.

**Example:**

```javascript
formatter.errorBox('Validation failed', [
  'Missing required field: Name',
  'Invalid field type: Amount__c'
]);
```

**Output:**
```
❌ **ERROR**: Validation failed

- Missing required field: Name
- Invalid field type: Amount__c
```

---

### Progress & Timelines

#### `progressBar(current, total, options)`

Format text-based progress bar.

**Parameters:**
- `current` (number): Current progress value
- `total` (number): Total value
- `options` (Object): Width, label

**Example:**

```javascript
formatter.progressBar(75, 100, { width: 40, label: 'Deployment' });
```

**Output:**
```
Deployment: [==============================----------] 75% (75/100)
```

---

#### `timeline(events, options)`

Format chronological timeline of events.

**Parameters:**
- `events` (Array<Object>): Timeline events with timestamp, event, status
- `options` (Object): Marker symbol

**Example:**

```javascript
formatter.timeline([
  { timestamp: '10:00', event: 'Started deployment' },
  { timestamp: '10:05', event: 'Validation passed', status: 'success' },
  { timestamp: '10:10', event: 'Deployment complete', status: 'success' }
]);
```

**Output:**
```
10:00 • Started deployment
10:05 • Validation passed ✅
10:10 • Deployment complete ✅
```

---

### JSON Formatting

#### `jsonWithMetadata(data, metadata)`

Format JSON with metadata header.

**Parameters:**
- `data` (Object): Data to format as JSON
- `metadata` (Object): Metadata to include in comments

**Example:**

```javascript
formatter.jsonWithMetadata(
  { result: 'success', recordsProcessed: 1500 },
  { timestamp: new Date(), version: '1.0' }
);
```

**Output:**
```json
// timestamp: Mon Nov 04 2025 10:00:00
// version: 1.0
{
  "result": "success",
  "recordsProcessed": 1500
}
```

---

### Complete Reports

#### `report(report, options)`

Format complete report with multiple sections.

**Parameters:**
- `report` (Object): Report data with title, summary, sections, footer
- `options` (Object): Report options

**Structure:**
```javascript
{
  title: 'Report Title',
  emoji: '📊',
  summary: { key: 'value', ... },
  sections: [
    { title: 'Section 1', content: '...', type: 'analysis' },
    { title: 'Section 2', content: '...' }
  ],
  footer: 'Footer text'
}
```

**Example:**

```javascript
formatter.report({
  title: 'Automation Audit Report',
  emoji: '🔍',
  summary: {
    'Total Automations': 187,
    'Conflicts Detected': 23
  },
  sections: [
    { title: 'Overview', content: '...', type: 'summary' },
    { title: 'Findings', content: '...', type: 'analysis' }
  ],
  footer: 'Generated by Auditor v1.0'
});
```

---

## Common Patterns

### Pattern 1: Simple Data Display

**Use Case**: Display query results or inventory lists.

**Code:**
```javascript
const { StructuredFormatter } = require('./lib/structured-content-formatter');
const formatter = new StructuredFormatter();

console.log(formatter.section('Object Inventory', { type: 'metrics' }));
console.log(formatter.table(
  [
    { object: 'Account', records: 1500, size: '2.5 MB' },
    { object: 'Contact', records: 3200, size: '5.1 MB' },
    { object: 'Opportunity', records: 850, size: '1.8 MB' }
  ],
  { object: 'Object Name', records: 'Records', size: 'Size' }
));
```

**Output:**
```
## 📈 Object Inventory
| Object Name | Records | Size   |
|-------------|---------|--------|
| Account     | 1500    | 2.5 MB |
| Contact     | 3200    | 5.1 MB |
| Opportunity | 850     | 1.8 MB |
```

---

### Pattern 2: Deployment Summary

**Use Case**: Summarize deployment results with status and metrics.

**Code:**
```javascript
console.log(formatter.section('Deployment Results', { type: 'deployment' }));

console.log(formatter.summaryBox('Deployment Complete', [
  'Status: ' + formatter.statusBadge('success', 'Successful'),
  'Duration: 3m 45s',
  'Components: 45 deployed, 0 failed',
  'Tests: 142/145 passed'
]));

console.log('\n' + formatter.metricsSummary({
  'API Calls': 1250,
  'Code Coverage': '87.5%',
  'Warnings': 3
}));
```

---

### Pattern 3: Error Reporting

**Use Case**: Report validation errors with details.

**Code:**
```javascript
console.log(formatter.section('Validation Results', { type: 'errors' }));

console.log(formatter.errorBox(
  'Found 3 critical errors',
  [
    'Missing required field: Account.Industry',
    'Invalid formula on Opportunity.Amount',
    'Duplicate API name: Custom_Field__c'
  ]
));

console.log('\n' + formatter.section('Next Steps', { type: 'info', level: 3 }));
console.log(formatter.numberedList([
  'Fix missing required field',
  'Update formula syntax',
  'Rename duplicate field',
  'Re-run validation'
]));
```

---

### Pattern 4: Audit Report

**Use Case**: Generate comprehensive audit with findings and recommendations.

**Code:**
```javascript
console.log(formatter.section('Automation Audit', { level: 1, emoji: '🔍' }));

// Executive summary
console.log(formatter.section('Executive Summary', { type: 'summary' }));
console.log(formatter.keyValuePairs({
  'Total Automations': 187,
  'Conflicts': 23,
  'Risk Level': '🟠 HIGH'
}));

// Findings table
console.log('\n' + formatter.section('Critical Issues', { type: 'errors' }));
console.log(formatter.table(
  [
    { object: 'Account', conflicts: 6, risk: '🔴 HIGH' },
    { object: 'Opportunity', conflicts: 5, risk: '🔴 HIGH' }
  ],
  ['object', 'conflicts', 'risk']
));

// Recommendations
console.log('\n' + formatter.section('Recommendations', { type: 'info' }));
console.log(formatter.numberedList([
  'Consolidate Account triggers',
  'Migrate Process Builders to Flows',
  'Implement trigger handler framework'
]));
```

---

### Pattern 5: Comparison Report

**Use Case**: Show before/after metrics or performance improvements.

**Code:**
```javascript
console.log(formatter.section('Performance Improvements', { type: 'metrics' }));

console.log(formatter.comparisonTable([
  { item: 'API Calls', before: 1000, after: 750, change: '-25%' },
  { item: 'Response Time', before: '2.5s', after: '1.8s', change: '-28%' },
  { item: 'Code Coverage', before: '75%', after: '87%', change: '+16%' }
], { beforeLabel: 'Before', afterLabel: 'After' }));

console.log('\n' + formatter.successBox(
  'Performance optimization successful',
  {
    'Total Improvement': '25% faster',
    'Cost Savings': '$4,800/year'
  }
));
```

---

## Best Practices

### 1. Use Appropriate Emojis

**✅ Good** (relevant emojis):
```javascript
formatter.section('Security Issues', { type: 'security' });  // 🔐
formatter.section('Performance Metrics', { type: 'performance' });  // ⚡
formatter.section('Test Results', { type: 'testing' });  // 🧪
```

**❌ Bad** (random emojis):
```javascript
formatter.section('Security Issues', { emoji: '🎉' });  // Confusing
```

**Why**: Emojis provide visual context; use them consistently.

---

### 2. Structure Reports with Hierarchy

**✅ Good** (clear hierarchy):
```javascript
// Level 1: Report title
formatter.section('Audit Report', { level: 1 });

// Level 2: Major sections
formatter.section('Executive Summary', { level: 2 });
formatter.section('Findings', { level: 2 });

// Level 3: Subsections
formatter.section('Critical Issues', { level: 3 });
```

**❌ Bad** (flat hierarchy):
```javascript
// Everything at level 2
formatter.section('Audit Report', { level: 2 });
formatter.section('Summary', { level: 2 });
formatter.section('Details', { level: 2 });
```

**Why**: Hierarchy aids scanning and comprehension.

---

### 3. Use Tables for Tabular Data

**✅ Good** (table):
```javascript
formatter.table(
  [{ object: 'Account', records: 1500 }],
  ['object', 'records']
);
```

**❌ Bad** (plain text):
```javascript
console.log('Object: Account, Records: 1500');
```

**Why**: Tables are easier to scan and compare.

---

### 4. Provide Context with Message Boxes

**✅ Good** (context provided):
```javascript
formatter.warningBox(
  'Potential issues detected',
  [
    'Field mismatch on 3 objects',
    'Missing record types on 2 layouts'
  ]
);
```

**❌ Bad** (no context):
```javascript
console.log('Warning: Issues detected');
```

**Why**: Users need details to understand issues.

---

### 5. Include Actionable Next Steps

**✅ Good** (actionable):
```javascript
formatter.numberedList([
  'Fix field dependencies on Account',
  'Update picklist values on Opportunity',
  'Re-run validation after fixes'
]);
```

**❌ Bad** (vague):
```javascript
formatter.bulletList([
  'Fix errors',
  'Try again'
]);
```

**Why**: Specific steps reduce confusion.

---

### 6. Use Status Badges for Quick Visibility

**✅ Good** (clear status):
```javascript
console.log(formatter.statusBadge('success', 'Deployment completed'));
console.log(formatter.statusBadge('warning', 'Minor issues'));
console.log(formatter.statusBadge('failed', 'Validation failed'));
```

**❌ Bad** (no visual indicator):
```javascript
console.log('Status: Deployment completed');
```

**Why**: Symbols catch attention faster than text.

---

### 7. Format Code with Syntax Highlighting

**✅ Good** (syntax highlighted):
```javascript
formatter.codeBlock(
  'SELECT Id FROM Account WHERE Industry = \'Tech\'',
  'sql'
);
```

**❌ Bad** (no formatting):
```javascript
console.log('SELECT Id FROM Account WHERE Industry = \'Tech\'');
```

**Why**: Syntax highlighting improves readability.

---

## Migration Guide

### Converting Existing Scripts

**Step 1**: Import formatter
```javascript
const { StructuredFormatter } = require('./lib/structured-content-formatter');
const formatter = new StructuredFormatter();
```

**Step 2**: Identify output patterns

| Current Pattern | Convert To | Formatter Method |
|----------------|------------|------------------|
| console.log with object lists | Table | `formatter.table()` |
| console.log with key-value | Metrics | `formatter.metricsSummary()` |
| console.error | Error box | `formatter.errorBox()` |
| Status messages | Status badge | `formatter.statusBadge()` |
| JSON.stringify | Code block | `formatter.codeBlock(..., 'json')` |

**Step 3**: Replace console.log statements

**Before:**
```javascript
console.log('=== Deployment Summary ===');
console.log('Status: Success');
console.log('Duration: 3m 45s');
console.log('Components: 45 deployed');
```

**After:**
```javascript
console.log(formatter.section('Deployment Summary', { type: 'deployment' }));
console.log(formatter.metricsSummary({
  'Status': 'Success',
  'Duration': '3m 45s',
  'Components': '45 deployed'
}));
```

**Step 4**: Test output

```bash
node your-script.js
```

---

### Example Migration

**Before (Plain Text):**
```javascript
function displayResults(results) {
  console.log('=== Results ===');
  results.forEach(r => {
    console.log(`${r.name}: ${r.count}`);
  });
  console.log('Total:', results.reduce((sum, r) => sum + r.count, 0));
}
```

**After (Structured):**
```javascript
const { StructuredFormatter } = require('./lib/structured-content-formatter');
const formatter = new StructuredFormatter();

function displayResults(results) {
  console.log(formatter.section('Results', { type: 'results' }));

  console.log(formatter.table(
    results,
    { name: 'Item', count: 'Count' }
  ));

  const total = results.reduce((sum, r) => sum + r.count, 0);
  console.log('\n' + formatter.metricsSummary({
    'Total': total
  }));
}
```

---

## Examples

### Example 1: Deployment Reporter

See `scripts/examples/structured-report-example.js` for a complete deployment report with:
- Summary box with status
- Component statistics table
- Test results with metrics
- Timeline of events
- Warnings and next steps
- Command reference

**Run**: `node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/examples/structured-report-example.js`

---

### Example 2: Audit Reporter

See `scripts/examples/structured-audit-example.js` for a complete audit report with:
- Executive summary
- Inventory breakdown table
- Conflict analysis
- Object hotspots table
- Critical issues list
- Recommendations by priority
- Risk assessment boxes
- Before/after comparison

**Run**: `node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/examples/structured-audit-example.js`

---

## Testing Structured Output

### Manual Testing

```bash
# Test formatter demo
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/structured-content-formatter.js

# Test deployment example
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/examples/structured-report-example.js

# Test audit example
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/examples/structured-audit-example.js
```

### Validation Checklist

- [ ] Tables align correctly
- [ ] Emojis display properly
- [ ] Code blocks have syntax highlighting
- [ ] Headers have correct hierarchy (# vs ##)
- [ ] Status badges use correct symbols
- [ ] Metrics align properly
- [ ] Message boxes have borders
- [ ] Lists are properly formatted
- [ ] Timelines show events chronologically

---

## Troubleshooting

### Issue: Table Columns Misaligned

**Symptom**: Table columns don't line up

**Cause**: Column widths not calculated correctly

**Solution**: Ensure data doesn't contain newlines or tabs
```javascript
// Clean data before formatting
const cleanData = data.map(row => ({
  ...row,
  description: row.description.replace(/\n/g, ' ')
}));
```

---

### Issue: Emojis Not Showing

**Symptom**: Shows boxes instead of emojis

**Cause**: Terminal doesn't support Unicode

**Solution**: Disable emojis
```javascript
const formatter = new StructuredFormatter({ emojiEnabled: false });
```

---

### Issue: Code Block Not Highlighted

**Symptom**: Code shows without syntax highlighting

**Cause**: Language not specified or unsupported

**Solution**: Specify supported language
```javascript
// ❌ No language
formatter.codeBlock(code);

// ✅ With language
formatter.codeBlock(code, 'javascript');
```

---

## Performance Considerations

### Large Datasets

For very large datasets (>1000 rows), consider:
- Paginating output
- Using summary statistics instead of full tables
- Streaming output instead of building full string

**Example:**
```javascript
// Instead of
console.log(formatter.table(allRecords, columns));

// Use
console.log(formatter.table(allRecords.slice(0, 100), columns));
console.log(`\n(Showing 100 of ${allRecords.length} records)`);
```

---

### Memory Usage

Formatter builds strings in memory. For very large reports:
- Generate sections incrementally
- Write to file instead of console
- Use streaming if needed

---

## See Also

- **Formatter Library**: `scripts/lib/structured-content-formatter.js`
- **Deployment Example**: `scripts/examples/structured-report-example.js`
- **Audit Example**: `scripts/examples/structured-audit-example.js`
- **Phase 2 Completion**: `PHASE_2_PART_4_STRUCTURED_CONTENT_COMPLETE.md`

---

**Last Updated**: 2025-11-04
**Version**: 1.0.0
**Feature**: Claude Code v2.0.32 Integration
