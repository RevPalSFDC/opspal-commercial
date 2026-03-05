# Asana Comprehensive Integration Guide

**Date**: 2026-02-09
**Repository**: opspal-internal-plugins
**Status**: Production-Ready (v1.0.0)

---

## Executive Summary

This document provides a **complete reference** for the Asana integration within the OpsPal plugin ecosystem. The integration combines:

1. **40+ MCP Tools** via `@roychri/mcp-server-asana` for core operations
2. **10+ Custom JavaScript Utilities** for advanced workflows beyond MCP
3. **Automated Workflows** including the reflection processing pipeline
4. **Comprehensive Documentation** with navigation patterns and known gotchas

**Key Capabilities**:
- ✅ Task creation and management
- ✅ Project and workspace operations
- ✅ Comment/story management
- ✅ Dependency tracking
- ✅ Custom field support
- ✅ Section (board column) operations
- ✅ Tag operations
- ✅ Batch operations (up to 25 tasks)
- ✅ User management and follower assignment
- ✅ Template-based update formatting
- ✅ Automated reflection cohort task creation
- ✅ Status synchronization with Supabase

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [MCP Server Configuration](#mcp-server-configuration)
3. [Available MCP Tools (40+)](#available-mcp-tools-40)
4. [Custom Utilities (10+)](#custom-utilities-10)
5. [Navigation Patterns](#navigation-patterns)
6. [Known API Gotchas](#known-api-gotchas)
7. [Automated Workflows](#automated-workflows)
8. [Update Templates](#update-templates)
9. [Commands](#commands)
10. [Integration with Process Reflections](#integration-with-process-reflections)
11. [Error Handling & Recovery](#error-handling--recovery)
12. [Testing & Verification](#testing--verification)
13. [Performance & Reliability](#performance--reliability)
14. [Troubleshooting](#troubleshooting)
15. [Best Practices](#best-practices)
16. [Appendices](#appendices)

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│  Claude Code Interface Layer                                 │
│  - MCP tool calls (mcp__asana__*)                           │
│  - Custom utility invocations                                │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  MCP Server (@roychri/mcp-server-asana)                     │
│  - Core CRUD operations                                      │
│  - Search and filter                                         │
│  - Task stories (comments)                                   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Custom Utilities Layer                                      │
│  - AsanaClient (unified client with retry/fallback)         │
│  - AsanaProjectFilter (cross-project leakage prevention)    │
│  - AsanaReflectionSync (Supabase bidirectional sync)        │
│  - AsanaUserManager, AsanaFollowerManager, etc.             │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  Asana REST API (v1.0)                                       │
│  https://app.asana.com/api/1.0                              │
└─────────────────────────────────────────────────────────────┘
```

### Integration Points

| System | Integration Type | Purpose |
|--------|------------------|---------|
| **Supabase** | Bidirectional sync via `AsanaReflectionSync` | Keep reflection status in sync with Asana tasks |
| **Process Reflections** | Orchestration script with Saga pattern | Automated cohort task creation with rollback |
| **Work Index** | Auto-capture hooks | Track client work in Asana projects |
| **Quality Gates** | Validation hooks | Automated updates during specialist agent execution |

---

## MCP Server Configuration

### Configuration File

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
    },
    "capabilities": [
      "asana_list_workspaces",
      "asana_search_projects",
      "asana_get_project",
      "asana_create_task",
      "asana_update_task",
      "asana_get_task",
      "asana_list_tasks"
    ]
  }
}
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ASANA_ACCESS_TOKEN` | Yes | - | Personal access token (workspace:write scope required) |
| `ASANA_WORKSPACE_ID` | No | REDACTED_WORKSPACE_ID | Default workspace GID (RevPal) |
| `ASANA_PROJECT_GID` | No | 1211617834659194 | Default project for reflections (OpsPal - Reflection Improvements) |
| `READ_ONLY_MODE` | No | false | Set to `false` to enable write operations |

**How to Get Access Token**:
1. Go to https://app.asana.com/0/my-apps
2. Create Personal Access Token
3. Copy token and set in `.env` or export as environment variable

**Required Scopes**: `workspace:write` (includes read permissions)

### Verification

```bash
# Check MCP server status
claude mcp list | grep asana

# Expected output:
# asana: npx -y @roychri/mcp-server-asana - ✓ Connected

# Test connection
node .claude/scripts/lib/asana-client.js test
```

---

## Available MCP Tools (40+)

### Core Operations

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `mcp__asana__asana_list_workspaces` | List workspaces | `opt_fields` |
| `mcp__asana__asana_search_projects` | Find projects by name pattern | `workspace`, `name_pattern`, `archived`, `opt_fields` |
| `mcp__asana__asana_get_project` | Get project details | `project_id`, `opt_fields` |
| `mcp__asana__asana_get_project_task_counts` | Count tasks in project | `project_id` |
| `mcp__asana__asana_get_project_sections` | Get project sections (board columns) | `project_id`, `opt_fields` |

### Project Status Updates

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `mcp__asana__asana_get_project_status` | Get project status update | `project_status_gid` |
| `mcp__asana__asana_get_project_statuses` | List all status updates | `project_gid`, `limit`, `offset` |
| `mcp__asana__asana_create_project_status` | Create status update | `project_gid`, `text`, `color` (green/yellow/red), `title` |
| `mcp__asana__asana_delete_project_status` | Delete status update | `project_status_gid` |

### Task Operations

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `mcp__asana__asana_search_tasks` | Search tasks with filters | `workspace`, `text`, `projects_any`, `sections_any`, `completed`, `assignee_any`, `opt_fields` |
| `mcp__asana__asana_get_task` | Get task details | `task_id`, `opt_fields` |
| `mcp__asana__asana_get_multiple_tasks_by_gid` | Batch task fetch (max 25) | `task_ids` (array or comma-separated), `opt_fields` |
| `mcp__asana__asana_create_task` | Create task | `project_id`, `name`, `notes`, `assignee`, `due_on`, `custom_fields`, `html_notes`, `resource_subtype` |
| `mcp__asana__asana_update_task` | Update task | `task_id`, `name`, `notes`, `completed`, `assignee`, `due_on`, `custom_fields`, `resource_subtype` |
| `mcp__asana__asana_create_subtask` | Create subtask | `parent_task_id`, `name`, `notes`, `assignee`, `due_on` |
| `mcp__asana__asana_set_parent_for_task` | Move task to parent/subtask | `task_id`, `data.parent`, `insert_after`, `insert_before` |

### Task Stories (Comments)

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `mcp__asana__asana_get_task_stories` | Get task comments | `task_id`, `opt_fields` |
| `mcp__asana__asana_create_task_story` | Add comment | `task_id`, `text` |

### Dependency Operations

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `mcp__asana__asana_add_task_dependencies` | Set dependencies (blockers) | `task_id`, `dependencies` (array of task GIDs) |
| `mcp__asana__asana_add_task_dependents` | Set dependents (blocks) | `task_id`, `dependents` (array of task GIDs) |

### Tag Operations

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `mcp__asana__asana_get_tags_for_workspace` | List workspace tags | `workspace_gid`, `limit`, `offset` |
| `mcp__asana__asana_get_tasks_for_tag` | Get tasks with tag | `tag_gid`, `limit`, `offset` |

### Search Parameters

#### Common Search Filters

| Filter | Parameter | Example |
|--------|-----------|---------|
| **Keyword search** | `text` | `"login failure"` |
| **Project scope** | `projects_any` | `"1234567890123456"` (comma-separated GIDs) |
| **Section scope** | `sections_any` | `"1234567890123456"` (MUST combine with `projects_any`) |
| **Completion status** | `completed` | `false` (open tasks only) |
| **Assignee** | `assignee_any` | `"me"` or user GID |
| **Due date range** | `due_on_before` / `due_on_after` | `"2026-03-01"` |
| **Tags** | `tags_any` | Tag GID (comma-separated) |
| **Created date** | `created_on_after` / `created_on_before` | `"2026-01-01"` |
| **Modified date** | `modified_on_after` / `modified_on_before` | `"2026-01-15"` |

### Standard opt_fields Values

**Why opt_fields matters**: Omitting `opt_fields` returns full default representation with deeply nested objects, causing timeouts and token waste.

| Operation | Recommended `opt_fields` |
|-----------|--------------------------|
| **List/Search** | `name,gid,assignee.name,due_on,completed` |
| **Task Details** | `name,notes,custom_fields,permalink_url,assignee.name,due_on,completed,memberships.section.name` |
| **With Dependencies** | `name,notes,dependencies,dependents,permalink_url` |
| **Sections** | `name,gid` |
| **Projects** | `name,gid,team.name,archived,permalink_url` |

---

## Custom Utilities (10+)

### 1. AsanaClient (`.claude/scripts/lib/asana-client.js`)

**Purpose**: Unified Asana client with MCP-first approach, REST API fallback, and comprehensive error handling

**Features**:
- Automatic MCP detection with REST fallback
- Retry logic with exponential backoff (3 attempts, 1s base delay)
- Timeout handling (30s default)
- Prevention-focused templates for recurring issues
- Dry-run mode support
- Recurrence detection and tracking

**Key Methods**:

```javascript
const { AsanaClient } = require('./.claude/scripts/lib/asana-client');
const client = new AsanaClient({ verbose: true, dryRun: false });

// Create task
await client.createTask({
  name: 'Fix validation issue',
  notes: 'Description',
  projectGid: '1211617834659194',
  dueOn: '2026-02-15',
  assignee: 'me',
  recurrence: { count: 2, previousOccurrences: [...] }
});

// Add comment
await client.addComment(taskGid, 'Progress update', { isPinned: false });

// Update task
await client.updateTask(taskGid, {
  completed: true,
  notes: 'Updated description',
  custom_fields: { progress_percentage: 100 }
});

// Find or create project
await client.findOrCreateProject('Project Name', 'Description');

// Test connection
await client.testConnection();
```

**Recurrence Detection**:
When `recurrence.count >= 2`, automatically:
- Prefixes task name with `[RECURRENCE #N]`
- Adds prevention-focused description section
- Lists previous occurrences with dates
- Includes prevention failures analysis
- Provides required fix depth guidance (IMMEDIATE/CONTRIBUTING/SAFEGUARD_GAP/SYSTEMIC)

**CLI Interface**:
```bash
node .claude/scripts/lib/asana-client.js test
node .claude/scripts/lib/asana-client.js create-task "Task name" "Description"
node .claude/scripts/lib/asana-client.js add-comment <taskGid> "Comment text"
node .claude/scripts/lib/asana-client.js list-tasks [projectGid]
```

---

### 2. AsanaProjectFilter (`plugins/opspal-core/scripts/lib/asana-project-filter.js`)

**Purpose**: Prevents workspace-scoped search results from leaking across projects

**Problem**: Asana's `sections_any` parameter is workspace-scoped, not project-scoped. Searching by section GIDs returns tasks from ANY project containing sections with those GIDs. (See GOTCHA-001)

**Solution**: Post-filters search results by verifying each task's project membership via REST API.

**Key Methods**:

```javascript
const { AsanaProjectFilter } = require('./plugins/opspal-core/scripts/lib/asana-project-filter');
const filter = new AsanaProjectFilter();

// Post-filter tasks to specific project
const { filtered, excluded, stats } = await filter.filterByProject(tasks, projectGid);

console.log(`Kept ${filtered.length} tasks, excluded ${excluded.length}`);

// Safe search combining sections_any + projects_any + post-filter
const { tasks, stats } = await filter.searchTasksInProjectSections(
  projectGid,
  sectionGids,
  { text: 'keyword', completed: false }
);

// Single-task membership check
const isMember = await filter.verifyTaskProjectMembership(taskGid, projectGid);
```

**Performance**:
- Batch-fetches membership data (25 tasks per batch)
- 300ms rate limiting between batches
- Verbose logging of excluded tasks

**CLI Interface**:
```bash
node plugins/opspal-core/scripts/lib/asana-project-filter.js \
  --project <gid> --tasks <gid1,gid2,...>

node plugins/opspal-core/scripts/lib/asana-project-filter.js \
  --project <gid> --sections <gid1,gid2,...>
```

---

### 3. AsanaReflectionSync (`.claude/scripts/lib/asana-reflection-sync.js`)

**Purpose**: Bidirectional sync between Asana tasks and Supabase reflections

**Features**:
- Keep task status and reflection status in sync
- Status mapping (Asana ↔ Reflection)
- Automatic status detection from custom fields

**Status Mappings**:

| Asana Status | Reflection Status | Notes |
|--------------|-------------------|-------|
| `completed` | `implemented` | Task marked complete |
| In Review (custom field) | `under_review` | Being reviewed |
| Approved (custom field) | `accepted` | Approved for implementation |
| Rejected (custom field) | `rejected` | Not proceeding |
| On Hold (custom field) | `deferred` | Postponed |

**Commands**:

```bash
# Update reflections based on Asana task status
node .claude/scripts/lib/asana-reflection-sync.js sync-from-asana

# Update specific task
node .claude/scripts/lib/asana-reflection-sync.js sync-from-asana \
  --task-id 1234567890123456

# Dry run
node .claude/scripts/lib/asana-reflection-sync.js sync-from-asana --dry-run

# Check status without changes
node .claude/scripts/lib/asana-reflection-sync.js check-status
```

---

### 4. AsanaUserManager (`plugins/opspal-core/scripts/lib/asana-user-manager.js`)

**Purpose**: User mapping and stakeholder assignment

**Features**:
- User GID resolution by email/name
- User mapping configuration (`config/asana-user-mapping.json`)
- Stakeholder assignment automation
- Workspace user listing with caching

**Key Methods**:

```javascript
const { AsanaUserManager } = require('./plugins/opspal-core/scripts/lib/asana-user-manager');
const manager = new AsanaUserManager(accessToken, workspaceGid);

// Get user GID by email
const userGid = await manager.getUserGidByEmail('user@example.com');

// Get stakeholders by role
const stakeholders = await manager.getStakeholdersByRole('QA');

// List all workspace users
const users = await manager.listWorkspaceUsers();
```

**Configuration**: `plugins/opspal-core/config/asana-user-mapping.json`

---

### 5. AsanaFollowerManager (`plugins/opspal-core/scripts/lib/asana-follower-manager.js`)

**Purpose**: Add/remove followers, batch operations

**Features**:
- Bulk follower additions
- Stakeholder auto-following based on rules
- Follower removal
- Phase-based follower assignment

**Key Methods**:

```javascript
const { AsanaFollowerManager } = require('./plugins/opspal-core/scripts/lib/asana-follower-manager');
const manager = new AsanaFollowerManager(accessToken);

// Add followers to task
await manager.addFollowers(taskGid, [userGid1, userGid2]);

// Remove followers
await manager.removeFollowers(taskGid, [userGid1]);

// Determine stakeholders by phase
const stakeholders = await manager.getStakeholdersByPhase('QA');
```

---

### 6. AsanaProjectCreator (`plugins/opspal-core/scripts/lib/asana-project-creator.js`)

**Purpose**: Project creation with workspace detection

**Features**:
- Auto-detect workspace from environment
- Team assignment (for organization workspaces)
- Project template application
- Search existing projects before creating

**Key Methods**:

```javascript
const { AsanaProjectCreator } = require('./plugins/opspal-core/scripts/lib/asana-project-creator');
const creator = new AsanaProjectCreator(accessToken);

// Create project
const project = await creator.createProject({
  name: 'Client Work - Acme Corp',
  notes: 'Project description',
  workspaceGid: workspaceGid,
  teamGid: teamGid  // Optional, for organization workspaces
});

// Detect workspace type
const workspaceType = await creator.detectWorkspaceType(workspaceGid);
```

---

### 7. AsanaCommentManager (`plugins/opspal-core/scripts/lib/asana-comment-manager.js`)

**Purpose**: Template-based comments and bulk operations

**Features**:
- Progress update templates
- Blocker update templates
- Completion update templates
- Milestone update templates
- Bulk comment operations
- Variable substitution

**Key Methods**:

```javascript
const { AsanaCommentManager } = require('./plugins/opspal-core/scripts/lib/asana-comment-manager');
const manager = new AsanaCommentManager(accessToken);

// Post progress update
await manager.postProgressUpdate(taskGid, {
  taskName: 'Data Migration',
  completed: ['Exported 10K records', 'Validated fields'],
  inProgress: 'Importing batch 1 of 3',
  nextSteps: ['Complete batches 2-3', 'Run dedup'],
  status: 'On Track'
});

// Post blocker update
await manager.postBlockerUpdate(taskGid, {
  issue: 'API rate limit exceeded',
  impact: 'Import delayed 2 hours',
  needs: '@john Fix rate limiting',
  workaround: 'None',
  timeline: 'ASAP'
});
```

**Template Locations**: `plugins/opspal-core/templates/asana-updates/`

---

### 8. AsanaTaskReader (`plugins/opspal-core/scripts/lib/asana-task-reader.js`)

**Purpose**: Structured task parsing for agent consumption

**Features**:
- Extract requirements from task descriptions
- Parse success criteria
- Identify dependencies and blockers
- Get project context
- Read comment history

**Key Methods**:

```javascript
const { AsanaTaskReader } = require('./plugins/opspal-core/scripts/lib/asana-task-reader');
const reader = new AsanaTaskReader(accessToken);

const context = await reader.parseTask(taskId, {
  includeComments: true,
  includeProject: true,
  includeDependencies: true
});

console.log(context.requirements);        // Extracted requirements
console.log(context.successCriteria);     // Success criteria
console.log(context.blockers);            // Blocking tasks
console.log(context.projectContext);      // Project info
console.log(context.comments);            // Recent comments
```

**CLI Interface**:
```bash
node plugins/opspal-core/scripts/lib/asana-task-reader.js <task-id>
```

---

### 9. AsanaUpdateFormatter (`plugins/opspal-core/scripts/lib/asana-update-formatter.js`)

**Purpose**: Format updates according to brevity standards

**Features**:
- Word count validation (< 100 words)
- Template enforcement
- Markdown formatting
- Metric inclusion checks

**Key Methods**:

```javascript
const { AsanaUpdateFormatter } = require('./plugins/opspal-core/scripts/lib/asana-update-formatter');
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
} else {
  // Post via MCP
  await mcp__asana__asana_create_task_story({
    task_id: taskId,
    text: update.text
  });
}
```

---

### 10. AsanaIntegrationComplianceChecker (`plugins/opspal-core/scripts/lib/asana-integration-compliance-checker.js`)

**Purpose**: Validate agent compliance with Asana integration standards

**Features**:
- Check for template usage
- Validate `opt_fields` usage
- Verify update length limits
- Detect missing metrics

**CLI Interface**:

```bash
node plugins/opspal-core/scripts/lib/asana-integration-compliance-checker.js \
  check-agent <agent-name>

node plugins/opspal-core/scripts/lib/asana-integration-compliance-checker.js \
  check-all
```

---

## Navigation Patterns

### Core Principles

1. **IDs are King** - Always resolve names to `gid` before modifications
2. **Search-First** - Use `search_*` tools instead of list-and-filter
3. **Stateless** - Re-acquire context or store `gid`s (no persistent session)
4. **Scope Queries** - Always add `projects_any` when searching tasks
5. **opt_fields** - Specify on EVERY call to prevent timeouts

### Hierarchy

```
Workspace → Team → Project → Section → Task → Subtask
```

**Rule**: Always navigate top-down. Never skip levels.

### Navigation Algorithms

#### Algorithm 1: Finding a Project

```javascript
// Step 1: Search by name pattern
const results = await mcp__asana__asana_search_projects({
  workspace: workspaceGid,
  name_pattern: "Mobile App",
  opt_fields: "name,gid,team.name,archived,permalink_url"
});

// Step 2: Validate (single result, not archived)
if (results.length === 1 && !results[0].archived) {
  const projectGid = results[0].gid;
  // Store projectGid for subsequent calls
}
```

#### Algorithm 2: Finding a Specific Task

```javascript
// Step 1: Scoped search
const tasks = await mcp__asana__asana_search_tasks({
  workspace: workspaceGid,
  text: "login failure",
  projects_any: projectGid,  // REQUIRED to prevent cross-project leakage
  completed: false,
  opt_fields: "name,gid,assignee.name,due_on,completed"
});

// Step 2: Inspect results, select match

// Step 3: Get full details
const task = await mcp__asana__asana_get_task({
  task_id: selectedTaskGid,
  opt_fields: "name,notes,custom_fields,permalink_url,assignee.name,due_on,completed,memberships.section.name"
});
```

#### Algorithm 3: Exploring a Board/Project

```javascript
// Step 1: Get sections (columns)
const sections = await mcp__asana__asana_get_project_sections({
  project_id: projectGid,
  opt_fields: "name,gid"
});

// Step 2: Identify target section by name
const targetSection = sections.find(s => s.name.includes("In Progress"));

// Step 3: Fetch tasks in section (CRITICAL: include projects_any)
const tasks = await mcp__asana__asana_search_tasks({
  workspace: workspaceGid,
  sections_any: targetSection.gid,
  projects_any: projectGid,  // REQUIRED (see GOTCHA-001)
  completed: false,
  opt_fields: "name,gid,assignee.name,due_on,completed"
});
```

---

## Known API Gotchas

### GOTCHA-001: `sections_any` is Workspace-Scoped

**Severity**: HIGH
**Discovered**: 2026-02-05 (Aspire org assessment)
**Impact**: Search returns tasks from ALL projects in workspace, not just target project

**Problem**:
```javascript
// WRONG - Returns tasks from ALL projects
await mcp__asana__asana_search_tasks({
  workspace: workspaceGid,
  sections_any: "section1,section2"
});
```

**Solution**:
```javascript
// CORRECT - Always combine sections_any with projects_any
await mcp__asana__asana_search_tasks({
  workspace: workspaceGid,
  sections_any: "section1,section2",
  projects_any: projectGid  // <-- REQUIRED
});
```

**Safety Net**: Use `AsanaProjectFilter` for post-filtering:

```javascript
const filter = new AsanaProjectFilter();
const { filtered, excluded } = await filter.filterByProject(rawResults, projectGid);
```

---

### GOTCHA-002: Missing `opt_fields` Causes Timeouts

**Severity**: MEDIUM
**Impact**: Large payloads, slow responses, token waste

**Problem**: Omitting `opt_fields` returns full default representation (deeply nested custom fields, memberships, full user objects).

**Solution**: Always specify `opt_fields` on EVERY call.

---

### GOTCHA-003: Board-View Projects Require Section GID

**Severity**: MEDIUM
**Impact**: Tasks land in wrong column

**Problem**: Creating a task in a board-view project without specifying section places it in "Untitled section" or first column.

**Solution**: Always discover sections first, then create in target section.

---

## Automated Workflows

### Workflow 1: Reflection Processing (`/processreflections`)

**Script**: `.claude/scripts/process-reflections.js`

**Purpose**: Transform recurring development issues into Asana tasks with comprehensive fix plans

**Two-Phase Workflow**:

#### Phase 1: Analysis (Default)

```bash
node .claude/scripts/process-reflections.js
```

1. Fetch open reflections from Supabase
2. Detect recurring issues (3+ occurrences → CRITICAL priority)
3. Group into cohorts by taxonomy
4. Generate fix plans with 5-Why RCA
5. Create improvement plan for approval
6. Save execution data for Phase 2
7. **NO external changes made**

**Output**:
- `~/.claude/plans/improvement-plan-<timestamp>.md` (human-readable)
- `~/.claude/plans/improvement-plan-<timestamp>-execution-data.json` (Phase 2 data)

#### Phase 2: Execution

```bash
node .claude/scripts/process-reflections.js --execute=<execution-data-path>
```

1. Load approved execution data
2. Create Asana tasks for each cohort (using `AsanaClient`)
3. Update reflection statuses with verification
4. Use Saga pattern for rollback on failure
5. Generate summary report with ROI tracking

**Reliability Features**:
- Circuit breaker pattern for external services
- Retry with exponential backoff
- Parallel cohort processing (3 concurrent)
- Caching layer for historical data
- Health check system (pre-flight validation)
- Dead Letter Queue (DLQ) for failed operations
- Checkpoint manager (graceful shutdown/resume)
- Metrics collection and alerting

**Recurrence Detection**:

```bash
--recurrence-mode=MODE        # 'strict' (0.8) or 'lenient' (0.7)
--recurrence-threshold=N      # Custom similarity threshold 0.0-1.0
--historical-days=N           # Days of history to search (default: 180)
```

**Task Format**:

```markdown
# [RECURRENCE #2] {Title}

## ⚠️ RECURRING ISSUE - Occurrence #2

**This issue has occurred 2 times.** Previous symptom-only fixes have NOT prevented recurrence.

### Previous Occurrences
1. 2025-10-15 - Similar issue with validation rules
2. 2025-11-20 - Same root cause in different object

### Prevention Failures
- No validation at commit time
- Missing automated tests

### Required Fix Depth: SAFEGUARD_GAP
⚠️ A safeguard should have caught this. Implement missing validation, testing, or monitoring.

---

## 🔴 The Issue(s)
{root_cause_summary}

## 🔬 Root Cause Analysis
**Primary cause:** {primary_cause}

**Contributing factors:**
- {factor 1}
- {factor 2}

**Why it wasn't caught:** {safeguard_gaps}

## 📊 The Impact
- **Time wasted**: {hours}/week
- **Annual ROI of fix**: ${expected_roi_annual}
- **Severity**: {priority}

## ✅ The Solution
{solution_description}

## 🤔 Alternative Solutions Considered
{alternatives with pros/cons}

## 📎 Related Reflections
{list reflections with IDs, dates, orgs}

## 🎯 Success Criteria
{list success_criteria}
```

**Asana Project**: OpsPal - Reflection Improvements (GID: 1211617834659194)

---

### Workflow 2: Work Index Synchronization

**Purpose**: Automatically track all client work requests in Asana

**Trigger**: Assessment agents auto-create entries on completion

**Integration Points**:
- Session IDs captured by hooks
- Context loaded at session start when `ORG_SLUG` is set
- Work history synced to `.asana-links.json`

---

## Update Templates

**Location**: `plugins/opspal-core/templates/asana-updates/`

| Template | Use Case | Target Length | When to Use |
|----------|----------|---------------|-------------|
| `progress-update.md` | Intermediate checkpoints | 50-75 words | Every 2-4 hours on active work |
| `blocker-update.md` | Report blockers | 40-60 words | Immediately when blocked |
| `completion-update.md` | Task completion | 60-100 words | When marking task complete |
| `milestone-update.md` | Phase completion | 100-150 words | Major phase completions |

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

## Commands

### Available Commands

| Command | Purpose |
|---------|---------|
| `/asana-link` | Link Asana project to current directory |
| `/asana-update` | Post work summary to linked Asana project |
| `/asana-read <task-id>` | Read task details by ID |
| `/asana-checkpoint` | Save checkpoint to Asana task |

### Configuration Files

| File | Purpose |
|------|---------|
| `.asana-links.json` | Project-to-directory mappings |
| `config/asana-user-mapping.json` | User GID mappings for auto-assignment |
| `templates/asana-updates/*.md` | Update templates |

---

## Integration with Process Reflections

### Task Creation Flow

```javascript
// Phase 2 execution (after plan approval)
for (const cohort of approvedCohorts) {
  const saga = new Saga({ name: `Process Cohort ${cohort.cohort_id}` });

  // Step 1: Create Asana task
  saga.addStep(
    async () => {
      const task = await asanaClient.createTask({
        name: `[Reflection Cohort] ${cohort.title}`,
        notes: buildTaskDescription(cohort),
        projectGid: process.env.ASANA_PROJECT_GID,
        dueOn: calculateDueDate(cohort.effort_hours),
        recurrence: cohort.recurrence_data
      });
      return task;
    },
    async (result) => {
      // Rollback: Delete task if reflection updates fail
      await asanaClient.deleteTask(result.gid);
    }
  );

  // Step 2: Update reflections
  saga.addStep(
    async (taskResult) => {
      await markReflectionsUnderReview(
        cohort.reflections,
        taskResult.gid,
        taskResult.url
      );
    },
    async () => {
      // Rollback: Revert reflections to 'new' status
      await revertReflectionStatus(cohort.reflections);
    }
  );

  // Execute with automatic rollback
  await saga.execute();
}
```

### Custom Fields

| Field | Purpose | Value Type |
|-------|---------|-----------|
| `cohort_id` | Link to Supabase cohort | UUID |
| `estimated_roi` | Annual ROI estimate | Currency |
| `effort_hours` | Implementation effort | Number |
| `affected_orgs` | Organizations impacted | Text (comma-separated) |
| `progress_percentage` | Implementation progress | Percentage (0-100) |

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

// Usage
try {
  const result = await asanaCircuit.execute(async () => {
    return await asanaClient.createTask(...);
  });
} catch (error) {
  if (error.message.includes('Circuit breaker is OPEN')) {
    // Add to DLQ for retry
    await dlq.add({ operation: 'create_task', data: {...} });
  }
}
```

### Dead Letter Queue (DLQ)

**Purpose**: Failed Asana operations can be retried without data loss

```bash
# List failed items
node .claude/scripts/retry-dlq.js list

# Retry specific item
node .claude/scripts/retry-dlq.js retry <item-id>

# Retry all pending
node .claude/scripts/retry-dlq.js retry --all
```

**Storage**: `.claude/dlq/`

### Saga Pattern Rollback

**Purpose**: Transactional operations with automatic rollback on failure

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
  console.error('Operation failed, all changes reverted');
}
```

---

## Testing & Verification

### Integration Tests

**End-to-End Test**:
```bash
node plugins/opspal-core/scripts/test-asana-integration-e2e.js
```

**Compliance Check**:
```bash
node plugins/opspal-core/scripts/lib/asana-integration-compliance-checker.js check-all
```

**Project Filter Test**:
```bash
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

**Daily health check**:
```bash
bash .claude/scripts/daily-asana-health-check.sh
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
- Namespace: 'process-reflections'

### Monitoring

**Metrics Collection**:
```javascript
metrics.increment('process_reflections.workflow_started');
metrics.gauge('process_reflections.reflections_fetched', count);
metrics.histogram('process_reflections.workflow_duration_ms', duration);
```

**Alerting**:
- Slack webhook: `SLACK_WEBHOOK_URL`
- Email alerts: `ALERT_EMAIL`
- Triggers:
  - Critical failures (workflow abort)
  - DLQ threshold exceeded (>10 items)
  - Circuit breaker trips (3+ consecutive failures)

---

## Troubleshooting

### Issue: "Unknown tool: mcp__asana__*"

**Cause**: MCP server not loaded

**Fix**:
1. Check `.mcp.json` configuration
2. Verify `ASANA_ACCESS_TOKEN` is set
3. Restart Claude Code

---

### Issue: Tasks from wrong project appearing

**Cause**: Using `sections_any` without `projects_any` (GOTCHA-001)

**Fix**:
1. Always combine `sections_any` with `projects_any`
2. Use `AsanaProjectFilter` for post-filtering

---

### Issue: API timeouts

**Cause**: Missing `opt_fields` (GOTCHA-002)

**Fix**: Always specify `opt_fields` on every call

---

### Issue: Circuit breaker OPEN

**Cause**: Repeated API failures

**Fix**:
1. Check Asana service status
2. Verify credentials (`ASANA_ACCESS_TOKEN`)
3. Wait for circuit breaker reset (30-60 seconds)
4. Check network connectivity

---

### Issue: Saga rollback occurred

**Cause**: One step failed, triggering automatic rollback

**Fix**:
```bash
# Inspect saga execution
node .claude/scripts/debug/inspect-saga.js list
node .claude/scripts/debug/inspect-saga.js steps <saga-id>

# Check compensation history
node .claude/scripts/debug/inspect-saga.js compensations <saga-id>
```

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

## Appendices

### Appendix A: Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ASANA_ACCESS_TOKEN` | Yes | - | Personal access token (workspace:write scope) |
| `ASANA_WORKSPACE_ID` | No | REDACTED_WORKSPACE_ID | Workspace GID |
| `ASANA_PROJECT_GID` | No | 1211617834659194 | Default project for reflections |
| `SLACK_WEBHOOK_URL` | No | - | Slack webhook for alerts |
| `DLQ_STORAGE_PATH` | No | ./.claude/dlq | Path for dead letter queue |
| `CHECKPOINT_PATH` | No | ./.claude/checkpoints | Path for checkpoints |

---

### Appendix B: File Locations

| Component | Path |
|-----------|------|
| MCP Configuration | `.mcp.json` (lines 174-251) |
| Asana Client | `.claude/scripts/lib/asana-client.js` |
| Reflection Sync | `.claude/scripts/lib/asana-reflection-sync.js` |
| Project Filter | `plugins/opspal-core/scripts/lib/asana-project-filter.js` |
| Task Reader | `plugins/opspal-core/scripts/lib/asana-task-reader.js` |
| Comment Manager | `plugins/opspal-core/scripts/lib/asana-comment-manager.js` |
| User Manager | `plugins/opspal-core/scripts/lib/asana-user-manager.js` |
| Follower Manager | `plugins/opspal-core/scripts/lib/asana-follower-manager.js` |
| Project Creator | `plugins/opspal-core/scripts/lib/asana-project-creator.js` |
| Update Formatter | `plugins/opspal-core/scripts/lib/asana-update-formatter.js` |
| Compliance Checker | `plugins/opspal-core/scripts/lib/asana-integration-compliance-checker.js` |
| Orchestration Script | `.claude/scripts/process-reflections.js` |
| Update Templates | `plugins/opspal-core/templates/asana-updates/` |
| Project Links | `.asana-links.json` |

---

### Appendix C: Related Documentation

| Document | Location | Purpose |
|----------|----------|---------|
| Quick Reference | `docs/ASANA_QUICK_REFERENCE.md` | Print-friendly cheat sheet |
| Navigation Guide | `docs/ASANA_NAVIGATION_GUIDE.md` | Hierarchical mental model with optimized algorithms |
| Integration Analysis | `docs/ASANA_INTEGRATION_ANALYSIS.md` | Comprehensive architecture and patterns |
| Architecture Diagram | `docs/ASANA_ARCHITECTURE_DIAGRAM.md` | Visual system overview |
| API Gotchas | `plugins/opspal-core/docs/ASANA_API_GOTCHAS.md` | Known API behavioral quirks |
| Agent Playbook | `plugins/opspal-core/docs/ASANA_AGENT_PLAYBOOK.md` | Comprehensive agent integration guide |
| Integration Standards | `plugins/shared-docs/asana-integration-standards.md` | Cross-plugin standards |
| Capabilities Summary | `docs/ASANA_CAPABILITIES_SUMMARY.md` | Executive summary of integration |

---

**Prepared by**: Claude Code Agent
**Version**: 1.0.0
**Last Updated**: 2026-02-09
