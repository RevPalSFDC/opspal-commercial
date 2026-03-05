# Asana Integration - Quick Reference

**For agents that interact with Asana tasks**

## TL;DR

1. **Read tasks** using `asana-task-reader.js` to get full context
2. **Post updates** using `asana-update-formatter.js` to enforce brevity
3. **Follow templates** from `templates/asana-updates/`
4. **Stay under word limits**: Progress (100), Blocker (80), Completion (150)

## When to Post Updates

| Scenario | Update Type | When |
|----------|-------------|------|
| Multi-step work in progress | Progress | Every 2-4 hours or at milestones |
| Hit a blocker | Blocker | Immediately |
| Task complete | Completion | When marking done |
| Phase complete | Milestone | After major phase |

## Update Templates (Copy-Paste)

### Progress Update (< 100 words)

```markdown
**Progress Update** - [Task Name] - [Date]

**Completed:**
- ✅ [Accomplishment with metric]
- ✅ [Another accomplishment]

**In Progress:**
- [Current work with progress %]

**Next:**
- [Next 1-2 steps]

**Status:** [On Track / At Risk / Blocked]
```

### Blocker Update (< 80 words)

```markdown
**🚨 BLOCKED** - [Task Name]

**Issue:** [One-sentence problem]

**Impact:** [What's blocked + duration]

**Needs:** @[person] [specific action]

**Workaround:** [Alternative or "None"]

**Timeline:** [When resolution needed]
```

### Completion Update (< 150 words)

```markdown
**✅ COMPLETED** - [Task Name]

**Deliverables:**
- [Item 1 with link]
- [Item 2 with link]

**Results:**
- [Metric or outcome]
- [Another metric]

**Documentation:** [link]

**Handoff:** @[person] for [action]

**Notes:** [Caveats or follow-up]
```

## Code Snippets

### Read a Task

```javascript
const { AsanaTaskReader } = require('../scripts/lib/asana-task-reader');

const reader = new AsanaTaskReader(process.env.ASANA_ACCESS_TOKEN);
const context = await reader.parseTask(taskId, {
  includeComments: true,
  includeProject: true,
  includeDependencies: true
});

// Use context
console.log(context.fields.priority);
console.log(context.requirements);
console.log(context.projectContext.notes);
```

### Format and Post Update

```javascript
const { AsanaUpdateFormatter } = require('../scripts/lib/asana-update-formatter');

const formatter = new AsanaUpdateFormatter();

// Format progress update
const update = formatter.formatProgress({
  taskName: 'Data Migration',
  completed: ['Exported 10K records', 'Validated fields'],
  inProgress: 'Importing batch 1 of 3',
  nextSteps: ['Complete batches 2-3', 'Run dedup'],
  status: 'On Track'
});

// Validate
if (!update.valid) {
  console.error(`Too long: ${update.wordCount} words (max 100)`);
}

// Post via MCP
await asana.add_comment(taskId, { text: update.text });
```

### Create Roadmap

```javascript
const { AsanaRoadmapManager } = require('../scripts/lib/asana-roadmap-manager');

const manager = new AsanaRoadmapManager(process.env.ASANA_ACCESS_TOKEN);

const roadmap = await manager.createRoadmap({
  parentTaskId: taskId,
  projectId: projectId,
  phases: [
    {
      name: 'Discovery',
      steps: [
        { title: 'Gather requirements', effort: 2 },
        { title: 'Design solution', effort: 4 }
      ]
    }
  ]
});
```

## Word Limits

| Update Type | Target | Max | Template |
|-------------|--------|-----|----------|
| Progress | 50-75 | 100 | progress-update.md |
| Blocker | 40-60 | 80 | blocker-update.md |
| Completion | 60-100 | 150 | completion-update.md |
| Milestone | 100-150 | 200 | milestone-update.md |

## Required Elements

### Progress Update Must Have:
- [ ] **Completed** section
- [ ] **In Progress** section
- [ ] **Next** section
- [ ] **Status** (On Track/At Risk/Blocked)

### Blocker Update Must Have:
- [ ] **Issue** (what's wrong)
- [ ] **Impact** (what's blocked)
- [ ] **Needs** (who + action)
- [ ] **Timeline** (when needed)

### Completion Update Must Have:
- [ ] **Deliverables** (what was created)
- [ ] **Results** (outcomes/metrics)
- [ ] Documentation link (if applicable)
- [ ] Handoff info (who's next)

## Common Mistakes

❌ **Too Verbose**
```
I began by establishing a connection to the Salesforce API using
the credentials stored in the environment variables. Then I executed
a SOQL query to retrieve all Account records...
```

✅ **Just Right**
```
**Completed:** Salesforce data quality audit
- Analyzed 10,000 Accounts
- Identified 15% with missing critical fields
- Report: [link]
```

❌ **Too Vague**
```
Found some duplicates. Will fix soon.
```

✅ **Specific**
```
**Duplicates:** 127 found (1.3% of database)
- Action: Merge using email as key
- ETA: 2 hours
```

❌ **Missing Next Steps**
```
Migration going well. Processed most records.
```

✅ **Clear Next Steps**
```
**Progress:** 75% complete (7,500 of 10,000 records)
**Next:** Import remaining 2,500 (est. 2 hours)
**Completion:** Tomorrow 2pm
```

## Platform-Specific Tips

### For Salesforce

**Include**:
- Object names (Account, Contact, Opportunity)
- Field counts (analyzed 287 fields)
- Record counts (10,000 records)
- Deployment status (15 objects deployed)

**Example**:
```
✅ Account object analyzed (350 fields)
⚠️  Found 52 unused fields (15%)
```

### For HubSpot

**Include**:
- Portal name (production, sandbox)
- Property counts (847 contact properties)
- Record counts (10,200 contacts)
- Workflow status (5 workflows activated)

**Example**:
```
✅ Analyzed 847 contact properties
⚠️  Identified 215 unused (25%)
```

## Quick Commands

```bash
# Link Asana project
/asana-link

# Post work summary
/asana-update

# Test task reader
node scripts/lib/asana-task-reader.js <task-id>

# Test formatter
node scripts/lib/asana-update-formatter.js

# Test roadmap manager
node scripts/lib/asana-roadmap-manager.js <task-id> <project-id>
```

## Getting Help

- **Full Playbook**: `docs/ASANA_AGENT_PLAYBOOK.md`
- **Template Details**: `templates/asana-updates/*.md`
- **Integration Standards**: `../../CLAUDE.md` (Asana Integration Standards)
- **Reflection**: Use `/reflect` to submit feedback

## Checklist Before Posting

- [ ] Used template format
- [ ] Under word limit
- [ ] Includes metrics/numbers
- [ ] Clear next steps
- [ ] Tagged people if needed (@mentions)
- [ ] Formatted with bullets/bold
- [ ] No jargon (or explained)

**Remember**: If a stakeholder would need to ask "what's done?" or "what's next?" after reading your update, revise it!
