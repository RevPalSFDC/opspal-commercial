# Asana API Patterns

## Reading Task Context

### Full Task Parsing

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
    .slice(-10);

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

### Task Reader Pattern

```javascript
const { asanaTaskReader } = require('./asana-task-reader');

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

## Writing Updates

### Post Comment Update

```javascript
await asana.add_comment(taskId, {
  text: `
**Progress Update** - Data Migration

**Completed:**
- ✅ Exported 10,200 contacts from legacy CRM
- ✅ Cleaned and validated all required fields

**In Progress:**
- Importing batch 1 of 3 (estimated 2 hours)

**Next Steps:**
- Complete import batches 2-3
- Run deduplication check

**Status:** On track for Friday delivery
  `
});
```

### Update Custom Fields

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

```javascript
// Mark in progress when starting
await asana.update_task(taskId, {
  assignee: 'me',
  completed: false,
  custom_fields: { status: 'In Progress' }
});

// Mark complete when done
await asana.update_task(taskId, {
  completed: true,
  completed_at: new Date().toISOString(),
  custom_fields: { status: 'Complete' }
});

// Mark blocked if stuck
await asana.update_task(taskId, {
  custom_fields: { status: 'Blocked' },
  tags: ['blocked']
});
```

## Project Management

### Create Subtask Roadmap

```javascript
async function createProjectRoadmap(projectDescription) {
  const phases = identifyProjectPhases(projectDescription);

  const parentTask = await asana.create_task({
    name: projectDescription.title,
    notes: projectDescription.summary,
    projects: [projectDescription.projectId]
  });

  for (const phase of phases) {
    const subtasks = phase.steps.map(step => ({
      name: step.title,
      notes: step.description,
      parent: parentTask.gid,
      custom_fields: { estimated_hours: step.effort }
    }));

    await Promise.all(
      subtasks.map(st => asana.create_task(st))
    );
  }

  await asana.add_comment(parentTask.gid, {
    text: generateRoadmapSummary(phases)
  });
}
```

### Track Subtask Progress

```javascript
async function completeSubtask(subtaskId, parentTaskId, results) {
  // 1. Mark subtask complete
  await asana.update_task(subtaskId, { completed: true });

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
    custom_fields: { progress_percentage: progress }
  });
}
```

### Project Status Update

```javascript
await asana.create_project_status({
  project: projectId,
  text: `
**Weekly Status** - Week of ${formatDate(new Date())}

**Overall Progress:** 60% complete (12 of 20 tasks done)

**This Week's Highlights:**
- Completed discovery phase (on schedule)
- Identified 15 optimization opportunities

**Next Week's Focus:**
- Begin implementation planning
- Create technical specifications

**Risks:**
- Vendor API integration may require additional time

**Health:** On Track ✅
  `,
  status_type: 'on_track' // on_track, at_risk, off_track
});
```

## Timeline Management

### Working Days Calculation

```javascript
function addWorkingDays(startDate, days) {
  let currentDate = new Date(startDate);
  let addedDays = 0;

  while (addedDays < days) {
    currentDate.setDate(currentDate.getDate() + 1);
    if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
      addedDays++;
    }
  }

  return currentDate;
}

function calculateDates(task, dependencies) {
  const workingDays = Math.ceil(task.estimatedHours / 8);

  let startDate = new Date(projectStartDate);
  for (const depId of task.dependencies) {
    const depDates = calculateDates(dependencies[depId]);
    if (depDates.dueDate > startDate) {
      startDate = new Date(depDates.dueDate);
      startDate.setDate(startDate.getDate() + 1);
    }
  }

  const dueDate = addWorkingDays(startDate, workingDays);
  return { startDate, dueDate, workingDays };
}
```

### Create Milestone Tasks

```javascript
for (const phase of projectPhases) {
  let latestDate = projectStartDate;
  for (const task of phase.tasks) {
    if (task.dueDate > latestDate) {
      latestDate = task.dueDate;
    }
  }

  const milestone = await asana.create_task({
    projects: [projectId],
    name: `✅ ${phase.name} Complete`,
    resource_subtype: 'milestone',
    due_on: formatDate(latestDate),
    notes: `**Phase Completion Milestone**

All tasks in ${phase.name} phase must be completed.
**Total Effort**: ${phase.estimatedHours} hours
**Tasks**: ${phase.tasks.length} tasks`
  });

  // Link all phase tasks as dependencies
  for (const task of phase.tasks) {
    await asana.add_task_dependencies({
      task_gid: milestone.gid,
      dependencies: [task.gid]
    });
  }
}
```
