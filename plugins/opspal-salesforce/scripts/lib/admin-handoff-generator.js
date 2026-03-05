#!/usr/bin/env node
/**
 * Admin Handoff Generator
 *
 * Generates admin-friendly documentation for Salesforce customizations.
 * Extracts flow metadata, validation rules, triggers, and other components
 * into clear, actionable documentation for Salesforce administrators.
 *
 * Addresses reflection feedback about unclear handoff documentation
 * and the need for admin-readable explanations of technical work.
 *
 * @module admin-handoff-generator
 * @version 1.0.0
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Configuration
 */
const CONFIG = {
  // CLI timeout (ms)
  cliTimeout: 60000,

  // Template directory
  templateDir: null, // Will be set based on script location

  // Output formats
  formats: ['markdown', 'json'],

  // Verbose logging
  verbose: process.env.HANDOFF_VERBOSE === '1'
};

/**
 * Documentation templates for different component types
 */
const TEMPLATES = {
  flow: {
    title: 'Flow Documentation',
    sections: [
      'overview',
      'triggerConditions',
      'elements',
      'fieldMappings',
      'errorHandling',
      'dependencies',
      'testingGuidance',
      'maintenanceNotes'
    ]
  },
  validationRule: {
    title: 'Validation Rule Documentation',
    sections: [
      'overview',
      'formula',
      'conditions',
      'errorMessage',
      'bypassConditions',
      'impactedProfiles'
    ]
  },
  trigger: {
    title: 'Apex Trigger Documentation',
    sections: [
      'overview',
      'events',
      'operations',
      'bulkification',
      'testCoverage',
      'errorHandling'
    ]
  },
  permissionSet: {
    title: 'Permission Set Documentation',
    sections: [
      'overview',
      'objectPermissions',
      'fieldPermissions',
      'systemPermissions',
      'assignedUsers',
      'dependencies'
    ]
  },
  report: {
    title: 'Report Documentation',
    sections: [
      'overview',
      'reportType',
      'filters',
      'columns',
      'groupings',
      'requiredPermissions'
    ]
  }
};

/**
 * Execute Salesforce CLI command
 */
function execSfCommand(command, targetOrg = null) {
  const orgFlag = targetOrg ? `--target-org ${targetOrg}` : '';
  const fullCommand = `sf ${command} ${orgFlag} --json`;

  if (CONFIG.verbose) {
    console.log(`[CMD] ${fullCommand}`);
  }

  try {
    const result = execSync(fullCommand, {
      encoding: 'utf8',
      timeout: CONFIG.cliTimeout,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return JSON.parse(result);
  } catch (error) {
    if (CONFIG.verbose) {
      console.error(`[ERROR] ${error.message}`);
    }
    throw error;
  }
}

/**
 * Parse Flow XML metadata into admin-friendly structure
 */
function parseFlowMetadata(flowXml) {
  const parsed = {
    label: extractXmlValue(flowXml, 'label'),
    apiVersion: extractXmlValue(flowXml, 'apiVersion'),
    processType: extractXmlValue(flowXml, 'processType'),
    triggerType: extractXmlValue(flowXml, 'triggerType') || 'None',
    status: extractXmlValue(flowXml, 'status'),
    description: extractXmlValue(flowXml, 'description') || 'No description provided',
    start: {},
    elements: [],
    variables: [],
    formulas: []
  };

  // Parse start element
  const startMatch = flowXml.match(/<start>([\s\S]*?)<\/start>/);
  if (startMatch) {
    parsed.start = {
      object: extractXmlValue(startMatch[1], 'object'),
      triggerType: extractXmlValue(startMatch[1], 'triggerType'),
      recordTriggerType: extractXmlValue(startMatch[1], 'recordTriggerType'),
      filterLogic: extractXmlValue(startMatch[1], 'filterLogic'),
      doesRequireRecordChangedToMeetCriteria:
        extractXmlValue(startMatch[1], 'doesRequireRecordChangedToMeetCriteria') === 'true'
    };

    // Parse filter conditions
    const filterMatches = startMatch[1].match(/<filters>([\s\S]*?)<\/filters>/g) || [];
    parsed.start.filters = filterMatches.map(f => ({
      field: extractXmlValue(f, 'field'),
      operator: extractXmlValue(f, 'operator'),
      value: extractXmlValue(f, 'value')
    }));
  }

  // Parse record lookups
  const lookupMatches = flowXml.match(/<recordLookups>([\s\S]*?)<\/recordLookups>/g) || [];
  for (const match of lookupMatches) {
    parsed.elements.push({
      type: 'Get Records',
      name: extractXmlValue(match, 'name'),
      object: extractXmlValue(match, 'object'),
      filterLogic: extractXmlValue(match, 'filterLogic')
    });
  }

  // Parse record creates
  const createMatches = flowXml.match(/<recordCreates>([\s\S]*?)<\/recordCreates>/g) || [];
  for (const match of createMatches) {
    parsed.elements.push({
      type: 'Create Records',
      name: extractXmlValue(match, 'name'),
      object: extractXmlValue(match, 'object')
    });
  }

  // Parse record updates
  const updateMatches = flowXml.match(/<recordUpdates>([\s\S]*?)<\/recordUpdates>/g) || [];
  for (const match of updateMatches) {
    parsed.elements.push({
      type: 'Update Records',
      name: extractXmlValue(match, 'name'),
      object: extractXmlValue(match, 'object')
    });
  }

  // Parse decisions
  const decisionMatches = flowXml.match(/<decisions>([\s\S]*?)<\/decisions>/g) || [];
  for (const match of decisionMatches) {
    parsed.elements.push({
      type: 'Decision',
      name: extractXmlValue(match, 'name'),
      description: extractXmlValue(match, 'description')
    });
  }

  // Parse assignments
  const assignMatches = flowXml.match(/<assignments>([\s\S]*?)<\/assignments>/g) || [];
  for (const match of assignMatches) {
    parsed.elements.push({
      type: 'Assignment',
      name: extractXmlValue(match, 'name')
    });
  }

  return parsed;
}

/**
 * Helper to extract XML value
 */
function extractXmlValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return match ? match[1].trim() : null;
}

/**
 * Generate Flow documentation
 */
function generateFlowDoc(flowData, options = {}) {
  const doc = {
    title: `Flow: ${flowData.label}`,
    generatedAt: new Date().toISOString(),
    apiVersion: flowData.apiVersion,
    sections: {}
  };

  // Overview section
  doc.sections.overview = {
    title: 'Overview',
    content: [
      `**Name:** ${flowData.label}`,
      `**Type:** ${flowData.processType || 'Record-Triggered'}`,
      `**Status:** ${flowData.status}`,
      `**Description:** ${flowData.description}`,
      ''
    ].join('\n')
  };

  // Trigger conditions
  if (flowData.start?.object) {
    doc.sections.triggerConditions = {
      title: 'Trigger Conditions',
      content: generateTriggerConditionsContent(flowData.start)
    };
  }

  // Elements summary
  doc.sections.elements = {
    title: 'Flow Elements',
    content: generateElementsSummary(flowData.elements)
  };

  // Field mappings
  doc.sections.fieldMappings = {
    title: 'Field Mappings',
    content: '**Note:** Review flow in Setup > Flows for detailed field mappings.\n\n' +
             'Key objects involved:\n' +
             [...new Set(flowData.elements.map(e => e.object).filter(Boolean))]
               .map(o => `- ${o}`)
               .join('\n')
  };

  // Error handling
  doc.sections.errorHandling = {
    title: 'Error Handling',
    content: flowData.elements.some(e => e.type === 'Decision')
      ? 'This flow includes decision elements for conditional processing.\n' +
        'Check each path for proper error handling.'
      : 'No explicit error handling detected. Consider adding fault connectors.'
  };

  // Testing guidance
  doc.sections.testingGuidance = {
    title: 'Testing Guidance',
    content: generateTestingGuidance(flowData)
  };

  // Maintenance notes
  doc.sections.maintenanceNotes = {
    title: 'Maintenance Notes',
    content: generateMaintenanceNotes(flowData)
  };

  return doc;
}

/**
 * Generate trigger conditions content
 */
function generateTriggerConditionsContent(startData) {
  const lines = [
    `**Object:** ${startData.object}`,
    `**Trigger Type:** ${startData.recordTriggerType || startData.triggerType || 'Not specified'}`,
    ''
  ];

  if (startData.doesRequireRecordChangedToMeetCriteria) {
    lines.push('**Change Detection:** Only runs when record values change to meet criteria');
    lines.push('');
  }

  if (startData.filters && startData.filters.length > 0) {
    lines.push('**Entry Criteria:**');
    for (const filter of startData.filters) {
      lines.push(`- ${filter.field} ${filter.operator} ${filter.value || '(value)'}`);
    }
    if (startData.filterLogic) {
      lines.push(`- **Logic:** ${startData.filterLogic}`);
    }
  } else {
    lines.push('**Entry Criteria:** All records (no filter conditions)');
  }

  return lines.join('\n');
}

/**
 * Generate elements summary
 */
function generateElementsSummary(elements) {
  if (elements.length === 0) {
    return 'No elements detected.';
  }

  // Group by type
  const byType = {};
  for (const el of elements) {
    if (!byType[el.type]) {
      byType[el.type] = [];
    }
    byType[el.type].push(el);
  }

  const lines = [];
  for (const [type, items] of Object.entries(byType)) {
    lines.push(`### ${type} (${items.length})`);
    for (const item of items) {
      lines.push(`- **${item.name}**${item.object ? ` - Object: ${item.object}` : ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate testing guidance
 */
function generateTestingGuidance(flowData) {
  const lines = [
    '## Test Scenarios',
    ''
  ];

  // Basic scenarios
  lines.push('### Required Test Cases:');
  lines.push('1. **Positive Test:** Create/update a record that meets all entry criteria');
  lines.push('2. **Negative Test:** Create/update a record that does NOT meet entry criteria');

  if (flowData.start?.doesRequireRecordChangedToMeetCriteria) {
    lines.push('3. **Change Detection Test:** Update a record where the tracked fields change');
    lines.push('4. **No Change Test:** Update a record without changing tracked fields (flow should NOT run)');
  }

  // Bulk testing
  lines.push('');
  lines.push('### Bulk Testing:');
  lines.push('- Test with 200+ records to verify bulk handling');
  lines.push('- Use Data Loader or Anonymous Apex for bulk updates');

  // Permissions testing
  lines.push('');
  lines.push('### Permission Testing:');
  lines.push('- Test as a user with the intended profile');
  lines.push('- Verify flow runs in system context OR user context as expected');

  return lines.join('\n');
}

/**
 * Generate maintenance notes
 */
function generateMaintenanceNotes(flowData) {
  const lines = [
    '## Maintenance Checklist',
    ''
  ];

  lines.push('### Before Making Changes:');
  lines.push('1. Create a new version (do NOT modify active version directly)');
  lines.push('2. Document the change reason in the version description');
  lines.push('3. Test in sandbox first');
  lines.push('');

  lines.push('### After Deployment:');
  lines.push('1. Monitor debug logs for the first 24 hours');
  lines.push('2. Check for "Flow failed" emails');
  lines.push('3. Verify expected records are being created/updated');
  lines.push('');

  // Specific warnings based on flow content
  if (flowData.start?.doesRequireRecordChangedToMeetCriteria) {
    lines.push('### ⚠️ Important Warning:');
    lines.push('This flow uses **"Only when a record is updated to meet the condition criteria"**.');
    lines.push('If you remove this setting, the flow will run on ALL updates, not just when values change.');
    lines.push('');
  }

  lines.push('### Deactivation:');
  lines.push('To deactivate: Setup > Flows > [Flow Name] > Deactivate');
  lines.push('**Note:** Deactivating does NOT delete existing versions. You can reactivate if needed.');

  return lines.join('\n');
}

/**
 * Generate Validation Rule documentation
 */
function generateValidationRuleDoc(ruleData) {
  return {
    title: `Validation Rule: ${ruleData.fullName}`,
    generatedAt: new Date().toISOString(),
    sections: {
      overview: {
        title: 'Overview',
        content: [
          `**Name:** ${ruleData.fullName}`,
          `**Active:** ${ruleData.active ? 'Yes' : 'No'}`,
          `**Description:** ${ruleData.description || 'No description'}`,
          ''
        ].join('\n')
      },
      formula: {
        title: 'Formula',
        content: '```\n' + (ruleData.errorConditionFormula || 'No formula') + '\n```'
      },
      errorMessage: {
        title: 'Error Message',
        content: [
          `**Message:** ${ruleData.errorMessage || 'No message'}`,
          `**Display Field:** ${ruleData.errorDisplayField || 'Top of page'}`,
          ''
        ].join('\n')
      }
    }
  };
}

/**
 * Generate complete handoff document
 */
async function generateHandoffDocument(options) {
  const {
    targetOrg = null,
    components = [],
    outputPath = null,
    format = 'markdown',
    title = 'Admin Handoff Documentation',
    includePermissions = true
  } = options;

  const doc = {
    title,
    generatedAt: new Date().toISOString(),
    targetOrg: targetOrg || 'default',
    components: []
  };

  for (const component of components) {
    try {
      let componentDoc;

      switch (component.type) {
        case 'flow':
          const flowPath = component.path || `force-app/main/default/flows/${component.name}.flow-meta.xml`;
          if (fs.existsSync(flowPath)) {
            const flowXml = fs.readFileSync(flowPath, 'utf8');
            const flowData = parseFlowMetadata(flowXml);
            componentDoc = generateFlowDoc(flowData);
          } else {
            console.warn(`Flow file not found: ${flowPath}`);
            continue;
          }
          break;

        case 'validationRule':
          // Would need to fetch from org or local files
          componentDoc = {
            title: `Validation Rule: ${component.name}`,
            sections: {
              note: { title: 'Note', content: 'Fetch from Setup > Object Manager > [Object] > Validation Rules' }
            }
          };
          break;

        default:
          console.warn(`Unknown component type: ${component.type}`);
          continue;
      }

      if (componentDoc) {
        doc.components.push(componentDoc);
      }
    } catch (error) {
      console.error(`Error processing ${component.name}: ${error.message}`);
    }
  }

  // Format output
  let output;
  if (format === 'json') {
    output = JSON.stringify(doc, null, 2);
  } else {
    output = formatAsMarkdown(doc);
  }

  // Write to file if specified
  if (outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, output);
    console.log(`Documentation written to: ${outputPath}`);
  }

  return output;
}

/**
 * Format document as Markdown
 */
function formatAsMarkdown(doc) {
  const lines = [
    `# ${doc.title}`,
    '',
    `*Generated: ${doc.generatedAt}*`,
    `*Target Org: ${doc.targetOrg}*`,
    '',
    '---',
    ''
  ];

  // Table of contents
  lines.push('## Table of Contents');
  lines.push('');
  for (let i = 0; i < doc.components.length; i++) {
    const comp = doc.components[i];
    const anchor = comp.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    lines.push(`${i + 1}. [${comp.title}](#${anchor})`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Component sections
  for (const comp of doc.components) {
    lines.push(`## ${comp.title}`);
    lines.push('');

    for (const [key, section] of Object.entries(comp.sections)) {
      if (section.title && section.content) {
        lines.push(`### ${section.title}`);
        lines.push('');
        lines.push(section.content);
        lines.push('');
      }
    }

    lines.push('---');
    lines.push('');
  }

  // Footer
  lines.push('');
  lines.push('*This document was auto-generated. Always verify with the actual Salesforce org.*');

  return lines.join('\n');
}

/**
 * Generate handoff from a deployment manifest
 */
async function generateFromManifest(manifestPath, options = {}) {
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  const components = [];

  // Parse package.xml for component types
  const flowMatches = manifest.match(/<members>([^<]+)<\/members>/g) || [];
  for (const match of flowMatches) {
    const name = match.replace(/<\/?members>/g, '');
    // Determine type from context (simplified)
    if (manifest.includes('<name>Flow</name>')) {
      components.push({ type: 'flow', name });
    }
  }

  return generateHandoffDocument({
    ...options,
    components
  });
}

/**
 * Generate handoff from local flow files
 */
async function generateFromFlowDirectory(flowDir, options = {}) {
  const components = [];

  if (!fs.existsSync(flowDir)) {
    throw new Error(`Flow directory not found: ${flowDir}`);
  }

  const files = fs.readdirSync(flowDir).filter(f => f.endsWith('.flow-meta.xml'));

  for (const file of files) {
    const name = file.replace('.flow-meta.xml', '');
    components.push({
      type: 'flow',
      name,
      path: path.join(flowDir, file)
    });
  }

  return generateHandoffDocument({
    ...options,
    components
  });
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const usage = `
Admin Handoff Generator - Create Admin-Friendly Documentation

Usage:
  node admin-handoff-generator.js flow <flow-file> [--output <path>] [--format <md|json>]
  node admin-handoff-generator.js flows <directory> [--output <path>] [--format <md|json>]
  node admin-handoff-generator.js manifest <package.xml> [--output <path>]
  node admin-handoff-generator.js help

Commands:
  flow        Generate documentation for a single flow
  flows       Generate documentation for all flows in a directory
  manifest    Generate documentation from a package.xml deployment manifest

Options:
  --output <path>     Output file path (default: stdout)
  --format <format>   Output format: md (markdown) or json (default: md)
  --org <alias>       Target Salesforce org
  --title <title>     Document title
  --verbose           Enable verbose logging

Examples:
  # Document a single flow
  node admin-handoff-generator.js flow force-app/main/default/flows/MyFlow.flow-meta.xml

  # Document all flows in a directory
  node admin-handoff-generator.js flows force-app/main/default/flows/ --output docs/FLOWS.md

  # Generate from deployment manifest
  node admin-handoff-generator.js manifest manifest/package.xml --output docs/HANDOFF.md
`;

  async function main() {
    const outputIndex = args.indexOf('--output');
    const outputPath = outputIndex > -1 ? args[outputIndex + 1] : null;

    const formatIndex = args.indexOf('--format');
    const format = formatIndex > -1 ? args[formatIndex + 1] : 'markdown';

    const orgIndex = args.indexOf('--org');
    const targetOrg = orgIndex > -1 ? args[orgIndex + 1] : null;

    const titleIndex = args.indexOf('--title');
    const title = titleIndex > -1 ? args[titleIndex + 1] : 'Admin Handoff Documentation';

    CONFIG.verbose = args.includes('--verbose');

    switch (command) {
      case 'flow': {
        const flowFile = args[1];
        if (!flowFile) {
          console.error('Usage: admin-handoff-generator.js flow <flow-file>');
          process.exit(1);
        }

        if (!fs.existsSync(flowFile)) {
          console.error(`Flow file not found: ${flowFile}`);
          process.exit(1);
        }

        const flowXml = fs.readFileSync(flowFile, 'utf8');
        const flowData = parseFlowMetadata(flowXml);
        const doc = generateFlowDoc(flowData);

        const output = format === 'json'
          ? JSON.stringify(doc, null, 2)
          : formatAsMarkdown({ title, components: [doc], generatedAt: new Date().toISOString(), targetOrg: targetOrg || 'local' });

        if (outputPath) {
          fs.writeFileSync(outputPath, output);
          console.log(`Documentation written to: ${outputPath}`);
        } else {
          console.log(output);
        }
        break;
      }

      case 'flows': {
        const flowDir = args[1];
        if (!flowDir) {
          console.error('Usage: admin-handoff-generator.js flows <directory>');
          process.exit(1);
        }

        const output = await generateFromFlowDirectory(flowDir, {
          outputPath,
          format,
          targetOrg,
          title
        });

        if (!outputPath) {
          console.log(output);
        }
        break;
      }

      case 'manifest': {
        const manifestPath = args[1];
        if (!manifestPath) {
          console.error('Usage: admin-handoff-generator.js manifest <package.xml>');
          process.exit(1);
        }

        const output = await generateFromManifest(manifestPath, {
          outputPath,
          format,
          targetOrg,
          title
        });

        if (!outputPath) {
          console.log(output);
        }
        break;
      }

      default:
        console.log(usage);
        process.exit(command === 'help' || command === '--help' ? 0 : 1);
    }
  }

  main().catch(error => {
    console.error(`Error: ${error.message}`);
    if (CONFIG.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

module.exports = {
  parseFlowMetadata,
  generateFlowDoc,
  generateValidationRuleDoc,
  generateHandoffDocument,
  generateFromManifest,
  generateFromFlowDirectory,
  formatAsMarkdown
};
