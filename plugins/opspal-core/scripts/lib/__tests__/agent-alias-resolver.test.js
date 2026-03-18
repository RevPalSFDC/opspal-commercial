const {
  resolveAgentName,
  getRegistry
} = require('../agent-alias-resolver');

describe('agent-alias-resolver', () => {
  const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

  test('resolves core and salesforce short names to fully-qualified agent names', () => {
    const coreAgent = resolveAgentName('platform-instance-manager');
    const sfdcAgent = resolveAgentName('sfdc-revops-auditor');

    expect(coreAgent).toBe('opspal-core:platform-instance-manager');
    expect(sfdcAgent).toBe('opspal-salesforce:sfdc-revops-auditor');
  });

  test('registry does not expose semver directory names as plugin names', () => {
    const registry = getRegistry(true);
    const pluginNames = Object.keys(registry.plugins || {});

    expect(pluginNames.length).toBeGreaterThan(0);
    expect(pluginNames.some(name => semverPattern.test(name))).toBe(false);
  });

  test('registry full names never use semver pseudo-plugins', () => {
    const registry = getRegistry(true);
    const fullNames = Object.keys(registry.fullToShort || {});

    expect(fullNames.length).toBeGreaterThan(0);
    expect(
      fullNames.some(name => semverPattern.test(String(name).split(':')[0]))
    ).toBe(false);
  });
});
