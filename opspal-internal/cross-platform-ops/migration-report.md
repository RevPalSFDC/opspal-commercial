# HubSpot Bulk Toolkit Migration Report

Generated: 2025-09-21T19:44:39.034Z

## Summary

- **Total Files to Update**: 18
- **Critical Issues**: 13
- **High Priority Issues**: 12
- **Estimated Effort**: 4-8 hours

## Critical Issues (Must Fix)


### scripts/analyze-sync-overlap.js

**Issue**: HubSpot API call in for loop
**Lines**: 

**Suggested Fix**:
```javascript
Review and update to use bulk toolkit
```


### scripts/connect-rentable-production.js

**Issue**: HubSpot API call in for loop
**Lines**: 

**Suggested Fix**:
```javascript
Review and update to use bulk toolkit
```


### scripts/connect-rentable.js

**Issue**: HubSpot API call in for loop
**Lines**: 

**Suggested Fix**:
```javascript
Review and update to use bulk toolkit
```


### scripts/migrate-to-bulk-toolkit.js

**Issue**: Uses batch API instead of bulk
**Lines**: 173

**Suggested Fix**:
```javascript

1. Replace batch operations with bulk imports:
   // Old
   await hubspot.makeRequest('/batch/create', { inputs: records });

   // New
   await hubspot.importContacts('data.csv', { wait: true });
```


### scripts/migrate-to-bulk-toolkit.js

**Issue**: HubSpot API call in forEach loop
**Lines**: 37

**Suggested Fix**:
```javascript

1. Collect all records first:
   const records = [];
   data.forEach(item => records.push(transform(item)));

2. Use bulk operation:
   await hubspot.importContacts(records);
```


### scripts/migrate-to-bulk-toolkit.js

**Issue**: HubSpot API call in for loop
**Lines**: 

**Suggested Fix**:
```javascript
Review and update to use bulk toolkit
```


### scripts/process-contact-classification.js

**Issue**: HubSpot API call in for loop
**Lines**: 

**Suggested Fix**:
```javascript
Review and update to use bulk toolkit
```


### scripts/process-contacts-batch.js

**Issue**: HubSpot API call in for loop
**Lines**: 

**Suggested Fix**:
```javascript
Review and update to use bulk toolkit
```


### scripts/sync-hubspot-status.js

**Issue**: HubSpot API call in for loop
**Lines**: 

**Suggested Fix**:
```javascript
Review and update to use bulk toolkit
```


### lib/instance-context-manager.js

**Issue**: HubSpot API call in for loop
**Lines**: 

**Suggested Fix**:
```javascript
Review and update to use bulk toolkit
```


### core/connectors/hubspot-connector.js

**Issue**: Uses batch API instead of bulk
**Lines**: 199, 244, 284

**Suggested Fix**:
```javascript

1. Replace batch operations with bulk imports:
   // Old
   await hubspot.makeRequest('/batch/create', { inputs: records });

   // New
   await hubspot.importContacts('data.csv', { wait: true });
```


### core/data-models/field-mapping.js

**Issue**: HubSpot API call in for loop
**Lines**: 

**Suggested Fix**:
```javascript
Review and update to use bulk toolkit
```


### core/data-models/unified-record.js

**Issue**: HubSpot API call in for loop
**Lines**: 

**Suggested Fix**:
```javascript
Review and update to use bulk toolkit
```


## High Priority Issues


- **scripts/connect-rentable-existing-auth.js**: Uses old hubspot-connector (lines: 127)


- **scripts/connect-rentable-production.js**: Uses old hubspot-connector (lines: 201)


- **scripts/connect-rentable.js**: Uses old hubspot-connector (lines: 104)


- **scripts/dedupe-all-contacts.js**: Uses batch methods (100 record limit) (lines: 106, 149, 162, 165, 198, 206, 209, 243, 251, 257, 263, 268, 294)


- **scripts/dedupe-contacts.js**: Uses batch methods (100 record limit) (lines: 102, 134, 143, 183, 191, 230, 238, 259, 272, 278, 290)


- **scripts/dedupe-with-existing-fields.js**: Uses batch methods (100 record limit) (lines: 104, 147, 160, 163, 194, 206, 209, 241, 252, 259, 265, 270)


- **scripts/local-process-bulk.js**: Uses batch methods (100 record limit) (lines: 51, 77, 84, 92, 97, 123)


- **scripts/migrate-to-bulk-toolkit.js**: Uses old hubspot-connector (lines: 27, 162, 163, 213, 302)


- **scripts/migrate-to-bulk-toolkit.js**: Uses batch methods (100 record limit) (lines: 47, 189)


- **scripts/populate-merge-candidates.js**: Uses batch methods (100 record limit) (lines: 41, 50, 63, 69, 75, 82)


- **core/connectors/hubspot-connector.js**: Uses batch methods (100 record limit) (lines: 183, 227, 272)


- **core/connectors/salesforce-connector.js**: Uses batch methods (100 record limit) (lines: 142, 184, 226)


## Automated Fixes

- **Files Automatically Updated**: 5
- **Files Requiring Manual Review**: 8

## Next Steps

1. Review and test automatically updated files
2. Manually update critical issues that couldn't be automated
3. Run tests: `npm test`
4. Verify with ESLint: `npm run lint:bulk`
5. Test bulk operations: `import-contacts --dry-run test-data.csv`

## Migration Checklist

- [ ] All forEach loops with HubSpot calls removed
- [ ] All batch endpoints replaced with bulk imports/exports
- [ ] hubspot-connector replaced with hubspot-bulk toolkit
- [ ] Rate limiting properly configured
- [ ] Error handling updated for async operations
- [ ] Tests updated and passing
- [ ] Documentation updated

## Resources

- [Bulk Toolkit Documentation](./README_bulk.md)
- [PR Checklist](.github/PULL_REQUEST_TEMPLATE.md)
- [API Migration Guide](https://developers.hubspot.com/docs/api/crm/imports)
