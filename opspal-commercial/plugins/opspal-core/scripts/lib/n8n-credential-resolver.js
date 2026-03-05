#!/usr/bin/env node

/**
 * n8n Credential Resolver
 *
 * Resolves credential references for n8n workflows without exposing secrets.
 * Maps credential names to their types and validates references.
 *
 * Features:
 * - Resolve credential names to types
 * - Validate credential references exist
 * - Generate credential reference objects
 * - List available credential types
 *
 * Usage:
 *   const N8nCredentialResolver = require('./n8n-credential-resolver');
 *   const resolver = new N8nCredentialResolver();
 *   const credRef = resolver.resolveCredential('Salesforce Production', 'salesforce');
 *
 * CLI Commands:
 *   node n8n-credential-resolver.js resolve <name> <node-type>  - Get credential reference
 *   node n8n-credential-resolver.js types                        - List credential types
 *   node n8n-credential-resolver.js validate <workflow.json>     - Validate workflow credentials
 */

const fs = require('fs');
const path = require('path');

class N8nCredentialResolver {
  constructor(options = {}) {
    this.options = options;

    // Credential type mappings for common nodes
    this.nodeCredentialTypes = {
      // Salesforce
      'n8n-nodes-base.salesforce': 'salesforceOAuth2Api',
      'n8n-nodes-base.salesforceTrigger': 'salesforceOAuth2Api',

      // HubSpot
      'n8n-nodes-base.hubspot': 'hubspotApi',
      'n8n-nodes-base.hubspotTrigger': 'hubspotApi',

      // Slack
      'n8n-nodes-base.slack': 'slackApi',

      // HTTP (multiple options)
      'n8n-nodes-base.httpRequest': ['httpBasicAuth', 'httpHeaderAuth', 'oAuth2Api'],

      // Google
      'n8n-nodes-base.googleSheets': 'googleSheetsOAuth2Api',
      'n8n-nodes-base.googleDrive': 'googleDriveOAuth2Api',
      'n8n-nodes-base.gmail': 'gmailOAuth2Api',

      // Database
      'n8n-nodes-base.postgres': 'postgres',
      'n8n-nodes-base.mysql': 'mysql',

      // AWS
      'n8n-nodes-base.awsS3': 'aws',
      'n8n-nodes-base.awsLambda': 'aws',

      // Other common
      'n8n-nodes-base.airtable': 'airtableApi',
      'n8n-nodes-base.notion': 'notionApi',
      'n8n-nodes-base.stripe': 'stripeApi',
      'n8n-nodes-base.twilio': 'twilioApi',
      'n8n-nodes-base.sendgrid': 'sendGridApi',
      'n8n-nodes-base.mailchimp': 'mailchimpApi'
    };

    // Common credential configurations
    this.credentialConfigs = {
      salesforceOAuth2Api: {
        name: 'Salesforce OAuth2 API',
        description: 'OAuth2 authentication for Salesforce',
        requiredFields: ['environment', 'clientId', 'clientSecret'],
        authType: 'OAuth2'
      },
      hubspotApi: {
        name: 'HubSpot API',
        description: 'API key or OAuth for HubSpot',
        requiredFields: ['apiKey'],
        authType: 'APIKey',
        alternativeAuth: 'hubspotOAuth2Api'
      },
      slackApi: {
        name: 'Slack API',
        description: 'Bot token for Slack',
        requiredFields: ['accessToken'],
        authType: 'BearerToken'
      },
      httpBasicAuth: {
        name: 'HTTP Basic Auth',
        description: 'Username and password authentication',
        requiredFields: ['username', 'password'],
        authType: 'Basic'
      },
      httpHeaderAuth: {
        name: 'HTTP Header Auth',
        description: 'Custom header authentication',
        requiredFields: ['name', 'value'],
        authType: 'Header'
      }
    };

    // Credential name patterns (for validation)
    this.knownCredentialPatterns = {
      salesforce: ['Salesforce', 'SF ', 'SFDC'],
      hubspot: ['HubSpot', 'HS '],
      slack: ['Slack'],
      google: ['Google', 'Gmail', 'GSheets'],
      aws: ['AWS', 'Amazon']
    };
  }

  /**
   * Resolve credential reference for a node
   * @param {string} credentialName - Human-readable credential name
   * @param {string} nodeType - n8n node type
   * @returns {Object} Credential reference object
   */
  resolveCredential(credentialName, nodeType) {
    const credentialType = this.getCredentialTypeForNode(nodeType);

    if (!credentialType) {
      return {
        error: `Unknown node type: ${nodeType}`,
        suggestion: 'Check n8n documentation for the correct credential type'
      };
    }

    // Handle nodes with multiple credential options
    if (Array.isArray(credentialType)) {
      return {
        credentialOptions: credentialType.map(type => ({
          [type]: { name: credentialName }
        })),
        note: 'Multiple credential types available. Choose based on authentication method.'
      };
    }

    return {
      [credentialType]: {
        name: credentialName
      }
    };
  }

  /**
   * Get credential type for a node type
   * @param {string} nodeType - n8n node type
   * @returns {string|Array|null} Credential type(s)
   */
  getCredentialTypeForNode(nodeType) {
    return this.nodeCredentialTypes[nodeType] || null;
  }

  /**
   * Generate credential reference for workflow node
   * @param {Object} config - Configuration object
   * @returns {Object} Formatted credential reference
   */
  generateCredentialRef(config) {
    const {
      platform,
      credentialName,
      environment = 'production'
    } = config;

    // Map platform to credential type
    const platformCredentials = {
      salesforce: 'salesforceOAuth2Api',
      hubspot: 'hubspotApi',
      slack: 'slackApi'
    };

    const credentialType = platformCredentials[platform.toLowerCase()];

    if (!credentialType) {
      return {
        error: `Unknown platform: ${platform}`,
        supportedPlatforms: Object.keys(platformCredentials)
      };
    }

    // Generate standard naming convention if not provided
    const resolvedName = credentialName ||
      `${platform.charAt(0).toUpperCase() + platform.slice(1)} ${environment}`;

    return {
      credentials: {
        [credentialType]: {
          name: resolvedName
        }
      },
      metadata: {
        platform,
        credentialType,
        environment,
        note: 'Ensure this credential exists in n8n before deploying workflow'
      }
    };
  }

  /**
   * Validate credentials in a workflow
   * @param {Object} workflow - n8n workflow object
   * @returns {Object} Validation result
   */
  validateWorkflowCredentials(workflow) {
    const issues = [];
    const credentialUsage = [];

    if (!workflow.nodes) {
      return { valid: false, issues: ['Workflow has no nodes'] };
    }

    workflow.nodes.forEach(node => {
      const expectedCredType = this.getCredentialTypeForNode(node.type);

      if (!expectedCredType) {
        // Node doesn't require credentials
        return;
      }

      if (!node.credentials) {
        issues.push({
          severity: 'error',
          node: node.name,
          nodeType: node.type,
          message: `Missing credentials. Expected type: ${expectedCredType}`
        });
        return;
      }

      // Check credential reference format
      const credentialTypes = Array.isArray(expectedCredType)
        ? expectedCredType
        : [expectedCredType];

      let hasValidCredential = false;

      credentialTypes.forEach(credType => {
        const cred = node.credentials[credType];

        if (cred) {
          hasValidCredential = true;

          // Check for embedded secrets (security issue)
          if (this.hasEmbeddedSecrets(cred)) {
            issues.push({
              severity: 'critical',
              node: node.name,
              message: `SECURITY: Node has embedded secrets. Use credential reference by name only.`
            });
          }

          // Check for valid reference format
          if (!cred.name && !cred.id) {
            issues.push({
              severity: 'warning',
              node: node.name,
              message: `Credential reference should have a name or id property`
            });
          }

          credentialUsage.push({
            node: node.name,
            nodeType: node.type,
            credentialType: credType,
            credentialName: cred.name || cred.id || 'unknown'
          });
        }
      });

      if (!hasValidCredential) {
        issues.push({
          severity: 'error',
          node: node.name,
          nodeType: node.type,
          message: `No valid credential found. Expected one of: ${credentialTypes.join(', ')}`
        });
      }
    });

    return {
      valid: issues.filter(i => i.severity === 'error' || i.severity === 'critical').length === 0,
      issues,
      credentialUsage,
      summary: {
        totalNodes: workflow.nodes.length,
        nodesWithCredentials: credentialUsage.length,
        errors: issues.filter(i => i.severity === 'error').length,
        warnings: issues.filter(i => i.severity === 'warning').length,
        critical: issues.filter(i => i.severity === 'critical').length
      }
    };
  }

  /**
   * Check if credential object has embedded secrets
   */
  hasEmbeddedSecrets(cred) {
    const sensitiveFields = [
      'clientId', 'clientSecret', 'apiKey', 'token',
      'password', 'secret', 'accessToken', 'refreshToken'
    ];

    for (const field of sensitiveFields) {
      if (cred[field] && typeof cred[field] === 'string') {
        // Check if it's an actual value (not expression)
        if (!cred[field].startsWith('={{') && !cred[field].startsWith('$')) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get credential info for a type
   */
  getCredentialInfo(credentialType) {
    return this.credentialConfigs[credentialType] || {
      name: credentialType,
      description: 'No additional information available',
      authType: 'Unknown'
    };
  }

  /**
   * List all known credential types
   */
  listCredentialTypes() {
    return Object.entries(this.nodeCredentialTypes).map(([nodeType, credType]) => ({
      nodeType,
      credentialType: credType,
      info: Array.isArray(credType)
        ? credType.map(t => this.getCredentialInfo(t))
        : this.getCredentialInfo(credType)
    }));
  }

  /**
   * Suggest credential name based on platform and environment
   */
  suggestCredentialName(platform, environment = 'production') {
    const platformNames = {
      salesforce: 'Salesforce',
      hubspot: 'HubSpot',
      slack: 'Slack',
      google: 'Google',
      aws: 'AWS'
    };

    const envNames = {
      production: 'Production',
      sandbox: 'Sandbox',
      development: 'Dev',
      staging: 'Staging'
    };

    const platformName = platformNames[platform.toLowerCase()] || platform;
    const envName = envNames[environment.toLowerCase()] || environment;

    return `${platformName} ${envName}`;
  }

  /**
   * Format validation result as markdown
   */
  formatValidationMarkdown(result) {
    let md = `## Credential Validation Report\n\n`;

    md += `**Status**: ${result.valid ? '✅ Valid' : '❌ Invalid'}\n\n`;

    md += `### Summary\n`;
    md += `- Total Nodes: ${result.summary.totalNodes}\n`;
    md += `- Nodes with Credentials: ${result.summary.nodesWithCredentials}\n`;
    md += `- Errors: ${result.summary.errors}\n`;
    md += `- Warnings: ${result.summary.warnings}\n`;
    md += `- Critical: ${result.summary.critical}\n\n`;

    if (result.issues.length > 0) {
      md += `### Issues\n`;
      result.issues.forEach(issue => {
        const icon = issue.severity === 'critical' ? '🔴' :
                     issue.severity === 'error' ? '❌' : '⚠️';
        md += `${icon} **${issue.node}**: ${issue.message}\n`;
      });
      md += '\n';
    }

    if (result.credentialUsage.length > 0) {
      md += `### Credential Usage\n`;
      md += `| Node | Type | Credential |\n`;
      md += `|------|------|------------|\n`;
      result.credentialUsage.forEach(u => {
        md += `| ${u.node} | ${u.credentialType} | ${u.credentialName} |\n`;
      });
    }

    return md;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const resolver = new N8nCredentialResolver();

  switch (command) {
    case 'resolve': {
      const name = args[1];
      const nodeType = args[2];

      if (!name || !nodeType) {
        console.error('Usage: n8n-credential-resolver.js resolve <name> <node-type>');
        process.exit(1);
      }

      const result = resolver.resolveCredential(name, nodeType);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'types': {
      const types = resolver.listCredentialTypes();
      console.log('\nn8n Credential Types\n');

      types.forEach(t => {
        console.log(`${t.nodeType}:`);
        if (Array.isArray(t.credentialType)) {
          t.credentialType.forEach(ct => console.log(`  - ${ct}`));
        } else {
          console.log(`  - ${t.credentialType}`);
        }
      });
      break;
    }

    case 'validate': {
      const filePath = args[1];
      if (!filePath) {
        console.error('Usage: n8n-credential-resolver.js validate <workflow.json>');
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const workflow = JSON.parse(content);

      const result = resolver.validateWorkflowCredentials(workflow);
      console.log(resolver.formatValidationMarkdown(result));

      process.exit(result.valid ? 0 : 1);
      break;
    }

    case 'suggest': {
      const platform = args[1];
      const environment = args[2] || 'production';

      if (!platform) {
        console.error('Usage: n8n-credential-resolver.js suggest <platform> [environment]');
        console.error('Platforms: salesforce, hubspot, slack, google, aws');
        process.exit(1);
      }

      const suggestion = resolver.suggestCredentialName(platform, environment);
      console.log(`Suggested credential name: "${suggestion}"`);

      const ref = resolver.generateCredentialRef({
        platform,
        credentialName: suggestion,
        environment
      });
      console.log('\nCredential reference:');
      console.log(JSON.stringify(ref.credentials, null, 2));
      break;
    }

    default:
      console.log(`
n8n Credential Resolver

Resolves and validates credential references for n8n workflows.

Commands:
  resolve <name> <node-type>     Get credential reference for node
  types                          List all credential types
  validate <workflow.json>       Validate workflow credentials
  suggest <platform> [env]       Suggest credential name

Examples:
  node n8n-credential-resolver.js resolve "Salesforce Production" n8n-nodes-base.salesforce
  node n8n-credential-resolver.js validate my-workflow.json
  node n8n-credential-resolver.js suggest salesforce sandbox
  node n8n-credential-resolver.js types
`);
  }
}

// Export for programmatic use
module.exports = N8nCredentialResolver;

// Run CLI if executed directly
if (require.main === module) {
  main().catch(console.error);
}
