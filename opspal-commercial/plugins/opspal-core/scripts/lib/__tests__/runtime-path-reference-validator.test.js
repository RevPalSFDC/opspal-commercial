const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  validateRuntimePathReferences
} = require('../runtime-path-reference-validator');

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

describe('runtime-path-reference-validator', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-path-validator-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('flags hardcoded runtime paths and ignores compliant snippets', () => {
    const badMarkdown = path.join(tempRoot, 'plugins', 'opspal-core', 'commands', 'bad.md');
    const goodMarkdown = path.join(tempRoot, 'plugins', 'opspal-core', 'commands', 'good.md');
    const badYaml = path.join(
      tempRoot,
      'plugins',
      'opspal-salesforce',
      'agents',
      'shared',
      'bad.yaml'
    );

    writeFile(
      badMarkdown,
      [
        '```bash',
        'node plugins/opspal-core/scripts/lib/license-first-run.js',
        'node ~/.claude/plugins/cache/revpal-internal-plugins/opspal-core/2.34.0/scripts/lib/license-first-run.js',
        'node ${CLAUDE_PLUGIN_ROOT}/plugins/opspal-core/scripts/lib/license-first-run.js',
        '```',
        ''
      ].join('\n')
    );

    writeFile(
      goodMarkdown,
      [
        'This prose reference is allowed: plugins/opspal-core/scripts/lib/license-first-run.js',
        '',
        '```bash',
        'node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/license-first-run.js',
        '```',
        ''
      ].join('\n')
    );

    writeFile(
      badYaml,
      'validation: "node plugins/opspal-salesforce/scripts/lib/report-template-deployer.js"\n'
    );

    const result = validateRuntimePathReferences({
      rootDir: tempRoot,
      files: [badMarkdown, goodMarkdown, badYaml]
    });

    expect(result.violationCount).toBe(4);
    expect(result.violations.map(violation => violation.rule)).toEqual([
      'hardcoded-runtime-plugin-path',
      'hardcoded-home-plugin-path',
      'claude-plugin-root-misuse',
      'hardcoded-runtime-plugin-path'
    ]);
  });

  test('repo scan stays clean for authored runtime snippets', () => {
    const repoRoot = path.resolve(__dirname, '../../../../..');
    const result = validateRuntimePathReferences({ rootDir: repoRoot });

    expect(result.violationCount).toBe(0);
  });
});
