const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  resolveSessionPath,
  readSessionMetadata,
  assertSessionPolicy,
  buildSessionTelemetry
} = require('../session-governance');

describe('session-governance', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-governance-'));

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('resolves platform-specific session paths', () => {
    const sfPath = resolveSessionPath('prod-org', 'salesforce', { baseDir: tempDir });
    const hsPath = resolveSessionPath('portal-1', 'hubspot', { baseDir: tempDir });

    expect(sfPath.endsWith(path.join('prod-org', '.salesforce-session.json'))).toBe(true);
    expect(hsPath.endsWith(path.join('portal-1', '.hubspot-session.json'))).toBe(true);
  });

  it('detects missing session metadata', () => {
    const missing = readSessionMetadata(path.join(tempDir, 'missing.json'));

    expect(missing.exists).toBe(false);
    expect(missing.ageHours).toBeNull();
  });

  it('flags stale sessions by policy', () => {
    const sessionPath = resolveSessionPath('stale-org', 'salesforce', { baseDir: tempDir });
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
    fs.writeFileSync(sessionPath, '{"ok":true}', 'utf8');

    const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
    fs.utimesSync(sessionPath, oldTime, oldTime);

    const metadata = readSessionMetadata(sessionPath);
    const policy = assertSessionPolicy(metadata, { maxAgeHours: 24 });

    expect(policy.compliant).toBe(false);
    expect(policy.violations.some(v => v.code === 'SESSION_STALE')).toBe(true);
  });

  it('builds normalized telemetry payload', () => {
    const telemetry = buildSessionTelemetry({
      platform: 'salesforce',
      instanceName: 'prod-org',
      authMethod: 'session_state',
      sessionMetadata: {
        exists: true,
        ageHours: 2,
        sizeBytes: 512,
        modifiedAt: '2026-02-12T00:00:00.000Z'
      }
    });

    expect(telemetry.platform).toBe('salesforce');
    expect(telemetry.session_exists).toBe(true);
    expect(telemetry.session_age_hours).toBe(2);
  });
});
