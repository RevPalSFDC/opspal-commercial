# Error Output Template

## Format

```
❌ {title}

{description}

{details}

{recommendations}

{footer}
```

## Fields

- **title**: Bold error title (required)
- **description**: Brief error description (required)
- **details**: Technical details, stack traces, etc. (optional)
- **recommendations**: Suggested fixes or next steps (optional)
- **footer**: Additional context or links (optional)

## Example Usage

```markdown
❌ **Deployment Failed**

The Salesforce deployment to production org failed due to validation errors.

**Details:**
- Component: Account.cls
- Error: INVALID_FIELD_FOR_INSERT_UPDATE
- Line: 42
- Field: CustomField__c does not exist

**Recommendations:**
1. Verify the field exists in the target org
2. Check field API name matches exactly
3. Ensure field is accessible by the deployment user

**Need Help?**
- Documentation: https://developer.salesforce.com/docs
- Support: Run `/reflect` to report this issue
```

## Color Scheme

- Title: Red bold
- Description: Normal text
- Details: Code block or indented
- Recommendations: Numbered list
- Footer: Muted/gray text

## Exit Code

Use with: `exit 1` (blocking) or `exit 2` (warning)
