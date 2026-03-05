const fs = require('fs');
const os = require('os');
const path = require('path');

const ProjectConnectRegistry = require('../scripts/lib/project-connect-registry');

describe('ProjectConnectRegistry', () => {
  let tmpRoot;
  let registry;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-connect-registry-'));
    registry = new ProjectConnectRegistry({
      repoRoot: tmpRoot,
      verbose: false
    });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('persists execution state into index and customer record', () => {
    const persisted = registry.upsertFromProjectConnectExecution({
      customerId: 'RP-ACM123456',
      customer: 'Acme Robotics',
      aliases: ['Acme Robo'],
      github: {
        created: true,
        name: 'revpal-rp-acm123456-acme-robotics',
        url: 'https://github.com/revpal/revpal-rp-acm123456-acme-robotics'
      },
      drive: {
        created: true
      },
      asana: {
        skipped: true
      },
      source: 'project-connect',
      actor: 'test@example.com'
    });

    expect(persisted.synced).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'project-connect', 'registry-index.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'project-connect', 'customers', 'RP-ACM123456.json'))).toBe(true);

    const index = JSON.parse(fs.readFileSync(path.join(tmpRoot, 'project-connect', 'registry-index.json'), 'utf8'));
    expect(index.customers['RP-ACM123456']).toMatchObject({
      customer: 'Acme Robotics',
      repoSynced: true,
      repoName: 'revpal-rp-acm123456-acme-robotics'
    });
  });

  it('flags local status as stale when last verification exceeds threshold', () => {
    registry.recordCheckResult({
      customerId: 'RP-STALE0001',
      customer: 'Stale Corp',
      synced: true,
      source: 'remote',
      repoName: 'revpal-rp-stale0001-stale-corp',
      repoUrl: 'https://github.com/revpal/revpal-rp-stale0001-stale-corp'
    });

    const customerPath = path.join(tmpRoot, 'project-connect', 'customers', 'RP-STALE0001.json');
    const record = JSON.parse(fs.readFileSync(customerPath, 'utf8'));
    record.systems.github.lastVerifiedAt = new Date(Date.now() - (48 * 60 * 60 * 1000)).toISOString();
    fs.writeFileSync(customerPath, JSON.stringify(record, null, 2));

    const status = registry.getRepoSyncStatus({
      customerId: 'RP-STALE0001',
      staleAfterHours: 24
    });

    expect(status.found).toBe(true);
    expect(status.synced).toBe(true);
    expect(status.stale).toBe(true);
    expect(status.reason).toBe('local_registry_stale_synced');
  });
});
