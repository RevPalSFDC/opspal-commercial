'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function writeValidLicenseCache(homeDir, overrides = {}) {
  const opspalDir = path.join(homeDir, '.opspal');
  fs.mkdirSync(opspalDir, { recursive: true });
  fs.writeFileSync(path.join(opspalDir, 'license-cache.json'), JSON.stringify({
    valid: true,
    license_key: 'OPSPAL-PRO-123456',
    tier: 'professional',
    organization: 'Acme Corp',
    allowed_asset_tiers: ['core', 'salesforce', 'hubspot'],
    key_bundle_version: 2,
    grace_until: '2099-01-01T00:00:00.000Z',
    updated_at: '2026-03-20T00:00:00.000Z',
    key_bundle: {
      version: 2,
      keys: {
        core: Buffer.alloc(32, 1).toString('base64')
      }
    },
    ...overrides
  }, null, 2));
}

describe('first-run onboarding', () => {
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

  test('requires activation and initialization when no license cache or workspace marker exists', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-first-run-'));
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-workspace-'));
    process.env.HOME = tempHome;

    jest.doMock('../scripts/lib/license-auth-client', () => ({
      getLicenseCacheFile: () => path.join(tempHome, '.opspal', 'license-cache.json'),
      getServerUrl: () => 'https://license.gorevpal.com',
      status: jest.fn(() => ({ status: 'not_activated' }))
    }));

    const onboarding = require('../scripts/lib/first-run-onboarding');
    const state = onboarding.enrichState(onboarding.getOnboardingState({ cwd: workspaceDir }));

    expect(state.mode).toBe('needs_activation_and_initialization');
    expect(state.activation_required).toBe(true);
    expect(state.initialization_required).toBe(true);
    expect(state.next_steps.map((step) => step.id)).toEqual([
      'activate_license',
      'initialize_workspace'
    ]);
    expect(state.prompt_context).toContain('/activate-license');
    expect(state.prompt_context).toContain('/initialize');
  });

  test('reports ready when license is valid and workspace contains CLAUDE.md', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-first-run-'));
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-workspace-'));
    process.env.HOME = tempHome;
    writeValidLicenseCache(tempHome);
    fs.writeFileSync(path.join(workspaceDir, 'CLAUDE.md'), '# Project Instructions\n');

    jest.doMock('../scripts/lib/license-auth-client', () => ({
      getLicenseCacheFile: () => path.join(tempHome, '.opspal', 'license-cache.json'),
      getServerUrl: () => 'https://license.gorevpal.com',
      status: jest.fn(() => ({ status: 'valid' }))
    }));

    const onboarding = require('../scripts/lib/first-run-onboarding');
    const state = onboarding.enrichState(onboarding.getOnboardingState({ cwd: workspaceDir }));

    expect(state.mode).toBe('ready');
    expect(state.ready).toBe(true);
    expect(state.workspace.marker_path).toBe(path.join(workspaceDir, 'CLAUDE.md'));
    expect(state.next_steps).toEqual([]);
  });

  test('requires initialization when license is valid but workspace marker is missing', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-first-run-'));
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-workspace-'));
    process.env.HOME = tempHome;
    writeValidLicenseCache(tempHome);

    jest.doMock('../scripts/lib/license-auth-client', () => ({
      getLicenseCacheFile: () => path.join(tempHome, '.opspal', 'license-cache.json'),
      getServerUrl: () => 'https://license.gorevpal.com',
      status: jest.fn(() => ({ status: 'valid' }))
    }));

    const onboarding = require('../scripts/lib/first-run-onboarding');
    const state = onboarding.enrichState(onboarding.getOnboardingState({ cwd: workspaceDir }));

    expect(state.mode).toBe('needs_initialization');
    expect(state.activation_required).toBe(false);
    expect(state.initialization_required).toBe(true);
    expect(state.next_steps.map((step) => step.id)).toEqual(['initialize_workspace']);
    expect(state.visible_message).toContain('/initialize');
  });
});
