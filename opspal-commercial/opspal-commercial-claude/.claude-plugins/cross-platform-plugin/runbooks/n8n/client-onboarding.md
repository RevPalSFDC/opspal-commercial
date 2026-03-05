# Auto-Onboarding Client Workflows

A solution-agnostic guide for provisioning n8n workflows for new clients using templates and parameterization.

## Purpose

This runbook provides procedures for automatically provisioning n8n workflows when onboarding new clients. By using template workflows and parameterization, you can rapidly deploy consistent, customized automation for each client.

## Prerequisites

- [ ] Template workflows created and tested
- [ ] Client-specific credentials available
- [ ] Client configuration document (API keys, endpoints, field mappings)
- [ ] n8n API access with workflow create permissions
- [ ] Naming convention established for client workflows

## Procedure

### Step 1: Prepare Template Workflows

**Template Design Principles:**
1. Use placeholder values for client-specific data:
   - `{{CLIENT_NAME}}` - Client identifier
   - `{{CLIENT_API_KEY}}` - API credentials
   - `{{CLIENT_ENDPOINT}}` - Custom endpoints
   - `{{CLIENT_WEBHOOK_URL}}` - Callback URLs

2. Include all error handling and monitoring
3. Document required parameters in workflow notes
4. Tag templates with "template" tag

**Template Structure:**
```json
{
  "name": "[TEMPLATE] Client Data Sync",
  "tags": ["template", "data-sync"],
  "nodes": [
    {
      "name": "Client Webhook",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "path": "={{$parameter.CLIENT_ID}}/webhook"
      }
    }
  ],
  "settings": {
    "saveExecutionProgress": true
  }
}
```

**Expected Result:** Reusable template workflows ready for cloning.

### Step 2: Document Client Requirements

**Client Configuration Template:**
```yaml
client:
  name: "Acme Corp"
  id: "acme"

credentials:
  salesforce:
    instance_url: "https://acme.salesforce.com"
    credential_name: "SF - Acme Production"
  hubspot:
    portal_id: "12345678"
    credential_name: "HS - Acme"

workflows:
  - template: "Client Data Sync"
    active: true
  - template: "Client Error Handler"
    active: true

custom_settings:
  batch_size: 200
  sync_frequency: "0 */4 * * *"
  notification_channel: "#acme-alerts"
```

**Expected Result:** Complete client configuration documented.

### Step 3: Clone Template Workflow

**Via API:**
```bash
#!/bin/bash
# clone-template.sh

TEMPLATE_ID=$1
CLIENT_NAME=$2

# Get template
TEMPLATE=$(curl -s "https://your-instance.n8n.cloud/api/v1/workflows/$TEMPLATE_ID" \
  -H "X-N8N-API-KEY: $N8N_API_KEY")

# Update name for client
NEW_NAME=$(echo $TEMPLATE | jq -r '.name' | sed "s/\[TEMPLATE\]/$CLIENT_NAME/")

# Create new workflow from template
echo $TEMPLATE | jq --arg name "$NEW_NAME" '.name = $name | del(.id)' | \
curl -X POST "https://your-instance.n8n.cloud/api/v1/workflows" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d @-
```

**Expected Result:** New workflow created from template with client name.

### Step 4: Parameterize Workflow

**Replace Placeholders:**
```javascript
// parameterize-workflow.js
const fs = require('fs');

const workflow = JSON.parse(fs.readFileSync('workflow.json'));
const config = JSON.parse(fs.readFileSync('client-config.json'));

// Replace in workflow JSON
let workflowStr = JSON.stringify(workflow);

// Replace placeholders
workflowStr = workflowStr.replace(/\{\{CLIENT_NAME\}\}/g, config.client.name);
workflowStr = workflowStr.replace(/\{\{CLIENT_ID\}\}/g, config.client.id);
workflowStr = workflowStr.replace(/\{\{BATCH_SIZE\}\}/g, config.custom_settings.batch_size);
workflowStr = workflowStr.replace(/\{\{SYNC_FREQUENCY\}\}/g, config.custom_settings.sync_frequency);
workflowStr = workflowStr.replace(/\{\{NOTIFICATION_CHANNEL\}\}/g, config.custom_settings.notification_channel);

const parameterized = JSON.parse(workflowStr);
console.log(JSON.stringify(parameterized, null, 2));
```

**Expected Result:** Workflow customized with client-specific values.

### Step 5: Configure Credentials

**Create Client Credentials (if not existing):**
```bash
# Create Salesforce credential for client
curl -X POST "https://your-instance.n8n.cloud/api/v1/credentials" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SF - Acme Production",
    "type": "salesforceOAuth2Api",
    "data": {
      "environment": "production",
      "instanceUrl": "https://acme.salesforce.com"
    }
  }'
```

**Link Credentials to Workflow:**
Update workflow nodes to reference client credentials by name:
```json
{
  "credentials": {
    "salesforceOAuth2Api": {
      "name": "SF - Acme Production"
    }
  }
}
```

**Expected Result:** Client credentials configured and linked.

### Step 6: Update Workflow via API

**Deploy Parameterized Workflow:**
```bash
curl -X PUT "https://your-instance.n8n.cloud/api/v1/workflows/{newWorkflowId}" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d @parameterized-workflow.json
```

**Expected Result:** Workflow updated with all client customizations.

### Step 7: Test Client Workflow

**Testing Checklist:**
1. Test with manual trigger first
2. Verify credentials work (check OAuth connections)
3. Send test data through workflow
4. Verify output in target system
5. Test error handling scenarios
6. Verify notifications work

**Test Execution:**
```bash
# Trigger manual execution
curl -X POST "https://your-instance.n8n.cloud/api/v1/workflows/{workflowId}/execute" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"data": {"test": true}}'
```

**Expected Result:** Workflow executes successfully with test data.

### Step 8: Activate Client Workflow

**Pre-Activation Checklist:**
- [ ] All tests passed
- [ ] Client notified of go-live
- [ ] Monitoring in place
- [ ] Rollback plan documented
- [ ] Support team briefed

**Activate:**
```bash
curl -X POST "https://your-instance.n8n.cloud/api/v1/workflows/{workflowId}/activate" \
  -H "X-N8N-API-KEY: $N8N_API_KEY"
```

**Expected Result:** Workflow active and processing client data.

### Step 9: Document Deployment

**Client Workflow Registry Entry:**
```yaml
deployment:
  client: "Acme Corp"
  workflow_id: "abc123"
  workflow_name: "Acme Corp Data Sync"
  template_source: "Client Data Sync v2.1"
  deployed_date: "2025-12-03"
  deployed_by: "automation"

configuration:
  batch_size: 200
  sync_frequency: "Every 4 hours"

credentials:
  - name: "SF - Acme Production"
    type: "salesforceOAuth2Api"
  - name: "HS - Acme"
    type: "hubspotApi"

contacts:
  technical: "tech@acme.com"
  business: "ops@acme.com"
```

**Expected Result:** Deployment fully documented for future reference.

## Automated Onboarding Script

**Complete Onboarding Automation:**
```bash
#!/bin/bash
# onboard-client.sh

CLIENT_CONFIG=$1

# Extract client info
CLIENT_NAME=$(jq -r '.client.name' $CLIENT_CONFIG)
CLIENT_ID=$(jq -r '.client.id' $CLIENT_CONFIG)

echo "Onboarding client: $CLIENT_NAME"

# Get templates to deploy
TEMPLATES=$(jq -r '.workflows[].template' $CLIENT_CONFIG)

for TEMPLATE_NAME in $TEMPLATES; do
  echo "Deploying template: $TEMPLATE_NAME"

  # Find template by name
  TEMPLATE_ID=$(curl -s "https://your-instance.n8n.cloud/api/v1/workflows?tags=template" \
    -H "X-N8N-API-KEY: $N8N_API_KEY" | \
    jq -r ".[] | select(.name | contains(\"$TEMPLATE_NAME\")) | .id")

  # Clone template
  ./clone-template.sh $TEMPLATE_ID "$CLIENT_NAME"

  # Parameterize
  ./parameterize-workflow.sh $CLIENT_CONFIG

  # Get new workflow ID
  NEW_WORKFLOW_ID=$(curl -s "https://your-instance.n8n.cloud/api/v1/workflows" \
    -H "X-N8N-API-KEY: $N8N_API_KEY" | \
    jq -r ".[] | select(.name | contains(\"$CLIENT_NAME\")) | .id" | head -1)

  # Activate if specified
  ACTIVE=$(jq -r ".workflows[] | select(.template == \"$TEMPLATE_NAME\") | .active" $CLIENT_CONFIG)
  if [ "$ACTIVE" == "true" ]; then
    curl -X POST "https://your-instance.n8n.cloud/api/v1/workflows/$NEW_WORKFLOW_ID/activate" \
      -H "X-N8N-API-KEY: $N8N_API_KEY"
  fi
done

echo "Client onboarding complete: $CLIENT_NAME"
```

## Validation

### Success Criteria
- [ ] Workflow created from template
- [ ] All placeholders replaced with client values
- [ ] Credentials properly linked
- [ ] Test execution successful
- [ ] Error handling functional
- [ ] Notifications routed to correct channel
- [ ] Deployment documented

### Onboarding Verification Queries
```bash
# List client workflows
curl -s "https://your-instance.n8n.cloud/api/v1/workflows" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | \
  jq ".[] | select(.name | contains(\"$CLIENT_NAME\"))"
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Template not found | Wrong tag or name | Check template naming and tags |
| Placeholder not replaced | Syntax error in placeholder | Use exact `{{PLACEHOLDER}}` format |
| Credential linking fails | Credential doesn't exist | Create credential before linking |
| OAuth fails on first run | Consent not completed | Complete OAuth flow in n8n UI |
| Wrong notification channel | Parameterization missed | Re-run parameterization step |
| Duplicate workflows | Script ran twice | Delete duplicate, add idempotency check |

## Rollback

### If Onboarding Fails:
1. Identify failed workflow(s)
2. Deactivate immediately
3. Collect error logs
4. Delete failed workflows
5. Fix template or configuration
6. Re-run onboarding

### Remove Client Completely:
```bash
#!/bin/bash
# offboard-client.sh
CLIENT_NAME=$1

# Get all client workflows
WORKFLOW_IDS=$(curl -s "https://your-instance.n8n.cloud/api/v1/workflows" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | \
  jq -r ".[] | select(.name | contains(\"$CLIENT_NAME\")) | .id")

for id in $WORKFLOW_IDS; do
  # Deactivate
  curl -X POST "https://your-instance.n8n.cloud/api/v1/workflows/$id/deactivate" \
    -H "X-N8N-API-KEY: $N8N_API_KEY"

  # Archive (or delete)
  curl -X PATCH "https://your-instance.n8n.cloud/api/v1/workflows/$id" \
    -H "X-N8N-API-KEY: $N8N_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"name": "[ARCHIVED] '"$CLIENT_NAME"' Workflow"}'
done
```

## Related Resources

- **Agents:**
  - `n8n-lifecycle-manager` - Manage workflow states (coming soon)
  - `n8n-workflow-builder` - Create custom workflows
  - `n8n-integration-orchestrator` - Design integrations

- **Scripts:**
  - `n8n-template-manager.js` - Template operations (coming soon)
  - `n8n-credential-resolver.js` - Credential management

- **Other Runbooks:**
  - `workflow-lifecycle.md` - Manage workflow states
  - `data-sync-workflow.md` - Sync workflow patterns

---

**Version:** 1.0.0
**Last Updated:** 2025-12-03
