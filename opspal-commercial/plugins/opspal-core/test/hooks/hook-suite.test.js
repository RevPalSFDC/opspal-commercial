const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../..');
const TEST_ROOT = __dirname;
const TEST_DIRS = ['unit', 'integration'].map(dir => path.join(TEST_ROOT, dir));

const DEFAULT_TIMEOUT_MS = 60000;

function listTestFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir)
    .filter(name => name.endsWith('.test.js'))
    .map(name => path.join(dir, name));
}

function formatOutput(label, text) {
  if (!text) {
    return '';
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  const lines = trimmed.split('\n');
  const maxLines = 40;
  const clipped = lines.length > maxLines
    ? [...lines.slice(0, maxLines), `... (${lines.length - maxLines} more lines)`]
    : lines;
  return `\n${label}:\n${clipped.join('\n')}`;
}

function runHookTest(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [filePath], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env
      }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (error) => {
      reject(error);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const message = [
        `Hook test failed (${path.relative(PROJECT_ROOT, filePath)}) with exit code ${code}.`,
        formatOutput('STDOUT', stdout),
        formatOutput('STDERR', stderr)
      ].filter(Boolean).join('\n');
      reject(new Error(message));
    });
  });
}

const testFiles = TEST_DIRS.flatMap(listTestFiles)
  .sort((a, b) => a.localeCompare(b));

const testCases = testFiles.map(filePath => ([
  path.relative(PROJECT_ROOT, filePath),
  filePath
]));

jest.setTimeout(DEFAULT_TIMEOUT_MS);

describe('hook test suites', () => {
  test('hook test files discovered', () => {
    expect(testFiles.length).toBeGreaterThan(0);
  });

  test.each(testCases)('%s', async (_label, filePath) => {
    await runHookTest(filePath);
  });
});
