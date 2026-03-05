const path = require('path');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const SCRIPT_PATH = path.join(__dirname, 'error-prevention-phase1.test.js');

function runScript() {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [SCRIPT_PATH], {
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
        `error-prevention-phase1.test.js failed with exit code ${code}.`,
        stdout ? `STDOUT:\n${stdout.trim()}` : '',
        stderr ? `STDERR:\n${stderr.trim()}` : ''
      ].filter(Boolean).join('\n');
      reject(new Error(message));
    });
  });
}

describe('error prevention phase 1 (cli suite)', () => {
  test('passes CLI test suite', async () => {
    await runScript();
  });
});
