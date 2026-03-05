---
description: Post intermediate progress checkpoint to Asana task
allowed-tools: Read, Write, Bash, mcp__asana__asana_add_comment, mcp__asana__asana_update_task, mcp__asana__asana_get_task
thinking-mode: enabled
---

# Asana Checkpoint Update

## OBJECTIVE

Post an intermediate progress checkpoint to an Asana task, updating stakeholders on work completed so far, current progress, and next steps. Uses standardized progress update template with brevity enforcement.

## PREREQUISITES

- ASANA_ACCESS_TOKEN configured in `.env`
- Task ID or task link provided
- Work has made meaningful progress (at least one completed item)

## PROCESS

### 1. Validate Asana Connection

```bash
./.claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/asana-connection-manager.sh validate
```

### 2. Get Task Details (Optional)

If user doesn't provide task ID, help them find it:

```javascript
// List tasks in progress
const tasks = await asana.list_tasks({
  assignee: 'me',
  workspace: process.env.ASANA_WORKSPACE_ID,
  completed_since: 'now'
});

// Show tasks user is working on
console.log('Your in-progress tasks:');
tasks.forEach((t, i) => {
  console.log(`${i+1}. ${t.name} (${t.gid})`);
});
```

### 3. Gather Progress Information

Ask user (or infer from git/file changes):

**Questions to Ask**:
- What have you completed since last update?
- What are you currently working on?
- What's next?
- Any blockers? (On Track / At Risk / Blocked)

**Auto-Detection Options**:
- Recent git commits (last 2-4 hours)
- Modified files with timestamps
- Completion markers in docs (✅, DONE)

### 4. Format Progress Update

Use standard template:

```javascript
const { AsanaUpdateFormatter } = require('./.claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/asana-update-formatter');

const formatter = new AsanaUpdateFormatter();

const update = formatter.formatProgress({
  taskName: taskName,
  date: new Date().toISOString().split('T')[0],
  completed: completedItems,  // Array of accomplishments
  inProgress: currentWork,     // String with progress %
  nextSteps: nextSteps,        // Array of 1-2 next steps
  status: status               // On Track / At Risk / Blocked
});

// Validate brevity
if (!update.valid) {
  console.warn(`⚠️ Update is ${update.wordCount} words (max 100)`);
  // Offer to trim or revise
}
```

### 5. Post to Asana

```javascript
// Post comment
await asana.add_comment(taskId, {
  text: update.text
});

// Update custom fields
await asana.update_task(taskId, {
  custom_fields: {
    latest_update: `${update.status} - ${currentWork.substring(0, 50)}`,
    last_checkpoint: new Date().toISOString()
  }
});
```

### 6. Confirm to User

```
✅ Checkpoint posted to Asana

Task: [Task Name]
Update: 45 words (target: 50-75) ✅
Status: On Track

View: https://app.asana.com/...
```

## INTERACTION MODES

### Mode 1: Interactive (Default)

Ask user for progress details:

```
User: /asana-checkpoint
Assistant: Which task are you updating?

[Shows list of in-progress tasks]

User: 1
Assistant: Great! Tell me about your progress on [Task Name]:

What have you completed?
User: Analyzed Account object, found 23 unused fields

What are you working on now?
User: Analyzing Contact object

What's next?
User: Generate recommendations report

Any blockers? (On Track / At Risk / Blocked)
User: On Track