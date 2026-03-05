#!/usr/bin/env node
/**
 * n8n Template Manager
 *
 * Manages workflow templates for cloning and parameterization.
 * Enables rapid client onboarding through template-based provisioning.
 *
 * @version 1.0.0
 * @requires N8N_API_KEY environment variable
 * @requires N8N_BASE_URL environment variable
 *
 * Usage:
 *   node n8n-template-manager.js list                           # List available templates
 *   node n8n-template-manager.js show <template-id>             # Show template details
 *   node n8n-template-manager.js clone <template-id> <new-name> # Clone template
 *   node n8n-template-manager.js parameterize <id> <params.json> # Apply parameters
 *   node n8n-template-manager.js export <workflow-id>           # Export as template
 *   node n8n-template-manager.js validate <workflow-id>         # Validate before deploy
 *   node n8n-template-manager.js deploy <workflow-id> [--activate] # Deploy workflow
 */

const fs = require('fs');
const path = require('path');

// Configuration
const N8N_API_KEY = process.env.N8N_API_KEY;
const N8N_BASE_URL = process.env.N8N_BASE_URL || 'https://your-instance.n8n.cloud';
const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'data', 'n8n-templates');

/**
 * Make authenticated API request to n8n
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method
 * @param {object} body - Request body (optional)
 * @returns {Promise<object>} API response
 */
async function n8nRequest(endpoint, method = 'GET', body = null) {
  if (!N8N_API_KEY) {
    throw new Error('N8N_API_KEY environment variable is required');
  }

  const url = `${N8N_BASE_URL}/api/v1${endpoint}`;
  const options = {
    method,
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY,
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`n8n API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * List available templates (workflows tagged as "template")
 * @returns {Promise<array>} List of template workflows
 */
async function listTemplates() {
  const workflows = await n8nRequest('/workflows');

  // Filter to templates (by tag or naming convention)
  const templates = workflows.filter(w =>
    w.tags?.some(t => (t.name || t) === 'template') ||
    w.name.toLowerCase().includes('[template]')
  );

  return templates.map(t => ({
    id: t.id,
    name: t.name,
    tags: t.tags?.map(tag => tag.name || tag) || [],
    nodeCount: t.nodes?.length || 0,
    updatedAt: t.updatedAt,
    parameters: extractPlaceholders(JSON.stringify(t))
  }));
}

/**
 * Get template details
 * @param {string} templateId - Template workflow ID
 * @returns {Promise<object>} Template details
 */
async function showTemplate(templateId) {
  const workflow = await n8nRequest(`/workflows/${templateId}`);

  const placeholders = extractPlaceholders(JSON.stringify(workflow));

  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.settings?.description || 'No description',
    tags: workflow.tags?.map(t => t.name || t) || [],
    nodes: workflow.nodes?.map(n => ({
      name: n.name,
      type: n.type,
      credentials: n.credentials ? Object.keys(n.credentials) : []
    })) || [],
    placeholders,
    connections: Object.keys(workflow.connections || {}),
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt
  };
}

/**
 * Extract placeholder patterns from workflow JSON
 * @param {string} workflowJson - Stringified workflow
 * @returns {array} List of placeholders found
 */
function extractPlaceholders(workflowJson) {
  const patterns = [
    /\{\{([A-Z_]+)\}\}/g,           // {{PLACEHOLDER}}
    /\$parameter\.([A-Z_]+)/g,       // $parameter.PLACEHOLDER
    /\$env\.([A-Z_]+)/g,             // $env.PLACEHOLDER
    /%%([A-Z_]+)%%/g                 // %%PLACEHOLDER%%
  ];

  const placeholders = new Set();

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(workflowJson)) !== null) {
      placeholders.add(match[1]);
    }
  }

  return Array.from(placeholders);
}

/**
 * Clone a template workflow with a new name
 * @param {string} templateId - Template workflow ID
 * @param {string} newName - Name for the cloned workflow
 * @returns {Promise<object>} Cloned workflow details
 */
async function cloneTemplate(templateId, newName) {
  // Get the template
  const template = await n8nRequest(`/workflows/${templateId}`);

  // Prepare the clone
  const clonedWorkflow = {
    ...template,
    name: newName,
    active: false
  };

  // Remove fields that shouldn't be copied
  delete clonedWorkflow.id;
  delete clonedWorkflow.createdAt;
  delete clonedWorkflow.updatedAt;

  // Remove template tag from clone
  if (clonedWorkflow.tags) {
    clonedWorkflow.tags = clonedWorkflow.tags.filter(t =>
      (t.name || t) !== 'template'
    );
  }

  // Create the new workflow
  const result = await n8nRequest('/workflows', 'POST', clonedWorkflow);

  return {
    success: true,
    message: `Template cloned successfully`,
    sourceTemplate: {
      id: templateId,
      name: template.name
    },
    clonedWorkflow: {
      id: result.id,
      name: result.name
    },
    placeholders: extractPlaceholders(JSON.stringify(result)),
    nextStep: 'Run parameterize command to replace placeholders'
  };
}

/**
 * Apply parameters to a workflow
 * @param {string} workflowId - Workflow ID to parameterize
 * @param {object|string} params - Parameters object or path to JSON file
 * @returns {Promise<object>} Parameterization result
 */
async function parameterizeWorkflow(workflowId, params) {
  // Load params from file if string path provided
  let parameters = params;
  if (typeof params === 'string') {
    if (!fs.existsSync(params)) {
      throw new Error(`Parameters file not found: ${params}`);
    }
    parameters = JSON.parse(fs.readFileSync(params, 'utf8'));
  }

  // Get the workflow
  const workflow = await n8nRequest(`/workflows/${workflowId}`);

  // Convert to string for replacement
  let workflowStr = JSON.stringify(workflow);

  // Track replacements
  const replacements = [];

  // Replace all parameter patterns
  for (const [key, value] of Object.entries(parameters)) {
    const patterns = [
      new RegExp(`\\{\\{${key}\\}\\}`, 'g'),           // {{KEY}}
      new RegExp(`\\$parameter\\.${key}`, 'g'),        // $parameter.KEY
      new RegExp(`%%${key}%%`, 'g')                    // %%KEY%%
    ];

    for (const pattern of patterns) {
      if (pattern.test(workflowStr)) {
        workflowStr = workflowStr.replace(pattern, value);
        replacements.push({ key, pattern: pattern.source, value });
      }
    }
  }

  // Parse back to object
  const parameterizedWorkflow = JSON.parse(workflowStr);

  // Update the workflow
  await n8nRequest(`/workflows/${workflowId}`, 'PUT', parameterizedWorkflow);

  // Check for remaining placeholders
  const remaining = extractPlaceholders(workflowStr);

  return {
    success: true,
    message: 'Workflow parameterized successfully',
    workflowId,
    replacements,
    remainingPlaceholders: remaining,
    warning: remaining.length > 0
      ? `${remaining.length} placeholder(s) still need values: ${remaining.join(', ')}`
      : null
  };
}

/**
 * Link credentials to a workflow by name
 * @param {string} workflowId - Workflow ID
 * @param {object} credentialMap - Map of credential type to credential name
 * @returns {Promise<object>} Credential linking result
 */
async function linkCredentials(workflowId, credentialMap) {
  const workflow = await n8nRequest(`/workflows/${workflowId}`);

  let linkedCount = 0;

  // Update each node that uses credentials
  for (const node of workflow.nodes || []) {
    if (node.credentials) {
      for (const [credType, credConfig] of Object.entries(node.credentials)) {
        if (credentialMap[credType]) {
          node.credentials[credType] = {
            name: credentialMap[credType]
          };
          linkedCount++;
        }
      }
    }
  }

  // Update the workflow
  await n8nRequest(`/workflows/${workflowId}`, 'PUT', workflow);

  return {
    success: true,
    message: `Linked ${linkedCount} credential(s)`,
    workflowId,
    linkedCredentials: credentialMap
  };
}

/**
 * Export a workflow as a template
 * @param {string} workflowId - Workflow ID to export
 * @param {object} options - Export options
 * @returns {Promise<object>} Export result
 */
async function exportAsTemplate(workflowId, options = {}) {
  const workflow = await n8nRequest(`/workflows/${workflowId}`);

  // Strip sensitive data
  const template = { ...workflow };

  // Remove instance-specific data
  delete template.id;
  delete template.createdAt;
  delete template.updatedAt;
  delete template.active;

  // Clear credential values but keep structure
  if (template.nodes) {
    for (const node of template.nodes) {
      if (node.credentials) {
        for (const credType of Object.keys(node.credentials)) {
          node.credentials[credType] = {
            name: `{{CREDENTIAL_${credType.toUpperCase()}}}`
          };
        }
      }
    }
  }

  // Add template prefix to name if not present
  if (!template.name.toLowerCase().includes('[template]')) {
    template.name = `[TEMPLATE] ${template.name}`;
  }

  // Add template tag
  if (!template.tags) {
    template.tags = [];
  }
  if (!template.tags.some(t => (t.name || t) === 'template')) {
    template.tags.push({ name: 'template' });
  }

  // Save locally
  if (!fs.existsSync(TEMPLATES_DIR)) {
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  }

  const filename = `${template.name.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
  const filepath = path.join(TEMPLATES_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(template, null, 2));

  // Optionally upload to n8n
  let uploadedId = null;
  if (options.upload) {
    const result = await n8nRequest('/workflows', 'POST', template);
    uploadedId = result.id;
  }

  return {
    success: true,
    message: 'Workflow exported as template',
    sourceWorkflowId: workflowId,
    template: {
      name: template.name,
      localPath: filepath,
      uploadedId
    },
    placeholders: extractPlaceholders(JSON.stringify(template))
  };
}

/**
 * Validate workflow before deployment
 * @param {string} workflowId - Workflow ID to validate
 * @returns {Promise<object>} Validation result
 */
async function validateWorkflow(workflowId) {
  const workflow = await n8nRequest(`/workflows/${workflowId}`);
  const workflowStr = JSON.stringify(workflow);

  const issues = [];
  const warnings = [];

  // Check for remaining placeholders
  const placeholders = extractPlaceholders(workflowStr);
  if (placeholders.length > 0) {
    issues.push({
      type: 'UNRESOLVED_PLACEHOLDER',
      message: `${placeholders.length} unresolved placeholder(s): ${placeholders.join(', ')}`,
      severity: 'error'
    });
  }

  // Check credentials
  for (const node of workflow.nodes || []) {
    if (node.credentials) {
      for (const [credType, credConfig] of Object.entries(node.credentials)) {
        if (!credConfig.name || credConfig.name.includes('{{')) {
          issues.push({
            type: 'MISSING_CREDENTIAL',
            message: `Node "${node.name}" missing credential for ${credType}`,
            severity: 'error'
          });
        }
      }
    }
  }

  // Check for error handling
  const hasErrorTrigger = workflow.nodes?.some(n =>
    n.type === 'n8n-nodes-base.errorTrigger'
  );
  if (!hasErrorTrigger) {
    warnings.push({
      type: 'NO_ERROR_HANDLING',
      message: 'Workflow has no Error Trigger node',
      severity: 'warning'
    });
  }

  // Check for trigger node
  const hasTrigger = workflow.nodes?.some(n =>
    n.type.includes('Trigger') || n.type.includes('webhook')
  );
  if (!hasTrigger) {
    warnings.push({
      type: 'NO_TRIGGER',
      message: 'Workflow has no trigger node - must be executed manually',
      severity: 'info'
    });
  }

  const isValid = issues.length === 0;

  return {
    valid: isValid,
    workflowId,
    workflowName: workflow.name,
    issues,
    warnings,
    summary: isValid
      ? `Workflow valid with ${warnings.length} warning(s)`
      : `Workflow has ${issues.length} issue(s) that must be resolved`
  };
}

/**
 * Deploy workflow (optionally activate)
 * @param {string} workflowId - Workflow ID to deploy
 * @param {boolean} activate - Whether to activate after deploy
 * @returns {Promise<object>} Deployment result
 */
async function deployWorkflow(workflowId, activate = false) {
  // First validate
  const validation = await validateWorkflow(workflowId);

  if (!validation.valid) {
    return {
      success: false,
      message: 'Deployment blocked due to validation errors',
      validation
    };
  }

  const workflow = await n8nRequest(`/workflows/${workflowId}`);

  // Activate if requested
  if (activate) {
    await n8nRequest(`/workflows/${workflowId}/activate`, 'POST');
  }

  return {
    success: true,
    message: activate ? 'Workflow deployed and activated' : 'Workflow ready for activation',
    workflowId,
    workflowName: workflow.name,
    active: activate,
    validation,
    nextSteps: activate
      ? ['Monitor first execution', 'Check for errors']
      : ['Activate when ready: /n8n-lifecycle activate ' + workflowId]
  };
}

/**
 * Create a full onboarding package for a new client
 * @param {string} templateId - Template to clone
 * @param {object} clientConfig - Client configuration
 * @returns {Promise<object>} Onboarding result
 */
async function onboardClient(templateId, clientConfig) {
  const results = {
    client: clientConfig.clientName,
    workflows: [],
    errors: []
  };

  // Clone template
  const cloneResult = await cloneTemplate(
    templateId,
    `${clientConfig.clientName} - ${clientConfig.workflowName || 'Workflow'}`
  );
  results.workflows.push({
    step: 'clone',
    ...cloneResult.clonedWorkflow
  });

  // Parameterize
  try {
    const paramResult = await parameterizeWorkflow(
      cloneResult.clonedWorkflow.id,
      clientConfig.parameters
    );
    results.workflows[0].parameterized = true;
    results.workflows[0].remainingPlaceholders = paramResult.remainingPlaceholders;
  } catch (error) {
    results.errors.push({
      step: 'parameterize',
      error: error.message
    });
  }

  // Link credentials
  if (clientConfig.credentials) {
    try {
      await linkCredentials(cloneResult.clonedWorkflow.id, clientConfig.credentials);
      results.workflows[0].credentialsLinked = true;
    } catch (error) {
      results.errors.push({
        step: 'credentials',
        error: error.message
      });
    }
  }

  // Validate
  const validation = await validateWorkflow(cloneResult.clonedWorkflow.id);
  results.validation = validation;

  // Activate if requested and valid
  if (clientConfig.activate && validation.valid) {
    try {
      await n8nRequest(`/workflows/${cloneResult.clonedWorkflow.id}/activate`, 'POST');
      results.workflows[0].active = true;
    } catch (error) {
      results.errors.push({
        step: 'activate',
        error: error.message
      });
    }
  }

  results.success = results.errors.length === 0 && validation.valid;
  results.message = results.success
    ? `Client ${clientConfig.clientName} onboarded successfully`
    : `Onboarding completed with ${results.errors.length} error(s)`;

  return results;
}

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  const parsed = {
    command: args[0],
    target: null,
    options: {}
  };

  if (args[1] && !args[1].startsWith('--')) {
    parsed.target = args[1];
  }

  if (args[2] && !args[2].startsWith('--')) {
    parsed.secondTarget = args[2];
  }

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--activate') {
      parsed.options.activate = true;
    } else if (args[i] === '--upload') {
      parsed.options.upload = true;
    } else if (args[i] === '--json') {
      parsed.options.json = true;
    }
  }

  return parsed;
}

/**
 * Print usage information
 */
function printUsage() {
  console.log(`
n8n Template Manager v1.0.0

Usage:
  node n8n-template-manager.js <command> [options]

Commands:
  list                              List available templates
  show <template-id>                Show template details
  clone <template-id> <new-name>    Clone template with new name
  parameterize <id> <params.json>   Apply parameters to workflow
  export <workflow-id> [--upload]   Export workflow as template
  validate <workflow-id>            Validate workflow before deployment
  deploy <workflow-id> [--activate] Deploy workflow (optionally activate)

Options:
  --activate      Activate workflow after deployment
  --upload        Upload exported template to n8n
  --json          Output in JSON format

Environment Variables:
  N8N_API_KEY     n8n API key (required)
  N8N_BASE_URL    n8n instance URL (default: https://your-instance.n8n.cloud)

Examples:
  # List all templates
  node n8n-template-manager.js list

  # Clone a template for a new client
  node n8n-template-manager.js clone abc123 "Acme Corp Sync"

  # Apply client-specific parameters
  node n8n-template-manager.js parameterize def456 ./acme-params.json

  # Validate before going live
  node n8n-template-manager.js validate def456

  # Deploy and activate
  node n8n-template-manager.js deploy def456 --activate

Parameter File Format (params.json):
  {
    "CLIENT_NAME": "Acme Corp",
    "CLIENT_ID": "acme",
    "WEBHOOK_PATH": "acme/webhook",
    "NOTIFICATION_CHANNEL": "#acme-alerts"
  }
`);
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }

  const parsed = parseArgs(args);
  const outputJson = parsed.options.json;

  try {
    let result;

    switch (parsed.command) {
      case 'list':
        result = await listTemplates();
        break;

      case 'show':
        if (!parsed.target) {
          throw new Error('Template ID required');
        }
        result = await showTemplate(parsed.target);
        break;

      case 'clone':
        if (!parsed.target || !parsed.secondTarget) {
          throw new Error('Template ID and new name required');
        }
        result = await cloneTemplate(parsed.target, parsed.secondTarget);
        break;

      case 'parameterize':
        if (!parsed.target || !parsed.secondTarget) {
          throw new Error('Workflow ID and parameters file required');
        }
        result = await parameterizeWorkflow(parsed.target, parsed.secondTarget);
        break;

      case 'export':
        if (!parsed.target) {
          throw new Error('Workflow ID required');
        }
        result = await exportAsTemplate(parsed.target, parsed.options);
        break;

      case 'validate':
        if (!parsed.target) {
          throw new Error('Workflow ID required');
        }
        result = await validateWorkflow(parsed.target);
        break;

      case 'deploy':
        if (!parsed.target) {
          throw new Error('Workflow ID required');
        }
        result = await deployWorkflow(parsed.target, parsed.options.activate);
        break;

      default:
        throw new Error(`Unknown command: ${parsed.command}`);
    }

    if (outputJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Pretty print
      if (Array.isArray(result)) {
        if (result.length === 0) {
          console.log('No templates found');
        } else {
          console.table(result.map(r => ({
            id: r.id,
            name: r.name,
            tags: r.tags?.join(', ') || '',
            placeholders: r.placeholders?.length || 0
          })));
        }
      } else if (result.valid !== undefined) {
        // Validation result
        console.log(`\n${result.valid ? '✅' : '❌'} ${result.summary}\n`);
        if (result.issues?.length > 0) {
          console.log('Issues:');
          result.issues.forEach(i => console.log(`  ❌ ${i.message}`));
        }
        if (result.warnings?.length > 0) {
          console.log('Warnings:');
          result.warnings.forEach(w => console.log(`  ⚠️  ${w.message}`));
        }
      } else {
        console.log(`\n${result.message || 'Operation complete'}\n`);
        Object.entries(result).forEach(([key, value]) => {
          if (!['message', 'success'].includes(key)) {
            if (typeof value === 'object') {
              console.log(`${key}:`);
              console.log(JSON.stringify(value, null, 2));
            } else {
              console.log(`  ${key}: ${value}`);
            }
          }
        });
      }
    }

    process.exit(result.success === false ? 1 : 0);

  } catch (error) {
    if (outputJson) {
      console.log(JSON.stringify({ success: false, error: error.message }));
    } else {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for programmatic use
module.exports = {
  listTemplates,
  showTemplate,
  cloneTemplate,
  parameterizeWorkflow,
  linkCredentials,
  exportAsTemplate,
  validateWorkflow,
  deployWorkflow,
  onboardClient
};
