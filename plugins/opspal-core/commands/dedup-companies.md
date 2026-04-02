---
name: dedup-companies
description: Execute complete Company/Account deduplication workflow between HubSpot and Salesforce
argument-hint: "[--config <path>] [--output-dir <path>] [--resume <session>]"
---

# Deduplicate Companies Command

Execute the complete Company/Account deduplication workflow between HubSpot and Salesforce.

## Usage

### Interactive Mode (Recommended)
```
/dedup-companies
```
When invoked without arguments, you'll get an interactive menu to configure and execute the workflow.

### Direct Mode
```
/dedup-companies --config {path} --output-dir {path}
```
For automation or when you have a pre-configured setup.

## Interactive Workflow

When you run `/dedup-companies` without arguments, you'll be guided through:

### Step 1: Configuration Setup
Choose how to provide credentials:
- **Use environment variables** - Already configured in shell (~1 min)
- **Create config file** - Generate template and edit (~5 min)
- **Use existing config** - Point to saved configuration file

### Step 2: Execution Options
Configure execution parameters:
- **Output directory** - Where to save reports (default: `./dedup-reports`)
- **Resume session** - Continue from interrupted execution (if applicable)

### Step 3: Pre-Flight Checks
Automatic validation before proceeding:
- API connectivity
- HubSpot auto-associate setting (must be OFF)
- Salesforce authentication

### Step 4: Review & Approval
At key checkpoints, you'll review and approve:
- Duplicate clustering results
- Canonical selection plan
- Dry-run preview
- Final live execution confirmation

---

## Implementation Instructions for Claude

When this command is invoked:

1. **If no arguments provided** → Use `AskUserQuestion` tool to present interactive menu:

   **First Menu - Configuration Setup:**
   ```
   Question: "How would you like to configure the deduplication?"
   Options:
   - "Use environment variables" → Description: "Use existing HUBSPOT_PRIVATE_APP_TOKEN, SALESFORCE_ACCESS_TOKEN from environment (~1 min)"
   - "Create new config file" → Description: "Generate template config file to edit with credentials (~5 min setup)"
   - "Use existing config" → Description: "Point to an existing dedup-config.json file"
   ```

2. **Based on configuration method:**

   **If "Create new config file":**
   - Generate template: `node scripts/lib/dedup-config-loader.js template > dedup-config.json`
   - Show template location
   - Wait for user to edit file
   - Validate config: `node scripts/lib/dedup-config-loader.js validate dedup-config.json`

   **If "Use existing config":**
   - Ask for config file path
   - Validate: `node scripts/lib/dedup-config-loader.js validate {path}`

3. **Present execution options menu:**
   ```
   Question: "Configure execution parameters"
   Options:
   - "Standard execution" → Description: "Save reports to ./dedup-reports, fresh start"
   - "Custom output directory" → Description: "Specify where to save reports and logs"
   - "Resume interrupted session" → Description: "Continue from previous execution using ledger"
   ```

4. **Execute pre-flight checks:**
   - Test HubSpot API connection
   - Test Salesforce connection
   - Verify HubSpot auto-associate is OFF (CRITICAL)
   - Show status summary

5. **Launch agent and monitor checkpoints:**
   - Invoke `sfdc-hubspot-dedup-orchestrator` agent
   - At each approval checkpoint, present summary and ask for confirmation
   - Track progress through phases 0-4

6. **If arguments provided** → Parse and execute directly (backward compatibility)

---

## What This Does

This command launches the `sfdc-hubspot-dedup-orchestrator` agent to execute a comprehensive 5-phase deduplication workflow:

1. **Phase 0: Safety Snapshot** - Create complete backup of current state
2. **Phase 1: Clustering** - Group duplicate companies
3. **Phase 2: Canonical Selection** - Choose which companies to keep
4. **Phase 3: Execution** - Merge duplicates (with approval)
5. **Phase 4: Guardrails** - Prevent future duplicates

## Prerequisites

### Required Configuration

Set these environment variables:
```bash
export HUBSPOT_PRIVATE_APP_TOKEN="your-token"
export HUBSPOT_PORTAL_ID="12345678"
export SALESFORCE_INSTANCE_URL="https://yourorg.my.salesforce.com"
export SALESFORCE_ACCESS_TOKEN="your-token"
export SALESFORCE_ORG_ALIAS="production"
```

OR create a configuration file:
```bash
# Source shared path resolver
RESOLVE_SCRIPT=""
for _candidate in \
  "${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/scripts/resolve-script.sh}" \
  "$HOME/.claude/plugins/cache/opspal-commercial/opspal-core"/*/scripts/resolve-script.sh \
  "$HOME/.claude/plugins/marketplaces"/*/plugins/opspal-core/scripts/resolve-script.sh \
  "$PWD/plugins/opspal-core/scripts/resolve-script.sh" \
  "$PWD/.claude-plugins/opspal-core/scripts/resolve-script.sh"; do
  [ -n "$_candidate" ] && [ -f "$_candidate" ] && RESOLVE_SCRIPT="$_candidate" && break
done
if [ -z "$RESOLVE_SCRIPT" ]; then echo "ERROR: Cannot locate opspal-core resolve-script.sh"; exit 1; fi
source "$RESOLVE_SCRIPT"

# Generate template
CONFIG_LOADER=$(find_script "deduplication/dedup-config-loader.js") && node "$CONFIG_LOADER" template > dedup-config.json

# Edit with your values
vim dedup-config.json
```

### CRITICAL: HubSpot Setting

**BEFORE RUNNING**, disable auto-associate in HubSpot:
1. Go to HubSpot Settings
2. Navigate to Objects → Companies
3. Find "Auto-associate companies"
4. **Turn OFF** (critical for preventing new duplicates)

## Usage

### Basic Usage
```
/dedup-companies
```

The command will prompt you for:
- Configuration file path (optional if using environment variables)
- Confirmation at key checkpoints
- Approval for live execution

### With Configuration File
```
/dedup-companies --config ./dedup-config.json
```

### Advanced Options
```
/dedup-companies --config ./dedup-config.json --output-dir ./my-reports
```

## Workflow

### Step 1: Initial Validation (Automatic)
- Loads configuration
- Verifies API connectivity
- Checks HubSpot auto-associate setting

### Step 2: Phase 0-2 (Automatic with Progress)
- Creates safety snapshot
- Clusters duplicates
- Selects canonical companies
- Generates action plan

### Step 3: Review Checkpoint (REQUIRES USER APPROVAL)
You'll be presented with:
- `canonical-map-actions.csv` - Detailed action plan
- Summary statistics
- Impact assessment

**Review this carefully!** Once approved, execution is irreversible.

### Step 4: Dry Run (Automatic)
- Simulates execution without making changes
- Validates all operations
- Generates preview report

### Step 5: Final Approval (REQUIRES USER CONFIRMATION)
You'll be asked:
```
Ready to execute LIVE. This will:
- Reparent X contacts
- Reparent Y deals
- Delete Z duplicate companies

Proceed with live execution? (yes/no)
```

### Step 6: Live Execution (If Approved)
- Executes deduplication plan
- Tracks progress in real-time
- Uses idempotency ledger for safe retry

### Step 7: Guardrails (Automatic)
- Implements prevention mechanisms
- Creates monitoring queries
- Generates documentation

## Output Files

All files are saved in the output directory (default: `./dedup-reports`):

| File | Description |
|------|-------------|
| `snapshot-{timestamp}.json` | Pre-execution backup |
| `bundles-{timestamp}.json` | Duplicate clusters |
| `canonical-map-{timestamp}.json` | Canonical selections |
| `canonical-map-actions.csv` | **REVIEW THIS FILE** |
| `execution-report-{timestamp}.json` | Execution results |
| `guardrails-report-{timestamp}.json` | Prevention mechanisms |
| `.ledger/dedupe-{timestamp}.json` | Idempotency ledger |

## Safety Features

### Always Safe to Run
✅ Dry-run mode by default
✅ Multiple approval checkpoints
✅ Complete snapshot before changes
✅ Idempotency for safe retry
✅ Rate limiting to respect API limits

### Data Preservation
✅ Non-destructive reparenting before deletion
✅ All associations preserved (Contacts, Deals)
✅ Rollback capability via snapshot
✅ Complete audit trail in ledger

## Error Handling

### If Execution Fails Mid-Way
Don't panic! The system is designed for this:

1. **Check the ledger**:
   ```bash
   LEDGER=$(find_script "deduplication/dedup-ledger.js") && node "$LEDGER" summary <prefix>
   ```

2. **Review what completed**:
   - Ledger shows committed operations
   - Execution report shows progress

3. **Resume safely**:
   - Re-run `/dedup-companies`
   - Ledger ensures already-completed operations are skipped

### Common Issues

**"Auto-associate is still ON"**
- Solution: Turn OFF in HubSpot settings before proceeding

**"API rate limit exceeded"**
- Solution: Wait for rate limit window to reset (automatic)

**"Failed to reparent associations"**
- Solution: Check permissions, verify API token scope

## Success Criteria

After completion, verify:
- [ ] Zero duplicates by SF Account ID
- [ ] Zero duplicates by domain
- [ ] All contacts/deals properly associated
- [ ] Guardrails implemented
- [ ] Exception queries created

## Monitoring

### Weekly
Run exception queries to check for new duplicates:
```bash
# Check for duplicate SF Account IDs
# (Query saved in exception-queries.json)
```

### Monthly
- Verify auto-associate setting (should be OFF)
- Review external_sfdc_account_id workflow
- Audit ledger for any issues

## Examples

### Example 1: First-Time Deduplication
```bash
# 1. Set up configuration
export HUBSPOT_PRIVATE_APP_TOKEN="xxx"
export SALESFORCE_ACCESS_TOKEN="xxx"

# 2. Turn OFF auto-associate in HubSpot

# 3. Run command
/dedup-companies

# 4. Review canonical-map-actions.csv when prompted
# 5. Approve dry-run results
# 6. Confirm live execution
# 7. Monitor progress
```

### Example 2: Resuming Failed Execution
```bash
# If execution failed, check ledger
node scripts/lib/dedup-ledger.js summary dedupe-2025-10-14

# Resume (skips completed operations automatically)
/dedup-companies --resume dedupe-2025-10-14
```

### Example 3: Custom Configuration
```bash
# Create custom config
node scripts/lib/dedup-config-loader.js template > my-config.json

# Edit weights, batch size, etc.
vim my-config.json

# Run with custom config
/dedup-companies --config my-config.json
```

## Troubleshooting

### "No duplicates found"
- Verify snapshot contains expected data
- Check clustering logic in bundles.json

### "Canonical selection seems wrong"
- Review scoring weights in config
- Adjust weights and re-run Phase 2

### "Execution taking too long"
- Check rate limiting settings
- Increase maxWritePerMin in config

### "Some operations failed"
- Review execution-report.json for specific errors
- Check ledger for which operations completed
- Verify API permissions and connectivity

## Support

- **Documentation**: See README.md and IMPLEMENTATION_STATUS.md
- **Scripts**: All scripts have `--help` option
- **Ledger**: `node dedup-ledger.js --help`
- **Configuration**: `node dedup-config-loader.js --help`

## Important Notes

⚠️  **ALWAYS TEST IN SANDBOX FIRST**
⚠️  **REVIEW canonical-map-actions.csv BEFORE APPROVING**
⚠️  **VERIFY auto-associate is OFF**
⚠️  **KEEP snapshots for 30+ days**

Remember: Data safety is paramount. When in doubt, run in dry-run mode and review outputs carefully.
