# Environment File Discovery Protocol

> **MANDATORY**: Before declaring any credential or environment variable as "missing", check .env files on disk first.

## Why This Matters

**Root Cause (Reflection Cohort prompt-mismatch P2)**: Agents declare credentials missing without checking `.env` files that exist and are auto-loaded by scripts. This causes unnecessary "I can't proceed" errors when the data is available.

## Required Check Sequence

Before concluding any environment variable is missing, check in this order:

### 1. Check process.env (already loaded)

```javascript
const value = process.env.SUPABASE_URL;
if (value) { /* use it */ }
```

### 2. Check .env in project root

```bash
cat .env 2>/dev/null | grep SUPABASE_URL
```

### 3. Check .env.local in project root

```bash
cat .env.local 2>/dev/null | grep SUPABASE_URL
```

### 4. Check ~/.env (user-global)

```bash
cat ~/.env 2>/dev/null | grep SUPABASE_URL
```

## Quick Check Pattern

```bash
# One-liner to check all .env files for a variable
for f in .env .env.local .env.production ~/.env; do
  [ -f "$f" ] && grep -l "SUPABASE_URL" "$f" 2>/dev/null && echo "Found in $f"
done
```

## If Found in .env but Not Loaded

If a variable exists in a `.env` file but not in `process.env`, the issue is that dotenv hasn't loaded it. Solutions:

```bash
# Option 1: Source the file in your shell
source .env

# Option 2: Use dotenvx
npx dotenvx run -- node your-script.js

# Option 3: Load programmatically
require('dotenv').config();
```

## Using the Environment Validator

The environment validator now automatically checks .env files:

```bash
# Run validator — will report .env file contents for "missing" vars
node .claude/scripts/lib/env-validator.js --plugin salesforce
```

The validator will:
- Find .env files in project root and home directory
- Cross-reference "missing required" errors against .env file contents
- Downgrade errors to warnings when variable exists in .env but isn't loaded
- Report which .env file contains each variable

## Agent Behavior Rules

1. **NEVER say "credentials not available"** without checking .env files first
2. **NEVER ask the user to set an env var** if it's already in a .env file
3. **DO suggest `source .env`** if the variable exists in a file but isn't loaded
4. **DO run the env-validator** when multiple variables appear missing

---
**Source**: Reflection Cohort - prompt-mismatch (P2)
**Version**: 1.0.0
**Date**: 2026-02-05
