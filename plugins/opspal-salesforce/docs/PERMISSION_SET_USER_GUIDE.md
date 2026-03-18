# Permission Set Management - User Guide

**Version**: 1.0.0
**Date**: 2025-10-22
**Status**: Production Ready

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Concepts](#concepts)
- [Common Workflows](#common-workflows)
- [Configuration Format](#configuration-format)
- [CLI Reference](#cli-reference)
- [Agent Usage](#agent-usage)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Examples](#examples)

---

## Overview

The Centralized Permission Set Management system provides:

- **Two-Tier Architecture**: Default Users/Admin permission sets per initiative
- **Merge-Safe Operations**: Accretive union with existing permissions
- **Idempotent Deployments**: Same input twice = zero changes
- **No-Downgrade Policy**: Prevents accidental permission removals
- **Automatic Sync**: Pre-deployment hooks for field+permission bundles

**Key Benefit**: Prevents fragmented, per-tranche permission sets through centralized management.

---

## Quick Start

### 1. Create Configuration File

Create `cpq-permissions.json`:

```json
{
  "initiative_slug": "cpq-lite",
  "project_name": "CPQ Lite",
  "tiers": {
    "users": {
      "field_permissions": [
        {
          "object": "Quote__c",
          "field": "Status__c",
          "readable": true,
          "editable": false
        }
      ],
      "object_permissions": [
        {
          "object": "Quote__c",
          "read": true,
          "create": false,
          "edit": false,
          "delete": false,
          "viewAll": false,
          "modifyAll": false
        }
      ]
    },
    "admin": {
      "field_permissions": [
        {
          "object": "Quote__c",
          "field": "Status__c",
          "readable": true,
          "editable": true
        }
      ],
      "object_permissions": [
        {
          "object": "Quote__c",
          "read": true,
          "create": true,
          "edit": true,
          "delete": true,
          "viewAll": true,
          "modifyAll": true
        }
      ]
    }
  },
  "assign": {
    "users": ["user@example.com"],
    "admin": ["admin@example.com"]
  }
}
```

### 2. Dry Run (Recommended First Step)

```bash
node scripts/lib/permission-set-cli.js \
  --input cpq-permissions.json \
  --org myOrg \
  --dry-run \
  --verbose
```

### 3. Deploy

```bash
node scripts/lib/permission-set-cli.js \
  --input cpq-permissions.json \
  --org myOrg \
  --verbose
```

### 4. Verify

```bash
sf data query \
  --query "SELECT Id, Name FROM PermissionSet WHERE Name LIKE 'CPQ Lite%'" \
  --target-org myOrg
```

**Result**: Two permission sets created:
- `CPQ Lite - Users`
- `CPQ Lite - Admin`

---

## Concepts

### Two-Tier Architecture

**Users Tier**:
- Read-only permissions for end users
- Minimal edit permissions
- Tab visibility
- Record type access

**Admin Tier**:
- Full CRUD permissions
- viewAll and modifyAll flags
- Edit permissions for all fields
- Administrative controls

**Why**: Clear separation of concerns, principle of least privilege, easier auditing

### Merge-Safe Operations

**Accretive Union**:
- Existing permissions + New permissions = Merged permissions
- Upgrades allowed: `readable: false → true` ✅
- Downgrades blocked: `readable: true → false` ❌
- Idempotent: Same input = no changes

**Example**:
```
Existing: readable=true, editable=false
New:      readable=true, editable=true
Result:   readable=true, editable=true (upgraded)
```

### Idempotency

**SHA-256 Change Detection**:
1. Retrieve existing permission set
2. Calculate hash of existing content
3. Merge with new permissions
4. Calculate hash of merged content
5. If hashes match → skip deployment
6. If hashes differ → deploy changes

**Benefit**: Run deployment multiple times safely, only applies deltas

### No-Downgrade Policy

**Blocked Downgrades**:
- Field: `editable: true → false`
- Object: `create: true → false`
- Tab: `Visible → Hidden` (allowed, but unusual)
- Record Type: `visible: true → false`

**Override**: Use `--allow-downgrade` flag (DANGEROUS, requires justification)

---

## Common Workflows

### Workflow 1: Create New Initiative Permissions

**Scenario**: Starting new project, need permissions for Users and Admin

**Steps**:

1. **Create configuration file**:
   ```bash
   mkdir -p instances/myOrg/permissions
   vi instances/myOrg/permissions/cpq-lite-permissions.json
   ```

2. **Define permissions** (see [Configuration Format](#configuration-format))

3. **Dry run**:
   ```bash
   node scripts/lib/permission-set-cli.js \
     --input instances/myOrg/permissions/cpq-lite-permissions.json \
     --org myOrg \
     --dry-run
   ```

4. **Review output**:
   - Permission counts correct?
   - No unexpected warnings?
   - User assignments correct?

5. **Deploy**:
   ```bash
   node scripts/lib/permission-set-cli.js \
     --input instances/myOrg/permissions/cpq-lite-permissions.json \
     --org myOrg
   ```

6. **Verify**:
   ```bash
   # Check permission sets exist
   sf data query --query "SELECT Name FROM PermissionSet WHERE Name LIKE 'CPQ Lite%'" --target-org myOrg

   # Check user assignments
   sf data query --query "SELECT Assignee.Username, PermissionSet.Name FROM PermissionSetAssignment WHERE PermissionSet.Name LIKE 'CPQ Lite%'" --target-org myOrg
   ```

7. **Test as user**:
   - Login as assigned user
   - Verify field visibility
   - Test edit permissions
   - Confirm tab access

### Workflow 2: Add New Fields/Objects

**Scenario**: Initiative exists, adding new custom field

**Steps**:

1. **Update configuration file**:
   ```json
   {
     "tiers": {
       "users": {
         "field_permissions": [
           ... existing fields ...,
           {
             "object": "Quote__c",
             "field": "Discount_Percent__c",
             "readable": true,
             "editable": false
           }
         ]
       }
     }
   }
   ```

2. **Dry run to see delta**:
   ```bash
   node scripts/lib/permission-set-cli.js \
     --input instances/myOrg/permissions/cpq-lite-permissions.json \
     --org myOrg \
     --dry-run
   ```

   **Output**:
   ```
   Added: 1 permission(s)
     - 1 field permission(s)
   ```

3. **Deploy** (only applies new field):
   ```bash
   node scripts/lib/permission-set-cli.js \
     --input instances/myOrg/permissions/cpq-lite-permissions.json \
     --org myOrg
   ```

**Key Insight**: Orchestrator merges with existing, doesn't replace. Only adds new field permission.

### Workflow 3: Modify User Assignments

**Scenario**: Add/remove users from permission sets

**Steps**:

1. **Update `assign` section**:
   ```json
   {
     "assign": {
       "users": [
         "user1@example.com",
         "user2@example.com",
         "user3@example.com"
       ],
       "admin": ["admin@example.com"]
     }
   }
   ```

2. **Deploy**:
   ```bash
   node scripts/lib/permission-set-cli.js \
     --input instances/myOrg/permissions/cpq-lite-permissions.json \
     --org myOrg
   ```

**Note**: Orchestrator adds new assignments, but doesn't remove existing. To remove, use Salesforce UI or manual SOQL delete.

### Workflow 4: Using the Agent

**Scenario**: Prefer natural language over CLI

**Steps**:

1. **Invoke agent**:
   ```
   User: "Configure CPQ Lite permissions with Users and Admin tiers for the Quote object"
   ```

2. **Agent will**:
   - Ask clarifying questions (which fields? which permissions?)
   - Generate configuration file
   - Run dry run
   - Show you the plan
   - Deploy after confirmation

3. **Example conversation**:
   ```
   User: "Set up permissions for CPQ Lite"

   Agent: "I'll help set up CPQ Lite permissions. Let me gather some information:
   - Which objects need permissions? (e.g., Quote__c, Quote_Line__c)
   - Which fields should Users be able to read?
   - Which fields should Admins be able to edit?
   - Which users should be assigned?"

   User: "Quote__c object. Users can read Status__c and Total_Price__c. Admins can edit everything. Assign to sales.user@example.com for Users."

   Agent: "Creating configuration... [generates JSON]
   Running dry run... [shows preview]
   Deploy? (yes/no)"
   ```

---

## Configuration Format

### Complete Example

```json
{
  "initiative_slug": "cpq-lite",
  "project_name": "CPQ Lite",
  "tiers": {
    "users": {
      "field_permissions": [
        {
          "object": "Quote__c",
          "field": "Status__c",
          "readable": true,
          "editable": false
        }
      ],
      "object_permissions": [
        {
          "object": "Quote__c",
          "read": true,
          "create": false,
          "edit": false,
          "delete": false,
          "viewAll": false,
          "modifyAll": false
        }
      ],
      "tab_settings": [
        {
          "tab": "Quote__c",
          "visibility": "Visible"
        }
      ],
      "record_type_vis": [
        {
          "object": "Quote__c",
          "recordType": "Default",
          "visible": true,
          "defaultRecordTypeMapping": true
        }
      ]
    },
    "admin": {
      ... similar structure ...
    }
  },
  "assign": {
    "users": ["user@example.com"],
    "admin": ["admin@example.com"]
  }
}
```

### Field Reference

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `initiative_slug` | Yes | string | Kebab-case identifier (e.g., "cpq-lite") |
| `project_name` | Yes | string | Human-readable name (e.g., "CPQ Lite") |
| `tiers` | Yes | object | Tier definitions (users, admin, custom) |
| `tiers.users` | Recommended | object | Users tier permissions |
| `tiers.admin` | Recommended | object | Admin tier permissions |
| `tiers.<custom>` | Optional | object | Additional custom tiers |
| `assign` | Optional | object | User assignments by tier |

### Field Permissions

```json
{
  "object": "Quote__c",
  "field": "Status__c",
  "readable": true,
  "editable": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `object` | string | Object API name |
| `field` | string | Field API name (without object prefix) |
| `readable` | boolean | User can read field |
| `editable` | boolean | User can edit field |

### Object Permissions

```json
{
  "object": "Quote__c",
  "read": true,
  "create": false,
  "edit": false,
  "delete": false,
  "viewAll": false,
  "modifyAll": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `object` | string | Object API name |
| `read` | boolean | Read records |
| `create` | boolean | Create records |
| `edit` | boolean | Edit records |
| `delete` | boolean | Delete records |
| `viewAll` | boolean | View all records (bypasses sharing) |
| `modifyAll` | boolean | Edit all records (bypasses sharing) |

### Tab Settings

```json
{
  "tab": "Quote__c",
  "visibility": "Visible"
}
```

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `tab` | string | - | Tab name |
| `visibility` | string | `Visible`, `Hidden`, `DefaultOff` | Tab visibility |

### Record Type Visibilities

```json
{
  "object": "Quote__c",
  "recordType": "Enterprise",
  "visible": true,
  "defaultRecordTypeMapping": false
}
```

---

## CLI Reference

### Basic Usage

```bash
node scripts/lib/permission-set-cli.js [OPTIONS]
```

### Options

| Option | Alias | Required | Description |
|--------|-------|----------|-------------|
| `--input <file>` | `-i` | Yes | JSON configuration file |
| `--org <alias>` | `-o` | No* | Salesforce org alias |
| `--dry-run` | - | No | Validation only, no deployment |
| `--verbose` | `-v` | No | Detailed output |
| `--allow-downgrade` | - | No | Allow permission downgrades (DANGEROUS) |
| `--help` | `-h` | No | Show help |

*Falls back to `SF_ORG` or `SF_TARGET_ORG` environment variables

### Exit Codes

- `0`: Success
- `1`: Failure (check error message)

---

## Agent Usage

Invoke the `sfdc-permission-orchestrator` agent for natural language permission management.

**Example Requests**:

- "Set up permissions for CPQ Lite initiative"
- "Add Quote Line object to CPQ Lite Users tier"
- "Assign user@example.com to CPQ Lite Admin"
- "Show me the current CPQ Lite permissions"

**Agent Workflow**:
1. Asks clarifying questions
2. Generates/updates configuration file
3. Runs dry run
4. Shows preview
5. Deploys after confirmation
6. Verifies results

---

## Best Practices

### 1. Version Control Configuration Files

Store in git:
```
instances/
  myOrg/
    permissions/
      cpq-lite-permissions.json
      subscription-mgmt-permissions.json
```

**Benefits**:
- Audit trail
- Code review for permission changes
- Rollback capability
- Documentation

### 2. Always Dry Run First

```bash
# Development
--dry-run --verbose

# Staging
--dry-run

# Production
--dry-run, review carefully, then deploy
```

### 3. Naming Conventions

**Initiative Slug**: `kebab-case`
- ✅ `cpq-lite`
- ❌ `CPQ_Lite`, `cpq lite`

**Project Name**: `Human Readable`
- ✅ `CPQ Lite`
- ✅ `Subscription Management`

### 4. Separate Users and Admin Tiers

**Users**: Least privilege
- Read-only by default
- Minimal edit permissions

**Admin**: Full access
- CRUD for all objects
- Edit for all fields

### 5. Document Justification

Add comments to JSON (not standard, but useful):
```json
{
  "_comment": "Added Discount_Percent__c field per JIRA-123",
  "field_permissions": [...]
}
```

Or maintain separate `CHANGELOG.md` per initiative.

---

## Troubleshooting

### Error: Permission Downgrade Detected

**Symptom**:
```
❌ Permission Downgrade Detected!

The following downgrades would occur:
  - Field Quote__c.Status__c: editable downgraded from true to false
```

**Cause**: Configuration has fewer permissions than existing

**Resolution**:
1. Review diff
2. If intentional: Use `--allow-downgrade` (requires justification)
3. If unintentional: Fix configuration

### Warning: User Not Found

**Symptom**:
```
⚠️  WARNINGS:
  User sales.user@example.com not found in org
```

**Cause**: Username in `assign` section doesn't exist

**Resolution**:
- Verify username spelling
- Check user is active
- Use correct username (may differ from email)

### Error: Invalid JSON

**Symptom**:
```
❌ Error: Invalid JSON in cpq-permissions.json: Unexpected token
```

**Cause**: Syntax error in JSON file

**Resolution**:
- Use JSON validator (jsonlint.com)
- Check for trailing commas
- Verify quotes around strings

### Permission Set Not Found After Deployment

**Cause**: Deployment failed silently

**Resolution**:
1. Check verbose output for errors
2. Verify org authentication
3. Check Salesforce deployment logs
4. Re-run with `--verbose`

---

## Examples

### Example 1: Simple CPQ Permissions

```json
{
  "initiative_slug": "cpq-lite",
  "project_name": "CPQ Lite",
  "tiers": {
    "users": {
      "object_permissions": [
        { "object": "Quote__c", "read": true, "create": false, "edit": false, "delete": false }
      ],
      "field_permissions": [
        { "object": "Quote__c", "field": "Status__c", "readable": true, "editable": false }
      ]
    },
    "admin": {
      "object_permissions": [
        { "object": "Quote__c", "read": true, "create": true, "edit": true, "delete": true }
      ],
      "field_permissions": [
        { "object": "Quote__c", "field": "Status__c", "readable": true, "editable": true }
      ]
    }
  }
}
```

### Example 2: Multi-Object Permissions

```json
{
  "initiative_slug": "subscription-mgmt",
  "project_name": "Subscription Management",
  "tiers": {
    "users": {
      "object_permissions": [
        { "object": "Subscription__c", "read": true, "create": false, "edit": false, "delete": false },
        { "object": "Subscription_Line__c", "read": true, "create": false, "edit": false, "delete": false }
      ],
      "tab_settings": [
        { "tab": "Subscription__c", "visibility": "Visible" }
      ]
    }
  }
}
```

### Example 3: Record Type Specific

```json
{
  "initiative_slug": "sales-automation",
  "project_name": "Sales Automation",
  "tiers": {
    "users": {
      "record_type_vis": [
        { "object": "Opportunity", "recordType": "Standard", "visible": true, "defaultRecordTypeMapping": true },
        { "object": "Opportunity", "recordType": "Enterprise", "visible": false, "defaultRecordTypeMapping": false }
      ]
    },
    "admin": {
      "record_type_vis": [
        { "object": "Opportunity", "recordType": "Standard", "visible": true, "defaultRecordTypeMapping": false },
        { "object": "Opportunity", "recordType": "Enterprise", "visible": true, "defaultRecordTypeMapping": true }
      ]
    }
  }
}
```

---

## Permission Set Assessment Wizard

**Version**: 1.0.0 (Phase 2)
**Added**: v3.33.0

The Permission Set Assessment Wizard helps you discover fragmented permission sets, analyze consolidation opportunities, and plan safe migrations.

### Overview

The assessment wizard provides:
- **Automated Discovery**: Scan entire org for permission set fragmentation
- **Pattern Detection**: Identify initiatives via naming patterns (phased, tiered, versioned)
- **Fragmentation Scoring**: Calculate risk scores (0-100) for each initiative
- **Overlap Analysis**: Detect redundant permissions across sets
- **Migration Planning**: Generate step-by-step consolidation plans with rollback
- **Report Generation**: Create human-readable markdown reports

### Quick Start

#### Option 1: Interactive Wizard (Recommended)

```bash
/assess-permissions
```

The wizard will guide you through:
1. **Discovery**: Scan org for all permission sets
2. **Selection**: Choose initiative to analyze
3. **Analysis**: Review overlap and consolidation opportunities
4. **Planning**: Generate migration plan
5. **Execution**: Execute or export plan

#### Option 2: CLI Tools

```bash
# Step 1: Discovery
node scripts/lib/permission-set-discovery.js \
  --org myOrg \
  --output instances/myOrg/permission-assessment/discovery.json

# Step 2: Analysis (focus on specific initiative)
node scripts/lib/permission-set-analyzer.js \
  --org myOrg \
  --initiative "CPQ" \
  --output instances/myOrg/permission-assessment/analysis-cpq.json

# Step 3: Planning
node scripts/lib/permission-set-migration-planner.js \
  --org myOrg \
  --initiative "CPQ" \
  --output instances/myOrg/permission-assessment/migration-plan-cpq.json

# Step 4: Generate Reports
node scripts/lib/permission-set-report-generator.js all \
  discovery.json \
  analysis-cpq.json \
  migration-plan-cpq.json \
  instances/myOrg/permission-assessment/reports/

# Step 5: Execute (after approval)
node scripts/lib/permission-set-cli.js \
  --execute-migration migration-plan-cpq.json \
  --org myOrg \
  --dry-run  # Test first!
```

### Assessment Workflow

#### Phase 1: Discovery

**Purpose**: Scan org for permission sets and identify fragmentation

**Command**:
```bash
/assess-permissions
# OR
node scripts/lib/permission-set-discovery.js --org myOrg
```

**What It Does**:
1. Queries all custom permission sets from org
2. Detects initiative groupings via pattern matching:
   - Phased: "CPQ Phase 1", "CPQ Phase 2"
   - Tiered: "CPQ Users", "CPQ Admin"
   - Versioned: "CPQ V1", "CPQ V2"
   - Dated: "CPQ 2023", "CPQ 2024"
3. Calculates fragmentation score (0-100):
   - **70-100 = HIGH**: Immediate consolidation recommended
   - **40-69 = MEDIUM**: Plan consolidation within quarter
   - **0-39 = LOW**: Monitor, consolidate when convenient
4. Identifies consolidation opportunities
5. Detects orphaned permission sets

**Output**:
- JSON: `discovery-<date>.json`
- Report (optional): `DISCOVERY_REPORT_<date>.md`

**Sample Output**:
```
📊 RESULTS:
- Total Permission Sets: 87 (45 custom, 42 managed)
- Initiatives Detected: 3

Fragmentation by Priority:
🔴 HIGH (score 70+):
   1. CPQ (4 sets, 23 users, score: 85)

🟡 MEDIUM (score 40-69):
   2. Subscription Management (6 sets, 12 users, score: 65)

🟢 LOW (score <40):
   3. Approval Workflow (2 sets, 5 users, score: 20)

💡 RECOMMENDATION: Focus on CPQ (highest fragmentation)
```

#### Phase 2: Analysis

**Purpose**: Deep analysis of selected initiative

**Command**:
```bash
/assess-permissions CPQ
# OR
node scripts/lib/permission-set-analyzer.js --org myOrg --initiative CPQ
```

**What It Does**:
1. Retrieves full permission metadata for all sets in initiative
2. Calculates pairwise overlap:
   - Field permission overlap (70% weight)
   - Object permission overlap (30% weight)
3. Identifies top overlapping permissions
4. Generates consolidation recommendations with confidence levels:
   - **HIGH**: 70%+ overlap, clear merge opportunity
   - **MEDIUM**: 40-70% overlap, requires review
   - **LOW**: <40% overlap, may not be related
5. Assesses migration risk (0-100):
   - User count impact
   - Production user risk
   - Complexity assessment
6. Estimates effort (active time + grace period)

**Output**:
- JSON: `analysis-<initiative>-<date>.json`
- Report (optional): `<INITIATIVE>_ANALYSIS_<date>.md`

**Sample Output**:
```
📊 CPQ ANALYSIS RESULTS:

CURRENT STATE:
- Permission Sets: 4
  • CPQ Phase 1 Users (15 assignments)
  • CPQ Phase 2 Users (5 assignments)
  • CPQ Users Extended (3 assignments)
  • CPQ Admin (2 assignments)

OVERLAP ANALYSIS:
- CPQ Phase 1 Users ↔ CPQ Phase 2 Users: 78% overlap
- CPQ Phase 1 Users ↔ CPQ Users Extended: 65% overlap

CONSOLIDATION OPPORTUNITIES:
✅ HIGH Confidence: Consolidate 3 user-tier sets
   → Target: "CPQ - Users"
   → Benefit: Eliminate 72% duplication

RISK ASSESSMENT:
- Level: MEDIUM
- Factors:
  • 23 user assignments to migrate
  • 3 production users affected

ESTIMATED EFFORT:
- Active Time: 27 minutes
- Grace Period: 30 days
```

#### Phase 3: Planning

**Purpose**: Generate executable migration plan

**Command**:
```bash
# Wizard prompts for approval
# OR
node scripts/lib/permission-set-migration-planner.js --org myOrg --initiative CPQ
```

**What It Does**:
1. Maps legacy permission sets to canonical Users/Admin
2. Generates 7-step migration plan:
   - **Step 1**: Backup (2 min, CRITICAL)
   - **Step 2**: Create canonical Users set (5 min, CRITICAL)
   - **Step 3**: Create canonical Admin set (5 min, CRITICAL)
   - **Step 4**: Migrate assignments (12 min, CRITICAL, phased if 20+ users)
   - **Step 5**: Validation checks (3 min, CRITICAL)
   - **Step 6**: Grace period (30 days)
   - **Step 7**: Deactivate old sets (4 min)
3. Creates rollback procedures (5 steps, 15-20 min)
4. Defines 5 automated validation checkpoints
5. Assesses risks with mitigations

**Output**:
- JSON: `migration-plan-<initiative>-<date>.json`
- Report (optional): `<INITIATIVE>_MIGRATION_PLAN_<date>.md`
- Execution script: `execute-<initiative>-migration.sh`
- Rollback script: `rollback-<initiative>-migration.sh`

**Sample Output**:
```
📋 CPQ MIGRATION PLAN
Plan ID: plan-1698237600000-a1b2c3d4
Status: PENDING_APPROVAL

TARGET STATE:
- CPQ - Users (consolidates 3 user sets)
- CPQ - Admin (renames existing admin set)

MIGRATION STEPS: (7 steps, 27 minutes + 30 days)

🔴 Step 1: BACKUP (2 min, CRITICAL)
   → Backup existing permission sets

🔴 Step 2: CREATE_CANONICAL (5 min, CRITICAL)
   → Create "CPQ - Users" with merged permissions

[... remaining steps ...]

ROLLBACK PLAN: Available (15-20 min to restore)
```

#### Phase 4: Approval & Options

**Interactive Prompts**:
```
Ready to proceed?
[a] Execute migration now (in this org)
[b] Generate execution script for later
[c] Export plan to JSON
[d] Review plan details
[e] Modify plan (change grace period, etc.)
[f] Cancel
```

#### Phase 5: Execution

**Dry Run (Always Test First)**:
```bash
node scripts/lib/permission-set-cli.js \
  --execute-migration migration-plan-cpq.json \
  --org myOrg \
  --dry-run \
  --verbose
```

**Production Execution**:
```bash
# After successful sandbox testing
node scripts/lib/permission-set-cli.js \
  --execute-migration migration-plan-cpq.json \
  --org myOrg \
  --verbose
```

**What Happens**:
1. Validates prerequisites (backup exists, correct org, sufficient permissions)
2. Executes steps in order with dependency checking
3. Shows progress for each step
4. Pauses for validation after critical steps
5. Handles failures with rollback guidance
6. Generates execution log

**Monitoring**:
```bash
# Check validation
sf data query \
  --query "SELECT Id, Name FROM PermissionSet WHERE Name LIKE 'CPQ -%'" \
  --target-org myOrg

# Verify assignments
sf data query \
  --query "SELECT COUNT() FROM PermissionSetAssignment WHERE PermissionSet.Name LIKE 'CPQ -%'" \
  --target-org myOrg
```

### Report Generation

Generate human-readable markdown reports from JSON outputs:

**Single Report**:
```bash
# Discovery report
node scripts/lib/permission-set-report-generator.js discovery \
  discovery.json \
  DISCOVERY_REPORT.md

# Analysis report
node scripts/lib/permission-set-report-generator.js analysis \
  analysis-cpq.json \
  CPQ_ANALYSIS.md

# Migration plan report
node scripts/lib/permission-set-report-generator.js migration \
  migration-plan-cpq.json \
  CPQ_MIGRATION_PLAN.md
```

**All Reports**:
```bash
node scripts/lib/permission-set-report-generator.js all \
  discovery.json \
  analysis-cpq.json \
  migration-plan-cpq.json \
  ./reports/
```

**Generated Files**:
- `DISCOVERY_REPORT_<date>.md` - Org-wide assessment
- `<INITIATIVE>_ANALYSIS_<date>.md` - Detailed overlap analysis
- `<INITIATIVE>_MIGRATION_PLAN_<date>.md` - Step-by-step migration guide

### Safety Features

#### Non-Destructive Assessment

Discovery and analysis phases are **read-only**:
- Query permission sets and metadata
- Calculate metrics and scores
- Generate recommendations
- **NO changes to org**

#### Approval Required

**No automatic execution** - plans require explicit approval:
- Review plan details
- Get stakeholder sign-off
- Test in sandbox first
- Confirm production execution

#### Rollback Plans

Every migration plan includes:
- **Backup Location**: Path to backed up permission sets
- **5 Rollback Steps**: Restore original state
- **Estimated Time**: 15-20 minutes to rollback
- **Validation**: Verify access restored

**Rollback Example**:
```bash
# If issues occur during migration
bash rollback-cpq-migration.sh --org myOrg

# Verify
node scripts/lib/validate-permission-migration.js --rollback
```

#### Grace Period

**30-day default grace period** before deactivating old sets:
- Keep old permission sets active but unassigned
- Monitor for user access issues
- Allow time for verification
- Quick restore if needed

#### Validation Checks

5 automated validation checks after migration:
1. ✓ Canonical sets exist
2. ✓ All users assigned to canonical sets
3. ✓ No lost object access
4. ✓ Field-level security preserved
5. ✓ Old assignments removed (after grace period)

### Common Use Cases

#### Use Case 1: Org-Wide Assessment

**Scenario**: Discovery phase to understand all permission set fragmentation

```bash
/assess-permissions
```

**Result**:
- Complete inventory of permission sets
- Fragmentation scores for all initiatives
- Prioritized list of consolidation opportunities

**Time**: 2-5 minutes

#### Use Case 2: Initiative-Specific Consolidation

**Scenario**: Consolidate known fragmented initiative (e.g., CPQ)

```bash
/assess-permissions CPQ
```

**Result**:
- Immediate deep dive into CPQ permission sets
- Overlap analysis and consolidation plan
- Ready to execute or export

**Time**: 3-15 minutes

#### Use Case 3: Report Generation for Stakeholders

**Scenario**: Create executive summary for approval

```bash
# Generate all reports
node scripts/lib/permission-set-report-generator.js all \
  discovery.json analysis-cpq.json migration-plan-cpq.json \
  ./reports/

# Share reports/DISCOVERY_REPORT_<date>.md with stakeholders
```

**Result**:
- Professional markdown reports
- Non-technical friendly summaries
- Risk assessment and recommendations

**Time**: 1 minute to generate

#### Use Case 4: Sandbox Testing

**Scenario**: Test migration in sandbox before production

```bash
# In sandbox org
/assess-permissions CPQ

# Execute migration
[Select "Execute migration now"]

# Validate
# Monitor for issues
# Document learnings

# In production (after successful sandbox test)
/assess-permissions CPQ
[Use same configuration as sandbox]
```

**Result**:
- Validated migration approach
- Known issues identified and mitigated
- Confident production execution

**Time**: 1 hour sandbox + 30 minutes production

### Fragmentation Scoring Algorithm

Understanding how fragmentation scores are calculated:

**Components** (Total: 100 points):

1. **Permission Set Count** (40 points):
   - Ideal: 2 sets (Users + Admin) = 0 points
   - Each additional set: +15 points
   - Example: 4 sets = 30 points (2 extra × 15)

2. **Naming Patterns** (20 points):
   - Phased names ("Phase 1", "Tranche 2"): +20 points
   - Indicates incremental rollout fragmentation

3. **User Distribution** (25 points):
   - 1-20 users: 0 points
   - 21-50 users: +15 points
   - 50+ users: +25 points
   - High user count = higher migration complexity

4. **Assignment Patterns** (15 points):
   - Inconsistent assignment distribution: +15 points
   - Example: 15, 5, 3, 2 assignments across 4 sets

**Score Interpretation**:
- **85** (HIGH): 4 sets, phased naming, 23 users → Immediate action
- **65** (MEDIUM): 6 sets, no phases, 12 users → Plan within quarter
- **20** (LOW): 2 sets, standard naming, 5 users → Low priority

### Best Practices

#### Before Assessment

1. **Start with Discovery**:
   - Always run full org scan first
   - Understand complete landscape
   - Identify highest-priority initiatives

2. **Review with Stakeholders**:
   - Share discovery report
   - Get input on initiative priorities
   - Identify business-critical consolidations

#### During Analysis

1. **Focus on High Fragmentation**:
   - Prioritize scores 70+
   - Address clear consolidation opportunities
   - Defer low-score initiatives

2. **Verify Overlap Assumptions**:
   - Review top overlapping permissions
   - Confirm user tier classifications
   - Validate canonical set structure

#### Before Migration

1. **ALWAYS Test in Sandbox**:
   - **Never skip sandbox testing**
   - Execute full migration workflow
   - Validate user access
   - Document any issues

2. **Get Approval**:
   - Security team sign-off
   - Compliance review (if applicable)
   - Stakeholder confirmation
   - User communication plan

3. **Backup Verification**:
   - Confirm backup location exists
   - Verify all 4 permission sets retrieved
   - Test rollback in sandbox

#### During Migration

1. **Monitor Actively**:
   - Watch execution logs
   - Validate after each step
   - Keep rollback plan ready

2. **Phased Approach** (20+ users):
   - Migrate 10 users at a time
   - Validate between batches
   - Pause if issues arise

#### After Migration

1. **Grace Period Monitoring**:
   - Watch for user access issues
   - Run validation checks weekly
   - Keep rollback plan accessible
   - Document any edge cases

2. **Deactivation** (After 30 days):
   - Deactivate old permission sets
   - Keep for additional 30 days
   - Archive migration records
   - Update documentation

### Troubleshooting

#### No Permission Sets Found

**Symptom**: Discovery returns 0 custom permission sets

**Causes**:
- User doesn't have permission to query PermissionSet
- Org has no custom permission sets (unlikely)
- Query failed due to API error

**Solution**:
1. Verify user permissions:
   ```bash
   sf org display user --target-org myOrg
   ```
2. Check object access:
   ```bash
   sf data query --query "SELECT Id FROM PermissionSet LIMIT 1" --target-org myOrg
   ```
3. Try with different user or org

#### Initiative Not Detected

**Symptom**: Known initiative not appearing in discovery

**Causes**:
- Naming doesn't match detection patterns
- Permission sets are orphaned
- Only 1-2 sets (below detection threshold)

**Solution**:
1. Check permission set names in org:
   ```bash
   sf data query --query "SELECT Name FROM PermissionSet WHERE NamespacePrefix = null" --target-org myOrg
   ```
2. Analyze manually:
   ```bash
   node scripts/lib/permission-set-analyzer.js --org myOrg --initiative "Exact Name"
   ```
3. Review detection patterns in discovery script

#### Migration Execution Failed

**Symptom**: Step in migration plan fails

**Example Error**:
```
❌ Migration failed at Step 4: MIGRATE_ASSIGNMENTS
Error: User 'user@example.com' not found in org
```

**Solution**:
1. **Rollback immediately**:
   ```bash
   bash rollback-cpq-migration.sh --org myOrg
   ```
2. **Identify issue**:
   - User no longer in org?
   - User email changed?
   - Permission issue?
3. **Fix and retry**:
   - Update migration plan
   - Correct user assignments
   - Re-execute from backup

#### High Overlap But LOW Confidence

**Symptom**: 80% overlap but only MEDIUM confidence recommendation

**Causes**:
- Different tier classifications (users vs admin)
- Object-level vs field-level differences
- Complex permission structure

**Solution**:
1. Review detailed overlap analysis
2. Check tier assignments
3. Manual review may be needed
4. Consider splitting consolidation

### Advanced Topics

#### Custom Fragmentation Thresholds

Adjust risk level thresholds by modifying discovery script:

```javascript
// In permission-set-discovery.js
const FRAGMENTATION_THRESHOLDS = {
  HIGH: 70,    // Change to 80 for stricter threshold
  MEDIUM: 40,  // Change to 60 for stricter threshold
  LOW: 0
};
```

#### Excluding Managed Packages

Managed package permission sets are automatically excluded from consolidation but included in reports. To hide from reports:

```bash
node scripts/lib/permission-set-discovery.js \
  --org myOrg \
  --exclude-managed
```

#### Custom Grace Period

Default grace period is 30 days. To customize:

```bash
# In migration planner
node scripts/lib/permission-set-migration-planner.js \
  --org myOrg \
  --initiative CPQ \
  --grace-period 60  # 60 days instead of 30
```

#### Batch User Migration

For 50+ users, increase batch size:

```javascript
// In migration plan JSON
{
  "step": 4,
  "phase": "MIGRATE_ASSIGNMENTS",
  "batchSize": 20  // Default is 10
}
```

### Integration with Centralized Strategy

The Assessment Wizard complements the Centralized Permission Set Strategy:

**Phase 1 (Centralized Strategy)**:
- Create new canonical permission sets
- Manage ongoing permission updates
- Enforce two-tier architecture

**Phase 2 (Assessment Wizard)**:
- Discover existing fragmentation
- Plan consolidation of legacy sets
- Migrate to Phase 1 architecture

**Combined Workflow**:
1. **Discovery**: Identify fragmented initiatives
2. **Analysis**: Understand overlap and risks
3. **Planning**: Generate migration to canonical sets
4. **Execution**: Consolidate into centralized architecture
5. **Ongoing**: Use Phase 1 tools for maintenance

**Example**:
```bash
# Step 1: Assess and consolidate existing CPQ permission sets
/assess-permissions CPQ
[Execute migration plan]

# Step 2: Future CPQ permission updates use centralized strategy
node scripts/lib/permission-set-cli.js \
  --input cpq-permissions.json \
  --org myOrg
```

---

## Support

**Documentation**:
- Developer Guide: `docs/PERMISSION_SET_DEVELOPER_GUIDE.md`
- Migration Guide: `docs/PERMISSION_SET_MIGRATION_GUIDE.md`

**Contact**: RevPal Engineering

---

**Version**: 1.0.0
**Last Updated**: 2025-10-22
**Status**: Production Ready
