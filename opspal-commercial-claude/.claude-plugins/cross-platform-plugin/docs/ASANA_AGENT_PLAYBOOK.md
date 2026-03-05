# Asana Agent Playbook

**Version:** 2.0.0
**Last Updated:** 2025-10-26
**Purpose:** Standard guidelines for AI agents interacting with Asana for project management

## Overview

This playbook defines how AI agents should read tasks from Asana, track their progress, and provide succinct, salient, actionable updates. It ensures consistent, high-quality communication across all agents integrated with Asana, whether working with HubSpot, Salesforce, or other platforms.

## ⭐ What's New in v2.0.0

**Enhanced Integration Capabilities** now available via direct API utilities:

- **🚀 Project Creation**: Automatic project creation with team support (no manual steps)
- **👥 Task Assignment**: Agent-to-user mapping with automatic assignment
- **🔔 Follower Management**: Phase/type-based stakeholder notification
- **💬 Structured Comments**: Template-based updates (completion, progress, blocker)

**For complete integration patterns**, see: **[Enhanced Integration Guide](./ASANA_ENHANCED_INTEGRATION_GUIDE.md)**

**Quick Benefits:**
- **75% compliance** (up from 42%) with Asana API best practices
- **100% critical features** implemented (project creation, assignment, followers)
- **Full accountability** from project setup through completion
- **Stakeholder transparency** via automatic follower management

**Migration**: All v1.0.0 patterns still work. Enhanced features are additive and optional.

## Core Principles

1. **Context-Aware** - Always pull full task and project context before acting
2. **Succinct** - Keep updates brief (aim for < 100 words) with maximum signal
3. **Actionable** - Every update should drive the project forward or flag blockers
4. **Data-Driven** - Include concrete metrics and outcomes when possible
5. **Structured** - Use consistent formatting for easy scanning
6. **Accountable** (NEW) - Use assignments and followers for clear ownership and visibility

## Reading and Understanding Tasks & Projects

### Parse Structured Fields

When an agent is assigned an Asana task, it must first gather full context by reading both structured data and narrative content.

**Key Fields to Extract:**
- **Task Name** - The work to be done
- **Description** - Detailed instructions and context
- **Status** - Current state (Not Started, In Progress, Completed, etc.)
- **Assignee** - Who is responsible (may be the agent itself)
- **Due Date** - When work should be completed
- **Priority** - Urgency level (High, Medium, Low)
- **Custom Fields** - Project-specific metadata (ROI, effort hours, etc.)
- **Tags** - Categorization (platform, work type, org)
- **Section** - Phase or grouping within project
- **Parent Task** - If this is a subtask
- **Dependencies** - Blocking or blocked by other tasks

**Implementation Pattern:**
```javascript
const { asanaTaskReader } = require('../scripts/lib/asana-task-reader');

// Read and parse task
const taskContext = await asanaTaskReader.parseTask(taskId, {
  includeComments: true,
  includeProject: true,
  includeDependencies: true
});

// taskContext contains:
// - fields (all structured data)
// - description (parsed markdown)
// - comments (chronological activity)
// - projectContext (objectives, related tasks)
// - dependencies (blockers, blocking)
```

### Read Descriptions and Comments

Task descriptions often contain instructions, requirements, and clarifications that are critical for proper execution. Comments provide discussion history and decisions made.

**What to Extract:**
- **Work Instructions** - Step-by-step guidance
- **Requirements** - Success criteria and constraints
- **Context** - Why this work is needed
- **Previous Decisions** - Choices made in comments
- **Blockers Mentioned** - Issues raised by team members
- **Related Links** - References to docs, dashboards, or other tasks

**Pattern:**
```javascript
// Extract key information from description
const { requirements, instructions, context } =
  asanaTaskReader.parseDescription(taskContext.description);

// Get latest decisions from comments
const recentDecisions = taskContext.comments
  .filter(c => c.text.includes('DECISION:') || c.text.includes('✅'))
  .slice(-5); // Last 5 decision comments
```

### Use Project Context

Understanding how a task fits into the broader project is essential for providing relevant updates and making good decisions.

**Project Context to Gather:**
- **Project Name & Objectives** - What the project aims to achieve
- **Project Status** - Overall progress and health
- **Related Tasks** - Other work in the same project
- **Section/Phase** - Where this task fits in the workflow
- **Key Stakeholders** - Who cares about this work
- **Team Workflows** - How the team operates

**Pattern:**
```javascript
// Get project context
const project = await asanaTaskReader.getProjectContext(taskContext.projectId);

// Understand task position in project
const taskPhase = project.sections.find(s => s.tasks.includes(taskId));
const relatedTasks = project.tasks.filter(t =>
  t.section === taskPhase.id && t.id !== taskId
);

console.log(`Task is in ${taskPhase.name} phase with ${relatedTasks.length} related tasks`);
```

### Example: Full Task Reading

```javascript
async function understandAssignedTask(taskId) {
  // 1. Get task details
  const task = await asana.get_task(taskId);

  // 2. Parse description for instructions
  const instructions = parseMarkdownSections(task.notes);

  // 3. Get project context
  const project = await asana.get_project(task.projects[0].gid);

  // 4. Check for dependencies
  const dependencies = await asana.get_dependencies_for_task(taskId);

  // 5. Review recent comments for context
  const comments = await asana.list_task_stories(taskId);
  const recentContext = comments
    .filter(c => c.type === 'comment')
    .slice(-10); // Last 10 comments

  return {
    work: instructions.workToDo,
    success: instructions.successCriteria,
    projectGoal: project.notes,
    blockers: dependencies.blocked_by,
    recentDecisions: recentContext
      .filter(c => c.text.includes('DECISION') || c.text.includes('APPROVED'))
  };
}
```

## Providing Succinct, Salient, and Actionable Updates

### Update Format Standards

All Asana updates must follow these standards to ensure clarity and usefulness for human team members.

#### Be Succinct

**Target:** < 100 words or 3-5 bullet points
**Focus:** Key information only, no filler

❌ **Bad (Verbose):**
```
Hello! I have now started working on the data audit as requested. First, I
accessed the Salesforce system using the API credentials provided in the
environment variables, then I wrote a script to iterate through all 10,000
contact records to find any inconsistencies or issues with the data quality.
I found some issues which I will describe in detail below. There were 50
contacts that appeared to be duplicates based on their email addresses,
which I have compiled in a list for your review. There were also some fields
that had missing data which will need to be addressed. I will now proceed to
address these issues. Thank you for your patience.
```
(105 words - too verbose, includes unnecessary process details)

✅ **Good (Succinct):**
```
**Update:** Salesforce data audit in progress

✅ Scanned ~10k contacts
📊 Found 50 duplicates (will merge next)
⚠️  Some missing field values identified

**Next:** Clean up duplicates and missing data
**No blockers** - Update by EOD
```
(35 words - concise, uses visual markers, clear next steps)

#### Highlight Salient Points

Every update should emphasize what matters most: **Progress**, **Roadblocks**, and **Next Steps**.

**Standard Structure:**
```markdown
**Progress:** What has been accomplished since last update
**Roadblocks:** Any blockers or issues (omit if none)
**Next Steps:** What will be worked on next or what input is needed
```

**Example:**
```markdown
**Progress:**
- Completed data export from HubSpot (5,200 contacts)
- Cleaned and validated all required fields
- Identified 15 duplicate company records

**Roadblocks:**
- Need approval to merge duplicate companies (list attached)

**Next Steps:**
- Await merge approval
- Then: Import to Salesforce and validate sync
```

#### Make It Actionable

Updates should either describe an action taken or prompt an action needed. If you need input, be explicit about what and from whom.

**Actionable Patterns:**

**Requesting Decision:**
```markdown
**Decision Required:** Merge strategy for duplicate contacts

**Options:**
1. Keep oldest record (safer, preserves history)
2. Keep most complete record (better data quality)

**Recommendation:** Option 2 - Most complete record
**Needs:** @stakeholder approval by Friday

**Impact if delayed:** Blocks data migration (scheduled Mon)
```

**Flagging Blocker:**
```markdown
**🚨 BLOCKED:** Salesforce permission error

**Issue:** Cannot deploy custom objects - need elevated permissions
**Required:** Admin to grant "Modify All Data" permission
**Timeline:** Blocking 8 hours of work
**Workaround:** Can proceed with read-only analysis while awaiting permissions
```

**Completion with Handoff:**
```markdown
**✅ COMPLETED:** HubSpot workflow automation

**Deliverables:**
- 3 workflows created and tested
- Documentation: [link to Confluence]
- Monitoring dashboard configured

**Handoff:** @team-lead for production deployment approval
**Ready for:** User acceptance testing
```

#### Use Concrete Data

When performing data analysis, include key metrics to add weight and clarity.

**Quantified Updates:**
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

#### Avoid Unnecessary Detail

Team members don't need to know every technical step. Focus on **results and impacts**, not the process.

**What to Skip:**
- API implementation details ("used POST request to...")
- Code execution logs ("script ran successfully...")
- Generic pleasantries ("I'm happy to report that...")
- Obvious statements ("as requested in the task...")

**What to Include:**
- Outcomes achieved
- Numbers and metrics
- Blockers or risks
- Next steps or decisions needed
- Links to detailed reports (if needed)

### Update Types & Templates

Use these templates for common update scenarios. Templates are available in `../templates/asana-updates/`.

#### 1. Progress Update (Checkpoint)

Use for: Intermediate progress on multi-step work

**Template:**
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

#### 2. Blocker Update

Use for: Reporting issues that halt progress

**Template:**
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

#### 3. Completion Update

Use for: Marking task complete with handoff info

**Template:**
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

#### 4. Milestone Update

Use for: Completing a major phase of work

**Template:**
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

**Example:**
```markdown
**🎯 MILESTONE COMPLETE** - Discovery Phase

**Phase Summary:**
Completed comprehensive audit of Salesforce instance, identifying optimization opportunities and technical debt.

**Key Achievements:**
- Analyzed 1,200+ custom fields across 15 objects
- Documented 45 automation workflows and dependencies
- Identified $127K in annual efficiency opportunities

**Phase Stats:**
- Duration: 3 weeks (on schedule)
- Effort: 82 hours (vs 80 estimated)
- Deliverables: 4 reports, 12 recommendations

**Next Phase:** Implementation Planning (starts Monday)

**Risks Identified:**
- Integration dependencies may require vendor coordination
- 2 recommendations need executive approval (budget impact)
```

## Using Tasks and Projects as a Roadmap

### Breaking Down Projects into Tasks

When assigned a complex project, agents should decompose it into trackable subtasks in Asana.

**Pattern:**
```javascript
async function createProjectRoadmap(projectDescription) {
  // 1. Analyze requirements
  const phases = identifyProjectPhases(projectDescription);

  // 2. Create parent task if needed
  const parentTask = await asana.create_task({
    name: projectDescription.title,
    notes: projectDescription.summary,
    projects: [projectDescription.projectId]
  });

  // 3. Create subtasks for each phase
  for (const phase of phases) {
    const subtasks = phase.steps.map(step => ({
      name: step.title,
      notes: step.description,
      parent: parentTask.gid,
      custom_fields: {
        estimated_hours: step.effort
      }
    }));

    await Promise.all(
      subtasks.map(st => asana.create_task(st))
    );
  }

  // 4. Post roadmap to parent task
  await asana.add_comment(parentTask.gid, {
    text: generateRoadmapSummary(phases)
  });
}
```

**Example Breakdown:**
```
Project: "Implement Salesforce Dashboard for Executive Team"

├─ Phase 1: Requirements Gathering
│  ├─ Interview stakeholders (2 hours)
│  ├─ Document KPI requirements (1 hour)
│  └─ Design mockup (3 hours)
│
├─ Phase 2: Data Analysis
│  ├─ Identify data sources (2 hours)
│  ├─ Validate data quality (4 hours)
│  └─ Create data model (3 hours)
│
├─ Phase 3: Dashboard Development
│  ├─ Build dashboard components (8 hours)
│  ├─ Configure filters and drill-downs (4 hours)
│  └─ Test with sample data (2 hours)
│
└─ Phase 4: Deployment
   ├─ User acceptance testing (4 hours)
   ├─ Training session (2 hours)
   └─ Production deployment (1 hour)
```

### Tracking Progress Through Subtasks

As work progresses, update subtask status and post checkpoints to the parent task.

**Checkpoint Pattern:**
```javascript
async function completeSubtask(subtaskId, parentTaskId, results) {
  // 1. Mark subtask complete
  await asana.update_task(subtaskId, {
    completed: true
  });

  // 2. Calculate overall progress
  const allSubtasks = await asana.list_subtasks(parentTaskId);
  const completed = allSubtasks.filter(st => st.completed).length;
  const progress = Math.round((completed / allSubtasks.length) * 100);

  // 3. Post checkpoint to parent task
  await asana.add_comment(parentTaskId, {
    text: formatCheckpointUpdate({
      subtask: await asana.get_task(subtaskId),
      progress: progress,
      results: results
    })
  });

  // 4. Update parent task custom field
  await asana.update_task(parentTaskId, {
    custom_fields: {
      progress_percentage: progress
    }
  });
}
```

**Checkpoint Update Example:**
```markdown
**Checkpoint:** Requirements Gathering Complete (Phase 1/4 - 25%)

**Completed:**
- ✅ Stakeholder interviews (3 executives, 2 managers)
- ✅ KPI requirements documented (12 key metrics identified)
- ✅ Dashboard mockup designed and approved

**Key Findings:**
- Real-time data refresh required (was optional in original spec)
- Need mobile-responsive design
- Request for export to PDF functionality

**Impact:** +2 hours estimated effort for real-time data

**Next:** Starting Phase 2 - Data Analysis
```

### Maintaining a Running Summary

For long-running projects, maintain an updated summary in a custom field or pinned comment.

**Summary Pattern:**
```javascript
async function updateProjectSummary(projectTaskId) {
  const subtasks = await asana.list_subtasks(projectTaskId);
  const completedCount = subtasks.filter(st => st.completed).length;
  const totalCount = subtasks.length;

  const summary = `
**Project Status:** ${completedCount}/${totalCount} tasks complete

**Recent Milestones:**
- ${getRecentCompletions(subtasks, 3).join('\n- ')}

**In Progress:**
- ${getInProgressTasks(subtasks).join('\n- ')}

**Next Up:**
- ${getUpcomingTasks(subtasks, 2).join('\n- ')}

**Last Updated:** ${new Date().toISOString().split('T')[0]}
  `.trim();

  // Update custom field or create pinned comment
  await asana.update_task(projectTaskId, {
    custom_fields: {
      latest_status: summary
    }
  });
}
```

## Writing Updates Back to Asana

### Post as Comments (Narrative Updates)

Use comments for progress updates, blockers, and completion notes. Comments notify followers and create a timestamped audit trail.

**Best Practices:**
- **One update per significant event** - Don't spam with micro-updates
- **Use markdown formatting** - Bold for **key terms**, bullets for lists
- **Tag people when needed** - Use @mention for required actions
- **Include emojis sparingly** - ✅ 🚨 📊 help with scanning

```javascript
await asana.add_comment(taskId, {
  text: `
**Progress Update** - Data Migration

**Completed:**
- ✅ Exported 10,200 contacts from legacy CRM
- ✅ Cleaned and validated all required fields
- ✅ Mapped custom fields to HubSpot properties

**In Progress:**
- Importing batch 1 of 3 (estimated 2 hours)

**Next Steps:**
- Complete import batches 2-3
- Run deduplication check
- Generate migration report

**Status:** On track for Friday delivery
  `
});
```

### Use Custom Fields (At-a-Glance Status)

In addition to narrative comments, update custom fields for quick visibility in list view.

**Common Custom Fields:**
- **Progress %** - Overall completion (0-100)
- **Status** - On Track / At Risk / Blocked / Complete
- **Latest Update** - One-line summary (< 50 chars)
- **Estimated Hours** - Effort required
- **Actual Hours** - Time spent
- **ROI** - Expected value
- **Priority** - Urgency level

```javascript
await asana.update_task(taskId, {
  custom_fields: {
    progress_percentage: 75,
    status: 'On Track',
    latest_update: 'Data import 75% complete',
    actual_hours: 6,
    blocker_status: 'None'
  }
});
```

### Update Task Status

Keep the task's completion status and assignee accurate.

```javascript
// Mark in progress when starting
await asana.update_task(taskId, {
  assignee: 'me',
  completed: false,
  custom_fields: {
    status: 'In Progress'
  }
});

// Mark complete when done
await asana.update_task(taskId, {
  completed: true,
  completed_at: new Date().toISOString(),
  custom_fields: {
    status: 'Complete'
  }
});

// Mark blocked if stuck
await asana.update_task(taskId, {
  custom_fields: {
    status: 'Blocked'
  },
  tags: ['blocked'] // Add tag for filtering
});
```

### Write Project Status Updates

For project-level progress, create status updates that appear prominently in the project view.

```javascript
await asana.create_project_status({
  project: projectId,
  text: `
**Weekly Status** - Week of ${formatDate(new Date())}

**Overall Progress:** 60% complete (12 of 20 tasks done)

**This Week's Highlights:**
- Completed discovery phase (on schedule)
- Identified 15 optimization opportunities
- Executive stakeholder review: approved to proceed

**Next Week's Focus:**
- Begin implementation planning
- Create technical specifications
- Schedule development sprints

**Risks:**
- Vendor API integration may require additional time
- Need budget approval for 2 recommendations

**Health:** On Track ✅
  `,
  status_type: 'on_track' // on_track, at_risk, off_track
});
```

## Handling HubSpot/Salesforce Requests

### Leverage Connectors for Data Retrieval

When a task involves CRM work, use the platform's connectors to get data.

**HubSpot Example:**
```javascript
// Task: "Audit HubSpot contact properties for duplicates"

async function auditHubSpotProperties(taskId) {
  // 1. Retrieve all properties
  const properties = await hubspot.get_properties('contacts');

  // 2. Analyze for duplicates
  const duplicates = findDuplicateProperties(properties);

  // 3. Update Asana with findings
  await asana.add_comment(taskId, {
    text: formatPropertyAuditUpdate(duplicates)
  });
}
```

**Salesforce Example:**
```javascript
// Task: "Find unused custom fields on Account object"

async function auditSalesforceFields(taskId) {
  // 1. Get field metadata
  const fields = await sf.describe('Account').fields;

  // 2. Query field usage
  const usage = await analyzeFieldUsage('Account', fields);

  // 3. Update Asana with summary
  await asana.add_comment(taskId, {
    text: formatFieldAuditUpdate(usage)
  });
}
```

### Perform Analysis and Draft Summaries

After retrieving data, perform the analysis and condense findings into a focused summary.

**Example: HubSpot Workflow Audit**
```markdown
**HubSpot Workflow Audit - Complete**

**Workflows Analyzed:** 47

**Key Findings:**
- Active: 38 (81%)
- Inactive: 9 (19%) - recommend archiving
- Complex (10+ steps): 12 - high maintenance risk
- Missing error handling: 15 - potential data loss risk

**Top Issues:**
1. 🔴 **Critical:** 3 workflows with broken integrations
2. ⚠️  **Warning:** 8 workflows last modified >1 year ago (likely outdated)
3. 💡 **Opportunity:** 5 workflows can be consolidated (reduce maintenance)

**Recommendations:**
1. Fix 3 broken integrations (2 hours)
2. Archive 9 inactive workflows (1 hour)
3. Consolidate 5 workflows → 2 (4 hours)

**ROI:** 15 hours/month maintenance saved = $9,000/year

**Detailed Report:** [link to Confluence]
```

### Use Bullet Points for Multiple Findings

For tasks with several distinct findings, use bullets for scannability.

**Example: Data Quality Assessment**
```markdown
**Salesforce Data Quality - Assessment Complete**

**Objects Analyzed:** Account, Contact, Opportunity (50,000 total records)

**Data Quality Issues:**

**Account Object:**
- ✅ Phone: 98% populated, good quality
- ⚠️  Website: 45% populated, recommend enrichment
- 🔴 Industry: 23% populated, major gap

**Contact Object:**
- ✅ Email: 100% populated (validated)
- ⚠️  Title: 67% populated
- 🔴 Mobile: 12% populated, consider deprecating field

**Opportunity Object:**
- ✅ Amount: 100% populated (required field)
- ⚠️  Close Date: 89% populated (11% overdue, need cleanup)
- 🔴 Next Step: 34% populated, low adoption

**Priority Actions:**
1. Industry field: Launch enrichment project → target 80% population
2. Contact Mobile: Archive field (low value, high maintenance)
3. Opportunity Next Step: Training campaign → improve adoption to 70%

**Impact:** Improved data quality → better reporting, forecasting, and segmentation
```

## Project Setup Standards

When creating Asana projects from specifications (e.g., via implementation-planner agent or /plan-from-spec command), follow these mandatory project setup standards to ensure complete, professional project configuration.

### Timeline Calculation Pattern

**REQUIREMENT:** All tasks must have realistic start and due dates calculated using working days (excluding weekends).

**Implementation:**
```javascript
// Working days calculation (skip weekends)
function addWorkingDays(startDate, days) {
  let currentDate = new Date(startDate);
  let addedDays = 0;

  while (addedDays < days) {
    currentDate.setDate(currentDate.getDate() + 1);
    // Skip weekends
    if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
      addedDays++;
    }
  }

  return currentDate;
}

// Calculate task dates based on dependencies
function calculateDates(task, dependencies) {
  const workingDays = Math.ceil(task.estimatedHours / 8); // 8-hour workdays

  // Find latest end date of all dependencies
  let startDate = new Date(projectStartDate);
  for (const depId of task.dependencies) {
    const depDates = calculateDates(dependencies[depId]);
    if (depDates.dueDate > startDate) {
      startDate = new Date(depDates.dueDate);
      startDate.setDate(startDate.getDate() + 1); // Start day after dependency ends
    }
  }

  const dueDate = addWorkingDays(startDate, workingDays);
  return { startDate, dueDate, workingDays };
}

// Apply to all tasks
for (const task of tasks) {
  const dates = calculateDates(task, taskMap);

  await asana.update_task(task.gid, {
    start_on: formatDate(dates.startDate),  // YYYY-MM-DD
    due_on: formatDate(dates.dueDate)
  });
}
```

**Why Required:** Provides realistic project timeline, enables Gantt view, allows progress tracking.

### Milestone Creation Requirements

**REQUIREMENT:** Create phase milestone tasks that gate completion of each project phase.

**Implementation:**
```javascript
for (const phase of projectPhases) {
  // Calculate milestone due date (latest task in phase)
  let latestDate = projectStartDate;
  for (const task of phase.tasks) {
    if (task.dueDate > latestDate) {
      latestDate = task.dueDate;
    }
  }

  // Create milestone task
  const milestone = await asana.create_task({
    projects: [projectId],
    name: `✅ ${phase.name} Complete`,
    resource_subtype: 'milestone',  // Important: marks as milestone
    due_on: formatDate(latestDate),
    notes: `**Phase Completion Milestone**

All tasks in ${phase.name} phase must be completed:
${phase.tasks.map(t => `- ${t.id}: ${t.title}`).join('\n')}

**Total Effort**: ${phase.estimatedHours} hours
**Tasks**: ${phase.tasks.length} tasks`,
    memberships: [{
      project: projectId,
      section: phase.sectionId
    }]
  });

  // Link all phase tasks as dependencies to milestone
  for (const task of phase.tasks) {
    await asana.add_task_dependencies({
      task_gid: milestone.gid,
      dependencies: [task.gid]
    });
  }
}
```

**Why Required:** Provides visual phase gates, enables progress tracking, clarifies completion criteria.

### Custom Field Initialization

**REQUIREMENT:** Set default values for Effort and Status custom fields on all tasks.

**Implementation:**
```javascript
// Query project to get custom field definitions
const project = await asana.get_project({ project_gid: projectId });
const customFieldSettings = project.custom_field_settings || [];

// Find Effort and Status fields
let effortField = null;
let statusField = null;

for (const setting of customFieldSettings) {
  const field = setting.custom_field;
  if (field.name.toLowerCase().includes('effort') ||
      field.name.toLowerCase().includes('hours')) {
    effortField = field;
  }
  if (field.name.toLowerCase().includes('status')) {
    statusField = field;
  }
}

// Set defaults for each task
for (const task of tasks) {
  const customFieldUpdates = {};

  // Set Effort field
  if (effortField) {
    if (effortField.resource_subtype === 'number') {
      customFieldUpdates[effortField.gid] = task.estimatedHours;
    } else if (effortField.resource_subtype === 'text') {
      customFieldUpdates[effortField.gid] = `${task.estimatedHours} hours`;
    }
  }

  // Set Status field to "Not Started"
  if (statusField && statusField.resource_subtype === 'enum') {
    const notStartedOption = statusField.enum_options.find(opt =>
      opt.name.toLowerCase().includes('not started') ||
      opt.name.toLowerCase().includes('to do') ||
      opt.name.toLowerCase().includes('pending')
    );
    const defaultOption = notStartedOption || statusField.enum_options[0];
    customFieldUpdates[statusField.gid] = defaultOption.gid;
  }

  if (Object.keys(customFieldUpdates).length > 0) {
    await asana.update_task({
      task_gid: task.gid,
      custom_fields: customFieldUpdates
    });
  }
}
```

**Why Required:** Enables filtering, sorting, capacity planning, and progress tracking.

### Section Organization Best Practices

**REQUIREMENT:** Rename default "Untitled section" and organize sections by project phase.

**Implementation:**
```javascript
// Query existing sections
const sections = await asana.get_project_sections({ project_gid: projectId });

// Rename untitled sections
for (const section of sections) {
  if (section.name.toLowerCase() === 'untitled section' ||
      section.name === '(no section)' ||
      section.name === '') {

    await asana.update_section({
      section_gid: section.gid,
      name: 'Planning & Summary'
    });
  }
}

// Create phase sections if not exist
const standardPhases = ['Foundation', 'Configuration', 'Automation', 'Integration', 'Testing'];

for (const phaseName of standardPhases) {
  if (!sections.find(s => s.name.includes(phaseName))) {
    await asana.create_section({
      project_gid: projectId,
      name: phaseName
    });
  }
}
```

**Why Required:** Professional appearance, clear organization, easier navigation.

### Project Description Template

**REQUIREMENT:** Set comprehensive project description with objectives, scope, timeline, and phases.

**Implementation:**
```javascript
const projectDescription = `**${project.title}**

${project.summary}

**Business Objectives:**
${project.objectives.map(obj => `• ${obj}`).join('\n')}

**Project Scope:**
${project.phases.map(phase =>
  `• ${phase.name}: ${phase.tasks.length} tasks, ${phase.estimatedHours} hours`
).join('\n')}

**Timeline:**
- Start Date: ${formatDate(projectStartDate)}
- Estimated Completion: ${formatDate(projectEndDate)}
- Total Effort: ${project.totalHours} hours

**Phases:**
${project.phases.map((p, i) =>
  `${i + 1}. ${p.name} (${p.tasks.length} tasks, ${p.estimatedHours} hours)`
).join('\n')}

**Key Features:**
${project.scope.included.map(item => `• ${item}`).join('\n')}

---
Generated by ${agentName}`;

await asana.update_project({
  project_gid: projectId,
  notes: projectDescription
});
```

**Why Required:** Provides context for stakeholders, clarifies scope, sets expectations.

### Complete Project Setup Checklist

Before finishing project creation, verify:

- [ ] **Timeline calculated** - All tasks have start_on and due_on dates
- [ ] **Working days used** - Timeline excludes weekends
- [ ] **Dependencies linked** - Both explicit and implicit dependencies set
- [ ] **Milestones created** - One milestone per phase
- [ ] **Milestone dependencies** - All phase tasks linked to milestone
- [ ] **Custom fields set** - Effort hours and Status defaults applied
- [ ] **Sections organized** - Phases mapped to sections, no untitled sections
- [ ] **Project description** - Comprehensive overview with objectives and timeline
- [ ] **Summary task created** - Top-level task with plan overview

### Example: Complete Project Setup

```javascript
// Full example from CPQ-Lite project setup
async function setupAsanaProject(specification, projectId) {
  // 1. Create tasks from spec
  const tasks = await createTasksFromSpec(specification, projectId);

  // 2. Calculate timeline
  const taskDates = calculateProjectTimeline(tasks, new Date());

  // 3. Set task dates
  for (const [taskId, dates] of taskDates.entries()) {
    await asana.update_task({
      task_gid: taskId,
      start_on: formatDate(dates.startDate),
      due_on: formatDate(dates.dueDate)
    });
  }

  // 4. Set custom field defaults
  await setCustomFieldDefaults(projectId, tasks);

  // 5. Create phase milestones
  await createPhaseMilestones(specification.phases, projectId);

  // 6. Rename default sections
  await organizeSections(projectId, specification.phases);

  // 7. Set project description
  await setProjectDescription(projectId, specification);

  // 8. Create summary task
  await createSummaryTask(projectId, specification);

  console.log('✅ Project setup complete!');
}
```

## Brevity & Clarity Standards

### Length Limits

Follow these guidelines for update length:

| Update Type | Target Length | Max Length | Format |
|-------------|---------------|------------|--------|
| Progress checkpoint | 50-75 words | 100 words | Bullets + brief narrative |
| Blocker notification | 40-60 words | 80 words | Structured (Issue/Impact/Needs) |
| Completion summary | 60-100 words | 150 words | Bullets + metrics |
| Milestone update | 100-150 words | 200 words | Structured sections |
| Project status | 150-200 words | 300 words | Executive summary format |

### Language Guidelines

**Do:**
- Use active voice ("Completed data audit" not "Data audit was completed")
- Start with action verbs (Completed, Analyzed, Identified, Fixed)
- Use specific numbers ("50 duplicates" not "some duplicates")
- Include concrete outcomes ("$18K ROI" not "significant savings")
- Link to detailed reports for full analysis

**Don't:**
- Use passive voice or vague language
- Include process details ("I ran a script to...")
- Add pleasantries ("I'm happy to report...")
- Repeat information already in the task
- Explain obvious things ("As you requested...")

### Self-Editing Checklist

Before posting an update, verify:

- [ ] **Under target word count?** (see table above)
- [ ] **Includes key metrics or outcomes?** (numbers, percentages)
- [ ] **Clear on next steps or blockers?** (actionable)
- [ ] **No redundant information?** (each sentence adds value)
- [ ] **Tagged right people if action needed?** (@mentions)
- [ ] **Formatted for easy scanning?** (bullets, bold, emojis)
- [ ] **Linked to detailed docs if needed?** (not dumping data)

## Integration with Existing Agents

### For Reflection Processing (supabase-asana-bridge)

The existing reflection processing system already uses detailed templates. Continue using those for reflection cohort tasks, as they serve a different purpose (comprehensive improvement plans).

For **agent-generated updates during implementation**, use these playbook standards.

### For Salesforce/HubSpot Operations

When Salesforce or HubSpot agents perform work tracked in Asana:

1. **Read the task** using `asana-task-reader.js` to understand requirements
2. **Perform the work** as specified
3. **Post checkpoint updates** every 2-4 hours or at major milestones
4. **Use brevity templates** from `../templates/asana-updates/`
5. **Update custom fields** for at-a-glance status
6. **Post completion summary** with metrics and handoff info

### For Multi-Agent Workflows

When orchestrator agents delegate to specialists:

1. **Create subtasks** for each specialist's work
2. **Each agent updates its own subtask** (not parent)
3. **Orchestrator aggregates** progress to parent task
4. **Use milestone updates** when phases complete

## Tools & Utilities

### Asana Task Reader

**Location:** `.claude-plugins/cross-platform-plugin/scripts/lib/asana-task-reader.js`

**Purpose:** Parse Asana tasks into agent-friendly format

**Usage:**
```javascript
const { asanaTaskReader } = require('../scripts/lib/asana-task-reader');

// Read full task context
const context = await asanaTaskReader.parseTask(taskId, {
  includeComments: true,
  includeProject: true,
  includeDependencies: true
});

// Access parsed data
console.log(context.fields.priority); // "High"
console.log(context.instructions); // Parsed from description
console.log(context.projectContext.objectives);
```

### Asana Update Formatter

**Location:** `.claude-plugins/cross-platform-plugin/scripts/lib/asana-update-formatter.js`

**Purpose:** Format updates according to brevity standards

**Usage:**
```javascript
const { asanaUpdateFormatter } = require('../scripts/lib/asana-update-formatter');

// Format progress update
const update = asanaUpdateFormatter.formatProgress({
  completed: ['Exported data', 'Cleaned records'],
  inProgress: 'Importing batch 1 of 3',
  nextSteps: ['Complete batches 2-3', 'Run dedup check'],
  status: 'On Track'
});

// Validates brevity and returns formatted markdown
console.log(update.text); // Formatted update
console.log(update.wordCount); // 45 words
console.log(update.valid); // true
```

### Asana Roadmap Manager

**Location:** `.claude-plugins/cross-platform-plugin/scripts/lib/asana-roadmap-manager.js`

**Purpose:** Break down projects into trackable subtasks

**Usage:**
```javascript
const { asanaRoadmapManager } = require('../scripts/lib/asana-roadmap-manager');

// Create roadmap from project description
await asanaRoadmapManager.createRoadmap({
  parentTaskId: taskId,
  projectId: projectId,
  phases: [
    {
      name: 'Discovery',
      steps: [
        { title: 'Gather requirements', effort: 2 },
        { title: 'Design solution', effort: 4 }
      ]
    },
    {
      name: 'Implementation',
      steps: [
        { title: 'Build component A', effort: 8 },
        { title: 'Build component B', effort: 6 }
      ]
    }
  ]
});
```

## Examples & Patterns

### Example 1: Multi-Day Salesforce Assessment

**Day 1 Checkpoint:**
```markdown
**Progress Update** - Salesforce CPQ Assessment

**Today's Work:**
- ✅ Quote object analysis (120 custom fields reviewed)
- ✅ Approval workflow mapping (8 workflows documented)

**Key Findings:**
- 15% of Quote fields unused (0% population)
- 3 approval workflows can be consolidated

**Tomorrow:**
- Product catalog audit
- Pricing rule analysis

**Status:** On schedule for Friday delivery
```

**Day 2 Checkpoint:**
```markdown
**Progress Update** - Salesforce CPQ Assessment

**Today's Work:**
- ✅ Product catalog audit (250 products analyzed)
- ✅ Pricing rule analysis (43 rules reviewed)

**Key Findings:**
- 12 deprecated products still active (should archive)
- Pricing rule complexity: 67% higher than industry benchmark

**Tomorrow:**
- Generate recommendations report
- Prepare executive summary

**Status:** On schedule - 75% complete
```

**Completion:**
```markdown
**✅ COMPLETED** - Salesforce CPQ Assessment

**Deliverables:**
- Full assessment report (45 pages): [link]
- Executive summary (2 pages): [link]
- Optimization roadmap: [link]

**Key Findings:**
- $127K annual savings opportunity identified
- 23 quick wins (< 4 hours each)
- 5 major initiatives (2-6 weeks each)

**Top 3 Priorities:**
1. Archive 15% unused Quote fields → 25% page load improvement
2. Consolidate 3 approval workflows → Save 15 hours/month
3. Deprecate 12 inactive products → Reduce catalog confusion

**ROI:** $127K/year savings, 18-week payback period

**Handoff:** @executive-sponsor for priority review and approval
```

### Example 2: HubSpot Workflow Automation

**Starting Work:**
```markdown
**Started** - HubSpot Lead Nurture Workflow

**Scope:**
- Create 3-email nurture sequence
- Set up lead scoring automation
- Configure re-engagement trigger

**Estimated Effort:** 6 hours
**Target Completion:** Friday EOD

**Plan:**
1. Design email templates (2 hours)
2. Build workflow logic (3 hours)
3. Test and activate (1 hour)
```

**Checkpoint:**
```markdown
**Progress Update** - HubSpot Lead Nurture Workflow

**Completed:**
- ✅ Email templates designed and approved
- ✅ Workflow logic built and tested in sandbox

**In Progress:**
- Running test with 50 sandbox contacts

**Blocker:**
- Need approval to activate in production
- @marketing-manager please review workflow: [link]

**Status:** Awaiting approval - can activate within 30 min of approval
```

**Completion:**
```markdown
**✅ COMPLETED** - HubSpot Lead Nurture Workflow

**Deliverables:**
- 3-email nurture sequence (live)
- Lead scoring automation (live)
- Re-engagement trigger (live)
- Documentation: [link]

**Results:**
- Test run: 100% email delivery rate
- Workflows activated for 12,500 contacts
- Scoring rules applied retroactively

**Monitoring:**
- Dashboard configured: [link]
- Alert set for bounce rate > 2%

**Handoff:** @marketing-ops for ongoing monitoring

**Notes:** Review performance after 2 weeks - optimize based on engagement data
```

## Common Pitfalls to Avoid

### ❌ Pitfall 1: Verbose Process Descriptions

**Bad:**
```
I began by establishing a connection to the Salesforce API using the credentials
stored in the environment variables. Then I executed a SOQL query to retrieve all
Account records with their associated Contact records. I processed each record
through a data validation function to check for completeness...
```

**Good:**
```
**Completed:** Salesforce data quality audit
- Analyzed 10,000 Accounts with Contacts
- Identified 15% with missing critical fields
- Report: [link]
```

### ❌ Pitfall 2: Missing Concrete Data

**Bad:**
```
Found some duplicate records that need to be merged. Also found a few fields that
aren't being used. I recommend we clean these up.
```

**Good:**
```
**Duplicate Records:** 127 found (1.3% of database)
- Most common: duplicate emails (89 cases)
- Action: Merge duplicates using email as key

**Unused Fields:** 18 fields with 0% population
- Action: Archive to improve page load (25% faster)
```

### ❌ Pitfall 3: No Clear Next Steps

**Bad:**
```
The data migration is going well. I've processed most of the records and things
look good so far. Will continue working on this.
```

**Good:**
```
**Migration Progress:** 75% complete (7,500 of 10,000 records)

**Next Steps:**
- Import remaining 2,500 records (estimated 2 hours)
- Run deduplication check
- Generate validation report

**Completion Target:** Tomorrow 2pm
```

### ❌ Pitfall 4: Burying Important Info

**Bad:**
```
I've completed the analysis and found several things. The good news is that most
fields are in good shape, but there is one issue that might be concerning which is
that the API integration appears to be broken and hasn't been syncing data for the
past 3 weeks...
```

**Good:**
```
**🚨 CRITICAL:** API integration broken - 3 weeks of missing data

**Impact:**
- 4,200 records not synced from external system
- Dashboard metrics incomplete
- Monthly reports will be inaccurate

**Immediate Action Required:**
- @admin - restart API service
- @data-team - backfill missing 3 weeks

**Other Findings:** [see full report link]
```

---

## Version History

- **v1.0.0** (2025-10-25) - Initial playbook based on AI Agent Project Management spec integration
- Incorporates user feedback on update quality and verbosity
- Aligned with existing reflection processing patterns
- Integrated with asana-task-manager time tracking features

## References

- Original spec: AI Agent Project Management Playbook
- Existing integration: `asana-task-manager.md`
- Reflection system: `SUPABASE_REFLECTION_SYSTEM.md`
- Update templates: `../templates/asana-updates/`
- Utility scripts: `../scripts/lib/asana-*.js`

---

**Remember:** The goal is to make every Asana update **scannable**, **actionable**, and **valuable** for human team members. When in doubt, ask: "If I were managing this project, would this update help me make a decision or take action?" If not, revise until it does.
