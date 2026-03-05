# Bulk Task Creator - Instance-Agnostic Solution

## Problem Solved
The Salesforce CLI bulk API has persistent issues with line ending formats (LF vs CRLF), causing bulk import failures. This tool provides a robust, instance-agnostic solution with automatic fallback mechanisms.

## Root Causes Addressed

### 1. **Line Ending Issues**
- Salesforce Bulk API 2.0 expects CRLF line endings
- Linux/Mac systems use LF by default
- The API doesn't auto-convert, causing `LineEnding is invalid` errors

### 2. **CLI Syntax Changes**
- Different SF CLI versions have varying syntax requirements
- Quotes and escaping rules differ between commands

### 3. **Invalid References**
- User IDs must exist and be active
- Cross-reference validation happens at runtime

## Solution Architecture

### Three-Tier Approach
1. **Bulk Method** (Best for >200 records)
   - Uses Bulk API 2.0 with CRLF line endings
   - Most efficient for large volumes
   - May fail due to line ending issues

2. **Batch Method** (Best for 50-200 records)
   - Uses JSON tree format
   - Avoids line ending issues
   - Good balance of speed and reliability

3. **Individual Method** (Best for <50 records)
   - Creates records one by one
   - Most reliable but slowest
   - Good for testing and small batches

### Automatic Fallback Chain
```
Bulk → (on failure) → Batch → (on failure) → Individual
```

## Usage

### Command Line
```bash
# Auto-select best method based on volume
node bulk-task-creator.js tasks.csv myorg

# Force specific method
node bulk-task-creator.js tasks.csv myorg --method bulk
node bulk-task-creator.js tasks.csv myorg --method batch --batch-size 100
node bulk-task-creator.js tasks.csv myorg --method individual

# With verification
node bulk-task-creator.js tasks.csv myorg --verify
```

### Programmatic Usage
```javascript
const BulkTaskCreator = require('./bulk-task-creator');

const creator = new BulkTaskCreator('myorg');
const result = await creator.createTasks('tasks.csv', {
    method: 'auto',     // auto, bulk, batch, individual
    batchSize: 200,     // for batch method
    verify: true        // verify after creation
});
```

## CSV Format
```csv
Subject,OwnerId,Status,Priority,ActivityDate,Description
"Task Subject","005xxx","Not Started","Normal","2025-01-15","Description here"
```

### Required Fields
- `Subject` - Task subject/title
- `OwnerId` - Valid User or Queue ID

### Optional Fields
- `Status` - Task status (default: "Not Started")
- `Priority` - Task priority (default: "Normal")
- `ActivityDate` - Due date (YYYY-MM-DD format)
- `Description` - Task description
- `Type` - Task type (e.g., "Call", "Email", "Task")
- `WhatId` - Related record (Account, Opportunity, etc.)
- `WhoId` - Related Contact or Lead

## Error Handling

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `LineEnding is invalid` | Bulk API line ending issue | Tool auto-falls back to batch method |
| `invalid cross reference id` | Invalid User/Record ID | Verify IDs exist and are active |
| `Data Import failed` | Various JSON format issues | Tool auto-falls back to individual method |
| `Unexpected arguments` | CLI syntax issue | Tool uses proper escaping automatically |

## Instance-Agnostic Features

1. **No hardcoded values** - All IDs and references are parameterized
2. **Dynamic user lookup** - Can validate users before creation
3. **Flexible field mapping** - Adapts to any Task field configuration
4. **Multi-org support** - Works with any authenticated org

## Performance Characteristics

| Volume | Recommended Method | Expected Time |
|--------|-------------------|---------------|
| 1-50 records | Individual | 1-2 seconds per record |
| 50-200 records | Batch | 5-10 seconds per batch |
| 200+ records | Bulk (with fallback) | 10-30 seconds total |

## Best Practices

1. **Always verify User IDs** before bulk creation
2. **Use auto method** for optimal performance with fallback safety
3. **Test with small batches** before large imports
4. **Include all required fields** in CSV to avoid validation errors
5. **Use ISO date format** (YYYY-MM-DD) for date fields

## Integration with Existing Scripts

This tool can replace direct CLI calls in existing scripts:

```bash
# Old approach (fails with line ending issues)
sf data import bulk --sobject Task --file tasks.csv --wait 30 --target-org myorg

# New approach (handles all issues)
node /path/to/bulk-task-creator.js tasks.csv myorg
```

## Monitoring and Verification

The tool provides detailed progress output:
- ✅ Success indicators
- ❌ Error details with fallback notifications
- 📊 Summary statistics
- 🔍 Optional verification queries

## Future Enhancements

- [ ] Support for other Salesforce objects
- [ ] Parallel processing for large volumes
- [ ] Progress bar for long-running operations
- [ ] CSV validation before processing
- [ ] Automatic retry with exponential backoff