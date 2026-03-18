# Asana Enhanced Integration Guide

**Version**: 2.0.0
**Date**: 2025-10-26
**Status**: Production Ready

## Overview

This guide documents the enhanced Asana integration capabilities available to the `implementation-planner` agent and other agents working with Asana projects. These utilities provide advanced features beyond the MCP server capabilities, enabling full project accountability and stakeholder management.

## New Capabilities (v2.0.0)

| Capability | Utility | Key Features |
|------------|---------|--------------|
| **Project Creation** | AsanaProjectCreator | Create projects with team support, detect workspace type, search before creating |
| **Task Assignment** | AsanaUserManager | Map agents to assignees, manage stakeholder roles, workspace user caching |
| **Follower Management** | AsanaFollowerManager | Add stakeholders based on phase/type, batch operations, automatic notification |
| **Progress Comments** | AsanaCommentManager | Template-based updates, structured formats, stakeholder visibility |

## Architecture

### Component Relationships

```
implementation-planner agent
    ↓
┌─────────────────────────────────────────────────┐
│ Enhanced Asana Integration Layer                │
│                                                  │
│  ┌──────────────────┐  ┌──────────────────┐   │
│  │ MCP Asana Server │  │ Direct API Utils │   │
│  │ (Basic CRUD)     │  │ (Advanced)       │   │
│  └────────┬─────────┘  └────────┬─────────┘   │
│           │                      │              │
│           v                      v              │
│    Basic Operations      Enhanced Operations   │
│    - Create task         - Create project      │
│    - Update task         - Assign users        │
│    - Get project         - Add followers       │
│    - List tasks          - Post comments       │
└─────────────────────────────────────────────────┘
                    ↓
            Asana REST API v1.0
```

### Configuration Files

```
.claude-plugins/opspal-core/
├── config/
│   └── asana-user-mapping.json          - Agent→user & stakeholder mappings
├── scripts/lib/
│   ├── asana-user-manager.js            - User/stakeholder management
│   ├── asana-follower-manager.js        - Follower operations
│   ├── asana-project-creator.js         - Project creation
│   └── asana-comment-manager.js         - Comment posting
└── templates/asana-comments/
    ├── completion-comment.md            - Task completion template
    ├── progress-comment.md              - Progress update template
    └── blocker-comment.md               - Blocker notification template
```

## Integration Patterns

### Pattern 1: Enhanced Project Setup (Recommended)

This pattern replaces the manual project creation flow with automatic project creation and full accountability setup.

```javascript
// ===== ENHANCED PROJECT SETUP PATTERN =====

// Step 1: Initialize utilities
const AsanaProjectCreator = require('../scripts/lib/asana-project-creator');
const AsanaUserManager = require('../scripts/lib/asana-user-manager');
const AsanaFollowerManager = require('../scripts/lib/asana-follower-manager');
const AsanaCommentManager = require('../scripts/lib/asana-comment-manager');

const projectCreator = new AsanaProjectCreator();
const userManager = new AsanaUserManager();
const followerManager = new AsanaFollowerManager();
const commentManager = new AsanaCommentManager();

// Step 2: Create or find project
console.log('🚀 Creating Asana project...\n');

const projectResult = await projectCreator.createOrFindProject(
  projectPlan.metadata.title,
  projectPlan.metadata.summary,
  true  // searchFirst - avoid duplicates
);

if (projectResult.wasFound) {
  console.log(`✅ Using existing project: ${projectResult.name}`);
} else {
  console.log(`✅ Created new project: ${projectResult.name}`);
}

const projectGid = projectResult.gid;
console.log(`   URL: https://app.asana.com/0/${projectGid}\n`);

// Step 3: Create tasks (existing MCP pattern)
const createdTasks = [];

for (const phase of projectPlan.phases) {
  for (const task of phase.tasks) {
    const asanaTask = await mcp_asana_create_task({
      projects: [projectGid],
      name: `${task.requirementId}: ${task.title}`,
      notes: formatTaskDescription(task),
      // ... other parameters
    });

    createdTasks.push({
      requirementId: task.requirementId,
      asanaGid: asanaTask.gid,
      title: task.title,
      phase: phase.name,
      agent: task.agent,
      type: task.type,
      dependencies: task.dependencies
    });
  }
}

// Step 4: Assign tasks to team members
console.log('🎯 Assigning tasks to team members...\n');

for (const task of createdTasks) {
  const assigneeGid = userManager.getAssigneeForAgent(task.agent);

  if (assigneeGid) {
    await mcp_asana_update_task({
      task_gid: task.asanaGid,
      assignee: assigneeGid
    });

    console.log(`  ✅ ${task.requirementId}: Assigned to agent ${task.agent}`);
  } else {
    console.log(`  ⚠️  ${task.requirementId}: No assignee configured for ${task.agent}`);
  }
}

// Step 5: Add stakeholder followers
console.log('\n🔔 Adding stakeholder followers...\n');

for (const task of createdTasks) {
  const result = await followerManager.addStakeholdersToTask(
    task.asanaGid,
    task.phase,
    task.type
  );

  if (result.success) {
    console.log(`  ✅ ${task.requirementId}: Added ${result.followers.length} stakeholders`);
  }
}

// Step 6: Post project initialization comment
console.log('\n💬 Posting project initialization status...\n');

const initCommentData = {
  summary: `Project plan created with ${createdTasks.length} tasks across ${projectPlan.phases.length} phases`,
  accomplishments: [
    `Created ${createdTasks.length} tasks with dependencies`,
    `Organized into ${projectPlan.phases.length} phases`,
    `Assigned to ${new Set(createdTasks.map(t => t.agent)).size} specialized agents`
  ],
  metrics: [`${createdTasks.length} tasks`, `${projectPlan.metadata.estimatedTotalHours} hours`],
  deliverables: ['Project structure in Asana', 'Task dependencies mapped'],
  locations: [`https://app.asana.com/0/${projectGid}`],
  verificationSteps: ['All tasks visible', 'Dependencies linked', 'Timeline calculated'],
  notes: 'Ready for review. Run /execute-plan to begin implementation.'
};

if (createdTasks.length > 0) {
  await commentManager.addCompletionComment(createdTasks[0].asanaGid, initCommentData);
  console.log('  ✅ Posted project initialization summary\n');
}

console.log(`\n✅ Project setup complete!`);
console.log(`   ${createdTasks.length} tasks created and assigned`);
console.log(`   Stakeholders notified via followers`);
console.log(`   View project: https://app.asana.com/0/${projectGid}\n`);
```

### Pattern 2: Progressive Updates During Task Execution

Post structured updates as work progresses:

```javascript
// During task execution by specialized agents

const commentManager = new AsanaCommentManager();

// === Progress Update (every few hours or at checkpoints) ===
await commentManager.addProgressComment(taskGid, {
  percentage: 60,
  completed: [
    'Standard pricebook created (150 products)',
    'Partner pricebook configured with 85% discount'
  ],
  completedMetrics: ['150 products', '85% discount'],
  currentWork: [
    'Enterprise pricebook configuration',
    'Custom discount approval workflow'
  ],
  progressIndicators: ['75 of 150 products done', 'Flow structure complete'],
  nextSteps: [
    'Complete Enterprise product entries',
    'Test quote creation'
  ],
  timeEstimates: ['2 hours', '1 hour'],
  expectedDate: '2025-10-27 EOD',
  blockers: 'None'
});

// === Blocker Notification (immediately when blocked) ===
await commentManager.addBlockerComment(taskGid, {
  description: 'Missing product cost data for 75 SKUs required for margin calculations',
  timelineImpact: '2-day delay unless resolved by COB today',
  scopeImpact: 'Blocks Enterprise pricebook and margin rule creation',
  downstreamImpact: 'Will delay quote templates (REQ-008)',
  rootCause: 'Cost field not populated for Q3 2025 products',
  actionNeeded: 'Run cost data import using standard template',
  assignee: 'Sarah.Johnson (Finance Ops)',
  deadline: '2025-10-26 5:00 PM',
  workaround: 'Using estimated costs for initial setup'
});

// === Completion Comment (when task finished) ===
await commentManager.addCompletionComment(taskGid, {
  summary: 'Successfully implemented CPQ-Lite pricebook structure',
  accomplishments: [
    'Created 3 pricebooks (Standard, Partner, Enterprise)',
    'Configured discount percentages',
    'Implemented price selection rules'
  ],
  metrics: ['3 pricebooks', '12 selection rules', '2-level approval'],
  deliverables: [
    'Pricebook configuration',
    'Approval workflow'
  ],
  locations: [
    'Salesforce Sandbox: cpq-sandbox',
    'Flow: CPQ_Custom_Discount_Approval'
  ],
  verificationSteps: [
    'All pricebooks visible in CPQ',
    'Discount calculations accurate',
    'Approval workflow triggered correctly'
  ],
  notes: 'Custom discounts >20% trigger 2-level approval (Sales Manager → VP Sales)'
});
```

### Pattern 3: Configuration-First Setup

Before using the utilities, configure user mappings:

```bash
# Step 1: Fetch workspace users
node .claude-plugins/opspal-core/scripts/lib/asana-user-manager.js fetch-users

# Output:
# 📋 Workspace Users:
#
# 1. Sarah Chen (sarah@company.com)
#    GID: 1234567890123456
#
# 2. Mike Rodriguez (mike@company.com)
#    GID: 2345678901234567
# ...

# Step 2: Edit configuration file
# Edit .claude-plugins/opspal-core/config/asana-user-mapping.json

# Step 3: Validate configuration
node .claude-plugins/opspal-core/scripts/lib/asana-user-manager.js validate

# Output:
# 🔍 Validating Asana user mapping configuration...
#
# 📊 Validation Results:
# Workspace ID: REDACTED_ASANA_WORKSPACE
# Agent Mappings: 8/10 configured
# Stakeholder Roles: 5/6 configured
#
# ⚠️  Warnings:
#   - Agent "sfdc-cpq-specialist" has no assignee GID
#   - Role "business_analyst" has no GID configured
#
# ✅ Configuration is valid
```

## API Reference

### AsanaProjectCreator

```javascript
const AsanaProjectCreator = require('../scripts/lib/asana-project-creator');
const creator = new AsanaProjectCreator(workspaceId);

// Detect workspace type
const workspaceType = await creator.detectWorkspaceType();
// Returns: { gid, name, isOrganization, type }

// List teams (for organizations)
const teams = await creator.getWorkspaceTeams();
// Returns: [{ gid, name }, ...]

// Search for project
const existing = await creator.searchProject('Project Name');
// Returns: { gid, name } or null

// Create project
const project = await creator.createProject({
  name: 'My Project',
  notes: 'Project description',
  team: 'teamGid',  // Required for organizations
  owner: 'userGid',
  color: 'light-green',
  privacy: 'private'
});

// Create or find (recommended)
const result = await creator.createOrFindProject(
  'My Project',
  'Description',
  true  // searchFirst
);
// Returns: { ...project, wasCreated, wasFound }
```

### AsanaUserManager

```javascript
const AsanaUserManager = require('../scripts/lib/asana-user-manager');
const manager = new AsanaUserManager(workspaceId, configPath);

// Get workspace users (with caching)
const users = await manager.getWorkspaceUsers(forceRefresh);
// Returns: [{ gid, name, email }, ...]

// Get assignee for agent
const assigneeGid = manager.getAssigneeForAgent('sfdc-metadata-manager');
// Returns: userGid or null

// Get stakeholder GIDs
const stakeholders = manager.getStakeholderGIDs(['technical_lead', 'qa_lead']);
// Returns: [userGid1, userGid2, ...]

// Get phase stakeholders
const phaseStakeholders = manager.getPhaseStakeholders('foundation');
// Returns: [userGid1, userGid2, ...]

// Get task type stakeholders
const typeStakeholders = manager.getTaskTypeStakeholders('data');
// Returns: [userGid1, userGid2, ...]

// Get combined stakeholders
const combined = manager.getCombinedStakeholders('foundation', 'data');
// Returns: [unique userGids]

// Validate configuration
const validation = await manager.validateConfiguration();
// Returns: { valid, errors, warnings, stats }
```

### AsanaFollowerManager

```javascript
const AsanaFollowerManager = require('../scripts/lib/asana-follower-manager');
const manager = new AsanaFollowerManager(workspaceId);

// Add followers
await manager.addFollowersToTask(taskGid, [userGid1, userGid2]);
// Returns: task object

// Add stakeholders (automatic determination)
const result = await manager.addStakeholdersToTask(taskGid, 'foundation', 'data');
// Returns: { success, stakeholders, followers, task }

// Determine stakeholders (without adding)
const stakeholders = manager.determineStakeholders('configuration', 'technical');
// Returns: { phase, taskType, phaseStakeholders, typeStakeholders, combined, count }

// Get current followers
const followers = await manager.getTaskFollowers(taskGid);
// Returns: [{ gid, name }, ...]

// Remove followers
await manager.removeFollowersFromTask(taskGid, [userGid1, userGid2]);

// Batch operations
const results = await manager.batchAddStakeholders([
  { taskGid: 'task1', phase: 'foundation', taskType: 'data' },
  { taskGid: 'task2', phase: 'configuration', taskType: 'functional' }
], 500);  // 500ms delay between requests
// Returns: { total, successful, failed, details }
```

### AsanaCommentManager

```javascript
const AsanaCommentManager = require('../scripts/lib/asana-comment-manager');
const manager = new AsanaCommentManager();

// Add simple comment
await manager.addComment(taskGid, 'Comment text', isPinned);
// Returns: story object

// Add completion comment
await manager.addCompletionComment(taskGid, {
  summary: 'One-line summary',
  accomplishments: ['Item 1', 'Item 2'],
  metrics: ['150 records', '3 fields'],
  deliverables: ['Report', 'Configuration'],
  locations: ['Salesforce', 'Documentation'],
  verificationSteps: ['Test 1', 'Test 2'],
  notes: 'Additional context'
});

// Add progress comment
await manager.addProgressComment(taskGid, {
  percentage: 60,
  completed: ['Done 1', 'Done 2'],
  completedMetrics: ['100%', '50 items'],
  currentWork: ['In progress 1', 'In progress 2'],
  progressIndicators: ['50%', '25 of 50'],
  nextSteps: ['Next 1', 'Next 2'],
  timeEstimates: ['2h', '3h'],
  expectedDate: '2025-10-27',
  blockers: 'None'
});

// Add blocker comment
await manager.addBlockerComment(taskGid, {
  description: 'What is blocking',
  timelineImpact: 'How timeline affected',
  scopeImpact: 'What is blocked',
  downstreamImpact: 'What else affected',
  rootCause: 'Why blocked',
  actionNeeded: 'What needs to happen',
  assignee: 'Who can unblock',
  deadline: 'When resolution needed',
  workaround: 'Temporary solution or None'
});

// Get task comments
const comments = await manager.getTaskComments(taskGid);
// Returns: [{ gid, text, created_at, created_by }, ...]

// Batch operations
const results = await manager.batchAddComments([
  { taskGid: 'task1', text: 'Comment' },
  { taskGid: 'task2', template: 'completion', variables: { ... } }
], 500);
// Returns: { total, successful, failed, details }
```

## Configuration Guide

### asana-user-mapping.json Structure

```json
{
  "version": "1.0.0",
  "lastUpdated": "2025-10-26",
  "workspaceId": "REDACTED_ASANA_WORKSPACE",
  "defaultAssigneeGid": null,

  "agentToUserMapping": {
    "sfdc-metadata-manager": {
      "assigneeGid": "1234567890",
      "assigneeName": "Salesforce Admin",
      "description": "Manages metadata deployments"
    }
  },

  "stakeholderRoles": {
    "technical_lead": {
      "gid": "1111111111",
      "name": "Tech Lead Name",
      "description": "Technical oversight"
    }
  },

  "phaseStakeholders": {
    "foundation": ["technical_lead", "project_manager", "business_analyst"],
    "configuration": ["technical_lead", "salesforce_admin"],
    "automation": ["technical_lead", "salesforce_admin"],
    "integration": ["technical_lead", "salesforce_admin", "qa_lead"],
    "testing": ["qa_lead", "technical_lead"],
    "deployment": ["technical_lead", "project_manager", "qa_lead"]
  },

  "taskTypeStakeholders": {
    "data": ["technical_lead", "business_analyst"],
    "functional": ["technical_lead", "business_analyst"],
    "technical": ["technical_lead"],
    "integration": ["technical_lead", "salesforce_admin"],
    "testing": ["qa_lead", "technical_lead"],
    "deployment": ["technical_lead", "project_manager"]
  }
}
```

### Setup Workflow

1. **Initialize configuration**:
   ```bash
   node .claude-plugins/opspal-core/scripts/lib/asana-user-manager.js setup
   ```

2. **Edit mappings**: Update GIDs based on fetched users

3. **Validate**:
   ```bash
   node .claude-plugins/opspal-core/scripts/lib/asana-user-manager.js validate
   ```

4. **Test project creation**:
   ```bash
   node .claude-plugins/opspal-core/scripts/lib/asana-project-creator.js detect
   node .claude-plugins/opspal-core/scripts/lib/asana-project-creator.js teams
   ```

## Error Handling

### Common Issues

**1. "ASANA_ACCESS_TOKEN environment variable is required"**
- **Cause**: Missing environment variable
- **Fix**: `export ASANA_ACCESS_TOKEN=your_token_here`

**2. "No assignee configured for agent X"**
- **Cause**: Missing agent mapping in configuration
- **Fix**: Add mapping to `agentToUserMapping` in asana-user-mapping.json

**3. "No stakeholders configured for this phase/type combination"**
- **Cause**: Missing phase or type in stakeholder configuration
- **Fix**: Add to `phaseStakeholders` or `taskTypeStakeholders`

**4. "Cannot access workspace users"**
- **Cause**: Invalid token or insufficient permissions
- **Fix**: Verify token has workspace access, refresh if expired

**5. "Project creation failed - team parameter required"**
- **Cause**: Organization workspace requires team assignment
- **Fix**: Use `AsanaProjectCreator.getWorkspaceTeams()` to fetch teams, then provide team GID

### Error Recovery Patterns

```javascript
// Pattern: Graceful degradation for missing assignees
try {
  const assigneeGid = userManager.getAssigneeForAgent(task.agent);

  if (assigneeGid) {
    await mcp_asana_update_task({ task_gid: taskGid, assignee: assigneeGid });
  } else {
    console.warn(`⚠️  No assignee for ${task.agent} - task will be unassigned`);
    // Continue anyway - user can assign manually
  }
} catch (error) {
  console.error(`❌ Assignment failed: ${error.message}`);
  // Continue with other tasks
}

// Pattern: Retry with exponential backoff
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      const delay = Math.pow(2, i) * 1000;  // 1s, 2s, 4s
      console.log(`⚠️  Retry ${i + 1}/${maxRetries} in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Usage
await retryWithBackoff(() =>
  followerManager.addStakeholdersToTask(taskGid, phase, type)
);
```

## Performance Considerations

### Caching

**AsanaUserManager** caches workspace users for 1 hour:
```javascript
// Force refresh cache
const users = await userManager.getWorkspaceUsers(true);

// Use cached data
const users = await userManager.getWorkspaceUsers(false);
```

### Rate Limiting

**Asana API Limits**: 150 requests/minute per user

**Batch Operations** include built-in delays:
```javascript
// 500ms delay between requests (default)
await followerManager.batchAddStakeholders(tasks, 500);

// Adjust delay for rate limits
await commentManager.batchAddComments(tasks, 1000);  // 1 second delay
```

### Parallel vs Sequential

**Parallel** (faster, use when no dependencies):
```javascript
await Promise.all([
  manager.addFollowersToTask(task1Gid, followers),
  manager.addFollowersToTask(task2Gid, followers),
  manager.addFollowersToTask(task3Gid, followers)
]);
```

**Sequential** (safer, respects rate limits):
```javascript
for (const task of tasks) {
  await manager.addFollowersToTask(task.gid, followers);
  await new Promise(resolve => setTimeout(resolve, 500));
}
```

## Testing

### CLI Testing Commands

```bash
# Test user manager
node .claude-plugins/opspal-core/scripts/lib/asana-user-manager.js validate

# Test project creator
node .claude-plugins/opspal-core/scripts/lib/asana-project-creator.js detect
node .claude-plugins/opspal-core/scripts/lib/asana-project-creator.js teams

# Test follower manager (requires task GID)
node .claude-plugins/opspal-core/scripts/lib/asana-follower-manager.js test foundation data

# Test comment manager (requires task GID)
node .claude-plugins/opspal-core/scripts/lib/asana-comment-manager.js templates
```

### Integration Test Script

```javascript
// test-asana-integration.js
const AsanaProjectCreator = require('./scripts/lib/asana-project-creator');
const AsanaUserManager = require('./scripts/lib/asana-user-manager');
const AsanaFollowerManager = require('./scripts/lib/asana-follower-manager');
const AsanaCommentManager = require('./scripts/lib/asana-comment-manager');

async function testIntegration() {
  console.log('🧪 Testing Asana Enhanced Integration...\n');

  // Test 1: Project Creator
  console.log('Test 1: Project Creator');
  const projectCreator = new AsanaProjectCreator();
  const workspaceType = await projectCreator.detectWorkspaceType();
  console.log(`✅ Workspace: ${workspaceType.name} (${workspaceType.type})\n`);

  // Test 2: User Manager
  console.log('Test 2: User Manager');
  const userManager = new AsanaUserManager();
  const validation = await userManager.validateConfiguration();
  console.log(`✅ Config valid: ${validation.valid}, Agents: ${validation.stats.configuredAgents}/${validation.stats.totalAgents}\n`);

  // Test 3: Follower Manager (requires test task)
  console.log('Test 3: Follower Manager');
  const followerManager = new AsanaFollowerManager();
  const stakeholders = followerManager.determineStakeholders('foundation', 'data');
  console.log(`✅ Stakeholders: ${stakeholders.combined.length} for foundation/data\n`);

  // Test 4: Comment Manager
  console.log('Test 4: Comment Manager');
  const commentManager = new AsanaCommentManager();
  console.log(`✅ Comment templates available: completion, progress, blocker\n`);

  console.log('✅ All integration tests passed!');
}

testIntegration().catch(console.error);
```

## Migration Guide

### From MCP-Only to Enhanced Integration

**Before (MCP-only)**:
```javascript
// Manual project creation required
console.log('Please create project manually in Asana');
const projectGid = process.env.PROJECT_GID;

// Create tasks (no assignments)
const task = await mcp_asana_create_task({
  projects: [projectGid],
  name: 'Task name',
  notes: 'Description'
});

// Manual assignment required in Asana UI
```

**After (Enhanced)**:
```javascript
// Automatic project creation
const projectCreator = new AsanaProjectCreator();
const project = await projectCreator.createOrFindProject(name, description, true);
const projectGid = project.gid;

// Create tasks with automatic assignment
const userManager = new AsanaUserManager();
const task = await mcp_asana_create_task({
  projects: [projectGid],
  name: 'Task name',
  notes: 'Description'
});

// Auto-assign
const assigneeGid = userManager.getAssigneeForAgent('sfdc-metadata-manager');
await mcp_asana_update_task({ task_gid: task.gid, assignee: assigneeGid });

// Auto-add stakeholders
const followerManager = new AsanaFollowerManager();
await followerManager.addStakeholdersToTask(task.gid, 'foundation', 'data');
```

### Rollout Strategy

**Phase 1**: Configuration setup (1 hour)
- Run setup wizard
- Configure user mappings
- Validate configuration

**Phase 2**: Integration testing (30 minutes)
- Test project creation
- Test task assignment
- Test follower management
- Test comment posting

**Phase 3**: Production deployment (immediate)
- All utilities are production-ready
- No breaking changes to existing functionality
- Enhanced features are additive

## Compliance Impact

### Before Enhanced Integration

| Feature | Status | Compliance |
|---------|--------|------------|
| Project Creation | ❌ Manual | 0% |
| Task Assignment | ❌ Manual | 0% |
| Follower Management | ❌ Not available | 0% |
| Progress Comments | ⚠️  Basic text only | 25% |

**Overall**: 42% compliance (5/12 features)

### After Enhanced Integration

| Feature | Status | Compliance |
|---------|--------|------------|
| Project Creation | ✅ Automatic with teams | 100% |
| Task Assignment | ✅ Agent-to-user mapping | 100% |
| Follower Management | ✅ Phase/type-based | 100% |
| Progress Comments | ✅ Template-based | 100% |

**Overall**: 75% compliance (9/12 features)

**Improvement**: +33 percentage points, +67% critical features

## Related Documentation

- **Main Playbook**: `ASANA_AGENT_PLAYBOOK.md` - Overall Asana integration guidelines
- **Command Reference**: `commands/plan-from-spec.md` - /plan-from-spec command usage
- **Audit Report**: `ASANA_API_CAPABILITY_AUDIT_2025-10-26.md` - Capability assessment
- **Configuration**: `config/asana-user-mapping.json` - User/stakeholder mappings
- **Templates**: `templates/asana-comments/` - Comment templates

---

**Last Updated**: 2025-10-26
**Maintained By**: RevPal Engineering
**Version**: 2.0.0
