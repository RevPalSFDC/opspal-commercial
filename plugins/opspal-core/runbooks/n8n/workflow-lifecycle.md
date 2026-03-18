# Managing Workflow Lifecycle States

A solution-agnostic guide for managing n8n workflow states including activation, deactivation, archival, and scheduling.

## Purpose

This runbook provides procedures for managing the complete lifecycle of n8n workflows, from initial deployment through retirement. Proper lifecycle management ensures workflows run when needed and are safely retired when no longer required.

## Prerequisites

- [ ] n8n Cloud account with workflow management permissions
- [ ] n8n API key with workflow write access
- [ ] List of workflow IDs to manage
- [ ] Understanding of business requirements for each workflow

## Procedure

### Step 1: Understand Workflow States

**n8n Workflow States:**

| State | Description | Triggers Fire? | Manual Exec? |
|-------|-------------|----------------|--------------|
| **Inactive** | Default state after creation | No | Yes |
| **Active** | Running in production | Yes | Yes |
| **Paused** | Temporarily disabled | No | Yes |
| **Archived** | Preserved but hidden | No | No |

**Expected Result:** Understanding of each state's behavior.

### Step 2: Activate a Workflow

**Via UI:**
1. Navigate to Workflows
2. Find workflow by name
3. Toggle "Active" switch to ON
4. Confirm activation

**Via API:**
```bash
curl -X POST "https://your-instance.n8n.cloud/api/v1/workflows/{workflowId}/activate" \
  -H "X-N8N-API-KEY: $N8N_API_KEY"
```

**Via CLI (self-hosted):**
```bash
n8n execute --id {workflowId} --active
```

**Pre-Activation Checklist:**
- [ ] Workflow tested in sandbox
- [ ] Credentials configured for production
- [ ] Error handling in place
- [ ] Notification channels configured
- [ ] Rate limits considered

**Expected Result:** Workflow state changes to "Active", triggers begin firing.

### Step 3: Deactivate a Workflow

**Via API:**
```bash
curl -X POST "https://your-instance.n8n.cloud/api/v1/workflows/{workflowId}/deactivate" \
  -H "X-N8N-API-KEY: $N8N_API_KEY"
```

**When to Deactivate:**
- Scheduled maintenance window
- Investigating issues
- System dependency unavailable
- Business process change
- Testing modifications

**Pre-Deactivation Checklist:**
- [ ] Notify affected teams
- [ ] Verify no in-flight executions
- [ ] Document reason for deactivation
- [ ] Plan reactivation time (if temporary)

**Expected Result:** Workflow state changes to "Inactive", triggers stop firing.

### Step 4: Schedule Activation Windows

**Use Case:** Workflow should only run during business hours.

**Implementation with Schedule Trigger:**
```json
{
  "type": "n8n-nodes-base.scheduleTrigger",
  "parameters": {
    "rule": {
      "interval": [{
        "field": "cronExpression",
        "expression": "0 8-18 * * 1-5"
      }]
    }
  }
}
```

**Implementation with External Scheduler:**
1. Create activation script:
```bash
#!/bin/bash
# activate-workflow.sh
curl -X POST "https://your-instance.n8n.cloud/api/v1/workflows/$1/activate" \
  -H "X-N8N-API-KEY: $N8N_API_KEY"
```

2. Create deactivation script:
```bash
#!/bin/bash
# deactivate-workflow.sh
curl -X POST "https://your-instance.n8n.cloud/api/v1/workflows/$1/deactivate" \
  -H "X-N8N-API-KEY: $N8N_API_KEY"
```

3. Schedule with cron:
```bash
# Activate at 8 AM EST
0 8 * * 1-5 /path/to/activate-workflow.sh {workflowId}

# Deactivate at 6 PM EST
0 18 * * 1-5 /path/to/deactivate-workflow.sh {workflowId}
```

**Expected Result:** Workflow automatically activates/deactivates on schedule.

### Step 5: Bulk State Operations

**Activate Multiple Workflows:**
```bash
#!/bin/bash
# bulk-activate.sh
WORKFLOW_IDS=("id1" "id2" "id3")

for id in "${WORKFLOW_IDS[@]}"; do
  echo "Activating workflow: $id"
  curl -X POST "https://your-instance.n8n.cloud/api/v1/workflows/$id/activate" \
    -H "X-N8N-API-KEY: $N8N_API_KEY"
  sleep 1  # Rate limiting
done
```

**Deactivate by Tag (via API query):**
```bash
# Get workflows with tag
workflows=$(curl -s "https://your-instance.n8n.cloud/api/v1/workflows?tags=production" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq -r '.[].id')

# Deactivate each
for id in $workflows; do
  curl -X POST "https://your-instance.n8n.cloud/api/v1/workflows/$id/deactivate" \
    -H "X-N8N-API-KEY: $N8N_API_KEY"
done
```

**Expected Result:** Multiple workflows change state efficiently.

### Step 6: Archive Workflows

**When to Archive:**
- Workflow no longer needed
- Replaced by newer version
- Regulatory requirement to preserve

**Archive Process:**
1. Deactivate the workflow first
2. Export workflow JSON for backup:
```bash
curl -s "https://your-instance.n8n.cloud/api/v1/workflows/{workflowId}" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" > workflow-backup-$(date +%Y%m%d).json
```

3. Add "ARCHIVED" prefix to name:
```bash
curl -X PATCH "https://your-instance.n8n.cloud/api/v1/workflows/{workflowId}" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "[ARCHIVED] Original Workflow Name"}'
```

4. Move to "Archived" folder (if using folders)
5. Document archive reason and date

**Expected Result:** Workflow preserved but clearly marked as archived.

### Step 7: Restore Archived Workflow

**Process:**
1. Locate archived workflow by name or from backup
2. If from backup JSON, import:
```bash
curl -X POST "https://your-instance.n8n.cloud/api/v1/workflows" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d @workflow-backup.json
```

3. Remove "[ARCHIVED]" prefix
4. Update credentials if needed
5. Test in sandbox
6. Activate

**Expected Result:** Workflow restored to working state.

### Step 8: Version Control for Workflows

**Export on Change:**
```bash
#!/bin/bash
# Export workflow and commit to git
WORKFLOW_ID=$1
WORKFLOW_NAME=$(curl -s "https://your-instance.n8n.cloud/api/v1/workflows/$WORKFLOW_ID" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq -r '.name')

curl -s "https://your-instance.n8n.cloud/api/v1/workflows/$WORKFLOW_ID" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" > "workflows/${WORKFLOW_NAME// /_}.json"

cd workflows
git add .
git commit -m "Update workflow: $WORKFLOW_NAME"
git push
```

**Import from Version Control:**
```bash
#!/bin/bash
# Deploy workflow from git
WORKFLOW_FILE=$1
curl -X PUT "https://your-instance.n8n.cloud/api/v1/workflows/{workflowId}" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d @"$WORKFLOW_FILE"
```

**Expected Result:** Workflow changes tracked in version control.

## Validation

### Success Criteria
- [ ] Workflow state changes correctly
- [ ] Triggers fire only when active
- [ ] Manual execution works in any state (except archived)
- [ ] Scheduled activation/deactivation works
- [ ] Archived workflows clearly marked
- [ ] Version history available

### Verification Steps
1. Check workflow state in n8n UI
2. Verify trigger is/isn't firing
3. Test manual execution
4. Check execution history

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Activation fails | Missing credentials | Configure all required credentials |
| Triggers not firing | Webhook URL changed | Re-register webhooks after activation |
| Workflow auto-deactivates | Consecutive errors | Fix errors, check n8n settings |
| Can't find archived workflow | Wrong folder/filter | Check "Show archived" filter |
| Bulk operation times out | Too many workflows | Add delays between API calls |
| State doesn't persist | API error | Check response code, retry |

## Rollback

### Accidental Activation:
1. Immediately deactivate via API or UI
2. Check execution history for any runs
3. Verify no data changes occurred
4. Document incident

### Accidental Deactivation:
1. Reactivate immediately
2. Check for missed trigger events
3. Run manual sync if data gap exists
4. Update monitoring

### Accidental Deletion:
1. Restore from backup JSON
2. Import via API
3. Update credentials
4. Test thoroughly before activating

## Related Resources

- **Agents:**
  - `n8n-lifecycle-manager` - Manage workflow states (coming soon)
  - `n8n-workflow-builder` - Create and modify workflows

- **Scripts:**
  - `n8n-lifecycle-controller.js` - Programmatic state control (coming soon)

- **Other Runbooks:**
  - `client-onboarding.md` - Provision new workflows
  - `incident-response.md` - Emergency deactivation

---

**Version:** 1.0.0
**Last Updated:** 2025-12-03
