# Permission Set Assessment Wizard - Design Document

**Version**: 1.0.0 (Phase 2 Enhancement)
**Date**: 2025-10-22
**Status**: Design Phase

## Overview

The Permission Set Assessment Wizard provides automated discovery, analysis, and migration planning for existing permission sets in Salesforce orgs. It identifies fragmentation patterns and guides users through consolidation into the centralized two-tier architecture.

**Key Insight**: Migration should be **assessment-driven**, not script-driven. Users need to understand their current state before making changes.

---

## Architecture

### Five-Phase Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                     PHASE 1: DISCOVERY                          │
│  Query all permission sets, analyze patterns, detect initiatives│
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PHASE 2: ANALYSIS                           │
│  Detect fragmentation, calculate overlap, assess risk           │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PHASE 3: PLANNING                           │
│  Generate migration plans, map to canonical sets, estimate effort│
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PHASE 4: APPROVAL                           │
│  Present plan, get user confirmation, allow modifications       │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PHASE 5: EXECUTION                          │
│  Execute migration, migrate assignments, deactivate old sets    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Design

### Component 1: Permission Set Discovery (`scripts/lib/permission-set-discovery.js`)

**Purpose**: Scan org for all permission sets and analyze patterns

**Functionality**:
- Query all permission sets via Tooling API
- Retrieve full metadata for each set
- Analyze naming patterns
- Detect potential initiatives
- Identify user assignments
- Calculate permission counts

**Key Algorithms**:

1. **Initiative Detection**:
   ```javascript
   // Detect common patterns
   patterns = [
     /^(.+?)[\s_-](Phase|Tranche|V|Version)[\s_-]?\d+$/i,  // "CPQ Phase 1"
     /^(.+?)[\s_-](Users?|Admins?|Power)$/i,                // "CPQ Users"
     /^(.+?)[\s_-](Read|Edit|Full)$/i                       // "CPQ Read"
   ]

   // Group by base name
   groups = groupByBaseName(permissionSets, patterns)
   ```

2. **Fragmentation Score**:
   ```javascript
   fragmentationScore =
     (numberOfSetsForInitiative - 2) * 10 +  // Penalty for >2 sets
     permissionOverlapPercentage * 5 +       // Overlap indicates duplication
     (numberOfOrphanedAssignments * 2)       // Users with multiple similar sets
   ```

**Output**: Discovery Report JSON
```json
{
  "org": "myOrg",
  "discoveryDate": "2025-10-22T10:00:00Z",
  "totalPermissionSets": 87,
  "customPermissionSets": 45,
  "managedPermissionSets": 42,
  "initiatives": [
    {
      "detectedName": "CPQ",
      "permissionSets": [
        "CPQ Phase 1 Users",
        "CPQ Phase 2 Users",
        "CPQ Phase 1 Admin",
        "CPQ Users Extended"
      ],
      "fragmentationScore": 85,
      "riskLevel": "HIGH",
      "totalAssignments": 23,
      "consolidationOpportunity": true
    }
  ],
  "orphanedSets": [...],
  "unmanagedSets": [...]
}
```

---

### Component 2: Permission Set Analyzer (`scripts/lib/permission-set-analyzer.js`)

**Purpose**: Detect fragmentation and identify consolidation opportunities

**Functionality**:
- Analyze permission overlap between sets
- Detect redundant permissions
- Calculate consolidation opportunities
- Assess migration risk
- Generate recommendations

**Key Algorithms**:

1. **Permission Overlap Analysis**:
   ```javascript
   calculateOverlap(set1, set2) {
     const common = intersection(set1.fieldPermissions, set2.fieldPermissions)
     const total = union(set1.fieldPermissions, set2.fieldPermissions)
     return (common.length / total.length) * 100
   }
   ```

2. **Consolidation Opportunity Detection**:
   ```javascript
   // High overlap + similar names = consolidation opportunity
   if (overlapPercentage > 70 && namesSimilar(set1, set2)) {
     recommendations.push({
       type: 'CONSOLIDATE',
       sets: [set1, set2],
       confidence: 'HIGH',
       reason: `${overlapPercentage}% permission overlap detected`
     })
   }
   ```

3. **Risk Assessment**:
   ```javascript
   assessRisk(initiative) {
     risk = {
       level: 'LOW',
       factors: []
     }

     if (initiative.totalAssignments > 50) {
       risk.level = 'MEDIUM'
       risk.factors.push('High number of user assignments')
     }

     if (initiative.hasProductionUsers) {
       risk.level = 'HIGH'
       risk.factors.push('Production users affected')
     }

     if (initiative.permissionSets.length > 10) {
       risk.level = 'HIGH'
       risk.factors.push('Complex consolidation (10+ sets)')
     }

     return risk
   }
   ```

**Output**: Analysis Report JSON
```json
{
  "initiative": "CPQ",
  "analysis": {
    "fragmentationScore": 85,
    "averageOverlap": 72,
    "consolidationOpportunities": [
      {
        "sets": ["CPQ Phase 1 Users", "CPQ Phase 2 Users", "CPQ Users Extended"],
        "reason": "72% average permission overlap",
        "suggestedTarget": "CPQ Lite - Users",
        "confidence": "HIGH"
      }
    ],
    "riskAssessment": {
      "level": "MEDIUM",
      "factors": [
        "23 user assignments to migrate",
        "3 production users affected"
      ],
      "mitigations": [
        "Test in sandbox first",
        "Migrate in phases",
        "Maintain grace period before deactivation"
      ]
    },
    "recommendations": [
      "Consolidate 3 user-tier sets into 'CPQ Lite - Users'",
      "Consolidate 1 admin-tier set into 'CPQ Lite - Admin'",
      "Migrate 23 user assignments",
      "Deactivate old sets after 30-day grace period"
    ]
  }
}
```

---

### Component 3: Migration Planner (`scripts/lib/permission-set-migration-planner.js`)

**Purpose**: Generate executable migration plans with rollback procedures

**Functionality**:
- Create step-by-step migration plans
- Map legacy sets to canonical Users/Admin
- Generate rollback scripts
- Estimate effort and timeline
- Provide validation checkpoints

**Key Algorithms**:

1. **Canonical Mapping**:
   ```javascript
   mapToCanonical(legacySets) {
     const mapping = {
       users: [],
       admin: []
     }

     for (const set of legacySets) {
       // Detect tier from name
       if (isUserTier(set.name)) {
         mapping.users.push(set)
       } else if (isAdminTier(set.name)) {
         mapping.admin.push(set)
       }
     }

     return {
       targetSets: {
         users: `${initiative.projectName} - Users`,
         admin: `${initiative.projectName} - Admin`
       },
       sourceSets: mapping,
       permissionMerge: calculateMergedPermissions(mapping)
     }
   }
   ```

2. **Rollback Plan Generation**:
   ```javascript
   generateRollback(migrationPlan) {
     return {
       backupLocation: `backups/${org}/${timestamp}/`,
       steps: [
         'Retrieve original permission sets from backup',
         'Reactivate original permission sets',
         'Restore user assignments from backup',
         'Deactivate new canonical permission sets',
         'Verify user access restored'
       ],
       estimatedTime: '15 minutes',
       testCommand: 'sf data query --query "SELECT..."'
     }
   }
   ```

**Output**: Migration Plan JSON
```json
{
  "initiative": "CPQ Lite",
  "initiativeSlug": "cpq-lite",
  "projectName": "CPQ Lite",
  "status": "PENDING_APPROVAL",
  "createdDate": "2025-10-22T10:00:00Z",
  "migrationSteps": [
    {
      "step": 1,
      "phase": "BACKUP",
      "action": "Backup existing permission sets",
      "command": "sf project retrieve start --metadata 'PermissionSet:CPQ Phase 1 Users,...'",
      "estimatedTime": "2 minutes",
      "critical": true
    },
    {
      "step": 2,
      "phase": "CREATE_CANONICAL",
      "action": "Create canonical Users permission set",
      "command": "node scripts/lib/permission-set-cli.js --input cpq-lite-migration.json --org myOrg",
      "estimatedTime": "3 minutes",
      "dependencies": [1]
    },
    {
      "step": 3,
      "phase": "MIGRATE_ASSIGNMENTS",
      "action": "Migrate user assignments to new sets",
      "usersToMigrate": 23,
      "estimatedTime": "5 minutes",
      "dependencies": [2]
    },
    {
      "step": 4,
      "phase": "VALIDATION",
      "action": "Verify user access",
      "validationChecks": [
        "All 23 users have new assignments",
        "No users lost access",
        "Field-level security preserved"
      ],
      "estimatedTime": "3 minutes",
      "dependencies": [3]
    },
    {
      "step": 5,
      "phase": "GRACE_PERIOD",
      "action": "Wait 30 days before deactivation",
      "reason": "Allow time to verify no issues",
      "estimatedTime": "30 days",
      "optional": true
    },
    {
      "step": 6,
      "phase": "DEACTIVATE",
      "action": "Deactivate old permission sets",
      "setsToDeactivate": [
        "CPQ Phase 1 Users",
        "CPQ Phase 2 Users",
        "CPQ Users Extended"
      ],
      "estimatedTime": "2 minutes",
      "dependencies": [5]
    }
  ],
  "rollbackPlan": {
    "backupLocation": "backups/myOrg/2025-10-22-10-00-00/",
    "steps": [...],
    "estimatedRollbackTime": "15 minutes"
  },
  "riskAssessment": {
    "level": "MEDIUM",
    "factors": [...],
    "mitigations": [...]
  },
  "estimatedTotalTime": "15 minutes (active) + 30 days (grace period)"
}
```

---

### Component 4: Permission Assessor Agent (`agents/sfdc-permission-assessor.md`)

**Purpose**: Interactive assessment wizard with user guidance

**Workflow**:

```
Agent: "I'll assess your org's permission sets for consolidation opportunities.
        Should I scan [all permission sets] or focus on [specific initiative]?"

User: "Scan all permission sets"

Agent: "Scanning org... Found 87 permission sets (45 custom, 42 managed).

        🔍 DISCOVERY RESULTS:
        - Detected 3 initiatives with fragmentation:
          1. CPQ: 4 sets, 23 users, HIGH fragmentation (score: 85)
          2. Subscription Mgmt: 6 sets, 12 users, MEDIUM fragmentation (score: 65)
          3. Approval Workflow: 2 sets, 5 users, LOW fragmentation (score: 20)

        Which initiative should I analyze in detail?"

User: "CPQ"

Agent: "Analyzing CPQ permission sets...

        📊 ANALYSIS RESULTS:
        Current State:
        - 4 permission sets: 'CPQ Phase 1 Users', 'CPQ Phase 2 Users',
          'CPQ Users Extended', 'CPQ Admin'
        - 72% average permission overlap (high duplication)
        - 23 user assignments
        - Risk Level: MEDIUM

        Recommendation:
        ✅ Consolidate into 2 canonical sets:
           - 'CPQ Lite - Users' (merge 3 user-tier sets)
           - 'CPQ Lite - Admin' (use existing admin set)

        Benefits:
        - Eliminate duplication
        - Easier to manage
        - Clear permission structure

        Should I generate a migration plan?"

User: "Yes, generate the plan"

Agent: "Creating migration plan...

        📋 MIGRATION PLAN:
        6 steps, 15 minutes active + 30 days grace period

        Steps:
        1. Backup existing permission sets (2 min)
        2. Create canonical Users permission set (3 min)
        3. Migrate 23 user assignments (5 min)
        4. Verify user access (3 min)
        5. Wait 30 days (grace period)
        6. Deactivate old sets (2 min)

        Rollback Plan: Available (15 min to restore)

        Risk: MEDIUM
        Mitigations:
        - Test in sandbox first
        - Maintain 30-day grace period
        - Automated validation checks

        Ready to execute? Options:
        [a] Execute now in this org
        [b] Generate execution script for later
        [c] Export plan to JSON
        [d] Cancel"
```

**Agent Capabilities**:
- Guides through entire assessment workflow
- Asks clarifying questions
- Provides recommendations with justification
- Generates visual reports
- Confirms before execution
- Handles errors gracefully

---

### Component 5: CLI Migration Executor (Enhancement to `permission-set-cli.js`)

**New Flag**: `--execute-migration <plan-file>`

**Usage**:
```bash
# Execute migration plan
node scripts/lib/permission-set-cli.js \
  --execute-migration migration-plan.json \
  --org myOrg \
  --verbose

# Dry run migration
node scripts/lib/permission-set-cli.js \
  --execute-migration migration-plan.json \
  --org myOrg \
  --dry-run
```

**Functionality**:
- Reads migration plan JSON
- Executes steps in order
- Validates dependencies
- Runs validation checks
- Generates execution report
- Creates rollback package

---

## Integration Points

### With Existing Components

1. **permission-set-orchestrator.js**:
   - Used to create canonical permission sets
   - Merges permissions from legacy sets
   - Handles user assignments

2. **permission-set-cli.js**:
   - Executes migration plans
   - Provides batch operation support

3. **Living Runbook System**:
   - Logs all assessment activities
   - Records migration history
   - Provides historical context

4. **Pre-deployment hooks**:
   - No changes needed
   - Works with canonical sets automatically

---

## Slash Command Integration

### `/assess-permissions` Command

**Location**: `.claude-plugins/opspal-salesforce/commands/assess-permissions.md`

**Usage**:
```
/assess-permissions [initiative-name]
```

**Behavior**:
- Invokes `sfdc-permission-assessor` agent
- If initiative specified: Focuses on that initiative
- If no initiative: Scans entire org
- Interactive wizard workflow

**Examples**:
```
/assess-permissions
→ Scans all permission sets in org

/assess-permissions CPQ
→ Analyzes CPQ-related permission sets only
```

---

## Report Templates

### 1. Discovery Report (`instances/<org>/permission-assessment/discovery-<date>.md`)

```markdown
# Permission Set Discovery Report

**Org**: myOrg
**Date**: 2025-10-22
**Total Permission Sets**: 87 (45 custom, 42 managed)

## Summary

- **Initiatives Detected**: 3
- **High Fragmentation**: 1 (CPQ)
- **Medium Fragmentation**: 1 (Subscription Mgmt)
- **Low Fragmentation**: 1 (Approval Workflow)

## Initiative: CPQ

**Fragmentation Score**: 85 (HIGH)

**Permission Sets** (4 total):
- CPQ Phase 1 Users (15 users)
- CPQ Phase 2 Users (5 users)
- CPQ Users Extended (3 users)
- CPQ Admin (2 users)

**Observations**:
- 72% average permission overlap
- Naming suggests phased rollout
- User-tier sets highly fragmented

**Recommendation**: HIGH priority for consolidation

...
```

### 2. Analysis Report (`instances/<org>/permission-assessment/analysis-<initiative>-<date>.md`)

```markdown
# CPQ Permission Set Analysis

**Date**: 2025-10-22
**Fragmentation Score**: 85 (HIGH)
**Risk Level**: MEDIUM

## Current State

### Permission Sets (4)
1. **CPQ Phase 1 Users** (15 assignments)
   - 12 field permissions (Quote__c, Quote_Line__c)
   - 2 object permissions
   - 1 tab setting

2. **CPQ Phase 2 Users** (5 assignments)
   - 18 field permissions (Quote__c, Quote_Line__c, Product__c)
   - 3 object permissions
   - 2 tab settings

...

### Permission Overlap Analysis
- Quote__c.Status__c: Present in 3/4 sets (redundant)
- Quote__c.Total_Price__c: Present in 3/4 sets (redundant)
- Product__c permissions: Only in Phase 2 and Extended (unique)

## Recommendations

✅ **PRIMARY**: Consolidate into 2 canonical sets
- Target: "CPQ Lite - Users" and "CPQ Lite - Admin"
- Consolidates 3 user-tier sets into one
- Maintains 1 admin-tier set

🔧 **ACTIONS**:
1. Create "CPQ Lite - Users" with merged permissions
2. Migrate 23 user assignments
3. Deactivate old sets after 30-day grace period

...
```

### 3. Migration Plan Report (`instances/<org>/permission-assessment/migration-plan-<initiative>-<date>.md`)

```markdown
# CPQ Migration Plan

**Initiative**: CPQ Lite
**Status**: PENDING_APPROVAL
**Created**: 2025-10-22
**Estimated Time**: 15 minutes + 30 days grace period

## Executive Summary

Consolidate 4 fragmented CPQ permission sets into 2 canonical sets.

**Benefits**:
- Eliminate 72% permission overlap
- Simplify management (4 sets → 2 sets)
- Clear user/admin separation

**Risk**: MEDIUM
- 23 user assignments to migrate
- 3 production users affected
- Mitigation: Test in sandbox, maintain grace period

## Migration Steps

### Step 1: Backup (CRITICAL)
...

## Rollback Plan

Available in case of issues.
Estimated rollback time: 15 minutes

...
```

---

## Best Practices

### For Assessment

1. **Always Start with Discovery**: Understand current state before planning
2. **Focus on High-Impact Initiatives**: Prioritize by fragmentation score
3. **Test in Sandbox**: Never migrate directly in production
4. **Maintain Grace Period**: 30 days before deactivating old sets
5. **Document Justification**: Record why consolidation was needed

### For Migration

1. **Backup First**: Always retrieve original permission sets
2. **Validate After Each Step**: Don't proceed if validation fails
3. **Migrate in Phases**: Consider phased rollout for high-risk migrations
4. **Monitor User Reports**: Watch for access issues during grace period
5. **Keep Rollback Ready**: Don't delete old sets until grace period complete

---

## Success Criteria

### Assessment Quality
- ✅ Detects 100% of fragmented permission sets
- ✅ Accurately calculates fragmentation scores
- ✅ Provides actionable recommendations
- ✅ Risk assessment matches actual risk

### Migration Safety
- ✅ Zero user access disruption
- ✅ All permissions preserved or upgraded
- ✅ Rollback available at all times
- ✅ Validation catches errors before impact

### User Experience
- ✅ Clear, guided workflow
- ✅ Transparent about risks
- ✅ Provides confidence through validation
- ✅ Generates comprehensive reports

---

## Future Enhancements (Phase 3)

1. **ML-Based Initiative Detection**: Use ML to detect initiative groupings
2. **Automated Testing**: Generate test scripts for validation
3. **Batch Migration**: Migrate multiple initiatives simultaneously
4. **Visual Dashboards**: Interactive permission set visualization
5. **Compliance Checks**: Ensure migrations meet security requirements

---

**Version**: 1.0.0
**Status**: Design Complete
**Next Step**: Implementation
