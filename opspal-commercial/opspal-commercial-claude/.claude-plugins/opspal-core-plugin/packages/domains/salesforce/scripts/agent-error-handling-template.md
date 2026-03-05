# Agent Error Handling Template

This template provides standardized error handling patterns that should be incorporated into all Salesforce agents to prevent false positive success messages and ensure reliable operations.

## Required Error Handling Sections

Add these sections to every Salesforce agent:

### 1. Validation Requirements Section

```markdown
## CRITICAL VALIDATION REQUIREMENTS

**BEFORE claiming any operation as successful, you MUST:**

1. **Validate MCP Tool Response**
   - Check that response is not null/undefined
   - Verify response.success is explicitly true
   - Confirm response.id exists and is a valid Salesforce ID format
   - Validate error responses contain meaningful error messages

2. **Verify Actual Creation/Update in Salesforce**
   - After any create/update operation, query Salesforce to confirm changes
   - Use the returned ID to query for the created/updated object
   - Only claim success if the verification query returns the expected result

3. **Handle Errors Properly**
   - Never claim success if any step fails
   - Provide specific error messages with actionable guidance
   - Log all errors for debugging
   - Offer recovery suggestions when possible
```

### 2. Error Handling Protocol Section

```markdown
## Error Handling Protocol

### Pre-Operation Validation
```
BEFORE executing any MCP operation:
1. Verify Salesforce connectivity
2. Check user permissions for the operation
3. Validate required objects/fields exist and are accessible
4. Confirm operation parameters are valid
5. Check API limits and org constraints
```

### Response Validation
```
AFTER receiving MCP tool response:
1. Validate response structure (not null/undefined)
2. Check response.success === true
3. Verify response.id exists and matches Salesforce ID format
4. For errors, extract and format meaningful error messages
```

### Salesforce Verification
```
AFTER successful MCP response:
1. Execute verification query to confirm operation succeeded
2. Validate returned object matches expected properties
3. Confirm object is accessible to current user
4. Only then claim success to user
```

### Error Recovery
```
WHEN operations fail:
1. Identify specific failure point
2. Provide clear, actionable error message
3. Suggest specific remediation steps
4. Offer alternative approaches if possible
5. Clean up any partial operations if needed
```
```

### 3. Standard Error Messages Section

```markdown
## Standard Error Messages

### Authentication/Connection Errors
```
❌ Salesforce Connection Failed
- Issue: Unable to connect to Salesforce
- Check: Verify SF CLI authentication with 'sf org list'
- Fix: Re-authenticate with 'sf org login web'
- Help: Contact system administrator if issues persist
```

### Permission Errors
```
❌ Insufficient Permissions
- Issue: [Specific permission missing]
- Object: [Object name]
- Required: [Specific permission needed]
- Fix: Contact system administrator to update your profile/permission sets
- Alternative: [Alternative approach if available]
```

### Object Access Errors
```
❌ Object Access Denied
- Issue: Cannot access [Object] - [Specific field/operation]
- Cause: Field-level security or sharing rules restriction
- Fix: Check field-level security settings and sharing rules
- Help: System administrator can review access permissions
```

### Validation Errors
```
❌ Operation Validation Failed
- Issue: [Specific validation failure]
- Expected: [What was expected]
- Actual: [What was found]
- Fix: [Specific steps to resolve]
```
```

### 4. Success Confirmation Template Section

```markdown
## Success Confirmation Template

### Verified Success Message
```
✅ [OPERATION] SUCCESSFUL
- Object Type: [Report/Dashboard/Field/etc.]
- Name: [Actual object name]
- Salesforce ID: [Verified Salesforce ID]
- Location: [Folder/Object/Location]
- Verification: Confirmed via Salesforce query at [timestamp]
- Access: Validated for current user
- Next Steps: [If applicable]
```

### Failed Operation Message
```
❌ [OPERATION] FAILED
- Operation: [What was attempted]
- Failure Point: [Specific step that failed]
- Error: [Detailed error message]
- Cause: [Root cause if known]
- Resolution: [Specific steps to fix]
- Prevention: [How to avoid in future]
- Support: [How to get additional help]
```
```

### 5. Validation Functions Section

```markdown
## Validation Functions

Add these validation patterns to each agent:

### MCP Response Validation
```
For every MCP tool call, validate the response:

1. Check response exists: if (!response) throw error
2. Check success flag: if (response.success !== true) handle error
3. Check ID format: if (!response.id || !isValidSalesforceId(response.id)) throw error
4. For errors: extract and format error message appropriately
```

### Salesforce Verification
```
After successful MCP response, verify in Salesforce:

1. Build appropriate verification query for object type
2. Execute query with error handling
3. Confirm object exists: if (result.totalSize === 0) throw error
4. Verify properties match expectations
5. Confirm user access to created/updated object
```

### Error Categorization
```
Categorize errors for appropriate handling:

1. Connection Errors: Salesforce unreachable
2. Authentication Errors: Invalid/expired credentials  
3. Permission Errors: Insufficient access rights
4. Validation Errors: Invalid input or constraints
5. System Errors: API limits, org constraints
6. Data Errors: Invalid data or relationships
```
```

## Implementation Checklist

For each agent update:

- [ ] Add CRITICAL VALIDATION REQUIREMENTS section
- [ ] Add Error Handling Protocol section  
- [ ] Add Standard Error Messages section
- [ ] Add Success Confirmation Template section
- [ ] Add Validation Functions section
- [ ] Update existing operation descriptions with validation steps
- [ ] Test error handling with invalid inputs
- [ ] Verify success only claimed after Salesforce confirmation
- [ ] Document all changes in agent changelog

## Agent-Specific Customizations

### For Data Operations Agents
- Add data validation patterns
- Include bulk operation error handling
- Add data quality check procedures

### For Metadata Agents
- Add dependency validation
- Include deployment verification
- Add rollback procedures

### For Security Agents
- Add permission validation
- Include access verification
- Add compliance check procedures

### For Integration Agents
- Add endpoint validation
- Include authentication verification
- Add connection health checks

## Testing Requirements

After implementing error handling:

1. **Positive Test Cases**
   - Verify successful operations work correctly
   - Confirm success messages include verification

2. **Negative Test Cases**
   - Test with invalid inputs
   - Test with insufficient permissions
   - Test with disconnected Salesforce
   - Test with API limit scenarios

3. **Edge Case Testing**
   - Test with malformed responses
   - Test with partial failures
   - Test with timeout scenarios

4. **Recovery Testing**
   - Test error recovery procedures
   - Test cleanup after failures
   - Test retry mechanisms

## Quality Gates

Before considering error handling implementation complete:

- [ ] All operations have pre-validation
- [ ] All operations have post-verification
- [ ] All errors provide actionable guidance
- [ ] All success claims are verified
- [ ] No false positive success messages possible
- [ ] Error messages are user-friendly and specific
- [ ] Recovery procedures are documented
- [ ] Testing covers all error scenarios

## Maintenance

- Review error handling quarterly
- Update error messages based on user feedback
- Add new validation patterns as needed
- Monitor error rates and success verification
- Update documentation with new patterns
