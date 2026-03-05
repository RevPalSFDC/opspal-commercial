#!/usr/bin/env node

/**
 * n8n Error Analyzer
 *
 * Analyzes n8n workflow execution errors to identify root causes and provide solutions.
 *
 * Features:
 * - Categorize errors by type
 * - Identify recurring error patterns
 * - Provide troubleshooting recommendations
 * - Generate error resolution guides
 *
 * Usage:
 *   const N8nErrorAnalyzer = require('./n8n-error-analyzer');
 *   const analyzer = new N8nErrorAnalyzer();
 *   const analysis = analyzer.analyze(errorData);
 *
 * CLI Commands:
 *   node n8n-error-analyzer.js analyze <error-message>     - Analyze single error
 *   node n8n-error-analyzer.js batch <file.json>           - Analyze multiple errors
 *   node n8n-error-analyzer.js guide <error-type>          - Get resolution guide
 */

const fs = require('fs');

class N8nErrorAnalyzer {
  constructor() {
    // Error patterns and their metadata
    this.errorPatterns = {
      authentication: {
        patterns: [
          /unauthorized/i,
          /401/,
          /authentication failed/i,
          /invalid.*credentials/i,
          /access.*denied/i,
          /invalid.*token/i,
          /expired.*token/i
        ],
        category: 'Authentication',
        severity: 'high',
        causes: [
          'Credentials have expired',
          'API key is invalid or revoked',
          'OAuth token needs refresh',
          'Wrong credentials configured'
        ],
        solutions: [
          'Re-authenticate the credential in n8n',
          'Generate a new API key and update the credential',
          'Check if the OAuth connection needs re-authorization',
          'Verify the credential is correctly mapped to the node'
        ]
      },
      permission: {
        patterns: [
          /forbidden/i,
          /403/,
          /permission.*denied/i,
          /insufficient.*privileges/i,
          /not.*authorized/i,
          /access.*forbidden/i
        ],
        category: 'Permission',
        severity: 'high',
        causes: [
          'User/app lacks required permissions',
          'IP restrictions blocking access',
          'API scope is insufficient',
          'Object-level security restrictions'
        ],
        solutions: [
          'Verify the API user has required permissions',
          'Check Salesforce profile/permission set assignments',
          'Review HubSpot app scopes',
          'Whitelist n8n IP addresses if applicable'
        ]
      },
      rateLimit: {
        patterns: [
          /rate.*limit/i,
          /429/,
          /too.*many.*requests/i,
          /throttl/i,
          /quota.*exceeded/i
        ],
        category: 'Rate Limit',
        severity: 'medium',
        causes: [
          'Exceeded API rate limits',
          'Too many parallel requests',
          'Daily API quota exhausted',
          'Burst limit exceeded'
        ],
        solutions: [
          'Add Wait nodes between API calls',
          'Reduce batch size in SplitInBatches node',
          'Implement exponential backoff',
          'Spread workflow executions over time',
          'Consider upgrading API tier'
        ]
      },
      timeout: {
        patterns: [
          /timeout/i,
          /timed.*out/i,
          /deadline.*exceeded/i,
          /ETIMEDOUT/i,
          /request.*took.*too.*long/i
        ],
        category: 'Timeout',
        severity: 'medium',
        causes: [
          'External service is slow',
          'Large data payload',
          'Network latency',
          'Service under heavy load'
        ],
        solutions: [
          'Increase timeout settings in HTTP Request node',
          'Reduce data volume per request',
          'Add retry logic with backoff',
          'Consider async/webhook patterns for long operations'
        ]
      },
      connection: {
        patterns: [
          /ECONNREFUSED/i,
          /ENOTFOUND/i,
          /connection.*refused/i,
          /unable.*to.*connect/i,
          /network.*error/i,
          /ECONNRESET/i,
          /socket.*hang.*up/i
        ],
        category: 'Connection',
        severity: 'high',
        causes: [
          'Service is down or unreachable',
          'DNS resolution failure',
          'Firewall blocking connection',
          'SSL/TLS issues'
        ],
        solutions: [
          'Verify the service is online',
          'Check URL/endpoint is correct',
          'Review firewall and network settings',
          'Check SSL certificate validity'
        ]
      },
      dataFormat: {
        patterns: [
          /cannot.*read.*property/i,
          /undefined.*is.*not/i,
          /null.*is.*not/i,
          /expected.*but.*got/i,
          /invalid.*json/i,
          /unexpected.*token/i,
          /type.*error/i
        ],
        category: 'Data Format',
        severity: 'medium',
        causes: [
          'Input data is missing expected fields',
          'Data type mismatch',
          'Malformed JSON response',
          'Null or empty data'
        ],
        solutions: [
          'Add IF node to check if data exists',
          'Use Set node to provide default values',
          'Add data validation before processing',
          'Check API response format has changed'
        ]
      },
      validation: {
        patterns: [
          /validation.*failed/i,
          /invalid.*value/i,
          /required.*field/i,
          /missing.*required/i,
          /must.*be/i,
          /constraint.*violation/i
        ],
        category: 'Validation',
        severity: 'medium',
        causes: [
          'Required field is missing',
          'Value format is incorrect',
          'Data doesn\'t meet constraints',
          'Invalid enum/picklist value'
        ],
        solutions: [
          'Check all required fields are provided',
          'Verify data format (email, phone, date)',
          'Ensure values match expected options',
          'Add data transformation before API call'
        ]
      },
      notFound: {
        patterns: [
          /not.*found/i,
          /404/,
          /does.*not.*exist/i,
          /no.*record.*found/i,
          /invalid.*id/i
        ],
        category: 'Not Found',
        severity: 'medium',
        causes: [
          'Record has been deleted',
          'ID is invalid or wrong format',
          'Looking in wrong object/resource',
          'Record not yet synced'
        ],
        solutions: [
          'Verify the record exists',
          'Check ID format is correct',
          'Ensure looking at correct object',
          'Add error handling for missing records'
        ]
      },
      duplicate: {
        patterns: [
          /duplicate/i,
          /already.*exists/i,
          /unique.*constraint/i,
          /conflict/i
        ],
        category: 'Duplicate',
        severity: 'low',
        causes: [
          'Record with same key already exists',
          'Unique field constraint violated',
          'Sync created duplicate'
        ],
        solutions: [
          'Use upsert instead of create',
          'Check for existing record first',
          'Update existing rather than create new',
          'Implement deduplication logic'
        ]
      },
      salesforce: {
        patterns: [
          /INVALID_SESSION_ID/i,
          /ENTITY_IS_DELETED/i,
          /INVALID_FIELD/i,
          /MALFORMED_ID/i,
          /INSUFFICIENT_ACCESS/i,
          /FIELD_CUSTOM_VALIDATION_EXCEPTION/i,
          /REQUIRED_FIELD_MISSING/i,
          /STRING_TOO_LONG/i
        ],
        category: 'Salesforce',
        severity: 'medium',
        causes: [
          'Salesforce-specific validation or security',
          'Field-level security restrictions',
          'Validation rule triggered',
          'Data length exceeds field limit'
        ],
        solutions: [
          'Check Salesforce validation rules',
          'Verify field-level security',
          'Review field length limits',
          'Check record type requirements'
        ]
      },
      hubspot: {
        patterns: [
          /HubSpot/i,
          /Property.*not.*found/i,
          /Invalid.*property/i,
          /CONTACT_EXISTS/i,
          /PROPERTY_DOESNT_EXIST/i
        ],
        category: 'HubSpot',
        severity: 'medium',
        causes: [
          'HubSpot property doesn\'t exist',
          'Property name is incorrect (snake_case)',
          'Contact already exists with email',
          'Portal-specific configuration'
        ],
        solutions: [
          'Verify property exists in HubSpot settings',
          'Use snake_case for property names',
          'Use upsert or check existing before create',
          'Check HubSpot portal configuration'
        ]
      }
    };
  }

  /**
   * Analyze an error and provide diagnosis
   * @param {Object|string} error - Error object or message
   * @returns {Object} Analysis result
   */
  analyze(error) {
    const errorMessage = typeof error === 'string'
      ? error
      : error.message || error.description || JSON.stringify(error);

    const errorStack = typeof error === 'object' ? error.stack : null;
    const errorNode = typeof error === 'object' ? error.node : null;

    // Find matching patterns
    const matches = [];
    for (const [key, config] of Object.entries(this.errorPatterns)) {
      for (const pattern of config.patterns) {
        if (pattern.test(errorMessage)) {
          matches.push({
            type: key,
            ...config,
            matchedPattern: pattern.toString()
          });
          break;
        }
      }
    }

    // Determine primary category
    const primary = matches.length > 0 ? matches[0] : {
      type: 'unknown',
      category: 'Unknown',
      severity: 'low',
      causes: ['Error type not recognized'],
      solutions: ['Review the full error message and stack trace']
    };

    return {
      originalError: errorMessage,
      errorNode,
      hasStackTrace: !!errorStack,
      analysis: {
        category: primary.category,
        type: primary.type,
        severity: primary.severity,
        allMatches: matches.map(m => m.category)
      },
      diagnosis: {
        possibleCauses: primary.causes,
        recommendedSolutions: primary.solutions
      },
      nextSteps: this.generateNextSteps(primary, errorNode),
      relatedPatterns: matches.slice(1).map(m => m.category)
    };
  }

  /**
   * Generate specific next steps based on analysis
   */
  generateNextSteps(errorConfig, nodeName) {
    const steps = [];

    // Generic first steps
    steps.push({
      step: 1,
      action: 'Review Error Details',
      description: 'Check the full error message and execution data in n8n'
    });

    // Category-specific steps
    switch (errorConfig.type) {
      case 'authentication':
        steps.push({
          step: 2,
          action: 'Check Credentials',
          description: 'Go to n8n Credentials and verify/re-authenticate'
        });
        break;

      case 'rateLimit':
        steps.push({
          step: 2,
          action: 'Add Rate Limiting',
          description: 'Add Wait nodes or reduce batch sizes'
        });
        break;

      case 'dataFormat':
        steps.push({
          step: 2,
          action: 'Inspect Data',
          description: 'Check the input data to the failing node'
        });
        steps.push({
          step: 3,
          action: 'Add Validation',
          description: 'Add IF node to handle missing/invalid data'
        });
        break;

      case 'connection':
        steps.push({
          step: 2,
          action: 'Check Service Status',
          description: 'Verify the external service is available'
        });
        break;

      default:
        steps.push({
          step: 2,
          action: 'Test Manually',
          description: 'Run the workflow with manual trigger and test data'
        });
    }

    // Always add monitoring step
    steps.push({
      step: steps.length + 1,
      action: 'Monitor After Fix',
      description: 'Watch subsequent executions to confirm resolution'
    });

    return steps;
  }

  /**
   * Analyze multiple errors and find patterns
   */
  analyzeMultiple(errors) {
    const analyses = errors.map(e => this.analyze(e));

    // Aggregate statistics
    const categoryCounts = {};
    const severityCounts = { high: 0, medium: 0, low: 0 };
    const nodeCounts = {};

    analyses.forEach(a => {
      const cat = a.analysis.category;
      const sev = a.analysis.severity;
      const node = a.errorNode || 'Unknown';

      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      severityCounts[sev]++;
      nodeCounts[node] = (nodeCounts[node] || 0) + 1;
    });

    // Sort by count
    const sortedCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, count }));

    const sortedNodes = Object.entries(nodeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([node, count]) => ({ node, count }));

    // Get most common error type for recommendations
    const mostCommon = sortedCategories[0];
    const primaryConfig = this.errorPatterns[
      Object.keys(this.errorPatterns).find(
        k => this.errorPatterns[k].category === mostCommon?.category
      )
    ];

    return {
      totalErrors: errors.length,
      summary: {
        byCategory: sortedCategories,
        bySeverity: severityCounts,
        byNode: sortedNodes
      },
      primaryIssue: {
        category: mostCommon?.category,
        count: mostCommon?.count,
        percentage: ((mostCommon?.count / errors.length) * 100).toFixed(1)
      },
      recommendations: primaryConfig?.solutions || [],
      individualAnalyses: analyses
    };
  }

  /**
   * Get resolution guide for an error type
   */
  getResolutionGuide(errorType) {
    const config = this.errorPatterns[errorType.toLowerCase()];

    if (!config) {
      return {
        found: false,
        message: `No guide found for error type: ${errorType}`,
        availableTypes: Object.keys(this.errorPatterns)
      };
    }

    return {
      found: true,
      errorType: config.category,
      severity: config.severity,
      overview: `${config.category} errors typically indicate issues with ${config.causes[0].toLowerCase()}.`,
      possibleCauses: config.causes,
      solutions: config.solutions,
      preventionTips: this.getPreventionTips(errorType),
      relatedDocumentation: this.getRelatedDocs(errorType)
    };
  }

  /**
   * Get prevention tips for an error type
   */
  getPreventionTips(errorType) {
    const tips = {
      authentication: [
        'Set up credential refresh alerts',
        'Use OAuth with refresh tokens when possible',
        'Monitor credential expiration dates'
      ],
      rateLimit: [
        'Design workflows with rate limits in mind',
        'Use scheduled batches instead of real-time for bulk operations',
        'Implement monitoring for API usage'
      ],
      dataFormat: [
        'Always validate input data at workflow start',
        'Use Set nodes to ensure consistent data structure',
        'Add error handling for missing data'
      ],
      connection: [
        'Implement retry logic for external calls',
        'Set up health checks for critical services',
        'Have fallback workflows for critical processes'
      ],
      timeout: [
        'Set appropriate timeout values',
        'Break large operations into smaller chunks',
        'Use async patterns for long-running operations'
      ]
    };

    return tips[errorType] || [
      'Implement comprehensive error handling',
      'Test workflows thoroughly before deployment',
      'Monitor executions regularly'
    ];
  }

  /**
   * Get related documentation links
   */
  getRelatedDocs(errorType) {
    const docs = {
      salesforce: [
        'Salesforce API Limits: https://developer.salesforce.com/docs/atlas.en-us.salesforce_app_limits_cheatsheet.meta',
        'Salesforce Error Codes: https://developer.salesforce.com/docs/atlas.en-us.api.meta/api/sforce_api_calls_concepts_core_data_objects.htm'
      ],
      hubspot: [
        'HubSpot API Limits: https://developers.hubspot.com/docs/api/usage-details',
        'HubSpot Properties: https://developers.hubspot.com/docs/api/crm/properties'
      ],
      authentication: [
        'n8n Credentials: https://docs.n8n.io/credentials/',
        'OAuth Setup: https://docs.n8n.io/credentials/oauth/'
      ],
      rateLimit: [
        'n8n Rate Limit Handling: https://docs.n8n.io/workflows/rate-limit/',
        'Batch Processing: https://docs.n8n.io/nodes/n8n-nodes-base.splitInBatches/'
      ]
    };

    return docs[errorType] || [
      'n8n Error Handling: https://docs.n8n.io/workflows/error-handling/',
      'n8n Troubleshooting: https://docs.n8n.io/getting-started/troubleshooting/'
    ];
  }

  /**
   * Format analysis as markdown
   */
  formatMarkdown(analysis) {
    let md = `## Error Analysis\n\n`;
    md += `**Category**: ${analysis.analysis.category}\n`;
    md += `**Severity**: ${analysis.analysis.severity}\n`;
    md += `**Node**: ${analysis.errorNode || 'Unknown'}\n\n`;

    md += `### Error Message\n\`\`\`\n${analysis.originalError}\n\`\`\`\n\n`;

    md += `### Possible Causes\n`;
    analysis.diagnosis.possibleCauses.forEach(cause => {
      md += `- ${cause}\n`;
    });

    md += `\n### Recommended Solutions\n`;
    analysis.diagnosis.recommendedSolutions.forEach(solution => {
      md += `- ${solution}\n`;
    });

    md += `\n### Next Steps\n`;
    analysis.nextSteps.forEach(step => {
      md += `${step.step}. **${step.action}**: ${step.description}\n`;
    });

    return md;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const analyzer = new N8nErrorAnalyzer();

  switch (command) {
    case 'analyze': {
      const errorMessage = args.slice(1).join(' ');
      if (!errorMessage) {
        console.error('Usage: n8n-error-analyzer.js analyze <error-message>');
        process.exit(1);
      }

      const analysis = analyzer.analyze(errorMessage);
      console.log(analyzer.formatMarkdown(analysis));
      break;
    }

    case 'batch': {
      const filePath = args[1];
      if (!filePath) {
        console.error('Usage: n8n-error-analyzer.js batch <file.json>');
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const errors = JSON.parse(content);

      const analysis = analyzer.analyzeMultiple(errors);

      console.log('\n## Batch Error Analysis\n');
      console.log(`Total Errors: ${analysis.totalErrors}\n`);

      console.log('### By Category');
      analysis.summary.byCategory.forEach(c => {
        console.log(`- ${c.category}: ${c.count}`);
      });

      console.log('\n### Primary Issue');
      console.log(`${analysis.primaryIssue.category} (${analysis.primaryIssue.percentage}%)`);

      console.log('\n### Recommendations');
      analysis.recommendations.forEach(r => console.log(`- ${r}`));
      break;
    }

    case 'guide': {
      const errorType = args[1];
      if (!errorType) {
        console.error('Usage: n8n-error-analyzer.js guide <error-type>');
        console.error('Types: authentication, permission, rateLimit, timeout, connection, dataFormat, validation, notFound, salesforce, hubspot');
        process.exit(1);
      }

      const guide = analyzer.getResolutionGuide(errorType);

      if (!guide.found) {
        console.log(guide.message);
        console.log('Available types:', guide.availableTypes.join(', '));
      } else {
        console.log(`\n## ${guide.errorType} Error Resolution Guide\n`);
        console.log(`**Severity**: ${guide.severity}\n`);
        console.log(guide.overview + '\n');

        console.log('### Causes');
        guide.possibleCauses.forEach(c => console.log(`- ${c}`));

        console.log('\n### Solutions');
        guide.solutions.forEach(s => console.log(`- ${s}`));

        console.log('\n### Prevention Tips');
        guide.preventionTips.forEach(t => console.log(`- ${t}`));

        console.log('\n### Related Documentation');
        guide.relatedDocumentation.forEach(d => console.log(`- ${d}`));
      }
      break;
    }

    default:
      console.log(`
n8n Error Analyzer

Analyzes n8n workflow errors and provides solutions.

Commands:
  analyze <message>          Analyze a single error message
  batch <file.json>          Analyze multiple errors from file
  guide <type>               Get resolution guide for error type

Error Types:
  authentication, permission, rateLimit, timeout, connection,
  dataFormat, validation, notFound, duplicate, salesforce, hubspot

Examples:
  node n8n-error-analyzer.js analyze "401 Unauthorized"
  node n8n-error-analyzer.js guide rateLimit
  node n8n-error-analyzer.js batch errors.json
`);
  }
}

// Export for programmatic use
module.exports = N8nErrorAnalyzer;

// Run CLI if executed directly
if (require.main === module) {
  main().catch(console.error);
}
