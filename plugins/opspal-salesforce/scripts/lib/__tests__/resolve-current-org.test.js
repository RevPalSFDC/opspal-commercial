/**
 * Tests for resolveCurrentOrg
 *
 * Source: Reflection Cohort - config/env (P2)
 */

const { resolveCurrentOrg } = require('../org-alias-validator');

// Mock child_process
jest.mock('child_process', () => ({
  execSync: jest.fn(),
  spawnSync: jest.fn()
}));

const { execSync } = require('child_process');

describe('resolveCurrentOrg', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.SF_TARGET_ORG;
    delete process.env.ORG_ALIAS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should resolve from SF_TARGET_ORG env var first', () => {
    process.env.SF_TARGET_ORG = 'my-production';

    const result = resolveCurrentOrg();

    expect(result.alias).toBe('my-production');
    expect(result.source).toBe('SF_TARGET_ORG');
    expect(result.error).toBeNull();
  });

  it('should resolve from ORG_ALIAS when SF_TARGET_ORG not set', () => {
    process.env.ORG_ALIAS = 'wedgewood-sandbox';

    const result = resolveCurrentOrg();

    expect(result.alias).toBe('wedgewood-sandbox');
    expect(result.source).toBe('ORG_ALIAS');
    expect(result.error).toBeNull();
  });

  it('should prefer SF_TARGET_ORG over ORG_ALIAS', () => {
    process.env.SF_TARGET_ORG = 'sf-org';
    process.env.ORG_ALIAS = 'other-org';

    const result = resolveCurrentOrg();

    expect(result.alias).toBe('sf-org');
    expect(result.source).toBe('SF_TARGET_ORG');
  });

  it('should fall back to sf org display when no env vars set', () => {
    execSync.mockImplementation((cmd) => {
      if (cmd === 'sf org display --json') {
        return JSON.stringify({
          result: {
            alias: 'default-org',
            username: 'user@default.org',
            id: '00Dxx0000001234'
          }
        });
      }
      // For sf org list
      return JSON.stringify({ result: { nonScratchOrgs: [], scratchOrgs: [] } });
    });

    const result = resolveCurrentOrg();

    expect(result.alias).toBe('default-org');
    expect(result.source).toBe('sf_default_org');
    expect(result.username).toBe('user@default.org');
    expect(result.orgId).toBe('00Dxx0000001234');
  });

  it('should fall back to sf org list default when sf org display fails', () => {
    execSync.mockImplementation((cmd) => {
      if (cmd === 'sf org display --json') {
        throw new Error('No default org');
      }
      if (cmd === 'sf org list --json') {
        return JSON.stringify({
          result: {
            nonScratchOrgs: [
              { alias: 'list-default', username: 'user@list.org', isDefaultUsername: true }
            ],
            scratchOrgs: []
          }
        });
      }
      return '{}';
    });

    const result = resolveCurrentOrg();

    expect(result.alias).toBe('list-default');
    expect(result.source).toBe('sf_org_list_default');
  });

  it('should return error when no org can be resolved', () => {
    execSync.mockImplementation(() => {
      throw new Error('No orgs');
    });

    const result = resolveCurrentOrg();

    expect(result.alias).toBeNull();
    expect(result.error).toBeTruthy();
    expect(result.error).toContain('No org could be resolved');
  });

  it('should use username as alias when alias is null in sf org display', () => {
    execSync.mockImplementation((cmd) => {
      if (cmd === 'sf org display --json') {
        return JSON.stringify({
          result: {
            alias: null,
            username: 'user@noalias.org',
            id: '00Dxx'
          }
        });
      }
      return JSON.stringify({ result: { nonScratchOrgs: [], scratchOrgs: [] } });
    });

    const result = resolveCurrentOrg();

    expect(result.alias).toBe('user@noalias.org');
    expect(result.source).toBe('sf_default_org');
  });
});
