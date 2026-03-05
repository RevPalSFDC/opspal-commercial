# Plugin Manifest Schema Documentation

## Overview

This document describes the **official Claude Code plugin manifest schema** (v1.0.0) for the OpsPal Internal Plugin Marketplace.

**Schema File**: `.claude-plugins/developer-tools-plugin/schemas/plugin-manifest.schema.json`

**Status**: ✅ Enforced via pre-commit hooks and CI/CD

---

## Valid Fields (Claude Code 2.0.15+)

The following fields are **officially supported** by Claude Code:

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `name` | string | ✅ Yes | Plugin identifier (lowercase-hyphen) | `"salesforce-plugin"` |
| `description` | string | ✅ Yes | Brief description (10-200 chars) | `"Salesforce operations plugin"` |
| `version` | string | ✅ Yes | Semantic version (MAJOR.MINOR.PATCH) | `"3.7.1"` |
| `author` | string \| object | ❌ No | Author name or object with name/email/url | `"RevPal Engineering"` or `{"name": "...", "email": "..."}` |
| `keywords` | array | ❌ No | Keywords for discovery (1-10 items) | `["salesforce", "sfdc", "cpq"]` |
| `repository` | string \| object | ❌ No | Repository URL or object with type/url | `"https://github.com/..."` |
| `license` | string | ❌ No | SPDX license identifier | `"MIT"` |

---

## Unsupported Fields (Will Cause Validation Errors)

The following fields are **NOT supported** by Claude Code 2.0.15+ and will cause validation errors:

❌ `capabilities`
❌ `dependencies`
❌ `hooks`
❌ `engines`
❌ `main`
❌ `scripts`
❌ `files`

**These fields were part of an unofficial schema and must be removed.**

---

## Field Details

### `name` (Required)

**Type**: `string`

**Pattern**: `^[a-z][a-z0-9-]*$` (lowercase letters, numbers, hyphens only, must start with letter)

**Length**: 3-50 characters

**Examples**:
- ✅ `salesforce-plugin`
- ✅ `hubspot-core-plugin`
- ✅ `gtm-planning-plugin`
- ❌ `Salesforce-Plugin` (uppercase)
- ❌ `salesforce_plugin` (underscores)
- ❌ `sf` (too short)

---

### `description` (Required)

**Type**: `string`

**Length**: 10-200 characters

**Guidelines**:
- Be concise and specific
- Describe what the plugin does
- Avoid marketing language

**Examples**:
- ✅ `"Comprehensive Salesforce operations - metadata, security, deployment"`
- ✅ `"HubSpot core functionality - contacts, companies, deals"`
- ❌ `"Salesforce"` (too short)
- ❌ `"The best, most amazing Salesforce plugin ever created..."` (too long, marketing)

---

### `version` (Required)

**Type**: `string`

**Pattern**: `^\d+\.\d+\.\d+$` (semantic versioning)

**Format**: `MAJOR.MINOR.PATCH`

**Examples**:
- ✅ `"1.0.0"`
- ✅ `"3.7.1"`
- ✅ `"10.2.15"`
- ❌ `"1.0"` (missing patch)
- ❌ `"v1.0.0"` (no 'v' prefix)
- ❌ `"1.0.0-beta"` (no pre-release identifiers)

---

### `author` (Optional)

**Type**: `string` OR `object`

**As String**:
```json
{
  "author": "RevPal Engineering"
}
```

**As Object**:
```json
{
  "author": {
    "name": "RevPal Engineering",
    "email": "engineering@gorevpal.com",
    "url": "https://gorevpal.com"
  }
}
```

**Object Fields**:
- `name` (required): Author name
- `email` (optional): Valid email address
- `url` (optional): Valid URL

---

### `keywords` (Optional)

**Type**: `array` of `string`

**Constraints**:
- 1-10 keywords
- Each keyword minimum 2 characters
- Must be unique (no duplicates)

**Examples**:
```json
{
  "keywords": ["salesforce", "sfdc", "metadata", "cpq", "revops"]
}
```

---

### `repository` (Optional)

**Type**: `string` OR `object`

**As String** (shorthand):
```json
{
  "repository": "https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace"
}
```

**As Object** (full format):
```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace"
  }
}
```

---

### `license` (Optional)

**Type**: `string`

**Format**: SPDX license identifier

**Common Values**:
- `"MIT"`
- `"Apache-2.0"`
- `"GPL-3.0"`
- `"ISC"`
- `"BSD-3-Clause"`

**Example**:
```json
{
  "license": "MIT"
}
```

---

## Complete Example

### Minimal Valid Manifest

```json
{
  "name": "my-plugin",
  "description": "A minimal example plugin for demonstration purposes",
  "version": "1.0.0"
}
```

### Full Valid Manifest

```json
{
  "name": "salesforce-plugin",
  "description": "Comprehensive Salesforce operations - metadata management, security, deployment automation",
  "version": "3.7.1",
  "author": {
    "name": "RevPal Engineering",
    "email": "engineering@gorevpal.com"
  },
  "keywords": [
    "salesforce",
    "sfdc",
    "metadata",
    "cpq",
    "revops"
  ],
  "repository": "https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace",
  "license": "MIT"
}
```

---

## Validation

### Manual Validation

```bash
# Validate a single manifest
ajv validate -s .claude-plugins/developer-tools-plugin/schemas/plugin-manifest.schema.json \
             -d .claude-plugins/my-plugin/.claude-plugin/plugin.json

# Validate all manifests
.claude-plugins/developer-tools-plugin/scripts/lib/validate-all-plugins.sh

# Validate and auto-fix common issues
.claude-plugins/developer-tools-plugin/scripts/lib/validate-all-plugins.sh --fix
```

### Pre-Commit Validation

Pre-commit hooks automatically validate ALL plugin manifests before allowing commits.

**Hook Location**: `.claude-plugins/developer-tools-plugin/.claude-plugin/hooks/pre-commit.sh`

**Behavior**:
- Runs on every commit
- Validates ALL plugins (not just changed files)
- Blocks commit if any manifest is invalid
- Provides clear error messages

### CI/CD Validation

GitHub Actions workflow validates manifests on every push and PR.

**Workflow**: `.github/workflows/validate-plugins.yml`

**Triggers**:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Changes to any `plugin.json` file
- Changes to schema file

**Behavior**:
- Validates all manifests
- Fails build if invalid
- Adds PR comment with errors
- Uploads validation report as artifact

---

## Migration from Unofficial Schema

If your plugin manifest contains unsupported fields, follow these steps:

### Step 1: Identify Unsupported Fields

```bash
# Run validation to see errors
.claude-plugins/developer-tools-plugin/scripts/lib/validate-all-plugins.sh
```

### Step 2: Remove Unsupported Fields

**Before** (invalid):
```json
{
  "name": "my-plugin",
  "description": "Example plugin",
  "version": "1.0.0",
  "capabilities": ["read", "write"],
  "dependencies": {
    "some-package": "^1.0.0"
  },
  "hooks": {
    "pre-commit": "./hooks/pre-commit.sh"
  }
}
```

**After** (valid):
```json
{
  "name": "my-plugin",
  "description": "Example plugin",
  "version": "1.0.0"
}
```

**Note**: Capabilities, dependencies, and hooks are configured elsewhere:
- **Capabilities/Dependencies**: Defined in agent frontmatter or command files
- **Hooks**: Located in `.claude-plugin/hooks/` directory (auto-discovered)

### Step 3: Verify Fix

```bash
# Validate specific plugin
ajv validate -s .claude-plugins/developer-tools-plugin/schemas/plugin-manifest.schema.json \
             -d .claude-plugins/my-plugin/.claude-plugin/plugin.json

# Or use auto-fix
.claude-plugins/developer-tools-plugin/scripts/lib/validate-all-plugins.sh --fix
```

---

## Troubleshooting

### Error: "should NOT have additional properties"

**Cause**: Your manifest contains unsupported fields.

**Solution**: Remove fields not listed in the "Valid Fields" section above.

### Error: "should match pattern"

**Cause**: Field value doesn't match required format (e.g., version, name pattern).

**Solution**: Check field constraints and fix format:
- `name`: lowercase-hyphen only
- `version`: MAJOR.MINOR.PATCH (no 'v' prefix)

### Error: "should be string"

**Cause**: Field has wrong type (e.g., number instead of string for version).

**Solution**: Ensure all fields are correct type - version must be a STRING "1.0.0", not number 1.0.

### Pre-commit hook blocks commit

**Cause**: One or more plugin manifests are invalid.

**Solution**:
```bash
# See which plugins are invalid
.claude-plugins/developer-tools-plugin/scripts/lib/validate-all-plugins.sh

# Auto-fix common issues
.claude-plugins/developer-tools-plugin/scripts/lib/validate-all-plugins.sh --fix

# Commit again
git commit
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-14 | Initial official schema documentation |

---

## References

- **JSON Schema Specification**: https://json-schema.org/
- **Semantic Versioning**: https://semver.org/
- **SPDX License List**: https://spdx.org/licenses/
- **Schema File**: `.claude-plugins/developer-tools-plugin/schemas/plugin-manifest.schema.json`
- **Validation Script**: `.claude-plugins/developer-tools-plugin/scripts/lib/validate-all-plugins.sh`
- **CI/CD Workflow**: `.github/workflows/validate-plugins.yml`

---

**Questions or issues?** Please submit a reflection via `/reflect` command.
