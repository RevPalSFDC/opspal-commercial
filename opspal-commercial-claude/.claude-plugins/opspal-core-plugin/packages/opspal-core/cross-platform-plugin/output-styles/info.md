# Info Output Template

## Format

```
ℹ️  {title}

{content}

{details}

{footer}
```

## Fields

- **title**: Informational title (required)
- **content**: Main information content (required)
- **details**: Additional details or context (optional)
- **footer**: Links, references, or configuration (optional)

## Example Usage

```markdown
ℹ️  **Validation Check Complete**

Pre-deployment validation has been completed successfully.

**Checks Performed:**
- ✓ Source structure validated
- ✓ Metadata format verified
- ✓ Dependencies resolved
- ✓ Test coverage adequate (87% > 75% required)

**Environment:**
- Org: staging-org
- API Version: 62.0
- User: developer@company.com

**Configuration:**
- Validation Mode: STRICT
- Auto-fix: ENABLED
- Timeout: 5 minutes
```

## Color Scheme

- Title: Blue bold
- Content: Normal text
- Details: Bulleted or checkbox list
- Footer: Muted text with configuration

## Exit Code

Use with: `exit 0` (informational only)
