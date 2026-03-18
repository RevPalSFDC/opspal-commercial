---
description: Read and parse assigned Asana tasks into agent-friendly format
argument-hint: "[project-gid] [--project <name>]"
allowed-tools:
  - Read
  - Write
  - Bash
  - mcp__asana__asana_get_task
  - mcp__asana__asana_list_tasks
thinking-mode: enabled
---

# Read Asana Tasks

## OBJECTIVE

Read Asana tasks assigned to the current user and parse them into an agent-friendly format for execution. Displays task context, requirements, and instructions to help agents understand what work needs to be done.

## PREREQUISITES

- ASANA_ACCESS_TOKEN must be configured in `.env`
- Asana connection must be healthy (run `/asana-status` to check)

## PROCESS

### 1. Validate Asana Connection

```bash
# Source shared path resolver
RESOLVE_SCRIPT=""
for _candidate in \
  "${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/scripts/resolve-script.sh}" \
  "$HOME/.claude/plugins/cache/revpal-internal-plugins/opspal-core"/*/scripts/resolve-script.sh \
  "$HOME/.claude/plugins/marketplaces"/*/plugins/opspal-core/scripts/resolve-script.sh \
  "$PWD/plugins/opspal-core/scripts/resolve-script.sh" \
  "$PWD/.claude-plugins/opspal-core/scripts/resolve-script.sh"; do
  [ -n "$_candidate" ] && [ -f "$_candidate" ] && RESOLVE_SCRIPT="$_candidate" && break
done
if [ -z "$RESOLVE_SCRIPT" ]; then echo "ERROR: Cannot locate opspal-core resolve-script.sh"; exit 1; fi
source "$RESOLVE_SCRIPT"

# Validate connection before reading tasks
ASANA_CONN=$(find_script "asana-connection-manager.sh")
bash "$ASANA_CONN" validate
```

If validation fails, run:
```bash
bash "$ASANA_CONN" fix
```

### 2. Get Assigned Tasks

Use Asana MCP or task reader utility:

```javascript
const { AsanaTaskReader } = require(process.env.ASANA_TASK_READER_PATH || './scripts/lib/asana-task-reader');

const reader = new AsanaTaskReader(process.env.ASANA_ACCESS_TOKEN);

// Get tasks assigned to current user
const tasks = await asana.list_tasks({
  assignee: 'me',
  workspace: process.env.ASANA_WORKSPACE_ID,
  completed_since: 'now', // Only incomplete tasks
  opt_fields: 'name,due_on,projects,custom_fields,tags'
});
```

### 3. Parse Each Task

For each task, extract full context:

```javascript
for (const task of tasks) {
  const context = await reader.parseTask(task.gid, {
    includeComments: true,
    includeProject: true,
    includeDependencies: true
  });

  console.log(`\n=== Task: ${context.fields.name} ===`);
  console.log(`Priority: ${context.fields.priority}`);
  console.log(`Due: ${context.fields.dueOn || 'No due date'}`);
  console.log(`Status: ${context.fields.status}`);

  if (context.requirements.requirements.length > 0) {
    console.log(`\nRequirements:`);
    context.requirements.requirements.forEach(req => {
      console.log(`  - ${req}`);
    });
  }

  if (context.requirements.successCriteria.length > 0) {
    console.log(`\nSuccess Criteria:`);
    context.requirements.successCriteria.forEach(crit => {
      console.log(`  - ${crit}`);
    });
  }

  if (context.instructions.length > 0) {
    console.log(`\nInstructions:`);
    context.instructions.forEach((inst, i) => {
      console.log(`  ${i+1}. ${inst}`);
    });
  }

  if (context.projectContext) {
    console.log(`\nProject: ${context.projectContext.name}`);
    if (context.projectContext.notes) {
      console.log(`Project Objective: ${context.projectContext.notes.substring(0, 100)}...`);
    }
  }

  if (context.dependencies && context.dependencies.blocked_by.length > 0) {
    console.log(`\n⚠️  BLOCKED BY ${context.dependencies.blocked_by.length} task(s)`);
    console.log(`   Cannot start until dependencies complete`);
  }

  console.log(`\nTask URL: https://app.asana.com/0/${context.fields.projects[0]?.gid || 'project'}/${task.gid}`);
}
```

### 4. Display Summary

Show summary of all assigned tasks:

```javascript
console.log(`\n${'='.repeat(60)}`);
console.log(`📋 Summary: ${tasks.length} task(s) assigned to you\n`);

const byStatus = {
  'On Track': tasks.filter(t => t.status === 'On Track').length,
  'At Risk': tasks.filter(t => t.status === 'At Risk').length,
  'Blocked': tasks.filter(t => t.status === 'Blocked').length,
  'Not Started': tasks.filter(t => !t.status || t.status === 'Not Started').length
};

console.log('By Status:');
Object.entries(byStatus).forEach(([status, count]) => {
  if (count > 0) {
    console.log(`  ${status}: ${count}`);
  }
});
```

## INTERACTION MODES

### Mode 1: List All Assigned Tasks (Default)

```
User: /asana-read
Assistant: Fetching your assigned Asana tasks...
Assistant: Found 3 tasks assigned to you:

1. [TEST] Salesforce Field Audit - beta-corp Sandbox
   Priority: Medium
   Due: 2025-10-28
   Status: In Progress
   Requirements: 3 requirements extracted
   URL: https://app.asana.com/...

2. Fix Agent Routing Errors
   Priority: High
   Due: 2025-10-27
   Status: Blocked
   ⚠️ Blocked by 1 task - wait for completion
   URL: https://app.asana.com/...

3. Update Documentation
   Priority: Low
   Due: No due date
   Status: Not Started
   URL: https://app.asana.com/...
```

### Mode 2: Read Specific Task

```
User: /asana-read 1211748609238981
Assistant: Reading task 1211748609238981...

=== Task Details ===
Name: [TEST] Salesforce Field Audit - beta-corp Sandbox
Priority: Medium
Status: In Progress
Due: 2025-10-28

Requirements:
- Audit custom fields on Account and Contact objects
- Identify unused fields (0% population)
- Generate recommendations report

Success Criteria:
- All custom fields analyzed
- Report generated with findings

Project: OpsPal - Reflection Improvements
Project Objective: Automated reflection cohort improvements...

URL: https://app.asana.com/...
```

### Mode 3: Filter by Project

```
User: /asana-read --project "Reflection Improvements"
Assistant: Fetching tasks from "Reflection Improvements" project...

Found 5 tasks in this project:
  2 assigned to you
  3 assigned to others

Your Tasks:
1. [TEST] Salesforce Field Audit
2. Fix Agent Routing Errors
```

## OUTPUT FORMAT

Always provide:
- ✅ Task count summary
- 📋 Detailed list of each task
- 🎯 Requirements and success criteria
- 📁 Task URLs for easy access
- ⚠️ Blocker warnings if dependencies exist
- 💡 Suggested next action based on priority/status

## ERROR HANDLING

### No Token
```
❌ ASANA_ACCESS_TOKEN not set in environment

Fix with:
  set -a && source .env && set +a

Or validate connection:
  $(find_script "asana-connection-manager.sh") validate
```

### No Tasks Found
```
✅ No tasks currently assigned to you

You're all caught up! 🎉
```

### Task Not Found
```
❌ Task 1234567890 not found

Possible reasons:
- Task ID is incorrect
- You don't have access to this task
- Task was deleted
```

### API Error
```
❌ Asana API error: [error message]

Troubleshooting:
1. Check connection: asana-connection-manager.sh validate
2. Verify token hasn't expired
3. Check network connectivity
```

## EXAMPLES

### Example 1: Read All Assigned Tasks

```bash
/asana-read
```

**Output**:
```
📋 Your Assigned Asana Tasks

Found 3 tasks assigned to you:

1. 🔴 [HIGH PRIORITY] Fix Agent Routing Errors
   Due: Tomorrow (2025-10-26)
   Status: Blocked
   ⚠️ Blocked by: "Update Instance Resolver" task
   URL: https://app.asana.com/...

2. 📊 Salesforce CPQ Assessment - Client ABC
   Due: Friday (2025-10-27)
   Status: In Progress
   Requirements: Run comprehensive CPQ audit
   URL: https://app.asana.com/...

3. 📝 Update Documentation
   Due: No due date
   Status: Not Started
   URL: https://app.asana.com/...

Summary: 1 blocked, 1 in progress, 1 not started
Recommended: Start with task #2 (in progress, due soon)
```

### Example 2: Read Specific Task

```bash
/asana-read 1211748609238981
```

**Output**:
```
📖 Task Details

Name: [TEST] Salesforce Field Audit - beta-corp Sandbox
Priority: Medium
Status: In Progress
Due: Monday (2025-10-28)
Project: OpsPal - Reflection Improvements

Requirements:
✓ Audit custom fields on Account and Contact objects in beta-corp sandbox
✓ Identify unused fields (0% population)
✓ Generate recommendations report

Success Criteria:
✓ All custom fields analyzed
✓ Report generated with findings

Instructions:
1. Connect to beta-corp RevPal sandbox
2. Run field analysis on Account and Contact
3. Generate recommendations

Next Steps:
- Begin with Account object analysis
- Use sfdc-field-analyzer agent
- Post progress updates every 2 hours

URL: https://app.asana.com/...
```

## IMPLEMENTATION

### Using Utility Script

```bash
# Parse specific task (use find_script from resolve-script.sh)
ASANA_READER=$(find_script "asana-task-reader.js")
node "$ASANA_READER" 1211748609238981

# Output: JSON with full context
```

### Using MCP Tools

```javascript
// Get task via MCP
const task = await asana.get_task(taskId);

// Parse with utility
const { AsanaTaskReader } = require(process.env.ASANA_TASK_READER_PATH || './scripts/lib/asana-task-reader');
const reader = new AsanaTaskReader(process.env.ASANA_ACCESS_TOKEN);
const context = await reader.parseTask(taskId, { includeComments: true });
```

## INTEGRATION WITH AGENTS

After reading a task, agents should:

1. **Understand the work** - Review requirements, success criteria, instructions
2. **Check for blockers** - Don't start if dependencies not complete
3. **Post start update** - Let stakeholders know you're beginning
4. **Follow update templates** - Use progress/blocker/completion templates
5. **Track in roadmap** - Break into subtasks if multi-step

**Reference**: `../docs/ASANA_AGENT_PLAYBOOK.md`

## RELATED COMMANDS

- `/asana-link` - Link Asana project to current directory
- `/asana-update` - Post work summary to linked tasks
- `/asana-checkpoint` - Post intermediate progress update
- `/asana-status` - Check Asana connection health

## NOTES

- Task reading respects Asana permissions (only shows accessible tasks)
- Comments and project context are optional (can be slow for large projects)
- Dependencies require additional API calls
- Use CLI utility for scripting/automation

---

**Remember**: Understanding the full context of a task (requirements, project goals, dependencies) is essential for providing relevant updates and making good decisions. Always read tasks thoroughly before starting work!
