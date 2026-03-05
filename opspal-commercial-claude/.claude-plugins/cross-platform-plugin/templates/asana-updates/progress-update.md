# Progress Update Template

**Purpose:** Intermediate progress updates for multi-step work

**Target Length:** 50-75 words (max 100 words)

**When to Use:**
- Every 2-4 hours on active tasks
- After completing a significant sub-step
- When switching focus to different subtask
- At end of day for multi-day work

---

## Template

```markdown
**Progress Update** - [Task Name] - [Date]

**Completed:**
- [Specific accomplishment 1 with metric if relevant]
- [Specific accomplishment 2]

**In Progress:**
- [Current work item with progress if quantifiable]

**Next:**
- [Next 1-2 steps]

**Status:** [On Track / At Risk / Blocked]
```

---

## Required Elements

✅ **Must Include:**
- At least 1 completed item (what was done)
- Current work status (what's happening now)
- Next steps (what's coming)
- Overall status indicator

❌ **Must Exclude:**
- Process details ("I ran a script to...")
- Generic statements ("Making progress...")
- Unnecessary pleasantries
- Information already in task description

---

## Good Examples

### Example 1: Data Migration

```markdown
**Progress Update** - HubSpot Data Migration - 2025-10-25

**Completed:**
- ✅ Exported 10,200 contacts from legacy CRM
- ✅ Cleaned and validated all required fields

**In Progress:**
- Importing batch 1 of 3 (estimated 2 hours remaining)

**Next:**
- Complete import batches 2-3
- Run deduplication check

**Status:** On Track - Delivery by Friday confirmed
```

**Word Count:** 48 words ✅

---

### Example 2: Salesforce Assessment

```markdown
**Progress Update** - CPQ Assessment - 2025-10-25

**Completed:**
- ✅ Quote object analysis (120 fields reviewed)
- ✅ Identified 8 approval workflow bottlenecks

**In Progress:**
- Product catalog audit (50% complete - 125 of 250 products)

**Next:**
- Complete catalog audit
- Generate recommendations report

**Status:** On Track - Delivery Friday 3pm
```

**Word Count:** 45 words ✅

---

### Example 3: Workflow Automation

```markdown
**Progress Update** - Lead Nurture Workflow - 2025-10-25

**Completed:**
- ✅ Email templates designed and approved
- ✅ Workflow logic built in sandbox

**In Progress:**
- Testing with 50 sandbox contacts (passing so far)

**Next:**
- Complete testing
- Request production deployment approval

**Status:** On Track - Ready for approval tomorrow
```

**Word Count:** 41 words ✅

---

## Bad Examples (What NOT to Do)

### ❌ Example 1: Too Verbose

```markdown
Hello! I wanted to provide you with an update on the HubSpot data migration
project. I have been working diligently on this task and I'm happy to report
that I've made good progress. First, I connected to the legacy CRM system using
the API credentials that were provided in the .env file. Then I executed a data
export query which successfully retrieved all 10,200 contact records. After that,
I wrote a script to clean and validate the data...
```

**Problems:**
- 80+ words (way too long)
- Includes unnecessary process details
- Generic pleasantries
- Doesn't clearly state what's next

---

### ❌ Example 2: Too Vague

```markdown
**Update:** Making progress on the data migration. Most of the work is done.
Will finish soon.
```

**Problems:**
- No specific accomplishments
- No metrics or concrete progress
- Vague timeline ("soon")
- Missing next steps

---

### ❌ Example 3: Missing Status

```markdown
**Progress Update** - Assessment

**Completed:**
- Analyzed some fields
- Found some issues

**Next:**
- Continue analysis
```

**Problems:**
- No specifics ("some fields", "some issues")
- No metrics
- Missing overall status
- No clear next steps
- Too brief (lacks actionable detail)

---

## Formatting Guidelines

### Use Checkmarks for Visual Clarity
```markdown
✅ Completed item
✅ Another completed item
```

### Quantify When Possible
```markdown
**Good:** "Analyzed 120 fields across 5 objects"
**Bad:** "Analyzed fields"

**Good:** "50% complete (125 of 250 products reviewed)"
**Bad:** "Making progress on review"
```

### Keep Next Steps Action-Oriented
```markdown
**Good:** "Complete testing, request approval, deploy to production"
**Bad:** "Continue working on this"
```

### Use Clear Status Indicators
- **On Track** - Work proceeding as planned
- **At Risk** - Minor issues, may slip timeline
- **Blocked** - Cannot proceed without external action

---

## Customization by Platform

### HubSpot-Specific

```markdown
**Progress Update** - HubSpot Property Audit - 2025-10-25

**Completed:**
- ✅ Analyzed 847 contact properties
- ✅ Identified 215 unused properties (25%)

**In Progress:**
- Analyzing company properties (200 of 450 done)

**Next:**
- Complete company property analysis
- Generate cleanup recommendations

**Status:** On Track
```

### Salesforce-Specific

```markdown
**Progress Update** - Salesforce Field Cleanup - 2025-10-25

**Completed:**
- ✅ Account object analyzed (350 fields)
- ✅ Found 52 unused fields (15%)

**In Progress:**
- Analyzing Opportunity object (estimated 2 hours)

**Next:**
- Complete Opportunity analysis
- Generate deprecation plan

**Status:** On Track
```

---

## Integration with Agents

### For Agent Code

```javascript
const { asanaUpdateFormatter } = require('../scripts/lib/asana-update-formatter');

// Format progress update
const update = asanaUpdateFormatter.formatProgress({
  taskName: 'Data Migration',
  date: new Date().toISOString().split('T')[0],
  completed: [
    'Exported 10,200 contacts',
    'Cleaned and validated fields'
  ],
  inProgress: 'Importing batch 1 of 3 (2 hours remaining)',
  nextSteps: [
    'Complete batches 2-3',
    'Run deduplication check'
  ],
  status: 'On Track',
  notes: 'Delivery by Friday confirmed'
});

// Post to Asana
await asana.add_comment(taskId, { text: update.text });
```

### Validation

```javascript
// Validate brevity
if (update.wordCount > 100) {
  console.warn(`Update too long: ${update.wordCount} words (max 100)`);
  // Auto-trim or request revision
}

// Validate required elements
const required = ['completed', 'inProgress', 'nextSteps', 'status'];
const missing = required.filter(field => !update[field]);
if (missing.length > 0) {
  throw new Error(`Missing required fields: ${missing.join(', ')}`);
}
```

---

## Tips for Agents

1. **Batch small accomplishments** - Don't post every minor step, group into meaningful progress
2. **Update at natural breakpoints** - End of phase, before switching tasks, end of day
3. **Be consistent with timing** - If working on multi-day task, update daily at same time
4. **Include metrics when possible** - Numbers make progress concrete
5. **Always state next steps** - Keep team informed of upcoming work
6. **Use emojis sparingly** - ✅ for completed items helps with scanning, but don't overdo it

---

## Related Templates

- **blocker-update.md** - Use when you hit a blocker
- **completion-update.md** - Use when task is fully complete
- **milestone-update.md** - Use when completing a major phase
- **Playbook** - See `../docs/ASANA_AGENT_PLAYBOOK.md` for full guidelines

---

**Remember:** Progress updates should help stakeholders understand where things stand WITHOUT having to ask follow-up questions. If your update prompts "how much is done?" or "when will it be finished?", revise to include that information.
