'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  MultiPhaseCheckpoint,
  getCheckpointPath
} = require('../scripts/lib/multi-phase-checkpoint');

async function runTest(name, testFn) {
  process.stdout.write(`  ${name}... `);
  try {
    await testFn();
    console.log('OK');
    return { passed: true, name };
  } catch (error) {
    console.log('FAIL');
    console.log(`    Error: ${error.message}`);
    return { passed: false, name, error: error.message };
  }
}

async function runAllTests() {
  console.log('\n[Tests] multi-phase-checkpoint.js\n');

  const results = [];

  results.push(await runTest('Creates checkpoints and advances phases in order', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-test-'));
    try {
      const manager = new MultiPhaseCheckpoint({ baseDir: tempDir });
      const checkpoint = manager.create('sandbox', 'merge-001', ['discover', 'validate', 'execute'], { ticket: 'OPS-1' });

      assert.strictEqual(checkpoint.status, 'pending');
      assert.strictEqual(manager.getNext('sandbox', 'merge-001').name, 'discover');
      assert(fs.existsSync(getCheckpointPath(tempDir, 'sandbox', 'merge-001')), 'Checkpoint file should be persisted');

      const progressed = manager.complete('sandbox', 'merge-001', 'discover', 'undo-discover');
      assert.strictEqual(progressed.status, 'in_progress', 'Checkpoint should move into progress after the first completion');
      assert.strictEqual(progressed.rollback.length, 1, 'Rollback metadata should be captured');

      const resumed = manager.resume('sandbox', 'merge-001');
      assert.strictEqual(resumed.nextPhase.name, 'validate', 'Resume should return the next ready phase');

      manager.complete('sandbox', 'merge-001', 'validate');
      const finished = manager.complete('sandbox', 'merge-001', 'execute');
      assert.strictEqual(finished.status, 'completed', 'Checkpoint should complete after the final phase');
      assert.strictEqual(manager.resume('sandbox', 'merge-001').nextPhase, null, 'Completed checkpoints should have no next phase');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Marks checkpoints as rolled back with a reason', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-test-'));
    try {
      const manager = new MultiPhaseCheckpoint({ baseDir: tempDir });
      manager.create('prod', 'deploy-001', ['prepare', 'deploy'], {});

      const rolledBack = manager.rollback('prod', 'deploy-001', 'manual_abort');
      assert.strictEqual(rolledBack.status, 'rolled_back');
      assert.strictEqual(rolledBack.rollbackReason, 'manual_abort');
      assert(rolledBack.rolledBackAt, 'Rollback timestamp should be recorded');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }));

  const passed = results.filter(result => result.passed).length;
  const failed = results.filter(result => !result.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
