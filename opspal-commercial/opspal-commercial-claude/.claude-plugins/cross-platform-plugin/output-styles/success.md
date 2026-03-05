# Success Output Template

## Format

```
✅ {title}

{summary}

{metrics}

{next_steps}

{footer}
```

## Fields

- **title**: Success message title (required)
- **summary**: What was accomplished (required)
- **metrics**: Quantitative results (optional)
- **next_steps**: What to do next (optional)
- **footer**: Additional resources or links (optional)

## Example Usage

```markdown
✅ **Deployment Successful**

Successfully deployed 15 components to production org.

**Metrics:**
- Components Deployed: 15
- Tests Run: 42
- Code Coverage: 87%
- Duration: 3m 24s

**Next Steps:**
1. Verify the changes in production
2. Monitor for any errors in the next 24 hours
3. Update documentation if needed

**Deployment Summary:**
- Org: production-org
- User: deployment@company.com
- Timestamp: 2025-11-13 14:30:52 UTC
```

## Color Scheme

- Title: Green bold
- Summary: Normal text
- Metrics: Table or bulleted list with numbers
- Next Steps: Numbered actionable list
- Footer: Muted text with metadata

## Exit Code

Use with: `exit 0` (success)
