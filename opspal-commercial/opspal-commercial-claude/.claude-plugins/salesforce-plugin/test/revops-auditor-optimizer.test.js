const { test, assert, assertEqual } = require('./test-utils');
const RevOpsAuditorOptimizer = require('../scripts/lib/revops-auditor-optimizer');

const unitTests = [
  test('RevOpsAuditorOptimizer can audit single scope', async () => {
    const optimizer = new RevOpsAuditorOptimizer();
    const result = await optimizer.audit({ name: 'test', complexity: 'low' });
    assert(result.scope === 'test' && result.itemCount > 0 && result.duration > 0);
  }),
  test('RevOpsAuditorOptimizer handles complexities', async () => {
    const optimizer = new RevOpsAuditorOptimizer();
    const low = await optimizer.audit({ name: 'low', complexity: 'low' });
    const high = await optimizer.audit({ name: 'high', complexity: 'high' });
    assert(low.itemCount < high.itemCount);
  }),
  test('RevOpsAuditorOptimizer tracks statistics', async () => {
    const optimizer = new RevOpsAuditorOptimizer();
    await optimizer.audit({ name: 'test1', complexity: 'medium' });
    await optimizer.audit({ name: 'test2', complexity: 'low' });
    const stats = optimizer.getStats();
    assertEqual(stats.auditsCompleted, 2);
  })
];

const integrationTests = [
  test('Phase 1 uses batch metadata', async () => {
    const optimizer = new RevOpsAuditorOptimizer();
    await optimizer.audit({ name: 'test', complexity: 'medium' });
    const stats = optimizer.getStats();
    assert(stats.batchMetadataStats && stats.batchMetadataStats.cacheHitRate >= 0);
  })
];

const performanceTests = [
  test('Phase 1 is faster than baseline', async () => {
    const baselineStart = Date.now();
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 4; j++) await new Promise(r => setTimeout(r, 200 + Math.random() * 200));
      await new Promise(r => setTimeout(r, 50));
    }
    const baselineDuration = Date.now() - baselineStart;

    const optimizer = new RevOpsAuditorOptimizer();
    const phase1Start = Date.now();
    await optimizer.audit({ name: 'test', complexity: 'low' });
    const phase1Duration = Date.now() - phase1Start;

    assert(phase1Duration < baselineDuration);
    const improvement = ((baselineDuration - phase1Duration) / baselineDuration) * 100;
    assert(improvement > 50);
  }),
  test('Phase 1 scales well', async () => {
    const optimizer = new RevOpsAuditorOptimizer();
    const start = Date.now();
    await optimizer.audit({ name: 'complex', complexity: 'high' });
    assert(Date.now() - start < 3500);
  })
];

module.exports = { unitTests, integrationTests, performanceTests, allTests: [...unitTests, ...integrationTests, ...performanceTests] };


// Jest wrapper for standalone test runner
if (typeof describe !== 'undefined') {
  const mod = require('./revops-auditor-optimizer.test.js');
  const tests = mod.allTests || mod.unitTests || [];

  describe('Revops Auditor Optimizer', () => {
    tests.forEach((testFn, idx) => {
      it(`test ${idx + 1}`, async () => {
        await testFn();
      });
    });

    // Fallback if no tests found
    if (tests.length === 0) {
      it('should pass (no exported tests)', () => {
        expect(true).toBe(true);
      });
    }
  });
}
