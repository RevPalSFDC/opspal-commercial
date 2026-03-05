#!/usr/bin/env node

/**
 * UAT CSV Parser
 *
 * Parses UAT test workbooks (CSV format) into structured test cases with step extraction.
 * Designed to work with QA workbooks that follow the Epic/User Story/Acceptance Criteria format.
 *
 * @module uat-csv-parser
 * @version 1.0.0
 *
 * @example
 * const UATCSVParser = require('./uat-csv-parser');
 * const parser = new UATCSVParser();
 * const result = await parser.parse('./qa-workbook.csv');
 * console.log(result.testCases);
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Step action patterns for parsing test scenarios
 */
const STEP_PATTERNS = [
  // Navigation patterns
  { pattern: /^from\s+(\w+)/i, action: 'navigate', extract: 'object' },
  { pattern: /^navigate\s+to\s+(\w+)/i, action: 'navigate', extract: 'object' },
  { pattern: /^go\s+to\s+(\w+)/i, action: 'navigate', extract: 'object' },

  // Create patterns
  { pattern: /^create\s+(\w+)/i, action: 'create', extract: 'object' },
  { pattern: /^add\s+(\w+)/i, action: 'create', extract: 'object' },
  { pattern: /^insert\s+(\w+)/i, action: 'create', extract: 'object' },

  // Update patterns
  { pattern: /^update\s+(\w+)/i, action: 'update', extract: 'object' },
  { pattern: /^mark\s+(\w+)/i, action: 'update', extract: 'field' },
  { pattern: /^set\s+(\w+)/i, action: 'update', extract: 'field' },
  { pattern: /^change\s+(\w+)/i, action: 'update', extract: 'field' },
  { pattern: /^switch\s+(\w+)/i, action: 'update', extract: 'field' },

  // Verify patterns
  { pattern: /^verify\s+(.+)/i, action: 'verify', extract: 'target' },
  { pattern: /^confirm\s+(.+)/i, action: 'verify', extract: 'target' },
  { pattern: /^check\s+(.+)/i, action: 'verify', extract: 'target' },
  { pattern: /^validate\s+(.+)/i, action: 'verify', extract: 'target' },

  // Permission patterns
  { pattern: /^([\w\/]+)\s+profile\s+attempt/i, action: 'permission', extract: 'profile' },
  { pattern: /blocked/i, action: 'verify_blocked', extract: null },

  // Negative test patterns
  { pattern: /^negative:/i, action: 'negative_test', extract: null },

  // Approval patterns
  { pattern: /^submit\s+for\s+approval/i, action: 'submit_approval', extract: null },
  { pattern: /^approve/i, action: 'approve', extract: null },
  { pattern: /^reject/i, action: 'reject', extract: null },

  // DocuSign patterns
  { pattern: /^send\s+for\s+signature/i, action: 'docusign_send', extract: null },
  { pattern: /^recipient\s+signs?/i, action: 'docusign_sign', extract: null },
];

/**
 * Object name normalization map
 */
const OBJECT_MAP = {
  'account': 'Account',
  'accounts': 'Account',
  'contact': 'Contact',
  'contacts': 'Contact',
  'opp': 'Opportunity',
  'opportunity': 'Opportunity',
  'opportunities': 'Opportunity',
  'quote': 'SBQQ__Quote__c',
  'quotes': 'SBQQ__Quote__c',
  'quoteline': 'SBQQ__QuoteLine__c',
  'quote line': 'SBQQ__QuoteLine__c',
  'products': 'OpportunityLineItem',
  'product': 'Product2',
  'contract': 'Contract',
  'contracts': 'Contract',
  'subscription': 'SBQQ__Subscription__c',
  'subscriptions': 'SBQQ__Subscription__c',
  'lead': 'Lead',
  'leads': 'Lead',
  'case': 'Case',
  'cases': 'Case',
  'order': 'Order',
  'orders': 'Order',
};

class UATCSVParser {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.delimiter = options.delimiter || ',';
    this.stepDelimiters = options.stepDelimiters || ['→', '->', '→', ';', '\n'];
  }

  /**
   * Parse CSV file into structured test cases
   * @param {string} csvPath - Path to CSV file
   * @returns {Promise<Object>} Parsed test cases and metadata
   */
  async parse(csvPath) {
    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found: ${csvPath}`);
    }

    this.log(`📋 Parsing UAT CSV: ${path.basename(csvPath)}`);

    const rows = await this.readCSV(csvPath);
    const testCases = this.extractTestCases(rows);

    this.log(`✅ Extracted ${testCases.length} test cases`);

    return {
      source: csvPath,
      parsedAt: new Date().toISOString(),
      testCases,
      stats: {
        totalRows: rows.length,
        testCases: testCases.length,
        totalSteps: testCases.reduce((sum, tc) => sum + tc.steps.length, 0),
        epics: [...new Set(testCases.map(tc => tc.epic))].filter(Boolean)
      }
    };
  }

  /**
   * Read CSV file with header-based parsing
   */
  async readCSV(csvPath) {
    return new Promise((resolve, reject) => {
      const rows = [];
      let headers = null;
      let lineNumber = 0;

      const fileStream = fs.createReadStream(csvPath, { encoding: 'utf-8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      rl.on('line', (line) => {
        lineNumber++;
        if (!line.trim()) return;

        const values = this.parseLine(line);

        if (lineNumber === 1) {
          headers = values.map(h => h.trim());
          this.log(`  Headers: ${headers.join(', ')}`);
        } else {
          const row = {};
          headers.forEach((header, index) => {
            row[header] = values[index] ? values[index].trim() : '';
          });
          rows.push(row);
        }
      });

      rl.on('close', () => resolve(rows));
      rl.on('error', reject);
    });
  }

  /**
   * Parse a single CSV line handling quotes
   */
  parseLine(line) {
    const values = [];
    let currentValue = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentValue += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === this.delimiter && !inQuotes) {
        values.push(currentValue);
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue);
    return values;
  }

  /**
   * Extract test cases from parsed rows
   */
  extractTestCases(rows) {
    const testCases = [];
    let currentEpic = '';
    let currentUserStory = '';
    let currentAcceptanceCriteria = '';
    let testCaseIndex = 0;

    for (const row of rows) {
      // Track current epic, user story, acceptance criteria (they may span multiple rows)
      if (row['Epic']) currentEpic = row['Epic'];
      if (row['User Story']) currentUserStory = row['User Story'];
      if (row['Acceptance Criteria']) currentAcceptanceCriteria = row['Acceptance Criteria'];

      // Get test scenario text
      const scenarioText = row['Test Scenarios'] || row['Test Scenario'] || '';
      if (!scenarioText.trim()) continue;

      testCaseIndex++;
      const testCaseId = this.generateTestCaseId(currentEpic, testCaseIndex);

      // Parse steps from scenario text
      const steps = this.parseSteps(scenarioText);

      testCases.push({
        id: testCaseId,
        epic: currentEpic,
        userStory: currentUserStory,
        acceptanceCriteria: currentAcceptanceCriteria,
        scenario: scenarioText,
        steps,
        result: row['Result'] || '',
        passFail: row['Pass/Fail'] || '',
        testRecordUrl: row['Test Record URL'] || '',
        testerComments: row['Tester Comments'] || ''
      });
    }

    return testCases;
  }

  /**
   * Generate a unique test case ID
   */
  generateTestCaseId(epic, index) {
    const epicCode = epic
      ? epic.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10).toUpperCase()
      : 'UAT';
    return `${epicCode}-TS-${String(index).padStart(3, '0')}`;
  }

  /**
   * Parse step sequence from scenario text
   */
  parseSteps(scenarioText) {
    const steps = [];

    // Split by step delimiters
    let stepTexts = [scenarioText];
    for (const delim of this.stepDelimiters) {
      stepTexts = stepTexts.flatMap(text => text.split(delim));
    }

    // Clean and parse each step
    stepTexts = stepTexts
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (let i = 0; i < stepTexts.length; i++) {
      const stepText = stepTexts[i];
      const step = this.parseStep(stepText, i + 1);
      if (step) {
        steps.push(step);
      }
    }

    return steps;
  }

  /**
   * Parse a single step text into structured step object
   */
  parseStep(stepText, stepNumber) {
    const step = {
      stepNumber,
      raw: stepText,
      action: 'manual',
      object: null,
      field: null,
      target: null,
      precondition: null,
      data: {}
    };

    // Check for preconditions (e.g., "add products after Qualification")
    const afterMatch = stepText.match(/after\s+(\w+)/i);
    if (afterMatch) {
      step.precondition = { stage: afterMatch[1] };
    }

    // Try to match step patterns
    for (const { pattern, action, extract } of STEP_PATTERNS) {
      const match = stepText.match(pattern);
      if (match) {
        step.action = action;

        if (extract === 'object' && match[1]) {
          step.object = this.normalizeObjectName(match[1]);
        } else if (extract === 'field' && match[1]) {
          step.field = match[1];
        } else if (extract === 'target' && match[1]) {
          step.target = match[1];
        } else if (extract === 'profile' && match[1]) {
          step.profile = match[1];
        }

        break;
      }
    }

    // Extract additional context from step text
    this.extractStepContext(step, stepText);

    return step;
  }

  /**
   * Extract additional context from step text
   */
  extractStepContext(step, stepText) {
    const lowerText = stepText.toLowerCase();

    // Check for primary flag
    if (lowerText.includes('primary')) {
      step.data.primary = true;
      if (step.action === 'update' && !step.field) {
        step.field = 'Primary';
      }
    }

    // Check for rollup verification
    if (lowerText.includes('rollup')) {
      step.target = 'rollups';
      if (step.action === 'manual') step.action = 'verify';
    }

    // Check for stage references
    const stageMatch = stepText.match(/stage[:\s]+(\w+)/i);
    if (stageMatch) {
      step.data.stage = stageMatch[1];
    }

    // Check for specific field values
    const valueMatch = stepText.match(/(\w+)\s*[=:]\s*["']?([^"'\s]+)["']?/i);
    if (valueMatch) {
      step.data[valueMatch[1]] = valueMatch[2];
    }

    // Check for quantity/discount changes
    if (lowerText.includes('quantity') || lowerText.includes('discount')) {
      step.target = lowerText.includes('quantity') ? 'quantity' : 'discount';
      if (step.action === 'manual') step.action = 'update';
    }

    // Check for approval-related content
    if (lowerText.includes('approval') || lowerText.includes('approve')) {
      step.target = 'approval';
    }

    // Check for blocked/denied scenarios
    if (lowerText.includes('blocked') || lowerText.includes('denied') || lowerText.includes('error')) {
      step.expectedOutcome = 'blocked';
    }

    // Check for multi-year terms
    const termMatch = stepText.match(/(\d+)[\s-]*(month|year)/i);
    if (termMatch) {
      step.data.term = {
        value: parseInt(termMatch[1]),
        unit: termMatch[2].toLowerCase()
      };
    }
  }

  /**
   * Normalize object name to Salesforce API name
   */
  normalizeObjectName(name) {
    const normalized = OBJECT_MAP[name.toLowerCase()];
    return normalized || name;
  }

  /**
   * Logging helper
   */
  log(message) {
    if (this.verbose) {
      console.log(message);
    }
  }

  /**
   * Generate test data template from parsed test cases
   */
  generateTestDataTemplate(testCases) {
    const template = {};

    for (const tc of testCases) {
      template[tc.id] = {
        _description: tc.scenario.substring(0, 100) + (tc.scenario.length > 100 ? '...' : ''),
        _steps: tc.steps.length
      };

      // Add placeholder data for each object type in the test
      const objectTypes = new Set(tc.steps.filter(s => s.object).map(s => s.object));
      for (const objType of objectTypes) {
        template[tc.id][objType] = this.getDefaultTestData(objType);
      }

      // Add assertions placeholder
      template[tc.id].assertions = {};
    }

    return template;
  }

  /**
   * Get default test data for an object type
   */
  getDefaultTestData(objectType) {
    const defaults = {
      'Account': { Name: 'Test Account UAT', Type: 'Customer' },
      'Contact': { FirstName: 'Test', LastName: 'Contact UAT', Email: 'test@uat.com' },
      'Opportunity': { Name: 'Test Opp UAT', StageName: 'Qualification', CloseDate: '2025-12-31' },
      'SBQQ__Quote__c': { SBQQ__Primary__c: true },
      'SBQQ__QuoteLine__c': { SBQQ__Quantity__c: 1 },
      'OpportunityLineItem': { Quantity: 1, UnitPrice: 100 },
      'Lead': { FirstName: 'Test', LastName: 'Lead UAT', Company: 'Test Company' },
      'Case': { Subject: 'Test Case UAT', Status: 'New' }
    };

    return defaults[objectType] || { Name: `Test ${objectType} UAT` };
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
UAT CSV Parser - Parse UAT test workbooks into structured test cases

Usage:
  node uat-csv-parser.js <csv-file> [options]

Options:
  --verbose          Show detailed output
  --output <file>    Write parsed results to JSON file
  --template         Generate test data template

Example:
  node uat-csv-parser.js ./qa-workbook.csv --verbose --output ./parsed-tests.json
`);
    process.exit(0);
  }

  const csvPath = args[0];
  const verbose = args.includes('--verbose');
  const generateTemplate = args.includes('--template');

  const outputIndex = args.indexOf('--output');
  const outputPath = outputIndex !== -1 ? args[outputIndex + 1] : null;

  const parser = new UATCSVParser({ verbose });

  parser.parse(csvPath)
    .then(result => {
      console.log(`\n${'═'.repeat(60)}`);
      console.log('  UAT CSV PARSER RESULTS');
      console.log(`${'═'.repeat(60)}`);
      console.log(`Source: ${result.source}`);
      console.log(`Test Cases: ${result.stats.testCases}`);
      console.log(`Total Steps: ${result.stats.totalSteps}`);
      console.log(`Epics: ${result.stats.epics.join(', ') || 'None'}`);
      console.log(`${'═'.repeat(60)}\n`);

      // Show test case summary
      for (const tc of result.testCases) {
        console.log(`▶ ${tc.id}: ${tc.scenario.substring(0, 60)}${tc.scenario.length > 60 ? '...' : ''}`);
        console.log(`  Steps: ${tc.steps.length}`);
        for (const step of tc.steps) {
          const icon = step.action === 'verify' ? '✓' : step.action === 'create' ? '+' : '→';
          console.log(`    ${icon} ${step.raw.substring(0, 50)}${step.raw.length > 50 ? '...' : ''}`);
        }
        console.log('');
      }

      // Write output
      if (outputPath) {
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
        console.log(`💾 Results written to: ${outputPath}`);
      }

      // Generate template
      if (generateTemplate) {
        const template = parser.generateTestDataTemplate(result.testCases);
        const templatePath = csvPath.replace('.csv', '-test-data-template.json');
        fs.writeFileSync(templatePath, JSON.stringify(template, null, 2));
        console.log(`📝 Test data template written to: ${templatePath}`);
      }

      process.exit(0);
    })
    .catch(error => {
      console.error(`❌ Parse failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = UATCSVParser;
