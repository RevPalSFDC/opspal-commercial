---
name: hubspot-cli-patterns
description: Reference guide for HubSpot CLI operations including theme management, file operations, authentication, and development workflows
version: 1.0.0
---

# HubSpot CLI Patterns

This skill provides comprehensive reference patterns for HubSpot CLI (`hs`) operations. Use this when building or managing HubSpot CMS themes, templates, modules, and files.

## Prerequisites

### Installation

```bash
# Install HubSpot CLI globally
npm install -g @hubspot/cli

# Verify installation
hs --version
```

### Authentication

```bash
# Interactive authentication (creates hubspot.config.yml)
hs auth

# Or use environment variables for CI/CD
export HUBSPOT_ACCOUNT_ID=your-account-id
export HUBSPOT_PERSONAL_ACCESS_KEY=your-key
```

See `auth-patterns.md` for detailed authentication patterns.

## CLI vs API Decision Matrix

Use this table to determine whether to use CLI or API for a given operation:

| Operation | Use CLI | Use API | Notes |
|-----------|---------|---------|-------|
| **Theme code** | `hs cms upload/fetch` | Source Code API | CLI preferred for development |
| **Templates** | `hs cms upload` | Source Code API | CLI preferred |
| **Modules** | `hs cms upload` | Source Code API | CLI preferred |
| **CSS/JS** | `hs cms upload` | Source Code API | CLI preferred |
| **Website pages** | N/A | CMS Pages API | API only |
| **Landing pages** | N/A | CMS Pages API | API only |
| **Blog posts** | N/A | CMS Blog Posts API | API only |
| **Files/assets** | `hs filemanager upload` | Files API | API has better control |
| **Workflows** | N/A | Automation v4 API | API only |
| **Forms** | N/A | Marketing Forms API | API only |
| **CTAs** | N/A | Limited API | UI/Playwright recommended |
| **Redirects** | N/A | URL Redirects API | API only |

### When to Use CLI

- Theme development and deployment
- Local development with hot-reload (watch mode)
- CI/CD pipelines for theme deployments
- Template and module scaffolding
- Theme validation and testing

### When to Use API

- Content operations (pages, posts)
- Form and workflow management
- Dynamic/programmatic content creation
- Integration with other systems
- Operations requiring transaction control

## Quick Reference

### Theme Operations

```bash
# Create new theme
hs cms create website-theme my-theme

# Upload to draft (safe)
hs cms upload ./my-theme @hubspot/my-theme --mode=draft

# Upload to publish (live)
hs cms upload ./my-theme @hubspot/my-theme --mode=publish

# Fetch theme from HubSpot
hs cms fetch @hubspot/my-theme ./my-theme

# Watch for changes (development)
hs cms watch ./my-theme @hubspot/my-theme --mode=draft --initial-upload
```

See `theme-operations.md` for detailed patterns.

### File Operations

```bash
# Upload file
hs filemanager upload ./image.png /images/

# Upload folder
hs filemanager upload ./assets/ /assets/ --recursive

# Fetch file
hs filemanager fetch /images/logo.png ./local-logo.png
```

See `file-operations.md` for detailed patterns.

### Development Workflow

```bash
# Start local development
cd my-theme
hs cms watch . @hubspot/my-theme --mode=draft --initial-upload

# Validate theme
hs cms theme marketplace-validate ./my-theme

# Check page speed
hs cms lighthouse-score https://example.com
```

See `dev-workflow.md` for complete development patterns.

## Environment Modes

### Draft Mode (Default for Safety)

All CLI operations should default to draft mode to prevent accidental live changes:

```bash
# Always use --mode=draft during development
hs cms upload ./my-theme @hubspot/my-theme --mode=draft
```

Draft changes:
- Visible in HubSpot preview
- Not affecting live site
- Can be reviewed before publish

### Publish Mode (Explicit Action)

Publish mode should be an explicit, intentional action:

```bash
# Only use when ready to go live
hs cms upload ./my-theme @hubspot/my-theme --mode=publish
```

Publish changes:
- Immediately affect live site
- No undo (but can re-upload previous version)
- Should be preceded by validation

## Error Handling

### Common CLI Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `No portal found` | Missing auth config | Run `hs auth` or set env vars |
| `Cannot find module` | CLI not installed | Run `npm install -g @hubspot/cli` |
| `401 Unauthorized` | Invalid/expired token | Re-authenticate with `hs auth` |
| `429 Rate Limit` | Too many requests | Wait and retry with backoff |
| `Asset not found` | Invalid path | Verify path in Design Manager |

### Retry Pattern

```bash
# Simple retry with delay
for i in 1 2 3; do
  hs cms upload ./my-theme @hubspot/my-theme --mode=draft && break
  echo "Retry $i failed, waiting..."
  sleep 5
done
```

## Integration with Agents

This skill is primarily used by:

- `hubspot-cms-theme-manager` - Theme management operations
- `hubspot-cms-files-manager` - File upload operations (hybrid CLI/API)

### Agent CLI Execution Pattern

```javascript
// Agents should execute CLI commands via Bash tool
const { execSync } = require('child_process');

function executeHsCli(command) {
  try {
    const output = execSync(`hs ${command}`, {
      encoding: 'utf8',
      env: {
        ...process.env,
        HUBSPOT_ACCOUNT_ID: process.env.HUBSPOT_ACCOUNT_ID,
        HUBSPOT_PERSONAL_ACCESS_KEY: process.env.HUBSPOT_PERSONAL_ACCESS_KEY
      }
    });
    return { success: true, output };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Example usage
const result = executeHsCli('cms upload ./theme @hubspot/my-theme --mode=draft');
```

## Related Documentation

- `theme-operations.md` - Complete theme CLI patterns
- `file-operations.md` - File management patterns
- `auth-patterns.md` - Authentication and CI/CD patterns
- `dev-workflow.md` - Local development workflow
