# Handoff Update Template

**Purpose**: Document work handoff to another agent, team member, or system
**Target Length**: 70-100 words
**When to Use**: When transferring work, ownership, or awaiting external input

---

## Template

```markdown
**→ HANDOFF** - [Task Name]

**Work Completed:**
- [Deliverables produced]
- [Current state/status]

**Handing Off To:**
- [Agent/person/team name] for [specific action needed]

**What They Need:**
- [Context, files, or info provided]

**Awaiting:**
- [Specific deliverable or decision]

**Timeline:** [Expected return or next milestone]

**On Hold Until:** [Blocking dependency clear]
```

---

## Example 1: Agent to Agent Handoff

```markdown
**→ HANDOFF** - Salesforce Permission Set Consolidation

**Work Completed:**
- Permission analysis complete (45 permission sets analyzed)
- Consolidation plan generated (reduce to 12 sets)
- Migration playbook documented

**Handing Off To:**
- sfdc-deployment-manager for execution

**What They Need:**
- Consolidation plan: ./reports/permission-consolidation-plan.json
- Rollback scripts: ./scripts/rollback/
- Testing checklist: ./docs/testing-checklist.md

**Awaiting:**
- Deployment completion confirmation
- Post-deployment validation results

**Timeline:** Estimated 4 hours for deployment

**On Hold Until:** Deployment complete
```

**Word Count**: 85 words ✅

---

## Example 2: Awaiting External Approval

```markdown
**→ HANDOFF** - CPQ Pricing Model Changes

**Work Completed:**
- Current pricing model analyzed
- 3 optimization scenarios modeled with ROI projections
- Executive summary PDF generated

**Handing Off To:**
- Finance team for pricing strategy approval

**What They Need:**
- Executive summary: ./reports/cpq-pricing-analysis.pdf
- ROI scenarios: Scenario A (+$240K), B (+$180K), C (+$320K)
- Decision by: 2025-11-01 (quote generation depends on this)

**Awaiting:**
- Approved pricing scenario selection

**Timeline:** 2 weeks for finance review

**On Hold Until:** Pricing approval received
```

**Word Count**: 87 words ✅

---

## Example 3: System Dependency

```markdown
**→ HANDOFF** - Account Data Migration

**Work Completed:**
- 10,450 accounts validated and ready for migration
- Field mappings verified (100% coverage)
- CSV files generated in staging directory

**Handing Off To:**
- Imports API (async processing)

**What They Need:**
- Imports job ID: 750f000000AbCdE
- Monitoring dashboard: [link]

**Awaiting:**
- Bulk import completion (estimated 2-3 hours)
- Success/failure report

**Timeline:** Check status at 3pm

**On Hold Until:** Import job completes
```

**Word Count**: 76 words ✅

---

## Example 4: Multi-Team Coordination

```markdown
**→ HANDOFF** - HubSpot-Salesforce Sync Configuration

**Work Completed:**
- Field mapping designed (87 fields)
- Sync rules configured
- Test sync successful (100 test records)

**Handing Off To:**
- IT Security for credential provisioning
- RevOps for production approval
- DevOps for monitoring setup

**What They Need:**
- Security: Service account requirements doc
- RevOps: Sync impact assessment
- DevOps: Monitoring dashboard specs

**Awaiting:**
- All three approvals before production enable

**Timeline:** 3-5 business days for approvals

**On Hold Until:** All approvals received
```

**Word Count**: 88 words ✅

---

## Best Practices

1. **Clear State Transfer**: Document exactly what's been completed
2. **Explicit Ownership**: Name the next owner/responsible party
3. **Provide Context**: Give enough info for smooth transition
4. **Set Expectations**: Timeline for when work returns or next milestone
5. **Mark Status**: Use task status or tags to indicate "Awaiting Response"

---

## Anti-Patterns

❌ **Vague Handoff**: "Sent to team for review"
✅ **Specific**: "Handing Off To: Finance team for pricing approval"

❌ **Missing Context**: Just say "handed off" without providing files/info
✅ **Complete Package**: List all deliverables and context provided

❌ **No Timeline**: Leave handoff open-ended
✅ **Expected Return**: "Timeline: 2 weeks for finance review"

❌ **Unclear Blocker**: Ambiguous about what's blocking
✅ **Explicit**: "On Hold Until: Pricing approval received"

---

## When to Use vs Other Templates

| Situation | Use This Template | Not This |
|-----------|------------------|----------|
| Awaiting external input | Handoff | Blocker (external isn't a blocker, it's expected) |
| Transferring ownership | Handoff | Completion (work continues, just different owner) |
| Dependency on approval | Handoff | Pivot (pivot is change of plan, handoff is expected) |
| Multi-team coordination | Handoff | Progress (this is a pause, not ongoing work) |
