#!/usr/bin/env node

/**
 * Unit Tests for MetadataCapabilityChecker wiring in AutomationInventoryOrchestrator
 *
 * Verifies that:
 * - MetadataCapabilityChecker is imported and instantiated
 * - preOperationValidation is called during initialize()
 * - Capability results affect harvest behavior
 * - The orchestrator surfaces capability/fallback decisions
 *
 * NOTE: These are structural/integration tests — they verify the wiring exists,
 * not that it works against a live org.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const ORCHESTRATOR_PATH = path.resolve(__dirname, '..', 'scripts', 'lib', 'automation-inventory-orchestrator.js');

async function runTest(name, testFn) {
  process.stdout.write(`  ${name}... `);
  try {
    await testFn();
    console.log('OK');
    return { passed: true, name };
  } catch (e) {
    console.log('FAIL');
    console.log(`    Error: ${e.message}`);
    return { passed: false, name, error: e.message };
  }
}

async function main() {
  console.log('');
  console.log('=== Orchestrator MetadataCapabilityChecker Wiring Tests ===');
  console.log('');
  const results = [];

  // Read the orchestrator source
  const source = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');

  // --- Section 1: Import verification ---
  console.log('[1] MetadataCapabilityChecker import');

  results.push(await runTest('imports MetadataCapabilityChecker', () => {
    assert.ok(
      source.includes("require('./metadata-capability-checker')"),
      'Should import MetadataCapabilityChecker'
    );
  }));

  results.push(await runTest('instantiates capabilityChecker in constructor', () => {
    assert.ok(
      source.includes('new MetadataCapabilityChecker()'),
      'Should create a MetadataCapabilityChecker instance'
    );
  }));

  results.push(await runTest('stores orgCapabilities property', () => {
    assert.ok(
      source.includes('this.orgCapabilities'),
      'Should have orgCapabilities property'
    );
  }));

  // --- Section 2: initialize() wiring ---
  console.log('');
  console.log('[2] preOperationValidation call in initialize()');

  results.push(await runTest('calls preOperationValidation in initialize()', () => {
    assert.ok(
      source.includes('this.capabilityChecker.preOperationValidation'),
      'Should call preOperationValidation'
    );
  }));

  results.push(await runTest('validates FlowDefinitionView in preOperationValidation', () => {
    assert.ok(
      source.includes("'FlowDefinitionView'") && source.includes('preOperationValidation'),
      'Should include FlowDefinitionView in validation list'
    );
  }));

  results.push(await runTest('validates WorkflowRule in preOperationValidation', () => {
    assert.ok(
      source.includes("'WorkflowRule'") && source.includes('preOperationValidation'),
      'Should include WorkflowRule in validation list'
    );
  }));

  results.push(await runTest('saves capability report to output directory', () => {
    assert.ok(
      source.includes('metadata-capabilities.json'),
      'Should write capabilities to metadata-capabilities.json'
    );
  }));

  // --- Section 3: Harvest phase uses capability results ---
  console.log('');
  console.log('[3] harvestMetadata uses capability results');

  results.push(await runTest('checks FlowDefinitionView availability before flow harvest', () => {
    assert.ok(
      source.includes("orgCapabilities?.unavailable?.includes('FlowDefinitionView')"),
      'Should check FDV availability in harvest phase'
    );
  }));

  results.push(await runTest('warns when ProcessBuilder harvest hits unavailable FDV', () => {
    assert.ok(
      source.includes('FlowDefinitionView unavailable') && source.includes('ProcessBuilder'),
      'Should warn about FDV unavailability affecting ProcessBuilder'
    );
  }));

  results.push(await runTest('distinguishes real zero-count from FDV-unavailable zero-count', () => {
    assert.ok(
      source.includes('not a confirmed zero-count'),
      'Should distinguish FDV-unavailable from real zero'
    );
  }));

  // --- Section 4: Conflict detector fixes ---
  console.log('');
  console.log('[4] conflict-detector.js query fixes');

  const conflictSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'scripts', 'lib', 'conflict-detector.js'), 'utf8'
  );

  results.push(await runTest('conflict-detector uses DeveloperName, not ApiName on FDV', () => {
    // Check that any FlowDefinitionView query uses DeveloperName
    const fdvQueries = conflictSource.match(/FROM FlowDefinitionView[^"]+/g) || [];
    for (const q of fdvQueries) {
      assert.ok(!q.includes('ApiName'), `Query should not use ApiName: ${q.substring(0, 80)}`);
    }
  }));

  results.push(await runTest('conflict-detector has fallback to Flow object', () => {
    assert.ok(
      conflictSource.includes('FlowDefinitionView unavailable') && conflictSource.includes('Flow object'),
      'Should have fallback from FDV to Flow object'
    );
  }));

  results.push(await runTest('conflict-detector isolates query failures', () => {
    // Each query should be in its own try/catch, not one big one
    const tryCatchCount = (conflictSource.match(/try\s*\{/g) || []).length;
    // Should have at least 4 try blocks (describe + 3 metadata queries)
    assert.ok(tryCatchCount >= 4, `Should have >= 4 try blocks, found ${tryCatchCount}`);
  }));

  // --- Section 5: Process builder extractor fixes ---
  console.log('');
  console.log('[5] process-builder-extractor.js query fixes');

  const pbSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'scripts', 'lib', 'process-builder-extractor.js'), 'utf8'
  );

  results.push(await runTest('process-builder-extractor has fallback to Flow object', () => {
    assert.ok(
      pbSource.includes('Flow object fallback') || pbSource.includes('trying Flow object'),
      'Should have fallback from FDV to Flow'
    );
  }));

  results.push(await runTest('process-builder-extractor distinguishes query failure from zero-count', () => {
    assert.ok(
      pbSource.includes('confirmed zero-count') || pbSource.includes('query failure'),
      'Should distinguish query failure from real zero'
    );
  }));

  // --- Section 6: Orchestrator receipt integration ---
  console.log('');
  console.log('[6] Orchestrator harvest receipt integration');

  results.push(await runTest('imports safeExecSfCommand from safe-sf-result-parser', () => {
    assert.ok(
      source.includes("require('./safe-sf-result-parser')"),
      'Should import safe-sf-result-parser'
    );
  }));

  results.push(await runTest('imports generateReceipt from execution-receipt', () => {
    assert.ok(
      source.includes("require('./execution-receipt')"),
      'Should import execution-receipt'
    );
  }));

  results.push(await runTest('tracks harvestBranches array', () => {
    assert.ok(
      source.includes('this.harvestBranches'),
      'Should have harvestBranches tracking array'
    );
  }));

  results.push(await runTest('harvestApexTriggers pushes to harvestBranches', () => {
    assert.ok(
      source.includes("this.harvestBranches.push") && source.includes("name: 'ApexTrigger'"),
      'harvestApexTriggers should push branch result'
    );
  }));

  results.push(await runTest('harvestApexClasses pushes to harvestBranches', () => {
    assert.ok(
      source.includes("name: 'ApexClass'"),
      'harvestApexClasses should push branch result'
    );
  }));

  results.push(await runTest('harvestFlows pushes to harvestBranches', () => {
    assert.ok(
      source.includes("name: 'Flow'") && source.includes("this.harvestBranches.push"),
      'harvestFlows should push branch result'
    );
  }));

  results.push(await runTest('ProcessBuilder harvest pushes to harvestBranches', () => {
    assert.ok(
      source.includes("name: 'ProcessBuilder'"),
      'ProcessBuilder harvest should push branch result'
    );
  }));

  results.push(await runTest('WorkflowRule harvest pushes to harvestBranches', () => {
    assert.ok(
      source.includes("name: 'WorkflowRule'"),
      'WorkflowRule harvest should push branch result'
    );
  }));

  results.push(await runTest('_generateHarvestReceipt method exists', () => {
    assert.ok(
      source.includes('_generateHarvestReceipt'),
      'Should have harvest receipt generation method'
    );
  }));

  results.push(await runTest('saves harvest-execution-receipt.json', () => {
    assert.ok(
      source.includes('harvest-execution-receipt.json'),
      'Should save receipt to output directory'
    );
  }));

  results.push(await runTest('saves harvest-receipt-block.txt', () => {
    assert.ok(
      source.includes('harvest-receipt-block.txt'),
      'Should save receipt block for agent embedding'
    );
  }));

  results.push(await runTest('execute() returns harvestReceipt and receiptBlock', () => {
    assert.ok(
      source.includes('harvestReceipt: this.harvestReceipt') && source.includes('receiptBlock:'),
      'execute() should return receipt in result'
    );
  }));

  results.push(await runTest('harvestApexTriggers uses safeExecSfCommand not this.execSfCommand', () => {
    // Find the harvestApexTriggers method and verify it calls safeExecSfCommand
    const triggerMethodMatch = source.match(/async harvestApexTriggers[\s\S]*?(?=async harvest|$)/);
    assert.ok(triggerMethodMatch, 'Should find harvestApexTriggers method');
    const triggerMethod = triggerMethodMatch[0];
    assert.ok(
      triggerMethod.includes('safeExecSfCommand(') && !triggerMethod.includes('this.execSfCommand('),
      'harvestApexTriggers should use safeExecSfCommand, not this.execSfCommand'
    );
  }));

  results.push(await runTest('harvestApexClasses uses safeExecSfCommand not this.execSfCommand', () => {
    const classMethodMatch = source.match(/async harvestApexClasses[\s\S]*?(?=async harvest|$)/);
    assert.ok(classMethodMatch, 'Should find harvestApexClasses method');
    const classMethod = classMethodMatch[0];
    assert.ok(
      classMethod.includes('safeExecSfCommand(') && !classMethod.includes('this.execSfCommand('),
      'harvestApexClasses should use safeExecSfCommand, not this.execSfCommand'
    );
  }));

  results.push(await runTest('execSfCommand is marked deprecated', () => {
    assert.ok(
      source.includes('@deprecated'),
      'Old execSfCommand should be marked deprecated'
    );
  }));

  // --- Section 7: Receipt structure verification ---
  console.log('');
  console.log('[7] Receipt structure from _generateHarvestReceipt');

  results.push(await runTest('_generateHarvestReceipt calls generateReceipt', () => {
    assert.ok(
      source.includes('generateReceipt(receiptInput') || source.includes('generateReceipt({'),
      'Should call generateReceipt to create receipt'
    );
  }));

  results.push(await runTest('receipt input includes automation-inventory-orchestrator helper name', () => {
    assert.ok(
      source.includes('automation-inventory-orchestrator@harvest'),
      'Receipt should identify the orchestrator as helper'
    );
  }));

  results.push(await runTest('receipt tracks complete/partial/failed status', () => {
    assert.ok(
      source.includes("status = 'complete'") && source.includes("status = 'partial'") && source.includes("status = 'failed'"),
      'Should set receipt status based on branch results'
    );
  }));

  // --- Summary ---
  console.log('');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`Results: ${passed} passed, ${failed} failed out of ${results.length} tests`);

  if (failed > 0) {
    console.log('');
    console.log('Failed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  x ${r.name}: ${r.error}`);
    });
    process.exit(1);
  }

  process.exit(0);
}

main();
