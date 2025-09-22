# Instance-Agnostic SOQL Query Error Solution

## Root Cause Analysis

### 1. Primary Issues Identified

1. **Field Name Variations**: Different Salesforce instances use different field names for the same concept (e.g., `HubSpot_Contact_ID__c` vs `Hubspot_ID__c`)

2. **Shell Escaping Issues**: The `sf data query` command has problems with:
   - Special characters in queries (parentheses, quotes)
   - Pipe operators (`|`) and stdin redirection
   - Escaped characters (`\!`, `\=`)

3. **Syntax Variations**: Different SOQL syntax patterns fail:
   - `IS NOT NULL` vs `!= null`
   - `COUNT()` with spaces
   - Field name quoting

4. **Error Message Parsing**: SF CLI returns errors in different formats:
   - JSON responses with nested error objects
   - Plain text error messages
   - Mixed format outputs

## Solution Architecture

### Two-Layer Approach

#### Layer 1: `soql-query-handler.js`
- **Purpose**: Low-level SOQL execution with proper error handling
- **Key Features**:
  - Uses temporary files to avoid shell escaping issues
  - Robust error parsing for both JSON and text responses
  - Field discovery via `FIELDS(ALL)` queries
  - Intelligent field suggestion using Levenshtein distance

#### Layer 2: `safe-soql-executor.js`
- **Purpose**: High-level abstraction with auto-correction
- **Key Features**:
  - Automatic field name correction
  - Field mapping database for common variations
  - Syntax auto-correction
  - Fuzzy matching for field names

## Usage Examples

### Basic Query Execution
```bash
# Direct execution (will auto-correct field names)
node scripts/lib/safe-soql-executor.js rentable-production \
  "SELECT Id FROM Contact WHERE HubSpot_Contact_ID__c != null"

# Count operation
node scripts/lib/safe-soql-executor.js rentable-production \
  --count Contact "HubSpot_Contact_ID__c != null"
```

### Field Discovery
```bash
# List all fields for an object
node scripts/lib/soql-query-handler.js rentable-production --fields Contact

# Find HubSpot-related fields
node scripts/lib/soql-query-handler.js rentable-production --fields Contact | grep -i hub
```

### Integration in Scripts
```javascript
const { SafeSOQLExecutor } = require('./scripts/lib/safe-soql-executor');

const executor = new SafeSOQLExecutor({
    targetOrg: 'rentable-production',
    debug: true
});

// Auto-corrects field names and syntax
const count = await executor.getCount('Contact', 'HubSpot_Contact_ID__c != null');

// Executes with fallback handling
const result = await executor.executeWithFallback(
    'SELECT Id FROM Contact WHERE HS_Object_ID__c != null',
    'rentable-production'
);
```

## Key Benefits

1. **Instance Agnostic**: Works across different Salesforce instances without hardcoding field names
2. **Error Recovery**: Automatically attempts to fix common query issues
3. **Field Discovery**: Can discover and suggest correct field names
4. **Shell Safe**: Avoids shell escaping issues by using temp files
5. **Extensible**: Easy to add new field mappings and syntax corrections

## Field Mapping Configuration

The solution includes pre-configured mappings for common variations:

```javascript
// HubSpot field variations
'hubspot_contact_id__c' → [
    'HubSpot_Contact_ID__c',
    'Hubspot_ID__c',
    'HubSpot_ID__c',
    'HS_Contact_ID__c',
    'HS_Object_ID__c'
]
```

## Error Handling Flow

1. **Initial Execution**: Try query as-is
2. **Field Error Detection**: Parse error message for missing fields
3. **Field Discovery**: Query object schema for available fields
4. **Auto-Correction**: Apply field mappings or fuzzy matching
5. **Retry**: Execute corrected query
6. **Fallback**: Provide helpful error message with suggestions

## Testing Results

- ✅ Successfully handles `HubSpot_Contact_ID__c` → `Hubspot_ID__c` conversion
- ✅ Fixes syntax issues (`IS NOT NULL` → `!= null`)
- ✅ Handles COUNT() queries with proper formatting
- ✅ Provides field suggestions when fields don't exist
- ✅ Works across different Salesforce instances

## Maintenance

To add support for new field variations:

1. Edit `scripts/lib/safe-soql-executor.js`
2. Add mappings to `setupFieldMappings()` method
3. Test with actual queries

## Performance Considerations

- Field discovery results are cached per session
- Temp files are cleaned up automatically
- Supports large result sets (10MB buffer)
- Minimal overhead for successful queries (no correction needed)