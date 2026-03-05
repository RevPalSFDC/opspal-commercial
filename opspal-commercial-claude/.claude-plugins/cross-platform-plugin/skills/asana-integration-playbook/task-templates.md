# Task Update Templates

## Progress Update (Checkpoint)

**Use for:** Intermediate progress on multi-step work
**Target length:** 50-75 words

```markdown
**Progress Update** - [Task Name] - [Date]

**Completed:**
- [Specific accomplishment 1]
- [Specific accomplishment 2]

**In Progress:**
- [Current work item]

**Next:**
- [Next 1-2 steps]

**Status:** [On Track / At Risk / Blocked]
```

**Example:**
```markdown
**Progress Update** - CPQ Assessment - 2025-10-25

**Completed:**
- Quote object analysis (120 fields reviewed)
- Identified 8 approval workflow bottlenecks

**In Progress:**
- Product catalog audit (50% complete)

**Next:**
- Complete catalog audit
- Generate recommendations report

**Status:** On Track - Delivery by Friday
```

## Blocker Update

**Use for:** Reporting issues that halt progress
**Target length:** 40-60 words

```markdown
**🚨 BLOCKED** - [Task Name]

**Issue:** [Clear description of blocker]

**Impact:** [What this blocks and for how long]

**Needs:** [Specific action required from whom]

**Workaround:** [If any alternative path exists]

**Timeline:** [When this needs resolution]
```

**Example:**
```markdown
**🚨 BLOCKED** - Salesforce Metadata Deployment

**Issue:** Validation rule conflicts with existing automation

**Impact:** Blocks 12 hours of deployment work

**Needs:** Decision on which validation rules to deactivate
- @admin review conflict list (attached)
- Approve deactivation plan by EOD

**Workaround:** Can proceed with non-conflicting metadata (60% of deployment)

**Timeline:** Need decision today to hit Monday go-live
```

## Completion Update

**Use for:** Marking task complete with handoff info
**Target length:** 60-100 words

```markdown
**✅ COMPLETED** - [Task Name]

**Deliverables:**
- [Deliverable 1 with link]
- [Deliverable 2 with link]

**Results:**
- [Key metric or outcome]
- [Key metric or outcome]

**Documentation:** [Link to docs]

**Handoff:** [Who needs to take next action]

**Notes:** [Any caveats or follow-up needed]
```

**Example:**
```markdown
**✅ COMPLETED** - HubSpot Data Migration

**Deliverables:**
- 10,200 contacts imported to HubSpot
- 850 companies created and linked
- Migration report: [link]

**Results:**
- 99.8% success rate (20 records flagged for manual review)
- All required fields populated
- Duplicate check passed

**Documentation:** Migration guide updated with lessons learned

**Handoff:** @marketing-ops for user acceptance testing

**Notes:** 20 flagged records need attention (see report tab 3)
```

## Milestone Update

**Use for:** Completing a major phase of work
**Target length:** 100-150 words

```markdown
**🎯 MILESTONE COMPLETE** - [Phase Name]

**Phase Summary:**
[1-2 sentence overview of what was accomplished]

**Key Achievements:**
- [Achievement 1 with metrics]
- [Achievement 2 with metrics]
- [Achievement 3 with metrics]

**Phase Stats:**
- Duration: [actual vs estimated]
- Effort: [hours spent]
- Deliverables: [count]

**Next Phase:** [What comes next]

**Risks Identified:** [Any risks for upcoming work]
```

## Decision Required

**Use for:** Requesting stakeholder decisions
**Target length:** 50-80 words

```markdown
**Decision Required:** [Decision topic]

**Options:**
1. [Option A] - [Trade-off]
2. [Option B] - [Trade-off]

**Recommendation:** [Preferred option and why]

**Needs:** @[stakeholder] approval by [date]

**Impact if delayed:** [What gets blocked]
```

## Quantified Findings

**Use for:** Data analysis or audit results

```markdown
**[Audit Type] - Complete**

**Findings:**
- Total [items]: [count]
- [Category 1]: [count] ([percentage])
- [Category 2]: [count] ([percentage])

**Action Plan:**
1. [Action 1] → [Expected outcome]
2. [Action 2] → [Expected outcome]

**ROI:** [Estimated value]
```

**Example:**
```markdown
**HubSpot Property Audit - Complete**

**Findings:**
- Total properties: 847
- Unused (0% populated): 215 (25%)
- Duplicates: 12 field pairs
- Missing descriptions: 392 (46%)

**Action Plan:**
1. Archive 215 unused properties → Saves 3 min/user/day
2. Consolidate 12 duplicate pairs → Eliminates confusion
3. Document 392 properties → Improves discoverability

**ROI:** $18K/year in efficiency gains
```

## Anti-Patterns to Avoid

### ❌ Too Verbose

```
Hello! I have now started working on the data audit as requested. First, I
accessed the Salesforce system using the API credentials provided...
```

### ❌ Missing Data

```
Found some duplicate records that need to be merged. Also found a few fields
that aren't being used. I recommend we clean these up.
```

### ❌ No Next Steps

```
The data migration is going well. I've processed most of the records and things
look good so far. Will continue working on this.
```

### ❌ Buried Important Info

```
I've completed the analysis and found several things. The good news is that most
fields are in good shape, but there is one issue that might be concerning which is
that the API integration appears to be broken and hasn't been syncing data for the
past 3 weeks...
```

### ✅ Correct Pattern

```markdown
**🚨 CRITICAL:** API integration broken - 3 weeks of missing data

**Impact:**
- 4,200 records not synced from external system
- Dashboard metrics incomplete

**Immediate Action Required:**
- @admin - restart API service
- @data-team - backfill missing 3 weeks
```
