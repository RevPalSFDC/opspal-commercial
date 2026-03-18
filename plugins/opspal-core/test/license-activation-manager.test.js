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
      DEFAULT_SERVER_URL: 'https://license.gorevpal.com',
      activateLicenseRequest,
      normalizeServerUrl: jest.requireActual('../scripts/lib/license-auth-client').normalizeServerUrl
    }));

    const manager = require('../scripts/lib/license-activation-manager');
    const result = await manager.activateLicense({
      email: 'User@Example.com',
      licenseKey: 'OPSPAL-PRO-demo',
      machineId: 'machine-01'
    });

    expect(activateLicenseRequest).toHaveBeenCalledWith(expect.objectContaining({
      licenseKey: 'OPSPAL-PRO-demo',
      machineId: 'machine-01',
      userEmail: 'user@example.com'
    }));

    expect(result.userEmail).toBe('user@example.com');

    const cachePath = path.join(tempHome, '.opspal', 'license-cache.json');
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    expect(cache).toEqual(expect.objectContaining({
      license_key: 'OPSPAL-PRO-demo',
      machine_id: 'machine-01',
      user_email: 'user@example.com',
      tier: 'professional'
    }));

    expect(fs.existsSync(path.join(tempHome, '.claude', 'opspal-enc', 'core.key'))).toBe(true);
    expect(fs.existsSync(path.join(tempHome, '.claude', 'opspal-enc', 'salesforce.key'))).toBe(true);
    expect(fs.existsSync(path.join(tempHome, '.claude', 'opspal-enc', 'hubspot.key'))).toBe(true);
  });

  test('activateLicense rejects a missing email address', async () => {
    const manager = require('../scripts/lib/license-activation-manager');

    await expect(manager.activateLicense({
      email: '',
      licenseKey: 'OPSPAL-PRO-demo'
    })).rejects.toThrow('Email address is required');
  });
});
