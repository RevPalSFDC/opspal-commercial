'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '../../..');
const hookPath = path.join(repoRoot, '.githooks', 'pre-push');

function writeExecutable(filePath, contents) {
  fs.writeFileSync(filePath, contents, { mode: 0o755 });
}

test('pre-push scans only outgoing commit ranges with gitleaks log opts', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-push-secret-range-'));
  const binDir = path.join(tempRoot, 'bin');
  const logPath = path.join(tempRoot, 'gitleaks.log');
  const repoPath = path.join(tempRoot, 'repo');

  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(repoPath, { recursive: true });
  fs.mkdirSync(path.join(repoPath, '.githooks'), { recursive: true });
  fs.mkdirSync(path.join(repoPath, 'scripts', 'lib'), { recursive: true });
  fs.copyFileSync(hookPath, path.join(repoPath, '.githooks', 'pre-push'));
  fs.writeFileSync(path.join(repoPath, '.gitleaks.toml'), '[extend]\nuseDefault = true\n');

  writeExecutable(
    path.join(binDir, 'git'),
    `#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  "rev-parse --show-toplevel")
    printf '%s\\n' "\${MOCK_REPO_ROOT}"
    ;;
  "rev-parse --verify origin/main")
    exit 0
    ;;
  "merge-base HEAD origin/main")
    printf '%s\\n' "merge-base-commit"
    ;;
  "diff --name-only remote-old local-new")
    exit 0
    ;;
  *)
    echo "unexpected git args: $*" >&2
    exit 1
    ;;
esac
`
  );

  writeExecutable(
    path.join(binDir, 'gitleaks'),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "\${GITLEAKS_LOG}"
`
  );

  writeExecutable(
    path.join(binDir, 'npm'),
    `#!/usr/bin/env bash
set -euo pipefail
exit 0
`
  );

  writeExecutable(
    path.join(binDir, 'node'),
    `#!/usr/bin/env bash
set -euo pipefail
exit 0
`
  );

  execFileSync(
    'bash',
    [path.join(repoPath, '.githooks', 'pre-push'), 'origin'],
    {
      cwd: repoPath,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        MOCK_REPO_ROOT: repoPath,
        GITLEAKS_LOG: logPath
      },
      input: 'refs/heads/main local-new refs/heads/main remote-old\n'
    }
  );

  const gitleaksCalls = fs.readFileSync(logPath, 'utf8');
  assert.match(gitleaksCalls, /--log-opts remote-old\.\.local-new/);
  assert.doesNotMatch(gitleaksCalls, /--log-opts HEAD\b/);
  assert.doesNotMatch(gitleaksCalls, /--log-opts merge-base-commit\.\.HEAD/);
});
