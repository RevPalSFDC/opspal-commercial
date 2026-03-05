# Completion Update Template

**Purpose:** Mark task complete with summary and handoff information

**Target Length:** 60-100 words (max 150 words)

**When to Use:**
- When all work is fully complete
- Before marking task as done in Asana
- When handing off deliverables
- To provide closure and next steps

---

## Template

```markdown
**✅ COMPLETED** - [Task Name]

**Deliverables:**
- [Deliverable 1 with link if applicable]
- [Deliverable 2 with link]

**Results:**
- [Key metric or outcome 1]
- [Key metric or outcome 2]

**Documentation:** [Link to docs/reports]

**Handoff:** [Who needs to take next action, if any]

**Notes:** [Any caveats, follow-up, or important context]
```

---

## Required Elements

✅ **Must Include:**
- List of deliverables (what was created/completed)
- Key results or metrics (outcomes achieved)
- Links to documentation or artifacts
- Handoff information (who's next, if anyone)

⚠️ **Optional But Recommended:**
- Follow-up items or caveats
- Lessons learned
- Performance vs estimates

❌ **Must Exclude:**
- Detailed process explanation
- Self-congratulation
- Unrelated information

---

## Good Examples

### Example 1: Data Migration

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

**Word Count:** 63 words ✅

---

### Example 2: Salesforce Assessment

```markdown
**✅ COMPLETED** - Salesforce CPQ Assessment

**Deliverables:**
- Full assessment report (45 pages): [link]
- Executive summary (2 pages): [link]
- Optimization roadmap: [link]

**Results:**
- $127K annual savings opportunity identified
- 23 quick wins (< 4 hours each)
- 5 major initiatives (2-6 weeks each)

**Documentation:** All findings documented in Confluence

**Handoff:** @executive-sponsor for priority review and approval

**Notes:** Recommend starting with quick wins for fast ROI
```

**Word Count:** 66 words ✅

---

### Example 3: Workflow Automation

```markdown
**✅ COMPLETED** - HubSpot Lead Nurture Workflow

**Deliverables:**
- 3-email nurture sequence (live in production)
- Lead scoring automation (live)
- Re-engagement trigger (live)
- User documentation: [link]

**Results:**
- Test run: 100% email delivery rate
- Workflows activated for 12,500 contacts
- Scoring rules applied retroactively

**Documentation:** Confluence page + in-app help docs

**Handoff:** @marketing-ops for ongoing monitoring

**Notes:** Review performance after 2 weeks - optimize based on engagement data
```

**Word Count:** 73 words ✅

---

## Bad Examples (What NOT to Do)

### ❌ Example 1: Too Vague

```markdown
**COMPLETED** - Finished the migration

Migrated the data. Everything looks good. Ready for next steps.
```

**Problems:**
- No specific deliverables listed
- No results or metrics
- No documentation links
- Unclear who takes next action

---

### ❌ Example 2: Too Verbose

```markdown
I'm pleased to announce that I have successfully completed the HubSpot data migration
project. This was a complex undertaking that required careful planning and execution.
I started by exporting all the data from the legacy CRM system, which took several
hours due to the large dataset. Then I cleaned and validated each record to ensure
data quality. After that, I performed the import into HubSpot using their bulk import
API. The process went very smoothly with only a few minor issues that I was able to
resolve quickly...
```

**Problems:**
- 87 words (too long, rambling)
- Focuses on process not results
- Self-congratulatory tone
- Doesn't clearly list deliverables
- Missing concrete metrics

---

### ❌ Example 3: Missing Handoff

```markdown
**COMPLETED** - Salesforce Assessment

**Deliverables:**
- Assessment report completed

**Results:**
- Found some optimization opportunities
```

**Problems:**
- Too brief, lacks detail
- No specific results or metrics
- No documentation links
- Missing handoff information
- No context about what to do with findings

---

## Formatting Guidelines

### List Deliverables Clearly

```markdown
**Good:**
**Deliverables:**
- 10,200 contacts imported to HubSpot
- 850 companies created
- Migration report: [detailed link]

**Bad:**
**Deliverables:**
- Data migration complete
```

### Quantify Results

```markdown
**Good:**
**Results:**
- 99.8% success rate (20 of 10,200 flagged)
- Average processing time: 2.3 seconds/record
- Zero data loss

**Bad:**
**Results:**
- Migration successful
- Fast processing
- No issues
```

### Provide Clear Handoff

```markdown
**Good:**
**Handoff:** @marketing-ops for UAT - test scenarios in doc section 5

**Bad:**
**Handoff:** Someone should test this
```

---

## Customization by Task Type

### Data Operations

```markdown
**✅ COMPLETED** - Contact Data Cleanup

**Deliverables:**
- 5,200 contacts cleaned
- 127 duplicates merged
- Data quality report: [link]

**Results:**
- Email validity: 98% → 100%
- Phone completeness: 67% → 89%
- 0 constraint violations

**Documentation:** Cleanup log + before/after stats

**Handoff:** @sales-ops - contacts ready for outreach

**Notes:** Recommend quarterly cleanup to maintain quality
```

### Technical Implementation

```markdown
**✅ COMPLETED** - Salesforce API Integration

**Deliverables:**
- REST API endpoint deployed
- Authentication configured
- Monitoring dashboard: [link]

**Results:**
- Response time: < 200ms (target: 500ms)
- 99.9% uptime in 2-week testing
- Zero security vulnerabilities found

**Documentation:** API docs + runbook

**Handoff:** @ops-team for production monitoring

**Notes:** Rate limit set to 1000 req/hour - can increase if needed
```

### Analysis/Assessment

```markdown
**✅ COMPLETED** - HubSpot Workflow Audit

**Deliverables:**
- Workflow analysis report: [link]
- Optimization recommendations: [link]
- Implementation roadmap: [link]

**Results:**
- 47 workflows audited
- 15 optimization opportunities found
- $36K annual savings potential

**Documentation:** Full report + exec summary

**Handoff:** @ops-manager for prioritization and approval

**Notes:** 3 critical issues require immediate attention (flagged in report)
```

---

## Integration with Agents

### For Agent Code

```javascript
const { asanaUpdateFormatter } = require('../scripts/lib/asana-update-formatter');

// Format completion update
const completion = asanaUpdateFormatter.formatCompletion({
  taskName: 'HubSpot Data Migration',
  deliverables: [
    { item: '10,200 contacts imported', link: null },
    { item: '850 companies created and linked', link: null },
    { item: 'Migration report', link: 'https://...' }
  ],
  results: [
    '99.8% success rate (20 records flagged)',
    'All required fields populated',
    'Duplicate check passed'
  ],
  documentation: 'https://confluence.../migration-guide',
  handoff: {
    who: '@marketing-ops',
    action: 'user acceptance testing'
  },
  notes: '20 flagged records need attention (see report tab 3)'
});

// Post to Asana
await asana.add_comment(taskId, { text: completion.text });

// Mark task complete
await asana.update_task(taskId, {
  completed: true,
  custom_fields: {
    status: 'Complete',
    completion_notes: completion.summary
  }
});
```

### Automated Follow-Up Tasks

```javascript
// If handoff creates new work, create follow-up task
if (completion.handoff && completion.handoff.createTask) {
  const followUpTask = await asana.create_task({
    name: `[Follow-up] ${completion.handoff.action}`,
    notes: `
Previous task completed: [${parentTask.name}](${parentTask.permalink_url})

**Action Required:**
${completion.handoff.action}

**Context:**
${completion.notes}

**Resources:**
${completion.documentation}
    `,
    assignee: completion.handoff.who,
    projects: [parentTask.projects[0].gid],
    parent: taskId // Link as subtask
  });

  console.log(`Created follow-up task: ${followUpTask.permalink_url}`);
}
```

---

## Performance Tracking

### Include Performance Metrics

When applicable, include actual vs estimated performance:

```markdown
**✅ COMPLETED** - Salesforce Dashboard Development

**Deliverables:**
- Executive dashboard (live): [link]
- 12 KPI charts configured
- User training doc: [link]

**Results:**
- All 12 KPIs displaying correctly
- Dashboard load time: 1.2s (target: 2s)
- Mobile-responsive (iOS + Android tested)

**Performance:**
- Estimated: 16 hours
- Actual: 14 hours (12.5% under estimate)

**Documentation:** Dashboard guide + data dictionary

**Handoff:** @executive-team for daily use

**Notes:** Refresh rate set to 1 hour - can adjust if needed
```

### ROI Summary

For tasks with measurable ROI:

```markdown
**✅ COMPLETED** - Field Cleanup Initiative

**Deliverables:**
- 52 unused fields archived
- 12 duplicate fields consolidated
- Cleanup report: [link]

**Results:**
- Page load time: 4.2s → 3.1s (26% improvement)
- Field maintenance reduced 15 hours/month
- User confusion complaints: 8/month → 0

**ROI:**
- Implementation: 8 hours
- Annual savings: $18,000 (180 hours/year @ $100/hr)
- Payback period: 2.5 weeks

**Documentation:** Archived fields inventory + reactivation procedure

**Handoff:** None - complete and self-sustaining

**Notes:** Recommend quarterly reviews to catch new unused fields
```

---

## Lessons Learned (Optional)

For complex or novel tasks, include brief lessons:

```markdown
**✅ COMPLETED** - API Integration (Novel Implementation)

**Deliverables:**
- [standard deliverables...]

**Results:**
- [standard results...]

**Lessons Learned:**
- Async processing pattern worked better than synchronous
- Rate limiting at 1000 req/hr sufficient for current load
- Error retry logic prevented 95% of failures

**Recommendations for Next Time:**
- Start with async pattern from beginning
- Add monitoring dashboard in initial build
- Document error codes during development, not after

**Handoff:** @ops-team for monitoring
```

---

## Tips for Agents

1. **Link everything** - Make it easy for people to find your work
2. **Quantify results** - Numbers make impact concrete
3. **Clear handoff** - Remove ambiguity about next steps
4. **Flag caveats** - Don't hide limitations or follow-ups needed
5. **Celebrate wins** - It's OK to highlight good results (briefly)
6. **Close loops** - Completion updates give stakeholders closure
7. **Enable reuse** - Good documentation helps others learn from your work

---

## Related Templates

- **progress-update.md** - Use during work for checkpoints
- **blocker-update.md** - Use when hitting blockers
- **milestone-update.md** - Use for completing major phases
- **Playbook** - See `../docs/ASANA_AGENT_PLAYBOOK.md` for full guidelines

---

**Remember:** Completion updates should give stakeholders confidence that work is truly done, provide them with everything they need to use/act on your work, and clearly communicate any next steps or handoffs. If someone reads your completion update and still has questions about "is it really done?" or "what do I do now?", revise to address those questions upfront.
