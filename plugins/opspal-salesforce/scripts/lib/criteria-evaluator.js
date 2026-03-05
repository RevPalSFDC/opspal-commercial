#!/usr/bin/env node

/**
 * Criteria Evaluator
 *
 * Evaluate assignment rule criteria against sample records, simulate which rule
 * would fire, and validate field/operator compatibility.
 *
 * @module criteria-evaluator
 * @version 1.0.0
 */

const { execSync } = require('child_process');

/**
 * Operator compatibility matrix (field type → supported operators)
 * @const
 */
const OPERATOR_COMPATIBILITY = {
  'string': ['equals', 'notEqual', 'lessThan', 'greaterThan', 'lessOrEqual', 'greaterOrEqual', 'contains', 'notContain', 'startsWith', 'includes'],
  'picklist': ['equals', 'notEqual'],
  'multipicklist': ['equals', 'notEqual', 'includes'],
  'number': ['equals', 'notEqual', 'lessThan', 'greaterThan', 'lessOrEqual', 'greaterOrEqual'],
  'currency': ['equals', 'notEqual', 'lessThan', 'greaterThan', 'lessOrEqual', 'greaterOrEqual'],
  'percent': ['equals', 'notEqual', 'lessThan', 'greaterThan', 'lessOrEqual', 'greaterOrEqual'],
  'date': ['equals', 'notEqual', 'lessThan', 'greaterThan', 'lessOrEqual', 'greaterOrEqual'],
  'datetime': ['equals', 'notEqual', 'lessThan', 'greaterThan', 'lessOrEqual', 'greaterOrEqual'],
  'boolean': ['equals', 'notEqual'],
  'textarea': ['equals', 'notEqual', 'contains', 'notContain'],
  'email': ['equals', 'notEqual', 'contains', 'notContain'],
  'phone': ['equals', 'notEqual', 'contains', 'notContain'],
  'url': ['equals', 'notEqual', 'contains', 'notContain'],
  'reference': ['equals', 'notEqual']
};

/**
 * Evaluate single criteria against record data
 *
 * @param {Object} criteria - Criteria object with field, operator, value
 * @param {Object} recordData - Record data object
 * @returns {boolean} True if criteria matches
 *
 * @example
 * const matches = evaluateCriteria(
 *   { field: 'Industry', operator: 'equals', value: 'Healthcare' },
 *   { Industry: 'Healthcare', State: 'CA' }
 * );
 * console.log(matches); // true
 */
function evaluateCriteria(criteria, recordData) {
  if (!criteria || !recordData) {
    return false;
  }

  const fieldValue = recordData[criteria.field];
  const targetValue = criteria.value;
  const operator = criteria.operation || criteria.operator || 'equals';

  // Handle null/undefined values
  if (fieldValue === null || fieldValue === undefined) {
    // Null handling
    switch (operator) {
      case 'equals':
        return targetValue === null || targetValue === undefined || targetValue === '';
      case 'notEqual':
        return targetValue !== null && targetValue !== undefined && targetValue !== '';
      default:
        return false; // Can't compare null with <, >, etc.
    }
  }

  // Evaluate based on operator
  switch (operator) {
    case 'equals':
      return String(fieldValue).toLowerCase() === String(targetValue).toLowerCase();

    case 'notEqual':
      return String(fieldValue).toLowerCase() !== String(targetValue).toLowerCase();

    case 'lessThan':
      return parseComparable(fieldValue) < parseComparable(targetValue);

    case 'greaterThan':
      return parseComparable(fieldValue) > parseComparable(targetValue);

    case 'lessOrEqual':
      return parseComparable(fieldValue) <= parseComparable(targetValue);

    case 'greaterOrEqual':
      return parseComparable(fieldValue) >= parseComparable(targetValue);

    case 'contains':
      return String(fieldValue).toLowerCase().includes(String(targetValue).toLowerCase());

    case 'notContain':
      return !String(fieldValue).toLowerCase().includes(String(targetValue).toLowerCase());

    case 'startsWith':
      return String(fieldValue).toLowerCase().startsWith(String(targetValue).toLowerCase());

    case 'includes':
      // For multi-select picklist
      const fieldValues = String(fieldValue).split(';').map(v => v.trim().toLowerCase());
      const targetValues = String(targetValue).split(';').map(v => v.trim().toLowerCase());
      return targetValues.some(tv => fieldValues.includes(tv));

    default:
      console.warn(`Unknown operator: ${operator}`);
      return false;
  }
}

/**
 * Parse value for comparison (handles numbers, dates)
 * @private
 */
function parseComparable(value) {
  // Try parsing as number
  const num = parseFloat(value);
  if (!isNaN(num)) {
    return num;
  }

  // Try parsing as date
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return date.getTime();
  }

  // Fall back to string comparison
  return String(value);
}

/**
 * Evaluate all criteria items for a rule entry (AND logic)
 *
 * @param {Array<Object>} criteriaItems - Array of criteria objects
 * @param {Object} recordData - Record data
 * @returns {boolean} True if all criteria match
 *
 * @example
 * const matches = evaluateAllCriteria([
 *   { field: 'Industry', operator: 'equals', value: 'Healthcare' },
 *   { field: 'State', operator: 'equals', value: 'CA' }
 * ], record);
 */
function evaluateAllCriteria(criteriaItems, recordData) {
  if (!criteriaItems || criteriaItems.length === 0) {
    // No criteria means match all
    return true;
  }

  // All criteria must match (AND logic)
  return criteriaItems.every(criteria => evaluateCriteria(criteria, recordData));
}

/**
 * Find matching rule entry for given record
 *
 * @param {Array<Object>} ruleEntries - Array of rule entries (sorted by order)
 * @param {Object} recordData - Record data
 * @returns {Object|null} First matching rule entry or null
 *
 * @example
 * const matchingRule = findMatchingRule(ruleEntries, leadRecord);
 * if (matchingRule) {
 *   console.log(`Assign to: ${matchingRule.assignedTo}`);
 * }
 */
function findMatchingRule(ruleEntries, recordData) {
  if (!Array.isArray(ruleEntries) || !recordData) {
    return null;
  }

  // Sort by order (if not already sorted)
  const sortedEntries = [...ruleEntries].sort((a, b) => a.order - b.order);

  // Find first matching entry
  for (const entry of sortedEntries) {
    // Handle formula-based criteria (would need actual formula evaluation)
    if (entry.formula) {
      // Formula evaluation not implemented - would need Salesforce API
      console.warn('Formula criteria not supported in simulation');
      continue;
    }

    // Evaluate regular criteria
    if (evaluateAllCriteria(entry.criteriaItems, recordData)) {
      return entry;
    }
  }

  return null;
}

/**
 * Simulate assignment for multiple sample records
 *
 * @param {Object} assignmentRule - Parsed assignment rule object
 * @param {Array<Object>} sampleRecords - Array of sample record data
 * @returns {Object} Simulation results
 *
 * @example
 * const results = simulateAssignment(rule, [
 *   { Industry: 'Healthcare', State: 'CA' },
 *   { Industry: 'Technology', State: 'NY' }
 * ]);
 * console.log(results.assignmentBreakdown);
 */
function simulateAssignment(assignmentRule, sampleRecords) {
  if (!assignmentRule || !assignmentRule.entries) {
    return {
      error: 'Invalid assignment rule'
    };
  }

  if (!Array.isArray(sampleRecords) || sampleRecords.length === 0) {
    return {
      error: 'No sample records provided'
    };
  }

  const results = {
    ruleName: assignmentRule.name,
    totalRecords: sampleRecords.length,
    assigned: 0,
    unassigned: 0,
    assignmentBreakdown: {},
    recordResults: []
  };

  sampleRecords.forEach((record, index) => {
    const matchingEntry = findMatchingRule(assignmentRule.entries, record);

    if (matchingEntry) {
      results.assigned++;

      const assignee = matchingEntry.assignedTo;
      if (!(assignee in results.assignmentBreakdown)) {
        results.assignmentBreakdown[assignee] = 0;
      }
      results.assignmentBreakdown[assignee]++;

      results.recordResults.push({
        recordIndex: index,
        matched: true,
        matchedEntryOrder: matchingEntry.order,
        assignedTo: assignee,
        record
      });

    } else {
      results.unassigned++;

      results.recordResults.push({
        recordIndex: index,
        matched: false,
        record
      });
    }
  });

  return results;
}

/**
 * Validate criteria compatibility with object fields
 *
 * @param {Array<Object>} criteriaItems - Array of criteria objects
 * @param {Object} objectDescribe - Salesforce object describe result
 * @returns {Array<Object>} Array of validation errors
 *
 * @example
 * const errors = await validateCriteriaCompatibility(
 *   rule.criteriaItems,
 *   objectDescribe
 * );
 */
function validateCriteriaCompatibility(criteriaItems, objectDescribe) {
  if (!Array.isArray(criteriaItems)) {
    return [];
  }

  if (!objectDescribe || !objectDescribe.fields) {
    return [{
      severity: 'warning',
      message: 'Cannot validate: object describe not available'
    }];
  }

  const errors = [];
  const fieldMap = {};

  // Build field map for quick lookup
  objectDescribe.fields.forEach(field => {
    fieldMap[field.name] = field;
  });

  criteriaItems.forEach((criteria, index) => {
    const fieldName = criteria.field;
    const operator = criteria.operation || criteria.operator || 'equals';

    // Check if field exists
    if (!(fieldName in fieldMap)) {
      errors.push({
        severity: 'critical',
        field: fieldName,
        criteriaIndex: index,
        message: `Field '${fieldName}' does not exist on object`,
        resolution: 'Remove criteria or create the field'
      });
      return;
    }

    const fieldDef = fieldMap[fieldName];
    const fieldType = fieldDef.type.toLowerCase();

    // Check operator compatibility
    const supportedOperators = OPERATOR_COMPATIBILITY[fieldType] || [];

    if (!supportedOperators.includes(operator)) {
      errors.push({
        severity: 'critical',
        field: fieldName,
        operator,
        fieldType,
        criteriaIndex: index,
        message: `Operator '${operator}' not compatible with field type '${fieldType}'`,
        resolution: `Use one of: ${supportedOperators.join(', ')}`,
        supportedOperators
      });
    }

    // Picklist value validation
    if (fieldType === 'picklist' && fieldDef.picklistValues && criteria.value) {
      const validValues = fieldDef.picklistValues.map(pv => pv.value);
      if (!validValues.includes(criteria.value)) {
        errors.push({
          severity: 'warning',
          field: fieldName,
          value: criteria.value,
          criteriaIndex: index,
          message: `Value '${criteria.value}' is not a valid picklist option for field '${fieldName}'`,
          resolution: `Use one of: ${validValues.join(', ')}`,
          validValues
        });
      }
    }

    // Multi-select picklist
    if (fieldType === 'multipicklist' && operator === 'equals') {
      errors.push({
        severity: 'warning',
        field: fieldName,
        operator,
        criteriaIndex: index,
        message: `For multi-select picklist '${fieldName}', use 'includes' operator instead of 'equals'`,
        resolution: 'Change operator to: includes'
      });
    }
  });

  return errors;
}

/**
 * Fetch object describe from Salesforce
 *
 * @param {string} objectApiName - Object API name
 * @param {string} [orgAlias] - Salesforce org alias
 * @returns {Promise<Object>} Object describe result
 */
async function fetchObjectDescribe(objectApiName, orgAlias = null) {
  const orgFlag = orgAlias ? `--target-org ${orgAlias}` : '';

  const command = `sf sobject describe --sobject ${objectApiName} ${orgFlag} --json`;

  try {
    const output = execSync(command, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const result = JSON.parse(output);

    if (result.status !== 0) {
      throw new Error(result.message || 'Describe failed');
    }

    return result.result;

  } catch (error) {
    throw new Error(`Failed to fetch object describe: ${error.message}`);
  }
}

/**
 * Comprehensive validation of rule entry criteria against object
 *
 * @param {Object} ruleEntry - Rule entry with criteria
 * @param {string} objectApiName - Object API name
 * @param {string} [orgAlias] - Salesforce org alias
 * @returns {Promise<Object>} Validation result
 *
 * @example
 * const validation = await validateRuleEntry(entry, 'Lead', 'myorg');
 * if (validation.valid) {
 *   console.log('Criteria is valid');
 * }
 */
async function validateRuleEntry(ruleEntry, objectApiName, orgAlias = null) {
  try {
    const objectDescribe = await fetchObjectDescribe(objectApiName, orgAlias);
    const errors = validateCriteriaCompatibility(ruleEntry.criteriaItems, objectDescribe);

    const criticalErrors = errors.filter(e => e.severity === 'critical');
    const warnings = errors.filter(e => e.severity === 'warning');

    return {
      valid: criticalErrors.length === 0,
      objectApiName,
      totalErrors: errors.length,
      criticalErrors: criticalErrors.length,
      warnings: warnings.length,
      errors,
      recommendation: criticalErrors.length > 0
        ? 'Fix critical errors before deployment'
        : (warnings.length > 0
          ? 'Review warnings for potential issues'
          : 'Criteria is valid')
    };

  } catch (error) {
    return {
      valid: false,
      objectApiName,
      error: error.message
    };
  }
}

// Export functions
module.exports = {
  evaluateCriteria,
  evaluateAllCriteria,
  findMatchingRule,
  simulateAssignment,
  validateCriteriaCompatibility,
  validateRuleEntry,
  fetchObjectDescribe,
  OPERATOR_COMPATIBILITY
};

// CLI support
if (require.main === module) {
  const fs = require('fs');
  const { parseRuleMetadata } = require('./assignment-rule-parser');

  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node criteria-evaluator.js <xml-file> <sample-data-json>');
    console.error('');
    console.error('Example:');
    console.error('  node criteria-evaluator.js Lead.assignmentRules sample-leads.json');
    console.error('');
    console.error('sample-leads.json format:');
    console.error('  [');
    console.error('    { "Industry": "Healthcare", "State": "CA" },');
    console.error('    { "Industry": "Technology", "State": "NY" }');
    console.error('  ]');
    process.exit(1);
  }

  const [xmlFile, sampleDataFile] = args;

  if (!fs.existsSync(xmlFile)) {
    console.error(`Error: XML file not found: ${xmlFile}`);
    process.exit(1);
  }

  if (!fs.existsSync(sampleDataFile)) {
    console.error(`Error: Sample data file not found: ${sampleDataFile}`);
    process.exit(1);
  }

  try {
    // Parse rule XML
    const xmlContent = fs.readFileSync(xmlFile, 'utf8');
    const parsed = parseRuleMetadata(xmlContent);

    // Load sample data
    const sampleData = JSON.parse(fs.readFileSync(sampleDataFile, 'utf8'));

    if (!Array.isArray(sampleData)) {
      throw new Error('Sample data must be an array of record objects');
    }

    console.log('=== Assignment Rule Simulation ===\n');

    parsed.assignmentRules.forEach(rule => {
      console.log(`Rule: ${rule.name} (${rule.active ? 'Active' : 'Inactive'})`);
      console.log(`Object: ${parsed.objectType}`);
      console.log(`Entries: ${rule.entries.length}\n`);

      const results = simulateAssignment(rule, sampleData);

      console.log(`Total Records: ${results.totalRecords}`);
      console.log(`Assigned: ${results.assigned}`);
      console.log(`Unassigned: ${results.unassigned}\n`);

      if (Object.keys(results.assignmentBreakdown).length > 0) {
        console.log('Assignment Breakdown:');
        Object.entries(results.assignmentBreakdown).forEach(([assignee, count]) => {
          console.log(`  ${assignee}: ${count} records`);
        });
        console.log('');
      }

      if (results.unassigned > 0) {
        console.log('⚠️  Warning: Some records were not assigned');
        console.log('   Consider adding a catch-all rule entry\n');
      }

      // Show first few results
      const showCount = Math.min(5, results.recordResults.length);
      console.log(`Sample Results (first ${showCount} of ${results.recordResults.length}):`);
      results.recordResults.slice(0, showCount).forEach(result => {
        if (result.matched) {
          console.log(`  Record ${result.recordIndex}: Matched entry ${result.matchedEntryOrder} → ${result.assignedTo}`);
        } else {
          console.log(`  Record ${result.recordIndex}: No match`);
        }
      });
      console.log('');
    });

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
