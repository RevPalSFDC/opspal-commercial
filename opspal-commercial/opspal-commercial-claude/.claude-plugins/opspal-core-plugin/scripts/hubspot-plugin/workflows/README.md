# HubSpot Workflow Scripts

**Purpose:** Centralized location for all HubSpot workflow-related automation scripts.

**Last Updated:** 2025-10-12
**Maintainer:** RevPal Engineering

---

## Directory Structure

```
scripts/
├── workflows/          # Workflow-specific scripts (this directory)
│   ├── README.md      # This file
│   ├── validate-workflow-config.js       # [PLANNED] Validation utility
│   ├── cleanup-failed-modifications.js   # [PLANNED] Cleanup utility
│   └── [workflow modification scripts]
│
└── lib/               # Reusable libraries
    ├── workflow-api-client.js           # [PLANNED] Centralized API client
    ├── submit-reflection.js             # Reflection submission
    └── query-reflections.js             # Reflection queries
```

---

## Script Catalog

### Validation Scripts

#### `validate-workflow-config.js` [PLANNED]
**Status:** Not yet implemented (see Asana task 1211619302494708)

**Purpose:** Pre-flight and post-modification validation for workflow configurations

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/workflows/validate-workflow-config.js <workflow-id> [--portal-id=12345]
```

**Checks:**
- Pipeline stage IDs exist and match correct pipeline
- Association type IDs are valid for object type combinations
- Property names exist on target objects
- Branch filter structure is syntactically valid
- Workflow actions reference valid IDs (emails, lists, etc.)

**Exit Codes:**
- 0: All validations passed
- 1: Validation errors found
- 2: API connection failure

---

#### `cleanup-failed-modifications.js` [PLANNED]
**Status:** Not yet implemented

**Purpose:** Identify and remove artifacts from failed workflow modification attempts

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/workflows/cleanup-failed-modifications.js [--dry-run] [--older-than=7d]
```

**Removes:**
- Workflow backups older than 7 days
- Temporary files from failed modifications
- Incomplete scripts in workspace
- Orphaned configuration files

**Options:**
- `--dry-run`: Show what would be deleted without deleting
- `--older-than=7d`: Only clean files older than specified duration (default: 7 days)

---

### Workflow Modification Scripts

#### Template Script Structure

All workflow modification scripts should follow this pattern:

```javascript
#!/usr/bin/env node
/**
 * Script Name: [descriptive-name].js
 * Purpose: [one-line description]
 *
 * Usage: node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/workflows/[script-name].js <workflow-id> [options]
 *
 * Exit Codes:
 *   0: Success
 *   1: Validation failure
 *   2: API failure
 *   3: User cancellation
 */

const { WorkflowAPIClient } = require('../lib/workflow-api-client');

async function main() {
  // 1. Validate inputs
  // 2. Create backup
  // 3. Perform modification
  // 4. Validate result
  // 5. Rollback on failure
}

main().catch(console.error);
```

---

## API vs UI Automation Decision Matrix

When modifying workflows, use this decision tree:

### Use API (Fast Path)
✅ Simple property updates
✅ Adding/removing workflow actions (delays, emails, tasks)
✅ Updating enrollment criteria (simple filters)
✅ STATIC_BRANCH modifications (single-property splits)
✅ Changing pipeline stages

### Use UI Automation (Playwright Fallback)
⚠️ LIST_BRANCH modifications (complex if/then logic with AND/OR)
⚠️ AB_TEST_BRANCH modifications (A/B split testing)
⚠️ Complex branch filter logic
⚠️ When API returns 400/405 errors

### Manual UI (Last Resort)
❌ Campaign associations (no API support)
❌ Non-contact workflows (deals, companies, tickets)
❌ Workflows requiring UI-only features

**Reference:** See `docs/hubspot/workflow-api-limitations.md` for complete API limitations

---

## Common Workflows

### 1. Add Conditional Branching

```bash
# Option 1: API (for STATIC_BRANCH only)
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/workflows/add-static-branch.js <workflow-id> --property=lifecyclestage

# Option 2: UI Automation (for complex LIST_BRANCH)
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/workflows/add-list-branch-ui.js <workflow-id> --conditions=conditions.json
```

### 2. Validate Before Deployment

```bash
# Always run before production deployment
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/workflows/validate-workflow-config.js <workflow-id>
```

### 3. Update Pipeline Stage

```bash
# API-based, fast
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/workflows/update-pipeline-stage.js <workflow-id> --stage-id=1234567
```

### 4. Clone Workflow Across Portals

```bash
# Export structure
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/workflows/export-workflow.js <source-workflow-id> > workflow-template.json

# Import to new portal
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/workflows/import-workflow.js workflow-template.json --portal-id=98765
```

---

## Best Practices

### Always Create Backups
```javascript
const backup = await client.getWorkflow(workflowId);
fs.writeFileSync(`backups/workflow-${workflowId}-${Date.now()}.json`, JSON.stringify(backup, null, 2));
```

### Validate Before and After
```javascript
// Pre-flight checks
await validateWorkflowConfig(workflowId);

// Perform modification
await client.updateWorkflow(workflowId, updates);

// Post-modification verification
await validateWorkflowConfig(workflowId);
```

### Use Transaction Pattern
```javascript
try {
  const backup = await createBackup(workflowId);
  await modifyWorkflow(workflowId, changes);
  await verifyModification(workflowId);
} catch (error) {
  console.error('Modification failed, rolling back...');
  await restoreFromBackup(backup);
  throw error;
}
```

### Handle API Failures Gracefully
```javascript
try {
  await updateWorkflowViaAPI(workflowId, changes);
} catch (error) {
  if (error.status === 400 || error.status === 405) {
    console.log('API modification failed, switching to UI automation...');
    await updateWorkflowViaUI(workflowId, changes);
  } else {
    throw error;
  }
}
```

---

## Environment Variables

Required environment variables for workflow scripts:

```bash
# HubSpot Authentication
HUBSPOT_API_KEY=your-api-key          # OR
HUBSPOT_ACCESS_TOKEN=your-token       # Preferred (OAuth)

# Default Portal
HUBSPOT_PORTAL_ID=12345678            # Optional, can be passed as --portal-id

# Workflow Settings
WORKFLOW_BACKUP_DIR=./backups         # Default: ./backups
WORKFLOW_VALIDATION_STRICT=true       # Fail on warnings
```

---

## Troubleshooting

### Common Issues

#### "Cannot find module '../lib/workflow-api-client'"
**Solution:** The workflow-api-client.js hasn't been created yet. Use direct API calls or create the client library.

#### "API returned 400: Invalid request to flow update"
**Problem:** You're trying to create/modify a LIST_BRANCH action via API
**Solution:** Use UI automation fallback (see Asana task 1211619302494708)

#### "Pipeline stage ID not found"
**Problem:** Using incorrect stage ID for the pipeline
**Solution:** Run validation script to cross-reference stage IDs

#### "Workflow backup files accumulating"
**Solution:** Run cleanup script: `node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/workflows/cleanup-failed-modifications.js`

---

## Related Documentation

- [HubSpot Workflows API Limitations](../../docs/hubspot/workflow-api-limitations.md)
- [Workflow Modification Playbook](../../docs/playbooks/hubspot-workflow-branching.md)
- [HubSpot Plugin README](../../README.md)
- [Asana Task: Hybrid API + Browser Automation](https://app.asana.com/0/1211617834659194/1211619302494708)

---

## Contributing

When adding new workflow scripts:

1. **Follow the template structure** above
2. **Add entry to this README** in the appropriate section
3. **Include validation checks** before and after modifications
4. **Create backups** before destructive operations
5. **Handle API failures** with graceful fallbacks
6. **Document exit codes** and error handling
7. **Add tests** in `tests/workflows/` if applicable

---

## Future Enhancements

Planned improvements (see Asana "OpsPal - Reflection Improvements"):

- [ ] Centralized workflow API client with retry logic
- [ ] Playwright browser automation framework for LIST_BRANCH modifications
- [ ] Automated validation suite for workflow configurations
- [ ] Workflow template library for common patterns
- [ ] Cross-portal workflow synchronization tool
- [ ] Workflow performance analytics and optimization suggestions

---

**Need Help?**
- Check the [HubSpot Workflows API Documentation](https://developers.hubspot.com/docs/api/automation/workflows)
- Review reflection ID `dc5c05e3-e712-40e0-8ab9-bfeaf4b56934` for real-world examples
- See Asana tasks in "OpsPal - Reflection Improvements" project
