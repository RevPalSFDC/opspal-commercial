#!/usr/bin/env node

/**
 * Integration Test Suite - v3.36.0 Reflection Fixes
 *
 * Tests all 4 integrations:
 * - FP-002: Field Validator Integration
 * - FP-006: Dashboard Validator Enhancement
 * - FP-008: Evidence Protocol (template ready)
 * - FP-010: Validation-Aware Updates
 */

const path = require('path');

console.log('================================================');
console.log('Integration Test Suite - v3.36.0');
console.log('================================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
}

// Test 1: Schema Field Validator Wrapper
console.log('Test 1: Field Validator Wrapper (FP-002)');
console.log('------------------------------------------');

test('Module loads', () => {
  const wrapper = require('../scripts/lib/schema-field-validator-wrapper');
  if (typeof wrapper.validateQueryFields !== 'function') {
    throw new Error('validateQueryFields function not found');
  }
});

test('Exports correct API', () => {
  const wrapper = require('../scripts/lib/schema-field-validator-wrapper');
  if (!wrapper.validateQueryFields || !wrapper.validateQueryFieldsOrThrow) {
    throw new Error('Missing expected exports');
  }
});

console.log('');

// Test 2: Safe Query Builder Integration
console.log('Test 2: Safe Query Builder Integration (FP-002)');
console.log('------------------------------------------------');

test('SafeQueryBuilder loads validator', () => {
  const SafeQueryBuilder = require('../scripts/lib/safe-query-builder').SafeQueryBuilder;
  const builder = new SafeQueryBuilder('Account');
  if (!builder.fieldValidationEnabled) {
    throw new Error('Field validation not enabled');
  }
});

test('SafeQueryBuilder has validation properties', () => {
  const SafeQueryBuilder = require('../scripts/lib/safe-query-builder').SafeQueryBuilder;
  const builder = new SafeQueryBuilder('Account');
  if (builder.fieldValidationEnabled !== true) {
    throw new Error('Missing fieldValidationEnabled property');
  }
});

console.log('');

// Test 3: Bulk Update with Validation Awareness
console.log('Test 3: Validation-Aware Updates (FP-010)');
console.log('------------------------------------------');

test('Module loads', () => {
  const module = require('../scripts/lib/bulk-update-with-validation-awareness');
  if (typeof module.enhanceWithValidationAwareness !== 'function') {
    throw new Error('enhanceWithValidationAwareness function not found');
  }
});

test('Exports complete API', () => {
  const module = require('../scripts/lib/bulk-update-with-validation-awareness');
  if (!module.enhanceWithValidationAwareness || !module.enhanceSingleUpdate || !module.extractRequiredFields) {
    throw new Error('Missing expected exports');
  }
});

test('extractRequiredFields parses formulas', () => {
  const module = require('../scripts/lib/bulk-update-with-validation-awareness');
  const rules = [
    { ErrorConditionFormula: 'Who_Set_Meeting__c IS NULL' },
    { ErrorConditionFormula: 'ISBLANK(Contract_Type__c)' }
  ];
  const required = module.extractRequiredFields(rules);
  if (!required.has('Who_Set_Meeting__c') || !required.has('Contract_Type__c')) {
    throw new Error('Failed to extract required fields');
  }
});

console.log('');

// Test 4: Metadata Validator Dashboard Enhancement
console.log('Test 4: Dashboard Validator Enhancement (FP-006)');
console.log('--------------------------------------------------');

test('MetadataValidator has validateDashboard method', () => {
  const MetadataValidator = require('../scripts/lib/metadata-validator');
  const validator = new MetadataValidator();
  if (typeof validator.validateDashboard !== 'function') {
    throw new Error('validateDashboard method not found');
  }
});

test('validateDashboard catches missing chartAxisRange', () => {
  const MetadataValidator = require('../scripts/lib/metadata-validator');
  const validator = new MetadataValidator();
  const dashboard = {
    dashboardGridComponents: [
      { chartType: 'Line' /* missing chartAxisRange */ }
    ]
  };
  const result = validator.validateDashboard(dashboard);
  if (result.valid !== false || result.errors.length === 0) {
    throw new Error('Should detect missing chartAxisRange');
  }
});

test('validateDashboard warns on report ID format', () => {
  const MetadataValidator = require('../scripts/lib/metadata-validator');
  const validator = new MetadataValidator();
  const dashboard = {
    dashboardGridComponents: [
      {
        chartType: 'Line',
        chartAxisRange: {},
        reportName: '00O1234567890ABC' // ID format
      }
    ]
  };
  const result = validator.validateDashboard(dashboard);
  if (result.warnings.length === 0) {
    throw new Error('Should warn about report ID format');
  }
});

console.log('');

// Test 5: Evidence Protocol Documentation
console.log('Test 5: Evidence Protocol Documentation (FP-008)');
console.log('--------------------------------------------------');

test('Evidence protocol template exists', () => {
  const fs = require('fs');
  const templatePath = path.join(__dirname, '../docs/EVIDENCE_BASED_PROTOCOL_TEMPLATE.md');
  if (!fs.existsSync(templatePath)) {
    throw new Error('Evidence protocol template not found');
  }
});

test('Template has deployment and troubleshooting sections', () => {
  const fs = require('fs');
  const templatePath = path.join(__dirname, '../docs/EVIDENCE_BASED_PROTOCOL_TEMPLATE.md');
  const content = fs.readFileSync(templatePath, 'utf-8');
  if (!content.includes('Deployment Agents') || !content.includes('Troubleshooting Agents')) {
    throw new Error('Template missing required sections');
  }
});

console.log('');

// Summary
console.log('================================================');
console.log('Test Results Summary');
console.log('================================================');
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log('');

if (failed === 0) {
  console.log('✅ ALL INTEGRATION TESTS PASSED');
  console.log('   v3.36.0 ready for deployment');
  process.exit(0);
} else {
  console.log('❌ SOME TESTS FAILED');
  console.log('   Review failures before deploying');
  process.exit(1);
}
