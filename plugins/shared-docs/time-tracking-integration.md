# Asana Time Tracking Integration Pattern
# Version: 1.0.0
# Last Updated: 2025-10-27
#
# This file defines standard patterns for integrating time tracking
# with Asana task management across agents.
#
# **Usage**: @import ../../shared-docs/time-tracking-integration.md
#
# **Cacheable**: Yes - This pattern is stable and can be reused

---

## Overview

This integration pattern allows agents to track estimated vs actual task completion times, monitor processing efficiency, generate time savings reports, and update Asana with completion metrics.

**Benefits:**
- Track agent performance and efficiency
- Demonstrate ROI of automation
- Identify optimization opportunities
- Provide stakeholder visibility

---

## Required Setup

Before processing any Asana tasks with time tracking, load the time tracking utilities:

```javascript
// Load time tracking utilities - REQUIRED for all task processing
const { asanaTimeIntegration } = require('${PROJECT_ROOT:-/path/to/project}/ClaudeSFDC/utils/asana-time-integration.js');
const { timeTracker } = require('${PROJECT_ROOT:-/path/to/project}/ClaudeSFDC/utils/time-tracker.js');
```

---

## Time Tracking Workflow

### 1. Start Task Processing

When beginning to process any Asana task:

```javascript
// Start time tracking for the task
const trackingData = await asanaTimeIntegration.startAsanaTask(
  asanaTaskId,
  'agent-name',  // Your agent's identifier
  {
    estimatedMinutes: extractedEstimate, // From task or default
    complexity: 'moderate', // simple|moderate|complex|project
    taskType: 'general', // metadata|security|automation|data|etc
    asanaTask: asanaTaskObject // The full Asana task object
  }
);

console.log(`Started tracking task ${asanaTaskId}: estimated ${trackingData.estimatedMinutes} minutes`);
```

### 2. Add Progress Checkpoints

During task processing, add checkpoints for major steps:

```javascript
// Add checkpoints to track progress
asanaTimeIntegration.addAsanaCheckpoint(asanaTaskId, 'Data source connected');
asanaTimeIntegration.addAsanaCheckpoint(asanaTaskId, 'Validation complete');
asanaTimeIntegration.addAsanaCheckpoint(asanaTaskId, 'Processing started');
asanaTimeIntegration.addAsanaCheckpoint(asanaTaskId, 'Error handling complete');
```

### 3. Complete Task Processing

When finishing task processing:

```javascript
// Complete time tracking and update Asana
const completedTask = await asanaTimeIntegration.completeAsanaTask(
  asana, // MCP Asana client
  asanaTaskId,
  {
    success: true, // or false if failed
    errorMessage: null, // or error description
    results: {
      recordsProcessed: count,
      status: 'completed'
    }
  }
);

console.log(`Task completed: ${completedTask.timeSavedMinutes} minutes saved (${Math.round(completedTask.efficiencyRatio * 100)}% efficiency)`);
```

---

## Time Tracking Custom Fields

The integration automatically manages these Asana custom fields:

| Field Name | Type | Description |
|------------|------|-------------|
| **Agent Start Time** | DateTime | When agent started processing |
| **Agent End Time** | DateTime | When agent completed processing |
| **Estimated Minutes** | Number | Human estimated completion time |
| **Actual Minutes** | Number | Actual agent processing time |
| **Time Saved (Minutes)** | Number | Time saved by automation |
| **Efficiency Ratio** | Number | Efficiency percentage (estimated/actual) |
| **Processing Agent** | Text | Name of the agent that processed the task |
| **Task Complexity** | Enum | Simple, moderate, complex, or project |
| **Task Type** | Text | Category of the task (metadata, security, etc.) |
| **Agent Completion Status** | Enum | Success, failed, or partial |

---

## Common Integration Patterns

### Pattern 1: Simple Task Processing

```javascript
async function processTask(asanaTaskId) {
  // 1. Start tracking
  const tracking = await asanaTimeIntegration.startAsanaTask(
    asanaTaskId,
    'my-agent',
    {
      estimatedMinutes: 30,
      complexity: 'simple',
      taskType: 'data'
    }
  );

  try {
    // 2. Do work with checkpoints
    asanaTimeIntegration.addAsanaCheckpoint(asanaTaskId, 'Step 1 complete');
    await performStep1();

    asanaTimeIntegration.addAsanaCheckpoint(asanaTaskId, 'Step 2 complete');
    await performStep2();

    // 3. Complete successfully
    await asanaTimeIntegration.completeAsanaTask(asana, asanaTaskId, {
      success: true,
      results: { outcome: 'Task completed successfully' }
    });

  } catch (error) {
    // 4. Complete with error
    await asanaTimeIntegration.completeAsanaTask(asana, asanaTaskId, {
      success: false,
      errorMessage: error.message
    });
    throw error;
  }
}
```

### Pattern 2: Bulk Operation with Time Tracking

```javascript
async function processBulkOperation(asanaTaskId, records) {
  // Start tracking bulk operation
  const tracking = await asanaTimeIntegration.startAsanaTask(
    asanaTaskId,
    'bulk-processor',
    {
      estimatedMinutes: 120, // 2 hours
      complexity: 'complex',
      taskType: 'data',
      context: { recordCount: records.length }
    }
  );

  try {
    // Process records in batches
    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      asanaTimeIntegration.addAsanaCheckpoint(
        asanaTaskId,
        `Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(records.length/batchSize)}`
      );

      await processBatch(batch);
    }

    // Complete with results
    await asanaTimeIntegration.completeAsanaTask(asana, asanaTaskId, {
      success: true,
      results: {
        recordsProcessed: records.length,
        batchesProcessed: Math.ceil(records.length / batchSize)
      }
    });

  } catch (error) {
    await asanaTimeIntegration.completeAsanaTask(asana, asanaTaskId, {
      success: false,
      errorMessage: error.message
    });
    throw error;
  }
}
```

### Pattern 3: Multi-Step Workflow

```javascript
async function executeWorkflow(asanaTaskId) {
  // Start tracking
  await asanaTimeIntegration.startAsanaTask(
    asanaTaskId,
    'workflow-engine',
    {
      estimatedMinutes: 90,
      complexity: 'complex',
      taskType: 'automation'
    }
  );

  try {
    // Phase 1
    asanaTimeIntegration.addAsanaCheckpoint(asanaTaskId, 'Phase 1: Data extraction started');
    const data = await extractData();
    asanaTimeIntegration.addAsanaCheckpoint(asanaTaskId, 'Phase 1: Complete');

    // Phase 2
    asanaTimeIntegration.addAsanaCheckpoint(asanaTaskId, 'Phase 2: Transformation started');
    const transformed = await transformData(data);
    asanaTimeIntegration.addAsanaCheckpoint(asanaTaskId, 'Phase 2: Complete');

    // Phase 3
    asanaTimeIntegration.addAsanaCheckpoint(asanaTaskId, 'Phase 3: Loading started');
    await loadData(transformed);
    asanaTimeIntegration.addAsanaCheckpoint(asanaTaskId, 'Phase 3: Complete');

    // Complete
    await asanaTimeIntegration.completeAsanaTask(asana, asanaTaskId, {
      success: true,
      results: {
        recordsExtracted: data.length,
        recordsTransformed: transformed.length,
        recordsLoaded: transformed.length
      }
    });

  } catch (error) {
    await asanaTimeIntegration.completeAsanaTask(asana, asanaTaskId, {
      success: false,
      errorMessage: error.message
    });
    throw error;
  }
}
```

---

## Time Tracking Reports

### Generate Project Time Report

```javascript
async function generateProjectTimeReport(projectId) {
  // Get all tasks for the project
  const tasks = await asana.list_tasks(projectId);
  const asanaTaskIds = tasks.map(t => t.gid);

  // Generate comprehensive report
  const report = asanaTimeIntegration.generateAsanaReport(asanaTaskIds);

  // Add project-specific metrics
  report.projectMetrics = {
    projectId,
    totalTasksProcessed: report.summary.totalTasks,
    averageTaskTime: Math.round(report.summary.totalActualTime / report.summary.totalTasks),
    totalTimeSavedHours: Math.round(report.summary.totalTimeSaved / 60 * 10) / 10,
    efficiencyScore: Math.round(report.summary.averageEfficiency * 100)
  };

  return report;
}
```

### Daily Time Summary

```javascript
async function generateDailyTimeSummary() {
  const report = timeTracker.generateReport();

  // Create summary comment for key stakeholders
  let summary = `📊 **Daily Agent Processing Summary** (${new Date().toDateString()})\n\n`;
  summary += `🤖 **Overall Performance:**\n`;
  summary += `• Tasks completed: ${report.summary.totalTasks}\n`;
  summary += `• Total time saved: ${Math.round(report.summary.totalTimeSaved / 60 * 10) / 10} hours\n`;
  summary += `• Average efficiency: ${Math.round(report.summary.averageEfficiency * 100)}%\n\n`;

  summary += `📈 **By Agent:**\n`;
  Object.entries(report.byAgent).forEach(([agent, data]) => {
    const savedHours = Math.round(data.stats.totalSaved / 60 * 10) / 10;
    summary += `• ${agent}: ${data.tasks.length} tasks, ${savedHours}h saved\n`;
  });

  return summary;
}
```

---

## Best Practices

### 1. Always Start Tracking Before Work
```javascript
// ✅ GOOD: Track from the beginning
await asanaTimeIntegration.startAsanaTask(taskId, 'my-agent', { ... });
await doWork();
await asanaTimeIntegration.completeAsanaTask(asana, taskId, { ... });

// ❌ BAD: Work without tracking
await doWork();  // No tracking!
```

### 2. Add Meaningful Checkpoints
```javascript
// ✅ GOOD: Descriptive checkpoints
asanaTimeIntegration.addAsanaCheckpoint(taskId, 'Salesforce connection established');
asanaTimeIntegration.addAsanaCheckpoint(taskId, 'Data validation complete - 1,000 records valid');

// ❌ BAD: Generic checkpoints
asanaTimeIntegration.addAsanaCheckpoint(taskId, 'Step 1');
asanaTimeIntegration.addAsanaCheckpoint(taskId, 'Done');
```

### 3. Always Complete Tracking
```javascript
// ✅ GOOD: Complete even on error
try {
  await doWork();
  await asanaTimeIntegration.completeAsanaTask(asana, taskId, { success: true });
} catch (error) {
  await asanaTimeIntegration.completeAsanaTask(asana, taskId, {
    success: false,
    errorMessage: error.message
  });
  throw error;
}

// ❌ BAD: Don't complete on error
try {
  await doWork();
  await asanaTimeIntegration.completeAsanaTask(asana, taskId, { success: true });
} catch (error) {
  // No completion! Time tracking incomplete
  throw error;
}
```

### 4. Use Appropriate Complexity Levels
```javascript
// ✅ GOOD: Accurate complexity
const complexity = taskEstimateMinutes < 30 ? 'simple' :
                   taskEstimateMinutes < 120 ? 'moderate' :
                   taskEstimateMinutes < 480 ? 'complex' : 'project';

// ❌ BAD: Always use same complexity
const complexity = 'moderate';  // Inaccurate for all tasks
```

### 5. Include Context in Tracking Data
```javascript
// ✅ GOOD: Rich context
await asanaTimeIntegration.startAsanaTask(taskId, 'my-agent', {
  estimatedMinutes: 60,
  complexity: 'complex',
  taskType: 'data',
  context: {
    recordCount: 1000,
    operation: 'bulk_insert',
    targetObject: 'Account'
  }
});

// ❌ BAD: Minimal context
await asanaTimeIntegration.startAsanaTask(taskId, 'my-agent', {
  estimatedMinutes: 60
});
```

---

## Error Handling

### Handle Tracking Failures Gracefully

```javascript
try {
  await asanaTimeIntegration.startAsanaTask(taskId, 'my-agent', { ... });
} catch (trackingError) {
  // Log but don't fail the task
  console.warn('Time tracking failed to start:', trackingError);
}

// Continue with work
await doWork();

try {
  await asanaTimeIntegration.completeAsanaTask(asana, taskId, { ... });
} catch (trackingError) {
  // Log but don't fail the task
  console.warn('Time tracking failed to complete:', trackingError);
}
```

---

## Integration Checklist

When adding time tracking to an agent:

- [ ] **Import time tracking utilities** at the top of the agent
- [ ] **Start tracking** before beginning work
- [ ] **Add checkpoints** for major processing steps
- [ ] **Complete tracking** on success AND failure
- [ ] **Include context** (record counts, operation type, etc.)
- [ ] **Use appropriate complexity** level
- [ ] **Handle tracking failures** gracefully (don't fail task)
- [ ] **Test with actual Asana tasks** to verify custom fields update

---

## Related Documentation

- **Asana Integration Standards**: `../../shared-docs/asana-integration-standards.md`
- **Time Tracking Utilities**: `${PROJECT_ROOT}/ClaudeSFDC/utils/asana-time-integration.js`
- **Base Time Tracker**: `${PROJECT_ROOT}/ClaudeSFDC/utils/time-tracker.js`
- **Asana Task Manager Agent**: `.claude-plugins/opspal-core/agents/asana-task-manager.md` (reference implementation)

---

## Version History

- **1.0.0** (2025-10-27): Initial extraction from asana-task-manager agent, standardized for cross-agent use
