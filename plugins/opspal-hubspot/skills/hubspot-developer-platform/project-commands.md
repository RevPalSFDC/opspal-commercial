# HubSpot CLI Project Commands Reference

Complete reference for HubSpot CLI commands used in app development.

## Installation

```bash
# Install HubSpot CLI globally
npm install -g @hubspot/cli

# Verify installation
hs --version

# Update to latest
npm update -g @hubspot/cli
```

## Authentication

### Initial Setup

```bash
# Interactive authentication
hs auth

# Creates hubspot.config.yml with:
# - Portal ID
# - Authentication token
# - Default account
```

### Configuration File

```yaml
# hubspot.config.yml (gitignored)
defaultPortal: my-sandbox
portals:
  - name: my-sandbox
    portalId: 12345678
    authType: personalaccesskey
    personalAccessKey: 'pat-xxx-xxx'
```

### CI/CD Authentication

```bash
# Using environment variable
export HUBSPOT_PERSONAL_ACCESS_KEY=pat-xxx-xxx

# Or pass directly
hs project upload --personalAccessKey=pat-xxx-xxx
```

## Project Commands

### Create New Project

```bash
# Interactive project creation
hs project create

# Prompts for:
# - Project name
# - Template selection
# - Target account
```

### Add Components

```bash
# Add new component to existing project
hs project add

# Options:
# - App Card (CRM record, preview panel, etc.)
# - Settings
# - Serverless Function
```

### Local Development

```bash
# Start development server
hs project dev

# With debug output
hs project dev --debug

# Specify account
hs project dev --account=my-sandbox
```

### Install Dependencies

```bash
# Install project dependencies
hs project install-deps

# Required after:
# - Cloning project
# - Adding new components
# - Updating package.json
```

### Upload/Deploy

```bash
# Deploy to connected account
hs project upload

# Deploy to specific account
hs project upload --account=my-production

# Force upload (skip confirmation)
hs project upload --force
```

### Validate for Marketplace

```bash
# Run marketplace validation
hs project validate

# Checks:
# - Required files present
# - Manifest valid
# - Scopes appropriate
# - Components render
```

## File Commands

### Fetch from Portal

```bash
# Fetch single file
hs fetch @hubspot/path/to/file ./local/path

# Fetch directory
hs fetch @hubspot/directory ./local/directory

# Overwrite existing
hs fetch @hubspot/path ./local --overwrite
```

### Upload to Portal

```bash
# Upload single file
hs upload ./local/file @hubspot/destination

# Upload directory
hs upload ./local/dir @hubspot/destination

# Upload in draft mode
hs upload ./local @hubspot/destination --mode=draft
```

### Watch Mode

```bash
# Watch for changes and auto-upload
hs watch ./local @hubspot/destination

# Watch with initial upload
hs watch ./local @hubspot/destination --initial-upload

# Watch specific directory
hs watch ./src @hubspot/src --mode=draft
```

## Function Commands

### View Logs

```bash
# View all function logs
hs logs functions

# View specific function logs
hs logs functions --functionName getData

# Follow logs (stream)
hs logs functions --follow

# Filter by time
hs logs functions --since 1h
```

### Deploy Functions

```bash
# Functions deploy with project
hs project upload

# Individual function changes need full project upload
```

## Account Commands

### List Accounts

```bash
# Show configured accounts
hs accounts list

# Show current default
hs accounts use
```

### Switch Account

```bash
# Set default account
hs accounts use my-sandbox

# Use different account for single command
hs project upload --account=my-production
```

### Add Account

```bash
# Add new account
hs auth

# Or add sandbox
hs sandbox create
```

## Sandbox Commands

### Create Sandbox

```bash
# Create new developer sandbox
hs sandbox create

# Prompts for:
# - Sandbox name
# - Parent account (if applicable)
```

### List Sandboxes

```bash
# List available sandboxes
hs sandbox list
```

### Delete Sandbox

```bash
# Delete sandbox
hs sandbox delete --name=my-sandbox
```

## CMS Commands

### Themes

```bash
# Create new theme
hs cms create website-theme my-theme

# Fetch existing theme
hs cms fetch @hubspot/theme ./local-theme

# Validate theme
hs cms theme marketplace-validate ./theme
```

### Design Manager

```bash
# Open design manager
hs cms open design-manager

# Open specific file
hs cms open design-manager --file=my-theme/templates/home.html
```

## Secrets Management

### Add Secret

```bash
# Add secret to app
hs secrets add MY_API_KEY

# Prompted for value (not shown)
```

### List Secrets

```bash
# List available secrets
hs secrets list

# Shows names only, not values
```

### Delete Secret

```bash
# Remove secret
hs secrets delete MY_API_KEY
```

### Using Secrets in Functions

```javascript
// Access in serverless function
exports.main = async (context = {}) => {
  const { MY_API_KEY } = context.secrets;
  // Use secret...
};
```

## Common Workflows

### New App Development

```bash
# 1. Create project
hs project create

# 2. Navigate to project
cd my-project

# 3. Install dependencies
hs project install-deps

# 4. Start development
hs project dev

# 5. Make changes and test

# 6. Deploy when ready
hs project upload
```

### Adding App Card

```bash
# 1. In project directory
hs project add

# 2. Select "App Card"

# 3. Choose location (CRM record, preview, etc.)

# 4. Install new dependencies
hs project install-deps

# 5. Restart dev server
hs project dev
```

### Deploying to Production

```bash
# 1. Validate
hs project validate

# 2. Test in sandbox
hs project upload --account=sandbox

# 3. Verify functionality

# 4. Deploy to production
hs project upload --account=production
```

### Debugging Issues

```bash
# 1. Enable debug output
hs project dev --debug

# 2. View function logs
hs logs functions --follow

# 3. Check specific function
hs logs functions --functionName myFunction --since 10m
```

## Command Flags Reference

### Global Flags

| Flag | Description |
|------|-------------|
| `--account=<name>` | Specify account |
| `--debug` | Enable debug output |
| `--help` | Show help |
| `--version` | Show version |

### Upload Flags

| Flag | Description |
|------|-------------|
| `--mode=draft` | Upload to draft |
| `--mode=publish` | Publish immediately |
| `--force` | Skip confirmation |
| `--overwrite` | Overwrite existing |

### Dev Flags

| Flag | Description |
|------|-------------|
| `--debug` | Verbose output |
| `--account=<name>` | Target account |

## Troubleshooting

### Authentication Issues

```bash
# Re-authenticate
hs auth

# Clear and re-add
rm hubspot.config.yml
hs auth
```

### Upload Failures

```bash
# Check account
hs accounts list

# Verify file paths
ls -la ./src

# Try with debug
hs project upload --debug
```

### Dev Server Issues

```bash
# Kill existing processes
pkill -f "hs project dev"

# Restart
hs project install-deps
hs project dev
```
