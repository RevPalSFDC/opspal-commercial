---
name: dedup
description: Unified interface for Salesforce Account deduplication operations with Type 1/2 error prevention
arguments:
  - name: action
    description: "Action to perform: prepare, analyze, recover, or help"
    required: true
  - name: org
    description: "Salesforce org alias (required for all actions except help)"
    required: false
  - name: params
    description: "Additional parameters (e.g., pairs file, survivor ID, procedure)"
    required: false
---

# Salesforce Account Deduplication Command

Unified interface for safe Account deduplication with automatic Type 1/2 error prevention.

## Usage

### Interactive Mode (Recommended)
```
/dedup
```
When no arguments are provided, you'll get an interactive menu to guide you through the workflow.

### Direct Mode
```
/dedup {action} {org} [params]
```
For automation or when you already know which action to perform.

## Interactive Workflow

When you run `/dedup` without arguments, you'll be prompted with these menus:

### Step 1: Select Action
Choose what you want to do:
- **Prepare org for deduplication** - Run validation, create backup, detect important fields
- **Analyze duplicate pairs** - Detect Type 1/2 errors, generate decisions
- **Execute approved merges** - Run parallel merge execution
- **Recover from merge error** - Restore/separate incorrectly merged records
- **Show help and examples** - View complete documentation

### Step 2: Action-Specific Options
Based on your selection, you'll be asked for:
- **Org alias** (with list of authenticated orgs)
- **File paths** (pairs file, decisions file, config)
- **Execution parameters** (workers, batch size, dry-run)
- **Recovery procedure** (A/B/C based on error type)

---

## Implementation Instructions for Claude

When this command is invoked:

1. **If no arguments provided** → Use `AskUserQuestion` tool to present interactive menu:

   **First Menu - Select Action:**
   ```
   Question: "What would you like to do with Salesforce Account deduplication?"
   Options:
   - "Prepare org" → Description: "Run validation, create full backup, detect important fields (~5-10 min)"
   - "Analyze pairs" → Description: "Detect Type 1/2 errors, generate merge decisions with safety analysis (~2-5 min)"
   - "Execute merges" → Description: "Run parallel merge execution with native Salesforce merger (~10s per pair)"
   - "Recover from error" → Description: "Restore field values or separate entities after incorrect merge (~10-30 min)"
   - "Show help" → Description: "View complete documentation, examples, and troubleshooting"
   ```

2. **Based on action selected**, present follow-up menus:

   **For "Prepare org":**
   - Ask for org alias (fetch from `sf org list --json`)
   - **Run pre-flight validation** (NEW - as of 2025-10-18):
     ```bash
     node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/pre-flight-validator.js {org} Account --mode intelligent
     ```
   - If pre-flight BLOCKED → Show recommendations, require mode change
   - Execute: `node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/sfdc-full-backup-generator.js`, validation, importance detection
   - **Use intelligent field selection for large objects** (>200 fields):
     ```bash
     node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/metadata-backup-planner.js {org} Account --mode intelligent
     ```

   **For "Analyze pairs":**
   - Ask for org alias
   - Ask for pairs file path (suggest `.csv` files in current directory)
   - Optionally ask for custom config
   - Execute: `node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/bulk-decision-generator.js`

   **For "Execute merges":**
   - Ask for org alias
   - Ask for decisions file (suggest `dedup-decisions.json`)
   - Present execution options menu:
     ```
     Question: "How do you want to execute the merges?"
     Options:
     - "Dry-run first" → Description: "Preview what would happen without making changes (recommended)"
     - "Standard execution" → Description: "Execute with 5 parallel workers (balanced performance)"
     - "Conservative start" → Description: "Execute with 3 workers, limit to 10 pairs (safest)"
     - "Maximum throughput" → Description: "Execute with 10 workers (fastest, requires good org performance)"
     ```
   - Execute: `node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/bulk-merge-executor-parallel.js` with selected options

   **For "Recover from error":**
   - Ask for org alias
   - Ask for survivor Account ID
   - Present recovery procedure menu:
     ```
     Question: "What type of error occurred?"
     Options:
     - "Wrong survivor selected" → Description: "Same entity, but wrong record kept (Type 2 Error). Procedure A: Field Restoration (~5-10 min)"
     - "Different entities merged" → Description: "Two separate companies merged together (Type 1 Error). Procedure B: Entity Separation (~10-30 min)"
     - "Recent merge error" → Description: "Wrong merge within 15 days (Type 1 Error). Procedure C: Quick Undelete (~5 min)"
     ```
   - Execute: `node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dedup-rollback-system.js` with selected procedure

3. **If arguments provided** → Parse and execute directly (backward compatibility)

---

## Actions

### 1. prepare
Prepare org for deduplication (validate → backup → detect importance fields)

```
/dedup prepare {org-alias}
```

**Example**:
```
/dedup prepare production
```

**What It Does**:
1. Runs pre-merge validation (field history limits, formulas, relationships)
2. Creates full FIELDS(ALL) backup (accounts, contacts, opportunities)
3. Detects importance fields (integration IDs, status fields, revenue fields)

**Output**:
```
✅ Pre-merge validation: PASSED
✅ Full backup: COMPLETE (12 accounts, 314 fields each)
✅ Importance fields: DETECTED (161 fields, 33 integration IDs)

You can now proceed with duplicate analysis.
  /dedup analyze {org} {pairs-file}
```

---

### 2. analyze
Analyze duplicate pairs for Type 1/2 errors

```
/dedup analyze {org-alias} {pairs-file} [--config {config-file}]
```

**Example**:
```
/dedup analyze production duplicates.csv
/dedup analyze production duplicates.csv --config instances/production/dedup-config.json
```

**Pairs File Format** (CSV):
```csv
idA,idB
001xx00000ABC123,001xx00000DEF456
001xx00000GHI789,001xx00000JKL012
```

**What It Does**:
1. Checks prerequisites (backup exists)
2. Runs safety analysis (Type 1/2 error detection)
3. Generates decisions: APPROVE, REVIEW, or BLOCK
4. Saves detailed report to `dedup-decisions.json`

**Output**:
```
📊 SUMMARY:
  Total Pairs Analyzed: 150
  ✅ APPROVE: 120 (safe to merge)
  ⚠️  REVIEW: 25 (requires manual approval)
  🛑 BLOCK: 5 (do NOT merge - Type 1/2 error)

  Type 1 Errors Prevented: 3 (different entities)
  Type 2 Errors Prevented: 2 (wrong survivor)

🛑 BLOCKED MERGES:
  Housing Authority of LA ← Housing Authority of SF
  Reason: TYPE_1_INTEGRATION_ID_CONFLICT
  Recovery: Procedure B (Entity Separation)

📄 Full report: dedup-decisions.json

Next Steps:
  1. Review dedup-decisions.json
  2. Execute APPROVE merges only (via Salesforce UI or Cloudingo)
  3. If errors occur, use: /dedup recover {org} {survivor-id} {a|b|c}
```

---

### 3. execute
Execute APPROVE merges using native Salesforce merger with parallel processing

```
/dedup execute {org-alias} {decisions-file} [--workers {n}] [--dry-run] [--max-pairs {n}]
```

**Example**:
```
# Dry run first (recommended)
/dedup execute production dedup-decisions.json --dry-run

# Execute with default 5 workers (recommended)
/dedup execute production dedup-decisions.json

# Conservative start with 3 workers
/dedup execute production dedup-decisions.json --workers 3

# Maximum throughput with 10 workers
/dedup execute production dedup-decisions.json --workers 10

# Process first 50 pairs only
/dedup execute production dedup-decisions.json --max-pairs 50
```

**What It Does**:
1. Loads approved decisions from `dedup-decisions.json`
2. Executes merges using native Salesforce merger (no external tools)
3. Uses parallel processing for 5x faster execution
4. Creates execution log for rollback capability
5. Real-time progress tracking

**Performance**:
- **Serial mode**: ~49.5s per pair (1.2 pairs/min)
- **Parallel mode (5 workers)**: ~10s per pair (6+ pairs/min)
- **100 pairs**: ~16.5 minutes (vs 82.5 min serial)

**Output**:
```
🚀 EXECUTING: 100 pairs in 10 batches (5 workers per batch)
══════════════════════════════════════════════════════════════════════

📦 Batch 1/10 (10 pairs)
   🚀 Processing 10 pairs with 5 parallel workers
✅ [Worker 1] pair_id_1: SUCCESS (9.8s)
✅ [Worker 2] pair_id_2: SUCCESS (10.2s)
   ...
   Batch complete: 10 success, 0 failed

📊 Progress: 10/100 (10%)
   ✅ Success: 10
   ❌ Failed: 0

✅ Execution complete: exec_2025-10-16T12-00-00-000Z
   Total: 100
   Success: 100
   Failed: 0

📄 Execution log: execution-logs/exec_2025-10-16T12-00-00-000Z.json
   Use this log for rollback if needed
```

**Rollback**:
If errors occur, use the execution log to rollback:
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dedup-rollback-system.js --execution-log execution-logs/exec_*.json
```

**Technical Implementation**:
- Uses `bulk-merge-executor-parallel.js` (v3.3.0)
- Worker pool pattern with configurable workers (default: 5)
- Each worker processes merges independently
- CSV bulk update pattern for field changes
- Complete before/after state capture for rollback

**Safety Features**:
- Only executes APPROVE decisions
- Skips REVIEW and BLOCK decisions automatically
- Pre-flight validation before execution
- Execution log for complete rollback
- Recycle bin retention (15 days)

---

### 4. recover
Execute recovery procedure for merge errors

```
/dedup recover {org-alias} {survivor-id} {procedure} [--dry-run] [--auto-approve]
```

**Procedures**:
- **a** = Field Restoration (Type 2 - wrong survivor)
- **b** = Entity Separation (Type 1 - different entities)
- **c** = Quick Undelete (Type 1 - within 15 days)

**Examples**:
```
# Dry run first (recommended)
/dedup recover production 001xx000ABC a --dry-run

# Execute field restoration
/dedup recover production 001xx000ABC a

# Entity separation with interactive contact migration
/dedup recover production 001xx000ABC b

# Quick undelete
/dedup recover production 001xx000ABC c
```

**Procedure A: Field Restoration**
- **When**: Same entity, wrong survivor selected
- **Example**: Prospect absorbed Paying Customer
- **Action**: Restores superior field values from deleted to survivor
- **Time**: 5-10 minutes

**Procedure B: Entity Separation**
- **When**: Different entities were merged
- **Example**: Two different Housing Authorities
- **Action**: Undeletes + semi-automatic contact migration by email domain
- **Time**: 10-30 minutes

**Procedure C: Quick Undelete**
- **When**: Type 1 error within 15 days
- **Example**: Wrong merge yesterday
- **Action**: Quick undelete + manual review guide
- **Time**: 5-10 minutes

---

### 5. help
Show detailed help and examples

```
/dedup help
```

Shows:
- Complete command reference
- Configuration guide
- Common workflows
- Troubleshooting tips

---

## Complete Workflow Example

```
# Step 1: Prepare org
/dedup prepare production

# Step 2: Export duplicate pairs from Cloudingo/DemandTools
# Save as duplicates.csv with idA,idB columns

# Step 3: Analyze pairs
/dedup analyze production duplicates.csv

# Step 4: Review dedup-decisions.json
# Filter for APPROVE decisions only

# Step 5: Execute APPROVE merges (NEW - Parallel Processing)
/dedup execute production dedup-decisions.json --dry-run  # Test first
/dedup execute production dedup-decisions.json            # Real execution

# Step 5 Alternative: Manual execution via Salesforce UI or Cloudingo
# (Use if you prefer external tools)

# Step 6: If error discovered, recover
/dedup recover production 001xx000ABC b
```

---

## Configuration

### Default Configuration
The system works out-of-the-box with sensible defaults for most orgs.

### Custom Configuration
For industry-specific customization, create: `instances/{org}/dedup-config.json`

**Templates Available**:
- **B2G** (Government): Lower domain mismatch threshold, generic entity patterns
- **PropTech**: Property management patterns, location disambiguation
- **SaaS**: Higher domain mismatch threshold, strict integration ID checks

**Example Config**:
```json
{
  "org_alias": "production",
  "industry": "PropTech",
  "guardrails": {
    "domain_mismatch": {
      "threshold": 0.3,
      "severity": "REVIEW"
    },
    "integration_id_conflict": {
      "severity": "BLOCK"
    }
  }
}
```

---

## Decision Types

### ✅ APPROVE
- **Meaning**: Safe to merge, no issues detected
- **Action**: Proceed with merge via Salesforce UI or Cloudingo
- **Confidence**: Typically 90-95%

### ⚠️ REVIEW
- **Meaning**: Potential issues detected, manual approval required
- **Triggers**: Domain mismatch (B2G/PropTech), phone number differences
- **Action**: Review scores and reasoning, approve or reject

### 🛑 BLOCK
- **Meaning**: Type 1 or Type 2 error detected, do NOT merge
- **Triggers**:
  - Type 1: Integration ID conflicts, address mismatches with generic entity names
  - Type 2: Importance field mismatches, data richness gaps, relationship asymmetry
- **Action**: Execute recovery procedure instead of merge

---

## Output Files

All files are automatically organized:

```
.claude-plugins/opspal-core-plugin/packages/domains/salesforce/
├── backups/{org}/{timestamp}/               # Full FIELDS(ALL) backups
├── field-importance-reports/                # Importance analysis
├── validation-reports/                      # Pre-merge validation
├── dedup-decisions.json                     # Analysis results (current)
├── restoration-scripts/                     # Procedure A scripts
├── separation-guides/                       # Procedure B guides
└── quick-guides/                            # Procedure C guides
```

---

## Troubleshooting

### "No backup found"
```
# Run prepare first
/dedup prepare {org}
```

### "Validation failed: Field history tracking limit"
- Review validation report: `validation-reports/validation-Account-*.json`
- Disable history tracking on less critical fields
- Re-run: `/dedup prepare {org}`

### "Too many merges blocked"
- Review `dedup-decisions.json` for patterns
- Create org-specific config with adjusted thresholds
- See: `DEDUP_CONFIG_GUIDE.md`

### "Recovery procedure failed"
- Check script output for specific error
- Verify survivor ID is correct
- For Procedure B/C: Check if record is in recycle bin
- Try with `--dry-run` first to diagnose

---

## Documentation

Comprehensive guides available:

- **DEDUP_QUICKSTART.md** - 5-minute quick start
- **DEDUP_CONFIG_GUIDE.md** - Configuration reference
- **DEDUP_RECOVERY_GUIDE.md** - Recovery playbook
- **DEDUP_IMPLEMENTATION_COMPLETE.md** - Technical details

---

## Safety Features

### Type 1 Error Prevention (Different Entities)
- Integration ID conflict detection
- Address mismatch with generic entity patterns
- Domain mismatch analysis
- **Result**: Prevents merging different companies/entities

### Type 2 Error Prevention (Wrong Survivor)
- Importance field value comparison
- Data completeness analysis
- Relationship count asymmetry
- **Result**: Prevents losing critical data by selecting wrong survivor

### Data-First Survivor Selection
- Relationship score: (contacts + opportunities) × 100
- Integration ID score: 100 per external system ID
- Data completeness score: 50 × completeness ratio
- Recent activity score: 25 - (days_since_modified / 10)
- **Result**: Automatically recommends best survivor based on actual data

---

## Prerequisites

1. Salesforce CLI installed and authenticated
2. Node.js v14+ installed
3. Org access with appropriate permissions
4. For Procedure B/C: Deleted records in recycle bin

---

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review relevant documentation guide
3. Check validation reports for specific error details
4. Include `dedup-decisions.json` when reporting issues

---

**Version**: 1.0.0
**Last Updated**: 2025-10-16
**Maintained By**: RevPal Engineering
