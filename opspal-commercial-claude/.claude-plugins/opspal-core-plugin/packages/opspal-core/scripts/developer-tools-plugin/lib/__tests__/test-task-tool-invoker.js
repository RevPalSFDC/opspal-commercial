#!/usr/bin/env node

/**
 * test-task-tool-invoker.js
 *
 * Quick test of TaskToolInvoker integration
 */

const { TaskToolInvoker, createRealAgentInvoker } = require('../task-tool-invoker');
const path = require('path');
const os = require('os');

console.log('Testing TaskToolInvoker');
console.log('='.repeat(60));

async function testInvoker() {
  const invoker = new TaskToolInvoker({
    outputDir: path.join(os.tmpdir(), 'test-supervisor'),
    verbose: true
  });

  console.log('\nTest 1: Invoke plugin-documenter');
  console.log('-'.repeat(60));

  const result1 = await invoker.invoke('plugin-documenter', {
    action: 'generate',
    target: 'test-plugin',
    description: 'Generate README for test plugin'
  });

  console.log('Result:', JSON.stringify(result1, null, 2));
  console.log('Success:', result1.success ? '✓' : '✗');
  console.log('Duration:', result1.duration_ms + 'ms');

  console.log('\nTest 2: Invoke non-existent agent');
  console.log('-'.repeat(60));

  const result2 = await invoker.invoke('non-existent-agent', {
    action: 'test',
    target: 'dummy'
  });

  console.log('Result:', JSON.stringify(result2, null, 2));
  console.log('Success:', result2.success ? '✓' : '✗');
  console.log('Expected failure: ✓');

  console.log('\nTest 3: Create real agent invoker function');
  console.log('-'.repeat(60));

  const realInvoker = createRealAgentInvoker({ verbose: true });
  const result3 = await realInvoker('quality-analyzer', {
    action: 'analyze',
    target: 'sample-plugin'
  });

  console.log('Result:', JSON.stringify(result3, null, 2));
  console.log('Success:', result3.success ? '✓' : '✗');

  console.log('\nTest 4: Cleanup old outputs');
  console.log('-'.repeat(60));

  const cleaned = invoker.cleanup(0); // Clean all (age 0)
  console.log(`Cleaned up ${cleaned} files`);

  console.log('\n' + '='.repeat(60));
  console.log('All tests completed');
}

testInvoker().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
