# Asana Integration - Executive Summary

**Date**: 2026-02-10
**Repository**: opspal-internal-plugins
**Status**: Production-Ready (v1.0.0)

---

## What You Have

The OpsPal plugin ecosystem features a **production-grade, multi-layered Asana integration** consisting of:

### 1. MCP Server Foundation
- **40+ MCP tools** via `@roychri/mcp-server-asana`
- Full CRUD operations for tasks, projects, sections, comments, dependencies, and tags
- Workspace and project management capabilities
- Status update and custom field support

### 2. Custom Utility Layer
- **10+ JavaScript utilities** extending MCP capabilities
- Advanced operations including user management, follower assignment, and cross-project filtering
- Template-based comment formatting
- Project creation with workspace detection

### 3. Automated Workflows
- **Reflection Processing Pipeline** - Transforms recurring development issues into Asana tasks
- **Work Index Synchronization** - Tracks client work across Asana projects
- **Quality Gates** - Automated updates during specialist agent execution

### 4. Comprehensive Documentation
- 5 detailed guides covering architecture, navigation, capabilities, and best practices
- Known API gotchas and workarounds
- Print-friendly quick reference sheets

---

## Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Claude Code Interface Layer                                 │
│  - MCP tool calls (mcp__asana__*)                           │
│  - Custom utility invocations                                │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  MCP Server (@roychri/mcp-server-asana)                     │
│  - 40+ tools for core CRUD operations                       │
│  - Search, filter, batch operations                          │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Custom Utilities Layer                                      │
│  - AsanaClient (retry/fallback)                             │
│  - AsanaProjectFilter (cross-project protection)            │
│  - AsanaReflectionSync (bidirectional sync)                 │
│  - AsanaUserManager, FollowerManager, etc.                  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Asana REST API (v1.0)                                       │
│  https://app.asana.com/api/1.0                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Capabilities

### MCP Tools (40+)

**Workspaces & Projects**
- List workspaces
- Search projects by name pattern
- Get project details and task counts
- Create/update/delete project status updates
- Get project sections (board columns)

**Task Operations**
- Search tasks with advanced filters
- Get single task or batch fetch (up to 25)
- Create/update tasks with custom fields
- Create subtasks
- Set parent-child relationships
- Manage dependencies (blockers/dependents)

**Comments & Stories**
- Get task comments/stories
- Add comments with rich formatting

**Tags**
- List workspace tags
- Get tasks by tag

### Custom Utilities (10+)

**AsanaClient** (`.claude/scripts/lib/asana-client.js`)
- Unified client with MCP-first approach and REST fallback
- Retry logic with exponential backoff (3 attempts, 1s base delay)
- Timeout handling (30s default)
- Prevention-focused templates for recurring issues
- Dry-run mode support

**AsanaProjectFilter** (`plugins/opspal-core/scripts/lib/asana-project-filter.js`)
- **Critical**: Prevents workspace-scoped search results from leaking across projects
- Post-filters `sections_any` search results (which are workspace-scoped)
- Batch membership verification (25 tasks per batch)

**AsanaReflectionSync** (`.claude/scripts/lib/asana-reflection-sync.js`)
- Bidirectional sync between Asana tasks and Supabase reflections
- Status mapping (completed → implemented, In Review → under_review, etc.)
- Automatic status detection from custom fields

**AsanaUserManager** (`plugins/opspal-core/scripts/lib/asana-user-manager.js`)
- User GID resolution by email/name
- Stakeholder assignment automation
- Configuration-driven user mapping

**AsanaFollowerManager** (`plugins/opspal-core/scripts/lib/asana-follower-manager.js`)
- Bulk follower additions
- Stakeholder auto-following based on rules

**AsanaProjectCreator** (`plugins/opspal-core/scripts/lib/asana-project-creator.js`)
- Auto-detect workspace type (personal vs organization)
- Team assignment for organization workspaces
- Project search before creation (avoid duplicates)

**AsanaCommentManager** (`plugins/opspal-core/scripts/lib/asana-comment-manager.js`)
- Template-based comments (progress, blocker, completion, milestone)
- Variable substitution
- Bulk comment operations

**AsanaTaskReader** (`plugins/opspal-core/scripts/lib/asana-task-reader.js`)
- Structured task parsing for agent consumption
- Extract requirements, success criteria, dependencies

**AsanaUpdateFormatter** (`plugins/opspal-core/scripts/lib/asana-update-formatter.js`)
- Word count validation (<100 words)
- Template enforcement
- Markdown formatting

**AsanaIntegrationComplianceChecker** (`plugins/opspal-core/scripts/lib/asana-integration-compliance-checker.js`)
- Validate agent compliance with Asana standards
- Check template usage, opt_fields, update length

---

## Automated Workflows

### 1. Reflection Processing (`/processreflections`)

**Purpose**: Transform recurring development issues into Asana tasks with comprehensive fix plans

**Two-Phase Workflow**:

**Phase 1: Analysis (Default)**
```bash
node .claude/scripts/process-reflections.js
```
1. Fetch open reflections from Supabase
2. Detect recurring issues (3+ occurrences → CRITICAL)
3. Group into cohorts by taxonomy
4. Generate fix plans with 5-Why RCA
5. Create improvement plan for approval
6. **NO external changes made**

**Phase 2: Execution**
```bash
node .claude/scripts/process-reflections.js --execute=<execution-data-path>
```
1. Load approved execution data
2. Create Asana tasks for each cohort
3. Update reflection statuses with verification
4. Use Saga pattern for rollback on failure
5. Generate ROI tracking report

**Reliability Features**:
- Circuit breaker pattern (graceful degradation)
- Retry with exponential backoff
- Parallel cohort processing (3 concurrent)
- Caching layer
- Health check system
- Dead Letter Queue (DLQ) for failed operations
- Checkpoint manager (graceful shutdown/resume)
- Metrics collection and alerting

**Recurrence Detection**:
- Automatically prefixes recurring tasks with `[RECURRENCE #N]`
- Prevention-focused descriptions with:
  - Previous occurrence history
  - Prevention failure analysis
  - Required fix depth guidance (IMMEDIATE/CONTRIBUTING/SAFEGUARD_GAP/SYSTEMIC)

### 2. Work Index Synchronization

**Purpose**: Automatically track all client work requests in Asana

**Integration Points**:
- Session IDs captured by hooks
- Context loaded at session start when `ORG_SLUG` is set
- Work history synced to `.asana-links.json`

---

## Critical Navigation Rules

| Rule | Explanation |
|------|-------------|
| **IDs are King** | Always resolve names to `gid` before modifications |
| **Search-First** | Use `search_*` tools instead of list-and-filter |
| **Stateless** | Re-acquire context or store `gid`s (no persistent session) |
| **Scope Queries** | Always add `projects_any` when searching tasks |
| **opt_fields** | Specify on EVERY call to prevent timeouts |

### Hierarchy

```
Workspace → Team → Project → Section → Task → Subtask
```

**Always navigate top-down. Never skip levels.**

---

## Known API Gotchas

### GOTCHA-001: `sections_any` is Workspace-Scoped (CRITICAL)

**Severity**: HIGH
**Impact**: Search returns tasks from ALL projects in workspace

**Problem**:
```javascript
// ❌ WRONG - Returns tasks from ALL projects
mcp__asana__asana_search_tasks({
  workspace: workspaceGid,
  sections_any: "section1,section2"
});
```

**Solution**:
```javascript
// ✅ CORRECT - Always combine sections_any with projects_any
mcp__asana__asana_search_tasks({
  workspace: workspaceGid,
  sections_any: "section1,section2",
  projects_any: projectGid  // <-- REQUIRED
});
```

**Safety Net**: Use `AsanaProjectFilter` for post-filtering

### GOTCHA-002: Missing `opt_fields` Causes Timeouts

**Severity**: MEDIUM
**Impact**: Large payloads, slow responses, token waste

**Solution**: Always specify `opt_fields` on EVERY call

### GOTCHA-003: Board-View Projects Require Section GID

**Severity**: MEDIUM
**Impact**: Tasks land in wrong column

**Solution**: Always discover sections first, then create in target section

---

## Standard `opt_fields` Values

| Operation | Recommended `opt_fields` |
|-----------|--------------------------|
| **List/Search** | `name,gid,assignee.name,due_on,completed` |
| **Task Details** | `name,notes,custom_fields,permalink_url,assignee.name,due_on,completed,memberships.section.name` |
| **Sections** | `name,gid` |
| **Projects** | `name,gid,team.name,archived,permalink_url` |

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ASANA_ACCESS_TOKEN` | Yes | - | Personal access token (workspace:write scope) |
| `ASANA_WORKSPACE_ID` | No | REDACTED_WORKSPACE_ID | Default workspace GID (RevPal) |
| `ASANA_PROJECT_GID` | No | 1211617834659194 | Default project for reflections |

**How to Get Access Token**:
1. Go to https://app.asana.com/0/my-apps
2. Create Personal Access Token
3. Required scopes: `workspace:write` (includes read permissions)

### MCP Configuration

**Location**: `.mcp.json` (lines 174-251)

```json
{
  "asana": {
    "command": "npx",
    "args": ["-y", "@roychri/mcp-server-asana"],
    "env": {
      "ASANA_ACCESS_TOKEN": "${ASANA_ACCESS_TOKEN}",
      "DEFAULT_WORKSPACE_ID": "${ASANA_WORKSPACE_ID}",
      "READ_ONLY_MODE": "false"
    }
  }
}
```

### Verification

```bash
# Check MCP server status
claude mcp list | grep asana

# Test connection
node .claude/scripts/lib/asana-client.js test
```

---

## Commands

| Command | Purpose |
|---------|---------|
| `/asana-link` | Link Asana project to current directory |
| `/asana-update` | Post work summary to linked project |
| `/asana-read <task-id>` | Read task details by ID |
| `/asana-checkpoint` | Save checkpoint to Asana task |
| `/processreflections` | Run reflection cohort analysis |

---

## Update Templates

**Location**: `plugins/opspal-core/templates/asana-updates/`

| Template | Word Limit | When to Use |
|----------|------------|-------------|
| **progress-update.md** | 100 | Every 2-4 hours on active work |
| **blocker-update.md** | 80 | Immediately when blocked |
| **completion-update.md** | 150 | Task completion |
| **milestone-update.md** | 200 | Phase completion |

### Progress Update Template

```markdown
**Progress Update** - [Task Name] - [Date]

**Completed:**
- [Specific accomplishment with metric]
- [Another accomplishment]

**In Progress:**
- [Current work with progress if quantifiable]

**Next:**
- [Next 1-2 steps]

**Status:** [On Track / At Risk / Blocked]
```

### Blocker Update Template

```markdown
**🚨 BLOCKED** - [Task Name]

**Issue:** [One-sentence problem description]

**Impact:** [What's blocked + duration]

**Needs:** [Specific action from whom]

**Workaround:** [Alternative or "None"]

**Timeline:** [When resolution needed]
```

---

## Error Handling & Recovery

### Circuit Breaker Pattern

```javascript
const asanaCircuit = new CircuitBreaker({
  name: 'asana',
  failureThreshold: 3,     // Open after 3 failures
  resetTimeout: 60000,     // Try again after 60 seconds
  monitorInterval: 10000   // Check every 10 seconds
});
```

### Dead Letter Queue (DLQ)

Failed Asana operations can be retried without data loss:

```bash
# List failed items
node .claude/scripts/retry-dlq.js list

# Retry specific item
node .claude/scripts/retry-dlq.js retry <item-id>

# Retry all pending
node .claude/scripts/retry-dlq.js retry --all
```

### Saga Pattern Rollback

Transactional operations with automatic rollback on failure:

```javascript
const saga = new Saga({ name: 'Create Task and Update Reflections' });

saga.addStep(
  async () => { /* Create task */ },
  async (result) => { /* Rollback: Delete task */ }
);

saga.addStep(
  async (taskResult) => { /* Update reflections */ },
  async () => { /* Rollback: Revert reflections */ }
);

try {
  await saga.execute();
} catch (error) {
  // Saga automatically rolled back all steps
}
```

---

## Performance & Reliability

### Metrics

**Circuit Breaker Stats**:
- Asana circuit: 3 failures → OPEN (60s reset)
- Supabase circuit: 5 failures → OPEN (30s reset)

**Retry Strategy**:
- Max attempts: 3
- Base delay: 1000ms
- Max delay: 30000ms
- Backoff multiplier: 2x
- Jitter: 25%

**Parallel Processing**:
- Max concurrent cohorts: 3
- Timeout per cohort: 120 seconds

**Caching**:
- Default TTL: 300 seconds (5 minutes)
- Max cache size: 1000 items

---

## Testing & Verification

### Integration Tests

```bash
# End-to-end test
node plugins/opspal-core/scripts/test-asana-integration-e2e.js

# Compliance check
node plugins/opspal-core/scripts/lib/asana-integration-compliance-checker.js

# Project filter test
node plugins/opspal-core/scripts/lib/asana-project-filter.js \
  --project <gid> --tasks <gid1,gid2,...>
```

### Health Checks

**Pre-flight validation** (run before `/processreflections`):
```bash
node .claude/scripts/health-check.js
```

Checks:
1. Supabase connectivity (service role key)
2. Asana connectivity
3. Open reflections count
4. Service role key validation
5. Disk space for reports

---

## Documentation Index

| Document | Location | Purpose |
|----------|----------|---------|
| **Quick Reference** | `docs/ASANA_QUICK_REFERENCE.md` | Print-friendly cheat sheet |
| **Comprehensive Guide** | `docs/ASANA_COMPREHENSIVE_INTEGRATION_GUIDE.md` | Complete reference (200 pages) |
| **Capabilities Summary** | `docs/ASANA_CAPABILITIES_SUMMARY.md` | High-level overview |
| **Navigation Guide** | `docs/ASANA_NAVIGATION_GUIDE.md` | Hierarchical mental model |
| **Integration Analysis** | `docs/ASANA_INTEGRATION_ANALYSIS.md` | Architecture and patterns |
| **API Gotchas** | `plugins/opspal-core/docs/ASANA_API_GOTCHAS.md` | Known API quirks |
| **Agent Playbook** | `plugins/opspal-core/docs/ASANA_AGENT_PLAYBOOK.md` | Agent integration guide |
| **Integration Standards** | `plugins/shared-docs/asana-integration-standards.md` | Cross-plugin standards |

---

## Quick Start Examples

### Find and Update a Task

```javascript
// 1. Find project
const projects = await mcp__asana__asana_search_projects({
  workspace: workspaceGid,
  name_pattern: "Mobile App",
  opt_fields: "name,gid"
});

const projectGid = projects[0].gid;

// 2. Search tasks in project
const tasks = await mcp__asana__asana_search_tasks({
  workspace: workspaceGid,
  text: "login failure",
  projects_any: projectGid,  // REQUIRED
  completed: false,
  opt_fields: "name,gid,assignee.name,due_on"
});

// 3. Update task
await mcp__asana__asana_update_task({
  task_id: tasks[0].gid,
  completed: true,
  custom_fields: { status: 'Completed' }
});

// 4. Add comment
await mcp__asana__asana_create_task_story({
  task_id: tasks[0].gid,
  text: "**Progress Update**\n\n**Completed:**\n- Fixed login issue"
});
```

### Create Task with Recurrence Tracking

```javascript
const AsanaClient = require('./.claude/scripts/lib/asana-client');
const client = new AsanaClient({ verbose: true });

const task = await client.createTask({
  name: 'Fix validation issue',
  notes: 'Description here',
  projectGid: '1211617834659194',
  dueOn: '2026-02-15',
  recurrence: {
    count: 2,
    previousOccurrences: [
      { date: '2025-10-15', summary: 'Similar issue' }
    ],
    preventionFailures: ['No validation at commit time'],
    requiredFixDepth: 'SAFEGUARD_GAP'
  }
});
```

### Use AsanaProjectFilter for Safe Section Search

```javascript
const AsanaProjectFilter = require('./plugins/opspal-core/scripts/lib/asana-project-filter');
const filter = new AsanaProjectFilter();

// Safe wrapper (combines sections_any + projects_any + post-filter)
const { tasks, stats } = await filter.searchTasksInProjectSections(
  projectGid,
  sectionGids,
  { text: 'keyword', completed: false }
);

console.log(`Found ${tasks.length} tasks, excluded ${stats.excluded} cross-project tasks`);
```

---

## Troubleshooting

### Issue: "Unknown tool: mcp__asana__*"

**Cause**: MCP server not loaded

**Fix**:
1. Check `.mcp.json` configuration
2. Verify `ASANA_ACCESS_TOKEN` is set
3. Restart Claude Code

### Issue: Tasks from wrong project appearing

**Cause**: Using `sections_any` without `projects_any` (GOTCHA-001)

**Fix**:
1. Always combine `sections_any` with `projects_any`
2. Use `AsanaProjectFilter` for post-filtering

### Issue: API timeouts

**Cause**: Missing `opt_fields` (GOTCHA-002)

**Fix**: Always specify `opt_fields` on every call

### Issue: Circuit breaker OPEN

**Cause**: Repeated API failures

**Fix**:
1. Check Asana service status
2. Verify credentials (`ASANA_ACCESS_TOKEN`)
3. Wait for circuit breaker reset (30-60 seconds)
4. Check network connectivity

---

## Best Practices

### When Creating Tasks

1. ✅ Always specify `opt_fields`
2. ✅ Use templates for task descriptions
3. ✅ Set due dates based on effort estimates
4. ✅ Include metrics in task descriptions
5. ✅ Tag relevant stakeholders
6. ✅ Discover sections before creating tasks in board-view projects
7. ✅ Use `AsanaProjectFilter` to prevent cross-project leakage

### When Searching Tasks

1. ✅ Combine `sections_any` with `projects_any`
2. ✅ Use `opt_fields` to minimize payload
3. ✅ Filter by `completed: false` to exclude completed tasks
4. ✅ Use `text` parameter for keyword searches
5. ✅ Post-filter with `AsanaProjectFilter` for safety

### When Updating Tasks

1. ✅ Use standardized update templates
2. ✅ Keep comments under 100 words
3. ✅ Include concrete metrics
4. ✅ Tag people with @mentions when action needed
5. ✅ Mark tasks complete only when fully done

---

## Summary

The OpsPal Asana integration is a **mature, production-ready system** with:

- **40+ MCP tools** for comprehensive Asana operations
- **10+ custom utilities** extending MCP capabilities
- **Automated workflows** including reflection processing and work tracking
- **Extensive documentation** covering architecture, navigation, and best practices
- **Robust error handling** with circuit breakers, retry logic, and saga pattern
- **Performance optimizations** including caching, parallel processing, and batch operations

The integration is actively used for:
1. Transforming recurring development issues into actionable Asana tasks
2. Tracking client work across projects
3. Automated quality gate updates
4. Standardized client collaboration

All core functionality is operational and well-documented.

---

**Prepared by**: Claude Code Agent
**Version**: 1.0.0
**Last Updated**: 2026-02-10
