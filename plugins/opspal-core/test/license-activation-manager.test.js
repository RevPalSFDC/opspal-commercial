'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('license activation manager', () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    if (typeof originalHome === 'undefined') {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  });

  test('parseArgs accepts positional email and license key', () => {
    const manager = require('../scripts/lib/license-activation-manager');

    expect(manager.parseArgs(['activate', 'User@Example.com', 'OPSPAL-PRO-demo'])).toEqual(
      expect.objectContaining({
        action: 'activate',
        email: 'User@Example.com',
        licenseKey: 'OPSPAL-PRO-demo'
      })
    );
  });

  test('activateLicense persists the scoped key bundle and cache with normalized email', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-activate-'));
    process.env.HOME = tempHome;

    const activateLicenseRequest = jest.fn().mockResolvedValue({
      valid: true,
      session_token: 'session-token',
      tier: 'professional',
      organization: 'Acme Corp',
      allowed_asset_tiers: ['core', 'salesforce', 'hubspot'],
      tier_metadata: {},
      blocked_domains: [],
      key_bundle_version: 2,
      grace_until: '2026-03-25T12:00:00.000Z',
      key_bundle: {
        version: 2,
        keys: {
          core: Buffer.alloc(32, 1).toString('base64'),
          salesforce: Buffer.alloc(32, 2).toString('base64'),
          hubspot: Buffer.alloc(32, 3).toString('base64')
        }
      }
    });

    jest.doMock('../scripts/lib/license-auth-client', () => ({
      activate: activateLicenseRequest,
      getLicenseCacheFile: () => path.join(tempHome, '.opspal', 'license-cache.json'),
      getServerUrl: () => 'https://license.gorevpal.com',
      status: jest.fn(),
      validateSessionPayload: jest.fn()
    }));

    const manager = require('../scripts/lib/license-activation-manager');
    const result = await manager.activateLicense({
      email: 'User@Example.com',
      licenseKey: 'OPSPAL-PRO-demo',
      machineId: 'machine-01'
    });

    expect(activateLicenseRequest).toHaveBeenCalledWith({
      userEmail: 'user@example.com',
      licenseKey: 'OPSPAL-PRO-demo',
      machineId: 'machine-01',
      serverUrl: undefined
    });

    expect(result.userEmail).toBe('user@example.com');
    expect(result.session.tier).toBe('professional');
  });

  test('activateLicense rejects a missing email address', async () => {
    const manager = require('../scripts/lib/license-activation-manager');

    await expect(manager.activateLicense({
      email: '',
      licenseKey: 'OPSPAL-PRO-demo'
    })).rejects.toThrow('Email address is required');
  });

  test('activateLicense rejects a different concurrently active cached license', async () => {
    jest.doMock('../scripts/lib/license-auth-client', () => ({
      activate: jest.fn(),
      getLicenseCacheFile: () => '/tmp/license-cache.json',
      getServerUrl: () => 'https://license.gorevpal.com',
      status: jest.fn(() => ({
        status: 'valid',
        license_key: 'OPSPAL-PRO-existing-123456',
        user_email: 'user@example.com'
      })),
      validateSessionPayload: jest.fn()
    }));

    const manager = require('../scripts/lib/license-activation-manager');

    await expect(manager.activateLicense({
      email: 'user@example.com',
      licenseKey: 'OPSPAL-PRO-new-654321',
      machineId: 'machine-01'
    })).rejects.toThrow('Run /deactivate-license before activating a different license key.');
  });

  test('activateLicense allows refreshing the same cached license key', async () => {
    const activateLicenseRequest = jest.fn().mockResolvedValue({
      valid: true,
      session_token: 'session-token',
      tier: 'professional',
      organization: 'Acme Corp',
      allowed_asset_tiers: ['core'],
      tier_metadata: {},
      blocked_domains: [],
      key_bundle_version: 2,
      grace_until: '2026-03-25T12:00:00.000Z',
      key_bundle: {
        version: 2,
        keys: {
          core: Buffer.alloc(32, 1).toString('base64')
        }
      }
    });

    jest.doMock('../scripts/lib/license-auth-client', () => ({
      activate: activateLicenseRequest,
      getLicenseCacheFile: () => '/tmp/license-cache.json',
      getServerUrl: () => 'https://license.gorevpal.com',
      status: jest.fn(() => ({
        status: 'valid',
        license_key: 'OPSPAL-PRO-same-123456',
        user_email: 'user@example.com'
      })),
      validateSessionPayload: jest.fn()
    }));

    const manager = require('../scripts/lib/license-activation-manager');
    const result = await manager.activateLicense({
      email: 'user@example.com',
      licenseKey: 'OPSPAL-PRO-same-123456',
      machineId: 'machine-01'
    });

    expect(activateLicenseRequest).toHaveBeenCalledTimes(1);
    expect(result.licenseKey).toBe('OPSPAL-PRO-same-123456');
  });

  test('checkGuidance reports activation guidance when no valid cache exists', () => {
    jest.doMock('../scripts/lib/license-auth-client', () => ({
      getLicenseCacheFile: jest.fn(() => '/tmp/license-cache.json'),
      status: jest.fn(() => ({ status: 'not_activated' })),
      validateSessionPayload: jest.fn()
    }));

    const manager = require('../scripts/lib/license-activation-manager');
    expect(manager.checkGuidance()).toEqual({
      show_guidance: true,
      status: 'not_activated',
      message: 'OpsPal premium assets remain locked until you activate with /activate-license <email> <license-key>.'
    });
  });

  test('activate CLI output stays limited to the activation summary fields', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const activateLicenseRequest = jest.fn().mockResolvedValue({
      valid: true,
      session_token: 'session-token',
      tier: 'professional',
      organization: 'Acme Corp',
      allowed_asset_tiers: ['core', 'salesforce'],
      tier_metadata: {},
      blocked_domains: [],
      key_bundle_version: 2,
      grace_until: '2026-03-25T12:00:00.000Z',
      key_bundle: {
        version: 2,
        keys: {
          core: Buffer.alloc(32, 1).toString('base64')
        }
      }
    });

    jest.doMock('../scripts/lib/license-auth-client', () => ({
      activate: activateLicenseRequest,
      getLicenseCacheFile: () => '/tmp/license-cache.json',
      getServerUrl: () => 'https://license.gorevpal.com',
      status: jest.fn(() => ({ status: 'not_activated' })),
      validateSessionPayload: jest.fn()
    }));

    const manager = require('../scripts/lib/license-activation-manager');
    await manager.runCli(['activate', 'user@example.com', 'OPSPAL-PRO-demo', '--machine-id', 'machine-01']);

    const lines = logSpy.mock.calls.map((call) => call[0]);
    expect(lines).toEqual([
      'Activated OPSPAL-PRO-demo for user@example.com',
      'Server: https://license.gorevpal.com',
      'Machine ID: machine-01',
      'Tier: professional',
      'Allowed domains: core, salesforce',
      'Cache file: /tmp/license-cache.json'
    ]);

    const output = lines.join('\n');
    expect(output).not.toContain('/encrypt-assets');
    expect(output).not.toContain('/finishopspalupdate');
  });
});
