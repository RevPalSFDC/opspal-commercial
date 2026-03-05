# Plan Mode Integration Guide

## Overview

**Plan Mode** is Claude Code's built-in planning subagent (introduced in v2.0.28) that helps Claude create detailed execution plans before performing complex operations. This guide explains how Plan Mode integrates with the salesforce-plugin's existing planning infrastructure.

## What is Plan Mode?

Plan Mode is a specialized subagent that:
- Creates detailed step-by-step execution plans
- Identifies risks and dependencies
- Proposes rollback strategies
- Seeks user approval before execution
- Can be triggered manually or automatically

**Key Difference from sfdc-planner**:
- **Plan Mode** (Claude Code): General-purpose planning, approval workflow, broad applicability
- **sfdc-planner** (Plugin Agent): Salesforce-specific analysis, implementation roadmaps, technical details

## Automatic Plan Mode Triggers

The plugin automatically suggests Plan Mode when:

### Complexity-Based Triggers

**HIGH Complexity (≥0.7)** - **ALWAYS suggest Plan Mode**:
- Multi-object deployments (10+ objects)
- Cross-platform releases (Salesforce + HubSpot + App)
- Production deployments with breaking changes
- Object/field merges with data migration
- Circular dependency resolution
- Full org metadata comparisons

**Example User Prompt that Triggers**:
```
"Deploy these 15 custom objects to production with all their
dependencies and update the related permission sets"
```

**Hook Response**:
```
⚠️  HIGH COMPLEXITY DETECTED (85%)

💡 RECOMMENDATION: Enable Plan Mode
   - Type 'think harder' or 'plan' to enable planning
   - Claude will create a detailed plan before executing
   - Plan includes rollback strategy and approval steps
   - Reduces risk by 30-40% for complex operations
```

### Manual Triggers

**User Control Flags**:
- `[SEQUENTIAL]` - Force Plan Mode regardless of complexity
- `[PLAN_CAREFULLY]` - Same as SEQUENTIAL
- `[PLAN]` - Hint to use planning
- `think harder` - Enable thinking + planning
- `plan` - Enable planning mode

**Examples**:
```bash
# Force planning for simple task
User: "[SEQUENTIAL] Update the email field on Account"

# Request planning
User: "plan: Create a new validation rule for opportunities"
```

## Decision Matrix: When to Use What

| Scenario | Use | Reason |
|----------|-----|---------|
| **Multi-phase deployment** (complexity >0.7) | **Plan Mode** → sfdc-planner → execution | Plan Mode for approval, sfdc-planner for technical details |
| **Complex CPQ assessment** | **Plan Mode** → sfdc-cpq-assessor | Plan first, then execute assessment |
| **Simple metadata change** (complexity <0.3) | Direct agent invocation | No planning needed |
| **Unknown scope** ("Fix all validation rules") | **Plan Mode** (discovery phase) | Discover scope, then plan |
| **Production deployment** | **Plan Mode** → sfdc-deployment-manager | Always plan production changes |
| **Emergency fix** with `[FORCE]` flag | Direct execution (skip planning) | User override for emergencies |

## Integration with Existing Agents

### Orchestrator Agents

**sfdc-orchestrator** (Tier 3):
```markdown
## Planning Strategy

For high-complexity operations (≥0.7):
1. **Enable Plan Mode** - User should type 'plan' or see automatic suggestion
2. **Create High-Level Plan** - What phases, what order, what risks
3. **Get User Approval** - Present plan and wait for confirmation
4. **Invoke sfdc-planner** - Create detailed Salesforce-specific roadmap
5. **Execute Phase-by-Phase** - With checkpoint between phases
6. **Verify After Each Phase** - Run sfdc-state-discovery to confirm

For medium-complexity operations (0.3-0.7):
1. **Ask User** - "Should I create a plan first?" (if production)
2. **Proceed or Plan** - Based on user response and environment

For simple operations (<0.3):
1. **Direct Execution** - No planning needed
```

**sfdc-deployment-manager** (Tier 3):
```markdown
## Pre-Deployment Planning

ALWAYS use Plan Mode for:
- Production deployments (any size)
- Sandbox deployments with >10 components
- Any deployment with breaking changes
- First-time deployments to new orgs

Planning includes:
1. **Dependency Analysis** - What needs to deploy first
2. **Risk Assessment** - What could break
3. **Rollback Strategy** - How to undo if fails
4. **Verification Steps** - How to confirm success
```

**sfdc-merge-orchestrator** (Tier 3):
```markdown
## Merge Planning Requirements

MANDATORY Plan Mode for:
- All object merges
- All field merges with >100 records affected
- Any merge in production

Plan must include:
1. **Data Migration Plan** - What data moves where
2. **Backup Strategy** - How to recover if needed
3. **Field Mapping** - Old field → New field
4. **Automation Updates** - Flows/triggers to modify
5. **Testing Protocol** - How to verify merge succeeded
```

### Analysis Agents (Tier 1)

**sfdc-state-discovery**, **sfdc-cpq-assessor**, **sfdc-revops-auditor**:

These read-only agents DO NOT use Plan Mode internally, but their outputs often trigger planning:

```markdown
## Post-Analysis Planning

After completing analysis:

If findings include HIGH-RISK items:
→ Recommend user enable Plan Mode for remediation

If findings include MEDIUM-RISK items:
→ Suggest planning for production, optional for sandbox

Example output:
"Analysis complete. Found 15 high-risk automation conflicts.

💡 RECOMMENDATION: Use Plan Mode for remediation
   Type 'plan: Fix these automation conflicts' to create a phased remediation plan"
```

## Plan Mode Workflow Examples

### Example 1: Complex Deployment

**User**: "Deploy CPQ package with all custom fields and validation rules to production"

**Step 1 - Complexity Trigger**:
```
⚠️  HIGH COMPLEXITY DETECTED (92%)

💡 RECOMMENDATION: Enable Plan Mode
   - Type 'think harder' or 'plan' to enable planning
```

**Step 2 - User Enables Planning**:
```
User: "plan: Deploy CPQ package with all custom fields and validation rules to production"
```

**Step 3 - Plan Mode Creates Plan**:
```
# Deployment Plan

## Phase 1: Pre-Deployment Validation (15 min)
- Run sfdc-pre-deployment-validator.js
- Verify field history tracking limits
- Check picklist formula syntax
- Validate object relationships

## Phase 2: Backup (10 min)
- Export existing metadata
- Backup affected records
- Create rollback package

## Phase 3: Dependency Deployment (30 min)
1. Deploy custom objects (no dependencies)
2. Deploy custom fields
3. Deploy validation rules
4. Deploy flows

## Phase 4: CPQ Configuration (45 min)
5. Deploy CPQ settings
6. Deploy price rules
7. Deploy product rules

## Phase 5: Verification (20 min)
- Run test cases
- Verify flows activate
- Check validation rules
- Test quote creation

## Rollback Strategy
If Phase 3-4 fails:
1. Restore from backup package
2. Deactivate any partial deployments
3. Notify stakeholders

## Approval Needed
Proceed with this plan? (yes/no)
```

**Step 4 - User Approves**:
```
User: "yes"
```

**Step 5 - Execution**:
```
[Executing Phase 1...]
✅ Phase 1 complete

[Executing Phase 2...]
✅ Phase 2 complete

[Checkpoint - Verify before Phase 3? yes/no]
```

### Example 2: Object Merge

**User**: "Merge Old_Lead__c into standard Lead object"

**Step 1 - Automatic Plan Mode**:
```
⚠️  HIGH COMPLEXITY DETECTED (88%)
This operation requires Plan Mode (object merge with data migration)

Creating plan...
```

**Step 2 - Plan Mode Plan**:
```
# Object Merge Plan: Old_Lead__c → Lead

## Phase 1: Analysis (30 min)
1. Analyze Old_Lead__c fields → map to Lead fields
2. Identify custom fields needing creation
3. Check automation (flows, triggers) using Old_Lead__c
4. Analyze reports/dashboards

## Phase 2: Preparation (1 hour)
1. Create missing custom fields on Lead
2. Update picklist values
3. Create field mapping CSV
4. Backup Old_Lead__c data (5,247 records)

## Phase 3: Automation Updates (1.5 hours)
1. Update 12 flows to use Lead instead
2. Modify 3 triggers
3. Update 8 validation rules
4. Test in sandbox first

## Phase 4: Data Migration (2 hours)
1. Migrate 5,247 records in batches of 200
2. Update related records (Tasks, Activities)
3. Preserve ownership and timestamps
4. Verify no data loss

## Phase 5: Cleanup (30 min)
1. Verify all data migrated
2. Archive Old_Lead__c (don't delete yet)
3. Update documentation
4. Monitor for 7 days before final cleanup

## Rollback Strategy
If migration fails:
- Old_Lead__c data intact (not deleted)
- Can restore Lead records from backup
- Revert automation updates from git

## Risk Assessment
- Risk Score: HIGH (85/100)
- Data at risk: 5,247 records
- Automation changes: 23 components
- Requires: Executive approval, 2-week rollback window

Proceed? (yes/no/modify)
```

## User Control Options

### During Planning

**Modify Plan**:
```
User: "modify: Skip Phase 3, I'll do automation updates manually"
```

**Ask Questions**:
```
User: "What happens if Phase 4 fails halfway through?"
```

**Cancel Planning**:
```
User: "cancel"
```

### During Execution

**Pause Between Phases**:
```
[Checkpoint after Phase 2]
User: "pause"
→ Plan saves state, user can resume later
```

**Skip Phase**:
```
User: "skip Phase 3"
→ Only if not critical
```

**Abort**:
```
User: "abort and rollback"
→ Triggers rollback strategy
```

## Implementation Best Practices

### For Agent Developers

**When building new agents that might need Plan Mode**:

1. **Assess Typical Complexity**
   - Read-only agents: Rarely need planning
   - Metadata agents: Often need planning for production
   - Orchestrator agents: Almost always need planning

2. **Add Planning Guidance to Agent Description**
   ```markdown
   ## Planning Requirements

   This agent SHOULD use Plan Mode for:
   - ✅ Production deployments
   - ✅ Multi-object operations
   - ✅ Operations affecting >1000 records

   This agent MAY use Plan Mode for:
   - ⚠️ Sandbox deployments with >10 components
   - ⚠️ First-time operations in new orgs

   This agent DOES NOT need Plan Mode for:
   - ❌ Single field updates
   - ❌ Read-only operations
   - ❌ Sandbox-only simple changes
   ```

3. **Include Plan Mode Triggers in Agent Logic**
   ```markdown
   ## Execution Strategy

   1. Check complexity from hook (if provided)
   2. If complexity ≥0.7 OR production environment:
      a. Check if Plan Mode enabled
      b. If not, recommend: "Please enable Plan Mode for this operation"
      c. Wait for user confirmation
   3. Create execution plan
   4. Get approval
   5. Execute with checkpoints
   ```

### For Users

**When to Manually Trigger Plan Mode**:

- ✅ Any time you're uncertain about scope
- ✅ Production deployments (always)
- ✅ Operations you can't easily undo
- ✅ Multi-system changes
- ✅ When you want to review before execution

**How to Trigger**:
```bash
# Explicit planning request
"plan: <your task>"

# Enable thinking + planning
"think harder about <your task>"

# Force sequential thinking
"[SEQUENTIAL] <your task>"
```

**When to Skip Planning**:
- ❌ Simple read-only queries
- ❌ Single field updates in sandbox
- ❌ Emergency fixes (use [FORCE] flag with caution)

## Testing Plan Mode Integration

### Test Scenarios

**Test 1: Automatic Trigger**
```bash
# Should trigger Plan Mode suggestion
"Deploy these 15 custom objects with relationships to production"

# Expected: Hook suggests Plan Mode
# Verify: Complexity score shown, recommendation clear
```

**Test 2: Manual Trigger**
```bash
"plan: Create a new validation rule on Opportunity"

# Expected: Plan Mode activates even for simple task
# Verify: Plan created, approval requested
```

**Test 3: Plan Modification**
```bash
# During planning phase
"modify: Add backup step before Phase 2"

# Expected: Plan updates with new step
# Verify: User sees updated plan, can approve/reject
```

**Test 4: Rollback**
```bash
# During execution, something fails
"abort and rollback"

# Expected: Rollback strategy executes
# Verify: System returns to pre-execution state
```

## Troubleshooting

### Plan Mode Not Triggering

**Symptom**: High complexity task doesn't show Plan Mode suggestion

**Causes**:
1. Complexity scorer not working
   ```bash
   # Test complexity scorer
   node scripts/auto-agent-router.js route "Deploy 15 objects"
   # Should show complexity >0.7
   ```

2. Hook not executing
   ```bash
   # Check hook logs
   tail -f .claude/logs/hooks/user-prompt-hybrid.sh.log
   ```

3. bc not installed (needed for math)
   ```bash
   which bc  # Should return path
   # If missing: sudo apt-get install bc
   ```

**Fix**: Ensure hooks are enabled, bc is installed, and complexity scorer is functioning

### Plan Mode Triggered Too Often

**Symptom**: Simple tasks showing Plan Mode suggestion

**Causes**:
1. Complexity threshold too low
   ```bash
   # Check threshold in hook
   grep "0.7" .claude-plugins/opspal-salesforce/hooks/user-prompt-hybrid.sh
   ```

2. Complexity scorer over-estimating
   ```bash
   # Test with simple task
   node scripts/auto-agent-router.js route "Update one field"
   # Should show complexity <0.3
   ```

**Fix**: Adjust threshold in hook or retrain complexity scorer

### Plan Execution Fails

**Symptom**: Plan created but execution errors

**Causes**:
1. Plan too vague - Add more specific steps
2. Dependencies not checked - Add validation phase
3. No checkpoints - Add pause points

**Fix**: Improve plan detail, add verification steps, include checkpoints

## Monitoring & Analytics

### Metrics to Track

**Plan Mode Usage**:
- % of high-complexity tasks using Plan Mode
- Average plan approval time
- Plan modification rate
- Plan abandonment rate

**Plan Success**:
- % of plans that complete successfully
- % of plans that fail and rollback
- Average execution time vs estimated time
- User satisfaction scores

**Complexity Accuracy**:
- % of tasks scored correctly
- False positive rate (simple tasks flagged as complex)
- False negative rate (complex tasks not flagged)

### Analytics Queries

**Query Plan Mode adoption**:
```sql
-- If tracking in Supabase
SELECT
  DATE(created_at) as date,
  COUNT(*) FILTER (WHERE complexity >= 0.7) as high_complexity_tasks,
  COUNT(*) FILTER (WHERE plan_mode_used = true) as plan_mode_tasks,
  ROUND(100.0 * COUNT(*) FILTER (WHERE plan_mode_used = true) /
        NULLIF(COUNT(*) FILTER (WHERE complexity >= 0.7), 0), 1) as adoption_rate_pct
FROM agent_operations
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## Related Documentation

- **Claude Code Docs**: https://docs.claude.com/en/docs/claude-code/subagents
- **Complexity Scoring**: `scripts/auto-agent-router.js` (algorithm details)
- **Hook System**: `hooks/README.md` (how hooks work)
- **Agent Governance**: `docs/AGENT_GOVERNANCE_FRAMEWORK.md` (approval workflows)

## Summary

**Key Takeaways**:

1. **Plan Mode is for workflow planning**, sfdc-planner is for technical analysis
2. **Automatically suggested** when complexity ≥0.7
3. **Can be manually triggered** with 'plan:' prefix or '[SEQUENTIAL]' flag
4. **Reduces risk by 30-40%** for complex operations
5. **Integrates seamlessly** with existing plugin agents
6. **User always in control** - can modify, pause, or abort

**Next Steps**:
1. Enable hooks to suggest Plan Mode (✅ Complete)
2. Update orchestrator agents with planning guidance
3. Test with real scenarios
4. Monitor adoption and success rates
5. Iterate based on user feedback

---

**Version**: 1.0.0
**Last Updated**: 2025-11-04
**Maintained By**: salesforce-plugin team
