---
description: Launch interactive permission set assessment wizard to discover fragmentation and plan consolidation
argument-hint: "[initiative-name]"
---

# Permission Set Assessment

Launch the interactive permission set assessment wizard to discover fragmented permission sets, analyze consolidation opportunities, and generate migration plans.

## Usage

```
/assess-permissions [initiative-name]
```

**Arguments**:
- `initiative-name` (optional): Focus on specific initiative (e.g., CPQ, Subscription Mgmt)

**Examples**:
```
/assess-permissions
→ Scans all permission sets in org, interactive wizard

/assess-permissions CPQ
→ Focuses analysis on CPQ-related permission sets

/assess-permissions "Subscription Management"
→ Analyzes subscription management permission sets
```

## What This Command Does

1. **Discovery Phase**:
   - Scans org for all custom permission sets
   - Detects initiative groupings via pattern matching
   - Calculates fragmentation scores (0-100)
   - Prioritizes by risk level (LOW/MEDIUM/HIGH)

2. **Analysis Phase** (if initiative selected):
   - Retrieves full permission metadata
   - Calculates pairwise overlap
   - Identifies consolidation opportunities
   - Assesses migration risks

3. **Planning Phase** (if approved):
   - Generates step-by-step migration plan
   - Creates rollback procedures
   - Defines validation checkpoints
   - Estimates effort and timeline

4. **Report Generation**:
   - Discovery report (markdown)
   - Analysis report (markdown)
   - Migration plan (JSON + markdown)
   - Execution scripts

## Interactive Workflow

The command invokes the `sfdc-permission-assessor` agent, which guides you through:

```
Step 1: Choose scope
→ [a] Scan all permission sets
→ [b] Focus on specific initiative

Step 2: Review discovery
→ Shows all detected initiatives with fragmentation scores
→ Prioritized by risk level

Step 3: Select initiative
→ Choose which initiative to analyze in detail

Step 4: Review analysis
→ Overlap analysis, consolidation opportunities, risk assessment

Step 5: Generate plan
→ Confirms before generating migration plan

Step 6: Choose action
→ [a] Execute now
→ [b] Generate script for later
→ [c] Export plan to JSON
→ [d] Review details
```

## Output Files

All outputs saved to: `instances/<org>/permission-assessment/`

**Generated Files**:
- `discovery-<date>.json` - Discovery data
- `analysis-<initiative>-<date>.json` - Analysis data
- `migration-plan-<initiative>-<date>.json` - Migration plan
- `DISCOVERY_REPORT_<date>.md` - Human-readable discovery report
- `<INITIATIVE>_ANALYSIS_<date>.md` - Human-readable analysis
- `<INITIATIVE>_MIGRATION_PLAN_<date>.md` - Human-readable plan
- `execute-<initiative>-migration.sh` - Execution script
- `rollback-<initiative>-migration.sh` - Rollback script

## Safety Features

- **Non-Destructive**: Assessment phase only reads, never writes
- **Sandbox Testing**: Wizard recommends testing in sandbox first
- **Approval Required**: Always asks before execution
- **Rollback Plan**: Generated for every migration
- **Validation Checks**: Automated post-migration verification
- **Grace Period**: 30-day default before deactivating old sets

## Common Use Cases

### Use Case 1: Org-Wide Assessment
```
/assess-permissions
```
Discovers all fragmented permission sets, shows priority list

### Use Case 2: Initiative-Specific
```
/assess-permissions CPQ
```
Immediate deep dive into CPQ permission sets

### Use Case 3: Report Generation
```
/assess-permissions
[Choose initiative]
[Generate reports]
[Exit without execution]
```
Creates assessment reports for stakeholder review

### Use Case 4: Full Migration
```
/assess-permissions CPQ
[Complete all phases]
[Execute migration]
```
End-to-end: discovery → analysis → planning → execution

## Prerequisites

### Required Permissions
- Read: PermissionSet, FieldPermissions, ObjectPermissions
- Read: PermissionSetAssignment
- (For execution): Create/Edit PermissionSet, PermissionSetAssignment

### Environment Setup
```bash
# Set target org
export SF_ORG=myOrg

# Or specify in command (agent will ask if not set)
```

### Org Requirements
- Must have custom permission sets (managed packages are read-only)
- Recommended: Run in sandbox first
- Recommended: Backup permission sets before migration

## What To Expect

### Duration
- **Discovery**: 2-5 minutes (depends on number of permission sets)
- **Analysis**: 3-10 minutes (depends on complexity)
- **Planning**: 1-2 minutes
- **Execution**: 15-30 minutes + 30-day grace period

### Output Volume
- **Discovery Report**: 2-10 pages
- **Analysis Report**: 5-20 pages
- **Migration Plan**: 3-8 pages
- **Total**: ~500-2,000 lines of detailed documentation

## Tips

1. **Start Broad**: Run without arguments first to see all initiatives
2. **Prioritize**: Focus on HIGH fragmentation (score 70+) first
3. **Review Reports**: Share with stakeholders before execution
4. **Test First**: Always test migration in sandbox
5. **Monitor**: Watch for user access issues during grace period

## Troubleshooting

### No Permission Sets Found
- Check user has read access to PermissionSet object
- Verify org has custom permission sets (not just managed)
- Try with different user or org

### Initiative Not Detected
- Check permission set naming follows patterns:
  - "Initiative Phase X"
  - "Initiative Users/Admin"
  - "Initiative Extended/Basic"
- May be orphaned (not part of any initiative)
- Can still analyze orphaned sets manually

### Migration Fails
- Check rollback script: `rollback-<initiative>-migration.sh`
- Review execution logs
- Verify all prerequisite steps completed
- Contact support with plan ID

## Related Commands

- `/bootstrap` - Initialize project configuration
- `/sfdc-discovery` - General Salesforce discovery (not permission-specific)

## Related Agents

- `sfdc-permission-orchestrator` - Manage individual permission sets
- `sfdc-permission-assessor` - Assessment wizard (invoked by this command)

## Documentation

- **User Guide**: `docs/PERMISSION_SET_USER_GUIDE.md`
- **Design Document**: `docs/PERMISSION_SET_ASSESSMENT_DESIGN.md`
- **Status Tracker**: `docs/PERMISSION_SET_PHASE_2_STATUS.md`

---

**Note**: This command is non-destructive in assessment phases. Migration execution requires explicit approval and confirmation.

**Version**: 1.0.0
**Status**: Production Ready
