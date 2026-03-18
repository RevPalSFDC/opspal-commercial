---
description: Install a solution from the shared catalog to your local plugin installation
argument-hint: "<solution-name> [--force] [--version <version>] [--dry-run]"
---

# Solution Install Command

Install a solution from the shared catalog to your local plugin installation.

## Usage

```bash
/solution-install <solution-name> [options]
```

## Arguments

- `<solution-name>` - Name of the solution to install

## Optional Parameters

- `--force` - Reinstall even if already installed
- `--version <version>` - Install specific version (default: latest)
- `--dry-run` - Show what would be installed without making changes

## Examples

### Install a Solution
```bash
/solution-install lead-management
```

### Force Reinstall
```bash
/solution-install lead-management --force
```

### Dry Run
```bash
/solution-install lead-management --dry-run
```

## Process

1. **Lookup** - Find solution in catalog
2. **Check** - Verify solution files are available
3. **Download** - Copy solution to local `solutions/installed/` directory
4. **Verify** - Validate solution integrity
5. **Report** - Show installation summary and next steps

## Output

### Successful Installation
```
Installing solution: lead-management

✓ Found in catalog: lead-management v1.0.0
✓ Solution files verified
✓ Copied to: .claude-plugins/opspal-core/solutions/installed/lead-management/
✓ Installation complete

Next Steps:
1. Configure your environment:
   /environment-create my-sandbox --org my-sandbox-alias

2. Deploy the solution:
   /solution-deploy lead-management --env my-sandbox \
     --param defaultOwnerId=005xxx \
     --param routingQueueId=00Gxxx

Required Parameters:
  • defaultOwnerId (userId) - Default owner for leads
  • routingQueueId (queueId) - Queue for round-robin assignment
```

### Already Installed
```
Solution lead-management is already installed (v1.0.0)

Use --force to reinstall.
```

### Dry Run Output
```
Dry Run: Would install lead-management

Source: ./solutions/lead-management
Target: .claude-plugins/opspal-core/solutions/installed/lead-management

Files to copy:
  • solution.json
  • components/fields/Lead.Score__c.field-meta.xml
  • components/fields/Lead.Priority__c.field-meta.xml
  • components/flows/Lead_Routing.flow-meta.xml
  • components/permissions/Lead_Manager.permissionset-meta.xml

No changes made.
```

## Installation Location

Solutions are installed to:
```
.claude-plugins/opspal-core/solutions/installed/<solution-name>/
```

This keeps installed solutions separate from:
- **templates/** - Local development templates
- **catalog/** - Shared catalog metadata

## Syncing the Repository

Before installing, ensure you have the latest solutions:

```bash
git pull origin main
```

If the solution files aren't available, you'll see:
```
Error: Solution files not available locally.
Sync the repository first: git pull origin main
Repository: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace
```

## Related Commands

- `/solution-catalog` - Browse available solutions
- `/solution-info <name>` - View solution details
- `/solution-deploy` - Deploy an installed solution
- `/solution-validate` - Validate solution structure
