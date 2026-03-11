const fs = require('fs');
const os = require('os');
const path = require('path');

const resolver = require('../plugin-path-resolver');

function createPluginRoot(pluginRoot, scriptRelativePath = 'scripts/lib/example.js') {
  const scriptPath = path.join(pluginRoot, scriptRelativePath);
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(scriptPath, 'module.exports = true;\n');
  return scriptPath;
}

describe('plugin-path-resolver', () => {
  let tempRoot;
  let homedirSpy;
  const originalClaudePluginRoot = process.env.CLAUDE_PLUGIN_ROOT;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-path-resolver-'));
    resolver.clearCache();
    delete process.env.CLAUDE_PLUGIN_ROOT;
  });

  afterEach(() => {
    resolver.clearCache();
    delete process.env.CLAUDE_PLUGIN_ROOT;

    if (originalClaudePluginRoot) {
      process.env.CLAUDE_PLUGIN_ROOT = originalClaudePluginRoot;
    }

    if (homedirSpy) {
      homedirSpy.mockRestore();
      homedirSpy = null;
    }

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('accepts CLAUDE_PLUGIN_ROOT when it already points at the plugin root', () => {
    const pluginRoot = path.join(tempRoot, 'opspal-core');
    const scriptPath = createPluginRoot(pluginRoot, 'scripts/lib/license-first-run.js');
    process.env.CLAUDE_PLUGIN_ROOT = pluginRoot;

    expect(resolver.resolvePluginRoot('opspal-core')).toBe(pluginRoot);
    expect(
      resolver.resolvePluginScript('opspal-core', 'scripts/lib/license-first-run.js')
    ).toBe(scriptPath);
  });

  test('normalizes CLAUDE_PLUGIN_ROOT when legacy environments point it at the workspace root', () => {
    const workspaceRoot = path.join(tempRoot, 'workspace');
    const pluginRoot = path.join(workspaceRoot, '.claude-plugins', 'opspal-core');
    const scriptPath = createPluginRoot(pluginRoot, 'scripts/lib/license-first-run.js');
    process.env.CLAUDE_PLUGIN_ROOT = workspaceRoot;

    expect(resolver.resolvePluginRoot('opspal-core')).toBe(pluginRoot);
    expect(
      resolver.resolvePluginScript('opspal-core', 'scripts/lib/license-first-run.js')
    ).toBe(scriptPath);
  });

  test('picks the latest semver version from cached installs', () => {
    const homeRoot = path.join(tempRoot, 'home');
    const cacheRoot = path.join(
      homeRoot,
      '.claude',
      'plugins',
      'cache',
      'revpal-internal-plugins',
      'opspal-core'
    );

    createPluginRoot(path.join(cacheRoot, '2.5.2'), 'scripts/lib/license-first-run.js');
    createPluginRoot(path.join(cacheRoot, '2.18.1'), 'scripts/lib/license-first-run.js');
    const latestScript = createPluginRoot(
      path.join(cacheRoot, '2.34.0'),
      'scripts/lib/license-first-run.js'
    );

    homedirSpy = jest.spyOn(os, 'homedir').mockReturnValue(homeRoot);

    expect(resolver.resolvePluginRoot('opspal-core')).toBe(path.join(cacheRoot, '2.34.0'));
    expect(
      resolver.resolvePluginScript('opspal-core', 'scripts/lib/license-first-run.js')
    ).toBe(latestScript);
  });
});
