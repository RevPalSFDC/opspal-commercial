# Bulk Update Confirmation Gate

> **MANDATORY**: ALL bulk update/delete operations on production data MUST pause for explicit user confirmation before execution.

## Why This Matters

**Root Cause (P1 - Reflection Cohort prompt-mismatch)**: Agent treated CSV generation and bulk update as a continuous pipeline, skipping the preview-then-approve gate that was clearly stated in the plan. This resulted in irreversible production data changes without user consent.

**Blast Radius**: HIGH - Production data corruption, irreversible changes, trust violation.

## Required Pattern

### Step 1: Generate Preview (ALWAYS)

Before any bulk operation affecting 2+ records, generate a preview:

```bash
# WRONG - continuous pipeline, no pause
node scripts/lib/bulk-api-handler.js --operation update --file changes.csv --sobject Account --org prod
# ↑ NEVER do this without showing the user what will change first

# CORRECT - generate preview, then pause
node scripts/lib/bulk-api-handler.js --operation update --file changes.csv --sobject Account --org prod --dry-run
# ↑ Shows what WOULD change without applying
```

### Step 2: Present Changes to User (ALWAYS)

Display a clear summary:

```
📋 Bulk Update Preview:
   Object:  Account
   Org:     production
   Records: 147
   Fields:  OwnerId, Territory2Id

   Sample changes (first 5):
   ┌────────────────────┬──────────────┬──────────────┐
   │ Account            │ Current      │ New          │
   ├────────────────────┼──────────────┼──────────────┤
   │ Acme Corp          │ User A       │ User B       │
   │ Beta Inc           │ User C       │ User D       │
   └────────────────────┴──────────────┴──────────────┘

⚠️  This will modify 147 records in PRODUCTION.
   Do you want to proceed? (yes/no)
```

### Step 3: Wait for Explicit Confirmation (NEVER skip)

```javascript
// WRONG - auto-proceed after preview
const preview = await generatePreview(changes);
console.log(preview);
await executeBulkUpdate(changes);  // ← NO! Must wait for user

// CORRECT - explicit gate
const preview = await generatePreview(changes);
console.log(preview);
// STOP HERE - use AskUserQuestion or wait for user response
// Only proceed after explicit "yes" from user
```

## Trigger Conditions

This gate is MANDATORY when ALL of the following are true:
1. Operation modifies or deletes records (not read-only)
2. Affects 2+ records (bulk)
3. Target is a production org (not sandbox)

## Enforcement

The `pre-high-risk-operation.sh` hook calculates risk scores for bulk operations. However, agents MUST independently implement the preview-then-approve pattern regardless of hook status.

### Agent Self-Check

Before executing any bulk write, ask yourself:
- [ ] Did I show the user exactly what will change?
- [ ] Did the user explicitly say "yes" or "proceed"?
- [ ] Am I certain this is not a dry-run that I'm treating as final?

If ANY answer is "no" → STOP and show preview first.

## See Also

- `agents/shared/ooo-write-operations-pattern.md` - Safe write pattern
- `hooks/pre-high-risk-operation.sh` - Risk scoring hook
- `scripts/lib/bulk-api-handler.js` - Bulk API with --dry-run support

---
**Source**: Reflection Cohort - prompt-mismatch (P1)
**Version**: 1.0.0
**Date**: 2026-03-01
