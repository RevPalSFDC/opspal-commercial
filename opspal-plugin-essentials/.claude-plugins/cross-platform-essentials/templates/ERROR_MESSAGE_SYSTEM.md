# Error Message System

## Overview

The Error Message System provides consistent, helpful error messages across all RevOps Essentials plugins. Each error includes:
- Clear error code for easy reference
- User-friendly title and message
- List of possible causes
- Step-by-step next actions
- Links to related agents and commands
- Severity level

## Error Code Structure

### Salesforce Essentials (ERR-XXX)
- **ERR-100-199**: Connection & Authentication
- **ERR-200-299**: Query Errors
- **ERR-300-399**: Metadata Errors
- **ERR-400-499**: Data Operation Errors
- **ERR-500-599**: Report & Dashboard Errors
- **ERR-600-699**: Flow & Automation Errors
- **ERR-700-799**: Agent Usage Errors
- **ERR-900-999**: General Errors

### HubSpot Essentials (ERR-HUB-XXX)
- **ERR-HUB-100-199**: Connection & Authentication
- **ERR-HUB-200-299**: Property & Schema Errors
- **ERR-HUB-300-399**: Data Operation Errors
- **ERR-HUB-400-499**: Workflow Errors
- **ERR-HUB-500-599**: List Errors
- **ERR-HUB-600-699**: Pipeline & Deal Errors
- **ERR-HUB-700-799**: Integration & Webhook Errors
- **ERR-HUB-800-899**: Report & Analytics Errors
- **ERR-HUB-900-999**: Agent Usage Errors

### Cross-Platform Essentials (ERR-CP-XXX)
- **ERR-CP-100-199**: Diagram Generation
- **ERR-CP-200-299**: PDF Generation
- **ERR-CP-300-399**: Implementation Planning
- **ERR-CP-400-499**: Instance Management
- **ERR-CP-500-599**: File & Data
- **ERR-CP-600-699**: Integration & Orchestration
- **ERR-CP-700-799**: Configuration & Setup
- **ERR-CP-900-999**: General Cross-Platform

## Usage for Agents

### Basic Error Display

When an agent encounters an error, display it using this format:

```markdown
❌ {title} (ERR-{code})

{message}

**Possible Causes:**
• {cause 1}
• {cause 2}
• {cause 3}

**Next Steps:**
1. {step 1}
2. {step 2}
3. {step 3}

**Related Agents:**
• {agent 1} - {description}
• {agent 2} - {description}

**Related Commands:**
• {command 1} - {description}

**Severity:** HIGH/MEDIUM/LOW
```

### Example Error Display

```markdown
❌ Salesforce Connection Failed (ERR-101)

Unable to connect to Salesforce org 'production'

**Possible Causes:**
• Org alias doesn't exist
• OAuth token expired
• Network connectivity issue

**Next Steps:**
1. Verify org alias exists: `sf org list`
2. Re-authenticate: `sf org login web --alias production`
3. Test connection: `sf org display --target-org production`

**Related Commands:**
• /getstarted - Set up Salesforce connection

**Severity:** HIGH
```

## Usage with Error Handler Utility

### JavaScript/Node.js

```javascript
const { ErrorHandler } = require('./scripts/lib/error-handler');

// Initialize for specific plugin
const sfHandler = new ErrorHandler('salesforce');
const hsHandler = new ErrorHandler('hubspot');
const cpHandler = new ErrorHandler('cross-platform');

// Display formatted error
sfHandler.display('ERR-101', { org_alias: 'production' });

// Get formatted error object
const error = hsHandler.format('ERR-HUB-201', {
  property_name: 'email',
  object_type: 'contacts'
});

// Throw error with formatting
try {
  cpHandler.throw('ERR-CP-301', { source: 'requirements.md' });
} catch (err) {
  console.error(err.message);
}
```

### CLI Usage

```bash
# Display specific error
node scripts/lib/error-handler.js salesforce ERR-101 '{"org_alias":"production"}'

# List all error codes
node scripts/lib/error-handler.js salesforce list

# Show errors in category
node scripts/lib/error-handler.js hubspot category 200-299

# Display error without variables
node scripts/lib/error-handler.js cross-platform ERR-CP-101
```

## Adding New Error Codes

### 1. Choose appropriate category

Determine which category (100-level range) your error belongs to.

### 2. Add to YAML template

Edit the appropriate error messages YAML file:
- `salesforce-essentials/templates/error-messages.yaml`
- `hubspot-essentials/templates/error-messages.yaml`
- `cross-platform-essentials/templates/error-messages.yaml`

### 3. Follow template structure

```yaml
ERR-XXX:
  title: "Short Error Title"
  message: "User-friendly message with {variable} placeholders"
  causes:
    - "First possible cause"
    - "Second possible cause"
    - "Third possible cause"
  next_steps:
    - "1. First step to resolve"
    - "2. Second step to resolve"
    - "3. Third step to resolve"
  related_agents:
    - "agent-name - What this agent does"
  related_commands:
    - "/command-name - What this command does"
  severity: "high"  # high, medium, or low
```

### 4. Variable substitution

Use `{variable_name}` in messages for dynamic content:
- `{org_alias}` - Salesforce org alias
- `{property_name}` - HubSpot property name
- `{file_path}` - File path
- `{error_details}` - Detailed error message
- `{field_name}` - Field name
- etc.

## Error Severity Levels

### High
- Blocks user from proceeding
- Requires immediate action
- Examples: Connection failures, deployment failures, data loss risks

### Medium
- User can work around but should fix
- May cause problems if ignored
- Examples: Query timeouts, invalid field values, missing optional fields

### Low
- Minor issues or information
- Doesn't block workflow
- Examples: Warnings, operation cancelled by user, already-exists errors

## Best Practices

### For Error Messages

1. **Be specific**: "Field 'Email' is required" not "Missing field"
2. **Include context**: Show what operation failed and why
3. **Provide actionable steps**: Tell user exactly how to fix
4. **Link to relevant tools**: Reference agents/commands that can help
5. **Use variables**: Make messages dynamic with placeholders

### For Causes

1. List 2-4 most common causes
2. Order by likelihood (most common first)
3. Be specific, not generic
4. Help user self-diagnose

### For Next Steps

1. Provide 2-5 concrete steps
2. Number them in order
3. Include exact commands when possible
4. Link to documentation when helpful
5. End with escalation path if needed

### For Severity

1. **High**: User cannot proceed without fixing
2. **Medium**: User should fix but can work around
3. **Low**: Informational or minor issue

## Integration with Agents

Agents should reference the error system in their instructions:

```markdown
---
name: example-agent
---

# Example Agent

## Error Handling

This agent uses the standardized error message system.
See templates/ERROR_MESSAGE_SYSTEM.md for error codes.

Common errors:
- ERR-101: Connection failures
- ERR-201: Query syntax errors
- ERR-301: Deployment failures
```

## Testing Error Messages

### 1. Test variable substitution

```bash
node scripts/lib/error-handler.js salesforce ERR-101 '{"org_alias":"test-org"}'
```

Verify that `{org_alias}` is replaced with `test-org` in the output.

### 2. Test all placeholders

Ensure all `{variable}` placeholders are replaced.

### 3. Test readability

Error message should be clear without looking at YAML file.

### 4. Test actionability

User should know exactly what to do after reading the error.

## Error Message Checklist

Before committing new error codes:

- [ ] Error code follows naming convention
- [ ] Title is clear and concise (< 50 characters)
- [ ] Message includes relevant variables
- [ ] 2-4 causes listed in order of likelihood
- [ ] 2-5 specific next steps provided
- [ ] Related agents/commands included (if applicable)
- [ ] Severity level is appropriate
- [ ] All variables have placeholder syntax `{variable}`
- [ ] Tested with error handler utility
- [ ] Documentation updated if needed

## FAQ

### Q: When should I create a new error code vs reusing existing?

A: Create new error code if:
- Error has unique causes or resolution steps
- Error belongs to different category
- Existing error messages don't fit well

Reuse if:
- Same root cause and resolution
- Only difference is context (use variables)

### Q: Should I include technical details in error messages?

A: Balance detail with clarity:
- Include enough for debugging
- Don't overwhelm with technical jargon
- Use `{error_details}` variable for technical info
- Link to documentation for deep dives

### Q: How do I handle multiple variables?

```javascript
handler.display('ERR-401', {
  failed_count: 5,
  total_count: 100,
  field_name: 'Email'
});
```

YAML:
```yaml
ERR-401:
  message: "{failed_count} of {total_count} records failed due to missing {field_name}"
```

### Q: Can I use the same error code across plugins?

No. Each plugin has its own error namespace:
- Salesforce: ERR-XXX
- HubSpot: ERR-HUB-XXX
- Cross-Platform: ERR-CP-XXX

This prevents conflicts and makes it clear which plugin generated the error.

## Version History

- **v1.0.0** (2025-11-06): Initial error message system
  - 30+ Salesforce error codes
  - 25+ HubSpot error codes
  - 25+ Cross-platform error codes
  - Error handler utility
  - Complete documentation
