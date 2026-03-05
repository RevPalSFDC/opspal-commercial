# Blocker Update Template

**Purpose:** Report issues that halt or significantly slow progress

**Target Length:** 40-60 words (max 80 words)

**When to Use:**
- Immediately when encountering a blocker
- When waiting on external approval/input
- When hitting technical/permission issues
- When dependencies prevent progress

---

## Template

```markdown
**🚨 BLOCKED** - [Task Name]

**Issue:** [Clear one-sentence description of blocker]

**Impact:** [What this blocks and for how long]

**Needs:** [Specific action required from whom]

**Workaround:** [If any alternative path exists, otherwise "None"]

**Timeline:** [When resolution is needed]
```

---

## Required Elements

✅ **Must Include:**
- Clear issue description (what's wrong)
- Impact statement (what's blocked, duration)
- Specific action needed (who must do what)
- Timeline for resolution

❌ **Must Exclude:**
- Blame or finger-pointing
- Technical jargon (unless talking to technical stakeholders)
- Long explanations of how you got blocked
- Uncertain language ("maybe", "I think")

---

## Good Examples

### Example 1: Permission Issue

```markdown
**🚨 BLOCKED** - Salesforce Metadata Deployment

**Issue:** Cannot deploy custom objects - need elevated permissions

**Impact:** Blocks 8 hours of deployment work

**Needs:** @admin grant "Modify All Data" permission

**Workaround:** Can proceed with read-only analysis (60% of work)

**Timeline:** Need permission today to hit Monday go-live
```

**Word Count:** 42 words ✅
**Clarity:** ✅ Clear what's needed from whom
**Urgency:** ✅ Timeline stated

---

### Example 2: Approval Blocker

```markdown
**🚨 BLOCKED** - HubSpot Workflow Deployment

**Issue:** Need approval to activate workflows in production

**Impact:** Blocks production deployment (workflows ready and tested)

**Needs:** @marketing-manager review and approve workflows: [link]

**Workaround:** None - production approval required

**Timeline:** Can deploy within 30 minutes of approval
```

**Word Count:** 40 words ✅

---

### Example 3: Technical Blocker

```markdown
**🚨 BLOCKED** - Data Migration

**Issue:** API integration broken - last 3 weeks of data missing

**Impact:** 4,200 records not synced, dashboard metrics incomplete

**Needs:**
- @admin restart API service
- @data-team backfill missing 3 weeks

**Workaround:** Can migrate pre-gap data (6,800 records)

**Timeline:** Need fix by Friday for complete monthly report
```

**Word Count:** 48 words ✅

---

### Example 4: Dependency Blocker

```markdown
**🚨 BLOCKED** - Dashboard Development

**Issue:** Data model changes from @data-team not deployed yet

**Impact:** Cannot build dashboard charts (depends on new fields)

**Needs:** @data-team complete Salesforce field deployment

**Workaround:** Can design mockup layouts (20% of work)

**Timeline:** Need fields deployed by Wed for Friday delivery
```

**Word Count:** 43 words ✅

---

## Bad Examples (What NOT to Do)

### ❌ Example 1: Too Vague

```markdown
**BLOCKED** - Having issues

**Issue:** Something is wrong with the permissions

**Needs:** Someone to fix it
```

**Problems:**
- Not specific about what's blocked
- Unclear what permission is needed
- Doesn't specify who should act
- No timeline or impact

---

### ❌ Example 2: Too Verbose

```markdown
I wanted to let you know that I've encountered a problem while working on the
Salesforce deployment. I tried to deploy the custom objects that we created, but
I received an error message saying that I don't have sufficient permissions. I
looked into my user profile and I can see that I don't have the "Modify All Data"
permission which I believe is required for this operation. This is blocking my
progress because I cannot proceed with the deployment until this is resolved...
```

**Problems:**
- 83 words (too long - max 80)
- Includes unnecessary backstory
- Process details instead of just the issue
- Impact and timeline buried

---

### ❌ Example 3: Blame-Focused

```markdown
**BLOCKED** - The deployment failed because the admin didn't set up my permissions
correctly. I told them last week I would need access but they didn't follow through.
Now I can't do my work.
```

**Problems:**
- Blames individuals
- Focuses on past instead of solution
- Doesn't clearly state what's needed
- Unprofessional tone

---

### ❌ Example 4: Missing Action

```markdown
**BLOCKED** - Can't deploy to Salesforce

**Issue:** Permission error

**Impact:** Can't continue work
```

**Problems:**
- No specific action requested
- Doesn't say who should act
- No timeline or urgency
- No workaround information

---

## Severity Indicators

Use these to help stakeholders prioritize:

### 🔴 CRITICAL - Use when:
- Production systems affected
- Revenue/customer-facing work blocked
- Tight deadline at risk
- Entire team blocked

```markdown
**🔴 CRITICAL BLOCKER** - Production API Down

**Issue:** Salesforce integration offline - orders not syncing

**Impact:** 200+ orders not processed, customers affected

**Needs:** @ops-team emergency API restart

**Workaround:** Manual order entry (slow, error-prone)

**Timeline:** IMMEDIATE - revenue impact growing
```

### 🟡 STANDARD - Use when:
- Single person blocked
- Reasonable timeline exists
- Workaround available
- Non-production work

```markdown
**🚨 BLOCKED** - Dashboard Development

**Issue:** Waiting on design mockup approval

**Impact:** Cannot proceed with chart development (4 hours blocked)

**Needs:** @design-lead approve mockups: [link]

**Workaround:** Can work on data model in parallel

**Timeline:** Need by Wed for Friday delivery
```

---

## Formatting Guidelines

### Use Clear Structure

Each section should be a single, focused statement:

```markdown
**Issue:** [One sentence, specific problem]
**Impact:** [What's blocked + duration/scope]
**Needs:** [Who + what specific action]
**Workaround:** [Alternative path or "None"]
**Timeline:** [When resolution is needed]
```

### Tag Specific People

Use @mentions to notify the right people:

```markdown
**Needs:** @admin grant elevated permissions
**Needs:** @data-team + @ops-team coordinate API fix
```

### Include Links When Relevant

Help people take action quickly:

```markdown
**Needs:** @manager review workflow for approval: [workflow link]
**Needs:** @admin see error details: [log file link]
```

---

## Customization by Platform

### HubSpot-Specific Blocker

```markdown
**🚨 BLOCKED** - HubSpot Property Migration

**Issue:** Portal API rate limit exceeded (100 req/10sec)

**Impact:** Import paused at 2,500 of 10,000 contacts

**Needs:** Wait 24 hours for rate limit reset OR @admin request limit increase

**Workaround:** Import in smaller batches tomorrow

**Timeline:** Can complete by Friday if proceeding tomorrow
```

### Salesforce-Specific Blocker

```markdown
**🚨 BLOCKED** - APEX Deployment

**Issue:** Test coverage 68% (need 75% minimum for production)

**Impact:** Cannot deploy APEX classes to production

**Needs:** @dev-team add test cases to reach 75% coverage

**Workaround:** Deploy to sandbox for non-prod testing

**Timeline:** Need tests by Fri for Mon production deploy
```

---

## Integration with Agents

### For Agent Code

```javascript
const { asanaUpdateFormatter } = require('../scripts/lib/asana-update-formatter');

// Format blocker update
const blocker = asanaUpdateFormatter.formatBlocker({
  taskName: 'Salesforce Metadata Deployment',
  issue: 'Cannot deploy custom objects - need elevated permissions',
  impact: 'Blocks 8 hours of deployment work',
  needs: {
    who: '@admin',
    action: 'grant "Modify All Data" permission'
  },
  workaround: 'Can proceed with read-only analysis (60% of work)',
  timeline: 'Need permission today to hit Monday go-live',
  severity: 'STANDARD' // or 'CRITICAL'
});

// Post to Asana and tag assignee
await asana.add_comment(taskId, {
  text: blocker.text
});

// Also update task status to "Blocked"
await asana.update_task(taskId, {
  custom_fields: { status: 'Blocked' },
  tags: ['blocked']
});

// Optionally escalate if critical
if (blocker.severity === 'CRITICAL') {
  await notifyUrgent(blocker);
}
```

### Auto-Escalation Logic

```javascript
// Determine severity and escalate appropriately
function determineBlockerSeverity(blocker) {
  const criticalKeywords = [
    'production',
    'customer',
    'revenue',
    'down',
    'offline',
    'critical'
  ];

  const isCritical = criticalKeywords.some(keyword =>
    blocker.issue.toLowerCase().includes(keyword) ||
    blocker.impact.toLowerCase().includes(keyword)
  );

  return isCritical ? 'CRITICAL' : 'STANDARD';
}

// Auto-tag critical blockers
if (severity === 'CRITICAL') {
  await asana.update_task(taskId, {
    tags: ['blocked', 'critical'],
    due_on: getTodayDate() // Make critical blockers due today
  });

  // Send urgent notification
  await notifySlack({
    channel: '#urgent-blockers',
    message: `🔴 CRITICAL BLOCKER: ${blocker.issue}`
  });
}
```

---

## Follow-Up Pattern

### When Blocker is Resolved

Post a brief resolution update:

```markdown
**✅ UNBLOCKED** - Salesforce Metadata Deployment

**Resolution:** @admin granted permissions

**Resuming:** Deployment now in progress (estimated 2 hours)

**Update:** Will post completion summary by EOD
```

**Word Count:** 24 words ✅

---

### If Blocker Worsens

Update the original blocker comment or post new comment:

```markdown
**⚠️  BLOCKER UPDATE** - API Integration

**Status:** Still blocked after 24 hours

**New Impact:** Now 4,800 records missing (was 4,200)

**Escalation:** @director - revenue impact increasing

**Timeline:** URGENT - need resolution today
```

---

## Tips for Agents

1. **Flag blockers immediately** - Don't wait for daily update
2. **Be specific about who can help** - Tag the right person/team
3. **Quantify impact** - Hours blocked, records affected, deadline risk
4. **Offer workaround if possible** - Show you're thinking creatively
5. **State timeline clearly** - When you need resolution
6. **Don't blame** - Focus on solution, not fault
7. **Follow up when resolved** - Close the loop with resolution note

---

## Blocker Prevention

Before starting work, agents should check for potential blockers:

```javascript
async function checkForBlockers(taskId) {
  const task = await asana.get_task(taskId);

  // Check dependencies
  const dependencies = await asana.get_dependencies(taskId);
  if (dependencies.blocked_by.length > 0) {
    console.warn(`Task has ${dependencies.blocked_by.length} blocking dependencies`);
  }

  // Check permissions (Salesforce)
  if (task.tags.includes('salesforce')) {
    const hasPermissions = await checkSalesforcePermissions(requiredPermissions);
    if (!hasPermissions) {
      // Proactively request permissions before starting
      await requestPermissions();
    }
  }

  // Check approvals needed
  if (task.custom_fields.requires_approval && !task.custom_fields.approved) {
    console.warn('Task requires approval before work can begin');
  }
}
```

---

## Related Templates

- **progress-update.md** - Use for regular progress updates
- **completion-update.md** - Use when blocker is resolved and work completes
- **milestone-update.md** - Use when completing phases
- **Playbook** - See `../docs/ASANA_AGENT_PLAYBOOK.md` for full guidelines

---

**Remember:** Blockers should be flagged immediately with enough detail for someone to take action without asking follow-up questions. The goal is to unblock yourself as quickly as possible by providing all necessary context upfront.
