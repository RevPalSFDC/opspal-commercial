# Error Scenarios and Recovery

## Common Errors

### Permission Errors

**Error:** `403 Forbidden - Insufficient permissions`

**Causes:**
- Token doesn't have required scopes
- User not member of project
- Task in private project

**Recovery:**
```javascript
try {
  await asana.update_task(taskId, updates);
} catch (error) {
  if (error.status === 403) {
    console.error('Permission denied. Verify:');
    console.error('1. Token has correct scopes');
    console.error('2. User is project member');
    throw new Error(`Cannot update task ${taskId}: Permission denied`);
  }
  throw error;
}
```

### Rate Limiting

**Error:** `429 Too Many Requests`

**Recovery with Exponential Backoff:**
```javascript
async function updateWithRetry(taskId, updates, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await asana.update_task(taskId, updates);
    } catch (error) {
      if (error.status === 429) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.log(`Rate limited, retrying in ${backoffMs}ms...`);
        await sleep(backoffMs);
      } else {
        throw error;
      }
    }
  }
  throw new Error(`Failed after ${maxRetries} retries`);
}
```

### Invalid Task/Project

**Error:** `404 Not Found`

**Causes:**
- Task/project deleted
- Invalid GID
- Access revoked

**Recovery:**
```javascript
try {
  const task = await asana.get_task(taskId);
} catch (error) {
  if (error.status === 404) {
    console.error(`Task ${taskId} not found or inaccessible`);
    // Log for audit, skip this task
    return null;
  }
  throw error;
}
```

### Invalid Custom Field Values

**Error:** `400 Bad Request - Invalid enum option`

**Prevention:**
```javascript
// Query valid options before setting
const project = await asana.get_project(projectId);
const statusField = project.custom_field_settings
  .find(f => f.custom_field.name === 'Status');

const validOptions = statusField.custom_field.enum_options
  .map(opt => ({ gid: opt.gid, name: opt.name }));

// Find matching option
const statusOption = validOptions.find(opt =>
  opt.name.toLowerCase().includes('in progress')
);

await asana.update_task(taskId, {
  custom_fields: {
    [statusField.custom_field.gid]: statusOption.gid
  }
});
```

## Validation Patterns

### Pre-Update Validation

```javascript
async function validateBeforeUpdate(taskId, updates) {
  const errors = [];

  // 1. Verify task exists
  try {
    await asana.get_task(taskId);
  } catch (e) {
    errors.push(`Task ${taskId} not accessible`);
    return errors;
  }

  // 2. Validate custom field values
  if (updates.custom_fields) {
    const project = await asana.get_project(projectId);
    for (const [fieldGid, value] of Object.entries(updates.custom_fields)) {
      const field = project.custom_field_settings
        .find(f => f.custom_field.gid === fieldGid);

      if (!field) {
        errors.push(`Unknown custom field: ${fieldGid}`);
        continue;
      }

      if (field.custom_field.resource_subtype === 'enum') {
        const validOption = field.custom_field.enum_options
          .find(opt => opt.gid === value);
        if (!validOption) {
          errors.push(`Invalid enum value for ${field.custom_field.name}`);
        }
      }
    }
  }

  return errors;
}
```

### Safe Update Pattern

```javascript
async function safeTaskUpdate(taskId, updates) {
  // 1. Validate
  const errors = await validateBeforeUpdate(taskId, updates);
  if (errors.length > 0) {
    throw new Error(`Validation failed:\n${errors.join('\n')}`);
  }

  // 2. Create backup
  const original = await asana.get_task(taskId);

  try {
    // 3. Apply update
    const result = await asana.update_task(taskId, updates);

    // 4. Verify
    const updated = await asana.get_task(taskId);
    const verified = verifyUpdate(updates, updated);

    if (!verified) {
      throw new Error('Update verification failed');
    }

    return result;

  } catch (error) {
    // 5. Rollback on failure
    console.error(`Update failed: ${error.message}`);
    console.log('Backup available:', original);
    throw error;
  }
}
```

## Bulk Operation Handling

### Batch Updates with Error Isolation

```javascript
async function batchUpdateTasks(tasks, updates) {
  const results = {
    succeeded: [],
    failed: []
  };

  for (const task of tasks) {
    try {
      await safeTaskUpdate(task.gid, updates);
      results.succeeded.push(task.gid);
    } catch (error) {
      results.failed.push({
        taskGid: task.gid,
        error: error.message
      });
      // Continue with other tasks
    }
  }

  console.log(`Batch complete: ${results.succeeded.length} succeeded, ${results.failed.length} failed`);
  return results;
}
```

### Transactional Pattern

```javascript
async function transactionalProjectUpdate(projectId, updates) {
  // 1. Create checkpoint
  const checkpoint = await exportProjectState(projectId);
  const checkpointPath = `backups/project-${projectId}-${Date.now()}.json`;
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));

  try {
    // 2. Apply all updates
    for (const update of updates) {
      await applyUpdate(update);
    }

    // 3. Verify final state
    const finalState = await exportProjectState(projectId);
    if (!verifyProjectState(finalState, updates)) {
      throw new Error('Project state verification failed');
    }

    console.log(`Project updated successfully. Checkpoint: ${checkpointPath}`);

  } catch (error) {
    // 4. Rollback
    console.error(`Update failed: ${error.message}`);
    console.log('Rolling back from checkpoint...');
    await restoreFromCheckpoint(checkpoint);
    throw error;
  }
}
```
