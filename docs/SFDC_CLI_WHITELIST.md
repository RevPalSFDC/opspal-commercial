# Salesforce CLI Command Whitelist Guide

## Overview

This guide documents the whitelisted Salesforce CLI commands that can be executed without user confirmation. These commands are pre-approved because they are **read-only operations** that query data or inspect configuration without making changes to your Salesforce org.

**Related Documentation**:
- General permission whitelist syntax: `docs/PERMISSION_WHITELIST_GUIDE.md`
- Whitelist configuration: `.claude/agent-routing.json` (whitelistedCommands section)

**Last Updated**: 2026-01-07 (Cohort 1 remediation)

---

## Quick Reference

### Pre-Approved Read-Only Commands

These commands are **automatically whitelisted** and will execute without confirmation prompts:

| Command Pattern | Purpose | Example |
|----------------|---------|---------|
| `sf org list` | List authenticated orgs | `sf org list --all` |
| `sf org display` | Display org details | `sf org display --target-org prod` |
| `sf data query` | Execute SOQL queries | `sf data query --query "SELECT Id FROM Account"` |
| `sf sobject describe` | Describe object metadata | `sf sobject describe Account` |
| `sf sobject list` | List all objects | `sf sobject list --sobject all` |
| `sf limits api display` | Show API limits | `sf limits api display --target-org prod` |
| `sf project retrieve start` | Retrieve metadata | `sf project retrieve start --manifest package.xml` |
| `sf schema sobject describe` | Describe object schema | `sf schema sobject describe Account` |
| `sf apex get log` | Retrieve debug log | `sf apex get log --log-id xxx` |
| `sf apex list log` | List debug logs | `sf apex list log --target-org prod` |

### Write Operations Requiring Approval

These commands **require explicit user confirmation** because they modify your Salesforce org:

| Command Pattern | Risk Level | Reason |
|----------------|-----------|--------|
| `sf data create` | 🟡 Medium | Creates records |
| `sf data update` | 🟡 Medium | Modifies records |
| `sf data delete` | 🔴 High | Deletes records (irreversible) |
| `sf project deploy` | 🔴 High | Deploys metadata changes |
| `sf apex run` | 🟡 Medium | Executes arbitrary code |
| `sf data bulk upsert` | 🔴 High | Bulk data operations |
| `sf org delete` | 🔴 Critical | Deletes entire org |

---

## Whitelist Configuration

### Where Whitelisting Happens

Whitelist patterns are defined in `.claude/agent-routing.json` under the `whitelistedCommands` section:

```json
{
  "whitelistedCommands": {
    "salesforce": {
      "description": "Read-only Salesforce CLI commands",
      "patterns": [
        "Bash(sf org list:*)",
        "Bash(sf org display:*)",
        "Bash(sf data query:*)"
      ]
    }
  }
}
```

### Syntax Format

**Pattern Structure**: `Bash(<command-pattern>:*)`

- `Bash()` - Indicates this is a bash command pattern
- `<command-pattern>` - The command prefix to match
- `:*` - Matches any arguments after the command

**Examples**:
```
Bash(sf org list:*)          → Matches: sf org list, sf org list --all
Bash(sf data query:*)        → Matches: sf data query --query "...", sf data query -q "..."
Bash(sf sobject describe:*)  → Matches: sf sobject describe Account, sf sobject describe Contact
```

---

## Command Categories

### 1. Organization Management (Pre-Approved)

**List All Authenticated Orgs**:
```bash
sf org list
sf org list --all
```
**Use Cases**: Check available orgs, verify authentication status

**Display Org Information**:
```bash
sf org display --target-org production
sf org display --target-org dev-sandbox --json
```
**Use Cases**: Get org ID, instance URL, username, API version

**Pattern**: `Bash(sf org list:*)`, `Bash(sf org display:*)`

---

### 2. Data Queries (Pre-Approved)

**Execute SOQL Queries**:
```bash
sf data query --query "SELECT Id, Name FROM Account LIMIT 10"
sf data query --query "SELECT COUNT() FROM Opportunity" --target-org prod
sf data query --query "SELECT Id FROM FlexiPage" --use-tooling-api
```

**Use Cases**:
- Data analysis and reporting
- Metadata discovery
- Validation and verification

**Important Notes**:
- Queries are **read-only** and cannot modify data
- Use `--use-tooling-api` for metadata objects (FlexiPage, ApexClass, etc.)
- Large result sets may timeout (use LIMIT clause)

**Pattern**: `Bash(sf data query:*)`

---

### 3. Metadata Inspection (Pre-Approved)

**Describe Objects**:
```bash
sf sobject describe Account
sf sobject describe Account --json
sf schema sobject describe Contact
```
**Use Cases**: View fields, relationships, validation rules

**List All Objects**:
```bash
sf sobject list --sobject all
sf sobject list --sobject custom
```
**Use Cases**: Discover available objects, inventory custom objects

**Retrieve Metadata**:
```bash
sf project retrieve start --manifest package.xml
sf project retrieve start --metadata ApexClass:MyClass
```
**Use Cases**: Download metadata for analysis, backup local code

**Patterns**:
- `Bash(sf sobject describe:*)`
- `Bash(sf sobject list:*)`
- `Bash(sf schema sobject describe:*)`
- `Bash(sf project retrieve start:*)`

---

### 4. API Limits Monitoring (Pre-Approved)

**Display API Limits**:
```bash
sf limits api display
sf limits api display --target-org production --json
```

**Use Cases**:
- Monitor daily API call usage
- Check data storage limits
- Verify governor limit headroom

**Pattern**: `Bash(sf limits api display:*)`

---

### 5. Debug Log Management (Pre-Approved)

**List Debug Logs**:
```bash
sf apex list log
sf apex list log --target-org dev-sandbox
```

**Retrieve Debug Logs**:
```bash
sf apex get log --log-id 07Lxx00000xxxxx
sf apex get log --number 1
```

**Use Cases**:
- Troubleshoot Apex issues
- Analyze Flow execution
- Review governor limit consumption

**Patterns**:
- `Bash(sf apex list log:*)`
- `Bash(sf apex get log:*)`

---

## Why These Commands Are Safe

### Read-Only by Design

Pre-approved commands are **guaranteed read-only** by the Salesforce CLI design:

1. **Data Queries** (`sf data query`):
   - SOQL is a **read-only query language** (no INSERT, UPDATE, DELETE)
   - Cannot modify records even if query is malicious
   - Worst case: inefficient query that times out

2. **Metadata Inspection** (`sf sobject describe`, `sf schema sobject describe`):
   - Returns metadata definitions only
   - Does not retrieve actual record data
   - Cannot modify org configuration

3. **Org Display** (`sf org list`, `sf org display`):
   - Shows authentication information only
   - No network calls to Salesforce (reads local cache)
   - Cannot affect org state

4. **API Limits** (`sf limits api display`):
   - Returns current usage statistics
   - Read-only monitoring operation
   - No ability to modify limits

5. **Debug Logs** (`sf apex list log`, `sf apex get log`):
   - Downloads existing logs
   - Does not execute code or create logs
   - Read-only file download operation

### What's NOT Safe (Requires Approval)

**Destructive Operations** (never whitelisted):
```bash
# ❌ NOT WHITELISTED - Modifies data
sf data create record --sobject Account --values "Name='Test'"
sf data update record --sobject Account --record-id xxx --values "Name='Changed'"
sf data delete record --sobject Account --record-id xxx
sf data bulk delete --file accounts.csv --sobject Account

# ❌ NOT WHITELISTED - Deploys changes
sf project deploy start --source-dir force-app
sf project deploy validate --source-dir force-app

# ❌ NOT WHITELISTED - Executes code
sf apex run --file script.apex
sf apex run test --class-names MyTestClass
```

---

## Common Scenarios

### Scenario 1: CPQ Assessment

**Goal**: Analyze CPQ configuration without modifying org

**Pre-Approved Commands**:
```bash
# Check Quote object structure
sf sobject describe SBQQ__Quote__c

# Count active price rules
sf data query --query "SELECT COUNT() FROM SBQQ__PriceRule__c WHERE SBQQ__Active__c = true"

# List CPQ custom objects
sf sobject list --sobject all | grep SBQQ

# Check API limit usage
sf limits api display --target-org production
```

**Result**: Full assessment performed with **zero approval prompts**

---

### Scenario 2: RevOps Audit

**Goal**: Analyze pipeline, forecasting, and opportunity management

**Pre-Approved Commands**:
```bash
# Analyze opportunity stages
sf data query --query "SELECT StageName, COUNT(Id) FROM Opportunity GROUP BY StageName"

# Check forecast category usage
sf data query --query "SELECT ForecastCategoryName, COUNT(Id) FROM Opportunity GROUP BY ForecastCategoryName"

# Inspect Opportunity fields
sf sobject describe Opportunity

# Verify API capacity
sf limits api display
```

**Result**: Complete audit with **no user interruptions**

---

### Scenario 3: Automation Discovery

**Goal**: Inventory all automation (Flows, Process Builder, Workflow Rules)

**Pre-Approved Commands**:
```bash
# Count active flows
sf data query --query "SELECT COUNT() FROM FlowDefinitionView WHERE IsActive = true" --use-tooling-api

# List validation rules
sf data query --query "SELECT EntityDefinition.QualifiedApiName, ValidationName FROM ValidationRule" --use-tooling-api

# Check workflow rules
sf data query --query "SELECT COUNT() FROM WorkflowRule WHERE TableEnumOrId = 'Opportunity'" --use-tooling-api

# Retrieve all flows for local analysis
sf project retrieve start --metadata Flow
```

**Result**: Full automation inventory with **zero friction**

---

## Troubleshooting

### Issue 1: "Command not in whitelist"

**Symptom**: Claude prompts for approval on `sf data query`

**Cause**: Whitelist pattern not loaded or incorrect syntax

**Fix**:
1. Verify `.claude/agent-routing.json` contains:
   ```json
   "whitelistedCommands": {
     "salesforce": {
       "patterns": ["Bash(sf data query:*)"]
     }
   }
   ```

2. Restart Claude Code session to reload configuration

3. Check pattern syntax matches exactly (no extra spaces)

---

### Issue 2: "FlexiPage query failed"

**Symptom**: Error when querying metadata objects like FlexiPage, ApexClass

**Cause**: Missing `--use-tooling-api` flag

**Fix**: Add `--use-tooling-api` for metadata objects:
```bash
# ❌ WRONG
sf data query --query "SELECT Id FROM FlexiPage"

# ✅ CORRECT
sf data query --query "SELECT Id FROM FlexiPage" --use-tooling-api
```

**Auto-Correction**: The error prevention system automatically adds this flag

---

### Issue 3: "Query timeout"

**Symptom**: Long-running queries timeout after 2 minutes

**Cause**: Query returns too many records or scans large tables

**Fix**:
1. Add `LIMIT` clause to restrict result size:
   ```bash
   sf data query --query "SELECT Id FROM Account LIMIT 1000"
   ```

2. Use `COUNT()` instead of retrieving all records:
   ```bash
   sf data query --query "SELECT COUNT() FROM Opportunity WHERE StageName = 'Closed Won'"
   ```

3. Filter by date to reduce scan size:
   ```bash
   sf data query --query "SELECT Id FROM Lead WHERE CreatedDate = LAST_N_DAYS:30"
   ```

---

### Issue 4: "Invalid object name"

**Symptom**: Query fails with "sObject type 'XXX' is not supported"

**Cause**: Object doesn't exist in target org (e.g., CPQ not installed)

**Fix**:
1. List available objects first:
   ```bash
   sf sobject list --sobject all | grep SBQQ
   ```

2. Check object existence before querying:
   ```bash
   sf sobject describe SBQQ__Quote__c 2>/dev/null && echo "Exists" || echo "Not found"
   ```

3. Use conditional queries in scripts:
   ```bash
   if sf sobject describe SBQQ__Quote__c &>/dev/null; then
     sf data query --query "SELECT COUNT() FROM SBQQ__Quote__c"
   fi
   ```

---

## Security Considerations

### Why Whitelist Read-Only Commands?

**User Experience**:
- Eliminates repetitive approval prompts during discovery
- Enables smooth CPQ/RevOps assessments (50+ queries per assessment)
- Reduces cognitive load on users

**Security**:
- Read-only commands **cannot modify org state**
- Queries are logged for audit trails
- API limits prevent resource exhaustion
- No risk of accidental data loss

### What About Sensitive Data?

**Data Exposure Risk**: Pre-approved queries can access sensitive data (PII, financial records)

**Mitigations**:
1. **Audit Logging**: All CLI commands are logged in `.claude/logs/`
2. **Org Permissions**: Queries respect field-level security and object permissions
3. **User Context**: Commands run with **user's credentials** (not elevated)
4. **Query Restrictions**: Large exports still require explicit file creation approval

**Best Practice**: Use sandbox orgs for analysis, production for validation only

---

## Extension Points

### Adding Custom Whitelist Patterns

To whitelist additional **read-only** SF CLI commands:

1. **Verify Command is Read-Only**:
   ```bash
   sf <command> --help
   ```
   Check if command description includes "retrieve", "display", "list", "describe" (read-only verbs)

2. **Add Pattern to agent-routing.json**:
   ```json
   {
     "whitelistedCommands": {
       "salesforce": {
         "patterns": [
           "Bash(sf org list:*)",
           "Bash(sf your-new-command:*)"  ← Add here
         ]
       }
     }
   }
   ```

3. **Test Pattern**:
   ```bash
   # Ensure command executes without approval prompt
   sf your-new-command --test-arg value
   ```

4. **Document in This Guide**: Add entry to Quick Reference table

---

## Related Resources

**Official Salesforce CLI Documentation**:
- [Salesforce CLI Command Reference](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/)
- [SOQL Reference](https://developer.salesforce.com/docs/atlas.en-us.soql_sosl.meta/soql_sosl/)
- [Tooling API Guide](https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/)

**Internal Documentation**:
- `docs/PERMISSION_WHITELIST_GUIDE.md` - General whitelist syntax
- `.claude/agent-routing.json` - Whitelist configuration
- `docs/routing-help.md` - Agent routing table

**Related Scripts**:
- `.claude/scripts/lib/env-validator.js` - Environment validation
- `.claude/hooks/pre-execution-env-check.sh` - Pre-execution hook

---

## FAQ

**Q: Can I whitelist `sf data update`?**

A: **No**. Write operations should **never** be whitelisted. They require explicit user confirmation to prevent accidental data modification.

**Q: What about `sf project deploy validate` (test deployment)?**

A: **Validation-only commands are borderline**. Currently **not whitelisted** because they still perform API calls and consume resources. Consider case-by-case for your workflow.

**Q: How do I disable all whitelisting temporarily?**

A: Set environment variable:
```bash
export DISABLE_WHITELIST=1
```
All commands will then prompt for approval.

**Q: Can queries modify data through triggers?**

A: **No**. SOQL queries (`sf data query`) are read-only and do **not** fire triggers, validation rules, or workflow rules. Only DML operations (INSERT, UPDATE, DELETE) fire automation.

**Q: What if a whitelisted command hangs indefinitely?**

A: SF CLI commands have built-in timeouts (default 2 minutes for queries, 10 minutes for metadata operations). Use `Ctrl+C` to cancel if needed.

---

## Change Log

| Date | Change | Reason |
|------|--------|--------|
| 2026-01-07 | Initial whitelist created | Cohort 1 (prompt-mismatch) remediation |
| 2026-01-07 | Added 10 SF CLI read-only commands | Eliminate approval prompts for CPQ/RevOps assessments |

---

**Maintained By**: RevPal Engineering
**Related ADR**: N/A (operational documentation)
**Feedback**: Submit via `/reflect` command

