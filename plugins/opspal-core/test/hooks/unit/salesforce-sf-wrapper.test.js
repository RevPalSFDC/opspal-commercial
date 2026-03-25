#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const WRAPPER_PATH = path.join(PROJECT_ROOT, 'plugins/opspal-salesforce/scripts/lib/sf-wrapper.sh');

function createTempCliBin(binaries) {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-wrapper-bin-'));

  Object.entries(binaries).forEach(([name, body]) => {
    const filePath = path.join(binDir, name);
    fs.writeFileSync(filePath, body, { mode: 0o755 });
  });

  return binDir;
}

function pathWithoutSalesforceCli(extraDirs = []) {
  const filtered = (process.env.PATH || '')
    .split(path.delimiter)
    .filter((dir) => {
      try {
        return !fs.existsSync(path.join(dir, 'sf')) && !fs.existsSync(path.join(dir, 'sfdx'));
      } catch {
        return true;
      }
    });

  return [...extraDirs, ...filtered].join(path.delimiter);
}

function runWrapper(command, env = {}) {
  return spawnSync('bash', ['-lc', `source "${WRAPPER_PATH}"; ${command}`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SF_DISABLE_ERROR_LOG: '1',
      SF_AUTH_SYNC: '0',
      SF_DISABLE_AUTO_DISCOVERY: '1',
      ...env
    }
  });
}

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
  console.log('\n[Tests] Salesforce sf-wrapper\n');

  const results = [];

  results.push(await runTest('Uses sf directly when sf is available', async () => {
    const traceFile = path.join(os.tmpdir(), `sf-wrapper-trace-sf-${Date.now()}.log`);
    const binDir = createTempCliBin({
      sf: '#!/usr/bin/env bash\nprintf \'%s\\n\' \"$0 $*\" > \"$TRACE_FILE\"\nprintf \'{"status":0,"cli":"sf"}\\n\'\n'
    });

    try {
      const result = runWrapper(
        'sf_exec data query --query "SELECT Id FROM Account LIMIT 1" --json',
        {
          PATH: pathWithoutSalesforceCli([binDir]),
          TRACE_FILE: traceFile
        }
      );

      assert.strictEqual(result.status, 0, 'sf_exec should succeed when sf is available');
      assert(fs.readFileSync(traceFile, 'utf8').includes('sf data query'), 'Wrapper should execute sf syntax when sf exists');
    } finally {
      fs.rmSync(binDir, { recursive: true, force: true });
      fs.rmSync(traceFile, { force: true });
    }
  }));

  results.push(await runTest('Falls back to sfdx for supported discovery commands', async () => {
    const traceFile = path.join(os.tmpdir(), `sf-wrapper-trace-sfdx-${Date.now()}.log`);
    const binDir = createTempCliBin({
      sfdx: '#!/usr/bin/env bash\nprintf \'%s\\n\' \"$0 $*\" > \"$TRACE_FILE\"\nprintf \'{"status":0,"cli":"sfdx"}\\n\'\n'
    });

    try {
      const result = runWrapper(
        'sf_exec data query --query "SELECT Id FROM Account LIMIT 1" --json',
        {
          PATH: pathWithoutSalesforceCli([binDir]),
          TRACE_FILE: traceFile
        }
      );

      assert.strictEqual(result.status, 0, 'sf_exec should succeed with sfdx fallback');
      assert(
        fs.readFileSync(traceFile, 'utf8').includes('sfdx force:data:soql:query'),
        'Wrapper should translate sf query syntax to legacy sfdx syntax'
      );
    } finally {
      fs.rmSync(binDir, { recursive: true, force: true });
      fs.rmSync(traceFile, { force: true });
    }
  }));

  results.push(await runTest('Fails loudly when only sfdx is available for unsupported sf commands', async () => {
    const binDir = createTempCliBin({
      sfdx: '#!/usr/bin/env bash\nexit 0\n'
    });

    try {
      const result = runWrapper(
        'sf_exec project deploy start --source-dir force-app',
        {
          PATH: pathWithoutSalesforceCli([binDir])
        }
      );

      assert.strictEqual(result.status, 8, 'Unsupported fallback should return CLI error');
      assert(result.stderr.includes('SF_CLI_FALLBACK_UNSUPPORTED'), 'Should explain that the fallback is unsupported');
    } finally {
      fs.rmSync(binDir, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Fails loudly when neither sf nor sfdx is available', async () => {
    const result = runWrapper(
      'sf_exec data query --query "SELECT Id FROM Account LIMIT 1" --json',
      {
        PATH: pathWithoutSalesforceCli()
      }
    );

    assert.strictEqual(result.status, 2, 'Missing CLI should return missing dependency');
    assert(result.stderr.includes('SF_CLI_NOT_FOUND'), 'Should distinguish command-not-found from a validation failure');
  }));

  results.push(await runTest('Treats empty query output as a query failure', async () => {
    const binDir = createTempCliBin({
      sf: '#!/usr/bin/env bash\nexit 0\n'
    });

    try {
      const result = runWrapper(
        'sf_query_safe "SELECT Id FROM Account LIMIT 1" --json',
        {
          PATH: pathWithoutSalesforceCli([binDir])
        }
      );

      assert.strictEqual(result.status, 8, 'Empty query output should fail loudly');
      assert(result.stderr.includes('SF_QUERY_FAILED'), 'Should surface the empty-output query failure');
    } finally {
      fs.rmSync(binDir, { recursive: true, force: true });
    }
  }));

  const passed = results.filter((result) => result.passed).length;
  const failed = results.filter((result) => !result.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
