# Project Management Patterns

## Project Setup Standards

### Timeline Calculation

**REQUIREMENT:** All tasks must have realistic start and due dates calculated using working days (excluding weekends).

```javascript
// Working days calculation (skip weekends)
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

// Calculate task dates based on dependencies
function calculateDates(task, dependencies) {
  const workingDays = Math.ceil(task.estimatedHours / 8); // 8-hour workdays

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

### Milestone Creation

**REQUIREMENT:** Create phase milestone tasks that gate completion of each project phase.

```javascript
for (const phase of projectPhases) {
  let latestDate = projectStartDate;
  for (const task of phase.tasks) {
    if (task.dueDate > latestDate) latestDate = task.dueDate;
  }

  const milestone = await asana.create_task({
    projects: [projectId],
    name: `✅ ${phase.name} Complete`,
    resource_subtype: 'milestone',  // Important: marks as milestone
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

### Custom Field Initialization

**REQUIREMENT:** Set default values for Effort and Status custom fields on all tasks.

```javascript
const project = await asana.get_project({ project_gid: projectId });
const customFieldSettings = project.custom_field_settings || [];

let effortField = null;
let statusField = null;

for (const setting of customFieldSettings) {
  const field = setting.custom_field;
  if (field.name.toLowerCase().includes('effort')) effortField = field;
  if (field.name.toLowerCase().includes('status')) statusField = field;
}

for (const task of tasks) {
  const customFieldUpdates = {};

  if (effortField) {
    if (effortField.resource_subtype === 'number') {
      customFieldUpdates[effortField.gid] = task.estimatedHours;
    } else if (effortField.resource_subtype === 'text') {
      customFieldUpdates[effortField.gid] = `${task.estimatedHours} hours`;
    }
  }

  if (statusField && statusField.resource_subtype === 'enum') {
    const notStartedOption = statusField.enum_options.find(opt =>
      opt.name.toLowerCase().includes('not started') ||
      opt.name.toLowerCase().includes('to do')
    );
    customFieldUpdates[statusField.gid] = notStartedOption?.gid;
  }

  if (Object.keys(customFieldUpdates).length > 0) {
    await asana.update_task({
      task_gid: task.gid,
      custom_fields: customFieldUpdates
    });
  }
}
```

### Section Organization

**REQUIREMENT:** Rename default "Untitled section" and organize sections by project phase.

```javascript
const sections = await asana.get_project_sections({ project_gid: projectId });

for (const section of sections) {
  if (section.name.toLowerCase() === 'untitled section') {
    await asana.update_section({
      section_gid: section.gid,
      name: 'Planning & Summary'
    });
  }
}

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

## Project Breakdown Pattern

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

## Complete Project Setup Checklist

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

## Project Description Template

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

---
Generated by ${agentName}`;

await asana.update_project({
  project_gid: projectId,
  notes: projectDescription
});
```

## Multi-Agent Workflow Pattern

When orchestrator agents delegate to specialists:

1. **Create subtasks** for each specialist's work
2. **Each agent updates its own subtask** (not parent)
3. **Orchestrator aggregates** progress to parent task
4. **Use milestone updates** when phases complete

```javascript
// Orchestrator creates specialist subtasks
const specialistTasks = [
  { name: 'Data Analysis', agent: 'data-analyst' },
  { name: 'UI Design', agent: 'ui-designer' },
  { name: 'Integration', agent: 'integration-specialist' }
];

for (const spec of specialistTasks) {
  await asana.create_subtask({
    parent_task_id: parentTaskId,
    name: spec.name,
    notes: `Assigned to: ${spec.agent}`,
    custom_fields: { agent_type: spec.agent }
  });
}

// Each specialist updates ONLY their subtask
// Orchestrator aggregates to parent
```
