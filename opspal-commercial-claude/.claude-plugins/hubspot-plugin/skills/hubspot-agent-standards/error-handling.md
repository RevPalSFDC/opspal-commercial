# HubSpot Error Handling Patterns

## Required Error Handling Pattern

```javascript
try {
  const result = await hubspotOperation();

  // Validate result
  if (!result.success) {
    throw new Error(`Operation failed: ${result.error}`);
  }

  return result;

} catch (error) {
  // 1. Log error with context
  console.error(`HubSpot operation failed:`, {
    operation: 'updateContacts',
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });

  // 2. Handle specific error types
  if (error.statusCode === 429) {
    console.warn('Rate limit hit - operation will auto-retry');
    // HubSpotClientV3 handles this automatically
  }

  if (error.statusCode === 400) {
    console.error('Validation error - check payload:', error.body);
  }

  // 3. NEVER swallow errors - re-throw or return error object
  throw error; // OR return { success: false, error: error.message }
}
```

## Error Types Reference

| Status Code | Error Type | Action |
|-------------|-----------|--------|
| 400 | Validation Error | Log payload, throw error |
| 401 | Authentication Error | Refresh token, retry once |
| 403 | Forbidden | Check scopes, escalate |
| 404 | Not Found | Validate record exists |
| 429 | Rate Limit | Exponential backoff (automatic) |
| 500-599 | Server Error | Retry with backoff |
| Network Error | Timeout/DNS | Retry with backoff |

## API Safeguard Pre-Flight Validation

**ALWAYS validate payloads BEFORE API calls** to prevent HubSpot API errors.

```javascript
const validator = require('..claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/hubspot-api-validator');
const safeDelete = require('..claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/safe-delete-wrapper');

// 1. Validate bulk operations before execution
const bulkOp = {
  action: 'DELETE',
  count: recordIds.length,
  backup: './.hubspot-backups/records.json',
  validated: true
};
const bulkResult = validator.validateBulkOperation(bulkOp);
if (!bulkResult.valid) {
  throw new Error(`Bulk operation validation failed: ${bulkResult.errors.join(', ')}`);
}

// 2. Use safe-delete-wrapper for ALL delete operations
const deleteResult = await safeDelete.deleteWithSafety(
  objectType,
  recordIds,
  {
    backupDir: './.hubspot-backups',
    reason: 'data-cleanup',
    confirmed: false,  // Requires user confirmation
    deletedBy: userEmail
  }
);

// 3. Log validation results
validator.logValidation('Data Operation', result);
```

## Critical Rules

1. **NEVER use raw `.archive()` or `.delete()`** - Always use safe-delete-wrapper
2. **ALWAYS validate before API calls** - Pre-flight validation is mandatory
3. **ALWAYS create backups** - Delete operations require backups
4. **ALWAYS log validation results** - Use validator.logValidation()
