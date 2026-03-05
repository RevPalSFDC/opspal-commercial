#!/usr/bin/env node

/**
 * Assignment Rule Parser
 *
 * Parses Salesforce AssignmentRules XML metadata structure and extracts
 * rule entries, criteria, assignees, and evaluation order.
 *
 * @module assignment-rule-parser
 * @version 1.0.0
 */

const { DOMParser } = require('@xmldom/xmldom');

/**
 * Parse AssignmentRules XML metadata into structured JavaScript object
 *
 * @param {string} xmlString - Raw XML string from Metadata API
 * @returns {Object} Structured assignment rule object
 * @throws {Error} If XML is invalid or required fields missing
 *
 * @example
 * const xml = fs.readFileSync('Lead.assignmentRules', 'utf8');
 * const rules = parseRuleMetadata(xml);
 * console.log(rules.assignmentRules); // Array of rule objects
 */
function parseRuleMetadata(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') {
    throw new Error('Invalid input: xmlString must be a non-empty string');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');

  // Check for parsing errors
  const parserError = doc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    throw new Error(`XML parsing error: ${parserError.textContent}`);
  }

  const root = doc.documentElement;
  if (!root || root.nodeName !== 'AssignmentRules') {
    throw new Error('Invalid AssignmentRules XML: root element must be <AssignmentRules>');
  }

  // Extract fullName (object type: Lead, Case)
  const fullNameNode = root.getElementsByTagName('fullName')[0];
  const objectType = fullNameNode ? getTextContent(fullNameNode) : null;

  // Extract all assignmentRule elements
  const assignmentRuleNodes = root.getElementsByTagName('assignmentRule');
  const assignmentRules = [];

  for (let i = 0; i < assignmentRuleNodes.length; i++) {
    const ruleNode = assignmentRuleNodes[i];
    const rule = parseAssignmentRule(ruleNode);
    assignmentRules.push(rule);
  }

  return {
    objectType,
    assignmentRules,
    metadata: {
      xmlns: root.getAttribute('xmlns'),
      parsedAt: new Date().toISOString()
    }
  };
}

/**
 * Parse individual assignmentRule element
 *
 * @private
 * @param {Element} ruleNode - DOM element for assignmentRule
 * @returns {Object} Parsed rule object
 */
function parseAssignmentRule(ruleNode) {
  const rule = {
    name: getElementText(ruleNode, 'name'),
    active: getElementText(ruleNode, 'active') === 'true',
    senderEmail: getElementText(ruleNode, 'senderEmail'),
    entries: []
  };

  // Parse all ruleEntry elements
  const entryNodes = ruleNode.getElementsByTagName('ruleEntry');
  for (let i = 0; i < entryNodes.length; i++) {
    const entryNode = entryNodes[i];
    const entry = parseRuleEntry(entryNode);
    rule.entries.push(entry);
  }

  return rule;
}

/**
 * Parse individual ruleEntry element
 *
 * @private
 * @param {Element} entryNode - DOM element for ruleEntry
 * @returns {Object} Parsed rule entry
 */
function parseRuleEntry(entryNode) {
  const entry = {
    order: parseInt(getElementText(entryNode, 'order') || '0', 10),
    assignedTo: getElementText(entryNode, 'assignedTo'),
    assignedToType: getElementText(entryNode, 'assignedToType') ||
                    getElementText(entryNode, 'assignToType'), // Handle both spellings
    template: getElementText(entryNode, 'template'),
    emailTemplate: getElementText(entryNode, 'emailTemplate'),
    booleanFilter: getElementText(entryNode, 'booleanFilter'),
    criteriaItems: [],
    formula: getElementText(entryNode, 'formula'),
    disableRule: getElementText(entryNode, 'disableRule') === 'true' // "Do Not Reassign Owner"
  };

  // Parse all criteriaItems
  const criteriaNodes = entryNode.getElementsByTagName('criteriaItems');
  for (let i = 0; i < criteriaNodes.length; i++) {
    const criteriaNode = criteriaNodes[i];
    const criteria = parseCriteriaItem(criteriaNode);
    entry.criteriaItems.push(criteria);
  }

  return entry;
}

/**
 * Parse individual criteriaItems element
 *
 * @private
 * @param {Element} criteriaNode - DOM element for criteriaItems
 * @returns {Object} Parsed criteria object
 */
function parseCriteriaItem(criteriaNode) {
  return {
    field: getElementText(criteriaNode, 'field'),
    operation: getElementText(criteriaNode, 'operation'),
    value: getElementText(criteriaNode, 'value'),
    valueField: getElementText(criteriaNode, 'valueField')
  };
}

/**
 * Extract criteria from a rule entry into simplified array format
 *
 * @param {Object} ruleEntry - Parsed rule entry object
 * @returns {Array<Object>} Array of criteria conditions
 *
 * @example
 * const criteria = extractCriteria(ruleEntry);
 * // [
 * //   { field: 'Industry', operator: 'equals', value: 'Healthcare' },
 * //   { field: 'State', operator: 'equals', value: 'CA' }
 * // ]
 */
function extractCriteria(ruleEntry) {
  if (!ruleEntry || !ruleEntry.criteriaItems) {
    return [];
  }

  return ruleEntry.criteriaItems.map(item => ({
    field: item.field,
    operator: item.operation || 'equals',
    value: item.value || item.valueField,
    isFieldReference: !!item.valueField
  }));
}

/**
 * Identify assignee type based on Salesforce ID prefix
 *
 * Salesforce ID Prefixes:
 * - 005: User
 * - 00G: Queue (Group)
 * - 00E: UserRole
 * - 0TM: Territory2
 *
 * @param {string} assignedTo - 15 or 18 character Salesforce ID
 * @returns {string} Assignee type: 'User', 'Queue', 'Role', 'Territory', 'Unknown'
 *
 * @example
 * identifyAssigneeType('0051234567890ABC'); // 'User'
 * identifyAssigneeType('00G1234567890ABC'); // 'Queue'
 */
function identifyAssigneeType(assignedTo) {
  if (!assignedTo || typeof assignedTo !== 'string') {
    return 'Unknown';
  }

  // Normalize to 15-character ID (remove case-safe suffix if present)
  const id = assignedTo.substring(0, 15);

  // Check ID prefix
  const prefix = id.substring(0, 3);

  const prefixMap = {
    '005': 'User',
    '00G': 'Queue',
    '00E': 'Role',
    '0TM': 'Territory'
  };

  return prefixMap[prefix] || 'Unknown';
}

/**
 * Get rule evaluation order (sorted entries by order number)
 *
 * @param {Object} assignmentRule - Parsed assignment rule object
 * @returns {Array<Object>} Sorted array of rule entries
 *
 * @example
 * const orderedEntries = getRuleEvaluationOrder(rule);
 * orderedEntries.forEach((entry, index) => {
 *   console.log(`Priority ${index + 1}: ${entry.order}`);
 * });
 */
function getRuleEvaluationOrder(assignmentRule) {
  if (!assignmentRule || !assignmentRule.entries) {
    return [];
  }

  // Sort by order number (ascending)
  return [...assignmentRule.entries].sort((a, b) => a.order - b.order);
}

/**
 * Generate summary statistics for assignment rule
 *
 * @param {Object} assignmentRule - Parsed assignment rule object
 * @returns {Object} Summary statistics
 *
 * @example
 * const stats = generateRuleSummary(rule);
 * console.log(`Rule: ${stats.ruleName}`);
 * console.log(`Entries: ${stats.totalEntries}`);
 * console.log(`Active: ${stats.isActive}`);
 */
function generateRuleSummary(assignmentRule) {
  if (!assignmentRule) {
    return null;
  }

  const entries = assignmentRule.entries || [];
  const assigneeTypes = entries.map(e => identifyAssigneeType(e.assignedTo));

  return {
    ruleName: assignmentRule.name,
    isActive: assignmentRule.active,
    totalEntries: entries.length,
    assigneeBreakdown: {
      users: assigneeTypes.filter(t => t === 'User').length,
      queues: assigneeTypes.filter(t => t === 'Queue').length,
      roles: assigneeTypes.filter(t => t === 'Role').length,
      territories: assigneeTypes.filter(t => t === 'Territory').length,
      unknown: assigneeTypes.filter(t => t === 'Unknown').length
    },
    hasFormulaEntries: entries.some(e => e.formula),
    hasBooleanFilters: entries.some(e => e.booleanFilter),
    disabledEntries: entries.filter(e => e.disableRule).length
  };
}

/**
 * Validate rule structure and return any issues
 *
 * @param {Object} assignmentRule - Parsed assignment rule object
 * @returns {Array<Object>} Array of validation issues
 *
 * @example
 * const issues = validateRuleStructure(rule);
 * if (issues.length > 0) {
 *   console.error('Validation issues:', issues);
 * }
 */
function validateRuleStructure(assignmentRule) {
  const issues = [];

  if (!assignmentRule) {
    issues.push({
      severity: 'critical',
      message: 'Assignment rule is null or undefined'
    });
    return issues;
  }

  // Check rule name
  if (!assignmentRule.name) {
    issues.push({
      severity: 'critical',
      field: 'name',
      message: 'Rule name is required'
    });
  }

  // Check entries exist
  if (!assignmentRule.entries || assignmentRule.entries.length === 0) {
    issues.push({
      severity: 'warning',
      field: 'entries',
      message: 'Rule has no entries'
    });
  }

  // Validate each entry
  if (assignmentRule.entries) {
    assignmentRule.entries.forEach((entry, index) => {
      // Check order
      if (entry.order === undefined || entry.order === null) {
        issues.push({
          severity: 'critical',
          field: `entries[${index}].order`,
          message: 'Entry order is required'
        });
      }

      // Check assignee
      if (!entry.assignedTo) {
        issues.push({
          severity: 'critical',
          field: `entries[${index}].assignedTo`,
          message: 'Entry must have an assignee'
        });
      }

      // Check criteria or formula
      if ((!entry.criteriaItems || entry.criteriaItems.length === 0) && !entry.formula) {
        issues.push({
          severity: 'warning',
          field: `entries[${index}]`,
          message: 'Entry has neither criteria items nor formula (will match all records)'
        });
      }

      // Check for duplicate order numbers
      const duplicateOrders = assignmentRule.entries.filter(e => e.order === entry.order);
      if (duplicateOrders.length > 1) {
        issues.push({
          severity: 'warning',
          field: `entries[${index}].order`,
          message: `Duplicate order number ${entry.order} found in multiple entries`
        });
      }
    });
  }

  return issues;
}

/**
 * Helper: Get text content from element by tag name
 * @private
 */
function getElementText(parentNode, tagName) {
  const element = parentNode.getElementsByTagName(tagName)[0];
  return element ? getTextContent(element) : null;
}

/**
 * Helper: Get text content from node (handles CDATA and text nodes)
 * @private
 */
function getTextContent(node) {
  if (!node) return null;

  // Check for CDATA sections
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];
    if (child.nodeType === 4) { // CDATA_SECTION_NODE
      return child.data;
    }
  }

  // Fall back to textContent
  return node.textContent || null;
}

/**
 * Build XML string from parsed assignment rule object
 * (Reverse operation of parseRuleMetadata)
 *
 * @param {Object} ruleData - Structured assignment rule object
 * @returns {string} XML string ready for Metadata API deployment
 *
 * @example
 * const xml = buildAssignmentRuleXML(ruleData);
 * fs.writeFileSync('Lead.assignmentRules', xml);
 */
function buildAssignmentRuleXML(ruleData) {
  if (!ruleData || !ruleData.objectType) {
    throw new Error('Invalid ruleData: objectType is required');
  }

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<AssignmentRules xmlns="http://soap.sforce.com/2006/04/metadata">\n';
  xml += `    <fullName>${escapeXml(ruleData.objectType)}</fullName>\n`;

  // Build each assignment rule
  if (ruleData.assignmentRules && ruleData.assignmentRules.length > 0) {
    ruleData.assignmentRules.forEach(rule => {
      xml += buildAssignmentRuleElement(rule);
    });
  }

  xml += '</AssignmentRules>';
  return xml;
}

/**
 * Build XML for single assignmentRule element
 * @private
 */
function buildAssignmentRuleElement(rule) {
  let xml = '    <assignmentRule>\n';
  xml += `        <active>${rule.active ? 'true' : 'false'}</active>\n`;

  if (rule.senderEmail) {
    xml += `        <senderEmail>${escapeXml(rule.senderEmail)}</senderEmail>\n`;
  }

  xml += `        <name>${escapeXml(rule.name)}</name>\n`;

  // Build each rule entry
  if (rule.entries && rule.entries.length > 0) {
    rule.entries.forEach(entry => {
      xml += buildRuleEntryElement(entry);
    });
  }

  xml += '    </assignmentRule>\n';
  return xml;
}

/**
 * Build XML for single ruleEntry element
 * @private
 */
function buildRuleEntryElement(entry) {
  let xml = '        <ruleEntry>\n';
  xml += `            <order>${entry.order}</order>\n`;

  // Add criteria items
  if (entry.criteriaItems && entry.criteriaItems.length > 0) {
    entry.criteriaItems.forEach(criteria => {
      xml += '            <criteriaItems>\n';
      xml += `                <field>${escapeXml(criteria.field)}</field>\n`;
      xml += `                <operation>${escapeXml(criteria.operation)}</operation>\n`;

      if (criteria.value) {
        xml += `                <value>${escapeXml(criteria.value)}</value>\n`;
      }
      if (criteria.valueField) {
        xml += `                <valueField>${escapeXml(criteria.valueField)}</valueField>\n`;
      }

      xml += '            </criteriaItems>\n';
    });
  }

  // Add formula if present
  if (entry.formula) {
    xml += `            <formula>${escapeXml(entry.formula)}</formula>\n`;
  }

  // Add boolean filter if present
  if (entry.booleanFilter) {
    xml += `            <booleanFilter>${escapeXml(entry.booleanFilter)}</booleanFilter>\n`;
  }

  // Add assignee
  xml += `            <assignedTo>${escapeXml(entry.assignedTo)}</assignedTo>\n`;

  if (entry.assignedToType) {
    xml += `            <assignedToType>${escapeXml(entry.assignedToType)}</assignedToType>\n`;
  }

  // Add email template if present
  if (entry.emailTemplate) {
    xml += `            <emailTemplate>${escapeXml(entry.emailTemplate)}</emailTemplate>\n`;
  }

  // Add template if present
  if (entry.template) {
    xml += `            <template>${escapeXml(entry.template)}</template>\n`;
  }

  // Add disableRule if true
  if (entry.disableRule) {
    xml += `            <disableRule>true</disableRule>\n`;
  }

  xml += '        </ruleEntry>\n';
  return xml;
}

/**
 * Escape XML special characters
 * @private
 */
function escapeXml(str) {
  if (str === null || str === undefined) {
    return '';
  }

  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Export functions
module.exports = {
  parseRuleMetadata,
  extractCriteria,
  identifyAssigneeType,
  getRuleEvaluationOrder,
  generateRuleSummary,
  validateRuleStructure,
  buildAssignmentRuleXML
};

// CLI support
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');

  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node assignment-rule-parser.js <xml-file-path>');
    console.error('');
    console.error('Example:');
    console.error('  node assignment-rule-parser.js force-app/main/default/assignmentRules/Lead.assignmentRules');
    process.exit(1);
  }

  const filePath = args[0];

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  try {
    const xmlContent = fs.readFileSync(filePath, 'utf8');
    const parsed = parseRuleMetadata(xmlContent);

    console.log('Parsed Assignment Rules:');
    console.log(JSON.stringify(parsed, null, 2));

    // Show summary for each rule
    if (parsed.assignmentRules) {
      console.log('\n=== Rule Summaries ===');
      parsed.assignmentRules.forEach(rule => {
        const summary = generateRuleSummary(rule);
        console.log(`\nRule: ${summary.ruleName}`);
        console.log(`  Active: ${summary.isActive}`);
        console.log(`  Entries: ${summary.totalEntries}`);
        console.log(`  Assignee Types: ${JSON.stringify(summary.assigneeBreakdown)}`);

        // Validate
        const issues = validateRuleStructure(rule);
        if (issues.length > 0) {
          console.log(`  Validation Issues: ${issues.length}`);
          issues.forEach(issue => {
            console.log(`    [${issue.severity}] ${issue.message}`);
          });
        } else {
          console.log('  Validation: ✓ No issues');
        }
      });
    }

  } catch (error) {
    console.error(`Error parsing file: ${error.message}`);
    process.exit(1);
  }
}
