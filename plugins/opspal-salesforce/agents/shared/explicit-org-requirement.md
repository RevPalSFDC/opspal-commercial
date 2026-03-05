# Explicit Org Specification Requirement

**MANDATORY for all data operations**: Always specify the target org explicitly using `-o` flag.

## Why This Matters

**Root Cause (P0 - Reflection Cohort config/env)**: Agent operations defaulting to wrong org when `-o` flag not specified.

**Blast Radius**: HIGH - Wrong-org operations can corrupt production data.

## Required Pattern

```bash
# WRONG - relies on default org
sf data query --query "SELECT Id FROM Account"

# CORRECT - explicit org specification
sf data query --query "SELECT Id FROM Account" -o ${ORG_ALIAS}
```

## Validation Steps

**Before ANY sf command:**

1. **Resolve org alias** using instance-alias-resolver:
   ```javascript
   const { resolveOrgAlias } = require('./lib/instance-alias-resolver');
   const resolution = await resolveOrgAlias(userInput, { interactive: true });
   const ORG_ALIAS = resolution.orgAlias;
   ```

2. **Confirm org is correct** for production operations:
   ```javascript
   if (resolution.match.environmentType === 'production' && recordCount > 50) {
     console.log(`⚠️  PRODUCTION: ${ORG_ALIAS}`);
     // Require explicit confirmation
   }
   ```

3. **Always append -o flag** to every sf command:
   ```bash
   sf data query -o ${ORG_ALIAS} --query "..."
   sf data update -o ${ORG_ALIAS} ...
   sf project deploy -o ${ORG_ALIAS} ...
   ```

## Environment Variable Fallback

If no org specified by user, check environment:
```javascript
const orgAlias = userProvidedOrg
  || process.env.SF_TARGET_ORG
  || process.env.ORG_ALIAS;

if (!orgAlias) {
  throw new Error('No org specified. Use -o flag or set SF_TARGET_ORG');
}
```

## Quick Reference

| Command Type | Required Flag |
|-------------|---------------|
| `sf data query` | `-o ${ORG_ALIAS}` |
| `sf data create/update/delete` | `-o ${ORG_ALIAS}` |
| `sf project deploy` | `-o ${ORG_ALIAS}` |
| `sf apex run` | `-o ${ORG_ALIAS}` |
| `sf org display` | `-o ${ORG_ALIAS}` |

## Error Messages

If org not specified, output:
```
❌ ERROR: No target org specified

   All sf commands require explicit -o flag to prevent wrong-org operations.

   Fix: Add -o <org-alias> to your command
   Example: sf data query -o my-org --query "..."

   Or set environment variable:
   export SF_TARGET_ORG=my-org
```

## Never Hardcode Org Aliases in Scripts

**PROHIBITED**: Hardcoding org alias strings like `'production'`, `'my-sandbox'`, etc. in scripts.

**Why**: Org aliases change between environments and users. A script with `--target-org production` will break when the alias is `wedgewood-production` or `acme-prod`.

### Wrong vs Right Patterns

```javascript
// WRONG - hardcoded alias
const cmd = `sf data query --query "SELECT Id FROM Account" --target-org production`;

// WRONG - hardcoded in template literal
const org = 'production';
const cmd = `sf data query --query "..." --target-org ${org}`;

// CORRECT - use resolveCurrentOrg()
const { resolveCurrentOrg } = require('./org-alias-validator');
const resolved = resolveCurrentOrg();
if (resolved.error) throw new Error(resolved.error);
const cmd = `sf data query --query "..." --target-org ${resolved.alias}`;

// CORRECT - use environment variable
const org = process.env.SF_TARGET_ORG || process.env.ORG_ALIAS;
if (!org) throw new Error('Set SF_TARGET_ORG or ORG_ALIAS');
const cmd = `sf data query --query "..." --target-org ${org}`;
```

### Resolution Priority

`resolveCurrentOrg()` checks in this order:
1. `SF_TARGET_ORG` environment variable
2. `ORG_ALIAS` environment variable
3. `sf org display --json` (default org from sf CLI)
4. `sf org list` (default username)

### Quick Pattern

```javascript
const { resolveCurrentOrg } = require('./org-alias-validator');
const { alias } = resolveCurrentOrg();
// Use alias in all sf commands
```

---
**Source**: Reflection Cohort - config/env (P0, P2)
**Version**: 1.1.0
**Date**: 2026-02-05
