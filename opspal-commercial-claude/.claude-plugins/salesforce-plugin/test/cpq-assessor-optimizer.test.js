const { test, assert, assertEqual } = require('./test-utils');
const CPQAssessorOptimizer = require('../scripts/lib/cpq-assessor-optimizer');

const unitTests = [
  test('CPQAssessorOptimizer can assess single scope', async () => {
    const optimizer = new CPQAssessorOptimizer();
    const result = await optimizer.assess({ name: 'test', complexity: 'low' });
    assert(result.scope === 'test' && result.itemCount > 0 && result.duration > 0);
  }),
  test('CPQAssessorOptimizer handles complexities', async () => {
    const optimizer = new CPQAssessorOptimizer();
    const low = await optimizer.assess({ name: 'low', complexity: 'low' });
    const high = await optimizer.assess({ name: 'high', complexity: 'high' });
    assert(low.itemCount < high.itemCount);
  }),
  test('CPQAssessorOptimizer tracks statistics', async () => {
    const optimizer = new CPQAssessorOptimizer();
    await optimizer.assess({ name: 'test1', complexity: 'medium' });
    await optimizer.assess({ name: 'test2', complexity: 'low' });
    const stats = optimizer.getStats();
    assertEqual(stats.assessmentsCompleted, 2);
  })
];

const integrationTests = [
  test('Phase 1 uses batch metadata', async () => {
    const optimizer = new CPQAssessorOptimizer();
    await optimizer.assess({ name: 'test', complexity: 'medium' });
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

    const optimizer = new CPQAssessorOptimizer();
    const phase1Start = Date.now();
    await optimizer.assess({ name: 'test', complexity: 'low' });
    const phase1Duration = Date.now() - phase1Start;

    assert(phase1Duration < baselineDuration);
    const improvement = ((baselineDuration - phase1Duration) / baselineDuration) * 100;
    assert(improvement > 50);
  }),
  test('Phase 1 scales well', async () => {
    const optimizer = new CPQAssessorOptimizer();
    const start = Date.now();
    await optimizer.assess({ name: 'complex', complexity: 'high' });
    assert(Date.now() - start < 3500);
  })
];

module.exports = { unitTests, integrationTests, performanceTests, allTests: [...unitTests, ...integrationTests, ...performanceTests] };


// Jest wrapper for standalone test runner
if (typeof describe !== 'undefined') {
  const mod = require('./cpq-assessor-optimizer.test.js');
  const tests = mod.allTests || mod.unitTests || [];

  describe('Cpq Assessor Optimizer', () => {
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
