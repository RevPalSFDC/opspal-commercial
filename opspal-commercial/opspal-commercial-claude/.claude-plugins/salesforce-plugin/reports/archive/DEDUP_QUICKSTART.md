# SFDC Account Deduplication - Quick Start Guide

**Version**: 1.0.0
**Last Updated**: 2025-10-16

## Overview

This guide gets you started with the SFDC Account Deduplication system in 5 minutes.

**What This System Does**:
- ✅ Prevents merging different entities (Type 1 errors)
- ✅ Prevents selecting wrong survivor (Type 2 errors)
- ✅ Provides data-first survivor selection
- ✅ Works across any Salesforce org (instance-agnostic)

**ROI**: Prevents $50K-$500K data loss per incident in enterprise orgs

---

## Prerequisites

1. **Salesforce CLI** installed and authenticated
2. **Node.js** v14+ installed
3. **Org access** with appropriate permissions

```bash
# Verify Salesforce CLI
sf --version

# Verify org access
sf org list
```

---

## 5-Minute Quick Start

### Step 1: Prepare Your Org (3 minutes)

```bash
cd .claude-plugins/salesforce-plugin/scripts/lib

# Run prepare workflow (validates + backups + detects importance fields)
node dedup-workflow-orchestrator.js prepare {your-org-alias}

# Example:
node dedup-workflow-orchestrator.js prepare bluerabbit2021-revpal
```

**What This Does**:
1. Validates org (field history limits, formulas, relationships)
2. Creates full FIELDS(ALL) backup (all accounts, contacts, opportunities)
3. Detects importance fields (integration IDs, status fields, revenue fields)

**Output**:
```
✅ Pre-merge validation: PASSED
✅ Full backup: COMPLETE
✅ Importance fields: DETECTED

You can now proceed with duplicate analysis.
```

---

### Step 2: Analyze Duplicate Pairs (1 minute)

Create a CSV file with your proposed duplicate pairs:

**duplicates.csv**:
```csv
idA,idB
001xx00000ABC123,001xx00000DEF456
001xx00000GHI789,001xx00000JKL012
```

Run analysis:

```bash
node dedup-workflow-orchestrator.js analyze {your-org-alias} duplicates.csv

# Example:
node dedup-workflow-orchestrator.js analyze bluerabbit2021-revpal duplicates.csv
```

**Output**:
```
📊 SUMMARY:
  Total Pairs Analyzed: 150
  ✅ APPROVE: 120
  ⚠️  REVIEW: 25
  🛑 BLOCK: 5
  Type 1 Errors Prevented: 3
  Type 2 Errors Prevented: 2

📄 Full report saved to: dedup-decisions.json
```

---

### Step 3: Review Decisions (1 minute)

Open `dedup-decisions.json` to review all decisions:

```json
{
  "org": "bluerabbit2021-revpal",
  "stats": {
    "total": 150,
    "approved": 120,
    "review": 25,
    "blocked": 5,
    "type1Prevented": 3,
    "type2Prevented": 2
  },
  "decisions": [...]
}
```

**Decision Types**:
- **APPROVE**: Safe to merge, no issues detected
- **REVIEW**: Requires manual approval (show user confidence + scores)
- **BLOCK**: Do NOT merge, Type 1 or Type 2 error detected

---

### Step 4: Execute Approved Merges

For **APPROVE** decisions only:
- Use Salesforce UI: Setup → Data → Mass Merge Records
- Use Data Loader: Bulk merge API
- Use Cloudingo/DemandTools: Execute approved pairs

**IMPORTANT**: Do NOT merge BLOCK or REVIEW decisions without fixing issues first.

---

### Step 5: Recover from Errors (If Needed)

If you merged a BLOCK pair or discovered an error after merging, use recovery procedures:

**Procedure A**: Field Restoration (Type 2 - wrong survivor)
```bash
node dedup-workflow-orchestrator.js recover {org} {survivor-id} a --dry-run

# Example: Prospect absorbed Paying Customer
node dedup-workflow-orchestrator.js recover production 001xx000ABC a
```

**Procedure B**: Entity Separation (Type 1 - different entities)
```bash
node dedup-workflow-orchestrator.js recover {org} {survivor-id} b

# Example: Two different Housing Authorities merged
node dedup-workflow-orchestrator.js recover production 001xx000ABC b
```

**Procedure C**: Quick Undelete (Type 1 - within 15 days)
```bash
node dedup-workflow-orchestrator.js recover {org} {survivor-id} c

# Example: Need quick undo, merged yesterday
node dedup-workflow-orchestrator.js recover production 001xx000ABC c
```

---

## Common Scenarios

### Scenario 1: Batch Dedup from Cloudingo

```bash
# 1. Prepare org
node dedup-workflow-orchestrator.js prepare production

# 2. Export duplicate pairs from Cloudingo as CSV

# 3. Analyze pairs
node dedup-workflow-orchestrator.js analyze production cloudingo-duplicates.csv

# 4. Filter dedup-decisions.json for APPROVE only
cat dedup-decisions.json | jq '.decisions[] | select(.decision == "APPROVE")'

# 5. Import approved pairs back into Cloudingo

# 6. Execute merges in Cloudingo
```

### Scenario 2: Single Pair Analysis

```bash
# Analyze just one pair
cd scripts/lib
node dedup-safety-engine.js single production 001xx000ABC 001xx000DEF

# Review output
cat dedup-decisions.json
```

### Scenario 3: Post-Merge Error Recovery

```bash
# Discovered wrong survivor after merge
node dedup-workflow-orchestrator.js recover production 001xx000ABC a --dry-run

# Review restoration-scripts/restoration-*.apex

# If looks good, execute without --dry-run
node dedup-workflow-orchestrator.js recover production 001xx000ABC a
```

---

## Output Files & Locations

All output files are organized by purpose:

```
.claude-plugins/salesforce-plugin/
├── backups/{org}/{timestamp}/
│   ├── account_all_fields_active.json         # All accounts with all fields
│   ├── contact_all_fields_chunk_*.json        # All contacts
│   ├── opportunity_all_fields_chunk_*.json    # All opportunities
│   └── relationship_topology.json             # Parent-child relationships
│
├── field-importance-reports/
│   └── importance-fields-Account-*.txt        # Importance analysis
│
├── validation-reports/
│   └── validation-Account-*.json              # Pre-merge validation
│
├── dedup-decisions.json                       # Analysis results (current)
│
├── restoration-scripts/
│   ├── restoration-{id}-*.apex                # Procedure A scripts
│   └── rollback-{id}-*.apex                   # Undo scripts
│
├── separation-guides/
│   └── manual-review-{id}-*.md                # Procedure B guides
│
└── quick-guides/
    ├── quick-separation-{id}-*.md             # Procedure C guides
    └── contact-migration-{id}-*.csv           # Migration templates
```

---

## Key Commands Reference

### Workflow Commands

```bash
# Prepare org for dedup
node dedup-workflow-orchestrator.js prepare {org}

# Analyze duplicate pairs
node dedup-workflow-orchestrator.js analyze {org} {pairs-file}

# Execute recovery procedure
node dedup-workflow-orchestrator.js recover {org} {survivor-id} {a|b|c}
```

### Individual Components

```bash
# Pre-merge validation
node sfdc-pre-merge-validator.js {org} Account

# Full backup
node sfdc-full-backup-generator.js {org} Account

# Importance detection
node importance-field-detector.js {org} Account

# Single pair analysis
node dedup-safety-engine.js single {org} {id-a} {id-b}

# Batch analysis
node dedup-safety-engine.js analyze {org} {pairs-file}

# Field restoration (Procedure A)
node procedure-a-field-restoration.js {org} {survivor-id} --dry-run

# Entity separation (Procedure B)
node procedure-b-entity-separation.js {org} {survivor-id}

# Quick undelete (Procedure C)
node procedure-c-quick-undelete.js {org} {survivor-id}
```

---

## Troubleshooting

### "No backup found"

```bash
# Run prepare workflow first
node dedup-workflow-orchestrator.js prepare {org}

# Or run backup manually
node sfdc-full-backup-generator.js {org} Account
```

### "Validation failed: Field history tracking limit"

You've hit Salesforce's 20-field limit for history tracking. Fix:
1. Review validation report: `validation-reports/validation-Account-*.json`
2. Disable history tracking on less critical fields
3. Re-run validation

### "Analysis blocked all pairs"

Check if:
1. Pairs CSV has correct format (idA,idB columns)
2. IDs are valid 18-character Salesforce IDs
3. Configuration is appropriate for your org type (B2G, PropTech, etc.)

### "Undelete failed: Record not in recycle bin"

Record may be outside 15-day window. Use Procedure B instead:
```bash
# Procedure B works without undelete
node dedup-workflow-orchestrator.js recover {org} {survivor-id} b
```

---

## Best Practices

### 1. Always Run Prepare Workflow First

```bash
# DO THIS before any dedup operation
node dedup-workflow-orchestrator.js prepare {org}
```

**Why**: Ensures validation passes, backup exists, importance fields detected

### 2. Test in Sandbox First

```bash
# Run full workflow in sandbox
node dedup-workflow-orchestrator.js prepare sandbox-org
node dedup-workflow-orchestrator.js analyze sandbox-org test-pairs.csv

# Review results before production
```

### 3. Use Dry-Run for Recovery

```bash
# Always dry-run first to see what will change
node dedup-workflow-orchestrator.js recover {org} {id} a --dry-run

# Review generated scripts before executing
```

### 4. Keep Backups

Backups are timestamped and never overwritten. Keep them for at least 30 days after merge operations.

### 5. Review BLOCK Decisions Carefully

BLOCK decisions indicate serious issues:
- Type 1: Different entities (e.g., different companies)
- Type 2: Wrong survivor (e.g., Prospect absorbing Customer)

**Never force these merges**. Use recovery procedures instead.

---

## Next Steps

**Learn More**:
- [Configuration Guide](DEDUP_CONFIG_GUIDE.md) - Customize for your org
- [Recovery Playbook](DEDUP_RECOVERY_GUIDE.md) - Detailed recovery procedures
- [Implementation Summary](DEDUP_IMPLEMENTATION_COMPLETE.md) - Complete technical details

**Integration**:
- Read `agents/sfdc-merge-orchestrator.md` for agent integration
- Review `agents/sfdc-dedup-safety-copilot.md` for safety analysis details

**Support**:
- Check output files for detailed error messages
- Review validation reports before contacting support
- Include dedup-decisions.json when reporting issues

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│ SFDC Account Deduplication - Quick Reference               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ PREPARE: node dedup-workflow-orchestrator.js prepare {org} │
│ ANALYZE: node dedup-workflow-orchestrator.js analyze {org} │
│ RECOVER: node dedup-workflow-orchestrator.js recover {org} │
│                                                             │
│ DECISIONS:                                                  │
│   ✅ APPROVE  = Safe to merge                              │
│   ⚠️  REVIEW   = Manual approval required                   │
│   🛑 BLOCK    = Do NOT merge (Type 1/2 error)              │
│                                                             │
│ RECOVERY PROCEDURES:                                        │
│   A = Field Restoration (Type 2 - wrong survivor)          │
│   B = Entity Separation (Type 1 - different entities)      │
│   C = Quick Undelete (Type 1 - within 15 days)             │
│                                                             │
│ OUTPUT: dedup-decisions.json                                │
│ BACKUPS: backups/{org}/{timestamp}/                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

**Version**: 1.0.0
**Last Updated**: 2025-10-16
**Maintained By**: RevPal Engineering
