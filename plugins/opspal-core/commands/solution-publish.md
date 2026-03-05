---
description: Publish a local solution template to the shared catalog for distribution
argument-hint: "<solution-path> [--message <message>] [--dry-run]"
---

# Solution Publish Command

Publish a local solution template to the shared catalog for distribution.

## Usage

```bash
/solution-publish <solution-path> [options]
```

## Arguments

- `<solution-path>` - Path to local solution directory

## Optional Parameters

- `--author <name>` - Override author name (default: from manifest metadata)
- `--message <message>` - Publish message for changelog
- `--dry-run` - Show what would be published without making changes
- `--force` - Update existing solution even if version is unchanged

## Examples

### Publish a Solution
```bash
/solution-publish ./solutions/templates/my-solution
```

### Publish with Message
```bash
/solution-publish ./solutions/templates/my-solution --message "Initial release"
```

### Dry Run
```bash
/solution-publish ./solutions/templates/my-solution --dry-run
```

### Override Author
```bash
/solution-publish ./solutions/templates/my-solution --author "My Team"
```

## Prerequisites

Before publishing, ensure your solution:

1. **Passes validation**:
   ```bash
   /solution-validate ./solutions/templates/my-solution
   ```

2. **Has required fields** in `solution.json`:
   - `name` - Unique solution name (lowercase-hyphenated)
   - `version` - Semantic version (e.g., "1.0.0")
   - `description` - Brief description
   - `components` - At least one component

3. **Has no hardcoded values**:
   - Use parameters for IDs, names, thresholds
   - Use `{{parameter}}` syntax in templates

## Process

1. **Validate** - Run validation checks on solution
2. **Package** - Prepare solution files for distribution
3. **Copy** - Copy to shared `solutions/` directory at repo root
4. **Update Catalog** - Add/update entry in `solution-catalog.json`
5. **Report** - Show summary and next steps

## Output

### Successful Publish
```
Publishing solution: my-solution

Pre-publish Validation:
  ✓ Manifest valid
  ✓ All templates exist
  ✓ No hardcoded IDs detected
  ✓ Dependencies valid

Publishing:
  ✓ Copied to: ./solutions/my-solution/
  ✓ Updated solution-catalog.json
  ✓ Catalog entry created

Published: my-solution v1.0.0

Next Steps:
1. Commit the changes:
   git add solution-catalog.json solutions/my-solution/
   git commit -m "feat: Add my-solution to catalog"
   git push origin main

2. Verify in catalog:
   /solution-catalog --search "my-solution"
```

### Update Existing
```
Publishing solution: my-solution

Note: Updating existing solution (v1.0.0 → v1.1.0)

✓ Solution updated in catalog
✓ Files copied to ./solutions/my-solution/

Remember to commit and push your changes.
```

### Dry Run Output
```
Dry Run: Would publish my-solution v1.0.0

Source: ./solutions/templates/my-solution
Target: ./solutions/my-solution

Catalog Entry:
{
  "name": "my-solution",
  "version": "1.0.0",
  "description": "My custom solution",
  "platforms": ["salesforce"],
  "tags": ["custom"],
  "complexity": "moderate",
  "componentCount": 3,
  "parameterCount": 4
}

No changes made.
```

## File Locations

| Location | Purpose |
|----------|---------|
| `./solutions/templates/` | Local development |
| `./solutions/` (repo root) | Published solutions |
| `solution-catalog.json` | Catalog registry |

## Distribution

After publishing, the solution is distributed by pushing to the repository:

```bash
git add solution-catalog.json solutions/my-solution/
git commit -m "feat: Add my-solution to catalog"
git push origin main
```

Other installations can then install it:
```bash
git pull origin main
/solution-install my-solution
```

## Version Management

When updating an existing solution:

1. **Update version** in `solution.json`
2. **Run publish** - will update catalog entry
3. **Commit and push**

The catalog tracks:
- Current version
- Publication date
- Download count (preserved on update)

## Related Commands

- `/solution-validate` - Validate before publishing
- `/solution-catalog` - View published solutions
- `/solution-info` - View solution details
- `/solution-install` - Install from catalog
